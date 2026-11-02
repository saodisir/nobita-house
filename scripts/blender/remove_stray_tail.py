"""Delete the second, off-centre tail Rodin keeps growing on Doraemon, and patch the hole.

Headless, from the repo root, on a raw Rodin sculpt:

    /Applications/Blender.app/Contents/MacOS/Blender -b --python-expr \
      "SRC='assets/raw/rodin/doraemon3/base_basic_pbr.fbx'; \
       OUT='assets/raw/rodin/doraemon3/base_notail.fbx'; \
       exec(open('scripts/blender/remove_stray_tail.py').read())"

Optional globals: `RENDER_DIR = "/tmp"` writes before/after renders, and `MIN_FACES` (default
20) is the smallest red blob counted as a tail. Without `SRC` the file only defines
`remove_stray_tail()`, which is how `mixamo_merge.py` uses it on the rigged mesh.

Both Rodin Doraemon sculpts of 2026-09-13 came back with two red tails: the canon one on the
spine line and a larger one on the left flank. Both are fused into the body, not loose parts.
The tails are found by texture colour instead of by hand. Each face samples the diffuse at
its UV centre, and faces that are strongly red relative to green and blue are grouped into
connected blobs. That catches the collar, mouth and nose as well, but only the tails sit
behind the body at hip height.

Nothing is cut unless there is exactly one tail on the spine line and exactly one off it. All
thresholds are fractions of the mesh's own height, measured from its feet and its centre line,
so the same numbers hold in the raw Rodin frame and in Mixamo's. The face must look down −Y,
which both frames share.
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Vector

# Fractions of height. Behind the body (+Y) by more than BEHIND, at hip height, and more than
# OFF_CENTRE (stray) or less than ON_CENTRE (canon) from the centre line. Measured on the
# 1.9-unit sculpt: stray at x −0.435, z 0.43; canon at x 0, y +0.46, z 0.46.
BEHIND = 0.05
TAIL_Z = (0.16, 0.37)
OFF_CENTRE = 0.10
ON_CENTRE = 0.05


def _base_colour_image(obj):
    material = obj.material_slots[0].material
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    return next(
        (
            link.from_node.image
            for link in material.node_tree.links
            if link.to_node.name == bsdf.name and link.to_socket.name == "Base Color"
        ),
        None,
    )


def remove_stray_tail(obj, diffuse=None, min_faces=20):
    """Cut the off-centre tail out of `obj` in place. Returns the number of faces removed.

    `diffuse` is an image path for meshes whose material has no base colour linked (Mixamo
    hands Doraemon back with only Rodin's baked `shaded.png`, on Emission). Vertices created
    to close the hole take the average skin weights of the hole's rim, so a rigged mesh keeps
    deforming as one surface.
    """
    image = bpy.data.images.load(diffuse, check_existing=True) if diffuse else _base_colour_image(obj)
    if image is None:
        raise RuntimeError(f"{obj.name}: no base colour to find the tails by")
    width, height_px = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height_px, width, 4)

    matrix = obj.matrix_world
    points = [matrix @ v.co for v in obj.data.vertices]
    floor = min(p.z for p in points)
    size = max(p.z for p in points) - floor
    centre_x = (min(p.x for p in points) + max(p.x for p in points)) / 2
    centre_y = (min(p.y for p in points) + max(p.y for p in points)) / 2

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    deform = bm.verts.layers.deform.active
    colours = np.zeros((len(bm.faces), 3), dtype=np.float32)
    # Relative to the feet and the centre line, in fractions of height.
    places = np.zeros((len(bm.faces), 3), dtype=np.float32)
    for face in bm.faces:
        u = sum(loop[uv].uv.x for loop in face.loops) / len(face.loops)
        v = sum(loop[uv].uv.y for loop in face.loops) / len(face.loops)
        x = min(width - 1, max(0, int((u % 1.0) * width)))
        y = min(height_px - 1, max(0, int((v % 1.0) * height_px)))
        colours[face.index] = pixels[y, x, :3]
        c = matrix @ face.calc_center_median()
        places[face.index] = ((c.x - centre_x) / size, (c.y - centre_y) / size, (c.z - floor) / size)

    # Relative redness, not an absolute threshold: the tails are darker than the collar.
    red = set(
        np.nonzero(
            (colours[:, 0] > 1.5 * colours[:, 1]) & (colours[:, 0] > 1.5 * colours[:, 2]) & (colours[:, 0] > 0.05)
        )[0].tolist()
    )
    blobs, seen = [], set()
    for start in red:
        if start in seen:
            continue
        stack, blob = [start], []
        seen.add(start)
        while stack:
            index = stack.pop()
            blob.append(index)
            for edge in bm.faces[index].edges:
                for neighbour in edge.link_faces:
                    if neighbour.index in red and neighbour.index not in seen:
                        seen.add(neighbour.index)
                        stack.append(neighbour.index)
        blobs.append(blob)

    def centre(blob):
        return places[blob].mean(axis=0)

    def at_tail_height(blob):
        c = centre(blob)
        return len(blob) >= min_faces and c[1] > BEHIND and TAIL_Z[0] < c[2] < TAIL_Z[1]

    stray = [b for b in blobs if at_tail_height(b) and abs(centre(b)[0]) > OFF_CENTRE]
    canon = [b for b in blobs if at_tail_height(b) and abs(centre(b)[0]) < ON_CENTRE]

    def describe(found):
        return [(len(b), [round(float(a), 3) for a in centre(b)]) for b in found]

    print(f"{obj.name}: stray tail {describe(stray)}, canon tail {describe(canon)} (fractions of height)")
    if len(stray) != 1 or len(canon) != 1:
        bm.free()
        raise RuntimeError(f"{obj.name}: expected exactly one off-centre tail and one centre tail")

    # One ring past the red lip, so the patch closes on clean body skin.
    doomed = {bm.faces[i] for i in stray[0]}
    doomed |= {g for f in list(doomed) for v in f.verts for g in v.link_faces}
    if doomed & {bm.faces[i] for i in canon[0]}:
        bm.free()
        raise RuntimeError(f"{obj.name}: the stray tail's ring reaches the canon tail")

    # A blue body texel beside the hole: every face of the patch samples this one UV.
    donor = None
    for face in doomed:
        for vert in face.verts:
            for loop in vert.link_loops:
                c = colours[loop.face.index]
                if loop.face not in doomed and c[2] > c[0] and c[2] > 0.5:
                    donor = loop[uv].uv.copy()
                    break
            if donor:
                break
        if donor:
            break
    if donor is None:
        bm.free()
        raise RuntimeError(f"{obj.name}: no blue body texel next to the hole")

    bmesh.ops.delete(bm, geom=list(doomed), context="FACES")
    boundary = [e for e in bm.edges if e.is_boundary]
    rim_verts = {v for e in boundary for v in e.verts}
    # The rim's average skin, normalised: what every new vertex of the patch will follow.
    rim_weights = {}
    if deform is not None:
        for vert in rim_verts:
            for group, weight in vert[deform].items():
                rim_weights[group] = rim_weights.get(group, 0.0) + weight
        total = sum(rim_weights.values()) or 1.0
        rim_weights = {g: w / total for g, w in rim_weights.items()}

    lid = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)["faces"]
    lid = bmesh.ops.triangulate(bm, faces=lid)["faces"]
    # Holes_fill spans the opening with long triangles; cut them so smoothing can round the lid.
    inner = list({e for f in lid for e in f.edges if not e.is_boundary})
    cut = bmesh.ops.subdivide_edges(bm, edges=inner, cuts=2, use_grid_fill=True)
    patch = {v for f in lid if f.is_valid for v in f.verts}
    patch |= {g for g in cut["geom_inner"] if isinstance(g, bmesh.types.BMVert)}
    new_verts = [v for v in patch if v.is_valid and v not in rim_verts]
    for _ in range(25):
        bmesh.ops.smooth_vert(bm, verts=new_verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    if deform is not None:
        for vert in new_verts:
            skin = vert[deform]
            skin.clear()
            for group, weight in rim_weights.items():
                skin[group] = weight
    patched = 0
    for face in {f for v in patch if v.is_valid for f in v.link_faces}:
        face.smooth = True
        if all(v in patch for v in face.verts):
            for loop in face.loops:
                loop[uv].uv = donor
            patched += 1
    removed = len(doomed)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    print(f"{obj.name}: removed {removed} faces, patched {patched}, donor uv {tuple(round(a, 4) for a in donor)}")
    return removed


def _render(tag, render_dir):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.light = "STUDIO"
    scene.render.resolution_x = scene.render.resolution_y = 420
    cam = bpy.data.objects.new("tail_cam", bpy.data.cameras.new("tail_cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.0
    for name, az, el in (("back", 180, 0), ("side", 90, 0), ("back34", 145, 15)):
        r = 8
        cam.location = (
            r * math.sin(math.radians(az)) * math.cos(math.radians(el)),
            -r * math.cos(math.radians(az)) * math.cos(math.radians(el)),
            0.95 + r * math.sin(math.radians(el)),
        )
        cam.rotation_euler = (math.radians(90 - el), 0, math.radians(az))
        scene.render.filepath = os.path.join(render_dir, f"tail-{tag}-{name}.png")
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


if "SRC" in globals():
    src = globals()["SRC"]
    out = globals()["OUT"]
    render_dir = globals().get("RENDER_DIR")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=src)
    meshes = sorted((o for o in bpy.context.scene.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices), reverse=True)
    if not meshes:
        raise RuntimeError(f"{src}: no mesh")
    target = meshes[0]
    for other in [o for o in bpy.context.scene.objects if o.name != target.name]:
        bpy.data.objects.remove(other, do_unlink=True)
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    if render_dir:
        _render("before", render_dir)
    try:
        remove_stray_tail(target, min_faces=globals().get("MIN_FACES", 20))
    except RuntimeError as error:
        raise SystemExit(f"ABORT: {error}")
    if render_dir:
        _render("after", render_dir)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=out,
        use_selection=True,
        object_types={"MESH"},
        path_mode="COPY",
        embed_textures=True,
        add_leaf_bones=False,
        bake_anim=False,
    )
    print(f"saved {out}")
