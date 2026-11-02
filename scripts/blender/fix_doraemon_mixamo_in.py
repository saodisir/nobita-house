"""Repair Doraemon's Mixamo-ready FBX: split the fused legs and erase the crease on the head.

Run on a fresh `export_mixamo_in.py` output, once — the leg spread is not idempotent:

    /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/fix_doraemon_mixamo_in.py

- Legs: the Rodin sculpt has the feet fused at the midline and a hair-thin gap between the
  legs, so the auto-rigger binds both legs as one. Each leg is slimmed about its own centre and
  pushed outward below the crotch; the faces bridging the feet are cut and the openings capped.
- Head: a folded, half-open seam on the back-right of the head shows as a dark groove. The seam
  is welded, the fold relaxed onto the head sphere, and the streak it baked into the diffuse and
  normal maps is filled from the surrounding pixels.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector
SRC = globals().get("SRC", "assets/raw/mixamo-in/doraemon.fbx")
OUT = globals().get("OUT", SRC)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=SRC)
obj = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
me = obj.data

# --- legs: slim each leg about its own centre and push it out, hard split below the feet top
LEG_CX, SHIFT, K, EPS = 0.14, 0.02, 0.88, 0.015
Z_SPLIT, Z_FULL, Z_NONE = 0.15, 0.30, 0.42
def smooth(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
side = {}
for v in me.vertices:
    x, z = v.co.x, v.co.z
    w = 1 - smooth((z - Z_FULL) / (Z_NONE - Z_FULL))
    if w <= 0: continue
    s = (1.0 if x >= 0 else -1.0) if z < Z_SPLIT else math.tanh(x / EPS)
    if z < Z_SPLIT: side[v.index] = s
    nx = s * (LEG_CX + SHIFT) + (x - s * LEG_CX) * K
    v.co.x = x + (nx - x) * w

bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
bridge = [f for f in bm.faces
          if all(v.index in side for v in f.verts)
          and len({side[v.index] for v in f.verts}) == 2]
print("bridge faces", len(bridge))
bmesh.ops.delete(bm, geom=bridge, context="FACES_ONLY")
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")
# Close the inner foot openings the cut left (only boundary loops inside the foot band).
bm.edges.ensure_lookup_table()
holes = [e for e in bm.edges if e.is_boundary
         and all(v.co.z < Z_SPLIT + 0.01 and abs(v.co.x) < 0.09 for v in e.verts)]
filled = bmesh.ops.holes_fill(bm, edges=holes, sides=0)
print("hole edges", len(holes), "fill faces", len(filled["faces"]))

# --- head: weld the open seam, unfold the creased triangles, then sit them on the head sphere
C = Vector((-0.001, 0.006, 0.901)); P = Vector((0.284, 0.257, 0.898))
R_CORE, R_BLEND = 0.06, 0.085
ring = [(v.co - C).length for v in bm.verts if 0.09 < (v.co - P).length < 0.12]
r_local = sum(ring) / len(ring)
region = [v for v in bm.verts if (v.co - P).length < R_BLEND]
bmesh.ops.remove_doubles(bm, verts=region, dist=0.012)
bm.verts.ensure_lookup_table()
core = [v for v in bm.verts if (v.co - P).length < R_CORE]
for _ in range(30):
    new = {}
    for v in core:
        nb = [e.other_vert(v).co for e in v.link_edges]
        if nb:
            new[v] = sum(nb, Vector()) / len(nb)
    for v, co in new.items():
        v.co = C + (co - C).normalized() * r_local
blend = [v for v in bm.verts if R_CORE <= (v.co - P).length < R_BLEND]
for v in blend:
    w = 1 - smooth(((v.co - P).length - R_CORE) / (R_BLEND - R_CORE))
    r = (v.co - C).length
    v.co = C + (v.co - C).normalized() * (r + (r_local - r) * w)
bm.normal_update()
flipped = [f for f in bm.faces if (f.calc_center_median() - P).length < R_BLEND
           and f.normal.dot((f.calc_center_median() - C).normalized()) < 0]
print("head core", len(core), "blend", len(blend), "flipped after relax", len(flipped), "r_local", round(r_local, 4))
bmesh.ops.delete(bm, geom=flipped, context="FACES_ONLY")
bm.edges.ensure_lookup_table()
gap = [e for e in bm.edges if e.is_boundary and (e.verts[0].co - P).length < R_BLEND]
patch = bmesh.ops.holes_fill(bm, edges=gap, sides=0)["faces"]
bmesh.ops.triangulate(bm, faces=patch)
bm.normal_update()
for f in [f for f in bm.faces if (f.calc_center_median() - P).length < R_BLEND]:
    if f.normal.dot((f.calc_center_median() - C).normalized()) < 0:
        f.normal_flip()
print("head hole edges", len(gap), "patched")
bm.edges.ensure_lookup_table()
sliver = list({v for e in bm.edges if e.is_boundary and (e.verts[0].co - P).length < R_BLEND for v in e.verts})
bmesh.ops.remove_doubles(bm, verts=sliver, dist=0.02)
bm.edges.ensure_lookup_table()
left = [e for e in bm.edges if e.is_boundary and (e.verts[0].co - P).length < R_BLEND]
if left:
    bmesh.ops.holes_fill(bm, edges=left, sides=0)
bm.normal_update()
for f in [f for f in bm.faces if (f.calc_center_median() - P).length < R_BLEND]:
    if f.normal.dot((f.calc_center_median() - C).normalized()) < 0:
        f.normal_flip()
bm.edges.ensure_lookup_table()
print("head sliver verts", len(sliver), "open edges left", sum(1 for e in bm.edges if e.is_boundary and (e.verts[0].co - P).length < R_BLEND))
uvl = bm.loops.layers.uv.active
us = [l[uvl].uv.x for f in bm.faces if (f.calc_center_median() - P).length < 0.045 for l in f.loops]
vs = [l[uvl].uv.y for f in bm.faces if (f.calc_center_median() - P).length < 0.045 for l in f.loops]
U0, U1, V0, V1 = min(us) - 0.004, max(us) + 0.004, min(vs) - 0.004, max(vs) + 0.004
print("head uv box", round(U0, 3), round(U1, 3), round(V0, 3), round(V1, 3))
for f in bm.faces: f.smooth = True
bm.to_mesh(me); bm.free(); me.update()

# --- textures: harmonic fill of the streak in diffuse + normal
for n in obj.material_slots[0].material.node_tree.nodes:
    if n.type != "TEX_IMAGE": continue
    img = n.image; W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
    u0, u1, v0, v1 = int(U0 * W), int(U1 * W), int(V0 * H), int(V1 * H)
    pad = 4
    patch = px[v0 - pad:v1 + pad, u0 - pad:u1 + pad, :3].copy()
    mask = np.zeros(patch.shape[:2], bool); mask[pad:-pad, pad:-pad] = True
    # elliptical mask so the fill blends round, not as a rectangle
    yy, xx = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
    cy, cx = (mask.shape[0] - 1) / 2, (mask.shape[1] - 1) / 2
    mask &= ((yy - cy) / (cy - pad + 1)) ** 2 + ((xx - cx) / (cx - pad + 1)) ** 2 <= 1.0
    fill = patch.copy(); fill[mask] = patch[~mask].mean(axis=0)
    for _ in range(600):
        avg = (np.roll(fill, 1, 0) + np.roll(fill, -1, 0) + np.roll(fill, 1, 1) + np.roll(fill, -1, 1)) / 4
        fill[mask] = avg[mask]
    # keep a little of the surrounding grain
    rng = np.random.default_rng(1)
    noise = rng.normal(0, patch[~mask].std(axis=0) * 0.5, patch.shape).astype(np.float32)
    fill[mask] += noise[mask]
    px[v0 - pad:v1 + pad, u0 - pad:u1 + pad, :3] = fill
    img.pixels[:] = px.ravel()
    img.pack()
    print("texture filled", img.name, int(mask.sum()), "px")

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True); bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.fbx(filepath=OUT, use_selection=True, object_types={"MESH"},
    path_mode="COPY", embed_textures=True, add_leaf_bones=False, bake_anim=False,
    mesh_smooth_type="FACE")
print("exported", OUT, len(me.polygons), "faces")
