"""Build the eight neighbour lots and the sandlot around Nobita's block.

Three parametric house variants stand one rung below the hero house on the detail ladder:
real massing, roof pitch, eaves, framed openings, walls and gates, but no kawara ribs and no
booleans. Exports as the NEIGHBOURS collection.

Coordinates: built directly in Blender space through `P(x, z, y)`, like `streets_build.py`.
A house is laid out in its own frame — local +X runs along the street, local +Z points at the
street, y is height — and every part is placed through `place()`, which rotates that frame by
the lot's yaw about the house centre before translating. Yaws are quarter turns only, so the
rotation is an axis swap and never has to touch the mesh.

Run:  exec(open("scripts/blender/neighbours_build.py").read())
"""

import math
import os

import bpy

COLLECTION = "NEIGHBOURS"
ROOT_DIR = "/Users/khoale/Devs/khoale/nobita-house-3d"
SCRIPTS_DIR = f"{ROOT_DIR}/scripts/blender"
exec(open(os.path.join(SCRIPTS_DIR, "env_helpers.py")).read())

# --- layout, mirrors layout.neighbours / houseVariants / HOUSE_SETBACK in src/data/scene.ts ---
SETBACK = 3.2
PITCH = math.radians(25)

VARIANTS = {
    "hip2": dict(storeys=2, width=7.5, depth=6.5, upper_inset=0.6, ground_h=2.75, eave_h=5.3,
                 roof=dict(width=7.3, depth=6.3, height=1.47, ridge=1.0, axis="x")),
    "gable2": dict(storeys=2, width=8.0, depth=6.0, upper_inset=0.0, ground_h=2.75, eave_h=5.3,
                   roof=dict(width=9.0, depth=7.0, height=1.63, ridge=9.0, axis="x")),
    "gable1": dict(storeys=1, width=8.5, depth=6.5, upper_inset=0.0, ground_h=2.75, eave_h=2.75,
                   roof=dict(width=9.5, depth=7.5, height=2.22, ridge=7.5, axis="z")),
}

LOTS = [
    dict(id="east", x0=7.9, x1=22.9, z0=-12.2, z1=5.8, facing="+z", variant="gable2",
         offset=0.6, wall="#F2EEE6", roof="#7A4A34", mirror=False, approach="slabs"),
    dict(id="east-back", x0=7.9, x1=22.9, z0=-30.6, z1=-12.6, facing="-z", variant="gable1",
         offset=-0.5, wall="#E4E2DC", roof="#4A5060", mirror=True, approach="stones"),
    dict(id="back", x0=-7.5, x1=7.5, z0=-30.6, z1=-12.6, facing="-z", variant="hip2",
         offset=0.4, wall="#EFE3C6", roof="#3E4C66", mirror=False, approach="wash"),
    dict(id="west-back", x0=-35.3, x1=-17.3, z0=-24.6, z1=-9.6, facing="+x", variant="hip2",
         offset=-0.7, wall="#E6E4E0", roof="#4B5058", mirror=True, approach="stones"),
    dict(id="west", x0=-35.3, x1=-17.3, z0=-9.2, z1=5.8, facing="+x", variant="gable2",
         offset=0.5, wall="#F0DCCF", roof="#3E4C66", mirror=False, approach="wash"),
    dict(id="south", x0=-32.3, x1=-17.3, z0=15.6, z1=33.6, facing="-z", variant="gable1",
         offset=-0.4, wall="#EDE7DA", roof="#7A4A34", mirror=False, approach="stones"),
    dict(id="south-east", x0=9.4, x1=24.4, z0=15.6, z1=33.6, facing="-z", variant="hip2",
         offset=-0.6, wall="#F4F1EA", roof="#4A5060", mirror=True, approach="slabs"),
]
# The manga's vacant lot, mirrors layout.sandlot: worn grass, pipes, rings, bamboo.
SANDLOT = dict(x0=-7.5, x1=9.0, z0=15.6, z1=33.6, open="-z", fence="-x",
               bare=[((0.4, 23.6), 4.6, 4.4), ((-3.85, 18.8), 1.5, 1.0)],
               pipes=dict(centre=(-0.3, 31.6), radius=0.6, length=3.2),
               rings=dict(centre=(7.0, 18.0), radius=0.28, length=0.5),
               poles=dict(centre=(8.05, 22.0), radius=0.18, length=3.6),
               fence_h=1.45)

LOT_WALL_H, LOT_WALL_T = 1.4, 0.2
# Mirrors NEIGHBOUR_GATE_WIDTH, APPROACH_WIDTH and DOOR_STEP_DEPTH in src/data/scene.ts.
GATE_W, APPROACH_W, STEP_D = 1.5, 1.1, 0.7
STEP_W = 1.9


def P(x, z, y=0.0):
    return (x, -z, y)


def tint(prefix, hex_value, tile):
    """One material per distinct colour, not per lot: two lots painted alike share a draw call."""
    name = f"{prefix}_{hex_value.lstrip('#').lower()}"
    if name not in COLOURS:
        register_colour(name, hex_rgba(hex_value))
        TILES.setdefault(name, tile)
    return name


def prepare(spec):
    """Fill in the derived placement a lot's geometry is built from."""
    v = VARIANTS[spec["variant"]]
    cx_lot, cz_lot = (spec["x0"] + spec["x1"]) / 2, (spec["z0"] + spec["z1"]) / 2
    if spec["facing"] == "+z":
        cx, cz, yaw = cx_lot + spec["offset"], spec["z1"] - SETBACK - v["depth"] / 2, 0.0
    elif spec["facing"] == "-z":
        cx, cz, yaw = cx_lot + spec["offset"], spec["z0"] + SETBACK + v["depth"] / 2, math.pi
    else:
        cx, cz, yaw = spec["x1"] - SETBACK - v["depth"] / 2, cz_lot + spec["offset"], math.pi / 2
    # The front door and, in line with it, the gate: `neighbourDoorU` / `neighbourEntry`.
    door_u = (-1 if spec["mirror"] else 1) * v["width"] * 0.3
    spec.update(v=v, cx=cx, cz=cz, yaw=yaw, door_u=door_u,
                wall_mat=tint("wall", spec["wall"], ("tile-stucco", 2.2, 0.45)),
                roof_mat=tint("roof", spec["roof"], ("tile-asphalt", 1.0, 0.35)))
    spec["gate"] = place(spec, door_u, v["depth"] / 2 + SETBACK)
    return spec


def place(spec, lx, lz):
    """House-local (along street, toward street) -> world glTF (x, z). Yaw about +Y."""
    s, c = math.sin(spec["yaw"]), math.cos(spec["yaw"])
    return spec["cx"] + lx * c + lz * s, spec["cz"] - lx * s + lz * c


def swapped(spec):
    """True for the quarter-turn lots, where a local X size becomes a world Z size."""
    return abs(math.sin(spec["yaw"])) > 0.5


def slope_rotation(spec, axis, sign, angle):
    """Blender euler index and angle for a part lying on a roof slope that falls toward the
    house-local `axis` * `sign`.

    Both halves of this matter. A local axis lands on a different Blender axis *and a
    different direction* per yaw — local +Z is Blender -Y at yaw 0 but +Y at yaw pi — and a
    rotation about Blender X puts +Y on the opposite side of the horizon from what a rotation
    about Blender Y does to +X. Folding in only the axis, as an earlier version did, mirrored
    every course lip on the yaw-0 and quarter-turn lots.
    """
    c, s = math.cos(spec["yaw"]), math.sin(spec["yaw"])
    # Where the local axis points, in Blender: glTF (x, z) -> Blender (x, -z).
    bx, by = (s, -c) if axis == "z" else (c, s)
    if abs(bx) > abs(by):
        # Thin axis is Blender X, so tilt about Blender Y. R_y(+t) sends +X to (cos, 0, -sin).
        return 1, sign * math.copysign(1.0, bx) * angle
    # Thin axis is Blender Y, so tilt about Blender X. R_x(+t) sends +Y to (0, cos, +sin).
    return 0, -sign * math.copysign(1.0, by) * angle


def house_box(coll, name, spec, size, local, mat_name, slope=None):
    """Box given in the house's own frame: size (along street, toward street, height).
    `slope` is (local axis, sign, angle) for a part that lies on a roof slope."""
    w, d, h = size
    lx, lz, y = local
    x, z = place(spec, lx, lz)
    if swapped(spec):
        w, d = d, w
    obj = add_box(coll, name, (w, d, h), P(x, z, y), mat_name)
    if slope is not None:
        index, angle = slope_rotation(spec, *slope)
        obj.rotation_euler[index] = angle
    return obj


def face_local(face, half_normal, u, out, y):
    """Point `out` metres proud of one wall face, `u` along it, in the house frame."""
    if face == "front":
        return (u, half_normal + out, y)
    if face == "back":
        return (u, -half_normal - out, y)
    if face == "left":
        return (-half_normal - out, u, y)
    return (half_normal + out, u, y)


def face_size(face, along, thickness, height):
    return (along, thickness, height) if face in ("front", "back") else (thickness, along, height)


# --- Showa-house detail ------------------------------------------------------------------
# The neighbours follow the 1960s-80s Tokyo suburb of Doraemon and the reference art
# (`assets/home.jpg`): kawara roofs with a tiled skirt round the ground floor, small hoods
# over every opening, amado shutter boxes, silver aluminium sashes, stucco gable ends with a
# vent, dark stained trim, a TV aerial and washing on the balcony.
SASH = register_colour("sash", (0.52, 0.54, 0.55, 1.0))
TRIM = register_colour("trim", (0.20, 0.13, 0.08, 1.0))
# Its own dark material, not `interior`: `NightLights` lights every `env_interior` as a
# window after dark, and a pierced block in a wall must not glow.
BLOCK_HOLE = register_colour("block_hole", (0.16, 0.16, 0.15, 1.0))
SHUTTER = "wood"
BRICK = register_colour("brick", (0.46, 0.22, 0.15, 1.0))
GRAVEL = register_colour("gravel", (0.64, 0.62, 0.58, 1.0))
WASH = register_colour("wash", (0.66, 0.60, 0.50, 1.0))
PROPANE = register_colour("propane", (0.56, 0.64, 0.66, 1.0))
BIKE = register_colour("bike", (0.16, 0.40, 0.38, 1.0))
MAILBOX = register_colour("mailbox", (0.24, 0.30, 0.27, 1.0))
TYRE = register_colour("tyre", (0.05, 0.05, 0.055, 1.0))
for _name in (BRICK, GRAVEL, WASH):
    TILES.setdefault(_name, ("tile-concrete", 1.2 if _name == BRICK else 1.8, 0.6))
# One look per lot, cycled by position in LOTS so no two neighbours along a street match:
# gate leaves, gate piers, and whether a leaf stands ajar.
GATE_LEAF = ("iron", "frame", "metal")
GATE_PIER = ("stone", BRICK, "concrete_dark")
HOOD_PITCH = math.radians(18)
# The skirt roof overhangs the ground-floor wall by the same 0.5 m as the main eaves, so the
# lot-fit test, which is sized from the roof, still holds.
SKIRT_OUT = 0.5


def is_gable(r):
    """A ridge as long as the roof along its axis has vertical gable ends, not hips."""
    return r["ridge"] >= (r["width"] if r["axis"] == "x" else r["depth"])


def house_mesh(coll, name, spec, verts, faces, mat_name):
    """Free mesh from house-local (along street, toward street, height) points."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    vs = [bm.verts.new(P(*place(spec, lx, lz), y)) for lx, lz, y in verts]
    for face in faces:
        bm.faces.new([vs[i] for i in face])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(material(mat_name))
    return obj


def add_hood(coll, spec, name, u, wall_z, top_y, width, depth, mat_name):
    """庇: a small tiled hood on the front wall over a window or door, falling toward the
    street, with a thick tile roll along its drip edge."""
    run = depth / math.cos(HOOD_PITCH)
    drop = depth * math.tan(HOOD_PITCH)
    house_box(coll, name, spec, (width, run, 0.05), (u, wall_z + depth / 2, top_y - drop / 2),
              mat_name, slope=("z", 1, HOOD_PITCH))
    house_box(coll, f"{name}_lip", spec, (width + 0.04, 0.08, 0.07),
              (u, wall_z + depth, top_y - drop - 0.01), mat_name)


def add_shutter_box(coll, spec, name, u, wall_z, centre_y, height):
    """戸袋: the wooden box beside a window that the amado storm shutters slide into."""
    w, out = 0.55, 0.14
    house_box(coll, name, spec, (w, out, height), (u, wall_z + out / 2, centre_y), SHUTTER)
    for i in range(5):
        y = centre_y - height / 2 + height * (i + 1) / 6
        house_box(coll, f"{name}_slat_{i}", spec, (w - 0.08, 0.02, 0.025),
                  (u, wall_z + out + 0.01, y), TRIM)
    house_box(coll, f"{name}_cap", spec, (w + 0.06, out + 0.05, 0.05),
              (u, wall_z + (out + 0.05) / 2, centre_y + height / 2 + 0.025), TRIM)


def add_skirt(coll, spec, face, base_y, mat_name):
    """下屋: tiled pent roof along one ground-floor wall, from the upper storey's wall face out
    past the ground-floor wall by `SKIRT_OUT`, falling away from the house. Front and back run
    the full width to the eave corners; the sides fill between them."""
    v = spec["v"]
    inset = v["upper_inset"]
    reach = inset + SKIRT_OUT
    run = reach / math.cos(PITCH)
    rise = reach * math.tan(PITCH)
    y, lip_y = base_y + 0.03 + rise / 2, base_y + 0.02
    tag = f"skirt_{spec['id']}_{face}"
    if face in ("front", "back"):
        sign = 1 if face == "front" else -1
        wall = v["depth"] / 2 - inset
        along = v["width"] + 2 * SKIRT_OUT
        house_box(coll, tag, spec, (along, run, 0.06), (0.0, sign * (wall + reach / 2), y),
                  mat_name, slope=("z", sign, PITCH))
        house_box(coll, f"{tag}_lip", spec, (along + 0.04, 0.1, 0.09),
                  (0.0, sign * (wall + reach), lip_y), mat_name)
    else:
        sign = 1 if face == "right" else -1
        wall = v["width"] / 2 - inset
        house_box(coll, tag, spec, (run, v["depth"] - 2 * inset, 0.06),
                  (sign * (wall + reach / 2), 0.0, y), mat_name, slope=("x", sign, PITCH))
        house_box(coll, f"{tag}_lip", spec, (0.1, v["depth"] + 2 * SKIRT_OUT + 0.04, 0.09),
                  (sign * (wall + reach), 0.0, lip_y), mat_name)


def add_gable_attic(coll, spec, base_y, mat_name):
    """Close a gable roof's ends with wall: a pentagon prism under the roof in the storey's
    stucco, so a gable end reads as a wall triangle under dark verge boards, with a small
    louvred vent below the ridge. Sits 4 cm under the roof planes so they never z-fight."""
    v = spec["v"]
    r = v["roof"]
    uw, ud = v["width"] - 2 * v["upper_inset"], v["depth"] - 2 * v["upper_inset"]
    t = math.tan(PITCH)
    along_x = r["axis"] == "x"
    span, length, roof_span = (ud, uw, r["depth"]) if along_x else (uw, ud, r["width"])
    shoulder = (roof_span - span) / 2 * t - 0.04
    apex = roof_span / 2 * t - 0.04
    section = [(-span / 2, base_y), (span / 2, base_y), (span / 2, base_y + shoulder),
               (0.0, base_y + apex), (-span / 2, base_y + shoulder)]
    if along_x:
        verts = [(e * length / 2, a, y) for e in (-1, 1) for a, y in section]
    else:
        verts = [(a, e * length / 2, y) for e in (-1, 1) for a, y in section]
    faces = [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5)] + [
        (i, (i + 1) % 5, 5 + (i + 1) % 5, 5 + i) for i in range(5)]
    house_mesh(coll, f"attic_{spec['id']}", spec, verts, faces, mat_name)
    vent_y = base_y + shoulder + (apex - shoulder) * 0.4
    for e in (-1, 1):
        a = e * (length / 2 + 0.03)
        pos = (a, 0.0, vent_y) if along_x else (0.0, a, vent_y)
        size = (0.06, 0.62, 0.34) if along_x else (0.62, 0.06, 0.34)
        house_box(coll, f"vent_{spec['id']}_{e}", spec, size, pos, TRIM)
        for k in range(3):
            sy = vent_y - 0.1 + k * 0.1
            slat_pos = (a + e * 0.03, 0.0, sy) if along_x else (0.0, a + e * 0.03, sy)
            slat = (0.02, 0.5, 0.03) if along_x else (0.5, 0.02, 0.03)
            house_box(coll, f"vent_{spec['id']}_{e}_{k}", spec, slat, slat_pos, SASH)


def add_verges(coll, spec, base_y):
    """破風: dark boards up both raking edges of each gable end."""
    r = spec["v"]["roof"]
    wx, wz, h = r["width"], r["depth"], r["height"]
    along_x = r["axis"] == "x"
    half_run = (wz if along_x else wx) / 2
    length = math.hypot(half_run, h)
    for e in (-1, 1):
        for sign in (-1, 1):
            name = f"verge_{spec['id']}_{e}_{sign}"
            if along_x:
                house_box(coll, name, spec, (0.05, length, 0.2),
                          (e * wx / 2, sign * half_run / 2, base_y + h / 2 - 0.05), TRIM,
                          slope=("z", sign, PITCH))
            else:
                house_box(coll, name, spec, (length, 0.05, 0.2),
                          (sign * half_run / 2, e * wz / 2, base_y + h / 2 - 0.05), TRIM,
                          slope=("x", sign, PITCH))


def add_ridge(coll, spec, base_y, mat_name):
    """棟: a tall tiled ridge with an onigawara block standing up at each end, and on a hip
    roof the four hip ridges running down to the eave corners."""
    r = spec["v"]["roof"]
    top = base_y + r["height"]
    along_x = r["axis"] == "x"
    length = r["ridge"] + 0.1
    size = (length, 0.26, 0.2) if along_x else (0.26, length, 0.2)
    house_box(coll, f"ridge_{spec['id']}", spec, size, (0.0, 0.0, top + 0.05), mat_name)
    ends = ([(-r["ridge"] / 2, 0.0), (r["ridge"] / 2, 0.0)] if along_x
            else [(0.0, -r["ridge"] / 2), (0.0, r["ridge"] / 2)])
    for k, (ex, ez) in enumerate(ends):
        out = 0.05 if k else -0.05
        pos = (ex + out, ez, top + 0.16) if along_x else (ex, ez + out, top + 0.16)
        block = (0.14, 0.4, 0.42) if along_x else (0.4, 0.14, 0.42)
        house_box(coll, f"onigawara_{spec['id']}_{k}", spec, block, pos, mat_name)
    if is_gable(r):
        return
    wx, wz = r["width"], r["depth"]
    for i, (cx, cz) in enumerate(((-wx / 2, -wz / 2), (wx / 2, -wz / 2),
                                  (wx / 2, wz / 2), (-wx / 2, wz / 2))):
        ex, ez = min(ends, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cz) ** 2)
        a = Vector(P(*place(spec, cx, cz), base_y + 0.04))
        b = Vector(P(*place(spec, ex, ez), top + 0.04))
        d = b - a
        bar = add_box(coll, f"hipridge_{spec['id']}_{i}", (d.length, 0.2, 0.14), (a + b) / 2,
                      mat_name)
        bar.rotation_mode = "QUATERNION"
        bar.rotation_quaternion = d.to_track_quat("X", "Z")


def add_antenna(coll, spec, top_y):
    """The rooftop TV aerial every Showa house carried: a mast off the ridge, three arms."""
    r = spec["v"]["roof"]
    along_x = r["axis"] == "x"
    at = -0.3 * r["ridge"] if r["ridge"] > 2 else 0.0
    base = (at, 0.0) if along_x else (0.0, at)
    add_cylinder(coll, f"antenna_{spec['id']}", 0.025, 1.7,
                 P(*place(spec, *base), top_y + 0.85), "metal", verts=6)
    for k, (y, w) in enumerate(((1.15, 1.1), (1.4, 0.9), (1.62, 0.7))):
        size = (0.03, w, 0.03) if along_x else (w, 0.03, 0.03)
        house_box(coll, f"antenna_{spec['id']}_{k}", spec, size, (base[0], base[1], top_y + y),
                  "metal")


def add_opening(coll, name, spec, face, half_normal, u, y, w, h, glass_mat="glass"):
    """Framed window: four bars proud of the wall, glass just behind them, dark backing flush.
    Nothing is cut into the wall — the frame reads as an inset opening from the street.
    Glazed openings are two-pane aluminium sliding sashes, so they get a meeting stile."""
    bar = 0.07
    for tag, along, height, du, dy in (("t", w + bar * 2, bar, 0, h / 2 + bar / 2),
                                       ("b", w + bar * 2, bar, 0, -h / 2 - bar / 2),
                                       ("l", bar, h, -w / 2 - bar / 2, 0),
                                       ("r", bar, h, w / 2 + bar / 2, 0)):
        house_box(coll, f"{name}_{tag}", spec, face_size(face, along, 0.09, height),
                  face_local(face, half_normal, u + du, 0.045, y + dy), SASH)
    if glass_mat == "glass":
        house_box(coll, f"{name}_m", spec, face_size(face, 0.06, 0.1, h),
                  face_local(face, half_normal, u, 0.05, y), SASH)
    house_box(coll, f"{name}_glass", spec, face_size(face, w, 0.03, h),
              face_local(face, half_normal, u, 0.015, y), glass_mat)
    house_box(coll, f"{name}_back", spec, face_size(face, w, 0.06, h),
              face_local(face, half_normal, u, -0.03, y), "interior")


def add_roof(coll, name, spec, base_y, mat_name):
    """Hip or gable roof from four eave corners and a ridge line. A ridge as long as the roof
    turns the two end triangles into vertical gable ends, so one build covers every variant.
    Sizes are given along the street / toward the street and swapped by the lot's yaw."""
    r = spec["v"]["roof"]
    wx, wz = (r["width"], r["depth"]) if not swapped(spec) else (r["depth"], r["width"])
    axis = r["axis"] if not swapped(spec) else ("z" if r["axis"] == "x" else "x")
    ridge = r["ridge"]
    cx, cz = spec["cx"], spec["cz"]
    top = base_y + r["height"]
    corners = [(-wx / 2, -wz / 2), (wx / 2, -wz / 2), (wx / 2, wz / 2), (-wx / 2, wz / 2)]
    if axis == "x":
        ends = [(-ridge / 2, 0.0), (ridge / 2, 0.0)]
        faces = [(3, 2, 5, 4), (1, 0, 4, 5), (0, 3, 4), (2, 1, 5)]
    else:
        ends = [(0.0, -ridge / 2), (0.0, ridge / 2)]
        faces = [(0, 3, 5, 4), (2, 1, 4, 5), (3, 2, 5), (1, 0, 4)]
    if is_gable(r):
        # The end triangles would be roof-coloured walls; `add_gable_attic` closes them in stucco.
        faces = faces[:2]
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    verts = [bm.verts.new(P(cx + dx, cz + dz, base_y)) for dx, dz in corners]
    verts += [bm.verts.new(P(cx + dx, cz + dz, top)) for dx, dz in ends]
    for face in faces:
        if len({verts[i].co.to_tuple(4) for i in face}) < 3:
            continue
        bm.faces.new([verts[i] for i in face])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(material(mat_name))
    return obj


def add_courses(coll, spec, base_y, mat_name):
    """Course lips every 0.29 m up the two main slopes: the tile banding the eye reads as a
    kawara roof at a distance, at two boxes per course instead of a rib per tile."""
    r = spec["v"]["roof"]
    span = (r["depth"] if r["axis"] == "x" else r["width"]) / 2
    slope = math.hypot(span, r["height"])
    steps = max(int(slope / 0.29), 1)
    eave_across = r["width"] if r["axis"] == "x" else r["depth"]
    # A ridge along local X means the slopes fall toward local +/-Z, and the other way round.
    fall = "z" if r["axis"] == "x" else "x"
    for i in range(1, steps):
        t = i / steps
        s = t * slope
        drop = span * t
        y = base_y + r["height"] * t
        # On a hip the slope is a trapezoid narrowing from the eave to the ridge, so each
        # course has to shorten with it. A gable has ridge == eave_across and stays full
        # width. Holding it constant left the upper courses hanging past the hip lines.
        across = eave_across + (r["ridge"] - eave_across) * t
        for sign in (1, -1):
            offset = sign * (span - drop)
            local = (0.0, offset, y + 0.02) if fall == "z" else (offset, 0.0, y + 0.02)
            size = (across, 0.07, 0.03) if fall == "z" else (0.07, across, 0.03)
            house_box(coll, f"course_{spec['id']}_{i}_{sign}", spec, size, local, mat_name,
                      slope=(fall, sign, PITCH))


def add_eaves(coll, spec, base_y, mat_name, roof_mat):
    """Fascia band round the roof edge with a soffit slab tucked under it, and a thick tile
    roll along every eave edge — the dark kawara lip the eye reads from the street. A gable's
    raking ends get verge boards instead."""
    r = spec["v"]["roof"]
    gable = is_gable(r)
    for tag, size, local in (
        ("f", (r["width"] + 0.08, 0.12, 0.14), (0.0, r["depth"] / 2, base_y - 0.05)),
        ("b", (r["width"] + 0.08, 0.12, 0.14), (0.0, -r["depth"] / 2, base_y - 0.05)),
        ("l", (0.12, r["depth"], 0.14), (-r["width"] / 2, 0.0, base_y - 0.05)),
        ("r", (0.12, r["depth"], 0.14), (r["width"] / 2, 0.0, base_y - 0.05)),
    ):
        house_box(coll, f"eave_{spec['id']}_{tag}", spec, size, local, mat_name)
        front_back = tag in ("f", "b")
        if not gable or front_back == (r["axis"] == "x"):
            lip = (size[0] + 0.06, 0.16, 0.1) if front_back else (0.16, size[1] + 0.06, 0.1)
            house_box(coll, f"eavetile_{spec['id']}_{tag}", spec, lip,
                      (local[0], local[1], base_y + 0.03), roof_mat)
    house_box(coll, f"soffit_{spec['id']}", spec,
              (r["width"] - 0.1, r["depth"] - 0.1, 0.05), (0.0, 0.0, base_y - 0.11), "fascia")


def add_genkan(coll, spec, u, half_d):
    """玄関: a two-leaf aluminium sliding door, frosted glass in four panes a leaf over a
    kick panel, under a narrow transom light."""
    tag = spec["id"]
    w, h, y = 1.6, 2.0, 1.15
    add_opening(coll, f"door_{tag}", spec, "front", half_d, u, y, w, h)
    bottom = y - h / 2
    for k, du in enumerate((-w / 4, w / 4)):
        house_box(coll, f"doorkick_{tag}_{k}", spec, face_size("front", w / 2 - 0.06, 0.05, 0.36),
                  face_local("front", half_d, u + du, 0.04, bottom + 0.18), SASH)
        for r in range(1, 4):
            house_box(coll, f"doormuntin_{tag}_{k}_{r}", spec,
                      face_size("front", w / 2 - 0.06, 0.05, 0.035),
                      face_local("front", half_d, u + du, 0.045, bottom + 0.36 + (h - 0.36) * r / 4),
                      SASH)
    transom_y = y + h / 2 + 0.07 + 0.16
    add_opening(coll, f"transom_{tag}", spec, "front", half_d, u, transom_y, w, 0.26)


def add_porch_lamp(coll, spec, u, half_d):
    """Bracket lamp on the wall beside the front door; glows with the gate lantern at night."""
    tag = spec["id"]
    house_box(coll, f"porchlamp_back_{tag}", spec, (0.12, 0.03, 0.22), (u, half_d + 0.015, 1.95), "iron")
    house_box(coll, f"porchlamp_arm_{tag}", spec, (0.03, 0.1, 0.03), (u, half_d + 0.07, 2.02), "iron")
    house_box(coll, f"porchlamp_lens_{tag}", spec, (0.13, 0.13, 0.18), (u, half_d + 0.15, 1.95),
              "lamp_lens")
    house_box(coll, f"porchlamp_cap_{tag}", spec, (0.17, 0.17, 0.035), (u, half_d + 0.15, 2.055), "iron")


def add_pots(coll, spec, u, half_d):
    """Potted plants either side of the walk where it meets the step, and one on the step."""
    tag = spec["id"]
    spots = ((-0.82, STEP_D + 0.25, 0.0, 0.2, "leaf"), (0.82, STEP_D + 0.3, 0.0, 0.17, "flower_red"),
             (0.78, STEP_D / 2, 0.14, 0.14, "leaf"))
    for k, (du, out, base, r, crown) in enumerate(spots):
        x, z = place(spec, u + du, half_d + out)
        height = r * 1.35
        add_cylinder(coll, f"pot_{tag}_{k}", r * 0.72, height, P(x, z, base + height / 2), "pot",
                     verts=10, radius_top=r * 0.9)
        add_sphere(coll, f"potleaf_{tag}_{k}", r * 1.05, P(x, z, base + height + r * 0.55), "leaf",
                   subdivisions=2)
        if crown != "leaf":
            for f in range(3):
                a = 2.1 * f
                add_sphere(coll, f"potflower_{tag}_{k}_{f}", r * 0.28,
                           P(x + r * 0.55 * math.cos(a), z + r * 0.55 * math.sin(a),
                             base + height + r * 1.1), crown)


def add_propane(coll, spec, lx, lz):
    """プロパン: the pair of gas cylinders chained to a side wall on a concrete pad."""
    tag = spec["id"]
    house_box(coll, f"propanepad_{tag}", spec, (0.5, 0.94, 0.05), (lx, lz + 0.21, 0.025), "concrete")
    for k, dz in enumerate((0.0, 0.42)):
        x, z = place(spec, lx, lz + dz)
        add_cylinder(coll, f"propane_{tag}_{k}", 0.18, 1.1, P(x, z, 0.6), PROPANE, verts=14)
        add_cylinder(coll, f"propanetop_{tag}_{k}", 0.18, 0.12, P(x, z, 1.21), PROPANE, verts=14,
                     radius_top=0.1)
        add_cylinder(coll, f"propaneguard_{tag}_{k}", 0.075, 0.12, P(x, z, 1.33), "metal", verts=8)
    # A band round both cylinders, and the feed pipe back to the wall they stand against.
    house_box(coll, f"propanechain_{tag}", spec, (0.38, 0.8, 0.03), (lx, lz + 0.21, 0.95), "metal")
    house_box(coll, f"propanepipe_{tag}", spec, (0.25, 0.03, 0.03),
              (lx - math.copysign(0.125, lx), lz + 0.21, 1.3), "metal")


def add_laundry_stand(coll, spec, lu, lz):
    """物干し台: two T-stands on concrete feet carrying a pair of poles, washing pegged out."""
    tag = spec["id"]
    span = 2.8
    for k, e in enumerate((-1, 1)):
        u = lu + e * span / 2
        house_box(coll, f"dryfoot_{tag}_{k}", spec, (0.34, 0.34, 0.16), (u, lz, 0.08), "concrete")
        house_box(coll, f"drypost_{tag}_{k}", spec, (0.05, 0.05, 1.75), (u, lz, 0.16 + 0.875), "metal")
        house_box(coll, f"drybar_{tag}_{k}", spec, (0.05, 0.8, 0.05), (u, lz, 1.86), "metal")
    for k, dz in enumerate((-0.36, 0.36)):
        house_box(coll, f"drypole_{tag}_{k}", spec, (span + 0.5, 0.04, 0.04), (lu, lz + dz, 1.9),
                  "rail")
    washing = ((-1.0, 0.55, 0.62, "laundry_a"), (-0.35, 0.44, 0.4, "laundry_b"),
               (0.25, 0.7, 0.55, "plate"), (0.9, 0.36, 0.3, "laundry_a"))
    for k, (du, w, h, mat) in enumerate(washing):
        dz = 0.36 if k % 2 == 0 else -0.36
        house_box(coll, f"drywash_{tag}_{k}", spec, (w, 0.02, h), (lu + du, lz + dz, 1.88 - h / 2), mat)


def add_bicycle(coll, spec, bu, bz):
    """ママチャリ: the step-through town bike with a front basket and a rear rack, parked
    upright in the front yard along the house."""
    tag = spec["id"]

    def pt(a, y, across=0.0):
        return Vector(P(*place(spec, bu + a, bz + across), y))

    radius = 0.33
    # Wheels are rings whose axle runs across the bike: local z, which is world z unless the
    # lot is quarter-turned.
    spin = 0.0 if swapped(spec) else math.pi / 2
    for k, a in enumerate((-0.55, 0.55)):
        ring = add_tube(coll, f"biketyre_{tag}_{k}", radius, 0.04, 0.04, pt(a, radius), TYRE, verts=20)
        ring.rotation_euler = (0.0, 0.0, spin)
        hub = add_tube(coll, f"bikehub_{tag}_{k}", 0.04, 0.02, 0.08, pt(a, radius), "metal", verts=8)
        hub.rotation_euler = (0.0, 0.0, spin)
        for s in range(3):
            angle = s * math.pi / 3
            add_bar(coll, f"bikespoke_{tag}_{k}_{s}",
                    pt(a + (radius - 0.03) * math.cos(angle), radius + (radius - 0.03) * math.sin(angle)),
                    pt(a - (radius - 0.03) * math.cos(angle), radius - (radius - 0.03) * math.sin(angle)),
                    0.008, "metal")
    rear, front = (-0.55, radius), (0.55, radius)
    crank, seat, head_lo, head_hi = (-0.08, 0.3), (-0.26, 0.9), (0.45, 0.72), (0.4, 0.98)
    for name, a, b in (("seat", crank, seat), ("down", crank, head_lo), ("chain", rear, crank),
                       ("stay", rear, (-0.22, 0.8)), ("fork", head_lo, front), ("head", head_lo, head_hi)):
        add_bar(coll, f"bike{name}_{tag}", pt(*a), pt(*b), 0.035, BIKE)
    add_bar(coll, f"bikestem_{tag}", pt(*head_hi), pt(0.3, 1.08), 0.03, "metal")
    add_bar(coll, f"bikebar_{tag}", pt(0.3, 1.08, -0.28), pt(0.3, 1.08, 0.28), 0.028, "metal")
    for k, e in enumerate((-1, 1)):
        add_bar(coll, f"bikegrip_{tag}_{k}", pt(0.3, 1.08, e * 0.28), pt(0.2, 1.08, e * 0.3), 0.04, TYRE)
    add_bar(coll, f"bikeseatpost_{tag}", pt(*seat), pt(-0.27, 0.98), 0.025, "metal")
    for name, size, (a, y, across), mat in (
            ("saddle", (0.26, 0.16, 0.06), (-0.27, 1.01, 0.0), TYRE),
            ("basket", (0.3, 0.34, 0.24), (0.62, 0.93, 0.0), "rail"),
            ("rack", (0.38, 0.2, 0.025), (-0.5, 0.78, 0.0), "metal"),
            ("guard", (0.4, 0.05, 0.1), (-0.3, 0.33, 0.07), BIKE)):
        house_box(coll, f"bike{name}_{tag}", spec, size, (bu + a, bz + across, y), mat)
    add_bar(coll, f"bikestand_{tag}", pt(-0.5, 0.3), pt(-0.52, 0.0, 0.12), 0.02, "metal")


def build_house(coll, spec):
    v, tag = spec["v"], spec["id"]
    wall, roof_mat = spec["wall_mat"], spec["roof_mat"]
    side = -1 if spec["mirror"] else 1
    half_w, half_d = v["width"] / 2, v["depth"] / 2

    house_box(coll, f"gf_{tag}", spec, (v["width"], v["depth"], v["ground_h"]),
              (0.0, 0.0, v["ground_h"] / 2), wall)
    house_box(coll, f"plinth_{tag}", spec, (v["width"] + 0.14, v["depth"] + 0.14, 0.35),
              (0.0, 0.0, 0.175), "concrete_dark")

    upper_h = v["eave_h"] - v["ground_h"]
    uw, ud = v["width"] - 2 * v["upper_inset"], v["depth"] - 2 * v["upper_inset"]
    if v["storeys"] == 2:
        house_box(coll, f"uf_{tag}", spec, (uw, ud, upper_h),
                  (0.0, 0.0, v["ground_h"] + upper_h / 2), wall)
        # The tiled skirt round the ground floor gives the stacked two-roof silhouette: all
        # four walls where the upper storey steps in, the street front where it does not.
        skirt_faces = ("front", "back", "left", "right") if v["upper_inset"] > 0 else ("front",)
        for face in skirt_faces:
            add_skirt(coll, spec, face, v["ground_h"], roof_mat)

    # --- openings -------------------------------------------------------------------
    door_u = spec["door_u"]
    add_genkan(coll, spec, door_u, half_d)
    house_box(coll, f"step_{tag}", spec, (STEP_W, STEP_D, 0.14), (door_u, half_d + STEP_D / 2, 0.07),
              "concrete")
    add_hood(coll, spec, f"porch_{tag}", door_u, half_d, 2.55, 2.3, 0.95, roof_mat)
    add_porch_lamp(coll, spec, door_u + side * 1.12, half_d)
    add_pots(coll, spec, door_u, half_d)

    if spec["variant"] == "gable1":
        u = -side * v["width"] * 0.20
        add_opening(coll, f"veranda_{tag}", spec, "front", half_d, u, 1.45, 2.4, 1.55)
        add_hood(coll, spec, f"verandahood_{tag}", u, half_d, 2.45, 2.7, 0.6, roof_mat)
        add_shutter_box(coll, spec, f"tobukuro_{tag}", u - side * 1.5, half_d, 1.45, 1.7)
    else:
        for k, u in enumerate((-side * v["width"] * 0.30, -side * v["width"] * 0.08)):
            add_opening(coll, f"gfw_{tag}_{k}", spec, "front", half_d, u, 1.55, 1.35, 1.25)
            add_hood(coll, spec, f"gfhood_{tag}_{k}", u, half_d, 2.38, 1.6, 0.45, roof_mat)
        add_shutter_box(coll, spec, f"tobukuro_{tag}", -side * (v["width"] * 0.30 + 0.975),
                        half_d, 1.55, 1.4)

    if v["storeys"] == 2:
        upper_half_d = ud / 2
        for k, u in enumerate((-uw * 0.26, uw * 0.26)):
            add_opening(coll, f"ufw_{tag}_{k}", spec, "front", upper_half_d, u, 4.05, 1.3, 1.2)
            add_hood(coll, spec, f"ufhood_{tag}_{k}", u, upper_half_d, 4.9, 1.55, 0.4, roof_mat)
            add_shutter_box(coll, spec, f"uftobukuro_{tag}_{k}", u + math.copysign(0.95, u),
                            upper_half_d, 4.05, 1.35)
        if spec["variant"] == "gable2":
            # Balcony across the upper front, the block's one bit of projecting structure.
            house_box(coll, f"balcony_{tag}", spec, (uw * 0.66, 1.2, 0.12),
                      (0.0, upper_half_d + 0.6, 3.42), "concrete")
            for i in range(9):
                house_box(coll, f"balrail_{tag}_{i}", spec, (0.05, 0.05, 0.9),
                          (uw * 0.33 - i * (uw * 0.66 / 8), upper_half_d + 1.15, 3.93), "frame")
            house_box(coll, f"balcap_{tag}", spec, (uw * 0.66, 0.07, 0.07),
                      (0.0, upper_half_d + 1.15, 4.41), "frame")
            # 物干し: a laundry pole on two wall brackets, with the washing out to dry.
            pole_y, pole_z = 4.75, upper_half_d + 0.8
            house_box(coll, f"laundrypole_{tag}", spec, (uw * 0.62, 0.04, 0.04),
                      (0.0, pole_z, pole_y), "metal")
            for i, sx in enumerate((-1, 1)):
                house_box(coll, f"laundrybracket_{tag}_{i}", spec, (0.04, 0.8, 0.04),
                          (sx * uw * 0.31, upper_half_d + 0.4, pole_y), "metal")
            # A few short pieces bunched to one side, so the washing reads as washing and the
            # upper windows still show behind it.
            for i, (u, w, h, mat) in enumerate(((-1.9, 0.42, 0.5, "laundry_b"),
                                                (-1.35, 0.5, 0.36, "laundry_a"),
                                                (-0.8, 0.34, 0.44, "postbox"))):
                house_box(coll, f"laundry_{tag}_{i}", spec, (w, 0.02, h),
                          (u, pole_z, pole_y - h / 2), mat)
        for face, u_half in (("left", half_w), ("right", half_w)):
            add_opening(coll, f"sidew_{tag}_{face}", spec, face, u_half, -0.4, 1.6, 1.0, 1.15)
    else:
        for face in ("left", "right"):
            add_opening(coll, f"sidew_{tag}_{face}", spec, face, half_w, -0.4, 1.6, 1.0, 1.15)

    add_opening(coll, f"backw_{tag}", spec, "back", half_d, 0.0, 1.6, 1.2, 1.15)

    # --- roof -----------------------------------------------------------------------
    add_eaves(coll, spec, v["eave_h"], TRIM, roof_mat)
    add_roof(coll, f"roof_{tag}", spec, v["eave_h"], roof_mat)
    add_courses(coll, spec, v["eave_h"], roof_mat)
    r = v["roof"]
    add_ridge(coll, spec, v["eave_h"], roof_mat)
    if is_gable(r):
        add_gable_attic(coll, spec, v["eave_h"], wall)
        add_verges(coll, spec, v["eave_h"])
    if v["storeys"] == 2:
        add_antenna(coll, spec, v["eave_h"] + r["height"])

    # --- services and yard life -------------------------------------------------------
    add_propane(coll, spec, -side * (half_w + 0.25), -half_d + 0.6)
    if v["storeys"] == 1 or spec["variant"] != "gable2":
        # No balcony to hang the washing from: a pair of 物干し台 stands in the back yard.
        add_laundry_stand(coll, spec, -side * 0.6, -half_d - 2.4)
    if spec["index"] % 3 == 0:
        add_bicycle(coll, spec, -side * (half_w - 1.2), half_d + 1.0)
    house_box(coll, f"ac_{tag}", spec, (0.85, 0.36, 0.6),
              (-side * (half_w - 0.9), -half_d - 0.22, 0.65), "plate")
    house_box(coll, f"gutter_{tag}", spec, (r["width"], 0.1, 0.1),
              (0.0, r["depth"] / 2 + 0.06, v["eave_h"] - 0.16), "metal")
    house_box(coll, f"downpipe_{tag}", spec, (0.09, 0.09, v["eave_h"] - 0.1),
              (side * (r["width"] / 2 - 0.15), half_d + 0.06, (v["eave_h"] - 0.1) / 2), "metal")


def build_lot(coll, spec):
    """Yard slab, block wall with a coping course opened for the gate, and the gate."""
    tag = spec["id"]
    x0, x1, z0, z1 = spec["x0"], spec["x1"], spec["z0"], spec["z1"]
    add_box(coll, f"yard_{tag}", (x1 - x0, z1 - z0, 0.08),
            P((x0 + x1) / 2, (z0 + z1) / 2, -0.03), "grass")

    gate_centre = spec["gate"][0] if spec["facing"] in ("+z", "-z") else spec["gate"][1]
    open_z = z1 if spec["facing"] == "+z" else z0 if spec["facing"] == "-z" else None
    open_x = x1 if spec["facing"] == "+x" else None

    def run(name, a0, a1, b0, b1, street=False):
        if a1 - a0 < 0.05 or b1 - b0 < 0.05:
            return
        add_box(coll, f"wall_{tag}_{name}", (a1 - a0, b1 - b0, LOT_WALL_H),
                P((a0 + a1) / 2, (b0 + b1) / 2, LOT_WALL_H / 2), "concrete")
        add_box(coll, f"coping_{tag}_{name}", (a1 - a0 + 0.05, b1 - b0 + 0.05, 0.07),
                P((a0 + a1) / 2, (b0 + b1) / 2, LOT_WALL_H + 0.035), "concrete_dark")
        if not street:
            return
        # 透かしブロック: a course of pierced blocks near the top of the street run, the
        # pattern block every Showa boundary wall carries.
        along_x = (a1 - a0) > (b1 - b0)
        length = max(a1 - a0, b1 - b0)
        n = int(length / 0.8)
        start = (a0 if along_x else b0) + (length - (n - 1) * 0.8) / 2
        y = LOT_WALL_H * 0.72
        for i in range(n):
            t = start + i * 0.8
            cx, cz = (t, (b0 + b1) / 2) if along_x else ((a0 + a1) / 2, t)
            block = (0.38, LOT_WALL_T + 0.02, 0.2) if along_x else (LOT_WALL_T + 0.02, 0.38, 0.2)
            hole = (0.26, LOT_WALL_T + 0.04, 0.1) if along_x else (LOT_WALL_T + 0.04, 0.26, 0.1)
            add_box(coll, f"sukashi_{tag}_{name}_{i}", block, P(cx, cz, y), "concrete_dark")
            add_box(coll, f"sukashi_{tag}_{name}_{i}_hole", hole, P(cx, cz, y), BLOCK_HOLE)

    for side_z in (z0, z1):
        b0, b1 = side_z - LOT_WALL_T / 2, side_z + LOT_WALL_T / 2
        if side_z == open_z:
            run(f"x{side_z}a", x0, gate_centre - GATE_W / 2, b0, b1, street=True)
            run(f"x{side_z}b", gate_centre + GATE_W / 2, x1, b0, b1, street=True)
        else:
            run(f"x{side_z}", x0, x1, b0, b1)
    for side_x in (x0, x1):
        a0, a1 = side_x - LOT_WALL_T / 2, side_x + LOT_WALL_T / 2
        if side_x == open_x:
            run(f"z{side_x}a", a0, a1, z0, gate_centre - GATE_W / 2, street=True)
            run(f"z{side_x}b", a0, a1, gate_centre + GATE_W / 2, z1, street=True)
        else:
            run(f"z{side_x}", a0, a1, z0, z1)

    build_gate(coll, spec)


def gate_frame(spec):
    """World unit vectors at the gate: along the street wall, and pointing into the lot."""
    if spec["facing"] == "+x":
        return (0.0, 1.0), (-1.0, 0.0)
    return (1.0, 0.0), (0.0, -1.0 if spec["facing"] == "+z" else 1.0)


def add_bar(coll, name, a, b, thick, mat_name):
    """Square bar from Blender point `a` to `b`, for anything that is not axis-aligned."""
    d = b - a
    bar = add_box(coll, name, (d.length, thick, thick), (a + b) / 2, mat_name)
    bar.rotation_mode = "QUATERNION"
    bar.rotation_quaternion = d.to_track_quat("X", "Z")
    return bar


def build_gate(coll, spec):
    """門: two capped piers, a pair of lattice leaves hung from them — one left ajar on some
    lots — a lantern on one pier, the nameplate and intercom on the other, and a mailbox."""
    tag, idx = spec["id"], spec["index"]
    (tx, tz), (nx, nz) = gate_frame(spec)
    gx, gz = spec["gate"]

    def at(along, inward, y):
        return Vector(P(gx + tx * along + nx * inward, gz + tz * along + nz * inward, y))

    def sized(along, across, h):
        return (along, across, h) if tx else (across, along, h)

    pier_mat, leaf_mat = GATE_PIER[idx % 3], GATE_LEAF[idx % 3]
    pier_h, pier_w = LOT_WALL_H + 0.25, 0.32
    for k, sign in enumerate((-1, 1)):
        a = sign * (GATE_W / 2 + pier_w / 2)
        add_box(coll, f"gatepier_{tag}_{k}", sized(pier_w, pier_w, pier_h), at(a, 0, pier_h / 2),
                pier_mat)
        add_box(coll, f"gatecap_{tag}_{k}", sized(pier_w + 0.08, pier_w + 0.08, 0.07),
                at(a, 0, pier_h + 0.035), "concrete_dark")

    # Leaves: stiles, three rails and close vertical bars. Every other lot leaves one ajar,
    # swung into the yard over the walk.
    leaf = GATE_W / 2 - 0.03
    for k, sign in enumerate((-1, 1)):
        angle = math.radians(55) if (idx % 2 == 1 and k == 0) else 0.0
        hinge = sign * (GATE_W / 2 - 0.015)
        # Unit direction of the leaf from its hinge toward the gate's middle, then swung in.
        dx = -sign * tx * math.cos(angle) + nx * math.sin(angle)
        dz = -sign * tz * math.cos(angle) + nz * math.sin(angle)
        h0 = (gx + tx * hinge, gz + tz * hinge)

        def leaf_pt(a, y):
            return Vector(P(h0[0] + dx * a, h0[1] + dz * a, y))

        for r, y in enumerate((0.12, 0.62, 1.12)):
            add_bar(coll, f"gaterail_{tag}_{k}_{r}", leaf_pt(0.0, y), leaf_pt(leaf, y), 0.04,
                    leaf_mat)
        for b, a in enumerate((0.02, leaf - 0.02)):
            add_box(coll, f"gatestile_{tag}_{k}_{b}", (0.045, 0.045, 1.08), leaf_pt(a, 0.62),
                    leaf_mat)
        bars = 7
        for b in range(bars):
            a = leaf * (b + 1) / (bars + 1)
            add_box(coll, f"gatebar_{tag}_{k}_{b}", (0.02, 0.02, 1.0), leaf_pt(a, 0.62), leaf_mat)

    # Lantern on the right-hand pier, nameplate and intercom on the left one, mailbox beside.
    lamp_a = GATE_W / 2 + pier_w / 2
    top = pier_h + 0.07
    add_box(coll, f"gatelamp_post_{tag}", sized(0.05, 0.05, 0.12), at(lamp_a, 0, top + 0.06), "iron")
    add_box(coll, f"gatelamp_lens_{tag}", sized(0.17, 0.17, 0.22), at(lamp_a, 0, top + 0.23),
            "lamp_lens")
    for c, (ca, cn) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        add_box(coll, f"gatelamp_corner_{tag}_{c}", (0.03, 0.03, 0.24),
                at(lamp_a + ca * 0.09, cn * 0.09, top + 0.23), "iron")
    add_box(coll, f"gatelamp_cap_{tag}", sized(0.26, 0.26, 0.05), at(lamp_a, 0, top + 0.365), "iron")
    add_box(coll, f"gatelamp_knob_{tag}", sized(0.06, 0.06, 0.06), at(lamp_a, 0, top + 0.42), "iron")

    street = -(pier_w / 2 + 0.015)
    plate_a = -(GATE_W / 2 + pier_w / 2)
    add_box(coll, f"nameplate_{tag}", sized(0.16, 0.03, 0.34), at(plate_a, street, 1.3), "wood")
    add_box(coll, f"nameplate_ink_{tag}", sized(0.04, 0.035, 0.24), at(plate_a, street - 0.002, 1.3),
            "trim")
    add_box(coll, f"intercom_{tag}", sized(0.1, 0.04, 0.15), at(plate_a, street, 0.95), "plate")
    add_box(coll, f"intercom_btn_{tag}", sized(0.04, 0.045, 0.04), at(plate_a, street, 0.92),
            "interior")
    # Mailbox hung on the street face of the wall next to the lantern pier.
    box_a = lamp_a + pier_w / 2 + 0.3
    add_box(coll, f"mailbox_{tag}", sized(0.34, 0.14, 0.4),
            at(box_a, -(LOT_WALL_T / 2 + 0.07), 1.0), MAILBOX)
    add_box(coll, f"mailbox_lid_{tag}", sized(0.38, 0.17, 0.035),
            at(box_a, -(LOT_WALL_T / 2 + 0.08), 1.215), MAILBOX)
    add_box(coll, f"mailbox_slot_{tag}", sized(0.22, 0.145, 0.025),
            at(box_a, -(LOT_WALL_T / 2 + 0.071), 1.1), "interior")


def build_approach(coll, spec):
    """The walk from the gate to the door step, one of three Showa finishes (`approach`)."""
    tag, v = spec["id"], spec["v"]
    u = spec["door_u"]
    z0 = v["depth"] / 2 + STEP_D
    z1 = v["depth"] / 2 + SETBACK
    length, mid = z1 - z0, (z0 + z1) / 2
    style = spec["approach"]
    if style == "slabs":
        # Cut granite in courses on a mortar bed: a full slab, then two halves, alternating.
        house_box(coll, f"walkbed_{tag}", spec, (APPROACH_W, length, 0.03), (u, mid, 0.015),
                  "mortar")
        rows = max(int(length / 0.52), 1)
        pitch = length / rows
        for r in range(rows):
            lz = z0 + pitch * (r + 0.5)
            pieces = ((0.0, APPROACH_W - 0.08),) if r % 2 == 0 else (
                (-APPROACH_W / 4 + 0.01, APPROACH_W / 2 - 0.06),
                (APPROACH_W / 4 - 0.01, APPROACH_W / 2 - 0.06))
            for k, (du, w) in enumerate(pieces):
                house_box(coll, f"walkslab_{tag}_{r}_{k}", spec, (w, pitch - 0.04, 0.04),
                          (u + du, lz, 0.045), "stone")
    elif style == "stones":
        # 飛び石: stepping stones swinging left and right through a strip of raked gravel.
        house_box(coll, f"walkbed_{tag}", spec, (APPROACH_W, length, 0.03), (u, mid, 0.015),
                  GRAVEL)
        count = max(int(length / 0.55), 2)
        for k in range(count):
            lz = z0 + length * (k + 0.5) / count
            du = 0.14 if k % 2 == 0 else -0.14
            x, z = place(spec, u + du, lz)
            add_cylinder(coll, f"walkstone_{tag}_{k}", 0.25 + 0.03 * ((k * 7) % 3), 0.06,
                         P(x, z, 0.05), "stone", verts=7, rot=(0.0, 0.0, 0.7 * k + 0.3))
    else:
        # 洗い出し: washed-aggregate concrete between dark kerbs, with cut joints.
        house_box(coll, f"walkwash_{tag}", spec, (APPROACH_W - 0.12, length, 0.05), (u, mid, 0.025),
                  WASH)
        for k, du in enumerate((-(APPROACH_W / 2 - 0.03), APPROACH_W / 2 - 0.03)):
            house_box(coll, f"walkkerb_{tag}_{k}", spec, (0.06, length, 0.07), (u + du, mid, 0.035),
                      "concrete_dark")
        joints = max(int(length / 0.8), 1)
        for k in range(1, joints):
            house_box(coll, f"walkjoint_{tag}_{k}", spec, (APPROACH_W - 0.12, 0.025, 0.052),
                      (u, z0 + length * k / joints, 0.026), "mortar")


def add_tube(coll, name, radius, wall, length, location, mat_name, verts=16):
    """Hollow pipe lying along X: outer and inner shells with an annulus at each end."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    rings = []
    for x in (-length / 2, length / 2):
        for r in (radius, radius - wall):
            rings.append([bm.verts.new((x, r * math.cos(2 * math.pi * i / verts),
                                        r * math.sin(2 * math.pi * i / verts)))
                          for i in range(verts)])
    outer0, inner0, outer1, inner1 = rings
    for a, b in ((outer0, outer1), (inner1, inner0), (outer1, inner1), (inner0, outer0)):
        for i in range(verts):
            j = (i + 1) % verts
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = location
    obj.data.materials.append(material(mat_name))
    return obj


def bare_edge(theta):
    """Mirrors `bareEdge` in scene.ts: the worn patch's edge as a multiple of its radius."""
    return (1 + 0.10 * math.sin(3 * theta + 0.7) + 0.06 * math.sin(5 * theta - 1.9)
            + 0.04 * math.sin(2 * theta + 2.5))


def add_bare_patch(coll, name, centre, rx, rz, y, mat_name, verts=40):
    """Flat n-gon of trodden earth: an ellipse in world x/z with the shared edge wobble."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    bm = bmesh.new()
    ring = []
    for i in range(verts):
        theta = 2 * math.pi * i / verts
        w = bare_edge(theta)
        ring.append(bm.verts.new(P(centre[0] + rx * w * math.cos(theta),
                                   centre[1] + rz * w * math.sin(theta), y)))
    # World z is Blender -y, so the ring above winds clockwise; reverse it to face up.
    bm.faces.new(reversed(ring))
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(material(mat_name))
    return obj


def build_sandlot(coll, spec):
    """The vacant lot the gang plays baseball in, after the reference art: grass worn to
    earth in the middle, open to the front-road sidewalk, a board fence along the side road
    and block walls on the other two sides, the three big concrete pipes, a pyramid of small
    rings and a bundle of bamboo by the east wall."""
    x0, x1, z0, z1 = spec["x0"], spec["x1"], spec["z0"], spec["z1"]
    fence_h = spec["fence_h"]
    add_box(coll, "sandlot_ground", (x1 - x0, z1 - z0, 0.08),
            P((x0 + x1) / 2, (z0 + z1) / 2, -0.03), "grass")
    for i, (centre, rx, rz) in enumerate(spec["bare"]):
        add_bare_patch(coll, f"bare_{i}", centre, rx, rz, 0.015, "dirt")

    # Boundary per edge, mirroring `sandlotEdge` in scene.ts: the street side is open, the
    # side-road side is a board fence, the other two get the neighbours' block wall.
    def kind(edge):
        return "open" if edge == spec["open"] else "fence" if edge == spec["fence"] else "wall"

    def geometry(edge):
        """(along_x, fixed coordinate, low end, high end, inward sign) of one edge, world."""
        if edge == "-z":
            return True, z0, x0, x1, 1
        if edge == "+z":
            return True, z1, x0, x1, -1
        if edge == "-x":
            return False, x0, z0, z1, 1
        return False, x1, z0, z1, -1

    plank_w, pitch, plank_t = 0.14, 0.17, 0.025
    for edge in ("-x", "+x", "-z", "+z"):
        along_x, fixed, lo, hi, inward = geometry(edge)
        k = kind(edge)
        if k == "open":
            continue
        mid = (lo + hi) / 2
        if k == "wall":
            # Extended half a thickness each end so two walls close their corner.
            size = ((hi - lo + LOT_WALL_T, LOT_WALL_T, LOT_WALL_H) if along_x
                    else (LOT_WALL_T, hi - lo + LOT_WALL_T, LOT_WALL_H))
            pos = P(mid, fixed, LOT_WALL_H / 2) if along_x else P(fixed, mid, LOT_WALL_H / 2)
            add_box(coll, f"sandlot_wall_{edge}", size, pos, "concrete")
            cap = (size[0] + 0.05, size[1] + 0.05, 0.07)
            cap_pos = (P(mid, fixed, LOT_WALL_H + 0.035) if along_x
                       else P(fixed, mid, LOT_WALL_H + 0.035))
            add_box(coll, f"sandlot_coping_{edge}", cap, cap_pos, "concrete_dark")
            continue
        # Board fence: boards on 0.17 m centres with a hair of height jitter so the top edge
        # reads hand-built, two rails on the inside, a post every two metres. Boards stop
        # short of a wall they meet, and run to the corner where the edge is open.
        ends = ("-x", "+x") if along_x else ("-z", "+z")
        a0 = lo + (LOT_WALL_T / 2 if kind(ends[0]) == "wall" else 0.0)
        a1 = hi - (LOT_WALL_T / 2 if kind(ends[1]) == "wall" else 0.0)
        n = int((a1 - a0) / pitch)
        start = a0 + ((a1 - a0) - (n - 1) * pitch) / 2
        for i in range(n):
            h = fence_h + 0.05 * (((i * 7919) % 13) / 13 - 0.5)
            a = start + i * pitch
            size = (plank_w, plank_t, h) if along_x else (plank_t, plank_w, h)
            pos = P(a, fixed, h / 2) if along_x else P(fixed, a, h / 2)
            add_box(coll, f"board_{edge}_{i}", size, pos, "board")
        rail_at = fixed + inward * 0.04
        for j, rail_h in enumerate((0.42, 1.05)):
            size = (a1 - a0, 0.04, 0.06) if along_x else (0.04, a1 - a0, 0.06)
            pos = P((a0 + a1) / 2, rail_at, rail_h) if along_x else P(rail_at, (a0 + a1) / 2, rail_h)
            add_box(coll, f"board_rail_{edge}_{j}", size, pos, "wood_door")
        post_at = fixed + inward * 0.06
        for j, a in enumerate([a0] + [a0 + m * 2.0 for m in range(1, int((a1 - a0) / 2.0) + 1)]
                              + [a1]):
            pos = (P(a, post_at, (fence_h + 0.1) / 2) if along_x
                   else P(post_at, a, (fence_h + 0.1) / 2))
            add_box(coll, f"board_post_{edge}_{j}", (0.11, 0.11, fence_h + 0.1), pos, "wood_door")

    # Three concrete pipes, two on the ground and one nested on top, lying along x.
    pipes = spec["pipes"]
    cx, cz = pipes["centre"]
    r, ln = pipes["radius"], pipes["length"]
    gap = 0.03
    stack = [(r, -(r + gap)), (r, r + gap), (r + math.sqrt(3) * (r + gap), 0.0)]
    for i, (y, dz) in enumerate(stack):
        add_tube(coll, f"pipe_{i}", r, 0.08, ln, P(cx, cz + dz, y), "concrete")

    # Six small rings stacked 3-2-1, mouths to the street.
    rings = spec["rings"]
    rcx, rcz = rings["centre"]
    rr, rl = rings["radius"], rings["length"]
    row, rise = 2 * rr + 0.02, math.sqrt(3) * (rr + 0.01)
    pyramid = [(-row, rr), (0.0, rr), (row, rr), (-row / 2, rr + rise), (row / 2, rr + rise),
               (0.0, rr + 2 * rise)]
    for i, (dx, y) in enumerate(pyramid):
        ring = add_tube(coll, f"ring_{i}", rr, 0.05, rl, P(rcx + dx, rcz, y), "concrete",
                        verts=12)
        ring.rotation_euler = (0.0, 0.0, math.pi / 2)

    # Bamboo bundle: seven poles in a hex pack lying along z, tied near each end.
    poles = spec["poles"]
    pcx, pcz = poles["centre"]
    pr, pl = poles["radius"], poles["length"]
    cane = pr / 3
    pack = [(0.0, 0.0)] + [(2 * cane * math.cos(a), 2 * cane * math.sin(a))
                           for a in (k * math.pi / 3 for k in range(6))]
    for i, (dx, dy) in enumerate(pack):
        pole = add_cylinder(coll, f"bamboo_{i}", cane, pl, P(pcx + dx, pcz, pr + dy),
                            "bamboo", verts=6)
        pole.rotation_euler = (math.pi / 2, 0.0, 0.0)
    for k, dz in enumerate((-pl * 0.35, pl * 0.35)):
        add_box(coll, f"bamboo_tie_{k}", (2 * pr + 0.03, 0.05, 2 * pr + 0.03),
                P(pcx, pcz + dz, pr), "wire")


def build():
    coll = fresh_collection(COLLECTION)
    for index, spec in enumerate(LOTS):
        spec["index"] = index
        prepare(spec)
        build_lot(coll, spec)
        build_approach(coll, spec)
        build_house(coll, spec)
    build_sandlot(coll, SANDLOT)
    bpy.context.view_layer.update()
    apply_world_uvs(coll.objects)
    faces = sum(len(o.data.polygons) for o in coll.objects if o.type == "MESH")
    mats = {s.material.name for o in coll.objects for s in o.material_slots if s.material}
    print(f"NEIGHBOURS built: {len(coll.objects)} objects, {faces} faces, {len(mats)} materials")
    return coll


build()
