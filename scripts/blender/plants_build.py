"""Stylized plants: a round broadleaf tree, a clipped hedge dome and a Somei-Yoshino cherry.

The two trees are grown from their foliage inward. A species names its crown as tiers of
cloud puffs set round the trunk axis, and `grow()` routes a branch graph from the fork to
every puff, splitting wherever the puffs it still carries part ways. Limb thickness follows
the pipe model (radius ∝ puffs carried ^ `pipe`). Every puff is therefore held by a branch
that ends inside it, the limbs show through the gaps between puffs, and the crown's reach is
set by the tier table instead of emerging from a random walk.

The wood — trunk, root flare, limbs, twigs and a knuckle at every fork — is swept as
overlapping tubes and voxel-remeshed into one clay skin, so forks fillet instead of
intersecting. It is then unwrapped along its own branches so the bark normal map follows each
limb; the cherry turns the map a quarter round, so its fissures read as the horizontal
lenticel bands of sakura bark. Puffs are metaballs, one family each so neighbours stay
separate lumps, shaded by a baked vertex ramp — deep under each puff and toward the core, pale
on top. A coat of alpha-clipped leaf or blossom cards over their outer faces carries the
petal and leaf detail; the puff shows between the cards as the shade inside the cluster.
`src/scene/foliage.tsx` lifts both with extra skylight so the side away from the sun stays
readable.

The hedge keeps the older recipe: one fused dome under a full coat of leaf cards.

Origin at the trunk base, +Z up in Blender (glTF +Y). The app rescales each placement to its
own height, so the number that matters is the reach from the trunk over the height, which
`canopyRatio` in src/data/scene.ts has to cover; `build_all()` prints it.

    exec(open("scripts/blender/plants_build.py").read())                    # build only

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-expr \
      "EXPORT_DIR='<root>/assets/raw/final/props'; exec(open('<root>/scripts/blender/plants_build.py').read())"
    bun run assets:build -- --in <dir holding props/> --out public/models
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT_DIR = "/Users/khoale/Devs/khoale/nobita-house-3d"
TEX_DIR = f"{ROOT_DIR}/assets/raw/textures"
# Metaball grid step for a canopy puff, in its unit frame (core radius 1). Fine enough that a
# lump is a dozen cells across; the canopy is decimated to budget afterwards and keeps these
# normals (`transfer_normals`), so the grid never shows as facets.
PUFF_RESOLUTION = 0.05

# Linear colours for the hedge's plain clay materials.
COLOURS = {
    "leaf_dark": (0.17, 0.40, 0.15, 1.0),
    "bark_dark": (0.26, 0.17, 0.12, 1.0),
}


def linear(hex_colour):
    """sRGB hex → linear RGB, the space Blender colours and glTF vertex colours live in."""
    h = hex_colour.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return Vector(out)


# Sizes are fractions of `height`; the tiers are (count, radial fraction, centre height,
# (puff radius lo, hi)), with puff radius meaning the puff's own outer horizontal radius.
SAKURA = {
    "name": "sakura",
    "seed": 11,
    "height": 3.8,
    # A Yoshino's bark is dark purple-brown with pale horizontal lenticel bands.
    "bark": "#4B3431",
    "bark_bands": True,
    "bark_strength": 0.75,
    # Short trunk forking low into four limbs that spread wide and zigzag, as cherries do.
    "trunk": {"fork": 0.26, "lean": (0.03, 0.01), "flare": 1.35, "roots": 5},
    "limbs": 4,
    "fracs": (0.5, 0.5, 0.55, 0.6),
    "tip": 0.0085,
    "pipe": 0.62,
    "bend": ("zigzag", 0.13),
    # An umbrella, wider than it is tall, the rim puffs hanging lower than the middle. The
    # reach is what canopyRatio.sakura in src/data/scene.ts has to cover.
    "reach": 0.37,
    "tiers": [
        (8, 0.93, 0.50, (0.100, 0.120)),
        (6, 0.55, 0.62, (0.115, 0.135)),
        (3, 0.18, 0.69, (0.120, 0.140)),
    ],
    "puff": {"lumps": 12, "size": (0.36, 0.50), "spread": 0.72, "squash": 0.88},
    "core": None,
    # The body the blossom cards sit on, held to the cards' own range (the blossom texture
    # averages #CF9BA9): a paler body shows between them as smooth pink balls.
    "ramp": ("#A47C88", "#C29FAA", "#DDBFC7"),
    "variation": 0.06,
    "cards": {"texture": "blossom-cluster", "key": "blossomcard", "glow": 0.12, "count": 4200,
              "size": 0.45, "floor": -0.8, "lift": 0.03, "tilt": 0.35},
    "budget": {"wood": 16000, "canopy": 30000},
}

TREE = {
    "name": "tree",
    "seed": 4,
    "height": 5.2,
    "bark": "#766A5E",
    "bark_bands": False,
    "bark_strength": 1.0,
    # A straight clean bole forking high into five rising limbs, after assets/ref/tree.
    "trunk": {"fork": 0.40, "lean": (0.03, 0.0), "flare": 1.3, "roots": 4},
    "limbs": 5,
    "fracs": (0.45, 0.5, 0.55, 0.6),
    "tip": 0.009,
    "pipe": 0.62,
    "bend": ("bow", 0.08),
    "reach": 0.44,
    "tiers": [
        (7, 0.88, 0.55, (0.130, 0.150)),
        (5, 0.50, 0.70, (0.140, 0.160)),
        (2, 0.15, 0.82, (0.140, 0.160)),
    ],
    "puff": {"lumps": 11, "size": (0.38, 0.52), "spread": 0.78, "squash": 0.92},
    # A dark mass inside the puffs, so the gaps between them look into foliage, not sky.
    "core": {"height": 0.66, "radius": 0.20, "tall": 0.17},
    # The body under the leaf cards, held to the cards' own range (the leaf texture averages
    # #4E7D3D): a paler body shows between them as smooth green balls.
    "ramp": ("#26461F", "#3F6B33", "#62914A"),
    "variation": 0.05,
    "cards": {"texture": "leaf-cluster", "key": "leafcard_tree", "glow": 0.05, "count": 2400,
              "size": 0.5, "floor": -0.6, "lift": 0.04, "tilt": 0.45},
    "budget": {"wood": 13000, "canopy": 26000},
}


def material(name):
    key = f"plant_{name}"
    mat = bpy.data.materials.get(key)
    if mat is None:
        mat = bpy.data.materials.new(key)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = COLOURS[name]
        bsdf.inputs["Roughness"].default_value = 0.88
    return mat


def image_node(mat, path, colorspace="sRGB"):
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(path, check_existing=True)
    node.image.colorspace_settings.name = colorspace
    return node


def card_material(name, texture, glow=0.12):
    """Alpha-clipped, double-sided leaf/blossom card material with per-vertex tint.
    `glow` feeds the texture back in as faint emission so cards facing away from the sun
    do not collapse to a muddy dark mass."""
    key = f"plant_{name}"
    mat = bpy.data.materials.get(key)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    tex = image_node(mat, f"{TEX_DIR}/{texture}.png")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = glow
    tint = nt.nodes.new("ShaderNodeVertexColor")
    tint.layer_name = "Col"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], mix.inputs[6])
    nt.links.new(tint.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    # Blender 5 has no CLIP blend mode; the glTF exporter emits alphaMode MASK only when it
    # sees a Greater Than math node feeding the Alpha socket, with the threshold as cutoff.
    clip = nt.nodes.new("ShaderNodeMath")
    clip.operation = "GREATER_THAN"
    clip.inputs[1].default_value = 0.5
    nt.links.new(tex.outputs["Alpha"], clip.inputs[0])
    nt.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
    mat.use_backface_culling = False
    return mat


def canopy_material(name):
    """Matte clay whose whole colour is the baked vertex ramp (exported as COLOR_0)."""
    key = f"plant_{name}_canopy"
    mat = bpy.data.materials.get(key)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    col = nt.nodes.new("ShaderNodeVertexColor")
    col.layer_name = "Col"
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def bark_material(name, colour, strength):
    """Plain clay base colour under the derived bark normal map."""
    key = f"plant_{name}_bark"
    mat = bpy.data.materials.get(key)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*linear(colour), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.92
    normal_tex = image_node(mat, f"{TEX_DIR}/bark-normal.png", colorspace="Non-Color")
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = strength
    nt.links.new(normal_tex.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def scatter_cards(coll, name, surface_obj, count, size, mat, rng, tint_base=(1.0, 1.0, 1.0),
                  tint_var=0.14, tilt_max=0.55, tint_fn=None, floor=-1.0, lift=0.02):
    """Lay textured quads over a mesh surface: each card sits tangent to the local surface,
    randomly rolled and tilted outward, so the canopy edge breaks into leaves while the
    solid core still fills the interior. Faces whose normal points below `floor` get none,
    `lift` (in card sizes) stands the cards proud of the surface, and `tint_fn(point, normal)`
    overrides the flat `tint_base`."""
    mesh = surface_obj.data
    mesh.calc_loop_triangles()
    tris = [t for t in mesh.loop_triangles if t.normal.z >= floor]
    areas = [t.area for t in tris]
    total = sum(areas) or 1.0
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    col_layer = bm.loops.layers.color.new("Col")
    for _ in range(count):
        # Area-weighted random face, then a random barycentric point on it.
        pick = rng.uniform(0, total)
        acc = 0.0
        tri = tris[-1]
        for t, a in zip(tris, areas):
            acc += a
            if acc >= pick:
                tri = t
                break
        r1, r2 = rng.random(), rng.random()
        if r1 + r2 > 1:
            r1, r2 = 1 - r1, 1 - r2
        v0, v1, v2 = (mesh.vertices[i].co for i in tri.vertices)
        point = v0 + (v1 - v0) * r1 + (v2 - v0) * r2
        normal = Vector(tri.normal)
        if normal.length < 1e-6:
            continue
        normal.normalize()
        # Card frame: z along the (tilted) surface normal, random roll about it.
        tilt_axis = normal.orthogonal().normalized()
        tilted = normal.copy()
        tilted.rotate(Matrix.Rotation(rng.uniform(-tilt_max, tilt_max), 4, tilt_axis))
        frame = tilted.to_track_quat("Z", "Y").to_matrix()
        frame = frame @ Matrix.Rotation(rng.uniform(0, 2 * math.pi), 3, "Z")
        s = size * rng.uniform(0.75, 1.25)
        # Push the card off the core so it never z-fights with it.
        centre = point + tilted * (lift * size)
        corners = [Vector((-s / 2, -s / 2, 0)), Vector((s / 2, -s / 2, 0)),
                   Vector((s / 2, s / 2, 0)), Vector((-s / 2, s / 2, 0))]
        verts = [bm.verts.new(centre + frame @ c) for c in corners]
        face = bm.faces.new(verts)
        base = tint_fn(point, normal) if tint_fn else tint_base
        shade = 1.0 + rng.uniform(-tint_var, tint_var)
        tint = (min(base[0] * shade, 1.0), min(base[1] * shade, 1.0), min(base[2] * shade, 1.0), 1.0)
        for loop, uv in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv_layer].uv = uv
            loop[col_layer] = tint
    out_mesh = bpy.data.meshes.new(name)
    bm.to_mesh(out_mesh)
    bm.free()
    obj = bpy.data.objects.new(name, out_mesh)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def fresh_collection(name):
    existing = bpy.data.collections.get(name)
    if existing:
        for obj in list(existing.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def convert_metaball(coll, name, mball):
    """Link a metaball, convert it to a mesh and return the mesh object."""
    holder = bpy.data.objects.new(name, mball)
    coll.objects.link(holder)
    bpy.context.view_layer.update()
    with bpy.context.temp_override(object=holder, active_object=holder, selected_objects=[holder],
                                   selected_editable_objects=[holder]):
        bpy.ops.object.convert(target="MESH")
    # convert() may rename the result; find the converted mesh in the collection instead.
    obj = next(o for o in coll.objects if o.type == "MESH" and o.name.startswith(name))
    obj.name = name
    obj.data.name = name
    return obj


def decimate(obj, target_tris):
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if tris <= target_tris:
        return
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.ratio = target_tris / tris
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj],
                                   selected_editable_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def smooth_shade(obj):
    obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
    obj.data.update()


def detail_copy(obj):
    """A throwaway full-detail copy of `obj`, smooth-shaded, to take normals from once `obj`
    has been decimated."""
    hi = obj.copy()
    hi.data = obj.data.copy()
    obj.users_collection[0].objects.link(hi)
    smooth_shade(hi)
    return hi


def transfer_normals(obj, hi):
    """Give decimated `obj` the normals of its full-detail copy `hi`, then delete `hi`.

    Decimation leaves long slivers, and their averaged normals facet visibly under a low sun
    or the moon; the source surface's normals shade the same triangles as the round form
    they approximate. Exported as the glTF NORMAL attribute."""
    smooth_shade(obj)
    mod = obj.modifiers.new("normals", "DATA_TRANSFER")
    mod.object = hi
    mod.use_loop_data = True
    mod.data_types_loops = {"CUSTOM_NORMAL"}
    mod.loop_mapping = "POLYINTERP_NEAREST"
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj],
                                   selected_editable_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mesh = hi.data
    bpy.data.objects.remove(hi, do_unlink=True)
    bpy.data.meshes.remove(mesh)


def blob_mesh(coll, name, elements, resolution, mat_name, target_tris):
    """Fuse a list of (centre, radius) balls into one smooth clay mass."""
    mball = bpy.data.metaballs.new(name)
    mball.resolution = resolution
    mball.threshold = 0.45   # lower = neighbouring balls fuse into one mass sooner
    for centre, radius in elements:
        el = mball.elements.new()
        el.co = Vector(centre)
        el.radius = radius
    obj = convert_metaball(coll, name, mball)
    decimate(obj, target_tris)
    obj.data.materials.append(material(mat_name))
    smooth_shade(obj)
    return obj


def tapered_tube(coll, name, points, radii, mat_name, segments=10):
    """Sweep rings of decreasing radius through a vertical polyline."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    rings = []
    for (px, py, pz), r in zip(points, radii):
        ring = [bm.verts.new((px + r * math.cos(2 * math.pi * k / segments),
                              py + r * math.sin(2 * math.pi * k / segments), pz))
                for k in range(segments)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(material(mat_name))
    smooth_shade(obj)
    return obj


# --- Branch graph -----------------------------------------------------------------------


class Wood:
    """Every branch as a polyline with radii, parallel-transport frames and arc length from
    the ground, plus the knuckle balls at forks. Frames and arc length drive the bark UVs."""

    def __init__(self):
        self.branches = []
        self.joints = []

    def branch(self, pts, r0, r1, s0, radii=None):
        """Add a branch tapering linearly from r0 to r1 (or along `radii`); returns the arc
        length at its end."""
        n = len(pts)
        radii = list(radii) if radii else [r0 + (r1 - r0) * i / (n - 1) for i in range(n)]
        tangents = []
        for i in range(n):
            a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
            tangents.append((b - a).normalized())
        normals = [tangents[0].orthogonal().normalized()]
        for i in range(1, n):
            rot = tangents[i - 1].rotation_difference(tangents[i])
            nrm = rot @ normals[-1]
            # Re-orthogonalise against drift.
            nrm = (nrm - tangents[i] * nrm.dot(tangents[i])).normalized()
            normals.append(nrm)
        arc = [s0]
        for a, b in zip(pts, pts[1:]):
            arc.append(arc[-1] + (b - a).length)
        self.branches.append({"pts": pts, "radii": radii, "t": tangents, "n": normals, "s": arc})
        return arc[-1]


def pipe_radius(sp, n):
    return sp["tip"] * sp["height"] * n ** sp["pipe"]


def centroid(points):
    c = Vector()
    for p in points:
        c += p
    return c / len(points)


def split(start, targets, k):
    """Part the targets into k groups as seen from `start`: by azimuth for a many-way fork,
    across their widest spread for a two-way one."""
    if k >= 3:
        order = sorted(targets, key=lambda p: math.atan2(p.y - start.y, p.x - start.x))
        angles = [math.atan2(p.y - start.y, p.x - start.x) for p in order]
        n = len(order)
        # Start the round at the widest angular gap, so no group straddles it.
        gaps = [(angles[(i + 1) % n] - angles[i]) % (2 * math.pi) for i in range(n)]
        i0 = (max(range(n), key=lambda i: gaps[i]) + 1) % n
        order = order[i0:] + order[:i0]
        k = min(k, n)
        return [order[round(i * n / k):round((i + 1) * n / k)] for i in range(k)]
    c = centroid(targets)
    d = (c - start).normalized()
    side = d.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
    lift = side.cross(d).normalized()
    axis = max((side, lift), key=lambda a: sum(((p - c).dot(a)) ** 2 for p in targets))
    order = sorted(targets, key=lambda p: (p - c).dot(axis))
    half = len(order) // 2
    return [order[:half], order[half:]]


def branch_points(a, b, sp, rng):
    """A limb from a to b: bowed upward for the broadleaf, kinked into a zigzag for the cherry."""
    kind, amount = sp["bend"]
    H = sp["height"]
    length = (b - a).length
    n = max(3, int(length / (0.05 * H)) + 2)
    d = (b - a).normalized()
    side = d.cross(Vector((0, 0, 1)))
    side = side.normalized() if side.length > 1e-4 else Vector((1, 0, 0))
    lift = side.cross(d).normalized()
    if lift.z < 0:
        lift = -lift
    kinks = [(0.0, Vector())]
    if kind == "zigzag" and length > 0.12 * H:
        sign = rng.choice((-1, 1))
        for t in (rng.uniform(0.28, 0.4), rng.uniform(0.62, 0.74)):
            q = rng.uniform(-0.6, 0.6)
            off = (side * math.cos(q) + lift * math.sin(q)) * sign * amount * length * rng.uniform(0.6, 1.0)
            kinks.append((t, off))
            sign = -sign
    kinks.append((1.0, Vector()))
    pts = []
    for i in range(n):
        t = i / (n - 1)
        p = a.lerp(b, t)
        if kind == "bow":
            p = p + lift * math.sin(math.pi * t) * amount * length
        else:
            for (t0, o0), (t1, o1) in zip(kinks, kinks[1:]):
                if t0 <= t <= t1:
                    p = p + o0.lerp(o1, (t - t0) / max(t1 - t0, 1e-6))
                    break
            p = p + lift * math.sin(math.pi * t) * 0.04 * length
        pts.append(p)
    return pts


def grow(wood, start, s0, targets, depth, sp, rng):
    """Route branches from `start` to every target, forking toward each group's centroid."""
    groups = split(start, targets, sp["limbs"] if depth == 0 else 2)
    for group in groups:
        n = len(group)
        r0 = pipe_radius(sp, n)
        if n == 1:
            wood.branch(branch_points(start, group[0], sp, rng), r0, r0 * 0.65, s0)
            continue
        frac = sp["fracs"][min(depth, len(sp["fracs"]) - 1)]
        fork = start.lerp(centroid(group), frac)
        s1 = wood.branch(branch_points(start, fork, sp, rng), r0, r0 * 0.9, s0)
        wood.joints.append((fork, r0 * 0.95))
        grow(wood, fork, s1, group, depth + 1, sp, rng)


def trunk_and_roots(wood, sp, rng, total):
    """The bole from the ground to the fork, flared at the foot, and short buttress roots."""
    H = sp["height"]
    tr = sp["trunk"]
    fork = Vector((tr["lean"][0] * H, tr["lean"][1] * H, tr["fork"] * H))
    r = pipe_radius(sp, total)
    base = r * tr["flare"]
    ts = (0.0, 0.07, 0.18, 0.4, 0.7, 1.0)
    rs = (base, base * 0.9, r * 1.06, r * 1.02, r, r * 0.97)
    pts = []
    for t in ts:
        sway = math.sin(math.pi * t) * 0.012 * H
        pts.append(Vector((fork.x * t * t, fork.y * t * t + sway, fork.z * t)))
    s_fork = wood.branch(pts, rs[0], rs[-1], 0.0, radii=rs)
    wood.joints.append((fork, r))
    k = tr["roots"]
    offset = rng.uniform(0, 2 * math.pi)
    for i in range(k):
        a = offset + 2 * math.pi * i / k + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0))
        start = d * base * 0.2 + Vector((0, 0, base * 1.2))
        end = d * base * rng.uniform(1.7, 2.0) + Vector((0, 0, -base * 0.3))
        root = [start.lerp(end, t) + Vector((0, 0, math.sin(math.pi * t) * base * 0.2))
                for t in (0.0, 0.35, 0.7, 1.0)]
        wood.branch(root, base * 0.55, base * 0.25, 0.0)
    return fork, s_fork


def wood_mesh(coll, sp, wood):
    """Sweep every branch, add the knuckles, voxel-remesh into one skin, smooth, decimate,
    cut at the ground and unwrap along the branches."""
    H = sp["height"]
    bm = bmesh.new()
    for br in wood.branches:
        rings = []
        segments = 12 if br["radii"][0] > 0.02 * H else 8
        for p, r, t, nrm in zip(br["pts"], br["radii"], br["t"], br["n"]):
            bnm = t.cross(nrm)
            rings.append([bm.verts.new(p + (nrm * math.cos(2 * math.pi * j / segments)
                                            + bnm * math.sin(2 * math.pi * j / segments)) * r)
                          for j in range(segments)])
        for a, b in zip(rings, rings[1:]):
            for j in range(segments):
                bm.faces.new((a[j], a[(j + 1) % segments], b[(j + 1) % segments], b[j]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    for centre, r in wood.joints:
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r, matrix=Matrix.Translation(centre))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    name = f"{sp['name']}_wood"
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)

    tip = pipe_radius(sp, 1) * 0.65
    remesh = obj.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = tip * 0.55
    remesh.adaptivity = 0.0
    smooth = obj.modifiers.new("smooth", "SMOOTH")
    smooth.factor = 0.5
    smooth.iterations = 4
    depsgraph = bpy.context.evaluated_depsgraph_get()
    baked = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    obj.modifiers.clear()
    old = obj.data
    obj.data = baked
    bpy.data.meshes.remove(old)
    obj.data.name = name
    hi = detail_copy(obj)
    decimate(obj, sp["budget"]["wood"])

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0),
                           plane_no=(0, 0, 1), clear_inner=True)
    unwrap_bark(bm, wood, sp)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(bark_material(sp["name"], sp["bark"], sp["bark_strength"]))
    transfer_normals(obj, hi)
    return obj


def unwrap_bark(bm, wood, sp):
    """UVs that run along each branch: u round it (a whole number of repeats), v up it by arc
    length, so the bark map flows from the trunk into the limbs at a constant texel size."""
    tile = 0.13 * sp["height"]
    samples = []
    for bi, br in enumerate(wood.branches):
        pts = br["pts"]
        for i in range(len(pts) - 1):
            steps = max(1, int((pts[i + 1] - pts[i]).length / (0.01 * sp["height"])))
            for j in range(steps + 1):
                samples.append((pts[i].lerp(pts[i + 1], j / steps), bi, i))
    tree = KDTree(len(samples))
    for idx, (p, _, _) in enumerate(samples):
        tree.insert(p, idx)
    tree.balance()
    repeats = [max(1, round(2 * math.pi * br["radii"][0] / tile)) for br in wood.branches]

    def project(p, bi, i):
        br = wood.branches[bi]
        a, b = br["pts"][i], br["pts"][i + 1]
        seg = b - a
        t = max(0.0, min(1.0, (p - a).dot(seg) / max(seg.length_squared, 1e-12)))
        c = a.lerp(b, t)
        r = br["radii"][i] + (br["radii"][i + 1] - br["radii"][i]) * t
        return c, r, t

    uv_layer = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        centre = face.calc_center_median()
        best = None
        for _, idx, _ in tree.find_n(centre, 8):
            _, bi, i = samples[idx]
            c, r, _ = project(centre, bi, i)
            gap = (centre - c).length - r
            if best is None or gap < best[0]:
                best = (gap, bi, i)
        _, bi, i = best
        br = wood.branches[bi]
        nrm, tan = br["n"][i], br["t"][i]
        bnm = tan.cross(nrm)
        k = repeats[bi]
        circumference = 2 * math.pi * br["radii"][0]
        first = None
        for loop in face.loops:
            p = loop.vert.co
            c, _, t = project(p, bi, i)
            v = p - c
            ang = math.atan2(v.dot(bnm), v.dot(nrm))
            if first is None:
                first = ang
            else:
                while ang - first > math.pi:
                    ang -= 2 * math.pi
                while ang - first < -math.pi:
                    ang += 2 * math.pi
            u = ang / (2 * math.pi) * k
            s = br["s"][i] + (br["s"][i + 1] - br["s"][i]) * t
            w = s * k / circumference
            loop[uv_layer].uv = (w, u) if sp["bark_bands"] else (u, w)


# --- Crown --------------------------------------------------------------------------------


def crown_puffs(sp, rng, axis):
    """Puff centres and outer radii from the tier table, each with a small shade offset."""
    H = sp["height"]
    puffs = []
    for count, rho, z, (rlo, rhi) in sp["tiers"]:
        offset = rng.uniform(0, 2 * math.pi)
        for i in range(count):
            a = offset + 2 * math.pi * i / count + rng.uniform(-0.2, 0.2)
            r = H * rng.uniform(rlo, rhi)
            d = rho * (sp["reach"] * H - r)
            centre = Vector((axis.x + d * math.cos(a), axis.y + d * math.sin(a),
                             H * (z + rng.uniform(-0.025, 0.025))))
            puffs.append({"c": centre, "r": r, "shade": rng.uniform(-1, 1)})
    return puffs


def puff_object(coll, name, puff, sp, rng):
    """One cloud puff: a core ball with lumps on its upper side, normalised so its outer
    horizontal radius is exactly `puff['r']`, then squashed and moved into place."""
    pf = sp["puff"]
    mball = bpy.data.metaballs.new(name)
    # Polygonised fine and decimated with the whole canopy later (see PUFF_RESOLUTION). In the
    # puff's unit frame, so every puff gets the same grid whatever its size.
    mball.resolution = PUFF_RESOLUTION
    mball.threshold = 0.6
    core = mball.elements.new()
    core.co = (0, 0, 0)
    core.radius = 1.0
    golden = math.pi * (3 - math.sqrt(5))
    spin = rng.uniform(0, 2 * math.pi)
    for i in range(pf["lumps"]):
        a = spin + golden * i + rng.uniform(-0.3, 0.3)
        e = math.asin(max(-1.0, min(1.0, rng.uniform(-0.25, 0.9))))
        el = mball.elements.new()
        el.co = (pf["spread"] * math.cos(a) * math.cos(e), pf["spread"] * math.sin(a) * math.cos(e),
                 pf["spread"] * math.sin(e))
        el.radius = rng.uniform(*pf["size"])
    obj = convert_metaball(coll, name, mball)
    reach = max(math.hypot(v.co.x, v.co.y) for v in obj.data.vertices) or 1.0
    k = puff["r"] / reach
    for v in obj.data.vertices:
        v.co = puff["c"] + Vector((v.co.x * k, v.co.y * k, v.co.z * k * pf["squash"]))
    return obj


def inside(tree, co):
    """Whether `co` is inside the closed mesh behind BVH `tree`: odd hits along one ray."""
    ray = Vector((0.013, 0.007, 1.0)).normalized()
    hits = 0
    origin = co
    while True:
        loc, _, _, _ = tree.ray_cast(origin, ray)
        if loc is None:
            return hits % 2 == 1
        hits += 1
        origin = loc + ray * 1e-5


def cull_buried(parts, puffs):
    """Delete the faces of each puff that lie wholly inside a neighbouring puff.

    Neighbours overlap by design, so a third of the polygonised skin is buried where nobody
    can see it. Culling it spends the decimation budget, and the cards, on the visible skin
    only. A face goes only when all its corners are buried, so the cut edge stays tucked
    inside the neighbour instead of opening a seam."""
    trees = [BVHTree.FromPolygons([v.co for v in p.data.vertices], [f.vertices[:] for f in p.data.polygons])
             for p in parts]
    for i, obj in enumerate(parts):
        near = [j for j, q in enumerate(puffs)
                if j != i and (q["c"] - puffs[i]["c"]).length < q["r"] + puffs[i]["r"]]
        if not near:
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        buried = {v for v in bm.verts if any(inside(trees[j], v.co) for j in near)}
        dead = [f for f in bm.faces if all(v in buried for v in f.verts)]
        bmesh.ops.delete(bm, geom=dead, context="FACES")
        bm.to_mesh(obj.data)
        bm.free()


def core_object(coll, sp, axis):
    H = sp["height"]
    cr = sp["core"]
    mball = bpy.data.metaballs.new(f"{sp['name']}_core")
    mball.resolution = 0.12
    mball.threshold = 0.6
    el = mball.elements.new()
    el.co = (0, 0, 0)
    el.radius = 1.0
    obj = convert_metaball(coll, f"{sp['name']}_core", mball)
    reach = max(math.hypot(v.co.x, v.co.y) for v in obj.data.vertices) or 1.0
    for v in obj.data.vertices:
        v.co = Vector((axis.x + v.co.x / reach * cr["radius"] * H, axis.y + v.co.y / reach * cr["radius"] * H,
                       cr["height"] * H + v.co.z / reach * cr["tall"] * H))
    return obj


def join(objects, name):
    keep = objects[0]
    with bpy.context.temp_override(object=keep, active_object=keep, selected_objects=objects,
                                   selected_editable_objects=objects):
        bpy.ops.object.join()
    keep.name = name
    keep.data.name = name
    return keep


def make_shader(sp, axis, puffs, zlo, zhi):
    """The canopy's colour at a point: the ramp driven by how much the surface faces up, how
    high it is in the crown and how far out from the trunk — plus each puff's own offset."""
    deep, mid, light = (linear(c) for c in sp["ramp"])
    reach = sp["reach"] * sp["height"]

    def ramp(t):
        return deep.lerp(mid, t / 0.5) if t < 0.5 else mid.lerp(light, (t - 0.5) / 0.5)

    def shade(p, n):
        up = 0.5 + 0.5 * n.z
        h = (p.z - zlo) / max(zhi - zlo, 1e-6)
        radial = min(1.0, math.hypot(p.x - axis.x, p.y - axis.y) / reach)
        t = 0.5 * up + 0.32 * h + 0.18 * radial
        near = min(puffs, key=lambda q: (q["c"] - p).length_squared) if puffs else None
        if near is not None:
            t += near["shade"] * sp["variation"]
        t = max(0.0, min(1.0, t))
        t = t * t * (3 - 2 * t)
        return ramp(t)

    return shade, light


def paint(obj, shade):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    layer = bm.loops.layers.color.new("Col")
    for v in bm.verts:
        c = shade(v.co, v.normal)
        for loop in v.link_loops:
            loop[layer] = (c.x, c.y, c.z, 1.0)
    bm.to_mesh(obj.data)
    bm.free()


def build_species(coll, sp):
    rng = random.Random(sp["seed"])
    H = sp["height"]
    name = sp["name"]
    tr = sp["trunk"]
    axis = Vector((tr["lean"][0] * H, tr["lean"][1] * H, 0))
    puffs = crown_puffs(sp, rng, axis)

    # Each twig ends a third of the way down inside its puff, so the bloom sits on it.
    targets = [p["c"] - Vector((0, 0, p["r"] * 0.35)) for p in puffs]
    wood = Wood()
    fork, s_fork = trunk_and_roots(wood, sp, rng, len(targets))
    grow(wood, fork, s_fork, targets, 0, sp, rng)
    wood_mesh(coll, sp, wood)

    parts = [puff_object(coll, f"{name}_puff_{i:02d}", p, sp, rng) for i, p in enumerate(puffs)]
    cull_buried(parts, puffs)
    canopy = join(parts, f"{name}_canopy")
    zs = [v.co.z for v in canopy.data.vertices]
    shade, light = make_shader(sp, axis, puffs, min(zs), max(zs))
    canopy.data.materials.append(canopy_material(name))

    cd = sp["cards"]
    light_lum = light.dot(Vector((0.2126, 0.7152, 0.0722)))

    def card_tint(p, n):
        # Brightness from the ramp, a little of its hue: the card texture already carries
        # the colour, and multiplying it by the full ramp would double the saturation.
        c = shade(p, n)
        k = c.dot(Vector((0.2126, 0.7152, 0.0722))) / light_lum
        grey = Vector((k, k, k))
        ratio = Vector((c.x / light.x, c.y / light.y, c.z / light.z))
        return grey.lerp(ratio, 0.3)

    scatter_cards(coll, f"{name}_cards", canopy, count=cd["count"], size=cd["size"] * sum(
        p["r"] for p in puffs) / len(puffs), mat=card_material(cd["key"], cd["texture"], cd["glow"]),
        rng=rng, tint_var=0.06, tilt_max=cd["tilt"], tint_fn=card_tint, floor=cd["floor"],
        lift=cd["lift"])
    # Cards go on the full-detail skin; the body is then decimated and keeps its normals.
    hi = detail_copy(canopy)
    decimate(canopy, sp["budget"]["canopy"])
    paint(canopy, shade)
    transfer_normals(canopy, hi)

    if sp["core"]:
        core = core_object(coll, sp, axis)
        decimate(core, 800)
        paint(core, lambda p, n: linear(sp["ramp"][0]))
        core.data.materials.append(canopy_material(name))
        smooth_shade(core)


def build_hedge(coll, seed=5, height=0.8):
    rng = random.Random(seed)
    for i in range(3):
        a = 2 * math.pi * i / 3
        tapered_tube(coll, f"hedge_stem_{i}", [(0.08 * math.cos(a), 0.08 * math.sin(a), 0),
                                              (0.14 * math.cos(a), 0.14 * math.sin(a), height * 0.3)],
                     [0.035, 0.02], "bark_dark", 6)
    dome_c = (0, 0, height * 0.52)
    elements = [(dome_c, height * 0.44)]
    for _ in range(18):
        u, v = rng.uniform(0, 2 * math.pi), rng.uniform(-0.15, 1.0)
        r = height * 0.42
        elements.append(((r * math.cos(u) * math.sqrt(1 - v * v), r * math.sin(u) * math.sqrt(1 - v * v),
                          dome_c[2] + r * v), height * rng.uniform(0.10, 0.15)))
    core = blob_mesh(coll, "hedge_dome", elements, resolution=height * 0.03, mat_name="leaf_dark",
                     target_tris=2500)
    scatter_cards(coll, "hedge_leaves", core, count=140, size=height * 0.42,
                  mat=card_material("leafcard", "leaf-cluster"), rng=rng,
                  tint_base=(0.62, 0.78, 0.60), tint_var=0.10)


def measure(coll):
    """Triangles, and the crown's reach from the trunk base over the model's height."""
    tris = 0
    reach = 0.0
    top = 0.0
    for obj in coll.objects:
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
        for v in obj.data.vertices:
            p = obj.matrix_world @ v.co
            reach = max(reach, math.hypot(p.x, p.y))
            top = max(top, p.z)
    return tris, reach / top if top else 0.0


def build_all():
    out = {}
    builders = (("tree", lambda c: build_species(c, TREE)), ("hedge", build_hedge),
                ("sakura", lambda c: build_species(c, SAKURA)))
    for name, fn in builders:
        coll = fresh_collection(f"PLANT_{name}")
        fn(coll)
        tris, ratio = measure(coll)
        out[name] = {"tris": tris, "reach_ratio": ratio}
        print(f"{name}: {len(coll.objects)} objects, {tris} tris, reach/height {ratio:.3f}")
    return out


build_all()

export_dir = globals().get("EXPORT_DIR")
if export_dir:
    os.makedirs(export_dir, exist_ok=True)
    for plant in ("tree", "hedge", "sakura"):
        exec(open(f"{ROOT_DIR}/scripts/blender/export_glb.py").read(),
             {"COLLECTION": f"PLANT_{plant}", "OUT_PATH": f"{export_dir}/{plant}.glb"})
