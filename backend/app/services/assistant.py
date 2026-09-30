"""Plain-language assistant: instruction -> small command language -> edit.

The LLM only proposes commands. Everything after that is deterministic and
server-side: unknown ids are dropped, numbers are clamped, geometry is applied
to a COPY of the plan, walls/doors/windows are re-derived by the engine and the
result is scored. Nothing is persisted; the editor decides whether to apply.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from app.schemas.layout_plan import Connection, LayoutPlan, PlanRoom
from app.schemas.requirements import RequirementsSpec, RoomRequest, RoomType, SpaceRequest
from app.services import catalog
from app.services.layout_engine import DoesNotFitError
from app.services.layout_engine.engine import generate_plan
from app.services.llm_client import chat_structured
from app.services.mvp_pipeline_service import quality_snapshot_with_layout
from app.services.layout_engine import polygon
from app.services.layout_engine.geometry import EPS

StructuredChat = Callable[..., Awaitable[dict[str, Any]]]

OPS = (
    "resize_room",
    "move_room",
    "swap_rooms",
    "rename_room",
    "set_connection",
    "change_program",
    "explain",
)
MIN_SIDE_M = 1.0
MAX_SIDE_M = 30.0
MAX_ADD_COUNT = 5
MAX_COMMANDS = 8


def _nullable(kind: str) -> dict[str, Any]:
    return {"type": [kind, "null"]}


# One flat command object (every key present, unused ones null) keeps the
# schema valid under strict structured output on every provider we target.
COMMAND_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "commands"],
    "properties": {
        "summary": {"type": "string"},
        "commands": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "op", "room_id", "a", "b", "w", "h", "dx", "dy",
                    "label", "kind", "add", "remove", "text",
                ],
                "properties": {
                    "op": {"type": "string", "enum": list(OPS)},
                    "room_id": _nullable("string"),
                    "a": _nullable("string"),
                    "b": _nullable("string"),
                    "w": _nullable("number"),
                    "h": _nullable("number"),
                    "dx": _nullable("number"),
                    "dy": _nullable("number"),
                    "label": _nullable("string"),
                    "kind": {"type": ["string", "null"], "enum": ["wall", "door", "open", None]},
                    "add": {
                        "type": ["array", "null"],
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": ["type", "count"],
                            "properties": {
                                "type": {"type": "string"},
                                "count": {"type": "integer"},
                            },
                        },
                    },
                    "remove": {"type": ["array", "null"], "items": {"type": "string"}},
                    "text": _nullable("string"),
                },
            },
        },
    },
}

_SYSTEM_TEMPLATE = """You are the edit assistant of a 3D architecture tool.
Turn the user's instruction into commands from the JSON schema. Units are
metres. Origin is the plot's north-west corner; +x is east, +y is south.

Commands (set unused fields to null):
- resize_room: room_id, w and/or h (new width / depth in metres)
- move_room: room_id, dx, dy (metres to shift)
- swap_rooms: a, b (two room ids swap places)
- rename_room: room_id, label
- set_connection: a, b, kind (wall | door | open) between two adjacent rooms
- change_program: add [{{type, count}}] and/or remove [room_id]; the layout is
  regenerated from the updated programme
- explain: text, for questions or anything that is not an edit

Use ONLY the room ids listed below; never invent ids. Prefer the fewest
commands. If the instruction is a question, answer it with one explain command.
Put a one-sentence plain summary of what you will do in "summary".

Plot: {plot_w:g} x {plot_d:g} m, facing {facing}.
Rooms (id | type | label | floor | x, y | w x h):
{rooms}
{selected}
Quality score: {score}/100.
Hard violations:
{violations}
Warnings:
{warnings}
"""


def _fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def system_prompt(plan: LayoutPlan, quality, selected_room_id: str | None) -> str:
    rooms = "\n".join(
        f"- {r.id} | {r.type} | {r.label} | {r.floor} | {_fmt(r.x)}, {_fmt(r.y)} | "
        f"{_fmt(r.w)} x {_fmt(r.h)}"
        for r in plan.rooms
    )
    by_id = {r.id: r for r in plan.rooms}
    selected = (
        f"The user has selected {selected_room_id} ({by_id[selected_room_id].label}); "
        "'this room' means it."
        if selected_room_id in by_id
        else ""
    )
    return _SYSTEM_TEMPLATE.format(
        plot_w=plan.plot.width_m,
        plot_d=plan.plot.depth_m,
        facing=plan.plot.facing.value,
        rooms=rooms or "(none)",
        selected=selected,
        score=quality.score,
        violations="\n".join(f"- {v.message}" for v in quality.hard_violations) or "(none)",
        warnings="\n".join(f"- {w.message}" for w in quality.warnings) or "(none)",
    )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _num(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def validate_commands(
    raw: object, plan: LayoutPlan
) -> tuple[list[dict[str, Any]], list[str]]:
    """Keep only well-formed commands on existing ids, with clamped numbers."""
    warnings: list[str] = []
    ids = {r.id for r in plan.rooms}
    by_id = {r.id: r for r in plan.rooms}
    plot_w, plot_d = plan.plot.width_m, plan.plot.depth_m
    commands: list[dict[str, Any]] = []
    items = raw if isinstance(raw, list) else []
    if len(items) > MAX_COMMANDS:
        warnings.append(f"Only the first {MAX_COMMANDS} suggested changes were kept.")
    for item in items[:MAX_COMMANDS]:
        if not isinstance(item, dict) or item.get("op") not in OPS:
            warnings.append("Ignored a malformed suggestion.")
            continue
        op = item["op"]

        def known(*keys: str) -> bool:
            bad = [str(item.get(k)) for k in keys if item.get(k) not in ids]
            if bad:
                warnings.append(f"Ignored {op}: unknown room id {', '.join(bad)}.")
            return not bad

        if op == "explain":
            text = str(item.get("text") or "").strip()
            if text:
                commands.append({"op": op, "text": text[:2000]})
        elif op == "resize_room":
            if not known("room_id"):
                continue
            room = by_id[item["room_id"]]
            if room.vertices is not None:
                warnings.append(f"Ignored resize_room: {room.label} is not a rectangle.")
                continue
            cmd: dict[str, Any] = {"op": op, "room_id": room.id}
            for key, limit in (("w", plot_w), ("h", plot_d)):
                value = _num(item.get(key))
                if value is not None:
                    clamped = round(_clamp(value, MIN_SIDE_M, min(MAX_SIDE_M, limit)), 2)
                    if clamped != round(value, 2):
                        warnings.append(f"{key} for {room.label} clamped to {_fmt(clamped)} m.")
                    cmd[key] = clamped
            if len(cmd) == 2:
                warnings.append(f"Ignored resize_room for {room.label}: no size given.")
                continue
            commands.append(cmd)
        elif op == "move_room":
            if not known("room_id"):
                continue
            room = by_id[item["room_id"]]
            if room.vertices is not None:
                warnings.append(f"Ignored move_room: {room.label} is not a rectangle.")
                continue
            dx = _clamp(_num(item.get("dx")) or 0.0, -plot_w, plot_w)
            dy = _clamp(_num(item.get("dy")) or 0.0, -plot_d, plot_d)
            if dx == 0 and dy == 0:
                warnings.append(f"Ignored move_room for {room.label}: no distance given.")
                continue
            commands.append({"op": op, "room_id": room.id, "dx": round(dx, 2), "dy": round(dy, 2)})
        elif op in ("swap_rooms", "set_connection"):
            if not known("a", "b"):
                continue
            if item["a"] == item["b"]:
                warnings.append(f"Ignored {op}: needs two different rooms.")
                continue
            cmd = {"op": op, "a": item["a"], "b": item["b"]}
            if op == "set_connection":
                if item.get("kind") not in ("wall", "door", "open"):
                    warnings.append("Ignored set_connection: kind must be wall, door or open.")
                    continue
                if by_id[item["a"]].floor != by_id[item["b"]].floor:
                    warnings.append("Ignored set_connection: the rooms are on different floors.")
                    continue
                a, b = by_id[item["a"]], by_id[item["b"]]
                if not polygon.room_to_polygon(a).boundary.intersection(polygon.room_to_polygon(b).boundary).length > EPS:
                    warnings.append("Ignored set_connection: the rooms do not share a wall.")
                    continue
                cmd["kind"] = item["kind"]
            commands.append(cmd)
        elif op == "rename_room":
            if not known("room_id"):
                continue
            label = " ".join(str(item.get("label") or "").split())[:40]
            if not label:
                warnings.append("Ignored rename_room: empty name.")
                continue
            commands.append({"op": op, "room_id": item["room_id"], "label": label})
        elif op == "change_program":
            add = []
            for entry in item.get("add") or []:
                if not isinstance(entry, dict):
                    continue
                key = catalog.resolve_alias(str(entry.get("type") or ""))
                count = entry.get("count")
                if key is None:
                    warnings.append(f"Ignored unknown room type '{entry.get('type')}'.")
                    continue
                if not isinstance(count, int) or isinstance(count, bool) or count < 1:
                    count = 1
                add.append({"type": key, "count": min(count, MAX_ADD_COUNT)})
            remove = []
            for room_id in dict.fromkeys(item.get("remove") or []):
                if room_id in ids:
                    remove.append(room_id)
                else:
                    warnings.append(f"Ignored removing unknown room id {room_id}.")
            if add or remove:
                commands.append({"op": op, "add": add, "remove": remove})
    return commands, warnings


def _update_room(plan: LayoutPlan, room_id: str, **changes: Any) -> LayoutPlan:
    return plan.model_copy(
        update={
            "rooms": [
                r.model_copy(update=changes) if r.id == room_id else r for r in plan.rooms
            ]
        }
    )


def _kept_inside(room: PlanRoom, plan: LayoutPlan, x: float, y: float) -> tuple[float, float]:
    return (
        round(_clamp(x, 0.0, plan.plot.width_m - room.w), 2),
        round(_clamp(y, 0.0, plan.plot.depth_m - room.h), 2),
    )


def apply_geometry(plan: LayoutPlan, commands: list[dict[str, Any]]) -> LayoutPlan:
    """Apply the non-programme commands to a copy of ``plan`` (rooms only;
    derived geometry is rebuilt by the caller)."""
    for cmd in commands:
        by_id = {r.id: r for r in plan.rooms}
        op = cmd["op"]
        if op == "resize_room":
            room = by_id[cmd["room_id"]]
            resized = room.model_copy(update={"w": cmd.get("w", room.w), "h": cmd.get("h", room.h)})
            x, y = _kept_inside(resized, plan, room.x, room.y)
            plan = _update_room(plan, room.id, w=resized.w, h=resized.h, x=x, y=y)
        elif op == "move_room":
            room = by_id[cmd["room_id"]]
            x, y = _kept_inside(room, plan, room.x + cmd["dx"], room.y + cmd["dy"])
            plan = _update_room(plan, room.id, x=x, y=y)
        elif op == "swap_rooms":
            a, b = by_id[cmd["a"]], by_id[cmd["b"]]
            place = ("x", "y", "w", "h", "rotation", "vertices", "floor")
            plan = _update_room(plan, a.id, **{k: getattr(b, k) for k in place})
            plan = _update_room(plan, b.id, **{k: getattr(a, k) for k in place})
        elif op == "rename_room":
            plan = _update_room(plan, cmd["room_id"], label=cmd["label"])
        elif op == "set_connection":
            pair = {cmd["a"], cmd["b"]}
            kept = [c for c in plan.connections if {c.room_a, c.room_b} != pair]
            kept.append(Connection(room_a=cmd["a"], room_b=cmd["b"], kind=cmd["kind"]))
            plan = plan.model_copy(update={"connections": kept})
    return plan


def _same_type(a: str, b: str) -> bool:
    return (catalog.resolve_alias(a) or a) == (catalog.resolve_alias(b) or b)


def apply_program(
    requirements: RequirementsSpec, plan: LayoutPlan, cmd: dict[str, Any]
) -> tuple[RequirementsSpec, list[str]]:
    """Return requirements with rooms added/removed. Uses ``spaces`` (free
    catalog keys) as soon as a type outside the legacy RoomType enum appears."""
    warnings: list[str] = []
    room_values = {t.value for t in RoomType}
    by_id = {r.id: r for r in plan.rooms}
    use_spaces = bool(requirements.spaces) or any(a["type"] not in room_values for a in cmd["add"])
    if use_spaces:
        entries = [s.model_dump() for s in (requirements.spaces or catalog.spaces_from_rooms(requirements.rooms))]
        type_key = "space_type"
    else:
        entries = [r.model_dump(mode="json") for r in requirements.rooms]
        type_key = "type"

    for add in cmd["add"]:
        match = next((e for e in entries if _same_type(e[type_key], add["type"])), None)
        if match is not None:
            match["count"] = min(50, match["count"] + add["count"])
        else:
            entries.append({type_key: add["type"], "count": add["count"]})
    for room_id in cmd["remove"]:
        room = by_id[room_id]
        match = next((e for e in entries if _same_type(e[type_key], room.type)), None)
        if match is None:
            warnings.append(f"{room.label} was added by the engine and cannot be removed.")
            continue
        match["count"] -= 1
    entries = [e for e in entries if e["count"] > 0]

    if use_spaces:
        update = {"spaces": [SpaceRequest.model_validate(e) for e in entries]}
        if not requirements.spaces:
            update["rooms"] = []
    else:
        update = {"rooms": [RoomRequest.model_validate(e) for e in entries]}
    return requirements.model_copy(update=update), warnings


def describe(cmd: dict[str, Any], plan: LayoutPlan) -> str:
    """Plain-words line for the preview list (the UI shows these)."""
    names = {r.id: r.label for r in plan.rooms}
    op = cmd["op"]
    if op == "resize_room":
        size = " x ".join(f"{_fmt(cmd[k])} m" for k in ("w", "h") if k in cmd)
        return f"Resize {names[cmd['room_id']]} to {size}"
    if op == "move_room":
        return f"Move {names[cmd['room_id']]} by {_fmt(cmd['dx'])} m east, {_fmt(cmd['dy'])} m south"
    if op == "swap_rooms":
        return f"Swap {names[cmd['a']]} and {names[cmd['b']]}"
    if op == "rename_room":
        return f"Rename {names[cmd['room_id']]} to {cmd['label']}"
    if op == "set_connection":
        return f"Make {names[cmd['a']]} / {names[cmd['b']]} a {cmd['kind']}"
    if op == "change_program":
        parts = [f"add {a['count']} {a['type'].replace('_', ' ')}" for a in cmd["add"]]
        parts += [f"remove {names[r]}" for r in cmd["remove"]]
        return "Change the programme: " + ", ".join(parts) + " (regenerates the layout)"
    return cmd.get("text", "")


async def plan_edits(
    instruction: str,
    layout: LayoutPlan,
    requirements: RequirementsSpec,
    selected_room_id: str | None = None,
    *,
    chat: StructuredChat | None = None,
) -> dict[str, Any]:
    """LLM errors propagate (the router maps them to HTTP)."""
    before_plan, quality_before = quality_snapshot_with_layout(layout, requirements)
    raw = await (chat or chat_structured)(
        system=system_prompt(before_plan, quality_before, selected_room_id),
        user=instruction,
        schema=COMMAND_SCHEMA,
    )
    commands, warnings = validate_commands(raw.get("commands"), before_plan)
    summary = " ".join(str(raw.get("summary") or "").split())[:500]

    program = [c for c in commands if c["op"] == "change_program"]
    geometric = [c for c in commands if c["op"] not in ("change_program", "explain")]
    requirements_after = requirements
    after_plan = before_plan
    if program:
        if geometric:
            warnings.append("Room edits were skipped because the programme change regenerates the layout.")
            commands = [c for c in commands if c["op"] in ("change_program", "explain")]
        for cmd in program:
            requirements_after, extra = apply_program(requirements_after, before_plan, cmd)
            warnings.extend(extra)
        try:
            after_plan = generate_plan(requirements_after)
            warnings.append("The layout was regenerated; manual edits to room positions are replaced.")
        except DoesNotFitError as exc:
            warnings.append(f"The new programme does not fit: {exc}")
            commands = [c for c in commands if c["op"] == "explain"]
            requirements_after = requirements
    elif geometric:
        after_plan = apply_geometry(before_plan, geometric)

    layout_after, quality_after = quality_snapshot_with_layout(after_plan, requirements_after)
    before_codes = {(v.code, tuple(sorted(v.room_ids))) for v in quality_before.hard_violations}
    new_violations = [
        v for v in quality_after.hard_violations
        if (v.code, tuple(sorted(v.room_ids))) not in before_codes
    ]
    if new_violations:
        warnings.append(
            "This edit breaks hard rules: " + "; ".join(v.message for v in new_violations)
        )
    return {
        "summary": summary,
        "commands": [{**c, "description": describe(c, before_plan)} for c in commands],
        "layout_after": layout_after,
        "requirements_after": requirements_after,
        "quality_before": quality_before,
        "quality_after": quality_after,
        "introduces_hard_violations": bool(new_violations),
        "changed": any(c["op"] != "explain" for c in commands),
        "warnings": warnings,
    }
