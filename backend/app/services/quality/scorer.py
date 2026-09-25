"""Canonical hard-filter plus rule-pack soft-quality scorer."""

from app.config.mvp_defaults import INVALID_QUALITY_SCORE_CAP
from app.schemas.layout_plan import LayoutPlan
from app.schemas.quality_report import QualityReport, QualityWarning
from app.schemas.requirements import RequirementsSpec
from app.services.quality.hard_constraints import validate
from app.services.quality.packs import active_rule_packs
from app.services.quality.soft_rules import SoftRuleResult

_RESULT_ORDER = {
    "adjacency": 0,
    "privacy": 1,
    "natural_light": 2,
    "bath_kitchen": 3,
    "consultation_privacy": 4,
    "meeting_access": 5,
    "repeat_unit_uniformity": 6,
    "wet_stack": 7,
    "floor_area_balance": 8,
    "vastu": 9,
    "proportion": 10,
}


def _deduplicate_warnings(warnings: list[QualityWarning]) -> list[QualityWarning]:
    seen: set[tuple[str, str]] = set()
    result: list[QualityWarning] = []
    for warning in warnings:
        key = (warning.code, warning.message)
        if key in seen:
            continue
        seen.add(key)
        result.append(warning)
    return result


def score(
    plan: LayoutPlan,
    requirements: RequirementsSpec,
    *,
    include_vastu: bool = False,
) -> QualityReport:
    """Return a deterministic 0..100 report; invalid plans stay visibly invalid."""

    violations = validate(plan, requirements)
    evaluated: list[tuple[SoftRuleResult, float, str]] = []
    for pack in active_rule_packs(
        plan,
        requirements,
        include_vastu=include_vastu,
    ):
        for result in pack.evaluate(plan, requirements):
            evaluated.append((result, pack.weights[result.name], pack.key))
    evaluated.sort(key=lambda item: _RESULT_ORDER.get(item[0].name, 100))

    weighted_total = sum(weight for _result, weight, _pack_key in evaluated)
    weighted_score = sum(
        weight * result.score for result, weight, _pack_key in evaluated
    )
    raw_score = round(100 * weighted_score / weighted_total) if weighted_total else 100
    final_score = min(raw_score, INVALID_QUALITY_SCORE_CAP) if violations else raw_score
    warnings = _deduplicate_warnings(
        [
            warning.model_copy(update={"rule": pack_key})
            for result, _weight, pack_key in evaluated
            for warning in result.warnings
        ]
    )
    return QualityReport(
        score=max(0, min(100, final_score)),
        hard_violations=violations,
        warnings=warnings,
    )
