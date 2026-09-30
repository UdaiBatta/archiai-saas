"""LayoutPlan -> 3D meshes: GLB (glTF 2.0 binary) and OBJ (zipped with its
.mtl), for Blender, Rhino, 3ds Max, SketchUp, Unity/Unreal and the web.

Same building as the IFC export: walls as their solid stretches plus the
pieces below windows and above doors and windows (so openings are real
holes), and a floor slab per room coloured by room type. Metres, Y up,
x east, z south (the app's own 3D view).
"""
from __future__ import annotations

import io
import zipfile

import numpy as np
import shapely
import trimesh
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

from app.config.mvp_defaults import WALL_HEIGHT_M
from app.schemas.layout_plan import LayoutPlan
from app.services.export.model import DOOR_HEIGHT_M, SLAB_THICKNESS_M, WINDOW_HEAD_M, WINDOW_SILL_M, Building, building_from_plan

_WALL_RGBA = (226, 225, 215, 255)
_FLOOR_RGBA = {
    "living_room": (122, 51, 37, 255), "dining": (122, 51, 37, 255), "dining_room": (122, 51, 37, 255),
    "entry": (138, 74, 54, 255), "balcony": (138, 74, 54, 255),
    "kitchen": (134, 87, 60, 255),
    "bedroom": (79, 73, 70, 255), "master_bedroom": (90, 82, 77, 255),
    "bathroom": (71, 77, 81, 255), "toilet": (71, 77, 81, 255),
    "corridor": (62, 57, 54, 255), "hallway": (62, 57, 54, 255),
}
_DEFAULT_FLOOR_RGBA = (94, 80, 73, 255)
_DOOR_RGBA = (126, 78, 43, 255)
_WINDOW_RGBA = (91, 143, 176, 180)


def _box(center: tuple[float, float, float], extents: tuple[float, float, float], angle: float, rgba) -> trimesh.Trimesh:
    """A box whose local X runs along the wall (rotated `angle` about Y)."""
    transform = trimesh.transformations.rotation_matrix(angle, (0, 1, 0))
    transform[:3, 3] = center
    mesh = trimesh.creation.box(extents=extents, transform=transform)
    mesh.visual.face_colors = rgba
    return mesh


def _slab(polygon: Polygon, bottom: float, thickness: float, rgba) -> trimesh.Trimesh:
    """A floor slab from a room outline (any simple polygon): shapely's
    constrained triangulation for the top and bottom, quads for the sides.
    Plan (x, y) -> scene (x, height, y). Faces are wound outward here, so
    no normal repair (which would need scipy/networkx) is needed."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    top = bottom + thickness
    for tri in shapely.constrained_delaunay_triangles(polygon).geoms:
        # Clockwise in plan (x, y) is counter-clockwise seen from +Y in the
        # scene (x, up, y), i.e. an upward-facing top.
        (ax, ay), (bx, by), (cx, cy) = list(orient(tri, sign=-1.0).exterior.coords)[:3]
        i = len(vertices)
        vertices += [(ax, top, ay), (bx, top, by), (cx, top, cy), (ax, bottom, ay), (bx, bottom, by), (cx, bottom, cy)]
        faces += [(i, i + 1, i + 2), (i + 3, i + 5, i + 4)]
    ring = list(orient(polygon, sign=-1.0).exterior.coords)
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        i = len(vertices)
        vertices += [(ax, top, ay), (bx, top, by), (bx, bottom, by), (ax, bottom, ay)]
        faces += [(i, i + 2, i + 1), (i, i + 3, i + 2)]
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    mesh.visual.face_colors = rgba
    return mesh


def building_meshes(building: Building) -> dict[str, trimesh.Trimesh]:
    meshes: dict[str, trimesh.Trimesh] = {}
    for wall in building.walls:
        base = building.elevation(wall.floor)
        length = wall.length or 1.0
        ux, uz = (wall.x2 - wall.x1) / length, (wall.y2 - wall.y1) / length
        angle = -np.arctan2(uz, ux)  # plan y is scene z; rotate X onto the wall
        pieces: list[tuple[float, float, float, float]] = [
            (start, end, 0.0, WALL_HEIGHT_M) for start, end in wall.solid_spans()
        ]
        for opening in wall.openings:
            if opening.sill > 0:
                pieces.append((opening.start, opening.end, 0.0, opening.sill))
            if opening.head < WALL_HEIGHT_M:
                pieces.append((opening.start, opening.end, opening.head, WALL_HEIGHT_M))
        for index, (start, end, bottom, top) in enumerate(pieces):
            if end - start <= 1e-3 or top - bottom <= 1e-3:
                continue
            mid = (start + end) / 2
            x, z = wall.x1 + ux * mid, wall.y1 + uz * mid
            meshes[f"{wall.id}-{index}"] = _box(
                (x, base + (bottom + top) / 2, z), (end - start, top - bottom, wall.thickness), angle, _WALL_RGBA
            )
        for opening in wall.openings:
            mid = (opening.start + opening.end) / 2
            x, z = wall.x1 + ux * mid, wall.y1 + uz * mid
            sill, head = opening.sill, opening.head
            meshes[f"{opening.kind}-{opening.id}"] = _box(
                (x, base + (sill + head) / 2, z),
                (opening.width, head - sill, max(wall.thickness * 0.25, 0.03)),
                angle,
                _DOOR_RGBA if opening.kind == "door" else _WINDOW_RGBA,
            )
    for room in building.rooms:
        polygon = Polygon(room.points)
        if not polygon.is_valid or polygon.area <= 0:
            continue
        meshes[f"floor-{room.id}"] = _slab(
            polygon, building.elevation(room.floor) - SLAB_THICKNESS_M, SLAB_THICKNESS_M,
            _FLOOR_RGBA.get(room.type, _DEFAULT_FLOOR_RGBA),
        )
    return meshes


def _scene(plan: LayoutPlan) -> trimesh.Scene:
    scene = trimesh.Scene(building_meshes(building_from_plan(plan)))
    # Colours as one material per colour (identical colours share one), not
    # per-face colours: OBJ keeps them in its .mtl, glTF as PBR base colours,
    # and trimesh needs no scipy to turn face colours into vertex colours.
    materials: dict[tuple, trimesh.visual.material.SimpleMaterial] = {}
    for mesh in scene.geometry.values():
        rgba = tuple(int(c) for c in mesh.visual.face_colors[0])
        if rgba not in materials:
            materials[rgba] = trimesh.visual.material.SimpleMaterial(
                diffuse=rgba, name=f"colour_{len(materials) + 1}"
            )
        mesh.visual = trimesh.visual.TextureVisuals(material=materials[rgba])
    return scene


def layout_to_glb(plan: LayoutPlan, title: str | None = None) -> bytes:
    # Viewers compute normals themselves; trimesh would need scipy to.
    return _scene(plan).export(file_type="glb", include_normals=False)


def layout_to_obj_zip(plan: LayoutPlan, title: str | None = None) -> bytes:
    """OBJ keeps colours in a separate .mtl, so both go in one zip."""
    scene = _scene(plan)
    text, files = trimesh.exchange.obj.export_obj(scene, include_texture=True, return_texture=True, mtl_name="plan.mtl")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("plan.obj", text)
        for name, data in files.items():
            archive.writestr(name, data)
    return buffer.getvalue()
