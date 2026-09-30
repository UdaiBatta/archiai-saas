"""Furniture sizes and the free floor each piece needs.

Dimensions and clearances follow common residential ergonomics (typical
furniture sizes and the usual rules of thumb for getting into a bed, opening
a wardrobe, pulling out a chair, working at a counter or using a WC); they
are sensible defaults, not a citation of any particular standard.

Every piece is described in its own frame: ``w`` along the wall it backs onto,
``d`` away from it. Clearances are strips of free floor on each side:
``front`` (away from the wall), ``back``, ``left`` and ``right`` (along the
long sides of a bed, for example). ``h`` is only used for the window rule: a
piece taller than the sill must not stand in front of a window.
"""
from __future__ import annotations

from dataclasses import dataclass

WINDOW_SILL_M = 0.9  # same sill the editor draws windows at
WINDOW_ZONE_M = 0.6  # depth in front of a window a tall piece must keep clear


@dataclass(frozen=True)
class Spec:
    kind: str
    w: float
    d: float
    h: float
    front: float = 0.0
    back: float = 0.0
    left: float = 0.0
    right: float = 0.0
    wall: bool = True  # back against a solid wall; False = free-standing
    prefer: str = "centre"  # "centre" of a wall, a "corner", or the room centre
    avoid_window: bool = False  # soft: rather not under a window


@dataclass(frozen=True)
class Slot:
    """One thing a room should get: alternatives tried in order (the first
    that fits wins), plus the warning when none fits."""

    options: tuple[Spec, ...]
    missing: str
    # A piece placed in front of the previous one (coffee table before sofa).
    companion: Spec | None = None
    companion_gap: float = 0.0


# Beds: 0.6 m to get in on both long sides and at the foot. A single bed may
# go into a corner with one long side against the wall.
DOUBLE_BED = Spec("double_bed", 1.6, 2.0, 0.55, front=0.6, left=0.6, right=0.6, avoid_window=True)
SINGLE_BED = Spec("single_bed", 0.9, 2.0, 0.55, front=0.6, left=0.6, right=0.6, avoid_window=True)
SINGLE_BED_CORNER_L = Spec("single_bed", 0.9, 2.0, 0.55, front=0.6, left=0.6, prefer="corner", avoid_window=True)
SINGLE_BED_CORNER_R = Spec("single_bed", 0.9, 2.0, 0.55, front=0.6, right=0.6, prefer="corner", avoid_window=True)
BED = Slot((DOUBLE_BED, SINGLE_BED, SINGLE_BED_CORNER_L, SINGLE_BED_CORNER_R), "no room for a bed with 0.6 m to the side")
SINGLE = Slot((SINGLE_BED, SINGLE_BED_CORNER_L, SINGLE_BED_CORNER_R), "no room for a bed with 0.6 m to the side")

# Wardrobe: 0.6 deep, 0.9 m in front to open the doors and stand.
WARDROBE = Slot(
    tuple(Spec("wardrobe", w, 0.6, 2.1, front=0.9, prefer="corner") for w in (1.8, 1.5, 1.2)),
    "no room for a wardrobe with 0.9 m in front",
)

# Sofa with 0.4 m of leg room to a coffee table, 0.6 m to walk past that.
SOFA = Slot(
    (Spec("sofa", 2.0, 0.9, 0.8, front=0.4), Spec("sofa", 1.6, 0.85, 0.8, front=0.4)),
    "no room for a sofa",
    companion=Spec("coffee_table", 1.0, 0.5, 0.4, front=0.6, wall=False),
    companion_gap=0.4,
)

# Dining table sized to its seats, 0.9 m all round to pull out a chair.
DINING = Slot(
    (
        Spec("dining_table_6", 1.8, 0.9, 0.75, 0.9, 0.9, 0.9, 0.9, wall=False),
        Spec("dining_table_4", 1.2, 0.8, 0.75, 0.9, 0.9, 0.9, 0.9, wall=False),
    ),
    "no room for a dining table with 0.9 m around",
)

# Counter run along one wall, 0.6 deep, 1.2 m in front (1.0 m at least).
# Worktop height is at the sill, so it may run under a window.
COUNTER = Slot(
    tuple(
        Spec("kitchen_counter", length, 0.6, 0.9, front=front, prefer="corner")
        for length in (3.6, 3.0, 2.4, 1.8)
        for front in (1.2, 1.0)
    ),
    "no room for a kitchen counter with 1.0 m in front",
)

# Bathroom: WC 0.4 x 0.7 with 0.6 m in front and 0.2 m elbow room each side;
# basin; 0.9 x 0.9 shower tray in a corner.
WC = Slot((Spec("wc", 0.4, 0.7, 0.8, front=0.6, left=0.2, right=0.2),), "no room for a WC with 0.6 m in front")
BASIN = Slot((Spec("basin", 0.5, 0.4, 0.85, front=0.6),), "no room for a basin with 0.6 m in front")
SHOWER = Slot((Spec("shower", 0.9, 0.9, 2.0, front=0.6, prefer="corner"),), "no room for a 0.9 m shower")

# Desk 1.2 x 0.6 with 0.9 m behind the user for the chair.
DESK = Slot((Spec("desk", 1.2, 0.6, 0.75, front=0.9),), "no room for a desk with 0.9 m behind the chair")


def program_for(room_type: str) -> tuple[Slot, ...]:
    """What a room of this type gets, most important first. Unknown types
    (corridors, stairs, stores, commercial spaces) get nothing."""
    t = room_type.lower()
    if t == "open_plan_living":
        return (SOFA, DINING, COUNTER)
    if "bed" in t:
        return (BED, WARDROBE) if "kid" not in t else (SINGLE, WARDROBE)
    if "bath" in t or t in ("ensuite", "en_suite"):
        return (WC, BASIN, SHOWER)
    if "toilet" in t or t in ("wc", "powder_room"):
        return (WC, BASIN)
    if "kitchen" in t:
        return (COUNTER,)
    if "dining" in t:
        return (DINING,)
    if "living" in t or t in ("lounge", "family_room", "drawing_room"):
        return (SOFA,)
    if t in ("study", "office", "home_office"):
        return (DESK,)
    return ()
