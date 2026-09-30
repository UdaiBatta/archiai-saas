"""LayoutPlan -> IFC4 (the open BIM format Revit, ArchiCAD, Vectorworks,
Allplan and BricsCAD BIM import).

Real building elements, not lines: Project > Site > Building > one storey
per floor; walls as solids with openings cut through them, doors and windows
filling those openings; each room an IfcSpace with its name and a
Qto_SpaceBaseQuantities NetFloorArea (Revit maps these to Rooms); a floor
slab under each room. Metres; north is +Y.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import ifcopenshell
import ifcopenshell.api
import ifcopenshell.api.aggregate
import ifcopenshell.api.context
import ifcopenshell.api.feature
import ifcopenshell.api.geometry
import ifcopenshell.api.project
import ifcopenshell.api.pset
import ifcopenshell.api.root
import ifcopenshell.api.spatial
import ifcopenshell.api.unit
import numpy as np
from ifcopenshell.util.shape_builder import ShapeBuilder

from app.config.mvp_defaults import WALL_HEIGHT_M
from app.schemas.layout_plan import LayoutPlan
from app.services.export.model import SLAB_THICKNESS_M, Building, WallGeom, building_from_plan

api = ifcopenshell.api


def _matrix(origin: tuple[float, float, float], x_axis: tuple[float, float] = (1.0, 0.0)) -> np.ndarray:
    """Placement: local X along `x_axis` (in plan), Z up."""
    ux, uy = x_axis
    m = np.eye(4)
    m[:3, 0] = (ux, uy, 0.0)
    m[:3, 1] = (-uy, ux, 0.0)
    m[:3, 3] = origin
    return m


def _wall_axis(wall: WallGeom, building: Building):
    ax, ay = building.north_up(wall.x1, wall.y1)
    bx, by = building.north_up(wall.x2, wall.y2)
    length = wall.length or 1.0
    ux, uy = (bx - ax) / length, (by - ay) / length
    return (ax, ay), (ux, uy)


def layout_to_ifc(plan: LayoutPlan, title: str | None = None) -> bytes:
    building = building_from_plan(plan)
    f = api.project.create_file(version="IFC4")
    project = api.root.create_entity(f, ifc_class="IfcProject", name=title or "ArchiAI plan")
    units = [api.unit.add_si_unit(f, unit_type=kind) for kind in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
    api.unit.assign_unit(f, units=units)
    model = api.context.add_context(f, context_type="Model")
    body = api.context.add_context(
        f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model
    )
    builder = ShapeBuilder(f)

    site = api.root.create_entity(f, ifc_class="IfcSite", name="Site")
    ifc_building = api.root.create_entity(f, ifc_class="IfcBuilding", name=title or "Building")
    api.aggregate.assign_object(f, relating_object=project, products=[site])
    api.aggregate.assign_object(f, relating_object=site, products=[ifc_building])

    storeys = {}
    for floor in building.floors:
        storey = api.root.create_entity(
            f, ifc_class="IfcBuildingStorey", name="Ground floor" if floor == 0 else f"Floor {floor}"
        )
        storey.Elevation = building.elevation(floor)
        api.geometry.edit_object_placement(f, product=storey, matrix=_matrix((0.0, 0.0, building.elevation(floor))))
        api.aggregate.assign_object(f, relating_object=ifc_building, products=[storey])
        storeys[floor] = storey

    for wall in building.walls:
        storey = storeys[wall.floor]
        z = building.elevation(wall.floor)
        (ax, ay), (ux, uy) = _wall_axis(wall, building)
        nx, ny = -uy, ux
        half = wall.thickness / 2
        ifc_wall = api.root.create_entity(f, ifc_class="IfcWall", name="Exterior wall" if wall.exterior else "Interior wall")
        rep = api.geometry.add_wall_representation(
            f, context=body, length=wall.length, height=WALL_HEIGHT_M, thickness=wall.thickness
        )
        api.geometry.assign_representation(f, product=ifc_wall, representation=rep)
        # The profile runs 0..thickness across; shift by half so the wall is
        # centred on its line, as in the plan.
        api.geometry.edit_object_placement(
            f, product=ifc_wall, matrix=_matrix((ax - nx * half, ay - ny * half, z), (ux, uy))
        )
        api.spatial.assign_container(f, relating_structure=storey, products=[ifc_wall])

        for opening in wall.openings:
            px, py = ax + ux * opening.start, ay + uy * opening.start
            depth = wall.thickness + 0.1  # cut cleanly through both faces
            void = api.root.create_entity(f, ifc_class="IfcOpeningElement", name=f"Opening {opening.id}")
            void_rep = api.geometry.add_wall_representation(
                f, context=body, length=opening.width, height=opening.head - opening.sill, thickness=depth
            )
            api.geometry.assign_representation(f, product=void, representation=void_rep)
            api.geometry.edit_object_placement(
                f, product=void, matrix=_matrix((px - nx * depth / 2, py - ny * depth / 2, z + opening.sill), (ux, uy))
            )
            api.feature.add_feature(f, feature=void, element=ifc_wall)

            is_door = opening.kind == "door"
            filler = api.root.create_entity(
                f, ifc_class="IfcDoor" if is_door else "IfcWindow",
                name=("Door " if is_door else "Window ") + opening.id,
                predefined_type="DOOR" if is_door else "WINDOW",
            )
            filler.OverallWidth = opening.width
            filler.OverallHeight = opening.head - opening.sill
            leaf = 0.05  # a thin panel in the middle of the wall
            filler_rep = api.geometry.add_wall_representation(
                f, context=body, length=opening.width, height=opening.head - opening.sill, thickness=leaf
            )
            api.geometry.assign_representation(f, product=filler, representation=filler_rep)
            api.geometry.edit_object_placement(
                f, product=filler, matrix=_matrix((px - nx * leaf / 2, py - ny * leaf / 2, z + opening.sill), (ux, uy))
            )
            api.feature.add_filling(f, opening=void, element=filler)
            api.spatial.assign_container(f, relating_structure=storey, products=[filler])

    for room in building.rooms:
        storey = storeys[room.floor]
        z = building.elevation(room.floor)
        points = [building.north_up(x, y) for x, y in room.points]
        space = api.root.create_entity(f, ifc_class="IfcSpace", name=room.label)
        space.LongName = room.type.replace("_", " ")
        profile = builder.profile(builder.polyline(points, closed=True))
        space_rep = builder.get_representation(body, [builder.extrude(profile, magnitude=WALL_HEIGHT_M)])
        api.geometry.assign_representation(f, product=space, representation=space_rep)
        api.geometry.edit_object_placement(f, product=space, matrix=_matrix((0.0, 0.0, z)))
        api.aggregate.assign_object(f, relating_object=storey, products=[space])
        qto = api.pset.add_qto(f, product=space, name="Qto_SpaceBaseQuantities")
        api.pset.edit_qto(f, qto=qto, properties={"NetFloorArea": round(room.area, 3), "Height": WALL_HEIGHT_M})

        slab = api.root.create_entity(f, ifc_class="IfcSlab", name=f"Floor - {room.label}", predefined_type="FLOOR")
        slab_profile = builder.profile(builder.polyline(points, closed=True))
        slab_rep = builder.get_representation(body, [builder.extrude(slab_profile, magnitude=SLAB_THICKNESS_M)])
        api.geometry.assign_representation(f, product=slab, representation=slab_rep)
        api.geometry.edit_object_placement(f, product=slab, matrix=_matrix((0.0, 0.0, z - SLAB_THICKNESS_M)))
        api.spatial.assign_container(f, relating_structure=storey, products=[slab])

    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "plan.ifc"
        f.write(str(path))
        return path.read_bytes()
