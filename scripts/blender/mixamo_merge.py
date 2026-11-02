"""Merge a Mixamo auto-rig and its downloaded clips into one character GLB.

Through the Blender MCP connection:

    CHAR_ID = "dekisugi"
    exec(open(f"{ROOT_DIR}/scripts/blender/mixamo_merge.py").read())

Headless, from the repo root:

    /Applications/Blender.app/Contents/MacOS/Blender -b --python-expr \
      "CHAR_ID='dekisugi'; exec(open('scripts/blender/mixamo_merge.py').read())"

Reads `assets/raw/mixamo-out/<id>/character.fbx` (With Skin, T-pose) plus one FBX per clip
(Without Skin) and writes `assets/raw/final/characters/<id>.glb` carrying every clip in
`CLIP_IDS` as a separate animation. Optional globals:

    CLIP_SOURCE = "dekisugi"   # whose clip set to use; default: this character's own
    YAW_DEGREES = 180          # override the automatic facing fix

    RODIN_DIR = ".../assets/raw/rodin/dekisugi3"  # sculpt whose maps refill a bare FBX material

Every file Mixamo hands back for the same auto-rig shares its bone names, so applying a clip
is an action assignment, not a retarget. Clips are downloaded once and reused across
characters (user decision 2026-09-12); the only thing that does not transfer is the `Hips`
location track, which is in the source rig's own units and leg length, so it is scaled by the
ratio of the two rigs' leg lengths as measured on their skeletons.
"""

import math
import os

import bpy
import numpy as np
from mathutils import Vector

char_id = globals()["CHAR_ID"]
ROOT_DIR = globals().get("ROOT_DIR", os.getcwd())
# The character whose clip set is used. A character with its own `anim/` uses that (Mixamo
# baked those clips to its proportions); everyone else borrows the pilot's.
PILOT = "dekisugi"
yaw_override = globals().get("YAW_DEGREES")

# Order is the picker order in src/data/animations.ts; the file name is the clip name. Pass
# CLIPS to ship a subset — a sculpt whose sleeves are fused to its sides cannot carry a clip
# that lifts an arm above the shoulder (see the plan's phase 3 notes).
CLIP_IDS = globals().get(
    "CLIPS",
    [
        "idle", "look-around", "sit", "walk", "run", "think", "talk", "clap", "dance",
        "wave", "welcome", "nod", "jump", "laugh", "victory", "cheer",
    ],
)
# Clips whose ground travel belongs to the app, not to the animation.
IN_PLACE = {"walk", "run"}
# Sinking shallower than this, metres, is left alone: it is shoe-sole noise, not a visible dig.
GROUND_TOLERANCE = 0.002
# Canon heights, metres — mirrors `characters` in src/data/characters.ts.
HEIGHTS = {
    "shizuka": 1.38,
    "doraemon": 1.29,
    "nobita": 1.40,
    "jaian": 1.57,
    "suneo": 1.42,
    "dekisugi": 1.42,
}
# Import settings shared by the character and every clip: the rest-pose axes must be built the
# same way in both files, or the pose rotations land on differently rolled bones.
FBX_IMPORT = dict(ignore_leaf_bones=True, automatic_bone_orientation=True)

src_dir = f"{ROOT_DIR}/assets/raw/mixamo-out/{char_id}"
character_fbx = f"{src_dir}/character.fbx"
own_anim_dir = f"{src_dir}/anim"
clip_source = globals().get("CLIP_SOURCE", char_id if os.path.isdir(own_anim_dir) else PILOT)
anim_dir = f"{ROOT_DIR}/assets/raw/mixamo-out/{clip_source}/anim"
target_height = HEIGHTS[char_id]
rodin_dir = globals().get("RODIN_DIR", f"{ROOT_DIR}/assets/raw/rodin/{char_id}")
out_path = f"{ROOT_DIR}/assets/raw/final/characters/{char_id}.glb"

if not os.path.exists(character_fbx):
    raise RuntimeError(f"{character_fbx} missing — download the rigged character With Skin")
missing = [c for c in CLIP_IDS if not os.path.exists(f"{anim_dir}/{c}.fbx")]
if missing:
    raise RuntimeError(f"{anim_dir}: missing clips {missing}")


def wipe():
    """Headless Blender starts with a cube, a camera and a light; a re-run starts with more."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes):
        for item in list(collection):
            collection.remove(item)


def scene_objects(kind):
    return [o for o in bpy.context.scene.objects if o.type == kind]


def world_bounds(mesh_obj):
    """Bind-pose bounds in world space. The armature modifier is at rest here (T-pose), and
    the mesh's own vertices are the only measurement that survives later quantisation."""
    bpy.context.view_layer.update()
    matrix = mesh_obj.matrix_world
    points = [matrix @ v.co for v in mesh_obj.data.vertices]
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return lo, hi


def action_fcurves(action):
    """Blender 5 moved fcurves into layered actions; keep the legacy path for older builds."""
    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        return list(legacy)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag = strip.channelbag(slot)
                if bag:
                    curves.extend(bag.fcurves)
    return curves


def leg_length(armature, prefix):
    """Hip joint to ankle in armature space, averaged over both legs.

    Pose-bone locations are stored in armature units with no object scale, so this is the
    ruler the `Hips` track has to be rescaled by. It also carries proportion: two chibi
    characters of one canon height can differ a lot in leg length (a big head takes the rest),
    and the pelvis drop of a stride or a landing belongs to the legs, not to the whole body.
    """
    bones = armature.data.bones
    hips = bones[f"{prefix}:Hips"].head_local
    lengths = [
        (hips - bones[f"{prefix}:{side}Foot"].head_local).length
        for side in ("Left", "Right")
        if f"{prefix}:{side}Foot" in bones
    ]
    if not lengths:
        raise RuntimeError(f"{armature.name}: no foot bones to measure the legs by")
    return sum(lengths) / len(lengths)


FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")


def is_finger(bone_name):
    """`mixamorig:LeftHandIndex2` and the like; the hand bone itself is not a finger."""
    short = bone_name.split(":")[-1]
    return any(f"Hand{finger}" in short for finger in FINGERS)


def fold_finger_weights(mesh_obj, prefix):
    """Hand every finger bone's skin to its hand bone, so each hand deforms as one rigid piece.

    The Rodin sculpts have fused mitten hands, and a rig downloaded with finger chains
    (Mixamo's "2 chains" and up) hangs the whole hand off the short index chain. The shared
    clips carry finger keys authored on another auto-rig's hand, so they bend that chain
    sideways and drag the hand's skin into long stretched fingers and a spike at the wrist.
    A chibi hand reads fine rigid, and a No Fingers rig is left untouched.
    """
    names = [g.name for g in mesh_obj.vertex_groups if is_finger(g.name)]
    entries = 0
    for name in names:
        side = "Left" if name.split(":")[-1].startswith("Left") else "Right"
        hand_name = f"{prefix}:{side}Hand"
        hand = mesh_obj.vertex_groups.get(hand_name) or mesh_obj.vertex_groups.new(name=hand_name)
        finger = mesh_obj.vertex_groups[name]
        for vertex in mesh_obj.data.vertices:
            for element in vertex.groups:
                if element.group == finger.index and element.weight > 0:
                    hand.add([vertex.index], element.weight, "ADD")
                    entries += 1
        mesh_obj.vertex_groups.remove(finger)
    if names:
        print(f"{char_id}: {len(names)} finger groups folded into the hands ({entries} weights)")


def remove_bone_fcurves(action, keep):
    """Drop every pose-bone curve whose bone name fails `keep`; handles layered actions."""
    def doomed(curve):
        return 'pose.bones["' in curve.data_path and not keep(curve.data_path.split('"')[1])

    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        for curve in [c for c in legacy if doomed(c)]:
            legacy.remove(curve)
        return
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag = strip.channelbag(slot)
                if bag:
                    for curve in [c for c in bag.fcurves if doomed(c)]:
                        bag.fcurves.remove(curve)


# Arm-bleed clamp, as fractions of body height. Below ARM_HOLD a vertex may keep its arm
# weight; past ARM_DROP it loses all of it, cross-faded in between.
ARM_HOLD = 0.035
ARM_DROP = 0.075
# Per-character bands for sculpts whose sleeves are thicker than the default: (hold, drop) for
# everywhere, or (hold, drop, sleeve_hold, sleeve_drop) to widen only past the shoulder joint.
# Jaian's sleeve skin sits a median 7% and up to 18% of height from its arm bones, so the
# default drop stripped half of it onto the chest and his upper arms creased flat at rest;
# widening the band everywhere instead dragged his flank and belly after every raised arm.
# `ARM_BLEED_OVERRIDE = (...)` tries other values without editing the table.
ARM_BLEED = {"jaian": (0.035, 0.075, 0.12, 0.18)}
# Characters without shoulders, whose clavicle skin moves to the chest. Doraemon's stub arms
# leave a ball-shaped body and Mixamo's clavicles sit inside it, weighting his flanks from 28%
# to 49% of height. The clips shrug those bones on every step, which creased the whole flank.
# Only the arm from its own joint outward should move; narrowing the arm band instead (0/2%,
# 2/6%, 3.5/7.5% inboard) did not help and pulled spikes out of the collar.
SHOULDER_TO_CHEST = {"doraemon"}
# (split, band, collar_floor) as fractions of height: above split + band the head is rigid;
# below split - band, head and neck weight goes to the chest; skin above collar_floor that is
# inboard of the shoulder joints loses its arm weight as well. Doraemon has no neck, his head is
# the top half of him, and his collar is the seam, so any blend there tears it on every swing.
# His collar, measured off the texture on the back of the 2026-09-13 sculpt, runs 45.1% to 48.9%
# of height and his chin starts at 48.5%.
HEAD_SPLIT = {"doraemon": (0.495, 0.01, 0.45)}
ARM_PARTS = ("Shoulder", "Arm", "ForeArm", "Hand")
# Skin this close to the hand and finger bones is the hand itself and is never clamped. The
# clamp measures in the bind pose, a T-pose where the hands stand well clear of the body, so
# nothing else comes this close; an open-handed sculpt's palm edge sits 5-7 cm off the bones,
# past ARM_HOLD, and clamping it left a flap of hand skin behind on every arm swing.
HAND_REACH = 0.075


# Per-character proportion fixes, applied to the rigged bind pose before anything is measured.
# `legs` stretches ankle-to-hip, which — once the character is normalised back to canon height —
# makes the head smaller in proportion; `hands` and `feet` shrink those parts toward the wrist
# and the ankle. User request 2026-09-13: Suneo's Rodin sculpt read as a short body on big mitts
# and clown shoes. `PROPORTION_OVERRIDE = {...}` tries other values without editing the table.
PROPORTIONS = {
    "suneo": {"legs": 1.15, "hands": 0.8, "feet": 0.8},
}


def reshape(mesh_obj, rig, prefix, spec):
    """Stretch the legs and shrink hands and feet on the mesh and the skeleton together.

    Blender's armature modifier binds against the current rest bones, and the glTF exporter
    derives inverse bind matrices from them, so moving the rest vertices and the edit bones by
    the same map keeps the skin bound and the clips valid: they are rotations, and the `Hips`
    track is rescaled later from the leg length measured after this. Hand and foot shrink is
    blended by skin weight, so the wrist and the ankle, which share weight with the arm and the
    leg, move only part of the way and no seam opens.
    """
    legs, hands, feet = spec.get("legs", 1.0), spec.get("hands", 1.0), spec.get("feet", 1.0)
    if (legs, hands, feet) == (1.0, 1.0, 1.0):
        return
    bpy.context.view_layer.update()
    to_world, to_mesh = mesh_obj.matrix_world.copy(), mesh_obj.matrix_world.inverted()
    rig_world, rig_local = rig.matrix_world.copy(), rig.matrix_world.inverted()
    bones = rig.data.bones

    def world(name, end="head"):
        return rig_world @ getattr(bones[f"{prefix}:{name}"], f"{end}_local")

    hip_z = (world("LeftUpLeg").z + world("RightUpLeg").z) / 2
    ankle_z = (world("LeftFoot").z + world("RightFoot").z) / 2
    ground_z = min((to_world @ v.co).z for v in mesh_obj.data.vertices)
    rise = (legs - 1.0) * (hip_z - ankle_z)

    def stretch(p):
        """Shoes keep their height, the shin and thigh grow, everything above rides up."""
        q = p.copy()
        q.z += rise if p.z >= hip_z else max(0.0, p.z - ankle_z) * (legs - 1.0)
        return q

    # Pivots and weights are read before anything moves; the stretch then carries the pivots.
    pivots = {}
    for side in ("Left", "Right"):
        pivots[f"{side}Hand"] = (stretch(world(f"{side}Hand")), hands)
        ankle = world(f"{side}Foot")
        # Shrink the shoe toward the floor under the ankle, so its sole stays on the ground.
        pivots[f"{side}Foot"] = (stretch(Vector((ankle.x, ankle.y, ground_z))), feet)
    # Skin group -> the part it shrinks with. Fingers were already folded into the hands.
    part_of = {}
    for side in ("Left", "Right"):
        part_of[f"{side}Hand"] = f"{side}Hand"
        for name in ("Foot", "ToeBase", "Toe_End"):
            part_of[f"{side}{name}"] = f"{side}Foot"
    group_part = {
        group.index: part_of[group.name.split(":")[-1]]
        for group in mesh_obj.vertex_groups
        if group.name.split(":")[-1] in part_of
    }

    for vertex in mesh_obj.data.vertices:
        p = stretch(to_world @ vertex.co)
        weights = {}
        for element in vertex.groups:
            part = group_part.get(element.group)
            if part:
                weights[part] = min(1.0, weights.get(part, 0.0) + element.weight)
        for part, weight in weights.items():
            pivot, factor = pivots[part]
            p = pivot + (p - pivot) * (1.0 - (1.0 - factor) * weight)
        vertex.co = to_mesh @ p
    mesh_obj.data.update()

    def inside(name, root):
        """The bone itself and every descendant, by walking parents."""
        bone = bones.get(name)
        while bone is not None:
            if bone.name == root:
                return True
            bone = bone.parent
        return False

    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    # Snapshot first: a connected child's head *is* its parent's tail, so writing one moves the
    # other, and reading as we go would transform every shared joint twice — the shoulders and
    # elbows jumped a second `rise` and the skin tore out into wings.
    rest = {b.name: (b.head.copy(), b.tail.copy()) for b in rig.data.edit_bones}
    for edit_bone in rig.data.edit_bones:
        for index, end in enumerate(("head", "tail")):
            p = stretch(rig_world @ rest[edit_bone.name][index])
            for part, (pivot, factor) in pivots.items():
                root = f"{prefix}:{part}"
                # The wrist and ankle joints stay put; only what hangs off them shrinks.
                if inside(edit_bone.name, root) and not (edit_bone.name == root and end == "head"):
                    p = pivot + (p - pivot) * factor
            setattr(edit_bone, end, rig_local @ p)
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"{char_id}: legs x{legs}, hands x{hands}, feet x{feet}")


# Catmull-Clark levels applied to the rigged mesh before anything else. Jaian's 2026-09-13 Rodin
# sculpt is a 4k-vertex quad cage: faceted at rest, and too coarse to bend — the belly stripe
# zig-zags on a stride and the hem breaks into shards. One level is ~33k triangles.
SUBDIVIDE = {"jaian": 1, "doraemon": 1}
# Characters whose rigged mesh still carries Rodin's second, off-centre tail. The cut happens here,
# on the skinned mesh, because the upload to Mixamo was the raw sculpt (4,128 vertices) rather
# than the cleaned `base_notail.fbx`, and re-rigging is a manual round trip.
STRAY_TAIL = {"doraemon"}
# Characters whose shirt or skirt hangs past the hip joint, with the fade band under it as a
# fraction of height. Mixamo weights that hem to the thighs, so every raised knee drags it out.
HEM_TO_HIPS = {"jaian": 0.06}


def subdivide(mesh_obj, levels):
    """Smooth the bound mesh under its own skin: the new vertices inherit interpolated weights.

    The modifier has to sit first in the stack, ahead of the armature, or applying it would bake
    the current pose into the mesh instead of refining the rest shape.
    """
    if not levels:
        return
    before = len(mesh_obj.data.polygons)
    modifier = mesh_obj.modifiers.new("subdivide", "SUBSURF")
    modifier.levels = levels
    modifier.render_levels = levels
    # Smooth the shape, never the UVs. A Rodin atlas packs hundreds of small islands edge to
    # edge, and any UV smoothing slides texels across those seams: Jaian's pink stripe came out
    # with a saw-tooth edge even at rest. Unsmoothed UVs stay linear inside each original face.
    modifier.uv_smooth = "NONE"
    with bpy.context.temp_override(object=mesh_obj, active_object=mesh_obj):
        bpy.ops.object.modifier_move_to_index(modifier=modifier.name, index=0)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    mesh_obj.data.polygons.foreach_set("use_smooth", [True] * len(mesh_obj.data.polygons))
    mesh_obj.data.update()
    tris = sum(len(p.vertices) - 2 for p in mesh_obj.data.polygons)
    print(f"{char_id}: subdivided x{levels}, {before} -> {len(mesh_obj.data.polygons)} faces ({tris} tris)")


def shoulder_to_chest(mesh_obj, prefix):
    """Give every `*Shoulder` weight to `Spine2`, so shrugging the clavicles moves no skin."""
    groups = mesh_obj.vertex_groups
    chest = groups.get(f"{prefix}:Spine2") or groups.new(name=f"{prefix}:Spine2")
    shoulders = {g.index: g for g in groups if g.name.split(":")[-1] in ("LeftShoulder", "RightShoulder")}
    moved = 0.0
    for vertex in mesh_obj.data.vertices:
        taken = [(e.group, e.weight) for e in vertex.groups if e.group in shoulders and e.weight > 0]
        for index, weight in taken:
            shoulders[index].remove([vertex.index])
            chest.add([vertex.index], weight, "ADD")
            moved += weight
    print(f"{char_id}: shoulder skin moved to the chest ({moved:.1f})")


def head_split(mesh_obj, rig, prefix, spec):
    """Make everything above a height rigid on `Head` and everything below it free of the head.

    Above `split + band` a vertex follows `Head` alone. Below `split - band`, any `Head` or
    `Neck` weight moves to `Spine2`, so the collar rides with the chest. Between the two, the
    head's share ramps linearly and the vertex's other weights are scaled to fill the rest.
    With a third value, skin above that height and inboard of both shoulder joints first loses
    its arm weight to `Spine2`: the collar passes right over the arm roots and was pinched into
    points by them. Runs after the arm-bleed clamp so its result is final.
    """
    if not spec:
        return
    split, band = spec[0], spec[1]
    collar_floor = spec[2] if len(spec) > 2 else None
    bpy.context.view_layer.update()
    lo, hi = world_bounds(mesh_obj)
    height = hi.z - lo.z
    groups = mesh_obj.vertex_groups
    head = groups.get(f"{prefix}:Head") or groups.new(name=f"{prefix}:Head")
    chest = groups.get(f"{prefix}:Spine2") or groups.new(name=f"{prefix}:Spine2")
    heady = {g.index for g in (head, groups.get(f"{prefix}:Neck")) if g is not None}
    arm_groups = {
        g.index for g in groups
        if any(g.name.split(":")[-1] == f"{side}{part}" for side in ("Left", "Right") for part in ARM_PARTS)
    }
    # Half-width to the shoulder joints: inboard of it is collar and chest, outboard is the arm.
    joint_x = min(
        abs((rig.matrix_world @ rig.data.bones[f"{prefix}:{side}Arm"].head_local).x)
        for side in ("Left", "Right")
    )
    by_index = {g.index: g for g in groups}
    matrix = mesh_obj.matrix_world
    counts = {"head": 0, "body": 0, "blend": 0, "collar": 0}
    for vertex in mesh_obj.data.vertices:
        world = matrix @ vertex.co
        z = (world.z - lo.z) / height
        if collar_floor is not None and z >= collar_floor and abs(world.x) < joint_x:
            freed = [(e.group, e.weight) for e in vertex.groups if e.group in arm_groups and e.weight > 0]
            for index, weight in freed:
                by_index[index].remove([vertex.index])
                chest.add([vertex.index], weight, "ADD")
            if freed:
                counts["collar"] += 1
        share = max(0.0, min(1.0, (z - (split - band)) / (2 * band)))
        # Everything but the head's own groups, renormalised to fill what the head leaves.
        body = [(e.group, e.weight) for e in vertex.groups if e.group not in heady and e.weight > 0]
        total = sum(w for _, w in body)
        # Plain indices first: removing a group invalidates the vertex's element references.
        for index in [e.group for e in vertex.groups if e.group in heady]:
            by_index[index].remove([vertex.index])
        if share >= 1.0:
            for index, _ in body:
                by_index[index].remove([vertex.index])
            head.add([vertex.index], 1.0, "REPLACE")
            counts["head"] += 1
            continue
        if total <= 0:
            chest.add([vertex.index], 1.0 - share, "REPLACE")
        else:
            for index, weight in body:
                by_index[index].add([vertex.index], (1.0 - share) * weight / total, "REPLACE")
        if share > 0:
            head.add([vertex.index], share, "REPLACE")
            counts["blend"] += 1
        else:
            counts["body"] += 1
    print(f"{char_id}: head split at {split:.3f} h: {counts}")


def hem_to_hips(mesh_obj, rig, prefix, fade):
    """Hand the thighs' weight on anything above the hip joint to the pelvis.

    Skin above the hip joint on these sculpts is a shirt or skirt hem, never a leg: the legs
    start below it. Above the joint the thigh weight moves to `Hips` entirely, and below it that
    share shrinks linearly over `fade` of body height, so the trouser tops still follow the legs.
    """
    if not fade:
        return
    bpy.context.view_layer.update()
    lo, hi = world_bounds(mesh_obj)
    band = fade * (hi.z - lo.z)
    hip_z = sum(
        (rig.matrix_world @ rig.data.bones[f"{prefix}:{side}UpLeg"].head_local).z for side in ("Left", "Right")
    ) / 2
    thighs = {
        mesh_obj.vertex_groups[f"{prefix}:{side}UpLeg"].index
        for side in ("Left", "Right")
        if f"{prefix}:{side}UpLeg" in mesh_obj.vertex_groups
    }
    hips = mesh_obj.vertex_groups.get(f"{prefix}:Hips") or mesh_obj.vertex_groups.new(name=f"{prefix}:Hips")
    groups = {g.index: g for g in mesh_obj.vertex_groups}
    matrix = mesh_obj.matrix_world
    touched, moved = 0, 0.0
    for vertex in mesh_obj.data.vertices:
        z = (matrix @ vertex.co).z
        if z <= hip_z - band:
            continue
        # 1 at and above the joint, 0 at the bottom of the band.
        share = min(1.0, (z - (hip_z - band)) / band)
        released = 0.0
        for element in vertex.groups:
            if element.group in thighs and element.weight > 0:
                take = element.weight * share
                groups[element.group].add([vertex.index], element.weight - take, "REPLACE")
                released += take
        if released > 0:
            hips.add([vertex.index], released, "ADD")
            touched += 1
            moved += released
    print(f"{char_id}: hem weight moved to the hips on {touched} vertices ({moved:.1f})")


def clamp_arm_bleed(mesh_obj, rig, prefix, height):
    """Take the arm bones' weight off vertices that are nowhere near an arm.

    On these chibi sculpts the sweater hem sits at armpit height and the hands hang against
    the hips, so Mixamo's auto-rigger cannot tell the torso's side from the arm and weights
    the hem to `*Shoulder`/`*Arm`. Raising an arm then drags the whole hem out into a flat
    wedge. Distance to the arm's own bone chain separates them exactly: skin within a few
    centimetres of the chain is arm, the rest is body — the same deterministic geometry
    `rig_welcome.py` weights by, instead of trusting a bone-heat solve.
    """
    spec = globals().get("ARM_BLEED_OVERRIDE") or ARM_BLEED.get(char_id, (ARM_HOLD, ARM_DROP))
    hold, drop = spec[0] * height, spec[1] * height
    # Optional second pair for the sleeve: skin past the shoulder joint along the upper arm.
    # A thick sleeve sits further from its bones than the default band allows, but widening the
    # band everywhere lets the arm drag the flank and belly along whenever it lifts.
    sleeve_hold, sleeve_drop = (spec[2] * height, spec[3] * height) if len(spec) == 4 else (hold, drop)
    shoulders = {}
    for side in ("Left", "Right"):
        arm = rig.data.bones.get(f"{prefix}:{side}Arm")
        fore = rig.data.bones.get(f"{prefix}:{side}ForeArm")
        if arm and fore:
            head = rig.matrix_world @ arm.head_local
            shoulders[side] = (head, ((rig.matrix_world @ fore.head_local) - head).normalized())
    hand_reach = HAND_REACH * height
    chains = {}
    hand_chains = {}
    for side in ("Left", "Right"):
        points = []
        for part in ARM_PARTS:
            bone = rig.data.bones.get(f"{prefix}:{side}{part}")
            if bone is None:
                continue
            points.append(rig.matrix_world @ bone.head_local)
            points.append(rig.matrix_world @ bone.tail_local)
        # Finger bones reach out past the hand bone's tail on an open-handed sculpt; without
        # them the fingertips measure as "far from the arm" and lose their hand weight.
        hand_points = []
        for bone in rig.data.bones:
            if bone.name == f"{prefix}:{side}Hand" or (
                bone.name.startswith(f"{prefix}:{side}Hand") and is_finger(bone.name)
            ):
                hand_points.append(rig.matrix_world @ bone.head_local)
                hand_points.append(rig.matrix_world @ bone.tail_local)
        chains[side] = points + [p for p in hand_points if p not in points]
        hand_chains[side] = hand_points
    groups = {g.index: g for g in mesh_obj.vertex_groups}
    side_of = {}
    for index, group in groups.items():
        for side in ("Left", "Right"):
            if any(group.name.endswith(f"{side}{part}") for part in ARM_PARTS):
                side_of[index] = side
    spine = [
        mesh_obj.vertex_groups[f"{prefix}:{name}"]
        for name in ("Hips", "Spine", "Spine1", "Spine2")
        if f"{prefix}:{name}" in mesh_obj.vertex_groups
    ]
    if not spine:
        raise RuntimeError("no spine groups to move the bled weight onto")

    matrix = mesh_obj.matrix_world
    moved = 0.0
    touched = 0
    for vertex in mesh_obj.data.vertices:
        arm = [(e.group, e.weight) for e in vertex.groups if e.group in side_of and e.weight > 0]
        if not arm:
            continue
        point = matrix @ vertex.co
        def to_chain(points):
            return min(
                (point - a).length if (b - a).length_squared == 0 else
                (point - (a + (b - a) * max(0.0, min(1.0, (point - a).dot(b - a) / (b - a).length_squared)))).length
                for a, b in zip(points, points[1:])
            )

        distance = {}
        in_hand = {}
        for side in {side_of[index] for index, _ in arm}:
            distance[side] = to_chain(chains[side])
            in_hand[side] = len(hand_chains[side]) >= 2 and to_chain(hand_chains[side]) <= hand_reach
        released = 0.0
        for index, weight in arm:
            if in_hand[side_of[index]]:
                continue
            side = side_of[index]
            near = distance[side]
            lo_band, hi_band = hold, drop
            if side in shoulders:
                # Ramp from the body band to the sleeve band over 5% of height past the joint. A
                # hard switch at the joint plane split neighbouring vertices between the two
                # bands and tore a shard out of Jaian's flank whenever the arm lifted.
                along = (point - shoulders[side][0]).dot(shoulders[side][1])
                ramp = max(0.0, min(1.0, along / (0.05 * height)))
                lo_band += (sleeve_hold - hold) * ramp
                hi_band += (sleeve_drop - drop) * ramp
            keep = 1.0 if near <= lo_band else 0.0 if near >= hi_band else (hi_band - near) / (hi_band - lo_band)
            if keep >= 1.0:
                continue
            groups[index].add([vertex.index], weight * keep, "REPLACE")
            released += weight * (1.0 - keep)
        if released <= 0:
            continue
        moved += released
        touched += 1
        # Hand it to the body: whatever else already holds this vertex, or the nearest spine
        # bone when the arm bones held it alone.
        rest = [(e.group, e.weight) for e in vertex.groups if e.group not in side_of and e.weight > 0]
        if rest:
            total = sum(w for _, w in rest)
            for index, weight in rest:
                groups[index].add([vertex.index], weight + released * weight / total, "REPLACE")
        else:
            nearest = min(
                spine,
                key=lambda g: abs(point.z - (rig.matrix_world @ rig.data.bones[g.name].head_local).z),
            )
            nearest.add([vertex.index], released, "ADD")
    print(f"{char_id}: arm bleed clamped on {touched} vertices, {moved:.1f} weight moved to the body")


wipe()

# --- the rigged character -----------------------------------------------------------------
bpy.ops.import_scene.fbx(filepath=character_fbx, **FBX_IMPORT)
rigs = scene_objects("ARMATURE")
meshes = sorted(scene_objects("MESH"), key=lambda o: len(o.data.vertices), reverse=True)
if len(rigs) != 1 or not meshes:
    raise RuntimeError(f"{char_id}: expected one armature and a mesh, got {len(rigs)}/{len(meshes)}")
rig, mesh_obj = rigs[0], meshes[0]
for extra in meshes[1:]:
    bpy.data.objects.remove(extra, do_unlink=True)

mesh_obj.name = char_id
mesh_obj.data.name = char_id
rig.name = f"{char_id}_rig"
rig.data.name = f"{char_id}_rig"

bone_names = [b.name for b in rig.data.bones]
prefixes = {name.split(":")[0] for name in bone_names if ":" in name}
if len(prefixes) != 1:
    raise RuntimeError(f"{char_id}: expected one bone prefix, got {sorted(prefixes)}")
rig_prefix = prefixes.pop()

if char_id in STRAY_TAIL:
    # Defines `remove_stray_tail` only: the file's standalone mode runs just when `SRC` is set.
    exec(open(f"{ROOT_DIR}/scripts/blender/remove_stray_tail.py").read(), tail_scope := {"__name__": "tail"})
    tail_scope["remove_stray_tail"](mesh_obj, diffuse=f"{rodin_dir}/texture_diffuse.png")
subdivide(mesh_obj, SUBDIVIDE.get(char_id, 0))
fold_finger_weights(mesh_obj, rig_prefix)
hem_fade = HEM_TO_HIPS.get(char_id, 0.0)
reshape(mesh_obj, rig, rig_prefix, {**PROPORTIONS.get(char_id, {}), **globals().get("PROPORTION_OVERRIDE", {})})
hem_to_hips(mesh_obj, rig, rig_prefix, hem_fade)
if char_id in SHOULDER_TO_CHEST:
    shoulder_to_chest(mesh_obj, rig_prefix)
lo, hi = world_bounds(mesh_obj)
clamp_arm_bleed(mesh_obj, rig, rig_prefix, hi.z - lo.z)
head_split(mesh_obj, rig, rig_prefix, HEAD_SPLIT.get(char_id))

# Facing: with up = +Z, a character whose left side is at +X faces −Y, which is what the glTF
# exporter turns into +Z — the direction the app stands its characters in. Read it off the legs
# rather than trusting Mixamo to preserve the uploaded orientation.
hips_left = rig.data.bones[f"{rig_prefix}:LeftUpLeg"].head_local
hips_right = rig.data.bones[f"{rig_prefix}:RightUpLeg"].head_local
across = hips_left - hips_right
if abs(across.x) < abs(across.y):
    raise RuntimeError(f"{char_id}: legs are not split along X ({across.x:.3f}, {across.y:.3f})")
yaw = yaw_override if yaw_override is not None else (0.0 if across.x > 0 else 180.0)
rig.rotation_mode = "XYZ"
rig.rotation_euler[2] += math.radians(yaw)

# Mixamo returns centimetres, and each auto-rig keeps its own scale, so measure and normalise
# on the object rather than assuming a factor. Scale stays on the armature object: applying it
# would rewrite the rest pose the clips were authored against.
lo, hi = world_bounds(mesh_obj)
height = hi.z - lo.z
if height <= 0:
    raise RuntimeError(f"{char_id}: zero height")
rig.scale *= target_height / height

lo, hi = world_bounds(mesh_obj)
rig.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
lo, hi = world_bounds(mesh_obj)

# The FBX round trip can lose the maps; the Rodin files are the same images prep_character
# baked in, so refill them rather than shipping a grey character. `RODIN_DIR` must name the
# sculpt that was uploaded — a different sculpt's texture lands on the wrong UVs. The normal
# map matters on a low-poly quad sculpt, where it carries the folds the mesh no longer has.
def fed_by_image(socket):
    """True when an image texture reaches this socket, directly or through a chain of nodes.

    A Rodin FBX can arrive with a Normal Map node plugged in and no image behind it, which
    counts as "linked" but carries nothing."""
    pending = [link.from_node for link in socket.links]
    seen = set()
    while pending:
        node = pending.pop()
        if node.name in seen:
            continue
        seen.add(node.name)
        if node.type == "TEX_IMAGE" and node.image:
            return True
        pending.extend(link.from_node for s in node.inputs for link in s.links)
    return False


for slot in mesh_obj.material_slots:
    material = slot.material
    if not material or not material.use_nodes:
        continue
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        continue
    # Rodin's "shaded" texture is the sculpt with its lighting baked in. Mixamo hands it back
    # wired to Emission, which would light the character from inside on top of the scene's own
    # lights, so it never ships.
    for link in list(bsdf.inputs["Emission Color"].links):
        print(f"{char_id}: dropped emission from {getattr(link.from_node.image, 'name', link.from_node.name)}")
        links.remove(link)
    # Unlinking alone leaves the socket at its default white, and the exporter writes that as
    # `emissiveFactor: [1, 1, 1]` — Jaian and Nobita shipped as flat white silhouettes.
    bsdf.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 0.0
    for socket_name, file_name in (("Base Color", "texture_diffuse.png"), ("Normal", "texture_normal.png")):
        if fed_by_image(bsdf.inputs[socket_name]):
            continue
        for link in list(bsdf.inputs[socket_name].links):
            links.remove(link)
        path = f"{rodin_dir}/{file_name}"
        if not os.path.exists(path):
            if socket_name == "Base Color":
                raise RuntimeError(f"{char_id}: no base colour in the FBX and no {path} to fall back on")
            continue
        image = bpy.data.images.load(path, check_existing=True)
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        if socket_name == "Base Color":
            image.colorspace_settings.name = "sRGB"
            links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            image.colorspace_settings.name = "Non-Color"
            normal_map = nodes.new("ShaderNodeNormalMap")
            links.new(tex.outputs["Color"], normal_map.inputs["Color"])
            links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
        print(f"{char_id}: {socket_name.lower()} restored from {path}")

# --- the clips ----------------------------------------------------------------------------
rig.animation_data_create()
rig.animation_data.action = None
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
# The rigged character download carries its own T-pose take; it would export as a ninth clip.
for stale in list(bpy.data.actions):
    bpy.data.actions.remove(stale)

# Measured before any clip lands: the rest pose is what the leg ruler reads.
target_legs = leg_length(rig, rig_prefix)
# Pose-space locations are in the FBX's units; the armature object carries the conversion.
unit_to_m = rig.matrix_world.to_scale().x
hips_scales = {}
for clip_id in CLIP_IDS:
    before = set(bpy.data.actions)
    before_objects = {o.name for o in bpy.context.scene.objects}
    bpy.ops.import_scene.fbx(filepath=f"{anim_dir}/{clip_id}.fbx", **FBX_IMPORT)
    new_actions = [a for a in bpy.data.actions if a not in before]
    if len(new_actions) != 1:
        raise RuntimeError(f"{clip_id}: expected one action, got {[a.name for a in new_actions]}")
    action = new_actions[0]
    action.name = clip_id

    imported = [o for o in bpy.context.scene.objects if o.name not in before_objects]
    clip_prefixes = {
        b.name.split(":")[0] for o in imported if o.type == "ARMATURE" for b in o.data.bones if ":" in b.name
    }
    # A prefix mismatch (Mixamo sometimes answers with mixamorig1:/mixamorig5:) assigns cleanly
    # and moves nothing, so fail here instead of shipping a frozen character.
    if clip_prefixes and clip_prefixes != {rig_prefix}:
        raise RuntimeError(f"{clip_id}: bone prefix {sorted(clip_prefixes)} != rig's {rig_prefix}")
    # The clip's own skeleton is the rig it was baked on, so the ratio holds even when the
    # clip came from an earlier auto-rig of this same character.
    clip_rigs = [o for o in imported if o.type == "ARMATURE"]
    if len(clip_rigs) != 1:
        raise RuntimeError(f"{clip_id}: expected one armature to measure, got {len(clip_rigs)}")
    hips_scale = target_legs / leg_length(clip_rigs[0], rig_prefix)
    hips_scales[clip_id] = hips_scale
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)

    # The fingers no longer drive any skin (see `fold_finger_weights`), so their keys only
    # bloat the file.
    remove_bone_fcurves(action, lambda bone: not is_finger(bone))
    curves = action_fcurves(action)
    hips_path = f'pose.bones["{rig_prefix}:Hips"].location'

    # The glTF exporter writes a key's time as `frame / fps`, so a clip keyed from frame 1
    # ships 33 ms of dead air before its first pose and stalls at every loop seam.
    offset = min((key.co.x for curve in curves for key in curve.keyframe_points), default=0.0)
    if offset:
        for curve in curves:
            for key in curve.keyframe_points:
                key.co.x -= offset
                key.handle_left.x -= offset
                key.handle_right.x -= offset
            curve.update()

    # Locomotion has to be in place: `use-walker.ts` owns world travel, and a clip that also
    # walks forward drifts a metre ahead of its route position and snaps back every cycle.
    # Mixamo's "In Place" checkbox is not offered on every clip, so strip it here instead.
    # Pose locations are in the FBX's own units (centimetres), hence `unit_to_m`: a component
    # worth a quarter metre is travel, the five centimetres of vertical bob are the gait.
    if clip_id in IN_PLACE:
        for curve in curves:
            if curve.data_path != hips_path:
                continue
            values = [key.co.y for key in curve.keyframe_points]
            travel = (max(values) - min(values)) * unit_to_m if values else 0.0
            if travel < 0.25:
                continue
            for key in curve.keyframe_points:
                key.co.y = values[0]
                key.handle_left.y = values[0]
                key.handle_right.y = values[0]
            curve.update()
            print(f"{clip_id}: {travel:.2f} m of root travel removed from axis {curve.array_index}")

    # Hips travel is authored in the source rig's units against its leg length.
    if abs(hips_scale - 1.0) > 1e-6:
        for curve in curves:
            if curve.data_path != hips_path:
                continue
            for key in curve.keyframe_points:
                key.co.y *= hips_scale
                key.handle_left.y *= hips_scale
                key.handle_right.y *= hips_scale
            curve.update()

    track = rig.animation_data.nla_tracks.new()
    track.name = clip_id
    track.strips.new(clip_id, 0, action)

def lowest_point(mesh_obj):
    """World height of the posed mesh's lowest vertex at the current frame."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh_obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    coords = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", coords)
    evaluated.to_mesh_clear()
    matrix = np.array(mesh_obj.matrix_world)
    return float((coords.reshape(-1, 3) @ matrix[2, :3]).min() + matrix[2, 3])


def keep_above_ground(action):
    """Raise the hips on every frame where the posed mesh dips below the floor.

    The clips are authored on another skeleton, and the rotations transfer exactly but the
    proportions do not. Suneo's foot bone is 27 cm on a 41 cm leg against Dekisugi's 19 cm on
    49 cm, so every toe-off pushes the long shoe 7-11 cm into the pavement. A reclining sit
    buries the seat by a different depth on each body, too. Measuring the posed mesh frame by
    frame fixes both without a per-character table; frames in the air are never lowered.
    """
    curves = [c for c in action_fcurves(action) if c.data_path == hips_path]
    if not curves:
        return
    scene = bpy.context.scene
    rig.animation_data.action = action
    slots = getattr(action, "slots", None)
    if slots:
        rig.animation_data.action_slot = slots[0]
    start, end = (int(round(v)) for v in action.frame_range)
    lifts = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        sink = -lowest_point(mesh_obj)
        if sink > GROUND_TOLERANCE:
            lifts[frame] = sink
    rig.animation_data.action = None
    if not lifts:
        return
    # World up, carried through the armature object (rotation and scale) into the Hips bone's
    # rest frame, where pose locations live — rather than guessing which curve is vertical.
    to_local = hips_bone.matrix_local.to_3x3().inverted() @ rig.matrix_world.to_3x3().inverted()
    for curve in curves:
        for key in curve.keyframe_points:
            lift = lifts.get(int(round(key.co.x)))
            if not lift:
                continue
            delta = (to_local @ Vector((0.0, 0.0, lift)))[curve.array_index]
            key.co.y += delta
            key.handle_left.y += delta
            key.handle_right.y += delta
        curve.update()
    print(
        f"{action.name}: raised on {len(lifts)}/{end - start + 1} frames, "
        f"deepest {max(lifts.values()) * 100:.1f} cm"
    )


# Mixamo bakes a key on every frame, so a lift per frame lands on a key and never between two.
hips_bone = rig.data.bones[f"{rig_prefix}:Hips"]
hips_path = f'pose.bones["{rig_prefix}:Hips"].location'
for track in rig.animation_data.nla_tracks:
    track.mute = True
for clip_id in CLIP_IDS:
    keep_above_ground(bpy.data.actions[clip_id])
for track in rig.animation_data.nla_tracks:
    track.mute = False

# An armature left holding an active action makes the exporter ship that one clip instead of
# every NLA track.
rig.animation_data.action = None

shipped = sorted(a.name for a in bpy.data.actions)
if shipped != sorted(CLIP_IDS):
    raise RuntimeError(f"{char_id}: actions in file are {shipped}")

os.makedirs(os.path.dirname(out_path), exist_ok=True)
globals()["OBJECTS"] = [char_id, f"{char_id}_rig"]
globals()["OUT_PATH"] = out_path
exec(open(f"{ROOT_DIR}/scripts/blender/export_glb.py").read())

print(
    f"{char_id}: yaw {yaw:.0f}, {hi.x - lo.x:.2f} x {hi.y - lo.y:.2f} x {hi.z - lo.z:.2f} m, "
    f"feet z {lo.z:.3f}, hips scale {sorted({round(s, 3) for s in hips_scales.values()})}, "
    f"clips {shipped}"
)
