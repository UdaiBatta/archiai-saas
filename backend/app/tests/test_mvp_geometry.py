"""Workflow Step 1.1 — geometry primitive edge cases."""
import pytest

from app.services.layout_engine.geometry import Rect


def test_touching_rects_do_not_overlap_but_share_an_edge():
    a = Rect(0, 0, 3, 3)
    b = Rect(3, 0, 3, 3)  # touches a's east edge exactly
    assert not a.overlaps(b)
    seg = a.shared_edge(b)
    assert seg is not None
    assert seg.length == pytest.approx(3.0)


def test_one_millimeter_overlap_treated_as_touching():
    a = Rect(0, 0, 3, 3)
    b = Rect(2.9995, 0, 3, 3)  # 0.5 mm intrusion — inside epsilon
    assert not a.overlaps(b)


def test_real_overlap_detected():
    a = Rect(0, 0, 3, 3)
    b = Rect(2.5, 0, 3, 3)
    assert a.overlaps(b)


def test_shared_edge_honours_one_millimetre_inclusive_tolerance():
    a = Rect(0, 0, 5.212, 3)
    assert a.shared_edge(Rect(5.213, 0, 2, 3)) is not None
    assert a.shared_edge(Rect(5.214, 0, 2, 3)) is None


def test_corner_contact_is_not_a_shared_edge():
    a = Rect(0, 0, 3, 3)
    b = Rect(3, 3, 3, 3)  # touches only at the corner point (3,3)
    assert a.shared_edge(b) is None
    assert not a.overlaps(b)


def test_partial_shared_edge_returns_the_overlap_segment():
    a = Rect(0, 0, 3, 4)
    b = Rect(3, 2, 3, 4)  # east contact, y overlap [2, 4]
    seg = a.shared_edge(b)
    assert seg is not None
    assert seg.length == pytest.approx(2.0)
    assert (seg.y1, seg.y2) == (2, 4)


def test_degenerate_zero_area_rect_rejected():
    with pytest.raises(ValueError):
        Rect(0, 0, 0.0, 3)
    with pytest.raises(ValueError):
        Rect(0, 0, 3, 0.0005)


def test_contains_and_aspect():
    outer = Rect(0, 0, 10, 12)
    inner = Rect(1, 1, 3, 3)
    assert outer.contains(inner)
    assert not inner.contains(outer)
    assert Rect(0, 0, 5, 2).aspect_ratio == pytest.approx(2.5)
