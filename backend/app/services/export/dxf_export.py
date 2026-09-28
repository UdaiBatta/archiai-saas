"""LayoutPlan -> DXF (AutoCAD 2013 format, millimetres).

AutoCAD opens DXF directly (and can save it as DWG); so do BricsCAD,
DraftSight, LibreCAD, Revit (as a CAD link) and most CAD tools. Standard
AIA/NCS layer names so a CAD user's layer tools work as usual:

  A-WALL       walls, drawn as their two faces with gaps at openings
  A-DOOR       door leaves and swing arcs
  A-GLAZ       window glazing lines
  A-AREA-IDEN  room name and area
  A-ANNO-TITL  storey titles
  C-PROP-LINE  the plot boundary (ground floor)

North is up. Storeys sit side by side, left to right, each titled.
"""
from __future__ import annotations

import io
from math import atan2, degrees

import ezdxf
from ezdxf.enums import TextEntityAlignment

from app.schemas.layout_plan import LayoutPlan
from app.services.export.model import Building, WallGeom, building_from_plan

MM = 1000.0
_STOREY_GAP_M = 5.0
_LAYERS = {
    "A-WALL": 7,        # white/black
    "A-DOOR": 1,        # red
    "A-GLAZ": 4,        # cyan
    "A-AREA-IDEN": 3,   # green
    "A-ANNO-TITL": 2,   # yellow
    "C-PROP-LINE": 6,   # magenta
}


def _storey_name(floor: int) -> str:
    return "Ground floor" if floor == 0 else f"Floor {floor}"


def _wall_frame(wall: WallGeom, building: Building, dx: float):
    """Unit direction and left-normal of the wall in drawing space (mm)."""
    ax, ay = building.north_up(wall.x1, wall.y1)
    bx, by = building.north_up(wall.x2, wall.y2)
    length = wall.length or 1.0
    ux, uy = (bx - ax) / length, (by - ay) / length
    nx, ny = -uy, ux

    def at(along: float, across: float = 0.0) -> tuple[float, float]:
        return ((ax + ux * along + nx * across + dx) * MM, (ay + uy * along + ny * across) * MM)

    return at, (ux, uy)


def layout_to_dxf(plan: LayoutPlan, title: str | None = None) -> bytes:
    building = building_from_plan(plan)
    doc = ezdxf.new("R2013", setup=True, units=ezdxf.units.MM)
    doc.header["$MEASUREMENT"] = 1  # metric
    for name, color in _LAYERS.items():
        doc.layers.add(name, color=color)
    msp = doc.modelspace()

    # Storeys side by side, spaced by the house's own outline (not the plot,
    # which includes the yard), each titled just below itself.
    xs = [x for r in building.rooms for x, _ in r.points] or [0.0, building.width]
    ys = [building.north_up(x, y)[1] for r in building.rooms for x, y in r.points] or [0.0]
    house_w = max(xs) - min(xs)
    for index, floor in enumerate(building.floors):
        # The ground floor stays where it sits on the plot; upper storeys
        # line up to the right of the plot boundary.
        dx = 0.0 if index == 0 else (
            building.width + _STOREY_GAP_M - min(xs) + (index - 1) * (house_w + _STOREY_GAP_M)
        )
        label = _storey_name(floor)
        heading = f"{title} - {label}" if title else label
        msp.add_text(heading, height=350, dxfattribs={"layer": "A-ANNO-TITL"}).set_placement(
            ((min(xs) + dx) * MM, (min(ys) - 1.5) * MM)
        )
        if index == 0:
            corners = [building.north_up(x, y) for x, y in
                       ((0, 0), (building.width, 0), (building.width, building.depth), (0, building.depth))]
            msp.add_lwpolyline([(x * MM, y * MM) for x, y in corners], close=True, dxfattribs={"layer": "C-PROP-LINE"})

        for wall in (w for w in building.walls if w.floor == floor):
            at, (ux, uy) = _wall_frame(wall, building, dx)
            half = wall.thickness / 2
            # Each solid stretch as a closed outline: both faces plus the
            # jambs, so openings read as real gaps.
            for start, end in wall.solid_spans():
                msp.add_lwpolyline(
                    [at(start, -half), at(end, -half), at(end, half), at(start, half)],
                    close=True, dxfattribs={"layer": "A-WALL"},
                )
            for opening in wall.openings:
                if opening.kind == "door":
                    # Leaf standing open, hinged at the opening's start, and
                    # the quarter-circle it sweeps.
                    hinge = at(opening.start, half)
                    leaf_end = at(opening.start, half + opening.width)
                    msp.add_line(hinge, leaf_end, dxfattribs={"layer": "A-DOOR"})
                    start_angle = degrees(atan2(uy, ux))
                    msp.add_arc(
                        center=hinge, radius=opening.width * MM,
                        start_angle=start_angle, end_angle=start_angle + 90,
                        dxfattribs={"layer": "A-DOOR"},
                    )
                else:
                    # Glazing: two thin lines in the wall's middle third.
                    for across in (-half / 3, half / 3):
                        msp.add_line(at(opening.start, across), at(opening.end, across), dxfattribs={"layer": "A-GLAZ"})

        for room in (r for r in building.rooms if r.floor == floor):
            cx, cy = building.north_up(*room.centroid)
            msp.add_text(room.label, height=200, dxfattribs={"layer": "A-AREA-IDEN"}).set_placement(
                ((cx + dx) * MM, cy * MM + 150), align=TextEntityAlignment.MIDDLE_CENTER
            )
            msp.add_text(f"{room.area:.1f} m2", height=150, dxfattribs={"layer": "A-AREA-IDEN"}).set_placement(
                ((cx + dx) * MM, cy * MM - 150), align=TextEntityAlignment.MIDDLE_CENTER
            )

    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode("utf-8")
