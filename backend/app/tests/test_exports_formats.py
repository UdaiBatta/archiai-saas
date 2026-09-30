"""Every export is re-read with a real reader for its format, so "opens in
AutoCAD / Revit / Blender" is checked, not assumed."""

import io
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import ezdxf
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.validate
import pytest
import trimesh
from ezdxf import recover
from httpx import AsyncClient

from app.schemas.layout_plan import LayoutPlan
from app.schemas.requirements import RequirementsSpec
from app.services.export import layout_to_dxf, layout_to_glb, layout_to_ifc, layout_to_obj_zip, layout_to_svg
from app.services.export.model import building_from_plan
from app.services.export.mesh_export import building_meshes
from app.services.layout_engine.engine import generate_plan
from app.services.layout_engine.search import best_candidate

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> RequirementsSpec:
    return RequirementsSpec.model_validate_json((FIXTURES / "requirements" / f"{name}.json").read_text(encoding="utf-8"))


def _plans() -> dict[str, LayoutPlan]:
    villa = json.loads((FIXTURES / "golden" / "villa_inland_balcony.json").read_text(encoding="utf-8"))
    return {
        "villa": best_candidate(RequirementsSpec.model_validate(villa["requirements"])),
        "two_storey": best_candidate(_load("template_two_storey_home")),
        "polygon": generate_plan(RequirementsSpec.model_validate({
            "rooms": [{"type": "bedroom", "count": 2}, {"type": "kitchen", "count": 1}, {"type": "living_room", "count": 1}],
            "plot": {"boundary": [{"x": 0, "y": 0}, {"x": 20, "y": 0}, {"x": 20, "y": 14}, {"x": 8, "y": 14}]},
            "facing": "east",
        })),
    }


PLANS = _plans()


@pytest.mark.parametrize("name", PLANS)
def test_dxf_passes_a_cad_audit_in_millimetres_on_standard_layers(name):
    plan = PLANS[name]
    doc, auditor = recover.read(io.BytesIO(layout_to_dxf(plan, title="Test <plan>")))
    assert not auditor.has_errors and not auditor.fixes
    assert doc.units == ezdxf.units.MM
    layers = {entity.dxf.layer for entity in doc.modelspace()}
    assert {"A-WALL", "A-DOOR", "A-AREA-IDEN", "A-ANNO-TITL"} <= layers
    if plan.windows:
        assert "A-GLAZ" in layers
    labels = [e.dxf.text for e in doc.modelspace() if e.dxftype() == "TEXT" and e.dxf.layer == "A-AREA-IDEN"]
    assert {room.label for room in plan.rooms} <= set(labels)


@pytest.mark.parametrize("name", PLANS)
def test_ifc_is_valid_bim_with_every_element_and_buildable_geometry(name, tmp_path):
    plan = PLANS[name]
    path = tmp_path / "plan.ifc"
    path.write_bytes(layout_to_ifc(plan, title="Test"))
    f = ifcopenshell.open(str(path))
    assert f.schema == "IFC4"

    building = building_from_plan(plan)
    assert len(f.by_type("IfcWall")) == len(building.walls)
    assert len(f.by_type("IfcDoor")) == len(plan.doors)
    assert len(f.by_type("IfcWindow")) == len(plan.windows)
    assert len(f.by_type("IfcBuildingStorey")) == len(building.floors)
    # Every room is a space carrying its area as a quantity (Revit room
    # schedules read these). Names can repeat ("Bathroom" twice), so compare
    # the sorted (name, area) pairs.
    def area_of(space):
        qto = next(
            rel.RelatingPropertyDefinition for rel in space.IsDefinedBy
            if rel.RelatingPropertyDefinition.Name == "Qto_SpaceBaseQuantities"
        )
        return next(q.AreaValue for q in qto.Quantities if q.Name == "NetFloorArea")

    exported = sorted((s.Name, area_of(s)) for s in f.by_type("IfcSpace"))
    expected = sorted((room.label, room.area) for room in building.rooms)
    assert [name for name, _ in exported] == [name for name, _ in expected]
    assert [area for _, area in exported] == pytest.approx([area for _, area in expected], abs=0.01)

    settings = ifcopenshell.geom.settings()
    for product in f.by_type("IfcProduct"):
        if product.Representation is not None:
            ifcopenshell.geom.create_shape(settings, product)  # raises if the geometry can't be built

    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, log)
    assert log.statements == []


@pytest.mark.parametrize("name", PLANS)
def test_glb_reloads_as_closed_solids(name):
    scene = trimesh.load(io.BytesIO(layout_to_glb(PLANS[name])), file_type="glb")
    assert scene.geometry
    assert all(mesh.is_watertight for mesh in scene.geometry.values())


def test_obj_ships_with_its_materials():
    archive = zipfile.ZipFile(io.BytesIO(layout_to_obj_zip(PLANS["villa"])))
    assert sorted(archive.namelist()) == ["plan.mtl", "plan.obj"]
    assert "mtllib plan.mtl" in archive.read("plan.obj").decode()
    assert "newmtl" in archive.read("plan.mtl").decode()


def test_mesh_exports_include_opening_elements():
    plan = PLANS["villa"]
    meshes = building_meshes(building_from_plan(plan))
    assert all(f"door-{door.id}" in meshes for door in plan.doors)
    assert all(f"window-{window.id}" in meshes for window in plan.windows)


def test_svg_is_well_formed_and_escapes_names():
    plan = PLANS["villa"]
    renamed = plan.model_copy(update={"rooms": [plan.rooms[0].model_copy(update={"label": "Den <&> Study"}), *plan.rooms[1:]]})
    root = ET.fromstring(layout_to_svg(renamed, title="A & B"))
    texts = [t.text for t in root.iter("{http://www.w3.org/2000/svg}text")]
    assert "Den <&> Study" in texts and "A & B" in texts
    assert "stroke-dasharray=\"5 3\"" in layout_to_svg(plan)


async def _token(client: AsyncClient, email: str) -> str:
    response = await client.post("/api/auth/register", json={"name": "User", "email": email, "password": "password123"})
    return response.json()["access_token"]


async def test_export_endpoint_returns_the_file_for_your_project(client: AsyncClient):
    token = await _token(client, "exporter@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    project = (await client.post("/api/projects", json={"title": "Villa, East plot"}, headers=headers)).json()
    body = {"layout": PLANS["villa"].model_dump(mode="json")}

    for fmt, media, ext in [("dxf", "image/vnd.dxf", "dxf"), ("ifc", "application/x-step", "ifc"),
                            ("glb", "model/gltf-binary", "glb"), ("obj", "application/zip", "zip"),
                            ("svg", "image/svg+xml", "svg")]:
        response = await client.post(f"/api/projects/{project['id']}/export/{fmt}", json=body, headers=headers)
        assert response.status_code == 200, (fmt, response.text[:200])
        assert response.headers["content-type"].startswith(media)
        assert response.headers["content-disposition"] == f'attachment; filename="Villa-East-plot.{ext}"'
        assert response.content

    other = await _token(client, "stranger@example.com")
    refused = await client.post(
        f"/api/projects/{project['id']}/export/dxf", json=body, headers={"Authorization": f"Bearer {other}"}
    )
    assert refused.status_code in (403, 404)
    unknown = await client.post(f"/api/projects/{project['id']}/export/dwg", json=body, headers=headers)
    assert unknown.status_code == 422
