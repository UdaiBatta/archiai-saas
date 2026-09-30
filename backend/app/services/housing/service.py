"""Fill a mass with housing units (roadmap P3): partition the floor plate,
lay out each distinct unit once with the layout engine, stack floors,
honour locked units, report the yield."""
from __future__ import annotations

from collections import Counter

from shapely.geometry import Polygon

from app.schemas.housing import (
    HousingFillRequest,
    HousingFillResponse,
    HousingUnit,
    HousingYield,
)
from app.schemas.requirements import Vertex
from app.services.housing import partition as P
from app.services.housing.units import TARGET_AREA, placed, solve_unit, unit_width
from app.services.layout_engine.geometry import EPS, Rect


class HousingDoesNotFit(ValueError):
    """The plate can't hold even one unit; the API answers 422."""


def _outline(rect: Rect) -> list[Vertex]:
    return [
        Vertex(x=round(x, 3), y=round(y, 3))
        for x, y in ((rect.x, rect.y), (rect.x2, rect.y), (rect.x2, rect.y2), (rect.x, rect.y2))
    ]


def _bounds(vertices: list[Vertex]) -> tuple[float, float, float, float]:
    xs, ys = [v.x for v in vertices], [v.y for v in vertices]
    return min(xs), min(ys), max(xs), max(ys)


def _floor_range(floors: list[int]) -> str:
    """[0, 1, 2, 4] -> "Floors 0–2, 4"."""
    parts, run = [], [floors[0]]
    for f in floors[1:] + [None]:
        if f is not None and f == run[-1] + 1:
            run.append(f)
            continue
        parts.append(str(run[0]) if len(run) == 1 else f"{run[0]}–{run[-1]}")
        if f is not None:
            run = [f]
    return ("Floors " if len(floors) > 1 else "Floor ") + ", ".join(parts)


def fill_housing(req: HousingFillRequest) -> HousingFillResponse:
    warnings: list[str] = []
    points = [(v.x, v.y) for v in req.footprint]
    try:
        rect, whole = P.largest_rectangle(points)
        plate = P.layout_plate(rect, req.facing.value if req.facing else None, req.corridor_width_m)
    except ValueError as exc:
        raise HousingDoesNotFit(f"Too small for housing: {exc}.") from exc
    if not whole:
        warnings.append(
            f"Irregular footprint: units fill the largest rectangle inside it "
            f"({rect.w:.1f} x {rect.d:.1f} m); the rest of the plate is left empty."
        )

    shares = {e.unit_type: e.share for e in req.mix}
    depth = plate.depth
    widths_by_row: list[dict[str, float]] = []
    for row in plate.rows:
        widths = {}
        for t in shares:
            w = unit_width(t, round(depth, 3), row.corridor)
            if w is not None:
                widths[t] = w
        widths_by_row.append(widths)
    dropped = sorted({t for t in shares if any(t not in w for w in widths_by_row)})
    if dropped:
        warnings.append(f"{', '.join(dropped)} can't be laid out in a {depth:.1f} m deep unit; left out of the mix.")
    fit_shares = {t: s for t, s in shares.items() if t not in dropped}
    if not fit_shares:
        raise HousingDoesNotFit(f"Too small for housing: no requested unit type fits a {depth:.1f} m deep unit.")
    # Rows share one depth, so one width table serves both.
    widths = {t: widths_by_row[0][t] for t in fit_shares}

    locked_by_floor: dict[int, list[HousingUnit]] = {}
    plate_poly = Polygon(((plate.rect.x, plate.rect.y), (plate.rect.x2, plate.rect.y), (plate.rect.x2, plate.rect.y2), (plate.rect.x, plate.rect.y2)))
    circulation = [
        Polygon(((plate.core.x, plate.core.y), (plate.core.x2, plate.core.y), (plate.core.x2, plate.core.y2), (plate.core.x, plate.core.y2))),
        Polygon(((plate.corridor.x, plate.corridor.y), (plate.corridor.x2, plate.corridor.y), (plate.corridor.x2, plate.corridor.y2), (plate.corridor.x, plate.corridor.y2))),
    ]
    seen_lock_ids: set[str] = set()
    for unit in req.locked_units:
        if unit.floor >= req.floors:
            warnings.append(f"Locked unit {unit.id} is on floor {unit.floor}, above the top floor; dropped.")
            continue
        if unit.id in seen_lock_ids:
            warnings.append(f"Locked unit {unit.id} is duplicated; later copy dropped.")
            continue
        outline = Polygon(([(v.x, v.y) for v in unit.outline]))
        row_ok = any(Polygon(((row.rect.x, row.rect.y), (row.rect.x2, row.rect.y), (row.rect.x2, row.rect.y2), (row.rect.x, row.rect.y2))).covers(outline) for row in plate.rows)
        if not outline.is_valid or outline.area <= EPS or not plate_poly.covers(outline) or not row_ok or any(outline.intersects(block) for block in circulation):
            warnings.append(f"Locked unit {unit.id} no longer fits this plate; dropped.")
            continue
        if any(outline.intersects(Polygon([(v.x, v.y) for v in other.outline])) for other in locked_by_floor.get(unit.floor, [])):
            warnings.append(f"Locked unit {unit.id} overlaps another lock; dropped.")
            continue
        seen_lock_ids.add(unit.id)
        locked_by_floor.setdefault(unit.floor, []).append(unit)

    targets = {t: TARGET_AREA[t] / depth for t in fit_shares}

    def segments_for(locked: list[HousingUnit]) -> list[P.Segment]:
        reserved = []
        for unit in locked:
            x0, y0, x1, y1 = _bounds(unit.outline)
            box = Rect(x0, y0, x1 - x0, y1 - y0)
            for i, row in enumerate(plate.rows):
                if box.overlaps(row.rect):
                    reserved.append((i, *plate.u_range(box)))
        return P.cut_segments(plate.segments, reserved)

    def build(floor: int, segments, seqs, locked: list[HousingUnit]) -> tuple[list[HousingUnit], float]:
        unused = sum(seg.length for seg, (seq, _) in zip(segments, seqs) if not seq)
        units = list(locked)
        taken = {u.id for u in locked}
        ids = (f"f{floor}-u{n}" for n in range(1, 10_000) if f"f{floor}-u{n}" not in taken)
        for slot in P.place(plate, segments, seqs):
            r = slot.rect
            plan = solve_unit(slot.unit_type, round(r.w, 3), round(r.d, 3), plate.rows[slot.row].corridor)
            if plan is None:  # a spread width the engine can't lay out
                unused += plate.u_range(r)[1] - plate.u_range(r)[0]
                continue
            units.append(HousingUnit(
                id=next(ids),
                floor=floor,
                unit_type=slot.unit_type,
                outline=_outline(r),
                area_m2=round(r.area, 2),
                plan=placed(plan, r.x, r.y, plate.rect.w, plate.rect.d),
            ))
        return units, unused

    types = sorted(fit_shares)
    fixed = [0] * len(types)
    by_floor: dict[int, list[HousingUnit]] = {}
    # Floors with locks first: each fills around its locks on its own.
    for floor, locked in sorted(locked_by_floor.items()):
        segments = segments_for(locked)
        _, states = P.floor_options(segments, widths, targets, fit_shares)
        lock_counts = tuple(sum(u.unit_type == t for u in locked) for t in types)
        key = min(states, key=lambda k: (
            P.mix_error(tuple(a + b for a, b in zip(k, lock_counts)), types, fit_shares), states[k][0],
        ))
        by_floor[floor], _ = build(floor, segments, states[key][1], locked)
        fixed = [f + a + b for f, a, b in zip(fixed, key, lock_counts)]

    # The other floors: one or two stacked floor types (A below, B above),
    # chosen for the building-wide mix. Wet rooms stack within each group.
    free = [f for f in range(req.floors) if f not in by_floor]
    unused = 0.0
    if free:
        _, states = P.floor_options(plate.segments, widths, targets, fit_shares)
        groups = P.choose_floor_types(types, states, fit_shares, len(free), tuple(fixed))
        start, ranges = 0, []
        for label, (key, n) in zip("AB", groups):
            template, left = build(0, plate.segments, states[key][1], [])
            unused = max(unused, left)
            floors = free[start:start + n]
            start += n
            ranges.append((label, floors))
            for floor in floors:
                by_floor[floor] = [
                    u.model_copy(update={"id": f"f{floor}-{u.id.split('-', 1)[1]}", "floor": floor})
                    for u in template
                ]
        if len(groups) == 2:
            text = "; ".join(f"{_floor_range(fl)}: plan {label}" for label, fl in ranges)
            warnings.append(text[0] + text[1:].replace("Floor", "floor"))
    units = [u for f in sorted(by_floor) for u in by_floor[f]]
    if not units:
        raise HousingDoesNotFit("Too small for housing: not even one unit fits beside the core.")
    if unused > EPS:
        warnings.append(f"{unused:.1f} m of corridor frontage per floor is left without units.")

    by_type = Counter(u.unit_type for u in units)
    total = len(units)
    types = sorted(set(shares) | set(by_type))
    gfa = Polygon(points).area * req.floors
    nsa = sum(u.area_m2 for u in units)
    return HousingFillResponse(
        units=units,
        cores=[_outline(plate.core)],
        corridors=[_outline(plate.corridor)],
        yield_=HousingYield(
            total_units=total,
            units_by_type={t: by_type[t] for t in types},
            mix_achieved={t: round(by_type[t] / total, 4) for t in types},
            gfa_m2=round(gfa, 2),
            nsa_m2=round(nsa, 2),
            efficiency=round(nsa / gfa, 4) if gfa > 0 else 0.0,
        ),
        warnings=warnings,
    )
