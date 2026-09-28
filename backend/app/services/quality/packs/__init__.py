"""Rule-pack registry and deterministic activation."""

from app.services.quality.hard_constraints import RESIDENTIAL_BUILDINGS
from app.schemas.layout_plan import LayoutPlan
from app.schemas.requirements import RequirementsSpec
from app.services.quality.packs.base import RulePack
from app.services.quality.packs.domain import (
    consultation_privacy_rule,
    meeting_access_rule,
    repeat_unit_uniformity_rule,
)
from app.services.quality.soft_rules import (
    SoftRuleResult,
    adjacency_rule,
    bath_kitchen_rule,
    floor_area_balance_rule,
    natural_light_rule,
    privacy_rule,
    wet_stack_rule,
    proportion_rule,
)
from app.services.quality.vastu import evaluate_vastu

_HEALTHCARE_TYPES = {"consultation_room", "exam_room", "treatment_room", "waiting_room"}
_WORKPLACE_TYPES = {"meeting_room", "conference_room", "open_workspace", "coworking_area"}
_HOSPITALITY_EDU_TYPES = {"classroom", "hotel_room", "guest_room"}


def _types(plan: LayoutPlan) -> set[str]:
    return {room.type for room in plan.rooms}


def _generic(plan: LayoutPlan, requirements: RequirementsSpec) -> list[SoftRuleResult]:
    results = [
        adjacency_rule(plan, requirements),
        natural_light_rule(plan, requirements),
        proportion_rule(plan, requirements),
    ]
    if requirements.floors > 1:
        results.extend([
            wet_stack_rule(plan, requirements),
            floor_area_balance_rule(plan, requirements),
        ])
    return results


def _residential(plan: LayoutPlan, requirements: RequirementsSpec) -> list[SoftRuleResult]:
    return [
        privacy_rule(plan, requirements),
        bath_kitchen_rule(plan, requirements),
    ]


def _healthcare(plan: LayoutPlan, requirements: RequirementsSpec) -> list[SoftRuleResult]:
    return [consultation_privacy_rule(plan, requirements)]


def _workplace(plan: LayoutPlan, requirements: RequirementsSpec) -> list[SoftRuleResult]:
    return [meeting_access_rule(plan, requirements)]


def _hospitality_edu(plan: LayoutPlan, requirements: RequirementsSpec) -> list[SoftRuleResult]:
    return [repeat_unit_uniformity_rule(plan, requirements)]


def _vastu(plan: LayoutPlan, _requirements: RequirementsSpec) -> list[SoftRuleResult]:
    result = evaluate_vastu(plan)
    return [SoftRuleResult(name="vastu", score=result.score, warnings=result.warnings)]


REGISTRY: dict[str, RulePack] = {
    "generic": RulePack(
        key="generic",
        weights={
            "adjacency": 0.35,
            "natural_light": 0.20,
            "proportion": 0.15,
            "wet_stack": 0.10,
            "floor_area_balance": 0.10,
        },
        evaluate=_generic,
        applies_to=lambda _plan, _requirements: True,
    ),
    "residential": RulePack(
        key="residential",
        weights={"privacy": 0.20, "bath_kitchen": 0.15},
        evaluate=_residential,
        applies_to=lambda _plan, requirements: (
            requirements.building_type.value in RESIDENTIAL_BUILDINGS
        ),
    ),
    "healthcare": RulePack(
        key="healthcare",
        weights={"consultation_privacy": 0.20},
        evaluate=_healthcare,
        applies_to=lambda plan, requirements: (
            requirements.building_type.value == "clinic"
            or bool(_types(plan) & _HEALTHCARE_TYPES)
        ),
    ),
    "workplace": RulePack(
        key="workplace",
        weights={"meeting_access": 0.20},
        evaluate=_workplace,
        applies_to=lambda plan, requirements: (
            requirements.building_type.value == "office"
            or bool(_types(plan) & _WORKPLACE_TYPES)
        ),
    ),
    "hospitality_edu": RulePack(
        key="hospitality_edu",
        weights={"repeat_unit_uniformity": 0.20},
        evaluate=_hospitality_edu,
        applies_to=lambda plan, _requirements: bool(
            _types(plan) & _HOSPITALITY_EDU_TYPES
        ),
    ),
    "vastu": RulePack(
        key="vastu",
        weights={"vastu": 0.10},
        evaluate=_vastu,
        applies_to=lambda _plan, _requirements: True,
    ),
}


def active_rule_packs(
    plan: LayoutPlan,
    requirements: RequirementsSpec,
    *,
    include_vastu: bool,
) -> list[RulePack]:
    if requirements.rule_packs is not None:
        keys = list(dict.fromkeys(requirements.rule_packs))
    else:
        keys = [
            key
            for key in ("generic", "residential", "healthcare", "workplace", "hospitality_edu")
            if REGISTRY[key].applies_to(plan, requirements)
        ]

    if not include_vastu:
        keys = [key for key in keys if key != "vastu"]
    elif "vastu" not in keys:
        keys.append("vastu")
    return [REGISTRY[key] for key in keys]
