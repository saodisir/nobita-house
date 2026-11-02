"""Export one Blender collection, or a named set of objects, to GLB with the settings this
project expects.

Set COLLECTION (or OBJECTS) and OUT_PATH before exec()-ing, e.g.

    COLLECTION = "ENV"; OUT_PATH = "/abs/path/public/models/environment.glb"
    exec(open("scripts/blender/export_glb.py").read())

    OBJECTS = ["doraemon", "doraemon_rig"]; OUT_PATH = ".../assets/raw/final/characters/doraemon.glb"
    exec(open("scripts/blender/export_glb.py").read())
"""

import bpy

collection_name = globals().get("COLLECTION", "ENV")
object_names = globals().get("OBJECTS")
out_path = globals().get("OUT_PATH")
if not out_path:
    raise ValueError("Set OUT_PATH before running export_glb.py")

# Select only the targets so the export ignores everything else in the file.
bpy.ops.object.select_all(action="DESELECT")
if object_names:
    targets = [bpy.data.objects[name] for name in object_names]
else:
    targets = list(bpy.data.collections[collection_name].all_objects)
for obj in targets:
    obj.select_set(True)
bpy.context.view_layer.objects.active = targets[0] if targets else None

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,            # bake modifiers
    export_animations=True,
    export_skins=True,
    export_morph=False,
    export_texture_dir="",
    export_image_format="AUTO",
    export_draco_mesh_compression_enable=False,
)
print(f"exported {object_names or collection_name} -> {out_path}")
