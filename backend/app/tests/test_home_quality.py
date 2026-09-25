"""Gate: a planner change must not make home plans worse than the committed
baseline (scripts/home_quality_baseline.json). After an intended
improvement, refresh it with `python scripts/home_quality.py --write-baseline`."""

import json

import pytest

from scripts.home_quality import BASELINE, run, totals


@pytest.fixture(scope="module")
def current():
    return totals(run())


@pytest.fixture(scope="module")
def baseline():
    return json.loads(BASELINE.read_text(encoding="utf-8"))["totals"]


def test_no_brief_that_fitted_is_now_refused(current, baseline):
    assert current["fits"] >= baseline["fits"]


def test_every_plan_shown_passes_the_hard_rules(current):
    assert current["invalid"] == 0


def test_rooms_are_not_more_stretched(current, baseline):
    assert current["stretched_pct"] <= baseline["stretched_pct"]


def test_no_more_rooms_lose_their_daylight(current, baseline):
    assert current["no_daylight"] <= baseline["no_daylight"]


def test_scores_do_not_drop(current, baseline):
    assert current["mean_score"] >= baseline["mean_score"] - 0.5
