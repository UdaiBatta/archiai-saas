import pytest

from app.services.housing import partition as P
from app.services.layout_engine.geometry import EPS, Rect

WIDTHS = {"1bhk": 8.7, "2bhk": 12.25, "3bhk": 15.25}
MIX = {"1bhk": 0.3, "2bhk": 0.5, "3bhk": 0.2}
TARGET_AREA = {"1bhk": 45.0, "2bhk": 70.0, "3bhk": 95.0}


def _fill(rect: Rect, facing: str | None, widths=WIDTHS, shares=MIX):
    plate = P.layout_plate(rect, facing, 1.5)
    targets = {t: TARGET_AREA[t] / plate.depth for t in widths}
    types, states = P.floor_options(plate.segments, widths, targets, shares)
    [(key, _)] = P.choose_floor_types(types, states, shares, 1)
    return plate, P.place(plate, plate.segments, states[key][1])


def _shares_edge(a: Rect, b: Rect) -> bool:
    return a.shared_edge(b) is not None


def _on_side(r: Rect, plate: Rect, side: str) -> bool:
    return {
        "north": abs(r.y - plate.y) <= EPS,
        "south": abs(r.y2 - plate.y2) <= EPS,
        "west": abs(r.x - plate.x) <= EPS,
        "east": abs(r.x2 - plate.x2) <= EPS,
    }[side]


def test_double_loaded_when_deep_enough():
    plate = P.layout_plate(Rect(0, 0, 40, 15), None, 1.5)
    assert len(plate.rows) == 2
    assert plate.corridor == Rect(0, 6.75, 40, 1.5)
    assert plate.depth == pytest.approx(6.75)
    assert [row.corridor for row in plate.rows] == ["south", "north"]


def test_single_loaded_corridor_on_street_side():
    plate = P.layout_plate(Rect(0, 0, 40, 9), "south", 1.5)
    assert len(plate.rows) == 1
    assert plate.corridor.y2 == pytest.approx(9)  # the south (street) edge
    assert plate.rows[0].facade == "north"
    north = P.layout_plate(Rect(0, 0, 40, 9), "north", 1.5)
    assert north.corridor.y == 0


def test_north_south_plate_runs_along_y():
    plate = P.layout_plate(Rect(0, 0, 15, 40), "east", 1.5)
    assert not plate.long_x
    assert plate.corridor == Rect(6.75, 0, 1.5, 40)
    assert plate.core.x == pytest.approx(8.25)  # east (street) row


@pytest.mark.parametrize("facing,row", [("south", 1), ("north", 0)])
def test_core_on_street_side_at_mid_length(facing, row):
    plate = P.layout_plate(Rect(0, 0, 40, 15), facing, 1.5)
    assert plate.rows[row].rect.contains(plate.core)
    assert _shares_edge(plate.core, plate.corridor)
    assert (plate.core.x + plate.core.x2) / 2 == pytest.approx(20)


def test_too_shallow_or_short_raises():
    with pytest.raises(ValueError):
        P.layout_plate(Rect(0, 0, 40, 7), None, 1.5)
    with pytest.raises(ValueError):
        P.layout_plate(Rect(0, 0, 4, 9), None, 1.5)


def test_units_tile_rows_without_overlap_and_touch_facade_and_corridor():
    plate, slots = _fill(Rect(0, 0, 60, 15), "south")
    rects = [s.rect for s in slots]
    for i, a in enumerate(rects):
        assert not a.overlaps(plate.core) and not a.overlaps(plate.corridor)
        for b in rects[i + 1:]:
            assert not a.overlaps(b)
    for s in slots:
        row = plate.rows[s.row]
        assert _on_side(s.rect, plate.rect, row.facade)
        assert _shares_edge(s.rect, plate.corridor)
    covered = sum(r.area for r in rects) + plate.core.area + plate.corridor.area
    assert covered == pytest.approx(plate.rect.area)


def test_mix_within_one_unit_per_type_on_a_large_plate():
    plate, slots = _fill(Rect(0, 0, 150, 16), None)
    total = len(slots)
    for t, share in MIX.items():
        got = sum(s.unit_type == t for s in slots)
        assert abs(got - share * total) <= 1, (t, got, share * total)


def test_locked_intervals_are_reserved():
    plate = P.layout_plate(Rect(0, 0, 40, 15), None, 1.5)
    segments = P.cut_segments(plate.segments, [(1, 5.0, 17.25)])
    assert not any(s.row == 1 and s.u0 < 17.25 and s.u1 > 5.0 for s in segments)
    assert P.Segment(1, 0.0, 5.0) in segments


def test_largest_rectangle_of_an_l_shape():
    l_shape = [(0, 0), (40, 0), (40, 15), (15, 15), (15, 30), (0, 30)]
    rect, whole = P.largest_rectangle(l_shape)
    assert not whole
    assert rect == Rect(0, 0, 40, 15)
    rect, whole = P.largest_rectangle([(0, 0), (10, 0), (10, 5), (0, 5)])
    assert whole and rect == Rect(0, 0, 10, 5)


def test_spread_shares_spare_length_by_width_up_to_caps():
    widths = {"a": 6.0, "b": 12.0}
    even = P.spread(["a", "b"], 19.8, widths, {"a": 9.0, "b": 20.0})
    assert even == pytest.approx([6.6, 13.2])
    capped = P.spread(["a", "b"], 24.0, widths, {"a": 7.0, "b": 20.0})
    assert capped == pytest.approx([7.0, 17.0])
    assert P.spread(["a", "b"], 30.0, widths, {"a": 7.0, "b": 20.0}) is None


def test_single_floor_type_when_within_one_unit():
    states = {(1, 1): (0.0, []), (2, 0): (0.0, [])}
    assert P.choose_floor_types(["a", "b"], states, {"a": 0.5, "b": 0.5}, 5) == [((1, 1), 5)]


def test_two_floor_types_when_one_cannot_hit_the_mix():
    # Floors hold (2, 0) or (0, 2): three floors of one type are 3 units off.
    states = {(2, 0): (0.0, []), (0, 2): (0.0, [])}
    groups = P.choose_floor_types(["a", "b"], states, {"a": 0.5, "b": 0.5}, 3)
    assert len(groups) == 2 and sum(n for _, n in groups) == 3
    counts = [sum(k[i] * n for k, n in groups) for i in range(2)]
    assert abs(counts[0] - counts[1]) <= 2
