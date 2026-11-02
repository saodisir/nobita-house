"""Export one prepared character as a Mixamo-ready FBX: the mesh alone, nothing else.

Through the Blender MCP connection:

    CHAR_ID = "dekisugi"
    exec(open(f"{ROOT_DIR}/scripts/blender/export_mixamo_in.py").read())

Headless, from the repo root:

    /Applications/Blender.app/Contents/MacOS/Blender -b --python-expr \
      "CHAR_ID='dekisugi'; exec(open('scripts/blender/export_mixamo_in.py').read())"

Reads `assets/raw/final/characters/<id>.glb` — the prepped mesh, which since 2026-09-12 also
carries the hand-built `welcome`/`walk` armature — and writes `assets/raw/mixamo-in/<id>.fbx`
holding the mesh and nothing else.

That "nothing else" is the whole point: Adobe's auto-rigger fails on a file with a second
armature, an empty, a camera or a light in it, so this strips the rig, the modifiers, the
vertex groups and every action, and empties the scene first (a headless Blender starts with a
cube, a camera and a light).
"""

import os

import bpy
from mathutils import Vector

char_id = globals()["CHAR_ID"]
ROOT_DIR = globals().get("ROOT_DIR", os.getcwd())
SRC = f"{ROOT_DIR}/assets/raw/final/characters/{char_id}.glb"
OUT_DIR = f"{ROOT_DIR}/assets/raw/mixamo-in"
OUT = f"{OUT_DIR}/{char_id}.fbx"

if not os.path.exists(SRC):
    raise RuntimeError(f"{SRC} missing — run prep_character.py for {char_id} first")

# Empty scene: the startup cube/camera/light would ride along and fail the auto-rigger.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
for block in (bpy.data.armatures, bpy.data.actions):
    for item in list(block):
        block.remove(item)

bpy.ops.import_scene.gltf(filepath=SRC)
meshes = sorted(
    (o for o in bpy.context.scene.objects if o.type == "MESH"),
    key=lambda o: len(o.data.vertices),
    reverse=True,
)
if not meshes:
    raise RuntimeError(f"{char_id}: no mesh in {SRC}")
mesh_obj = meshes[0]

# Keep the body, drop the armature, the bone shape the importer brings along, and any empty.
for other in list(bpy.context.scene.objects):
    if other.name != mesh_obj.name:
        bpy.data.objects.remove(other, do_unlink=True)

mesh_obj.parent = None
for modifier in list(mesh_obj.modifiers):
    mesh_obj.modifiers.remove(modifier)
mesh_obj.vertex_groups.clear()
if mesh_obj.animation_data:
    mesh_obj.animation_data_clear()
mesh_obj.name = char_id
mesh_obj.data.name = char_id
if mesh_obj.data.shape_keys:
    mesh_obj.shape_key_clear()

bpy.ops.object.select_all(action="DESELECT")
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = mesh_obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# The glTF importer rotates +Y-up content to Blender's Z-up, so the mesh arrives standing;
# prep_character.py already put the feet on z = 0 with the pivot centred. Assert it rather
# than trust it: a character that lands lying down or a metre in the air rigs badly, and
# Mixamo gives no clue why.
corners = [mesh_obj.matrix_world @ Vector(c) for c in mesh_obj.bound_box]
low = min(c.z for c in corners)
height = max(c.z for c in corners) - low
width = max(c.x for c in corners) - min(c.x for c in corners)
depth = max(c.y for c in corners) - min(c.y for c in corners)
if height < 1.0 or height > 2.0:
    raise RuntimeError(f"{char_id}: height {height:.2f} m is not a standing character")
if height < width or height < depth:
    raise RuntimeError(f"{char_id}: not upright ({width:.2f} x {depth:.2f} x {height:.2f})")
if abs(low) > 0.01:
    raise RuntimeError(f"{char_id}: feet at z = {low:.3f}, expected 0")

os.makedirs(OUT_DIR, exist_ok=True)
bpy.ops.export_scene.fbx(
    filepath=OUT,
    use_selection=True,
    object_types={"MESH"},
    # Mixamo shows the texture in the rig preview and hands it back with the skin, so keep it
    # inside the FBX instead of relying on a sidecar path.
    path_mode="COPY",
    embed_textures=True,
    add_leaf_bones=False,
    bake_anim=False,
    mesh_smooth_type="FACE",
)

tris = sum(len(p.vertices) - 2 for p in mesh_obj.data.polygons)
size = os.path.getsize(OUT) / 1024 / 1024
objects = [o.name for o in bpy.context.scene.objects]
print(
    f"{char_id}: {OUT} ({size:.1f} MB), {tris} tris, "
    f"{width:.2f} x {depth:.2f} x {height:.2f} m, scene holds {objects}"
)
