"""layout_engine/search.py — workflow Phase 5.1: generate-and-score
candidate search.

The production MVP API uses :func:`best_candidate` for rectangular plots.
Every candidate flows through the exact same proven ``engine.plan_on_plot``
pipeline ``generate_plan()`` itself uses, parameterized by a room-order-
shuffled copy of the same ``EngineProgram`` — so a candidate carries the
identical zero-overlap/zero-gap/reachability guarantees a single-shot plan
already has; search only varies WHICH valid layout comes out, never how
validity itself is checked.

Variation axis implemented: placement-order permutation of the program's
room list (a seeded shuffle). ``subdivide()``'s cumulative-area halving and
the archetype band-grouping helpers are order-sensitive, so different
orderings genuinely produce different geometries through the exact same
deterministic code — no new placement logic needed. The doc's other three
axes (per-archetype parameter jitter, a subdivision cut-axis bias, splitting
the candidate budget across the top-2 viable archetypes) are deferred — a
bounded first slice, same practice as every other phase in this workflow.

Phase 5.2 (``_anneal``, wired in via ``anneal_iterations``): the workflow's
"optional switch" second PR — local search around the best-of-n winner's
own room order via simulated annealing (single-swap neighbor moves,
Metropolis acceptance, geometric cooling), rather than best-of-n's
independent random restarts. Off by default (``anneal_iterations=0``)
everywhere, matching the doc's own "add another optimizer only when
benchmarks show a remaining need" stance; callers opt in explicitly.
Same "can only take over when it demonstrably wins" competition already
used throughout this codebase (Sprint 18's graph-vs-tiler selection,
Phase 9's archetype retry) — annealing tracks its best-seen plan
separately from its current (possibly-worse, accepted-to-explore) walk
state, so it can never hand back anything worse than the best-of-n
winner it started from.
"""
import dataclasses
import math
import random

from app.config.mvp_defaults import DEFAULT_FACING, DEFAULT_PLOT_DEPTH_M, DEFAULT_PLOT_WIDTH_M
from app.schemas.layout_plan import LayoutPlan
from app.schemas.requirements import RequirementsSpec
from app.services.layout_adapter import layout_plan_to_canvas
from app.services.layout_engine.engine import (
    DoesNotFitError,
    _build_program,
    _guard_program_size,
    generate_plan,
    plan_on_plot,
)
from app.services.planning import EngineProgram, ProgramGraph, from_requirements
from app.services.planning.graph_scoring import score_graph_satisfaction
from app.services.planning.program_completion import ensure_corridor, ensure_entry
from app.services.quality.scorer import score

# Hard violations always rank worse than any valid candidate (a large fixed
# floor), but +10 per violation still ranks "less broken" above "more
# broken" for diagnostics — matches the doc's own energy() pseudocode.
_HARD_VIOLATION_FLOOR = 1000.0
_HARD_VIOLATION_STEP = 10.0
_GRAPH_WEIGHT = 2.0

# Phase 5.2 annealing schedule: geometric cooling from a temperature scaled
# to a typical single-swap energy delta (energy() lives in [0, ~3] for valid
# plans) down toward zero over the iteration budget.
_ANNEAL_INITIAL_TEMP = 0.5
_ANNEAL_COOLING = 0.95


@dataclasses.dataclass(frozen=True)
class Candidate:
    plan: LayoutPlan
    energy: float
    seed: int


def energy(plan: LayoutPlan, spec: RequirementsSpec, graph: ProgramGraph) -> float:
    """Lower is better. ``include_vastu`` stays False here deliberately —
    Vastu is an explicit product opt-in the caller decides, not something
    the search process should weight candidates by on its own."""
    report = score(plan, spec, include_vastu=False)
    if report.hard_violations:
        return _HARD_VIOLATION_FLOOR + _HARD_VIOLATION_STEP * len(report.hard_violations)
    satisfaction = score_graph_satisfaction(graph, layout_plan_to_canvas(plan))
    return (1 - report.score / 100) + _GRAPH_WEIGHT * (1 - satisfaction.score)


def _shuffled(program: EngineProgram, rng: random.Random) -> EngineProgram:
    needs = list(program.needs)
    rng.shuffle(needs)
    return dataclasses.replace(program, needs=needs)


def _swap_neighbor(program: EngineProgram, rng: random.Random) -> EngineProgram:
    needs = list(program.needs)
    if len(needs) < 2:
        return program
    i, j = rng.sample(range(len(needs)), 2)
    needs[i], needs[j] = needs[j], needs[i]
    return dataclasses.replace(program, needs=needs)


def _anneal(
    start: Candidate,
    start_program: EngineProgram,
    spec: RequirementsSpec,
    plot_w: float,
    plot_d: float,
    facing: str,
    graph: ProgramGraph,
    *,
    iterations: int,
    seed: int,
) -> Candidate:
    """Phase 5.2: simulated-annealing local search around ``start``'s room
    order. Deterministic for a fixed seed. Never returns anything worse
    than ``start`` — ``best`` is tracked separately from ``current``, which
    is allowed to wander to a worse state to escape local optima."""
    rng = random.Random(seed)
    current_program, current, best = start_program, start, start
    temp = _ANNEAL_INITIAL_TEMP
    for _ in range(max(0, iterations)):
        neighbor_program = _swap_neighbor(current_program, rng)
        try:
            plan = plan_on_plot(spec, neighbor_program, plot_w, plot_d, facing)
        except DoesNotFitError:
            temp *= _ANNEAL_COOLING
            continue
        neighbor = Candidate(plan=plan, energy=energy(plan, spec, graph), seed=seed)
        delta = neighbor.energy - current.energy
        if delta < 0 or rng.random() < math.exp(-delta / max(temp, 1e-9)):
            current_program, current = neighbor_program, neighbor
            if current.energy < best.energy:
                best = current
        temp *= _ANNEAL_COOLING
    return best


def generate_candidates(
    spec: RequirementsSpec, *, n: int = 64, seed: int = 0, anneal_iterations: int = 0
) -> list[Candidate]:
    """Deterministic: the same ``spec`` + ``seed`` + ``anneal_iterations``
    always produces the same ranked candidate list, ranked lowest-energy
    (best) first. The first candidate is always the plain single-shot
    ordering (identical to what ``generate_plan(spec)`` itself would
    produce); the rest are seeded shuffles of it, deduplicated by room
    order so a program too small to have distinct permutations doesn't pad
    the list with repeats. Raises the last ``DoesNotFitError`` seen only if
    literally every attempt failed — a program that fits under most
    orderings but not all still returns its valid candidates.

    ``anneal_iterations`` (Phase 5.2, default 0/off): when set, runs a
    simulated-annealing local search (see ``_anneal``) starting from the
    best-of-n winner and replaces it only if annealing found something
    strictly better — best-of-n's own ranking is never made worse."""
    plot_w = spec.plot.width_m or DEFAULT_PLOT_WIDTH_M
    plot_d = spec.plot.depth_m or DEFAULT_PLOT_DEPTH_M
    facing = spec.facing or DEFAULT_FACING

    # `_guard_program_size` first, before any graph is built, on both branches
    # below: building the scoring graph before it would pay the full
    # node-explosion cost of an oversized program the guard exists to refuse
    # cheaply (a polygon-boundary spec can carry just as large a `spec.spaces`
    # list as a rectangular one, so the boundary branch needs the same
    # ordering, not just the `_build_program` branch).
    _guard_program_size(spec)

    if spec.plot.boundary is not None:
        # `plan_from_program` is the RECT pipeline (see its own docstring):
        # fed a polygon-boundary spec it silently places the program on a
        # `width_m x depth_m` rectangle — the default 9x12 when the spec only
        # carries a boundary — producing a layout for a plot the caller never
        # asked for. There is also no archetype/band structure to permute an
        # ordering over on that path, so one honest candidate from the
        # engine's own polygon pipeline is the whole search space.
        if n <= 0:
            return []
        graph = ensure_corridor(ensure_entry(from_requirements(spec)))
        plan = generate_plan(spec)
        return [Candidate(plan=plan, energy=energy(plan, spec, graph), seed=seed)]

    base_program = _build_program(spec)
    graph = ensure_corridor(ensure_entry(from_requirements(spec)))

    rng = random.Random(seed)
    scored: list[tuple[Candidate, EngineProgram]] = []
    last_error: DoesNotFitError | None = None
    seen_orders: set[tuple[str, ...]] = set()
    for i in range(max(0, n)):
        program = base_program if i == 0 else _shuffled(base_program, rng)
        order = tuple(need.key for need in program.needs)
        if order in seen_orders:
            continue
        seen_orders.add(order)
        try:
            plan = plan_on_plot(spec, program, plot_w, plot_d, facing)
        except DoesNotFitError as exc:
            last_error = exc
            continue
        candidate = Candidate(plan=plan, energy=energy(plan, spec, graph), seed=seed + i)
        scored.append((candidate, program))

    if not scored and last_error is not None:
        raise last_error
    scored.sort(key=lambda pair: pair[0].energy)

    if anneal_iterations > 0 and scored:
        winner, winner_program = scored[0]
        refined = _anneal(
            winner,
            winner_program,
            spec,
            plot_w,
            plot_d,
            facing,
            graph,
            iterations=anneal_iterations,
            seed=seed,
        )
        if refined.energy < winner.energy:
            scored[0] = (refined, winner_program)
            scored.sort(key=lambda pair: pair[0].energy)

    return [candidate for candidate, _ in scored]


def best_candidate(
    spec: RequirementsSpec, *, n: int = 64, seed: int = 0, anneal_iterations: int = 0
) -> LayoutPlan:
    # Polygon subdivision has its own proven geometry path and no band/order
    # search surface yet. Never discard the supplied boundary by treating its
    # bounding box as a rectangular search plot.
    if spec.plot.boundary is not None or spec.floors > 1:
        return generate_plan(spec)
    candidates = generate_candidates(spec, n=n, seed=seed, anneal_iterations=anneal_iterations)
    if not candidates:
        raise DoesNotFitError("no candidate could be generated")
    return candidates[0].plan
