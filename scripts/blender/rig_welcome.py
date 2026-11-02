"""Rig one prepared character with a welcome bow and a walk cycle.

Works on the normalized GLBs in assets/raw/final/characters/ (feet at z=0, facing -Y,
canon height). Builds a vertical bone chain plus a leg bone per side, weights vertices by
smooth height bands — deterministic, unlike bone-heat weighting, and exactly what a bow and
a leg swing need — then keys two actions: "welcome" (bow forward, hold, rise) and "walk"
(a looping contact/passing cycle on the legs only).

Inputs, then exec:

    CHAR_ID = "nobita"
    exec(open("scripts/blender/rig_welcome.py").read())

Leaves objects "<id>" (mesh) and "<id>_rig" (armature) in the CHARS collection, with the
actions "welcome" and "walk" on NLA tracks of the armature, ready for glTF export with
animations.
"""

import math

import bpy
from mathutils import Vector

char_id = globals()["CHAR_ID"]
ROOT_DIR = "/Users/khoale/Devs/khoale/nobita-house-3d"
SRC = f"{ROOT_DIR}/assets/raw/final/characters/{char_id}.glb"

# Per-character chain. bands: (bone, low, high) as fractions of body height; the chain is
# connected, so each bone's head is the joint the bow bends at. blend: cross-fade half-width
# between bands. bow: degrees per joint at full depth.
# legs: `top` is the height fraction where leg weighting stops (the hip, or a hem the skirt
# has to keep rigid); `spread` places each leg bone that fraction of the body half-width out
# from the axis; `swing` is the peak forward/back angle of the walk cycle, in degrees.
HUMANOID = {
    "bands": (("root", 0.0, 0.45), ("spine", 0.45, 0.65), ("chest", 0.65, 0.82), ("head", 0.82, 1.0)),
    "blend": 0.04,
    "bow": {"spine": 13.0, "chest": 14.0, "head": 7.0},  # cumulative ~34 degrees at the head
    # 28 degrees is not a stroll's hip angle on a real leg, but these legs have no knee or
    # ankle: the swing has to cover the whole stride on its own. Wider looks like marching
    # and drops the body further at each contact; narrower shortens the stride until the
    # feet have to scurry to keep up with 1 m/s.
    "legs": {"top": 0.40, "spread": 0.45, "swing": 28.0},
}
# Each entry overrides only the keys it names; everything else comes from HUMANOID.
PROFILES = {
    # Doraemon is a sphere on a barrel: the head fills the top 55% and must never bend, and
    # the ice-cream cone he holds runs from his mouth down to his shins, so any joint between
    # them kinks it. He bows as one rigid block from the hips; only the stubby legs blend.
    "doraemon": {
        "bands": (("root", 0.0, 0.13), ("body", 0.13, 1.0)),
        "blend": 0.05,
        "bow": {"body": 18.0},
        # No walk clip: he has no legs to rig. The mesh runs straight across the middle at
        # every height — boots welded to a barrel — so a left/right split shears him, and
        # the 0.22 m his boots could cover per cycle would need nine steps a second at
        # walking pace. He keeps the procedural waddle instead.
        "legs": None,
    },
    # Her skirt hem is at 0.33 h, where the body's width jumps from 23 cm to 39 cm: weight
    # anything above it to a leg and the skirt swings open with the stride.
    "shizuka": {"legs": {"top": 0.32, "spread": 0.45, "swing": 28.0}},
}
profile = dict(HUMANOID, **PROFILES.get(char_id, {}))
BANDS = profile["bands"]
BLEND = profile["blend"]
BOW = profile["bow"]
LEGS = profile["legs"]
FPS_KEYS = ((1, 0.0), (13, 1.0), (27, 1.0), (41, 0.0), (48, 0.0))  # frame, bow amount
# Walk cycle, 24 frames at 24 fps: contact, passing, opposite contact, passing, and frame 24
# repeating frame 0. Counting from 0 matters — the exporter writes keyframe times as
# frame / fps, so starting at frame 1 would make the clip 1.042 s long with nothing to play
# over its first 42 ms: a 4% foot slip and a freeze at every contact. Values are the left
# leg's swing fraction; the right leg takes the opposite.
WALK_KEYS = ((0, 1.0), (6, 0.0), (12, -1.0), (18, 0.0), (24, 1.0))
# Half-width of the cross-fade between the two legs, metres: narrow enough to keep each leg
# rigid, wide enough that the crotch does not tear when they swing apart.
LEG_SIDE_BLEND = 0.03
# Soft edge, metres, outside the widest point of the feet. Past it a vertex below the hip is
# not a leg: a hand hanging at the character's side is, and it must not swing with one.
LEG_EDGE_BLEND = 0.04


def get_chars_collection():
    coll = bpy.data.collections.get("CHARS")
    if coll is None:
        coll = bpy.data.collections.new("CHARS")
        bpy.context.scene.collection.children.link(coll)
    return coll


coll = get_chars_collection()
for name in (char_id, f"{char_id}_rig"):
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

before = {o.name for o in bpy.context.scene.objects}
bpy.ops.import_scene.gltf(filepath=SRC)
new_names = [o.name for o in bpy.context.scene.objects if o.name not in before]
# The source may already be a rigged export: the importer then brings an armature and an
# icosphere bone-shape along. Keep only the biggest mesh and re-rig it from scratch.
imported = [bpy.data.objects[n] for n in new_names if n in bpy.data.objects]
meshes = sorted((o for o in imported if o.type == "MESH"),
                key=lambda o: len(o.data.vertices), reverse=True)
if not meshes:
    raise RuntimeError(f"{char_id}: no mesh imported")
mesh_obj = meshes[0]
for extra in imported:
    if extra.name != mesh_obj.name:
        bpy.data.objects.remove(extra, do_unlink=True)
new_names = [mesh_obj.name]
mesh_obj.parent = None
for modifier in list(mesh_obj.modifiers):
    mesh_obj.modifiers.remove(modifier)
mesh_obj.vertex_groups.clear()
mesh_obj.name = char_id
mesh_obj.data.name = char_id
for other_name in new_names:
    if other_name != mesh_obj.name and other_name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[other_name], do_unlink=True)
for c in list(mesh_obj.users_collection):
    c.objects.unlink(mesh_obj)
coll.objects.link(mesh_obj)
bpy.ops.object.select_all(action="DESELECT")
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = mesh_obj
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

height = mesh_obj.dimensions.z
# The chain sits on the torso's own vertical axis, measured as the bounding-box centre of a
# thin slab at the first bending joint. A vertex centroid is not usable here: densely
# sculpted arms, faces and held props sit in front of the body and drag it forward (a
# quarter metre on Doraemon), which then swings the whole back up during the bow.
joint_z = BANDS[1][1] * height
slab = [v.co for v in mesh_obj.data.vertices if abs(v.co.z - joint_z) <= BLEND * height]
axis_x = (min(c.x for c in slab) + max(c.x for c in slab)) / 2
axis_y = (min(c.y for c in slab) + max(c.y for c in slab)) / 2

arm_data = bpy.data.armatures.new(f"{char_id}_rig")
rig = bpy.data.objects.new(f"{char_id}_rig", arm_data)
coll.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
parent = None
chain = {}
for bone_name, lo, hi in BANDS:
    bone = arm_data.edit_bones.new(bone_name)
    bone.head = Vector((axis_x, axis_y, lo * height))
    bone.tail = Vector((axis_x, axis_y, hi * height))
    if parent is not None:
        bone.parent = parent
        bone.use_connect = True
    parent = bone
    chain[bone_name] = bone

# One bone per leg, hanging from the hip to the floor. They are children of the bottom band
# bone, so the bow carries them and the walk swings them under a body that stays upright.
# A profile with no legs (Doraemon) is rigged for the bow alone and ships without a walk clip.
LEG_BONES = {"leg_l": 1, "leg_r": -1} if LEGS else {}  # facing -Y, the character's left is +X
leg_top = LEGS["top"] * height if LEGS else 0.0
legs_x, hip_half, leg_reach = axis_x, 0.0, 0.0
if LEGS:
    # The legs need their own centre line, not the chain's: `axis_x` is measured at the first
    # bending joint — chest height on a humanoid — where the arms and whatever the character
    # holds drag the bounding box sideways. On Nobita that put the split 10 cm inside his own
    # left leg, so both legs ended up on one bone. A slab across the shins sees nothing but
    # the two legs, and gives the width to space the bones across as well.
    shin_z = 0.5 * leg_top
    shin = [v.co.x for v in mesh_obj.data.vertices if abs(v.co.z - shin_z) <= 0.03 * height]
    if shin:
        legs_x = (min(shin) + max(shin)) / 2
        hip_half = (max(shin) - min(shin)) / 2
    else:
        hip_half = 0.1 * height
    # How far out a leg ever reaches: the feet, which are wider than the shins in every shoe.
    feet = [abs(v.co.x - legs_x) for v in mesh_obj.data.vertices if v.co.z <= 0.06 * height]
    leg_reach = max(feet) if feet else hip_half * 1.5
    for leg_name, side in LEG_BONES.items():
        bone = arm_data.edit_bones.new(leg_name)
        bone.head = Vector((legs_x + side * LEGS["spread"] * hip_half, axis_y, leg_top))
        bone.tail = Vector((legs_x + side * LEGS["spread"] * hip_half, axis_y, 0.0))
        bone.parent = chain[BANDS[0][0]]
bpy.ops.object.mode_set(mode="OBJECT")

# Height-band weights with linear cross-fades, normalised per vertex.
groups = {name: mesh_obj.vertex_groups.new(name=name) for name, _, _ in BANDS}
for leg_name in LEG_BONES:
    groups[leg_name] = mesh_obj.vertex_groups.new(name=leg_name)


def band_weight(h, lo, hi):
    rise = min(1.0, max(0.0, (h - (lo - BLEND)) / (2 * BLEND))) if lo > 0 else 1.0
    fall = min(1.0, max(0.0, ((hi + BLEND) - h) / (2 * BLEND))) if hi < 1.0 else 1.0
    return min(rise, fall)


def smoothstep(edge0, edge1, x):
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


root_name = BANDS[0][0]
for v in mesh_obj.data.vertices:
    h = v.co.z / height
    weights = dict((name, band_weight(h, lo, hi)) for name, lo, hi in BANDS)
    total = sum(weights.values()) or 1.0
    weights = dict((name, w / total) for name, w in weights.items())
    # Below the hip the bottom band belongs to the legs, split left/right across the body
    # axis and cross-faded back into the body over the same band width the chain uses.
    on_leg = (
        (1.0 - smoothstep(leg_top - BLEND * height, leg_top + BLEND * height, v.co.z))
        * (1.0 - smoothstep(leg_reach, leg_reach + LEG_EDGE_BLEND, abs(v.co.x - legs_x)))
        if LEG_BONES
        else 0.0
    )
    if on_leg > 0.0 and weights[root_name] > 0.0:
        left = smoothstep(-LEG_SIDE_BLEND, LEG_SIDE_BLEND, v.co.x - legs_x)
        share = weights[root_name] * on_leg
        weights[root_name] -= share
        weights["leg_l"] = share * left
        weights["leg_r"] = share * (1.0 - left)
    for name, w in weights.items():
        if w > 0.001:
            groups[name].add([v.index], w, "REPLACE")

mod = mesh_obj.modifiers.new("rig", "ARMATURE")
mod.object = rig
mesh_obj.parent = rig

# --- the clips ---------------------------------------------------------------------
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
# Purge every stale clip AFTER the import: a previously rigged source GLB carries its
# old clips as actions, and the exporter would ship all of them.
for stale in list(bpy.data.actions):
    if stale.name.startswith(("welcome", "walk")):
        bpy.data.actions.remove(stale)
rig.animation_data_create()
scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start = 1


def rest_pose():
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()


def leg_forward_sign():
    """Sign of a local-X rotation that swings a leg toward -Y, the way characters face.

    The chain's bones point up but the leg bones point down, which flips their local axes,
    so this is measured on the rig rather than assumed: the welcome bow's own sign was
    guessed wrong once already.
    """
    pose_bone = rig.pose.bones["leg_l"]
    pose_bone.rotation_mode = "XYZ"
    rest_y = pose_bone.tail.y
    pose_bone.rotation_euler = (math.radians(10.0), 0.0, 0.0)
    bpy.context.view_layer.update()
    swung_y = rig.pose.bones["leg_l"].tail.y
    rest_pose()
    return 1.0 if swung_y < rest_y else -1.0


swing_sign = leg_forward_sign() if LEG_BONES else 0.0

welcome = bpy.data.actions.new("welcome")
rig.animation_data.action = welcome
scene.frame_end = FPS_KEYS[-1][0]
for frame, amount in FPS_KEYS:
    scene.frame_set(frame)
    for bone_name, degrees in BOW.items():
        pose_bone = rig.pose.bones[bone_name]
        pose_bone.rotation_mode = "XYZ"
        # Bones point up (+Z); a positive local-X rotation tips the chain toward -Y,
        # the street side every character faces. Verified in-app: the negative sign
        # bowed everyone away from the viewer.
        pose_bone.rotation_euler = (math.radians(degrees) * amount, 0.0, 0.0)
        pose_bone.keyframe_insert("rotation_euler", frame=frame)
# New keyframes default to bezier interpolation; Blender 5 removed action.fcurves
# (layered actions), so no post-pass is needed or possible here.

rest_pose()
walk = bpy.data.actions.new("walk") if LEG_BONES else None
if walk:
    rig.animation_data.action = walk
    scene.frame_start = WALK_KEYS[0][0]
    scene.frame_end = WALK_KEYS[-1][0]
    for frame, amount in WALK_KEYS:
        scene.frame_set(frame)
        for leg_name, side in LEG_BONES.items():
            pose_bone = rig.pose.bones[leg_name]
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler = (
                swing_sign * math.radians(LEGS["swing"]) * amount * side,
                0.0,
                0.0,
            )
            pose_bone.keyframe_insert("rotation_euler", frame=frame)

# Ground covered per cycle, measured on the posed mesh rather than from the swing angle: it
# is what `stride` in src/data/characters.ts has to be for the feet not to slide, and the
# sole's own tilt makes the two differ. Also reports how far the sole dips below the floor.
step = sink = 0.0
if walk:
    scene.frame_set(WALK_KEYS[0][0])
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    posed = mesh_obj.evaluated_get(depsgraph).to_mesh()
    soles = [v.co for v in posed.vertices if v.co.z < 0.12 * height]
    left_foot = [c for c in soles if c.x > legs_x]
    right_foot = [c for c in soles if c.x <= legs_x]
    step = abs(
        sum(c.y for c in left_foot) / len(left_foot)
        - sum(c.y for c in right_foot) / len(right_foot)
    )
    # Each sole apart, not the pair: a foot hanging in the air is what a knee-less swing
    # risks, and the pair's minimum would hide it behind the other foot.
    sink = max(min(c.z for c in left_foot), min(c.z for c in right_foot))
    mesh_obj.evaluated_get(depsgraph).to_mesh_clear()

# Both clips go onto their own NLA track, and the armature is left with no active action:
# that is what makes the exporter ship two animations instead of only the assigned one.
rig.animation_data.action = None
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
for clip in (welcome, walk) if walk else (welcome,):
    track = rig.animation_data.nla_tracks.new()
    track.name = clip.name
    strip = track.strips.new(clip.name, 1, clip)
    strip.name = clip.name
    # Blender 5 actions are slotted; a strip plays nothing until it is pointed at one.
    if hasattr(strip, "action_slot") and len(clip.slots) > 0:
        strip.action_slot = clip.slots[0]

bpy.ops.object.mode_set(mode="OBJECT")
scene.frame_start = 1
scene.frame_set(1)
print(
    f"{char_id}: rigged, height {height:.2f}, axis ({axis_x:.2f}, {axis_y:.2f}), "
    + (
        f"legs to {LEGS['top']:.2f}h, centred {legs_x:+.3f} at x +-{LEGS['spread'] * hip_half:.3f}, "
        f"reach {leg_reach:.3f}\n"
        f"{char_id}: stride {2 * step:.3f} m ({2 * step / height:.2f} h) -> characters.ts, "
        f"soles {sink * 100:+.1f} cm at contact"
        if walk
        else "no legs in this profile: welcome only, the app keeps its procedural gait"
    )
)
