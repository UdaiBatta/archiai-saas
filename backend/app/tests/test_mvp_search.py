"""Workflow Phase 5.1 — candidate search (layout_engine/search.py).

Production generation uses best_candidate(); generate_plan() remains the
single-shot baseline and the polygon fallback.
"""
import json
import time
from pathlib import Path

import pytest

from app.schemas.requirements import RequirementsSpec
from app.services.layout_engine.engine import DoesNotFitError, generate_plan
from app.services.layout_engine.search import Candidate, best_candidate, generate_candidates
from app.services.quality.hard_constraints import validate
from app.services.quality.scorer import score

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"
FIXTURE_NAMES = ["1bhk", "2bhk", "3bhk_adjacencies", "4bhk", "clinic"]


def _load(name: str) -> RequirementsSpec:
    return RequirementsSpec.model_validate_json((FIXTURES / f"{name}.json").read_text())


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_every_candidate_is_a_valid_plan(name):
    spec = _load(name)
    for candidate in generate_candidates(spec, n=16, seed=0):
        assert validate(candidate.plan, spec) == []


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_candidates_are_ranked_by_ascending_energy(name):
    candidates = generate_candidates(_load(name), n=16, seed=0)
    energies = [c.energy for c in candidates]
    assert energies == sorted(energies)


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_best_of_64_scores_at_least_as_well_as_single_shot(name):
    """The doc's own acceptance bar: search must never do worse than the
    plain single-shot placement, only tie or improve on it."""
    spec = _load(name)
    single_shot_score = score(generate_plan(spec), spec).score
    best_score = score(best_candidate(spec, n=64, seed=0), spec).score
    assert best_score >= single_shot_score


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_same_spec_and_seed_produce_the_same_ranked_candidates(name):
    spec = _load(name)
    a = generate_candidates(spec, n=16, seed=7)
    b = generate_candidates(spec, n=16, seed=7)
    assert [c.plan for c in a] == [c.plan for c in b]
    assert [c.energy for c in a] == [c.energy for c in b]


def test_a_different_seed_can_produce_a_different_ranking():
    # Not a hard guarantee for every program (a tiny one may only have one
    # or two distinct room orderings at all), but 3bhk_adjacencies has
    # plenty of rooms to shuffle — pins that the seed genuinely matters,
    # not just documented as a parameter.
    spec = _load("3bhk_adjacencies")
    a = generate_candidates(spec, n=8, seed=1)
    b = generate_candidates(spec, n=8, seed=2)
    assert [c.seed for c in a] != [c.seed for c in b] or a[0].plan != b[0].plan


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_runtime_budget_is_well_under_the_doc_ceiling(name):
    """Doc's own ceiling: <= 3s per program at n=64."""
    spec = _load(name)
    start = time.time()
    generate_candidates(spec, n=64, seed=0)
    assert time.time() - start <= 3.0


def test_first_candidate_is_the_plain_single_shot_ordering():
    spec = _load("4bhk")
    candidates = generate_candidates(spec, n=1, seed=0)
    assert len(candidates) == 1
    assert candidates[0].plan == generate_plan(spec)


def test_candidates_honour_a_polygon_plot_boundary():
    """`plan_from_program` is the rect pipeline; fed a boundary-only spec it
    silently placed the program on the default 9x12 m rectangle — a layout
    for a plot the caller never asked for, while `generate_plan(spec)` on the
    same spec correctly returns the 20x14 boundary with clipped rooms."""
    spec = RequirementsSpec.model_validate({
        "rooms": [
            {"type": "bedroom", "count": 2},
            {"type": "kitchen", "count": 1},
            {"type": "living_room", "count": 1},
        ],
        "plot": {"boundary": [
            {"x": 0, "y": 0}, {"x": 20, "y": 0}, {"x": 20, "y": 14}, {"x": 8, "y": 14},
        ]},
        "facing": "east",
    })

    candidates = generate_candidates(spec, n=4, seed=0)

    assert len(candidates) == 1  # nothing to permute on the polygon path
    plan = candidates[0].plan
    assert plan == generate_plan(spec)
    assert plan.plot.boundary is not None
    assert any(room.vertices for room in plan.rooms)  # real clipped geometry
    assert generate_candidates(spec, n=0, seed=0) == []


def test_generate_candidates_returns_empty_list_for_zero_requested():
    assert generate_candidates(_load("1bhk"), n=0, seed=0) == []


def test_best_candidate_raises_when_the_plot_genuinely_cannot_fit_anything():
    spec = RequirementsSpec.model_validate({
        "rooms": [
            {"type": "bedroom", "count": 4},
            {"type": "bathroom", "count": 2},
            {"type": "kitchen", "count": 1},
            {"type": "living_room", "count": 1},
        ],
        "plot": {"width_m": 4.0, "depth_m": 4.0},
    })
    with pytest.raises(DoesNotFitError):
        best_candidate(spec, n=16, seed=0)


def test_search_finds_a_meaningfully_better_layout_than_single_shot():
    """Pin the measured gain among plans that pass sanitary circulation.

    Stacking the attached and the common bathroom back to back, keeping the
    balcony with the living room, and sizing the house to its rooms (not the
    plot) lifted the single shot from 72 to 90 (91 with the squarer-room
    cutting); the search reaches 100 (99 now that the score also counts
    room proportions).
    """
    spec = _load("3bhk_adjacencies")
    single_shot_score = score(generate_plan(spec), spec).score
    best_score = score(best_candidate(spec, n=64, seed=0), spec).score
    assert single_shot_score == 91
    assert best_score == 99
    assert best_score - single_shot_score >= 8


@pytest.mark.parametrize("name", FIXTURE_NAMES)
def test_annealing_never_scores_worse_than_best_of_n_alone(name):
    spec = _load(name)
    plain = generate_candidates(spec, n=64, seed=0)
    annealed = generate_candidates(spec, n=64, seed=0, anneal_iterations=50)
    assert annealed[0].energy <= plain[0].energy
    assert validate(annealed[0].plan, spec) == []


def test_annealing_is_deterministic_for_a_fixed_seed():
    spec = _load("3bhk_adjacencies")
    first = generate_candidates(spec, n=64, seed=0, anneal_iterations=50)
    second = generate_candidates(spec, n=64, seed=0, anneal_iterations=50)
    assert first[0].plan == second[0].plan
    assert first[0].energy == second[0].energy


def test_annealing_is_off_by_default():
    spec = _load("3bhk_adjacencies")
    default = generate_candidates(spec, n=64, seed=0)
    explicit_off = generate_candidates(spec, n=64, seed=0, anneal_iterations=0)
    assert default == explicit_off


def test_anneal_can_actually_improve_a_suboptimal_starting_point():
    """The real, measured finding from Phase 5.2's benchmark: annealing
    starting from the best-of-64 *winner* finds nothing further on any of
    the 5 fixtures — best-of-64 already reaches the same optimum. That is
    not because annealing is a no-op; it's because there's nowhere better
    left to go from an already-good start. Proven directly: annealing from
    the plain single-shot ordering (worse than the best-of-64 winner) finds
    its way to that exact same optimum energy."""
    from app.config.mvp_defaults import DEFAULT_FACING, DEFAULT_PLOT_DEPTH_M, DEFAULT_PLOT_WIDTH_M
    from app.services.layout_engine.engine import _build_program, plan_from_program
    from app.services.layout_engine.search import Candidate, _anneal, energy
    from app.services.planning import from_requirements
    from app.services.planning.program_completion import ensure_corridor, ensure_entry

    spec = _load("3bhk_adjacencies")
    plot_w = spec.plot.width_m or DEFAULT_PLOT_WIDTH_M
    plot_d = spec.plot.depth_m or DEFAULT_PLOT_DEPTH_M
    facing = spec.facing or DEFAULT_FACING
    graph = ensure_corridor(ensure_entry(from_requirements(spec)))
    program = _build_program(spec)
    single_shot_plan = plan_from_program(spec, program, plot_w, plot_d, facing)
    start = Candidate(plan=single_shot_plan, energy=energy(single_shot_plan, spec, graph), seed=0)

    refined = _anneal(start, program, spec, plot_w, plot_d, facing, graph, iterations=200, seed=0)
    best_of_64_winner = generate_candidates(spec, n=64, seed=0)[0]

    assert refined.energy < start.energy
    assert refined.energy == pytest.approx(best_of_64_winner.energy)


def test_best_candidate_preserves_the_polygon_generation_path():
    spec = RequirementsSpec.model_validate({
        "rooms": [{"type": "bedroom", "count": 1}],
        "plot": {
            "boundary": [
                {"x": 0, "y": 0},
                {"x": 8, "y": 0},
                {"x": 7, "y": 6},
                {"x": 0, "y": 6},
            ],
        },
    })

    assert best_candidate(spec) == generate_plan(spec)
