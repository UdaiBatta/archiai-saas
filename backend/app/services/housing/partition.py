"""Floor-plate partition (roadmap P3): corridor, core and unit slots on one
rectangular plate. Pure geometry, no layout engine.

Frame: the plate's long axis is "u", the short axis "v". On an east-west plate
u = x and v = y (low v = north); on a north-south plate u = y and v = x
(low v = west). Units run along u in one or two rows; a row's depth (v) is the
distance from the corridor to the facade.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from shapely.geometry import Polygon, box

from app.services.layout_engine.geometry import EPS, Rect

# Deep enough for a 3.3 m habitable room + 1 m hall + 2.1 m bathroom strip.
MIN_UNIT_DEPTH = 6.5
# Core: a 3 x 6 m stair plus a 2 x 2.5 m lift, side by side along the corridor.
STAIR_W, STAIR_L = 3.0, 6.0
LIFT_W, LIFT_L = 2.0, 2.5


@dataclass(frozen=True)
class Row:
    rect: Rect
    facade: str    # compass side of the unit's outside wall
    corridor: str  # compass side the unit's front door faces


@dataclass(frozen=True)
class Segment:
    row: int
    u0: float
    u1: float

    @property
    def length(self) -> float:
        return self.u1 - self.u0


@dataclass(frozen=True)
class Slot:
    row: int
    unit_type: str
    rect: Rect


@dataclass
class Plate:
    rect: Rect
    long_x: bool
    rows: list[Row]
    corridor: Rect
    core: Rect
    segments: list[Segment] = field(default_factory=list)

    @property
    def depth(self) -> float:
        return self.rows[0].rect.d if self.long_x else self.rows[0].rect.w

    def u_range(self, rect: Rect) -> tuple[float, float]:
        return (rect.x, rect.x2) if self.long_x else (rect.y, rect.y2)

    def unit_rect(self, row: int, u0: float, u1: float) -> Rect:
        r = self.rows[row].rect
        if self.long_x:
            return Rect(u0, r.y, u1 - u0, r.d)
        return Rect(r.x, u0, r.w, u1 - u0)


def largest_rectangle(points: list[tuple[float, float]]) -> tuple[Rect, bool]:
    """The largest axis-aligned rectangle inside the polygon, and whether it
    is the whole polygon. Grid search over the vertex coordinates (plus a
    40-step grid so slanted edges are approximated): exact for orthogonal
    footprints, a conservative inner approximation otherwise."""
    poly = Polygon(points)
    if not poly.is_valid or poly.area <= EPS:
        raise ValueError("footprint is not a valid polygon")
    x0, y0, x1, y1 = poly.bounds
    if abs(poly.area - (x1 - x0) * (y1 - y0)) <= 1e-6 * poly.area:
        return Rect(x0, y0, x1 - x0, y1 - y0), True

    def coords(values: list[float], lo: float, hi: float) -> list[float]:
        grid = [lo + (hi - lo) * i / 40 for i in range(41)]
        return sorted({round(v, 6) for v in values + grid})

    xs = coords([p[0] for p in points], x0, x1)
    ys = coords([p[1] for p in points], y0, y1)
    inside = [
        [poly.buffer(1e-9).contains(box(xs[i], ys[j], xs[i + 1], ys[j + 1])) for i in range(len(xs) - 1)]
        for j in range(len(ys) - 1)
    ]
    best, best_area = None, 0.0
    # ponytail: O(cols^2 * rows) scan, fine for <= ~100 grid lines per axis.
    for i in range(len(xs) - 1):
        full = [True] * (len(ys) - 1)
        for k in range(i, len(xs) - 1):
            width = xs[k + 1] - xs[i]
            run_start = None
            for j in range(len(ys) - 1):
                full[j] = full[j] and inside[j][k]
                if full[j]:
                    run_start = j if run_start is None else run_start
                    area = width * (ys[j + 1] - ys[run_start])
                    if area > best_area:
                        best_area, best = area, Rect(xs[i], ys[run_start], width, ys[j + 1] - ys[run_start])
                else:
                    run_start = None
    if best is None:
        raise ValueError("footprint has no usable rectangle")
    return best, False


def layout_plate(rect: Rect, facing: str | None, corridor_w: float) -> Plate:
    """Rows, corridor and core for a plate. Raises ValueError when not even a
    single-loaded row and the core fit."""
    long_x = rect.w >= rect.d
    length, span = (rect.w, rect.d) if long_x else (rect.d, rect.w)
    u_lo, v_lo = (rect.x, rect.y) if long_x else (rect.y, rect.x)
    lo_side, hi_side = ("north", "south") if long_x else ("west", "east")
    street_hi = facing == hi_side  # None or a short-end facing: street on the low side

    def r(u0: float, u1: float, v0: float, v1: float) -> Rect:
        return Rect(u0, v0, u1 - u0, v1 - v0) if long_x else Rect(v0, u0, v1 - v0, u1 - u0)

    u_hi = u_lo + length
    rows: list[Row] = []
    if span >= 2 * MIN_UNIT_DEPTH + corridor_w - EPS:
        depth = (span - corridor_w) / 2
        rows.append(Row(r(u_lo, u_hi, v_lo, v_lo + depth), lo_side, hi_side))
        rows.append(Row(r(u_lo, u_hi, v_lo + depth + corridor_w, v_lo + span), hi_side, lo_side))
        corridor = r(u_lo, u_hi, v_lo + depth, v_lo + depth + corridor_w)
        core_row = 1 if street_hi else 0
    elif span >= MIN_UNIT_DEPTH + corridor_w - EPS:
        depth = span - corridor_w
        if street_hi:  # corridor (an open gallery) on the street side
            rows.append(Row(r(u_lo, u_hi, v_lo, v_lo + depth), lo_side, hi_side))
            corridor = r(u_lo, u_hi, v_lo + depth, v_lo + span)
        else:
            rows.append(Row(r(u_lo, u_hi, v_lo + corridor_w, v_lo + span), hi_side, lo_side))
            corridor = r(u_lo, u_hi, v_lo, v_lo + corridor_w)
        core_row = 0
    else:
        raise ValueError(
            f"the plate is {span:.1f} m across; units need {MIN_UNIT_DEPTH + corridor_w:.1f} m "
            f"(a {MIN_UNIT_DEPTH:.1f} m deep unit plus the corridor)"
        )

    # Stair across the row when the row is deep enough, else along it.
    core_len = (STAIR_W if depth >= STAIR_L else STAIR_L) + LIFT_W
    if length < core_len - EPS:
        raise ValueError(f"the plate is {length:.1f} m long; the stair and lift core alone need {core_len:.1f} m")
    c0 = u_lo + (length - core_len) / 2
    row_v = (rows[core_row].rect.y, rows[core_row].rect.y2) if long_x else (rows[core_row].rect.x, rows[core_row].rect.x2)
    core = r(c0, c0 + core_len, *row_v)

    segments = []
    for i in range(len(rows)):
        if i == core_row:
            segments += [Segment(i, u_lo, c0), Segment(i, c0 + core_len, u_hi)]
        else:
            segments.append(Segment(i, u_lo, u_hi))
    return Plate(rect, long_x, rows, corridor, core, [s for s in segments if s.length > EPS])


def cut_segments(segments: list[Segment], reserved: list[tuple[int, float, float]]) -> list[Segment]:
    """Remove reserved (row, u0, u1) intervals (locked units) from segments."""
    out = list(segments)
    for row, a, b in reserved:
        nxt = []
        for s in out:
            if s.row != row or b <= s.u0 + EPS or a >= s.u1 - EPS:
                nxt.append(s)
                continue
            if a > s.u0 + EPS:
                nxt.append(Segment(row, s.u0, a))
            if b < s.u1 - EPS:
                nxt.append(Segment(row, b, s.u1))
        out = nxt
    return out


# The last TAIL_M of each segment is packed exhaustively (fewest metres
# wasted, closest to the mix); before that, units are placed greedily.
TAIL_M = 40.0
# One smallest-unit width of wasted frontage costs as much as this many
# units of mix deviation.
WASTE_WEIGHT = 1.5


def _combos(types: list[str], widths: dict[str, float], length: float):
    """Every multiset of types (as count tuples) that fits in `length`."""
    if not types:
        yield ()
        return
    head, rest = types[0], types[1:]
    for n in range(int((length + EPS) // widths[head]) + 1):
        for tail in _combos(rest, widths, length - n * widths[head]):
            yield (n, *tail)


def choose_types(
    segments: list[Segment],
    widths: dict[str, float],
    shares: dict[str, float],
    counts: dict[str, int] | None = None,
) -> list[list[str]]:
    """Unit types per segment, aiming at the requested mix (shares of unit
    count). Longest segment first: greedy by deficit (the type furthest
    below its share) until TAIL_M is left, then the best-scoring exact
    packing of the tail. ``counts`` seeds already-placed units (locks)."""
    counts = dict(counts or {})
    share_sum = sum(shares.values())
    types = sorted(shares, key=lambda t: -widths[t])
    min_w = min(widths.values())
    seqs: list[list[str]] = [[] for _ in segments]

    def deviation(c: dict[str, int]) -> float:
        n = sum(c.values())
        return sum(abs(c.get(t, 0) - shares[t] / share_sum * n) for t in shares)

    for i in sorted(range(len(segments)), key=lambda k: -segments[k].length):
        left = segments[i].length
        while left > TAIL_M:
            n = sum(counts.values()) + 1
            t = max(types, key=lambda t: shares[t] / share_sum * n - counts.get(t, 0))
            seqs[i].append(t)
            counts[t] = counts.get(t, 0) + 1
            left -= widths[t]
        best = None
        for combo in _combos(types, widths, left):
            c = {t: counts.get(t, 0) + k for t, k in zip(types, combo)}
            waste = left - sum(k * widths[t] for t, k in zip(types, combo))
            score = deviation(c) + WASTE_WEIGHT * waste / min_w
            if best is None or score < best[0] - 1e-9:
                best = (score, combo, c)
        _, combo, counts = best
        seqs[i] += [t for t, k in zip(types, combo) for _ in range(k)]
    return seqs


def place(
    plate: Plate, segments: list[Segment], seqs: list[list[str]], widths: dict[str, float],
) -> tuple[list[Slot], float]:
    """Slots along each segment. Leftover length goes to the segment's end
    units (half each); a segment with no units leaves its length unused.
    Returns the slots and the total unused length."""
    slots: list[Slot] = []
    unused = 0.0
    for seg, seq in zip(segments, seqs):
        if not seq:
            unused += seg.length
            continue
        ws = [widths[t] for t in seq]
        spare = seg.length - sum(ws)
        if len(ws) == 1:
            ws[0] += spare
        else:
            ws[0] += spare / 2
            ws[-1] += spare / 2
        cuts = [seg.u0]
        for w in ws[:-1]:
            cuts.append(round(cuts[-1] + w, 3))
        cuts.append(seg.u1)
        for k, t in enumerate(seq):
            slots.append(Slot(seg.row, t, plate.unit_rect(seg.row, cuts[k], cuts[k + 1])))
    return slots, unused
