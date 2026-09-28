"""Exports for other tools, all from one building model (model.py):

  dxf  AutoCAD, BricsCAD, DraftSight, LibreCAD (2D, millimetres, AIA layers)
  ifc  Revit, ArchiCAD, Vectorworks, Allplan (IFC4 BIM: walls, doors,
       windows, slabs, rooms with areas)
  glb  Blender, Rhino, 3ds Max, SketchUp, Unity/Unreal, the web (3D)
  obj  the same 3D model as OBJ + MTL (zipped), for older 3D tools
  svg  Illustrator, Inkscape, Figma, presentations (2D vector)
"""
from app.services.export.dxf_export import layout_to_dxf
from app.services.export.ifc_export import layout_to_ifc
from app.services.export.mesh_export import layout_to_glb, layout_to_obj_zip
from app.services.export.render import layout_to_svg

# format -> (writer, file extension, media type)
EXPORTERS = {
    "dxf": (layout_to_dxf, "dxf", "image/vnd.dxf"),
    "ifc": (layout_to_ifc, "ifc", "application/x-step"),
    "glb": (layout_to_glb, "glb", "model/gltf-binary"),
    "obj": (layout_to_obj_zip, "zip", "application/zip"),
    "svg": (lambda plan, title=None: layout_to_svg(plan, title).encode("utf-8"), "svg", "image/svg+xml"),
}

__all__ = ["EXPORTERS", "layout_to_dxf", "layout_to_glb", "layout_to_ifc", "layout_to_obj_zip", "layout_to_svg"]
