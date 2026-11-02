"""Material, collection and primitive helpers shared by the three procedural builders.

`env_build.py` (Nobita's lot), `streets_build.py` (the public realm) and
`neighbours_build.py` (the other lots) all load this file, so a colour or a primitive is
defined once for the whole block. `texture_lib.py` is loaded from here too, which is where
`TILES`, `tiled_material` and `apply_world_uvs` come from.

Load with either of the two paths a builder can be started from:

    import os
    SCRIPTS_DIR = globals().get("SCRIPTS_DIR",
                               os.path.dirname(os.path.abspath(__file__))
                               if "__file__" in globals() else ".")
    exec(open(os.path.join(SCRIPTS_DIR, "env_helpers.py")).read())

Coordinates: Blender is Z-up and the glTF exporter maps Blender +Y to glTF -Z. The newer
builders therefore place everything through `P(x, z, y)`, which converts a glTF-space point
straight into Blender space. `env_build.py` predates that and instead negates every object's
Y at the very end; it is the only script that does so.
"""

import math
import os

import bmesh
import bpy
from mathutils import Vector

SCRIPTS_DIR = globals().get(
    "SCRIPTS_DIR",
    os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else ".",
)
exec(open(os.path.join(SCRIPTS_DIR, "texture_lib.py")).read())

COLOURS = {
    # ground and structure
    "grass": (0.34, 0.58, 0.25, 1.0),
    "concrete": (0.74, 0.71, 0.66, 1.0),
    "concrete_dark": (0.60, 0.58, 0.54, 1.0),
    "wood": (0.55, 0.34, 0.16, 1.0),
    "wood_door": (0.42, 0.26, 0.14, 1.0),
    "asphalt": (0.19, 0.20, 0.22, 1.0),
    "paving": (0.70, 0.68, 0.64, 1.0),
    "metal": (0.45, 0.45, 0.47, 1.0),
    "plate": (0.90, 0.89, 0.85, 1.0),
    "mortar": (0.52, 0.50, 0.46, 1.0),
    "stone": (0.78, 0.77, 0.73, 1.0),
    "soil": (0.28, 0.20, 0.13, 1.0),
    # Packed earth of the sandlot: concrete noise under a warm tint reads as trodden dirt.
    "dirt": (0.62, 0.48, 0.32, 1.0),
    # Sandlot: the yellowed board fence and the bamboo bundle from the reference art.
    "board": (0.72, 0.58, 0.32, 1.0),
    "bamboo": (0.76, 0.66, 0.38, 1.0),
    # lot props
    "shed_wall": (0.42, 0.30, 0.18, 1.0),
    "shed_roof": (0.48, 0.16, 0.11, 1.0),
    "postbox": (0.62, 0.14, 0.10, 1.0),
    # The open wrought-iron gate from `assets/home.jpg`: painted near-black navy.
    "iron": (0.025, 0.035, 0.06, 1.0),
    "leaf": (0.24, 0.52, 0.20, 1.0),
    "bark": (0.30, 0.20, 0.12, 1.0),
    "flower_red": (0.75, 0.15, 0.14, 1.0),
    "flower_yellow": (0.88, 0.72, 0.18, 1.0),
    "flower_white": (0.92, 0.91, 0.86, 1.0),
    "appliance": (0.86, 0.87, 0.86, 1.0),
    "laundry_a": (0.90, 0.92, 0.95, 1.0),
    "laundry_b": (0.95, 0.83, 0.78, 1.0),
    "pot": (0.52, 0.30, 0.20, 1.0),
    # street furniture
    "pole_concrete": (0.68, 0.67, 0.64, 1.0),
    "insulator": (0.88, 0.89, 0.87, 1.0),
    "lamp_shade": (0.72, 0.72, 0.70, 1.0),
    # Kept as its own material so the app can drive it emissive after dark.
    "lamp_lens": (0.98, 0.93, 0.78, 1.0),
    "wire": (0.10, 0.10, 0.11, 1.0),
    "road_mark": (0.90, 0.89, 0.84, 1.0),
    "road_mark_dim": (0.80, 0.79, 0.74, 1.0),
    # neighbour houses
    "fascia": (0.88, 0.86, 0.81, 1.0),
    "soffit": (0.82, 0.80, 0.75, 1.0),
    "frame": (0.93, 0.92, 0.90, 1.0),
    "glass": (0.62, 0.74, 0.80, 1.0),
    "interior": (0.14, 0.15, 0.17, 1.0),
    "rail": (0.80, 0.79, 0.76, 1.0),
}


def register_colour(name, rgba):
    """Add a per-lot tint so `add_box(..., name)` can use it like any built-in colour."""
    COLOURS.setdefault(name, rgba)
    return name


def hex_rgba(value):
    """'#F2EEE6' -> linear RGBA, matching what the app's meshStandardMaterial shows."""
    value = value.lstrip("#")
    srgb = [int(value[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (linear[0], linear[1], linear[2], 1.0)


def material(name, rgba=None, roughness=0.85):
    """Cached material named `env_<name>`; tiled when `texture_lib.TILES` covers the name."""
    if rgba is None:
        rgba = COLOURS[name]
    mat = bpy.data.materials.get(f"env_{name}")
    if mat is None and name in TILES:
        return tiled_material(f"env_{name}", rgba, roughness, *TILES[name])
    if mat is None:
        mat = bpy.data.materials.new(f"env_{name}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        if rgba[3] < 1.0:
            # An alpha below 1 asks for blended transparency; the exporter reads this to set
            # the glTF alphaMode, and skipping it ships an opaque pane.
            bsdf.inputs["Alpha"].default_value = rgba[3]
            for attr in ("blend_method", "surface_render_method"):
                try:
                    if attr == "blend_method":
                        mat.blend_method = "BLEND"
                    else:
                        mat.surface_render_method = "BLENDED"
                except AttributeError:
                    pass
        bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def fresh_collection(name):
    """Empty collection `name`, replacing anything left from a previous run."""
    existing = bpy.data.collections.get(name)
    if existing:
        for obj in list(existing.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def add_box(coll, name, size, location, mat_name):
    """Axis-aligned box given as (width_x, depth_y, height_z) centred at location."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = location
    obj.data.materials.append(material(mat_name))
    return obj


def add_cylinder(coll, name, radius, depth, location, mat_name, verts=12, radius_top=None,
                 rot=None):
    """Cylinder (optionally tapered) with its own local origin, so a final Y-flip stays valid."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=radius, radius2=radius_top if radius_top is not None else radius,
                          depth=depth)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = location
    if rot:
        obj.rotation_euler = rot
    obj.data.materials.append(material(mat_name))
    return obj


def add_wire(coll, name, span, location, sag=0.35, radius=0.014, along="x", steps=6):
    """Sagging cable: a low-poly polyline tube in local coords, so a Y-flip stays valid."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    rings = []
    for i in range(steps + 1):
        t = i / steps
        u = -span / 2 + span * t
        z = -sag * 4.0 * t * (1.0 - t)
        if along == "x":
            corners = [(u, -radius, z - radius), (u, radius, z - radius),
                       (u, radius, z + radius), (u, -radius, z + radius)]
        else:
            corners = [(-radius, u, z - radius), (radius, u, z - radius),
                       (radius, u, z + radius), (-radius, u, z + radius)]
        rings.append([bm.verts.new(c) for c in corners])
    for a, b in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = location
    obj.data.materials.append(material("wire"))
    return obj


def add_sphere(coll, name, radius, location, mat_name, subdivisions=1):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=radius)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = location
    obj.data.materials.append(material(mat_name))
    return obj


def add_gable_prism(coll, name, size, location, mat_name):
    """Solid gable volume, ridge along X. The mesh is symmetric in local Y, which keeps it
    valid through a final Y-flip (mesh-internal Y offsets mirror; object locations do not)."""
    w, d, h = size
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    a = bm.verts.new((-w / 2, -d / 2, 0))
    b = bm.verts.new((w / 2, -d / 2, 0))
    c = bm.verts.new((w / 2, d / 2, 0))
    d2 = bm.verts.new((-w / 2, d / 2, 0))
    e = bm.verts.new((-w / 2, 0, h))
    f = bm.verts.new((w / 2, 0, h))
    for face in ((a, b, f, e), (c, d2, e, f), (b, c, f), (d2, a, e), (a, d2, c, b)):
        bm.faces.new(face)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = location
    obj.data.materials.append(material(mat_name))
    return obj


def add_quarter_ring(coll, name, centre, radius, width, height, quadrant, mat_name, segments=8):
    """Kerb arc: the band between `radius` and `radius + width` over one 90° quadrant.

    `quadrant` is the (sx, sy) sign pair pointing at the corner the arc wraps, e.g. (1, -1)
    for the corner that is +X and -Y of `centre`. Built in world coordinates because an arc
    is not symmetric about its own axes; callers already work in Blender space.
    """
    sx, sy = quadrant
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    cx, cy, cz = centre
    rings = []
    for i in range(segments + 1):
        a = (math.pi / 2) * i / segments
        dx, dy = math.cos(a) * sx, math.sin(a) * sy
        inner = (cx + dx * radius, cy + dy * radius)
        outer = (cx + dx * (radius + width), cy + dy * (radius + width))
        rings.append([
            bm.verts.new((inner[0], inner[1], cz)),
            bm.verts.new((outer[0], outer[1], cz)),
            bm.verts.new((outer[0], outer[1], cz + height)),
            bm.verts.new((inner[0], inner[1], cz + height)),
        ])
    for a, b in zip(rings, rings[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(material(mat_name))
    return obj


def add_quarter_disc(coll, name, centre, radius, height, quadrant, mat_name, segments=8):
    """Solid quarter-cylinder: the rounded pavement corner that `add_quarter_ring` kerbs.

    `quadrant` and `centre` match the ring's, so a disc of `radius` and a ring starting at
    `radius` tile the corner with no seam. World coordinates, like the ring.
    """
    sx, sy = quadrant
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    cx, cy, cz = centre
    hub_lo = bm.verts.new((cx, cy, cz))
    hub_hi = bm.verts.new((cx, cy, cz + height))
    rim = []
    for i in range(segments + 1):
        a = (math.pi / 2) * i / segments
        px, py = cx + math.cos(a) * sx * radius, cy + math.sin(a) * sy * radius
        rim.append((bm.verts.new((px, py, cz)), bm.verts.new((px, py, cz + height))))
    for (a_lo, a_hi), (b_lo, b_hi) in zip(rim, rim[1:]):
        bm.faces.new((a_lo, b_lo, b_hi, a_hi))   # outer wall
        bm.faces.new((hub_hi, a_hi, b_hi))       # top fan
        bm.faces.new((hub_lo, b_lo, a_lo))       # bottom fan
    # The two flat sides where the disc meets the straight kerb runs.
    bm.faces.new((hub_lo, rim[0][0], rim[0][1], hub_hi))
    bm.faces.new((hub_lo, hub_hi, rim[-1][1], rim[-1][0]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(material(mat_name))
    return obj
