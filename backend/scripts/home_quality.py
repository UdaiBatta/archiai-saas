"""Home-plan quality suite: one number per question, over a fixed set of
residential briefs, so every planner change is judged by what it does to
real plans rather than by eye.

    python scripts/home_quality.py                  # table + comparison with the baseline
    python scripts/home_quality.py --write-baseline # after an intended improvement

Per brief: does it fit, its score, how many rooms are stretched past their
type's aspect limit (corridors excluded: they are long by design), and how
many rooms that need daylight (bedrooms, living, dining, study, kitchen)
have no outside wall. ``app/tests/test_home_quality.py`` fails when a change
makes the totals worse than ``home_quality_baseline.json``.
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.schemas.requirements import RequirementsSpec
from app.services import catalog
from app.services.layout_engine.engine import DoesNotFitError
from app.services.layout_engine.search import best_candidate
from app.services.quality.hard_constraints import touches_outside, validate
from app.services.quality.scorer import score

TESTS = Path(__file__).parents[1] / "app" / "tests"
FIXTURES = TESTS / "fixtures" / "requirements"
BASELINE = Path(__file__).with_name("home_quality_baseline.json")

_LONG_BY_DESIGN = {"corridor", "hallway", "passage", "stairs", "staircase"}
_NEEDS_DAYLIGHT_EXTRA = {"kitchen"}  # the catalog doesn't mark kitchens; homes need one

_PROGRAMS = {
    "1bhk": [("master_bedroom", 1), ("bathroom", 1), ("kitchen", 1), ("living_room", 1)],
    "2bhk": [("master_bedroom", 1), ("bedroom", 1), ("bathroom", 2), ("kitchen", 1),
             ("living_room", 1), ("dining", 1)],
    "3bhk": [("master_bedroom", 1), ("bedroom", 2), ("bathroom", 2), ("kitchen", 1),
             ("living_room", 1), ("dining", 1), ("pooja_room", 1), ("balcony", 1)],
    "4bhk": [("master_bedroom", 1), ("bedroom", 3), ("bathroom", 3), ("kitchen", 1),
             ("living_room", 1), ("dining", 1), ("study", 1), ("balcony", 1), ("parking", 1)],
}
# Two common plot sizes per program (m), each tried with two facings.
_PLOTS = {
    "1bhk": [(7.5, 9.0), (9.0, 12.0)],
    "2bhk": [(9.0, 12.0), (9.0, 15.0)],
    "3bhk": [(12.0, 15.0), (12.0, 18.0)],
    "4bhk": [(15.0, 18.0), (15.0, 24.0)],
}
_FACINGS = (("north", "east"), ("south", "west"))
_HOME_FIXTURES = [
    "1bhk", "2bhk", "3bhk_adjacencies", "4bhk", "template_family_home",
    "template_apartment", "template_villa", "template_townhouse", "template_two_storey_home",
]


def briefs() -> dict[str, RequirementsSpec]:
    out: dict[str, RequirementsSpec] = {}
    for name, rooms in _PROGRAMS.items():
        for (w, d), facings in zip(_PLOTS[name], _FACINGS):
            for facing in facings:
                out[f"{name}_{w:g}x{d:g}_{facing}"] = RequirementsSpec.model_validate({
                    "building_type": "house", "floors": 1, "facing": facing,
                    "plot": {"width_m": w, "depth_m": d},
                    "rooms": [{"type": t, "count": c} for t, c in rooms],
                    "adjacency": [
                        {"room_a": "master_bedroom", "room_b": "bathroom", "strength": "must"},
                        {"room_a": "kitchen", "room_b": "dining", "strength": "should"},
                    ] if name != "1bhk" else [
                        {"room_a": "master_bedroom", "room_b": "bathroom", "strength": "must"},
                    ],
                    "avoid_adjacency": [],
                })
    for name in _HOME_FIXTURES:
        out[name] = RequirementsSpec.model_validate_json((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    villa = json.loads((TESTS / "fixtures" / "golden" / "villa_inland_balcony.json").read_text(encoding="utf-8"))
    out["villa_from_app"] = RequirementsSpec.model_validate(villa["requirements"])
    return out


@dataclass(frozen=True)
class Row:
    brief: str
    fits: bool
    score: int
    rooms: int
    stretched: int
    no_daylight: int
    ms: int
    note: str = ""
    entry_off_street: bool = False


def _entry_on_street(plan, facing) -> bool:
    """Does a ground-floor entry touch the street side of the building?
    (The brief's "entry faces east" means the front door is on that side.)"""
    frame = plan.footprint
    x0, y0 = (frame.x, frame.y) if frame else (0.0, 0.0)
    x1 = frame.x + frame.w if frame else plan.plot.width_m
    y1 = frame.y + frame.h if frame else plan.plot.depth_m
    for room in plan.rooms:
        if (catalog.resolve_alias(room.type) or room.type) != "foyer" or room.floor != 0:
            continue
        side = {"north": abs(room.y - y0), "south": abs(room.y + room.h - y1),
                "west": abs(room.x - x0), "east": abs(room.x + room.w - x1)}[facing]
        if side <= 1e-3:
            return True
    return False


def _aspect(room) -> float:
    short, long_ = sorted((room.w, room.h))
    return long_ / short if short > 0 else float("inf")


def measure(name: str, spec: RequirementsSpec) -> Row:
    started = time.perf_counter()
    try:
        plan = best_candidate(spec)  # the app's path: search, or one layout for multi-storey
    except DoesNotFitError as exc:
        ms = int((time.perf_counter() - started) * 1000)
        return Row(name, False, 0, 0, 0, 0, ms, str(exc)[:90])
    ms = int((time.perf_counter() - started) * 1000)
    stretched = no_daylight = 0
    for room in plan.rooms:
        kind = catalog.resolve_alias(room.type) or room.type
        try:
            entry = catalog.get(kind)
        except catalog.UnknownSpaceType:
            entry = None
        if kind not in _LONG_BY_DESIGN and entry is not None and _aspect(room) > entry.max_aspect + 1e-6:
            stretched += 1
        needs_light = (entry is not None and entry.needs_exterior) or kind in _NEEDS_DAYLIGHT_EXTRA
        if needs_light and not touches_outside(room, plan):
            no_daylight += 1
    violations = validate(plan, spec)
    note = "; ".join(v.code for v in violations)
    off_street = plan.plot.boundary is None and not _entry_on_street(plan, (spec.facing or "east") if isinstance(spec.facing, str) else (spec.facing.value if spec.facing else "east"))
    return Row(name, True, round(score(plan, spec).score), len(plan.rooms), stretched, no_daylight, ms, note, off_street)


def run() -> list[Row]:
    return [measure(name, spec) for name, spec in briefs().items()]


def totals(rows: list[Row]) -> dict[str, float]:
    fitted = [r for r in rows if r.fits]
    rooms = sum(r.rooms for r in fitted) or 1
    return {
        "briefs": len(rows),
        "fits": len(fitted),
        "mean_score": round(sum(r.score for r in fitted) / (len(fitted) or 1), 1),
        "stretched_pct": round(100 * sum(r.stretched for r in fitted) / rooms, 1),
        "no_daylight": sum(r.no_daylight for r in fitted),
        "invalid": sum(1 for r in fitted if r.note),
        "entry_off_street": sum(1 for r in fitted if r.entry_off_street),
    }


def render(rows: list[Row]) -> str:
    lines = [
        "| Brief | Fits | Score | Rooms | Stretched | No daylight | ms | Note |",
        "|---|---|---:|---:|---:|---:|---:|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r.brief} | {'yes' if r.fits else 'NO'} | {r.score} | {r.rooms} | "
            f"{r.stretched} | {r.no_daylight} | {r.ms} | {r.note} |"
        )
    t = totals(rows)
    lines += ["", (
        f"Fits {t['fits']}/{t['briefs']} · mean score {t['mean_score']} · "
        f"stretched rooms {t['stretched_pct']}% · rooms without daylight {t['no_daylight']} · "
        f"entry off the street {t['entry_off_street']} · invalid {t['invalid']}"
    )]
    return "\n".join(lines)


def main() -> int:
    rows = run()
    print(render(rows))
    current = totals(rows)
    if "--write-baseline" in sys.argv:
        BASELINE.write_text(json.dumps({"totals": current, "rows": [asdict(r) for r in rows]}, indent=1) + "\n", encoding="utf-8")
        print(f"\nBaseline written: {BASELINE.name}")
        return 0
    if BASELINE.exists():
        base = json.loads(BASELINE.read_text(encoding="utf-8"))["totals"]
        print("\nvs baseline: " + ", ".join(f"{k} {base.get(k, '-')} -> {current[k]}" for k in current))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
