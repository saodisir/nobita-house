"""Build the public realm around Nobita's block: the crossroads, its sidewalks, kerbs,
markings, drains and the utility poles with their wires. Exports as the STREETS collection.

Everything outside a lot wall lives here, and nothing else builds it, so no two GLBs can
fight over the same square metre. `env_build.py` owns Nobita's lot, `neighbours_build.py`
owns the other lots.

Coordinates: built directly in Blender space through `P(x, z, y)`, which takes a point in
the app's glTF space (+Y up, street at +Z) and returns Blender's (X, Y, Z). There is no
end-of-script Y flip here — `env_build.py` is the only script that still does that.

Run:  exec(open("scripts/blender/streets_build.py").read())
"""

import math
import os

import bpy

COLLECTION = "STREETS"
ROOT_DIR = "/Users/khoale/Devs/khoale/nobita-house-3d"
SCRIPTS_DIR = f"{ROOT_DIR}/scripts/blender"
exec(open(os.path.join(SCRIPTS_DIR, "env_helpers.py")).read())

# --- layout, mirrors layout.streets / layout.road / layout.sidewalk in src/data/scene.ts ---
LENGTH = 84.0
HALF = LENGTH / 2
SIDEWALK_D, SIDEWALK_H = 1.9, 0.12
ROAD_D, ROAD_START = 6.0, 7.7
ROAD_END = ROAD_START + ROAD_D                      # 13.7
LOT_HALF_W, FRONT_Z = 7.5, 5.8
SIDE_X0, SIDE_X1 = -15.4, -9.4                      # side-road carriageway
KERB_R, KERB_W, KERB_H = 1.5, 0.16, SIDEWALK_H + 0.06
POLE_H = 8.0
# Street-light height on the pole; mirrored by the point lights in src/scene/night-lights.tsx.
LAMP_H = 4.8
POLES = [(-16.5, 7.2), (-8.45, 7.2), (8.6, 7.2), (33.0, 7.2), (-8.45, -22.0)]

# Sidewalk bands: (low, high) on the axis that crosses the road they serve.
NEAR_FRONT = (FRONT_Z, FRONT_Z + SIDEWALK_D)        # 5.8 .. 7.7
FAR_FRONT = (ROAD_END, ROAD_END + SIDEWALK_D)       # 13.7 .. 15.6
NEAR_SIDE = (SIDE_X1, -LOT_HALF_W)                  # -9.4 .. -7.5
FAR_SIDE = (SIDE_X0 - SIDEWALK_D, SIDE_X0)          # -17.3 .. -15.4


def P(x, z, y=0.0):
    """glTF-space (x, z, height) -> Blender (X, Y, Z). The exporter maps Blender +Y to -Z."""
    return (x, -z, y)


def slab(coll, name, x0, x1, z0, z1, top, thickness, mat_name):
    """Box covering [x0, x1] x [z0, z1] in glTF space with its top face at `top`."""
    return add_box(coll, name, (x1 - x0, z1 - z0, thickness),
                   P((x0 + x1) / 2, (z0 + z1) / 2, top - thickness / 2), mat_name)


def build_roads(coll):
    """Carriageways. The front road owns the junction so the side road can stop at its kerbs
    instead of overlapping it in a coplanar double layer."""
    slab(coll, "road_front", -HALF, HALF, ROAD_START, ROAD_END, 0.06, 0.06, "asphalt")
    slab(coll, "road_side_north", SIDE_X0, SIDE_X1, -HALF, ROAD_START, 0.06, 0.06, "asphalt")
    slab(coll, "road_side_south", SIDE_X0, SIDE_X1, ROAD_END, HALF, 0.06, 0.06, "asphalt")


def junction_corners():
    """(tag, arc centre x, arc centre z, Blender quadrant) for the four pavement corners.

    Each centre sits one kerb radius inside its corner, so the square of side `KERB_R` between
    the centre and the corner is the part of the pavement that gets rounded off.
    """
    return (
        ("ne", SIDE_X1 + KERB_R, ROAD_START - KERB_R, (-1, -1)),
        ("nw", SIDE_X0 - KERB_R, ROAD_START - KERB_R, (1, -1)),
        ("sw", SIDE_X0 - KERB_R, ROAD_END + KERB_R, (1, 1)),
        ("se", SIDE_X1 + KERB_R, ROAD_END + KERB_R, (-1, 1)),
    )


def build_sidewalks(coll):
    """Four strips, each cut where the crossing road interrupts it, and each with its junction
    corner cut back to the kerb radius so `build_kerbs` can round it. Rounding only the kerb
    band would leave a square nub of pavement standing out past the curve."""
    # Front strips, minus a KERB_R square at each of their two junction corners.
    for tag, (z0, z1) in (("near", NEAR_FRONT), ("far", FAR_FRONT)):
        # The road-facing edge of this strip is where the corner squares sit.
        cut0, cut1 = (z1 - KERB_R, z1) if tag == "near" else (z0, z0 + KERB_R)
        keep0, keep1 = (z0, z1 - KERB_R) if tag == "near" else (z0 + KERB_R, z1)
        slab(coll, f"walk_front_{tag}_w", -HALF, SIDE_X0 - KERB_R, z0, z1,
             SIDEWALK_H, SIDEWALK_H, "paving")
        slab(coll, f"walk_front_{tag}_wc", SIDE_X0 - KERB_R, SIDE_X0, keep0, keep1,
             SIDEWALK_H, SIDEWALK_H, "paving")
        slab(coll, f"walk_front_{tag}_ec", SIDE_X1, SIDE_X1 + KERB_R, keep0, keep1,
             SIDEWALK_H, SIDEWALK_H, "paving")
        slab(coll, f"walk_front_{tag}_e", SIDE_X1 + KERB_R, HALF, z0, z1,
             SIDEWALK_H, SIDEWALK_H, "paving")
        # The corner square is carriageway under the rounded pavement; without this the
        # ground plane would show through the piece the curve gives back to the road.
        for side, (cx0, cx1) in (("w", (SIDE_X0 - KERB_R, SIDE_X0)),
                                 ("e", (SIDE_X1, SIDE_X1 + KERB_R))):
            slab(coll, f"corner_road_{tag}_{side}", cx0, cx1, cut0, cut1, 0.06, 0.06, "asphalt")
    # The side strips stop short of the front sidewalks, which own the corners.
    for tag, (x0, x1) in (("near", NEAR_SIDE), ("far", FAR_SIDE)):
        slab(coll, f"walk_side_{tag}_n", x0, x1, -HALF, NEAR_FRONT[0], SIDEWALK_H, SIDEWALK_H,
             "paving")
        slab(coll, f"walk_side_{tag}_s", x0, x1, FAR_FRONT[1], HALF, SIDEWALK_H, SIDEWALK_H,
             "paving")


def build_kerbs(coll):
    """Straight kerb runs stopping a corner radius short of the junction, plus the four arcs
    that carry the kerb line round it."""
    # Front road: kerb sits on the pavement side of each carriageway edge.
    for tag, edge, inward in (("near", ROAD_START, -1), ("far", ROAD_END, 1)):
        z0 = edge - KERB_W if inward < 0 else edge
        z1 = z0 + KERB_W
        slab(coll, f"kerb_front_{tag}_w", -HALF, SIDE_X0 - KERB_R, z0, z1, KERB_H, KERB_H,
             "concrete_dark")
        slab(coll, f"kerb_front_{tag}_e", SIDE_X1 + KERB_R, HALF, z0, z1, KERB_H, KERB_H,
             "concrete_dark")
    # Side road, broken across the whole front road plus both of its sidewalks.
    for tag, edge, inward in (("east", SIDE_X1, 1), ("west", SIDE_X0, -1)):
        x0 = edge if inward > 0 else edge - KERB_W
        x1 = x0 + KERB_W
        slab(coll, f"kerb_side_{tag}_n", x0, x1, -HALF, ROAD_START - KERB_R, KERB_H, KERB_H,
             "concrete_dark")
        slab(coll, f"kerb_side_{tag}_s", x0, x1, ROAD_END + KERB_R, HALF, KERB_H, KERB_H,
             "concrete_dark")
    # Arcs, plus the rounded pavement they kerb. The quadrant points from the arc centre at
    # the corner, in Blender axes (+Z in the app is -Y in Blender). Disc and ring share a
    # radius, so they meet without a seam and together fill the square `build_sidewalks` cut.
    for tag, cx, cz, quadrant in junction_corners():
        add_quarter_disc(coll, f"walk_arc_{tag}", P(cx, cz, 0.0), KERB_R - KERB_W,
                         SIDEWALK_H, quadrant, "paving")
        add_quarter_ring(coll, f"kerb_arc_{tag}", P(cx, cz, 0.0), KERB_R - KERB_W, KERB_W,
                         KERB_H, quadrant, "concrete_dark")


def _in_junction(x, z):
    return SIDE_X0 <= x <= SIDE_X1 and ROAD_START <= z <= ROAD_END


def build_markings(coll):
    """Centre dashes on both roads, a stop line and a crossing on each of the four legs."""
    mid_front = (ROAD_START + ROAD_END) / 2
    mid_side = (SIDE_X0 + SIDE_X1) / 2
    for k in range(-13, 14):
        x = k * 3.0
        if _in_junction(x + 0.8, mid_front) or _in_junction(x - 0.8, mid_front):
            continue
        slab(coll, f"dash_front_{k}", x - 0.8, x + 0.8, mid_front - 0.06, mid_front + 0.06,
             0.08, 0.02, "road_mark")
    for k in range(-13, 14):
        z = k * 3.0
        if _in_junction(mid_side, z + 0.8) or _in_junction(mid_side, z - 0.8):
            continue
        slab(coll, f"dash_side_{k}", mid_side - 0.06, mid_side + 0.06, z - 0.8, z + 0.8,
             0.08, 0.02, "road_mark")

    # Crossings: five bars spanning the carriageway, stepped along the direction of travel.
    # `layout.streets.crossing` in src/data/scene.ts mirrors these (and the 1.2 m inset, the
    # 0.15 m kerb margin and the 0.08 m paint top below); the walk route in
    # src/data/walk-routes.ts crosses on them.
    bars, bar_w, pitch = 5, 0.5, 0.8
    legs = (
        ("east", "x", SIDE_X1 + KERB_R + 1.2, 1),
        ("west", "x", SIDE_X0 - KERB_R - 1.2, -1),
        ("south", "z", ROAD_END + KERB_R + 1.2, 1),
        ("north", "z", ROAD_START - KERB_R - 1.2, -1),
    )
    for tag, axis, base, sign in legs:
        for i in range(bars):
            offset = sign * (i * pitch)
            if axis == "x":
                x = base + offset
                slab(coll, f"zebra_{tag}_{i}", x, x + bar_w, ROAD_START + 0.15, ROAD_END - 0.15,
                     0.08, 0.02, "road_mark")
            else:
                z = base + offset
                slab(coll, f"zebra_{tag}_{i}", SIDE_X0 + 0.15, SIDE_X1 - 0.15, z, z + bar_w,
                     0.08, 0.02, "road_mark")
        # Stop line on the lane that approaches the junction. Japan drives on the left, so
        # traffic coming down the +x leg keeps to the -z half and vice versa.
        stop = base + sign * (bars * pitch + 0.4)
        if axis == "x":
            z0, z1 = ((ROAD_START + 0.15, mid_front) if sign > 0
                      else (mid_front, ROAD_END - 0.15))
            slab(coll, f"stop_{tag}", stop, stop + 0.3, z0, z1, 0.08, 0.02, "road_mark_dim")
        else:
            x0, x1 = ((SIDE_X0 + 0.15, mid_side) if sign > 0
                      else (mid_side, SIDE_X1 - 0.15))
            slab(coll, f"stop_{tag}", x0, x1, stop, stop + 0.3, 0.08, 0.02, "road_mark_dim")


def build_furniture(coll):
    """Drain covers along the near kerb of each road, plus a few manhole discs."""
    for k, x in enumerate(range(-36, 40, 6)):
        if SIDE_X0 - 1 < x < SIDE_X1 + 1:
            continue
        slab(coll, f"drain_front_{k}", x - 0.275, x + 0.275, ROAD_START - KERB_W - 0.32,
             ROAD_START - KERB_W, SIDEWALK_H + 0.018, 0.018, "metal")
    for k, z in enumerate(range(-36, 40, 6)):
        if ROAD_START - 1 < z < ROAD_END + 1:
            continue
        slab(coll, f"drain_side_{k}", SIDE_X1 + KERB_W, SIDE_X1 + KERB_W + 0.32,
             z - 0.275, z + 0.275, SIDEWALK_H + 0.018, 0.018, "metal")
    for k, (x, z) in enumerate(((-3.0, 9.4), (12.5, 12.0), (-12.4, -4.0), (-12.4, 20.0))):
        add_cylinder(coll, f"manhole_{k}", 0.3, 0.02, P(x, z, 0.07), "metal", verts=12)


def add_pole(coll, tag, x, z, along="x"):
    """Japanese concrete pole: tapered shaft, collar, two crossarms with insulators, a
    transformer drum, step bolts and a sign. `along` is the axis the wires it carries run on,
    so the crossarms come out perpendicular to it."""
    base = P(x, z, 0.0)
    add_cylinder(coll, f"pole_{tag}", 0.15, POLE_H, P(x, z, POLE_H / 2), "pole_concrete",
                 verts=14, radius_top=0.09)
    add_cylinder(coll, f"pole_{tag}_collar", 0.19, 0.5, P(x, z, 0.25), "concrete_dark", verts=14)
    add_cylinder(coll, f"pole_{tag}_cap", 0.10, 0.05, P(x, z, POLE_H + 0.025), "metal", verts=10)

    def lateral(offset, height):
        """Point `offset` metres to the side of the pole, on the axis the arms run along."""
        return P(x + offset, z, height) if along == "z" else P(x, z + offset, height)

    add_crossarms(coll, tag, x, z, along)
    add_cylinder(coll, f"pole_{tag}_transformer", 0.24, 0.75, lateral(0.34, POLE_H - 1.95),
                 "metal", verts=12)
    add_box(coll, f"pole_{tag}_strap", (0.55, 0.08, 0.08) if along == "x" else (0.08, 0.55, 0.08),
            lateral(0.17, POLE_H - 1.70), "metal")
    for k in range(6):
        side = 1 if k % 2 else -1
        rot = (math.radians(90), 0, 0) if along == "x" else (0, math.radians(90), 0)
        add_cylinder(coll, f"pole_{tag}_step_{k}", 0.02, 0.28, lateral(side * 0.16, 2.6 + k * 0.7),
                     "metal", verts=6, rot=rot)
    add_box(coll, f"pole_{tag}_sign", (0.03, 0.22, 0.34) if along == "x" else (0.22, 0.03, 0.34),
            lateral(-0.16, 2.1), "plate")
    add_street_lamp(coll, tag, x, z, along)
    return base


def add_street_lamp(coll, tag, x, z, along="x"):
    """Street light on a bracket, the way Japanese utility poles carry them: a short arm out
    over the carriageway, a shallow shade, and a lens left as its own material so the web app
    can make it emissive at night."""
    arm_len, lamp_y = 0.85, LAMP_H
    # The arm reaches out over the carriageway, away from the lots the pole line fronts.
    reach = arm_len / 2 if along == "x" else -arm_len / 2

    def out(offset, height):
        return P(x, z + offset, height) if along == "x" else P(x + offset, z, height)

    size = (0.07, arm_len, 0.07) if along == "x" else (arm_len, 0.07, 0.07)
    add_box(coll, f"pole_{tag}_lamp_arm", size, out(reach, lamp_y), "metal")
    shade = (0.34, 0.52, 0.12) if along == "x" else (0.52, 0.34, 0.12)
    add_box(coll, f"pole_{tag}_lamp_shade", shade, out(reach * 2, lamp_y - 0.09), "lamp_shade")
    lens = (0.28, 0.44, 0.06) if along == "x" else (0.44, 0.28, 0.06)
    add_box(coll, f"pole_{tag}_lamp_lens", lens, out(reach * 2, lamp_y - 0.17), "lamp_lens")


def add_crossarms(coll, tag, x, z, along="x"):
    """The two crossarms and their insulators. Split out so the junction pole can carry a
    second pair at right angles for the side-road run."""
    for arm_index, (arm_y, offsets) in enumerate(pole_wire_rows()):
        size = (0.09, 1.45, 0.09) if along == "x" else (1.45, 0.09, 0.09)
        add_box(coll, f"pole_{tag}_arm_{arm_index}", size, P(x, z, arm_y), "metal")
        for k, offset in enumerate(offsets):
            pos = P(x + offset, z, arm_y + 0.11) if along == "z" else P(x, z + offset, arm_y + 0.11)
            add_cylinder(coll, f"pole_{tag}_ins_{arm_index}_{k}", 0.045, 0.14, pos,
                         "insulator", verts=8)


def pole_wire_rows():
    """(height, lateral offsets) for the two crossarms; shared by the poles and the wires."""
    return ((POLE_H - 0.45, (-0.55, 0.0, 0.55)), (POLE_H - 1.15, (-0.45, 0.45)))


def build_wires(coll):
    """Sagging lines pole to pole, and one dead span into the fog at each end of a run."""
    front = [-HALF, -16.5, -8.45, 8.6, 33.0, HALF]
    side = [7.2, -22.0, -HALF]
    for arm_index, (arm_y, offsets) in enumerate(pole_wire_rows()):
        for k, offset in enumerate(offsets):
            for s, (a, b) in enumerate(zip(front, front[1:])):
                # Long spans sag more than the short ones between neighbouring poles.
                sag = 0.12 + min(abs(b - a), 30.0) * 0.012
                add_wire(coll, f"wire_front_{arm_index}_{k}_{s}", abs(b - a),
                         P((a + b) / 2, 7.2 + offset, arm_y + 0.18), sag=sag, along="x")
            if arm_index == 1:
                continue  # the side road carries the top three lines only
            for s, (a, b) in enumerate(zip(side, side[1:])):
                sag = 0.12 + min(abs(b - a), 30.0) * 0.012
                add_wire(coll, f"wire_side_{k}_{s}", abs(b - a),
                         P(-8.45 + offset, (a + b) / 2, arm_y + 0.18), sag=sag, along="y")


def build():
    coll = fresh_collection(COLLECTION)
    build_roads(coll)
    build_sidewalks(coll)
    build_kerbs(coll)
    build_markings(coll)
    build_furniture(coll)
    for index, (x, z) in enumerate(POLES):
        add_pole(coll, str(index), x, z, along="z" if index == 4 else "x")
    # The pole at the junction carries both runs, so it gets a second crossarm across the
    # first. Without it the side-road lines would hang off the shaft rather than an insulator.
    add_crossarms(coll, "1z", POLES[1][0], POLES[1][1], along="z")
    build_wires(coll)
    bpy.context.view_layer.update()
    apply_world_uvs(coll.objects)
    tris = sum(len(o.data.polygons) for o in coll.objects if o.type == "MESH")
    print(f"STREETS built: {len(coll.objects)} objects, {tris} faces")
    return coll


build()
