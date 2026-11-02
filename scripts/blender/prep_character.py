"""Turn a raw Hyper3D Rodin character GLB into a game-ready mesh.

Rodin exports are dense (110k-600k triangles), normalised to roughly 1.9 units tall, and
oriented arbitrarily. This decimates, rescales to the character's canon height, drops the
feet on the ground with the pivot centred, and faces the model down Blender -Y so the glTF
exporter lands it facing +Z (toward the default camera).

Set the inputs, then exec:

    SRC = "/abs/path/base_basic_pbr.glb"   # .glb or .fbx
    NAME = "doraemon"
    TARGET_HEIGHT = 1.29
    TARGET_TRIS = 40000
    YAW_DEGREES = 0          # extra spin if the import does not face -Y
    KEEP_OBJECT = None       # e.g. "model_LOD2" when the file ships an LOD ladder
    DIFFUSE_OVERRIDE = None  # absolute path to replace the base colour image
    exec(open("scripts/blender/prep_character.py").read())
"""

import math

import bpy
from mathutils import Vector

src = globals()["SRC"]
name = globals()["NAME"]
target_height = globals().get("TARGET_HEIGHT", 1.4)
target_tris = globals().get("TARGET_TRIS", 40000)
yaw_degrees = globals().get("YAW_DEGREES", 0.0)
keep_object = globals().get("KEEP_OBJECT")
diffuse_override = globals().get("DIFFUSE_OVERRIDE")

COLLECTION = "CHARS"


def get_collection():
    coll = bpy.data.collections.get(COLLECTION)
    if coll is None:
        coll = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(coll)
    return coll


def drop_existing(coll):
    for obj in list(coll.objects):
        if obj.name == name or obj.name.startswith(f"{name}."):
            bpy.data.objects.remove(obj, do_unlink=True)


def imported_names(before):
    """Names, not object references: removing an object invalidates any Python handle to it."""
    return [o.name for o in bpy.context.scene.objects if o.name not in before]


coll = get_collection()
drop_existing(coll)

before = {o.name for o in bpy.context.scene.objects}
if src.lower().endswith(".fbx"):
    bpy.ops.import_scene.fbx(filepath=src)
else:
    bpy.ops.import_scene.gltf(filepath=src)
new_names = imported_names(before)
meshes = [bpy.data.objects[n] for n in new_names if bpy.data.objects[n].type == "MESH"]
if not meshes:
    raise RuntimeError(f"{src} contained no mesh")

# Rodin FBX exports can carry a whole LOD ladder; take the requested rung and bin the rest
# so no decimation is needed.
if keep_object:
    if keep_object not in [o.name for o in meshes]:
        raise RuntimeError(f"{keep_object} not in {[o.name for o in meshes]}")
    for extra_name in [o.name for o in meshes if o.name != keep_object]:
        bpy.data.objects.remove(bpy.data.objects[extra_name], do_unlink=True)
        new_names.remove(extra_name)
    meshes = [bpy.data.objects[keep_object]]

# Collapse to one object so the rest of the pipeline (and Mixamo) sees a single mesh.
bpy.ops.object.select_all(action="DESELECT")
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active

# Drop empties and other leftovers from the import.
kept = obj.name
for extra_name in new_names:
    if extra_name != kept and extra_name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[extra_name], do_unlink=True)

obj.name = name
obj.data.name = name
for other in obj.users_collection:
    other.objects.unlink(obj)
coll.objects.link(obj)

# Flatten the import's own transform before measuring anything.
bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

if yaw_degrees:
    obj.rotation_euler[2] += math.radians(yaw_degrees)
    bpy.ops.object.transform_apply(rotation=True)

tris_before = len(obj.data.loop_triangles) or sum(len(p.vertices) - 2 for p in obj.data.polygons)
if tris_before > target_tris:
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target_tris / tris_before
    bpy.ops.object.modifier_apply(modifier=mod.name)

# Uniform scale to the canon height, then sit the feet on z = 0 with the pivot centred.
corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
height = max(c.z for c in corners) - min(c.z for c in corners)
if height <= 0:
    raise RuntimeError(f"{name} has zero height")
obj.scale = (target_height / height,) * 3
bpy.ops.object.transform_apply(scale=True)

corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
centre_x = (max(c.x for c in corners) + min(c.x for c in corners)) / 2
centre_y = (max(c.y for c in corners) + min(c.y for c in corners)) / 2
bpy.context.scene.cursor.location = (centre_x, centre_y, min(c.z for c in corners))
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
obj.location = (0.0, 0.0, 0.0)
bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)

if diffuse_override:
    image = bpy.data.images.load(diffuse_override, check_existing=True)
    image.colorspace_settings.name = "sRGB"
    replaced = 0
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        # Compare node identity by name: Blender hands out a fresh Python wrapper on every
        # attribute access, so `is` between two RNA structs is never reliable.
        link = next((l for l in mat.node_tree.links if l.to_node.name == bsdf.name
                     and l.to_socket.name == "Base Color"), None)
        node = link.from_node if link else None
        # The base colour may run through a mix or gamma node before the BSDF.
        while node is not None and node.type != "TEX_IMAGE":
            upstream = next((l for l in mat.node_tree.links if l.to_node.name == node.name), None)
            node = upstream.from_node if upstream else None
        if node is not None:
            node.image = image
            replaced += 1
    print(f"{name}: base colour replaced on {replaced} material(s)")

obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
obj.data.update()

tris_after = sum(len(p.vertices) - 2 for p in obj.data.polygons)
dims = obj.dimensions
print(f"{name}: {tris_before} -> {tris_after} tris, dims {dims.x:.2f} x {dims.y:.2f} x {dims.z:.2f}")
