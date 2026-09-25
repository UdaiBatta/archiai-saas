"""Axis-aligned rectangle math (workflow Step 1.1).

Every later geometric bug gets blamed on this file, so it is deliberately
boring. All comparisons go through EPS (1 mm) — floats are never compared raw.
Coordinates follow the locked LayoutPlan convention: meters, origin NW,
+x east, +y south.
"""
from dataclasses import dataclass

EPS = 0.001  # 1 mm


@dataclass(frozen=True)
class Segment:
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def length(self) -> float:
        return abs(self.x2 - self.x1) + abs(self.y2 - self.y1)  # axis-aligned


@dataclass(frozen=True)
class Rect:
    """x, y = NW corner; w spans east, d spans south."""

    x: float
    y: float
    w: float
    d: float

    def __post_init__(self) -> None:
        if self.w <= EPS or self.d <= EPS:
            raise ValueError(f"degenerate rect {self.w}x{self.d}")

    @property
    def x2(self) -> float:
        return self.x + self.w

    @property
    def y2(self) -> float:
        return self.y + self.d

    @property
    def area(self) -> float:
        return self.w * self.d

    @property
    def aspect_ratio(self) -> float:
        return max(self.w, self.d) / min(self.w, self.d)

    def overlaps(self, other: "Rect", eps: float = EPS) -> bool:
        """True only for genuine area overlap — touching edges do not count."""
        return (
            self.x + eps < other.x2
            and other.x + eps < self.x2
            and self.y + eps < other.y2
            and other.y + eps < self.y2
        )

    def contains(self, other: "Rect", eps: float = EPS) -> bool:
        return (
            other.x >= self.x - eps
            and other.y >= self.y - eps
            and other.x2 <= self.x2 + eps
            and other.y2 <= self.y2 + eps
        )

    def shared_edge(self, other: "Rect", eps: float = EPS) -> Segment | None:
        """The wall-length segment where two rects touch, or None.

        Rects touching at a single corner point share no edge (doc edge case:
        corner contact must not count as adjacency for door placement).
        """
        # Vertical contact: my east edge on their west edge, or vice versa.
        for x in ((self.x2, other.x), (other.x2, self.x)):
            if abs(x[0] - x[1]) <= eps + 1e-9:
                y_lo = max(self.y, other.y)
                y_hi = min(self.y2, other.y2)
                if y_hi - y_lo > eps:
                    return Segment(x[0], y_lo, x[0], y_hi)
        # Horizontal contact: my south edge on their north edge, or vice versa.
        for y in ((self.y2, other.y), (other.y2, self.y)):
            if abs(y[0] - y[1]) <= eps + 1e-9:
                x_lo = max(self.x, other.x)
                x_hi = min(self.x2, other.x2)
                if x_hi - x_lo > eps:
                    return Segment(x_lo, y[0], x_hi, y[0])
        return None


def uncovered_edges(rect: Rect, others: list[Rect]) -> list[Segment]:
    """Parts of ``rect``'s four edges (left, right, top, bottom — the order
    the old plot-edge rule used) that no neighbour shares."""
    def remaining(lo: float, hi: float, covers: list[tuple[float, float]]) -> list[tuple[float, float]]:
        spans = [(lo, hi)]
        for c_lo, c_hi in covers:
            spans = [
                piece
                for s_lo, s_hi in spans
                for piece in ((s_lo, min(s_hi, c_lo)), (max(s_lo, c_hi), s_hi))
                if piece[1] - piece[0] > EPS
            ] if c_hi > lo + EPS and c_lo < hi - EPS else spans
        return spans

    def along_y(x: float, touching) -> list[Segment]:
        covers = [(o.y, o.y2) for o in others if touching(o)]
        return [Segment(x, lo, x, hi) for lo, hi in remaining(rect.y, rect.y2, covers)]

    def along_x(y: float, touching) -> list[Segment]:
        covers = [(o.x, o.x2) for o in others if touching(o)]
        return [Segment(lo, y, hi, y) for lo, hi in remaining(rect.x, rect.x2, covers)]

    return [
        *along_y(rect.x, lambda o: abs(o.x2 - rect.x) <= EPS),
        *along_y(rect.x2, lambda o: abs(o.x - rect.x2) <= EPS),
        *along_x(rect.y, lambda o: abs(o.y2 - rect.y) <= EPS),
        *along_x(rect.y2, lambda o: abs(o.y - rect.y2) <= EPS),
    ]
