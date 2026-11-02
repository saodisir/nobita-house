"""Build the yard, block wall, gate and lot props for the Nobita house diorama.

Trees and shrubs are deliberately absent: they are placed per instance by the web app from
`src/data/scene.ts`, so a Hyper3D Rodin tree can replace the placeholder without a re-export.

The sidewalk, road, kerb and utility poles are NOT here: `streets_build.py` owns every
surface outside a lot wall, so the crossroads is not built twice and cannot z-fight.

Runs inside Blender. Everything is created in a fresh "ENV" collection so the rest of the
user's scene is untouched. Units are metres, Blender Z-up (glTF export converts to Y-up).
The street is at +Y in Blender (which becomes +Z in the exported glTF). The house itself is
not built here: it is `src/editor/house/plan.ts`, placed by `src/data/house-site.ts`, whose
world axes these lot coordinates share (Blender Y = app z, until the Y flip below).

Run:  exec(open("scripts/blender/env_build.py").read())
"""

import math
import os

import bpy

# bmesh, Vector and the primitive helpers come in with env_helpers.py, below.

# --- layout, mirrors src/data/scene.ts -------------------------------------------------
LOT_W, LOT_D = 15.0, 18.0
WALL_H, WALL_T = 1.6, 0.22
FRONT_Y = 5.8           # front wall line
# On the hallway's axis, with the front door (`HOUSE_ORIGIN` in src/data/house-site.ts puts it
# at x 1.02): gate, path, door and hall line up.
GATE_X, GATE_W = 1.02, 1.4
# The porch's front edge (`HOUSE_STEPS` in src/data/house-site.ts): the 2 m walk from the
# gate runs from here to the front wall. The path is 1.2 m wide on the door's axis.
PORCH_FRONT = 3.69
PATH_X0, PATH_X1 = 0.42, 1.62

COLLECTION = "ENV"
ROOT_DIR = "/Users/khoale/Devs/khoale/nobita-house-3d"
SCRIPTS_DIR = f"{ROOT_DIR}/scripts/blender"
exec(open(os.path.join(SCRIPTS_DIR, "env_helpers.py")).read())

def build_shed(coll):
    """Storage shed in the back yard's east corner, red gable roof, doors facing the house.

    It stands in the back yard's corner nearest the kitchen's back door (勝手口, on the
    kitchen's east face)."""
    sx, sy = 5.9, -11.0
    add_box(coll, "shed_slab", (2.40, 1.80, 0.10), (sx, sy, 0.05), "concrete")
    add_box(coll, "shed_walls", (2.20, 1.60, 1.85), (sx, sy, 0.10 + 1.85 / 2), "shed_wall")
    for k in range(2):
        door_x = sx - 0.50 + k * 1.00
        add_box(coll, f"shed_door_{k}", (0.88, 0.05, 1.55), (door_x, sy + 0.81, 0.92), "wood")
        add_box(coll, f"shed_door_frame_{k}", (0.06, 0.06, 1.55),
                (door_x + 0.46, sy + 0.82, 0.92), "shed_wall")
    add_box(coll, "shed_handle", (0.05, 0.06, 0.22), (sx, sy + 0.85, 0.95), "metal")
    add_gable_prism(coll, "shed_roof", (2.60, 2.05, 0.62), (sx, sy, 1.95), "shed_roof")
    add_box(coll, "shed_ridge", (2.64, 0.10, 0.06), (sx, sy, 2.57), "shed_wall")


def build_path(coll):
    """The entrance: a cut-stone path from the gate to the porch on the door's axis, and
    stepping stones from it to the garden.

    The path is laid in rows that alternate one full-width slab with two half slabs, so no
    joint runs the whole way, over a dark bedding that shows in the joints; a threshold slab
    fills the gate opening between the posts. The stepping stones leave the path's west edge
    in front of the shrub bed, turn down the west yard round the house's front-west corner and
    end at a raised shoe stone before the living room's garden doors and their engawa step."""
    wall_in = FRONT_Y - WALL_T / 2
    length = wall_in - PORCH_FRONT
    width = PATH_X1 - PATH_X0
    cx = (PATH_X0 + PATH_X1) / 2
    add_box(coll, "path_bed", (width, length, 0.02), (cx, PORCH_FRONT + length / 2, 0.01),
            "concrete_dark")
    add_box(coll, "gate_threshold", (GATE_W, WALL_T, 0.05), (GATE_X, FRONT_Y, 0.025), "paving")
    joint = 0.03
    rows = round(length / 0.45)
    row_d = length / rows
    for k in range(rows):
        yc = PORCH_FRONT + (k + 0.5) * row_d
        slabs = [(PATH_X0, PATH_X1)] if k % 2 == 0 else [(PATH_X0, cx), (cx, PATH_X1)]
        for j, (a, b) in enumerate(slabs):
            add_box(coll, f"path_slab_{k}_{j}", (b - a - joint, row_d - joint, 0.05),
                    ((a + b) / 2, yc, 0.025), "paving")
    for k, (x, y, r) in enumerate(STEPPING_STONES):
        add_cylinder(coll, f"path_stone_{k}", r, 0.06, (x, y, 0.03), "stone", verts=9)
    # 沓脱石: the shoe stone, stood 12 cm high where the engawa (0.24 m) meets the garden.
    add_box(coll, "shoe_stone", (0.50, 0.80, 0.12), (-4.78, -2.71, 0.06), "stone")


# (x, y, radius) of each stepping stone, a stride (~0.68 m) apart, path to engawa.
STEPPING_STONES = [
    (-0.05, 4.16, 0.24), (-0.72, 4.06, 0.22), (-1.40, 4.12, 0.25), (-2.08, 4.02, 0.22),
    (-2.76, 4.08, 0.24), (-3.44, 3.98, 0.22), (-4.10, 3.82, 0.25), (-4.66, 3.42, 0.22),
    (-5.02, 2.84, 0.24), (-5.20, 2.18, 0.22), (-5.18, 1.50, 0.25), (-5.10, 0.82, 0.22),
    (-5.02, 0.14, 0.24), (-4.96, -0.54, 0.22), (-4.92, -1.22, 0.24), (-4.92, -1.86, 0.20),
]

# Bonsai on the bench: pot centre x, the trunk as points (x offset, height above the moss)
# bending left and right up to its apex, and side branches from a trunk point to a tip.
# Every tip, the apex included, carries a foliage pad of the given height; the pads are
# the garden hedge's leaf-card shrub at bonsai scale, placed by `layout.hedges` in
# src/data/scene.ts from the same numbers (`bonsai_pads()` lists them).
BONSAI_Y = 3.95
BONSAI_MOSS = 0.552
BONSAI = [
    dict(x=4.33, trunk=[(-0.04, 0.0), (0.03, 0.10), (-0.03, 0.19), (0.02, 0.27)], apex=0.16,
         branches=[(1, (0.12, 0.17), 0.12)]),
    dict(x=4.85, trunk=[(0.05, 0.0), (-0.03, 0.12), (0.04, 0.24), (-0.02, 0.34)], apex=0.18,
         branches=[(2, (0.14, 0.27), 0.12), (1, (-0.13, 0.16), 0.11)]),
    dict(x=5.37, trunk=[(0.06, 0.0), (0.0, 0.08), (-0.08, 0.13), (-0.12, 0.20)], apex=0.14,
         branches=[(1, (0.07, 0.18), 0.11)]),
]
# A pad's base sits this fraction of its height below the tip, so the wood runs into it.
PAD_SINK = 0.35


def bonsai_pads():
    """(x, base height, pad height) of every foliage pad, world metres."""
    pads = []
    for tree in BONSAI:
        tips = [(tree["trunk"][-1], tree["apex"])] + [(tip, h) for _, tip, h in tree["branches"]]
        for (dx, dz), h in tips:
            pads.append((round(tree["x"] + dx, 3), round(BONSAI_MOSS + dz - PAD_SINK * h, 3), h))
    return pads


def build_bonsai(coll):
    """Each tree: a shallow glazed pot with a moss top, and a tapering trunk that bends as it
    climbs, built as one tilted cylinder per bend with a knuckle at each joint. Its foliage is
    not built here (see `BONSAI`)."""
    glaze = register_colour("bonsai_glaze", hex_rgba("#4A5563"))
    moss = register_colour("bonsai_moss", hex_rgba("#5E7A3A"))

    def limb(name, a, b, r0, r1, px):
        (ax, az), (bx, bz) = a, b
        dx, dz = bx - ax, bz - az
        add_cylinder(coll, name, r0, math.hypot(dx, dz),
                     (px + (ax + bx) / 2, BONSAI_Y, BONSAI_MOSS + (az + bz) / 2), "bark", verts=7,
                     radius_top=r1, rot=(0, math.atan2(dx, dz), 0))
        add_sphere(coll, f"{name}_knuckle", r1, (px + bx, BONSAI_Y, BONSAI_MOSS + bz), "bark")

    for k, tree in enumerate(BONSAI):
        px = tree["x"]
        add_box(coll, f"bonsai_pot_{k}", (0.32, 0.22, 0.07), (px, BONSAI_Y, 0.505), glaze)
        add_box(coll, f"bonsai_moss_{k}", (0.29, 0.19, 0.012), (px, BONSAI_Y, 0.546), moss)
        trunk = tree["trunk"]
        radii = [0.028 - 0.016 * i / (len(trunk) - 1) for i in range(len(trunk))]
        for i in range(len(trunk) - 1):
            limb(f"bonsai_trunk_{k}_{i}", trunk[i], trunk[i + 1], radii[i], radii[i + 1], px)
        for j, (at, tip, _) in enumerate(tree["branches"]):
            limb(f"bonsai_branch_{k}_{j}", trunk[at], tip, radii[at] * 0.6, 0.008, px)


def build_gate_props(coll):
    """Post box mounted on the gate pier. Drains and crossings belong to streets_build.py."""
    add_box(coll, "postbox", (0.34, 0.20, 0.26),
            (GATE_X + GATE_W / 2 + 0.13, FRONT_Y + 0.22, 1.32), "postbox")
    add_box(coll, "postbox_slot", (0.24, 0.03, 0.03),
            (GATE_X + GATE_W / 2 + 0.13, FRONT_Y + 0.33, 1.40), "concrete_dark")


def build_yard_props(coll):
    """Lived-in details around the house. Must run before the export Y-flip; every mesh is
    symmetric about its own Y so only object locations mirror. Moving a prop that stands on
    the lawn means moving its keep-out in `src/scene/lawn-placement.ts` too, or grass grows
    through it."""
    # Clothesline in the west yard behind the living room, running front to back beside the
    # kitchen block, whose glass door and step open onto it. Two T-poles with their tees
    # across the line, a pole between them, three towels.
    line_x = -5.8
    for k, py in enumerate((-4.9, -8.5)):
        add_cylinder(coll, f"laundry_post_{k}", 0.045, 1.70, (line_x, py, 0.85), "metal", verts=8)
        add_cylinder(coll, f"laundry_tee_{k}", 0.035, 0.70, (line_x, py, 1.62), "metal", verts=6,
                     rot=(0, math.radians(90), 0))
    add_cylinder(coll, "laundry_pole", 0.025, 3.60, (line_x, -6.7, 1.55), "wood", verts=6,
                 rot=(math.radians(90), 0, 0))
    for k, (ty, mat) in enumerate(((-5.6, "laundry_a"), (-6.7, "laundry_b"), (-7.8, "laundry_a"))):
        add_box(coll, f"laundry_towel_{k}", (0.025, 0.55, 0.48), (line_x, ty, 1.29), mat)

    # Bonsai bench in the entrance court, east of the path — Nobita's dad's pride, where a
    # visitor passes it. Clear of the hedge along the wall and the tree in the corner.
    add_box(coll, "bonsai_bench", (1.60, 0.50, 0.10), (4.85, BONSAI_Y, 0.42), "wood")
    for k, lx in enumerate((-0.55, 0.0, 0.55)):
        add_box(coll, f"bonsai_leg_{k}", (0.08, 0.42, 0.42), (4.85 + lx, BONSAI_Y, 0.21), "wood")
    build_bonsai(coll)

    # Garden tap with basin and bucket against the west boundary wall, beside the stepping
    # stones where they turn down the west yard.
    add_box(coll, "tap_post", (0.12, 0.12, 0.78), (-6.95, 1.3, 0.39), "concrete_dark")
    add_cylinder(coll, "tap_spout", 0.025, 0.22, (-6.95, 1.46, 0.68), "metal", verts=6,
                 rot=(math.radians(90), 0, 0))
    add_box(coll, "tap_basin", (0.55, 0.45, 0.16), (-6.95, 1.65, 0.08), "concrete")
    add_cylinder(coll, "tap_bucket", 0.14, 0.24, (-6.4, 1.55, 0.12), "postbox", verts=10)

    # Machinery against the outer walls (`HOUSE_SHELL` in src/data/house-site.ts): the AC
    # outdoor unit on the west face, centred in the one clear span between the upper-storey
    # downpipe and the hood and shutter box over the garden doors, clear of the engawa step
    # and both west windows; the water heater on the east face between the wet block's front
    # corner and the washroom window. Grille and flue face out into the yard.
    add_box(coll, "ac_unit", (0.36, 0.85, 0.62), (-3.835, -1.01, 0.36), "appliance")
    add_box(coll, "ac_grille", (0.04, 0.55, 0.44), (-4.035, -1.01, 0.38), "metal")
    add_box(coll, "heater", (0.40, 0.55, 0.95), (3.975, -1.31, 0.48), "appliance")
    add_cylinder(coll, "heater_flue", 0.045, 0.30, (4.06, -1.31, 1.10), "metal", verts=8)

    # Stone lantern in the west garden, in the view from the living room's garden doors.
    lx, ly = -6.7, -3.3
    add_cylinder(coll, "lantern_base", 0.24, 0.22, (lx, ly, 0.11), "concrete_dark", verts=10)
    add_cylinder(coll, "lantern_column", 0.11, 0.55, (lx, ly, 0.50), "concrete", verts=8)
    add_box(coll, "lantern_house", (0.34, 0.34, 0.28), (lx, ly, 0.92), "concrete_dark")
    add_cylinder(coll, "lantern_cap", 0.30, 0.22, (lx, ly, 1.17), "concrete", verts=8,
                 radius_top=0.05)
    add_sphere(coll, "lantern_tip", 0.06, (lx, ly, 1.32), "concrete_dark")

    # Flower bed in front of the hedge along the front wall, left of the gate, west of where
    # the stepping stones pass.
    add_box(coll, "flowerbed_soil", (2.55, 0.40, 0.14), (-5.025, 4.44, 0.07), "soil")
    palette = ("flower_red", "flower_yellow", "flower_white", "flower_red", "flower_yellow",
               "flower_white", "flower_red")
    for k, mat in enumerate(palette):
        fx = -6.1 + k * 0.38
        add_sphere(coll, f"flower_leaf_{k}", 0.11, (fx, 4.44, 0.16), "leaf")
        add_sphere(coll, f"flower_{k}", 0.07, (fx, 4.44, 0.28), mat)

    # Kerbed shrub beds against the street faces, planted from `layout.hedges` in
    # src/data/scene.ts: under the 洋室 window left of the porch, and in front of the toilet
    # where the wet block stands 3 m back from the genkan. The wall closes the back of each
    # bed, so kerbs run along the front (y1) and the two ends.
    for tag, (x0, x1), (y0, y1) in (("front", (-3.55, 0.30), (2.765, 3.60)),
                                    ("toilet", (2.00, 3.75), (-0.193, 0.60))):
        add_box(coll, f"facade_bed_{tag}_kerb", (x1 - x0, 0.08, 0.14),
                ((x0 + x1) / 2, y1 - 0.04, 0.07), "concrete")
        for side, sx in (("w", x0 + 0.04), ("e", x1 - 0.04)):
            add_box(coll, f"facade_bed_{tag}_kerb_{side}", (0.08, y1 - y0 - 0.08, 0.14),
                    (sx, (y0 + y1 - 0.08) / 2, 0.07), "concrete")
        add_box(coll, f"facade_bed_{tag}_soil", (x1 - x0 - 0.16, y1 - y0 - 0.08, 0.10),
                ((x0 + x1) / 2, (y0 + y1 - 0.08) / 2, 0.05), "soil")

    # Gravel drainage bands hugging the outer walls (`HOUSE_SHELL` in src/data/house-site.ts)
    # on the non-street sides. The west and kitchen-west runs are split where the engawa and
    # the kitchen step stand where a band would run; the street faces have the porch, the
    # path and the shrub beds instead.
    add_box(coll, "gravel_west_front", (0.35, 4.575, 0.03), (-3.83, 0.4775, 0.015), "stone")
    add_box(coll, "gravel_west_back", (0.35, 1.055, 0.03), (-3.83, -4.1375, 0.015), "stone")
    add_box(coll, "gravel_east", (0.35, 4.472, 0.03), (3.95, -2.429, 0.015), "stone")
    add_box(coll, "gravel_kitchen_w_n", (0.35, 0.495, 0.03), (-2.92, -4.9125, 0.015), "stone")
    add_box(coll, "gravel_kitchen_w_s", (0.35, 1.19, 0.03), (-2.92, -7.255, 0.015), "stone")
    add_box(coll, "gravel_kitchen_e", (0.35, 2.095, 0.03), (3.04, -5.7125, 0.015), "stone")
    add_box(coll, "gravel_kitchen_back", (6.31, 0.35, 0.03), (0.06, -8.025, 0.015), "stone")


def build():
    coll = fresh_collection(COLLECTION)
    half_w, half_d = LOT_W / 2, LOT_D / 2
    back_y = FRONT_Y - LOT_D

    # yard
    add_box(coll, "yard", (LOT_W, LOT_D, 0.08), (0, FRONT_Y - half_d, -0.04), "grass")

    # front wall, split around the gate opening
    left_len = (GATE_X - GATE_W / 2) + half_w
    right_len = half_w - (GATE_X + GATE_W / 2)
    add_box(coll, "wall_front_left", (left_len, WALL_T, WALL_H),
            (-half_w + left_len / 2, FRONT_Y, WALL_H / 2), "concrete")
    add_box(coll, "wall_front_right", (right_len, WALL_T, WALL_H),
            (half_w - right_len / 2, FRONT_Y, WALL_H / 2), "concrete")
    # coping course on top of every wall run
    add_box(coll, "wall_coping_left", (left_len, WALL_T + 0.06, 0.07),
            (-half_w + left_len / 2, FRONT_Y, WALL_H + 0.035), "concrete_dark")
    add_box(coll, "wall_coping_right", (right_len, WALL_T + 0.06, 0.07),
            (half_w - right_len / 2, FRONT_Y, WALL_H + 0.035), "concrete_dark")

    # Block coursing: recessed-looking mortar lines. Horizontal joints on every run,
    # staggered vertical joints on the street-facing segments only.
    course_h = 0.4
    runs = [
        ("front_l", (-half_w + left_len / 2, FRONT_Y), left_len, "x", True),
        ("front_r", (half_w - right_len / 2, FRONT_Y), right_len, "x", True),
        ("back", (0, back_y), LOT_W, "x", False),
        ("left", (-half_w, FRONT_Y - half_d), LOT_D, "y", False),
        ("right", (half_w, FRONT_Y - half_d), LOT_D, "y", False),
    ]
    for tag, (cx, cy), length, axis, stagger in runs:
        for level in range(1, 4):
            size = (length - 0.05, WALL_T + 0.016, 0.018) if axis == "x" else                    (WALL_T + 0.016, length - 0.05, 0.018)
            add_box(coll, f"joint_h_{tag}_{level}", size, (cx, cy, course_h * level), "mortar")
        if not stagger:
            continue
        for level in range(4):
            offset = (course_h if level % 2 else 0.0)
            n = int(length / 0.8)
            for k in range(n + 1):
                x = cx - length / 2 + offset + k * 0.8
                if x < cx - length / 2 + 0.1 or x > cx + length / 2 - 0.1:
                    continue
                add_box(coll, f"joint_v_{tag}_{level}_{k}", (0.016, WALL_T + 0.014, course_h - 0.03),
                        (x, cy, course_h * level + course_h / 2), "mortar")

    # Breeze-block vents in the top course: recessed dark opening, thin frame, X-pattern insert.
    vent_y = FRONT_Y
    vent_z = WALL_H - 0.32
    for i in range(-6, 7):
        x = i * 1.0
        if abs(x - GATE_X) < GATE_W / 2 + 0.4 or abs(x) > half_w - 0.3:
            continue
        add_box(coll, f"vent_back_{i}", (0.34, WALL_T - 0.06, 0.34), (x, vent_y, vent_z),
                "concrete_dark")
        for tag, size, off in (("t", (0.40, WALL_T + 0.03, 0.035), (0, 0.183)),
                               ("b", (0.40, WALL_T + 0.03, 0.035), (0, -0.183)),
                               ("l", (0.035, WALL_T + 0.03, 0.40), (-0.183, 0)),
                               ("r", (0.035, WALL_T + 0.03, 0.40), (0.183, 0))):
            add_box(coll, f"vent_frame_{i}_{tag}", size, (x + off[0], vent_y, vent_z + off[1]),
                    "concrete")
        for sign, tag in ((1, "a"), (-1, "b")):
            bar = add_box(coll, f"vent_cross_{i}_{tag}", (0.44, WALL_T + 0.02, 0.05),
                          (x, vent_y, vent_z), "concrete")
            bar.rotation_euler[1] = sign * math.radians(45)

    # Reinforcing piers: at the corners and mid-run, with a small cap, like real block walls.
    pier_positions = [(-half_w, FRONT_Y), (half_w, FRONT_Y), (-half_w, back_y), (half_w, back_y),
                      (-3.7, FRONT_Y), (4.5, FRONT_Y)]
    for index, (px, py) in enumerate(pier_positions):
        add_box(coll, f"pier_{index}", (0.32, WALL_T + 0.12, WALL_H + 0.10),
                (px, py, (WALL_H + 0.10) / 2), "concrete")
        add_box(coll, f"pier_cap_{index}", (0.38, WALL_T + 0.18, 0.06),
                (px, py, WALL_H + 0.13), "concrete_dark")

    # side + back walls
    add_box(coll, "wall_left", (WALL_T, LOT_D, WALL_H), (-half_w, FRONT_Y - half_d, WALL_H / 2), "concrete")
    add_box(coll, "wall_right", (WALL_T, LOT_D, WALL_H), (half_w, FRONT_Y - half_d, WALL_H / 2), "concrete")
    add_box(coll, "wall_back", (LOT_W, WALL_T, WALL_H), (0, back_y, WALL_H / 2), "concrete")

    # gate: two posts, two open wrought-iron leaves, and the 野比 nameplate
    post_h = WALL_H + 0.25
    for sign, tag in ((-1, "l"), (1, "r")):
        add_box(coll, f"gate_post_{tag}", (0.26, 0.26, post_h),
                (GATE_X + sign * (GATE_W / 2 + 0.13), FRONT_Y, post_h / 2), "concrete_dark")

    # The leaves follow `assets/home.jpg`: vertical bars in a flat frame, hinged on the inner
    # faces of the posts and standing open 70° into the yard, so nothing reaches the sidewalk
    # where the characters gather. Built street-at-+Y like everything else here, so "into the
    # yard" is -Y until the flip below.
    def iron_leaf(tag, hinge_x, closed_dir):
        leaf_w, leaf_h, leaf_z0 = GATE_W / 2 - 0.03, 1.30, 0.06
        hinge_y = FRONT_Y - 0.10  # in the inner half of the post, so the leaf swings clear of it
        open_rad = math.radians(70)
        dx, dy = closed_dir * math.cos(open_rad), -math.sin(open_rad)
        angle = math.atan2(dy, dx)

        def member(name, along, size, z):
            obj = add_box(coll, f"gate_{tag}_{name}", size,
                          (hinge_x + dx * along, hinge_y + dy * along, z), "iron")
            obj.rotation_euler.z = angle
            return obj

        for stile, along in (("hinge_stile", 0.02), ("latch_stile", leaf_w - 0.02)):
            member(stile, along, (0.04, 0.04, leaf_h), leaf_z0 + leaf_h / 2)
        for rail, z in (("bottom_rail", leaf_z0 + 0.02), ("top_rail", leaf_z0 + leaf_h - 0.02)):
            member(rail, leaf_w / 2, (leaf_w, 0.035, 0.04), z)
        bars = 6
        for k in range(1, bars + 1):
            along = 0.02 + k * (leaf_w - 0.04) / (bars + 1)
            member(f"bar_{k}", along, (0.018, 0.018, leaf_h - 0.08), leaf_z0 + leaf_h / 2)

    iron_leaf("l", GATE_X - GATE_W / 2, 1)
    iron_leaf("r", GATE_X + GATE_W / 2, -1)
    add_box(coll, "nameplate", (0.26, 0.03, 0.34),
            (GATE_X + GATE_W / 2 + 0.28, FRONT_Y - 0.12, 1.15), "plate")

    build_shed(coll)
    build_path(coll)
    build_gate_props(coll)
    build_yard_props(coll)

    # Blender is Z-up/Y-forward and the glTF exporter maps Blender +Y to glTF -Z, which would
    # put the street behind the house. Negating each object's Y mirrors it across the XZ plane,
    # which is enough for primitives symmetric about their own Y axis. The same mirror turns a
    # rotation about Z the other way, so that is negated too for the open gate leaves; the vent
    # crosses turn about Y, which the mirror leaves alone.
    # Anything built after this loop would export mirrored, so it must stay last.
    for obj in coll.objects:
        obj.location.y = -obj.location.y
        obj.rotation_euler.z = -obj.rotation_euler.z
    bpy.context.view_layer.update()
    apply_world_uvs(coll.objects)

    print(f"ENV built: {len(coll.objects)} objects")
    return coll


build()
