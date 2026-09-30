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


# Segments longer than TAIL_M are started greedily; the last TAIL_M is
# packed exhaustively.
TAIL_M = 40.0
# A segment's spare length is spread over its units in proportion to their
# widths; no unit may end up above CAP_RATIO x its target area unless the
# facade rooms already force it (its minimum width is the floor).
CAP_RATIO = 1.35
# ponytail: floor-option states kept per segment step, pruned by mix error
# then size penalty; raise if long multi-segment plates lose good mixes.
STATE_LIMIT = 400
PAIR_CANDIDATES = 60


def _combos(types: list[str], widths: dict[str, float], length: float):
    """Every multiset of types (as count tuples) that fits in `length`."""
    if not types:
        yield ()
        return
    head, rest = types[0], types[1:]
    for n in range(int((length + EPS) // widths[head]) + 1):
        for tail in _combos(rest, widths, length - n * widths[head]):
            yield (n, *tail)


def _prefix(length: float, widths: dict[str, float], shares: dict[str, float]) -> tuple[list[str], float]:
    """Greedy start of a long segment: the type furthest below its share."""
    seq: list[str] = []
    left, share_sum = length, sum(shares.values())
    while left > TAIL_M:
        n = len(seq) + 1
        t = max(sorted(widths), key=lambda t: shares[t] / share_sum * n - seq.count(t))
        seq.append(t)
        left -= widths[t]
    return seq, left


def spread(seq: list[str], length: float, widths: dict[str, float], caps: dict[str, float]) -> list[float] | None:
    """Unit widths filling `length`: the spare length shared in proportion
    to the units' widths, but a unit that reaches its cap stops growing and
    the rest share what's left. None when even every unit at its cap falls
    short (or the minimum widths don't fit)."""
    base = [widths[t] for t in seq]
    if sum(base) > length + EPS or sum(caps[t] for t in seq) < length - EPS:
        return None
    out, free = list(base), set(range(len(seq)))
    while True:
        spare = length - sum(out)
        grow = sum(base[i] for i in free)
        if spare <= EPS or not free:
            return out
        capped = set()
        for i in free:
            out[i] += spare * base[i] / grow
            if out[i] >= caps[seq[i]] - EPS:
                out[i] = caps[seq[i]]
                capped.add(i)
        if not capped:
            return out
        free -= capped


def segment_options(
    length: float, widths: dict[str, float], targets: dict[str, float], shares: dict[str, float],
) -> list[tuple[list[str], list[float], float]]:
    """(type sequence, unit widths, size penalty) options for one segment.
    The penalty is the sum over units of |width / target width - 1|. Only
    packings whose units all stay within their caps; failing that, the
    evenly spread packings with the least overshoot; failing that (nothing
    fits), the empty sequence."""
    caps = cap_widths(widths, targets)
    types = sorted(widths, key=lambda t: -widths[t])
    prefix, left = _prefix(length, widths, shares)
    valid, over_cap = [], []
    for combo in _combos(types, widths, left):
        seq = prefix + [t for t, k in zip(types, combo) for _ in range(k)]
        if not seq:
            continue
        ws = spread(seq, length, widths, caps)
        if ws is None:
            scale = length / sum(widths[t] for t in seq)
            ws = [widths[t] * scale for t in seq]
            over_cap.append((max(w / caps[t] for t, w in zip(seq, ws)), seq, ws))
            continue
        valid.append((seq, ws, sum(abs(w / targets[t] - 1) for t, w in zip(seq, ws))))
    if valid:
        return valid
    if not over_cap:
        return [([], [], 0.0)]
    # Nothing stays under the caps (the facade rule makes every unit too big
    # already): keep the packings within 10% of the smallest overshoot.
    least = min(o for o, _, _ in over_cap)
    return [
        (seq, ws, sum(abs(w / targets[t] - 1) for t, w in zip(seq, ws)))
        for o, seq, ws in over_cap if o <= least + 0.1
    ]


def cap_widths(widths: dict[str, float], targets: dict[str, float]) -> dict[str, float]:
    """The widest each type may grow: CAP_RATIO x target, never below the
    minimum width the facade rooms need."""
    return {t: max(targets[t] * CAP_RATIO, widths[t]) for t in widths}


def floor_options(
    segments: list[Segment], widths: dict[str, float], targets: dict[str, float], shares: dict[str, float],
) -> tuple[list[str], dict[tuple[int, ...], tuple[float, list[list[str]]]]]:
    """Every distinct per-floor unit count reachable by combining segment
    options -> (lowest size penalty, (type sequence, widths) per segment)."""
    types = sorted(shares)
    states: dict[tuple[int, ...], tuple[float, list]] = {tuple(0 for _ in types): (0.0, [])}
    for seg in segments:
        opts = segment_options(seg.length, widths, targets, shares)
        nxt: dict[tuple[int, ...], tuple[float, list[list[str]]]] = {}
        for key, (pen, seqs) in states.items():
            for seq, ws, p in opts:
                k = tuple(c + seq.count(t) for c, t in zip(key, types))
                if k not in nxt or pen + p < nxt[k][0]:
                    nxt[k] = (pen + p, seqs + [(seq, ws)])
        states = dict(sorted(
            nxt.items(), key=lambda kv: (mix_error(kv[0], types, shares), kv[1][0]),
        )[:STATE_LIMIT])
    return types, states


def mix_error(counts: tuple[int, ...], types: list[str], shares: dict[str, float]) -> tuple[float, float]:
    """(worst, total) distance in units from the ideal counts; no units at
    all is the worst possible."""
    n = sum(counts)
    if n == 0:
        return (float("inf"), float("inf"))
    share_sum = sum(shares.values())
    devs = [abs(c - shares[t] / share_sum * n) for c, t in zip(counts, types)]
    return (round(max(devs), 6), round(sum(devs), 6))


def choose_floor_types(
    types: list[str],
    states: dict[tuple[int, ...], tuple[float, list[list[str]]]],
    shares: dict[str, float],
    n_floors: int,
    fixed: tuple[int, ...] | None = None,
) -> list[tuple[tuple[int, ...], int]]:
    """One floor type for all `n_floors` when that is within one unit per
    type of the ideal building mix, else the best pair (A for the first n
    floors, B for the rest) by (mix error, size penalty). `fixed` counts
    units already placed elsewhere (locked floors)."""
    fixed = fixed or tuple(0 for _ in types)

    def score(groups):
        counts = tuple(f + sum(k[i] * n for k, n in groups) for i, f in enumerate(fixed))
        return mix_error(counts, types, shares), sum(states[k][0] * n for k, n in groups)

    best = min(([(k, n_floors)] for k in states), key=score)
    if n_floors < 2 or score(best)[0][0] <= 1 + 1e-9:
        return best
    top = sorted(states, key=lambda k: (mix_error(k, types, shares), states[k][0]))[:PAIR_CANDIDATES]
    best_score = score(best)
    for a in top:
        for b in top:
            if a == b:
                continue
            for na in range(1, n_floors):
                groups = [(a, na), (b, n_floors - na)]
                sc = score(groups)
                if sc < best_score:
                    best, best_score = groups, sc
    return best


def place(plate: Plate, segments: list[Segment], layout: list[tuple[list[str], list[float]]]) -> list[Slot]:
    """Slots along each segment from its (type sequence, unit widths)."""
    slots: list[Slot] = []
    for seg, (seq, ws) in zip(segments, layout):
        if not seq:
            continue
        cuts = [seg.u0]
        for w in ws[:-1]:
            cuts.append(round(cuts[-1] + w, 3))
        cuts.append(seg.u1)
        for k, t in enumerate(seq):
            slots.append(Slot(seg.row, t, plate.unit_rect(seg.row, cuts[k], cuts[k + 1])))
    return slots
