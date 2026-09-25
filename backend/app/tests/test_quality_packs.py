"""Engine-generalization Phase 6 rule-pack registry."""

from pathlib import Path

import pytest

from app.schemas.layout_plan import Door, LayoutPlan, PlanPlot, PlanRoom, Wall
from app.schemas.requirements import RequirementsSpec
from app.services.layout_engine import generate_plan
from app.services.quality.packs import active_rule_packs
from app.services.quality.packs.domain import (
    consultation_privacy_rule,
    meeting_access_rule,
    repeat_unit_uniformity_rule,
)
from app.services.quality.scorer import score

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"


def _load(name: str) -> RequirementsSpec:
    return RequirementsSpec.model_validate_json(
        (FIXTURES / f"{name}.json").read_text(encoding="utf-8")
    )


def _room(
    room_id: str,
    room_type: str,
    x: float,
    y: float,
    w: float = 3,
    h: float = 3,
) -> PlanRoom:
    return PlanRoom(
        id=room_id,
        type=room_type,
        label=room_type.replace("_", " ").title(),
        x=x,
        y=y,
        w=w,
        h=h,
    )


@pytest.mark.parametrize(
    ("name", "expected_score"),
    [
        ("1bhk", 100),
        ("2bhk", 100),
        ("3bhk_adjacencies", 91),  # was 72: stacked wet core + footprint; 90->91 squarer rooms (proportion rule)
        # Stronger sanitary circulation changed this layout: all three baths
        # now open to the corridor instead of one relying on a bedroom route.
        ("4bhk", 93),  # was 87: stacked wet core; 92->93 squarer rooms (proportion rule)
    ],
)
def test_residential_scores_are_unchanged_from_the_pre_pack_baseline(
    name: str,
    expected_score: int,
):
    spec = _load(name)
    assert score(generate_plan(spec), spec).score == expected_score


def test_clinic_uses_generic_and_healthcare_without_residential_or_vastu():
    spec = _load("clinic")
    plan = generate_plan(spec)

    keys = [
        pack.key
        for pack in active_rule_packs(plan, spec, include_vastu=False)
    ]
    report = score(plan, spec)

    assert keys == ["generic", "healthcare"]
    # 98, not 100: the proportion rule reports its 1.6 x 11.1 m utility room.
    assert report.score == 98
    assert all(warning.rule not in {"residential", "vastu"} for warning in report.warnings)
    assert not any("bath_kitchen" in warning.code for warning in report.warnings)


def test_healthcare_pack_flags_consultation_directly_on_waiting_area():
    waiting = _room("w", "waiting_room", 0, 0)
    consultation = _room("c", "consultation_room", 3, 0)
    plan = LayoutPlan(
        plot=PlanPlot(width_m=6, depth_m=3),
        rooms=[waiting, consultation],
        walls=[Wall(id="shared", x1=3, y1=0, x2=3, y2=3)],
        doors=[Door(id="door", wall_ref="shared", offset=1)],
    )
    spec = RequirementsSpec.model_validate({
        "building_type": "clinic",
        "spaces": [
            {"space_type": "waiting_room", "count": 1},
            {"space_type": "consultation_room", "count": 1},
        ],
        "rule_packs": ["healthcare"],
    })

    result = consultation_privacy_rule(plan, spec)
    report = score(plan, spec)

    assert result.score == 0
    assert result.warnings
    assert report.warnings[0].rule == "healthcare"


def test_workplace_pack_flags_meeting_room_disconnected_from_workspace():
    plan = LayoutPlan(
        plot=PlanPlot(width_m=9, depth_m=3),
        rooms=[
            _room("workspace", "open_workspace", 0, 0),
            _room("meeting", "meeting_room", 6, 0),
        ],
    )

    result = meeting_access_rule(plan, RequirementsSpec(building_type="office"))

    assert result.score == 0
    assert result.warnings[0].code == "workplace.meeting_access"


def test_hospitality_education_pack_flags_uneven_repeat_units():
    plan = LayoutPlan(
        plot=PlanPlot(width_m=12, depth_m=6),
        rooms=[
            _room("c1", "classroom", 0, 0, 3, 3),
            _room("c2", "classroom", 3, 0, 3, 3),
            _room("c3", "classroom", 6, 0, 6, 3),
        ],
    )

    result = repeat_unit_uniformity_rule(plan, RequirementsSpec())

    assert result.score < 1
    assert result.warnings[0].code == "hospitality_edu.repeat_unit_uniformity"


def test_explicit_pack_override_wins_and_vastu_remains_opt_in():
    plan = LayoutPlan(plot=PlanPlot(width_m=3, depth_m=3), rooms=[])
    workplace = RequirementsSpec(rule_packs=["workplace"])
    vastu = RequirementsSpec(rule_packs=["vastu"])

    assert [
        pack.key
        for pack in active_rule_packs(plan, workplace, include_vastu=False)
    ] == ["workplace"]
    assert active_rule_packs(plan, vastu, include_vastu=False) == []
    assert [
        pack.key
        for pack in active_rule_packs(plan, vastu, include_vastu=True)
    ] == ["vastu"]
