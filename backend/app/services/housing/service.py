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
from app.services.housing.units import placed, solve_unit, unit_width
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
    for unit in req.locked_units:
        if unit.floor >= req.floors:
            warnings.append(f"Locked unit {unit.id} is on floor {unit.floor}, above the top floor; dropped.")
            continue
        locked_by_floor.setdefault(unit.floor, []).append(unit)

    def floor_units(floor: int, locked: list[HousingUnit]) -> tuple[list[HousingUnit], float]:
        reserved = []
        for unit in locked:
            x0, y0, x1, y1 = _bounds(unit.outline)
            box = Rect(x0, y0, x1 - x0, y1 - y0)
            for i, row in enumerate(plate.rows):
                if box.overlaps(row.rect):
                    reserved.append((i, *plate.u_range(box)))
        segments = P.cut_segments(plate.segments, reserved)
        counts = Counter(u.unit_type for u in locked)
        seqs = P.choose_types(segments, widths, fit_shares, dict(counts))
        slots, unused = P.place(plate, segments, seqs, widths)
        units = list(locked)
        taken = {u.id for u in locked}
        ids = (f"f{floor}-u{n}" for n in range(1, 10_000) if f"f{floor}-u{n}" not in taken)
        for slot in slots:
            r = slot.rect
            plan = solve_unit(slot.unit_type, round(r.w, 3), round(r.d, 3), plate.rows[slot.row].corridor)
            if plan is None:  # a widened end unit the engine can't lay out
                unused += plate.u_range(r)[1] - plate.u_range(r)[0]
                continue
            units.append(HousingUnit(
                id=next(ids),
                floor=floor,
                unit_type=slot.unit_type,
                outline=_outline(r),
                area_m2=round(r.area, 2),
                plan=placed(plan, r.x, r.y),
            ))
        return units, unused

    # Every floor without locks gets the same partition (stacked wet rooms).
    typical, unused = floor_units(0, [])
    units: list[HousingUnit] = []
    for floor in range(req.floors):
        if floor in locked_by_floor:
            here, _ = floor_units(floor, locked_by_floor[floor])
        else:
            here = [u.model_copy(update={"id": f"f{floor}-{u.id.split('-', 1)[1]}", "floor": floor}) for u in typical]
        units.extend(here)
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
