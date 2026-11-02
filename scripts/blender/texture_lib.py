"""Shared texture helpers for the procedural builders (exec'd by env_helpers.py).

- `tiled_material(key, rgba, roughness, tile, metres, strength)` builds a material whose
  albedo tile is multiplied by the palette colour (exported as baseColorTexture ×
  baseColorFactor) with a derived normal map.
- `world_uvs(obj, metres)` projects box UVs from world coordinates along each face's
  dominant axis, so tiles run continuously across every part of a built structure without
  any manual unwrapping.

Tiles come from scripts/make-textures.py in assets/raw/textures/.
"""

import bpy
from mathutils import Vector

TEXTURE_DIR = "/Users/khoale/Devs/khoale/nobita-house-3d/assets/raw/textures"

# palette colour name -> (tile, metres per repeat, normal strength)
TILES = {
    # house
    "stucco": ("tile-stucco", 2.2, 0.55), "stucco_shadow": ("tile-stucco", 2.2, 0.55),
    "tile": ("tile-asphalt", 1.0, 0.35), "tile_ridge": ("tile-asphalt", 1.0, 0.35),
    "fascia": ("tile-wood", 1.2, 0.5), "soffit": ("tile-wood", 1.2, 0.5),
    "wood_shutter": ("tile-wood", 1.2, 0.7), "wood_door": ("tile-wood", 1.2, 0.7),
    # environment
    "concrete": ("tile-concrete", 1.8, 0.75), "concrete_dark": ("tile-concrete", 1.8, 0.75),
    "paving": ("tile-concrete", 1.8, 0.6), "stone": ("tile-concrete", 1.8, 0.5),
    "pole_concrete": ("tile-concrete", 1.8, 0.6),
    "asphalt": ("tile-asphalt", 3.0, 0.7),
    "dirt": ("tile-concrete", 2.6, 0.45),
    "board": ("tile-wood", 1.2, 0.6),
    # Half a lot per repeat: the tile's soft drifts would visibly repeat at a shorter span.
    "grass": ("tile-grass", 7.5, 0.2),
    "wood": ("tile-wood", 1.2, 0.7), "shed_wall": ("tile-wood", 1.2, 0.7),
    # The yard's air-conditioner unit and water heater: baked enamel on pressed steel.
    "appliance": ("tile-enamel", 0.5, 0.15),
}


def _image(nt, path, colorspace):
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(path, check_existing=True)
    node.image.colorspace_settings.name = colorspace
    return node


def tiled_material(key, rgba, roughness, tile, metres, strength):
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    albedo = _image(nt, f"{TEXTURE_DIR}/{tile}-albedo.jpg", "sRGB")
    tint = nt.nodes.new("ShaderNodeRGB")
    tint.outputs[0].default_value = rgba
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(albedo.outputs["Color"], mix.inputs[6])
    nt.links.new(tint.outputs[0], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    normal = _image(nt, f"{TEXTURE_DIR}/{tile}-normal.png", "Non-Color")
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = strength
    nt.links.new(normal.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    mat["tile_metres"] = metres
    return mat


def world_uvs(obj, metres):
    """Box-project UVs from world space; each face uses the two axes orthogonal to its normal."""
    mesh = obj.data
    if not mesh.polygons:
        return
    uv = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
    matrix = obj.matrix_world
    normal_matrix = matrix.to_3x3().inverted().transposed()
    for poly in mesh.polygons:
        n = (normal_matrix @ poly.normal)
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop_index in poly.loop_indices:
            co = matrix @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if az >= ax and az >= ay:
                u, v = co.x, co.y
            elif ax >= ay:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            uv.data[loop_index].uv = (u / metres, v / metres)


def apply_world_uvs(objects):
    """UV every mesh whose material carries a tile; run after all geometry edits."""
    for obj in objects:
        if obj.type != "MESH" or not obj.material_slots:
            continue
        mat = obj.material_slots[0].material
        if mat is None or "tile_metres" not in mat:
            continue
        world_uvs(obj, float(mat["tile_metres"]))
