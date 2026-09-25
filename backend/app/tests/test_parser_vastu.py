"""Vastu opt-in detection."""
from app.services.parser.vastu import is_vastu_requested


def test_vastu_keyword_detected():
    assert is_vastu_requested("3bhk vastu compliant home") is True


def test_vaastu_variant_detected():
    assert is_vastu_requested("vaastu house") is True


def test_no_vastu_keyword():
    assert is_vastu_requested("modern apartment") is False


def test_vastu_not_triggered_on_unrelated_text():
    assert is_vastu_requested("vast open living space") is False
