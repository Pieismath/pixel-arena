"""Builds the big-head cartoon characters in Blender and exports them as glTF.

  baller.glb  one rigged player (body, face, sneakers, jersey number plates, four hair styles)
              with animations: Idle, Run, RunDribble, IdleDribble, Defend, Shoot, Pass, Celebrate, Dunk
  fans.glb    static crowd meshes in several poses; colors are region codes (skin/shirt/pants/...)
              in the vertex colors so the web app can recolor every fan per instance

Run:
  Blender --background --factory-startup --python blender/build_characters.py -- [out_dir] [--preview png_dir]

Units are feet. Blender is +Z up and the characters face -Y; the glTF exporter turns that into
+Y up, facing +Z, which is what the web app expects.
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.abspath(ARGS[0]) if ARGS and not ARGS[0].startswith("--") else os.path.join(HERE, "..", "public", "models")
PREVIEW_DIR = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None
FPS = 24


# --------------------------------------------------------------------------------------------
# Skeleton: joints, skin radii, bones
# --------------------------------------------------------------------------------------------


def mirrored(name, x, y, z):
    return {f"{name}.L": Vector((x, y, z)), f"{name}.R": Vector((-x, y, z))}


J = {
    "pelvis": Vector((0, 0.0, 2.8)),
    "waist": Vector((0, 0.02, 3.35)),
    "chest": Vector((0, 0.0, 4.05)),
    "neck": Vector((0, 0.04, 4.55)),
    "head_base": Vector((0, 0.03, 4.72)),
    "head_top": Vector((0, 0.02, 6.45)),
    **mirrored("shoulder", 0.92, 0.04, 4.28),
    **mirrored("elbow", 1.2, 0.12, 3.42),
    **mirrored("wrist", 1.3, 0.02, 2.7),
    **mirrored("palm", 1.36, -0.04, 2.4),
    **mirrored("fingertip", 1.38, -0.08, 2.08),
    **mirrored("hip", 0.44, 0.0, 2.66),
    **mirrored("knee", 0.5, -0.08, 1.52),
    **mirrored("ankle", 0.5, 0.04, 0.52),
    **mirrored("toe", 0.52, -0.7, 0.2),
}

RADIUS = {
    "pelvis": (0.64, 0.46),
    "waist": (0.56, 0.40),
    "chest": (1.01, 0.53),
    "neck": (0.3, 0.3),
    "head_base": (0.3, 0.3),
    "shoulder": (0.40, 0.37),
    "elbow": (0.25, 0.25),
    "wrist": (0.18, 0.17),
    "palm": (0.32, 0.21),
    "fingertip": (0.25, 0.16),
    "hip": (0.43, 0.43),
    "knee": (0.27, 0.27),
    "ankle": (0.21, 0.21),
}

SKIN_EDGES = [("pelvis", "waist"), ("waist", "chest"), ("chest", "neck"), ("neck", "head_base")]
for _s in "LR":
    SKIN_EDGES += [
        ("chest", f"shoulder.{_s}"),
        (f"shoulder.{_s}", f"elbow.{_s}"),
        (f"elbow.{_s}", f"wrist.{_s}"),
        (f"wrist.{_s}", f"palm.{_s}"),
        (f"palm.{_s}", f"fingertip.{_s}"),
        ("pelvis", f"hip.{_s}"),
        (f"hip.{_s}", f"knee.{_s}"),
        (f"knee.{_s}", f"ankle.{_s}"),
    ]

# Where to add rings along each skeleton edge (fractions from the first joint), and how much the
# limb bulges between its ends. Rings are where clothing seams can fall.
EDGE_RINGS = {
    ("pelvis", "waist"): ([0.35, 0.5, 0.75], 0.02),
    ("waist", "chest"): ([0.5], 0.06),
    ("chest", "neck"): ([0.6], 0.0),
    ("chest", "shoulder"): ([0.6], 0.0),
    ("shoulder", "elbow"): ([0.35, 0.6], 0.14),
    ("elbow", "wrist"): ([0.4, 0.7], 0.08),
    ("hip", "knee"): ([0.3, 0.55, 0.72, 0.78], 0.08),
    ("knee", "ankle"): ([0.4, 0.75, 0.85], 0.12),
}

# name, head joint, tail joint, parent
BONES = [
    ("hips", "pelvis", "waist", None),
    ("spine", "waist", "chest", "hips"),
    ("chest", "chest", "neck", "spine"),
    ("neck", "neck", "head_base", "chest"),
    ("head", "head_base", "head_top", "neck"),
]
for _s in "LR":
    BONES += [
        (f"clavicle.{_s}", "chest", f"shoulder.{_s}", "chest"),
        (f"upper_arm.{_s}", f"shoulder.{_s}", f"elbow.{_s}", f"clavicle.{_s}"),
        (f"forearm.{_s}", f"elbow.{_s}", f"wrist.{_s}", f"upper_arm.{_s}"),
        (f"hand.{_s}", f"wrist.{_s}", f"fingertip.{_s}", f"forearm.{_s}"),
        (f"thigh.{_s}", f"hip.{_s}", f"knee.{_s}", "hips"),
        (f"shin.{_s}", f"knee.{_s}", f"ankle.{_s}", f"thigh.{_s}"),
        (f"foot.{_s}", f"ankle.{_s}", f"toe.{_s}", f"shin.{_s}"),
    ]
PARENT = {b: p for b, _h, _t, p in BONES}
CHILDREN = {}
for _b, _h, _t, _p in BONES:
    CHILDREN.setdefault(_p, []).append(_b)
SEGMENTS = [(b, J[h], J[t]) for b, h, t, _p in BONES]

HEAD_CENTER = Vector((0, 0.0, 5.57))
HEAD_RADII = (0.76, 0.7, 0.83)


def at_head(dx, dy, dz):
    return (HEAD_CENTER.x + dx, HEAD_CENTER.y + dy, HEAD_CENTER.z + dz)


def base(name):
    return name.split(".")[0]


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length


def nearest_bones(p, exclude=("head",)):
    ranked = sorted((seg_dist(p, a, b), name) for name, a, b in SEGMENTS if name not in exclude)
    return ranked


# --------------------------------------------------------------------------------------------
# Scene helpers
# --------------------------------------------------------------------------------------------


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    return scene


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def material(name, color, rough=0.75, metal=0.0, emission=None):
    mat = bpy.data.materials.new(name)
    if hasattr(mat, 'use_nodes'):
        mat.use_nodes = True
    mat.use_backface_culling = True  # glTF doubleSided = false
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    mat.diffuse_color = (*color, 1.0)
    return mat


def srgb(hex_color):
    """Hex sRGB -> linear floats, which is what Blender color inputs expect."""
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def faces_of(verts):
    return {f for v in verts for f in v.link_faces}


def add_ellipsoid(bm, center, radii, mat, segs=(20, 12), rot=None):
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    rm = rot.to_matrix() if rot else Matrix.Identity(3)
    for v in ret["verts"]:
        local = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        v.co = rm @ local + Vector(center)
    for f in faces_of(ret["verts"]):
        f.material_index = mat
        f.smooth = True
    return ret["verts"]


def add_box(bm, center, size, mat, rot=None, bevel=0.0):
    ret = bmesh.ops.create_cube(bm, size=1.0)
    verts = ret["verts"]
    rm = rot.to_matrix() if rot else Matrix.Identity(3)
    for v in verts:
        local = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        v.co = rm @ local + Vector(center)
    faces = faces_of(verts)
    if bevel > 0:
        edges = list({e for f in faces for e in f.edges})
        res = bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect="EDGES", profile=0.5)
        # Bevel replaces some of the original faces, so keep only the ones that still exist.
        faces = {f for f in faces if f.is_valid} | set(res["faces"])
        verts = list({v for f in faces for v in f.verts})
    for f in faces:
        f.material_index = mat
        f.smooth = bevel > 0
    return verts


def add_torus(bm, center, major, minor, mat, segs=24, sides=8, arc=(0.0, 2 * math.pi), rot=None, closed=True):
    """Torus (or an arc of one) lying in the local XY plane."""
    rm = rot.to_matrix() if rot else Matrix.Identity(3)
    rings = []
    count = segs if closed else segs + 1
    for i in range(count):
        a = arc[0] + (arc[1] - arc[0]) * i / segs
        ring = []
        for j in range(sides):
            b = 2 * math.pi * j / sides
            r = major + minor * math.cos(b)
            local = Vector((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
            ring.append(bm.verts.new(rm @ local + Vector(center)))
        rings.append(ring)
    faces = []
    last = count if closed else count - 1
    for i in range(last):
        r0, r1 = rings[i], rings[(i + 1) % count]
        for j in range(sides):
            f = bm.faces.new((r0[j], r0[(j + 1) % sides], r1[(j + 1) % sides], r1[j]))
            f.material_index = mat
            f.smooth = True
            faces.append(f)
    if not closed:
        for ring, flip in ((rings[0], True), (rings[-1], False)):
            cap = bm.faces.new(list(reversed(ring)) if flip else ring)
            cap.material_index = mat
    return [v for r in rings for v in r]


# --------------------------------------------------------------------------------------------
# Body
# --------------------------------------------------------------------------------------------


def build_body_mesh(subsurf, region_of, materials):
    """Skin-modifier body. Clothing regions are assigned on the coarse skin mesh and then
    subdivided, so seams follow the edge loops instead of zig-zagging across triangles."""
    names = [n for n in J if n != "head_top" and not n.startswith("toe")]
    pts, radii, edges = [], [], []
    index = {}
    for n in names:
        index[n] = len(pts)
        pts.append(J[n])
        radii.append(RADIUS[base(n)])
    for a, b in SKIN_EDGES:
        rings, bulge = EDGE_RINGS.get((base(a), base(b)), ([], 0.0))
        prev = index[a]
        ra, rb = RADIUS[base(a)], RADIUS[base(b)]
        for t in rings:
            grow = 1 + bulge * math.sin(math.pi * t)
            pts.append(J[a].lerp(J[b], t))
            radii.append(((ra[0] + (rb[0] - ra[0]) * t) * grow, (ra[1] + (rb[1] - ra[1]) * t) * grow))
            edges.append((prev, len(pts) - 1))
            prev = len(pts) - 1
        edges.append((prev, index[b]))

    skel = bpy.data.meshes.new("skeleton")
    skel.from_pydata(pts, edges, [])
    obj = link(bpy.data.objects.new("skeleton", skel))
    skin = obj.modifiers.new("Skin", "SKIN")
    skin.branch_smoothing = 0.6
    skin.use_smooth_shade = True
    for i, r in enumerate(radii):
        sv = skel.skin_vertices[0].data[i]
        sv.radius = r
        sv.use_root = i == index["pelvis"]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    coarse = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(skel)

    mats = {n: i for i, n in enumerate(materials)}
    bm = bmesh.new()
    bm.from_mesh(coarse)
    for f in bm.faces:
        c = f.calc_center_median()
        _d, bone = nearest_bones(c)[0]
        f.material_index = mats[region_of(bone, c)]
        f.smooth = True
    bm.to_mesh(coarse)
    bm.free()
    if not subsurf:
        return coarse

    tmp = link(bpy.data.objects.new("coarse", coarse))
    sub = tmp.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = subsurf
    sub.render_levels = subsurf
    depsgraph = bpy.context.evaluated_depsgraph_get()
    body = bpy.data.meshes.new_from_object(tmp.evaluated_get(depsgraph))
    bpy.data.objects.remove(tmp)
    bpy.data.meshes.remove(coarse)
    return body


PLAYER_MATS = ["Skin", "Jersey", "Trim", "Shorts", "Socks", "Shoe", "Sole", "EyeWhite", "Dark", "Hair"]
FAN_REGIONS = ["Skin", "Shirt", "Pants", "Hair", "Shoe", "EyeWhite", "Dark", "Sole"]


def player_region(bone, c):
    """Which material a body face gets on a player (tank top jersey, long shorts)."""
    b = base(bone)
    if b == "hips":
        if c.z < 2.99:
            return "Shorts"
        return "Trim" if c.z < 3.08 else "Jersey"
    if b in ("spine", "chest"):
        return "Jersey"
    if b == "clavicle":
        return "Jersey" if abs(c.x) < 0.6 else "Skin"
    if b == "thigh":
        if c.z > 1.85:
            return "Shorts"
        return "Trim" if c.z > 1.77 else "Skin"
    if b == "shin":
        return "Socks" if c.z < 0.78 else "Skin"
    return "Skin"


def fan_region(bone, c):
    """Which region a body face gets on a fan (t-shirt with sleeves, long pants)."""
    b = base(bone)
    if b == "hips":
        return "Pants" if c.z < 3.0 else "Shirt"
    if b in ("spine", "chest", "clavicle"):
        return "Shirt"
    if b == "upper_arm":
        return "Shirt" if c.z > 3.95 else "Skin"
    if b in ("thigh", "shin"):
        return "Pants" if c.z > 0.62 else "Skin"
    return "Skin"


def add_cranium(bm, mat, low_poly=False):
    """An authored ring silhouette: broad temples, cheek planes, square tapered jaw."""
    count = 12 if low_poly else 24
    levels = [(-0.79, .34, .39), (-.67, .53, .53), (-.39, .68, .65),
              (-.08, .76, .70), (.24, .75, .68), (.53, .64, .59), (.73, .40, .40)]
    rings = []
    for z, rx, ry in levels:
        ring = []
        for i in range(count):
            a = 2 * math.pi * i / count
            # A mildly squared cross section keeps the face from reading as a balloon.
            x = math.copysign(abs(math.cos(a)) ** .87, math.cos(a)) * rx
            y = math.copysign(abs(math.sin(a)) ** .91, math.sin(a)) * ry
            ring.append(bm.verts.new(HEAD_CENTER + Vector((x, y, z))))
        rings.append(ring)
    for lower, upper in zip(rings, rings[1:]):
        for i in range(count):
            f = bm.faces.new((lower[i], lower[(i + 1) % count], upper[(i + 1) % count], upper[i]))
            f.material_index = mat
            f.smooth = True
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        f = bm.faces.new(list(reversed(ring)) if flip else ring)
        f.material_index = mat
        f.smooth = True
    return [v for ring in rings for v in ring]


def add_head(bm, mats, low_poly=False):
    small = (6, 4) if low_poly else (14, 8)
    add_cranium(bm, mats["Skin"], low_poly)
    for sx in (1, -1):
        add_ellipsoid(bm, at_head(sx * .755, .01, -.04), (.12, .14, .19), mats["Skin"], small)
        if not low_poly:
            add_ellipsoid(bm, at_head(sx * .79, -.107, -.025), (.046, .024, .071), mats["Skin"], small)
        # Narrow lids and strong brows give an intent expression at court scale.
        add_ellipsoid(bm, at_head(sx * .27, -.667, .13), (.166, .052, .076), mats["EyeWhite"], small)
        add_ellipsoid(bm, at_head(sx * .265, -.725, .132), (.059, .024, .060), mats["Dark"], small)
        brow_rot = Quaternion((0, 1, 0), math.radians(-12 * sx))
        add_box(bm, at_head(sx * .275, -.672, .292), (.355, .13, .11), mats["Hair"], rot=brow_rot, bevel=.0 if low_poly else .025)
        if not low_poly:
            # Cheek ridge with a soft planar transition, not a separate round cheek.
            add_ellipsoid(bm, at_head(sx * .42, -.601, -.13), (.20, .035, .08), mats["Skin"], (10, 6))
    # Wedge nose: a readable bridge and broad base with a deliberate highlight plane.
    points = [(-.105, -.65, .27), (.105, -.65, .27), (-.16, -.66, -.16),
              (.16, -.66, -.16), (-.11, -.865, -.12), (.11, -.865, -.12), (0, -.80, .19)]
    nv = [bm.verts.new(HEAD_CENTER + Vector(v)) for v in points]
    for ids in [(0, 6, 4, 2), (6, 1, 3, 5), (4, 6, 5), (2, 4, 5, 3)]:
        f = bm.faces.new([nv[i] for i in ids]); f.material_index = mats["Skin"]; f.smooth = False
    # A small asymmetric grin is more athletic than the original toy-like smile.
    add_box(bm, at_head(0, -.641, -.405), (.38, .047, .10), mats["Dark"], bevel=0 if low_poly else .025)
    if not low_poly:
        add_box(bm, at_head(.015, -.668, -.385), (.285, .016, .037), mats["EyeWhite"], bevel=.008)
        add_ellipsoid(bm, at_head(0, -.54, -.58), (.29, .04, .08), mats["Skin"], (12, 6))


def head_shell(bm, scale, keep, mat, segs=(28, 18)):
    """A copy of the head surface, pushed out a bit, keeping only the faces `keep` accepts."""
    verts = add_cranium(bm, mat, low_poly=segs[0] <= 12)
    for v in verts:
        v.co = HEAD_CENTER + (v.co - HEAD_CENTER) * scale
    doomed = [f for f in faces_of(verts) if not keep(f.calc_center_median() - HEAD_CENTER)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    # Give the shell some thickness so its open edge doesn't look paper-thin.
    remaining = [f for f in faces_of([v for v in verts if v.is_valid])]
    if remaining:
        bmesh.ops.solidify(bm, geom=remaining, thickness=0.04)


def add_twists(bm, mat, low=False):
    head_shell(bm, 1.025, lambda d: d.z > .4 or (d.y > -.22 and d.z > .05), mat, (12,8) if low else (24,14))
    for ix, x in enumerate((-.43, 0, .43)):
        for iy, y in enumerate((-.34, .05, .40)):
            z = .66 + (.12 if ix == 1 else .02) - (.07 if iy == 2 else 0)
            add_ellipsoid(bm, at_head(x,y,z), (.17,.23,.24), mat, (8,5) if low else (12,8),
                          rot=Quaternion((0,1,0), math.radians(-16 if ix == 0 else 16)))


HAIR_STYLES = {
    "Twists": add_twists,
    "Buzz": lambda bm, m, low=False: head_shell(bm, 1.035, lambda d: d.z > 0.52 or (d.y > -0.25 and d.z > 0.0), m, (12, 8) if low else (28, 18)),
    "Afro": lambda bm, m, low=False: add_ellipsoid(bm, at_head(0, 0.14, 0.5), (1.02, 0.98, 0.8), m, (10, 7) if low else (24, 14)),
    "Beard": lambda bm, m, low=False: head_shell(bm, 1.045, lambda d: d.z < -0.12 and d.y < 0.35 and not (abs(d.x) < 0.22 and -0.46 < d.z < -0.24 and d.y < -0.5), m, (12, 8) if low else (28, 18)),
}


def add_shoes(bm, mats, low_poly=False):
    for sx in (1, -1):
        x = sx * 0.5
        if low_poly:
            add_box(bm, (x, -0.2, 0.11), (0.58, 1.16, 0.22), mats["Sole"])
            add_ellipsoid(bm, (x, -0.22, 0.36), (0.32, 0.62, 0.31), mats["Shoe"], (8, 5))
            continue
        add_box(bm, (x, -0.2, 0.11), (0.58, 1.16, 0.22), mats["Sole"], bevel=0.1)  # sole
        add_ellipsoid(bm, (x, -0.22, 0.36), (0.32, 0.62, 0.31), mats["Shoe"], (20, 12))  # upper
        add_ellipsoid(bm, (x, -0.02, 0.62), (0.27, 0.3, 0.25), mats["Shoe"], (16, 8))  # high-top collar
        add_ellipsoid(bm, (x, -0.7, 0.2), (0.26, 0.14, 0.12), mats["Sole"], (12, 6))  # rubber toe cap
        add_box(bm, (x, -.22, .105), (.62, 1.14, .075), mats["Dark"], bevel=.025)
        add_box(bm, (x, -.18, .57), (.31, .46, .045), mats["Trim"], bevel=.03)
        for y in (-.05, -.16, -.27, -.38):
            add_box(bm, (x, y, .598 - max(0, -y-.16)*.38), (.32, .032, .035), mats["Sole"], bevel=.012)
        for side in (-1, 1):
            add_box(bm, (x + side * .293, -.18, .35), (.035, .41, .095), mats["Trim"], rot=Quaternion((1,0,0), math.radians(-22)), bevel=.025)
        add_box(bm, (x, .21, .62), (.18, .075, .27), mats["Trim"], bevel=.025)


def add_thumbs(bm, mats):
    for sx in (1, -1):
        add_ellipsoid(bm, (sx * 1.25, -0.24, 2.38), (0.12, 0.12, 0.17), mats["Skin"], (10, 6), rot=Quaternion((0, 1, 0), math.radians(20 * sx)))


def add_kit_detail(bm, mats):
    """Sewn ribbons are projected onto the body, so they follow cloth instead of floating."""
    body_tree = BVHTree.FromBMesh(bm)

    def front_ribbon(points, width, mat):
        rings = []
        for i, (x, z) in enumerate(points):
            tangent = Vector(points[min(len(points)-1, i+1)]) - Vector(points[max(0, i-1)])
            across = Vector((tangent.y, -tangent.x)).normalized() * (width/2)
            edge = []
            for sign in (-1, 1):
                xx, zz = x + sign*across.x, z + sign*across.y
                hit, normal, _, _ = body_tree.ray_cast(Vector((xx, -2, zz)), Vector((0, 1, 0)))
                if hit is None:
                    return
                edge.append(bm.verts.new(hit + normal * .018))
            rings.append(edge)
        for l, r in zip(rings, rings[1:]):
            f = bm.faces.new((l[0], l[1], r[1], r[0])); f.material_index = mat; f.smooth = True

    for side in (-1, 1):
        # Neck and long contrast seam down the side of the original jersey.
        front_ribbon([(side*(.05 + t*.30), 3.99+t*.27) for t in (0,.2,.4,.6,.8,1)], .065, mats["Trim"])
        front_ribbon([(side*(.45+t*.16), 3.17+t*.83) for t in (0,.2,.4,.6,.8,1)], .063, mats["Trim"])
        # Shorts hem follows the round leg surface instead of sitting in front of it.
        front_ribbon([(side*(.23+t*.54), 1.99) for t in (0,.2,.4,.6,.8,1)], .04, mats["Trim"])
        # Cloth side panel: project its edges inward from the outer leg.
        rings = []
        for z in (2.03, 2.18, 2.34, 2.50, 2.66):
            ring = []
            for y in (-.17, .07):
                hit, normal, _, _ = body_tree.ray_cast(Vector((side*.98, y, z)), Vector((-side, 0, 0)))
                if hit is not None:
                    ring.append(bm.verts.new(hit+normal*.022))
            if len(ring) == 2: rings.append(ring)
        for lower, upper in zip(rings,rings[1:]):
            vertices = (lower[0], lower[1], upper[1], upper[0])
            f = bm.faces.new(vertices if side > 0 else tuple(reversed(vertices))); f.material_index=mats["Trim"]; f.smooth=True
    add_ellipsoid(bm, (1.30, .015, 2.78), (.225, .21, .17), mats["Trim"], (12, 6))
    add_ellipsoid(bm, (-.5, -.04, 1.20), (.28, .285, .30), mats["Dark"], (12, 8))


def weight_mesh(obj, rigid=None):
    """Vertex weights: each vertex follows its nearest bone, blended with that bone's parent or
    child near the joints. `rigid(v_co)` can pin a vertex to one bone (head parts, shoes)."""
    groups = {b: obj.vertex_groups.new(name=b) for b, _h, _t, _p in BONES}
    for v in obj.data.vertices:
        pin = rigid(v.co) if rigid else None
        if pin:
            groups[pin].add([v.index], 1.0, "REPLACE")
            continue
        ranked = nearest_bones(v.co)
        d1, b1 = ranked[0]
        neighbours = set(CHILDREN.get(b1, [])) | ({PARENT[b1]} - {None})
        second = next(((d, b) for d, b in ranked[1:] if b in neighbours), None)
        if second is None:
            groups[b1].add([v.index], 1.0, "REPLACE")
            continue
        d2, b2 = second
        k = 4.0
        w1 = d2**k / (d1**k + d2**k + 1e-9)
        groups[b1].add([v.index], w1, "REPLACE")
        if 1 - w1 > 0.01:
            groups[b2].add([v.index], 1 - w1, "REPLACE")


def rigid_pin(co):
    """Head parts follow the head; sneakers follow the feet."""
    if (co - HEAD_CENTER).length < 1.4 and co.z > 4.74:
        return "head"
    if co.z < 0.62 and abs(co.x) > 0.15 and co.y < 0.45:
        return "foot.L" if co.x > 0 else "foot.R"
    return None


def assemble(name, body_mesh, region_of, materials, low_poly=False, hair=None):
    """Body + head + face + sneakers in one mesh, with a material slot per region."""
    mats = {n: i for i, n in enumerate(materials)}
    bm = bmesh.new()
    bm.from_mesh(body_mesh)
    if not low_poly:
        add_kit_detail(bm, mats)
    add_head(bm, mats, low_poly)
    add_shoes(bm, mats, low_poly)
    if not low_poly:
        add_thumbs(bm, mats)
    if hair:
        hair(bm, mats["Hair"])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


# --------------------------------------------------------------------------------------------
# Rig and animation
# --------------------------------------------------------------------------------------------


def build_rig(name="Rig"):
    arm = bpy.data.armatures.new(name)
    rig = link(bpy.data.objects.new(name, arm))
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = {}
    for bname, h, t, parent in BONES:
        eb = arm.edit_bones.new(bname)
        eb.head = J[h]
        eb.tail = J[t]
        eb.roll = 0.0
        if parent:
            eb.parent = edit[parent]
        edit[bname] = eb
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def mirror_pose(pose):
    out = {}
    for bone, (rx, ry, rz) in pose.items():
        if bone.endswith(".L"):
            other = bone[:-2] + ".R"
        elif bone.endswith(".R"):
            other = bone[:-2] + ".L"
        else:
            other = bone
            ry, rz = -ry, -rz
            out[other] = (rx, ry, rz)
            continue
        out[other] = (rx, -ry, -rz)
    return out


def both(name, rx=0, ry=0, rz=0):
    """Same rotation on both sides (Y/Z mirrored)."""
    return {f"{name}.L": (rx, ry, rz), f"{name}.R": (rx, -ry, -rz)}


def bone_quat(rig, bone, rx, ry, rz):
    """Rotation given in armature axes (X = character's left, Y = back, Z = up), relative to the
    parent, converted into the bone's local frame."""
    rest = rig.data.bones[bone].matrix_local.to_quaternion()
    r = Quaternion((0, 0, 1), math.radians(rz)) @ Quaternion((0, 1, 0), math.radians(ry)) @ Quaternion((1, 0, 0), math.radians(rx))
    return rest.inverted() @ r @ rest


def apply_pose(rig, pose, hips=(0, 0, 0)):
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        rx, ry, rz = pose.get(pb.name, (0, 0, 0))
        pb.rotation_quaternion = bone_quat(rig, pb.name, rx, ry, rz)
        pb.location = (0, 0, 0)
    hb = rig.pose.bones["hips"]
    rest = rig.data.bones["hips"].matrix_local.to_3x3()
    hb.location = rest.inverted() @ Vector(hips)


def key_all(rig, frame):
    for pb in rig.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame)
    rig.pose.bones["hips"].keyframe_insert("location", frame=frame)


def make_action(rig, name, keys):
    """keys: list of (frame, pose_dict, hips_offset)."""
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame, pose, hips in keys:
        apply_pose(rig, pose, hips)
        key_all(rig, frame)
    return action


# Poses. Angles in degrees, armature axes. Useful signs (character faces -Y):
#   thigh/upper_arm/forearm rx < 0 swings forward; shin rx > 0 bends the knee;
#   spine/chest/head rx > 0 leans forward; left arm ry < 0 raises it out to the side.

RUN_A = {
    "thigh.L": (-42, 0, 0), "shin.L": (14, 0, 0), "foot.L": (-8, 0, 0),
    "thigh.R": (32, 0, 0), "shin.R": (72, 0, 0), "foot.R": (20, 0, 0),
    "upper_arm.L": (38, 8, 0), "forearm.L": (-62, 0, 0),
    "upper_arm.R": (-48, -8, 0), "forearm.R": (-78, 0, 0),
    "spine": (12, 0, 0), "chest": (0, 0, -8), "head": (-8, 0, 6),
}
RUN_B = {
    "thigh.L": (6, 0, 0), "shin.L": (12, 0, 0),
    "thigh.R": (-14, 0, 0), "shin.R": (98, 0, 0), "foot.R": (10, 0, 0),
    "upper_arm.L": (2, 8, 0), "forearm.L": (-62, 0, 0),
    "upper_arm.R": (-6, -8, 0), "forearm.R": (-72, 0, 0),
    "spine": (12, 0, 0), "head": (-8, 0, 0),
}
STANCE = {
    **both("thigh", -24, 0, 0), **both("shin", 44, 0, 0), **both("foot", -18, 0, 0),
    "spine": (16, 0, 0), "head": (-12, 0, 0),
}
DRIBBLE_UP = {"upper_arm.R": (-22, 18, 0), "forearm.R": (-68, 0, 0), "hand.R": (-20, 0, 0)}
DRIBBLE_DOWN = {"upper_arm.R": (-30, 18, 0), "forearm.R": (-18, 0, 0), "hand.R": (18, 0, 0)}
GUARD_L = {"upper_arm.L": (-32, -34, 0), "forearm.L": (-42, 0, 0)}


def run_keys(overrides=None):
    a = {**RUN_A, **(overrides or {})}
    b = {**RUN_B, **(overrides or {})}
    ma = {**mirror_pose(RUN_A), **(overrides or {})}
    mb = {**mirror_pose(RUN_B), **(overrides or {})}
    return [(0, a, (0, 0, -0.12)), (4, b, (0, 0, 0.16)), (8, ma, (0, 0, -0.12)), (12, mb, (0, 0, 0.16)), (16, a, (0, 0, -0.12))]


def build_actions(rig):
    idle_a = {**both("upper_arm", 2, -4, 0), **both("forearm", -12, 0, 0), "spine": (3, 0, 0), "head": (2, 0, 0)}
    idle_b = {**both("upper_arm", -2, -6, 0), **both("forearm", -16, 0, 0), "spine": (5, 0, 0), "chest": (-2, 0, 0), "head": (-2, 0, 0)}
    make_action(rig, "Idle", [(0, idle_a, (0, 0, 0)), (24, idle_b, (0, 0, 0.04)), (48, idle_a, (0, 0, 0))])

    make_action(rig, "Run", run_keys())

    dribble_run = []
    for frame, pose, hips in run_keys():
        extra = DRIBBLE_DOWN if frame in (0, 8, 16) else DRIBBLE_UP
        pose = {k: v for k, v in pose.items() if not k.endswith(".R") or k.startswith(("thigh", "shin", "foot"))}
        dribble_run.append((frame, {**pose, **extra}, hips))
    make_action(rig, "RunDribble", dribble_run)

    crouch = (0, 0, -0.34)
    make_action(
        rig,
        "IdleDribble",
        [
            (0, {**STANCE, **GUARD_L, **DRIBBLE_DOWN}, crouch),
            (6, {**STANCE, **GUARD_L, **DRIBBLE_UP}, (0, 0, -0.3)),
            (12, {**STANCE, **GUARD_L, **DRIBBLE_DOWN}, crouch),
        ],
    )

    defend = {
        "thigh.L": (-28, -14, 0), "thigh.R": (-28, 14, 0), **both("shin", 52, 0, 0), **both("foot", -22, 0, 0),
        "spine": (22, 0, 0), "head": (-18, 0, 0),
        **both("upper_arm", -24, -68, 0), **both("forearm", -34, 0, 0),
    }
    defend_b = {**defend, **both("upper_arm", -30, -58, 0)}
    make_action(rig, "Defend", [(0, defend, (0, 0, -0.52)), (12, defend_b, (0, 0, -0.44)), (24, defend, (0, 0, -0.52))])

    hold = {**both("upper_arm", -58, -8, 0), **both("forearm", -84, 0, 0)}
    make_action(
        rig,
        "Shoot",
        [
            (0, {**STANCE, **hold}, (0, 0, -0.26)),
            (5, {**both("thigh", -36, 0, 0), **both("shin", 64, 0, 0), **both("foot", -26, 0, 0), "spine": (12, 0, 0),
                 "upper_arm.R": (-95, 0, 0), "forearm.R": (-85, 0, 0), "hand.R": (45, 0, 0),
                 "upper_arm.L": (-85, 18, 0), "forearm.L": (-80, 0, 0)}, (0, 0, -0.56)),
            (11, {**both("thigh", -4, 0, 0), **both("shin", 16, 0, 0), **both("foot", 30, 0, 0),
                  "upper_arm.R": (-150, 0, 0), "forearm.R": (-30, 0, 0), "hand.R": (30, 0, 0),
                  "upper_arm.L": (-130, 15, 0), "forearm.L": (-50, 0, 0)}, (0, 0, 1.9)),
            (14, {**both("thigh", -2, 0, 0), **both("shin", 18, 0, 0), **both("foot", 30, 0, 0),
                  "upper_arm.R": (-158, 0, 0), "forearm.R": (-4, 0, 0), "hand.R": (-70, 0, 0),
                  "upper_arm.L": (-120, 20, 0), "forearm.L": (-30, 0, 0)}, (0, 0, 1.75)),
            (18, {**both("thigh", -10, 0, 0), **both("shin", 26, 0, 0), **both("foot", 12, 0, 0),
                  "upper_arm.R": (-152, 0, 0), "forearm.R": (-6, 0, 0), "hand.R": (-70, 0, 0),
                  "upper_arm.L": (-100, 20, 0), "forearm.L": (-30, 0, 0)}, (0, 0, 0.8)),
            (24, {**STANCE, **both("upper_arm", -10, -6, 0), **both("forearm", -30, 0, 0)}, (0, 0, -0.2)),
        ],
    )

    make_action(
        rig,
        "Pass",
        [
            (0, {**STANCE, **hold}, (0, 0, -0.22)),
            (5, {**STANCE, **both("upper_arm", -84, -4, 0), **both("forearm", -8, 0, 0), **both("hand", -30, 0, 0), "spine": (22, 0, 0)}, (0, 0, -0.2)),
            (12, {**STANCE, **both("upper_arm", -20, -8, 0), **both("forearm", -30, 0, 0)}, (0, 0, -0.2)),
        ],
    )

    up_a = {**both("upper_arm", -150, -24, 0), **both("forearm", -20, 0, 0), "head": (-16, 0, 0), "spine": (-6, 0, 0)}
    up_b = {**both("upper_arm", -172, -12, 0), **both("forearm", -64, 0, 0), "head": (-22, 0, 0), "spine": (-8, 0, 0)}
    make_action(rig, "Celebrate", [(0, up_a, (0, 0, 0.3)), (6, up_b, (0, 0, 0.0)), (12, up_a, (0, 0, 0.3)), (18, up_b, (0, 0, 0.0)), (24, up_a, (0, 0, 0.3))])

    # One-handed tomahawk: gather, asymmetric takeoff, extended reach, follow-through, landing.
    dunk_gather = {**STANCE, "spine": (17, 0, -12), "head": (-18, 0, 8),
                   "upper_arm.R": (-78, 8, 0), "forearm.R": (-86, 0, 0),
                   "upper_arm.L": (-35, -42, 0), "forearm.L": (-40, 0, 0)}
    dunk_air = {"thigh.L": (-65, 0, 0), "shin.L": (92, 0, 0), "foot.L": (-15, 0, 0),
                "thigh.R": (14, 0, 0), "shin.R": (65, 0, 0), "foot.R": (20, 0, 0),
                "spine": (-10, 0, -16), "chest": (-8, 0, 15), "head": (8, 0, 0),
                "upper_arm.R": (-171, 8, 0), "forearm.R": (-8, 0, 0), "hand.R": (-7, 0, 0),
                "upper_arm.L": (-66, -65, 0), "forearm.L": (-20, 0, 0)}
    dunk_finish = {**dunk_air, "spine": (9, 0, -8), "upper_arm.R": (-145, 0, 0),
                   "forearm.R": (-8, 0, 0), "hand.R": (-55, 0, 0), "thigh.L": (-25, 0, 0), "shin.L": (48, 0, 0)}
    make_action(rig, "Dunk", [
        (0, dunk_gather, (0, 0, -.30)),
        (5, {**dunk_gather, **both("thigh", -42, 0, 0), **both("shin", 68, 0, 0)}, (0, 0, -.50)),
        (12, dunk_air, (0, 0, 3.30)),
        (17, dunk_air, (0, 0, 3.70)),
        (21, dunk_finish, (0, 0, 3.32)),
        (28, {**STANCE, **both("upper_arm", -10, -25, 0), **both("forearm", -35, 0, 0)}, (0, 0, -.43)),
        (36, idle_a, (0, 0, 0)),
    ])

    rig.animation_data.action = bpy.data.actions["Idle"]


# Crowd poses: static, baked into the mesh.
SIT = {**both("thigh", -86, -6, 0), **both("shin", 86, 0, 0), **both("upper_arm", -22, -2, 0), **both("forearm", -62, 0, 0), "spine": (6, 0, 0)}
FAN_POSES = {
    "Sit": (SIT, (0, 0, 0)),
    "Clap": ({**SIT, **both("upper_arm", -58, 16, 0), **both("forearm", -74, 0, 0), **both("hand", 0, 0, 0)}, (0, 0, 0)),
    "Card": ({**SIT, **both("upper_arm", -150, 10, 0), **both("forearm", -10, 0, 0), "head": (-6, 0, 0)}, (0, 0, 0)),
    "Cheer": ({**both("upper_arm", -160, -22, 0), **both("forearm", -18, 0, 0), "head": (-14, 0, 0), "spine": (-4, 0, 0)}, (0, 0, 0)),
    "Stand": ({**both("upper_arm", 4, -4, 0), **both("forearm", -30, 0, 0), "spine": (2, 0, 0)}, (0, 0, 0)),
}


# --------------------------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------------------------


def number_plate(name, y, flip):
    """Small plane on the chest or back for the jersey number (textured in the web app)."""
    me = bpy.data.meshes.new(name)
    w, h = 0.62, 0.6
    zc = 3.82
    # Wrap around the torso a little: three columns bent on an arc.
    cols = 4
    verts, faces, uvs = [], [], []
    for i in range(cols + 1):
        u = i / cols
        ang = (u - 0.5) * 0.9
        x = math.sin(ang) * 0.8 * (1 if not flip else -1)
        yy = y * math.cos(ang)
        for j, v in enumerate((0.0, 1.0)):
            verts.append((x, yy, zc - h / 2 + v * h))
    for i in range(cols):
        a, b, c, d = i * 2, i * 2 + 1, (i + 1) * 2 + 1, (i + 1) * 2
        faces.append((a, d, c, b))  # the mirrored x already makes the back plate face outward
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            col, row = divmod(vi, 2)
            uv.data[li].uv = (col / cols, float(row))
    me.materials.append(material(f"{name}Mat", (1, 1, 1), rough=0.9))
    obj = link(bpy.data.objects.new(name, me))
    return obj


def regionize(obj, codes, slots=16):
    """Replace an object's materials with one shared material and store each face's region
    (from `codes[material_index]`) in the red vertex color, so the web app can color every
    player with one draw call."""
    me = obj.data
    attr = me.color_attributes.new("Region", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        code = (codes[poly.material_index] + 0.5) / slots
        for li in poly.loop_indices:
            attr.data[li].color = (code, 0.0, 0.0, 1.0)
    me.color_attributes.active_color = attr
    me.materials.clear()
    shared = bpy.data.materials.get("Player") or material("Player", (1, 1, 1))
    me.materials.append(shared)


def skinned(obj, rig, rigid=None):
    weight_mesh(obj, rigid)
    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    return obj


def build_baller():
    reset()
    rig = build_rig("Baller")
    mats = [material(n, srgb(c)) for n, c in [
        ("Skin", "#b87a56"), ("Jersey", "#e2462f"), ("Trim", "#fff3e0"), ("Shorts", "#e2462f"), ("Socks", "#f5f2ea"),
        ("Shoe", "#1c1f2b"), ("Sole", "#f5f2ea"), ("EyeWhite", "#fbfbf6"), ("Dark", "#1a1214"), ("Hair", "#1b1412"),
    ]]
    body_mesh = build_body_mesh(1, player_region, PLAYER_MATS)
    me = assemble("Body", body_mesh, player_region, PLAYER_MATS)
    for m in mats:
        me.materials.append(m)
    body = link(bpy.data.objects.new("Body", me))
    skinned(body, rig, rigid_pin)
    regionize(body, list(range(len(PLAYER_MATS))))

    hair_mat = bpy.data.materials["Hair"]
    trim_mat = bpy.data.materials["Trim"]
    for style in ("Buzz", "Afro", "Beard", "Twists"):
        bm = bmesh.new()
        HAIR_STYLES[style](bm, 0)
        hm = bpy.data.meshes.new(f"Hair{style}")
        bm.to_mesh(hm)
        bm.free()
        hm.materials.append(hair_mat)
        hair_obj = skinned(link(bpy.data.objects.new(f"Hair{style}", hm)), rig, lambda co: "head")
        regionize(hair_obj, [PLAYER_MATS.index("Hair")])
    bm = bmesh.new()
    head_shell(bm, 1.06, lambda d: 0.5 < d.z + 0.08 * d.y < 0.64, 0)  # above the brows, dipping at the back
    hm = bpy.data.meshes.new("Headband")
    bm.to_mesh(hm)
    bm.free()
    hm.materials.append(trim_mat)
    band = skinned(link(bpy.data.objects.new("Headband", hm)), rig, lambda co: "head")
    regionize(band, [PLAYER_MATS.index("Trim")])

    for name, y, flip in (("NumberFront", -0.585, False), ("NumberBack", 0.575, True)):
        skinned(number_plate(name, y, flip), rig, lambda co: "chest")

    build_actions(rig)
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = 48
    return rig


def build_fans():
    reset()
    rig = build_rig("FanRig")
    body_mesh = build_body_mesh(0, fan_region, FAN_REGIONS)  # seen from a distance: no subdivision
    region_mats = [material(n, (1, 1, 1)) for n in FAN_REGIONS]
    hair_styles = {
        "Short": HAIR_STYLES["Buzz"],
        "Afro": HAIR_STYLES["Afro"],
        "Cap": None,
    }
    for pose_name, (pose, hips) in FAN_POSES.items():
        for hair_name, hair_fn in hair_styles.items():
            def hair(bm, m, hair_fn=hair_fn, hair_name=hair_name):
                if hair_fn:
                    hair_fn(bm, m, True)
                else:  # baseball cap in the shirt color: dome plus a brim
                    head_shell(bm, 1.05, lambda d: d.z > 0.25, FAN_REGIONS.index("Shirt"), segs=(12, 8))
                    add_ellipsoid(bm, at_head(0, -0.8, 0.5), (0.5, 0.42, 0.05), FAN_REGIONS.index("Shirt"), (8, 4), rot=Quaternion((1, 0, 0), math.radians(-12)))

            me = assemble(f"Fan{pose_name}{hair_name}", body_mesh, fan_region, FAN_REGIONS, low_poly=True, hair=hair)
            for m in region_mats:
                me.materials.append(m)
            obj = link(bpy.data.objects.new(f"Fan{pose_name}{hair_name}", me))
            skinned(obj, rig, rigid_pin)
            apply_pose(rig, pose, hips)
            bpy.context.view_layer.update()
            baked = bake_posed(obj, f"Fan_{pose_name}_{hair_name}")
            bpy.data.objects.remove(obj)
            ground_fan(baked, pose_name)
    bpy.data.objects.remove(rig)
    return


def bake_posed(obj, name):
    """Evaluate the armature deformation into a plain mesh, with region codes as vertex colors."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    me.name = name
    # Region code in the red channel; the app maps it to a per-fan color.
    attr = me.color_attributes.new("Region", "FLOAT_COLOR", "CORNER")
    for poly in me.polygons:
        code = (poly.material_index + 0.5) / 8.0
        for li in poly.loop_indices:
            attr.data[li].color = (code, 0.0, 0.0, 1.0)
    me.color_attributes.active_color = attr
    # One plain material; the app swaps in its own shader.
    me.materials.clear()
    mat = bpy.data.materials.get("FanMat") or material("FanMat", (1, 1, 1))
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me))


def ground_fan(obj, pose_name):
    """Seated fans: origin where the seat touches the bench. Standing fans: origin at the soles."""
    me = obj.data
    if pose_name in ("Sit", "Clap", "Card"):
        # Seat contact = the lowest point of the pelvis area.
        seat = min(v.co.z for v in me.vertices if abs(v.co.x) < 0.6 and 1.4 < v.co.z < 3.1 and v.co.y > -0.9)
        offset = Vector((0, 0.0, -seat))
    else:
        offset = Vector((0, 0, -min(v.co.z for v in me.vertices)))
    for v in me.vertices:
        v.co += offset


def export(path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_image_format="AUTO",
        **kw,
    )
    print("EXPORTED", path, os.path.getsize(path))


def preview(path, objects_filter=None, frame=None, action=None, rig=None, camera=(6, -14, 5.5), target=(0, 0, 3.4), lens=50):
    scene = bpy.context.scene
    if rig and action:
        rig.animation_data.action = bpy.data.actions[action]
    if frame is not None:
        scene.frame_set(frame)
    world = bpy.data.worlds.new("World")
    if hasattr(world, "use_nodes"):
        world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.45, 0.62, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world
    sun = link(bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")))
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.86, 0.7)
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    cam = link(bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")))
    cam.data.lens = lens
    cam.location = camera
    direction = Vector(target) - Vector(camera)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for o in (sun, cam):
        bpy.data.objects.remove(o)
    print("PREVIEW", path)


def show_hair(style):
    for name in ("HairBuzz", "HairAfro", "HairBeard", "HairTwists", "Headband"):
        obj = bpy.data.objects.get(name)
        if obj:
            obj.hide_render = name != style and not (style == "Headband" and name == "HairBuzz")


def main():
    rig = build_baller()
    if PREVIEW_DIR:
        show_hair("HairBuzz")
        preview(os.path.join(PREVIEW_DIR, "baller_idle.png"), rig=rig, action="Idle", frame=0)
        preview(os.path.join(PREVIEW_DIR, "baller_run.png"), rig=rig, action="RunDribble", frame=0, camera=(12, -8, 5), target=(0, 0, 3.2))
        preview(os.path.join(PREVIEW_DIR, "baller_shoot.png"), rig=rig, action="Shoot", frame=11, camera=(8, -12, 6), target=(0, 0, 4.5))
        show_hair("Headband")
        preview(os.path.join(PREVIEW_DIR, "baller_face.png"), rig=rig, action="Idle", frame=0, camera=(2.5, -7, 5.4), target=(0, 0, 5.1), lens=60)
        rig.animation_data.action = bpy.data.actions["Idle"]
        bpy.context.scene.frame_set(0)
        show_hair(None)
        for o in bpy.data.objects:
            o.hide_render = False
    export(os.path.join(OUT_DIR, "baller.glb"), export_animations=True, export_animation_mode="ACTIONS", export_skins=True, export_vertex_color="ACTIVE", export_force_sampling=True, export_optimize_animation_size=False)

    build_fans()
    if PREVIEW_DIR:
        # Lay the fans out in a row for a look.
        fans = [o for o in bpy.context.scene.objects if o.name.startswith("Fan_")]
        for i, o in enumerate(sorted(fans, key=lambda o: o.name)):
            o.location = ((i % 5) * 2.6 - 5.2, (i // 5) * 3.0, 0)
        preview(os.path.join(PREVIEW_DIR, "fans.png"), camera=(0, -26, 10), target=(0, 3, 2), lens=40)
        for o in fans:
            o.location = (0, 0, 0)
    export(os.path.join(OUT_DIR, "fans.glb"), export_animations=False, export_skins=False, export_vertex_color="ACTIVE")


main()
