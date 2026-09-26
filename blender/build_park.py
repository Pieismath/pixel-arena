"""Builds the street-court park in Blender and exports public/models/park.glb.

Static geometry is merged into one mesh per material (named Static_<Material>) so the web app
draws the whole park in a few dozen calls and can swap in its own textures by material name.
Everything a brand can buy is its own named object with 0..1 UVs on its front face:
  CourtSurface, BigScreen, NamingSign, GraffitiWall, Mural_0..4, Banner_0..23

Positions come from src/world/park-layout.json, shared with the web app, and are written in the
app's axes (x east, y up, z south) then converted to Blender's (x, -z, y).

Run:
  Blender --background --factory-startup --python blender/build_park.py -- [out.glb] [--preview png]
"""

import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(ARGS[0]) if ARGS and not ARGS[0].startswith("--") else os.path.join(HERE, "..", "public", "models", "park.glb")
PREVIEW = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None
L = json.load(open(os.path.join(HERE, "..", "src", "world", "park-layout.json")))
rng = random.Random(7)


def B(x, y, z):
    """App coordinates -> Blender coordinates."""
    return Vector((x, -z, y))


# --------------------------------------------------------------------------------------------
# Materials (plain colors; the app replaces most of them with its own textures by name)
# --------------------------------------------------------------------------------------------

COLORS = {
    "Asphalt": ("#3b3c45", 0.9), "ParkGround": ("#595e6b", 0.9), "Sidewalk": ("#a39c93", 0.85),
    "Curb": ("#8c877f", 0.85), "WallPaint": ("#d9d1c5", 0.9), "Aluminum": ("#b8bfc8", 0.35),
    "Metal": ("#343842", 0.5), "Padding": ("#23396b", 0.7), "FacadeRed": ("#9a4a3a", 0.9),
    "FacadeTan": ("#b98a64", 0.9), "FacadeGray": ("#6f6b73", 0.9), "Roof": ("#3a3438", 0.9),
    "Cornice": ("#d9cbb5", 0.8), "Wood": ("#7a5236", 0.8), "Foliage": ("#3f8f4a", 0.9),
    "FoliageLight": ("#5aa844", 0.9), "Bark": ("#5a3d2a", 0.9), "AwningRed": ("#c23b2e", 0.8),
    "AwningGreen": ("#2e8b57", 0.8), "LampGlow": ("#fff2c4", 0.5), "ChainLink": ("#8d949c", 0.5),
    "Net": ("#f5f5f5", 0.8), "Rim": ("#e8531f", 0.5), "Backboard": ("#f4f4f4", 0.4),
    "BannerBack": ("#e9e6df", 0.9), "ScreenFrame": ("#15171e", 0.6), "ShopGlass": ("#2b3a4a", 0.2),
    "Trim": ("#f2e8d8", 0.8), "Planter": ("#6b5a4a", 0.9),
}
HOOK_COLORS = {"CourtSurface": "#6d4b8f", "BigScreen": "#101018", "NamingSign": "#101426", "GraffitiWall": "#d9d1c5", "Mural": "#cfc8bb", "Banner": "#0f1326"}


def lin(hex_color):
    h = hex_color.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


MATS = {}


def mat(name, hex_color=None, rough=0.85, emission=False):
    if name in MATS:
        return MATS[name]
    if hex_color is None:
        hex_color, rough = COLORS[name]
    m = bpy.data.materials.new(name)
    m.use_backface_culling = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    c = lin(hex_color)
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if name in ("Aluminum", "Metal"):
        bsdf.inputs["Metallic"].default_value = 0.6
    if emission or name in ("LampGlow",):
        bsdf.inputs["Emission Color"].default_value = (*c, 1)
        bsdf.inputs["Emission Strength"].default_value = 3.0
    m.diffuse_color = (*c, 1)
    MATS[name] = m
    return m


# --------------------------------------------------------------------------------------------
# Geometry: static parts accumulate per material; hooks are separate named objects
# --------------------------------------------------------------------------------------------

STATIC = {}


def sbm(material):
    if material not in STATIC:
        STATIC[material] = bmesh.new()
    return STATIC[material]


def world_uv(bm, faces):
    """UVs in feet from the face's dominant axis, so tiling textures keep a constant scale."""
    uv = bm.loops.layers.uv.verify()
    for f in faces:
        f.normal_update()
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 2:
                loop[uv].uv = (co.x, co.y)
            elif ax == 0:
                loop[uv].uv = (co.y * (1 if n.x < 0 else -1), co.z)
            else:
                loop[uv].uv = (co.x * (1 if n.y < 0 else -1), co.z)


def _finish(bm, verts, smooth=False):
    faces = list({f for v in verts for f in v.link_faces})
    for f in faces:
        f.smooth = smooth
    world_uv(bm, faces)
    return faces


def box(material, center, size, rot=0.0, bm=None):
    """Axis box in app coords: center (x, y, z), size (sx, sy, sz), rotated `rot` about +y."""
    bm = bm or sbm(material)
    ret = bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.Translation(B(*center)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Diagonal((size[0], size[2], size[1], 1))
    bmesh.ops.transform(bm, matrix=m, verts=ret["verts"])
    return _finish(bm, ret["verts"])


def beam(material, p0, p1, thickness, bm=None):
    """Square beam between two app-space points."""
    bm = bm or sbm(material)
    a, b = B(*p0), B(*p1)
    d = b - a
    length = d.length
    ret = bmesh.ops.create_cube(bm, size=1.0)
    rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    m = Matrix.Translation((a + b) / 2) @ rot @ Matrix.Diagonal((thickness, thickness, length, 1))
    bmesh.ops.transform(bm, matrix=m, verts=ret["verts"])
    return _finish(bm, ret["verts"])


def cyl(material, bottom, radius, height, segs=12, bm=None, top_radius=None):
    bm = bm or sbm(material)
    ret = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=radius, radius2=top_radius if top_radius is not None else radius, depth=height)
    m = Matrix.Translation(B(bottom[0], bottom[1] + height / 2, bottom[2]))
    bmesh.ops.transform(bm, matrix=m, verts=ret["verts"])
    return _finish(bm, ret["verts"], smooth=True)


def blob(material, center, radii, segs=(14, 9), bm=None):
    bm = bm or sbm(material)
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    m = Matrix.Translation(B(*center)) @ Matrix.Diagonal((radii[0], radii[2], radii[1], 1))
    bmesh.ops.transform(bm, matrix=m, verts=ret["verts"])
    return _finish(bm, ret["verts"], smooth=True)


def hook(name, center, width, height, facing, front_material, back_material, depth=0.3):
    """A thin panel whose court-facing side has 0..1 UVs (left-to-right as seen from the front)."""
    bm = bmesh.new()
    if facing in ("+z", "-z"):
        size = (width, height, depth)
    else:
        size = (depth, height, width)
    ret = bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.Translation(B(*center)) @ Matrix.Diagonal((size[0], size[2], size[1], 1))
    bmesh.ops.transform(bm, matrix=m, verts=ret["verts"])
    uv = bm.loops.layers.uv.verify()
    normal = {"+z": Vector((0, -1, 0)), "-z": Vector((0, 1, 0)), "+x": Vector((1, 0, 0)), "-x": Vector((-1, 0, 0))}[facing]
    cx, cy, cz = center
    for f in bm.faces:
        f.normal_update()
        front = f.normal.dot(normal) > 0.9
        f.material_index = 0 if front else 1
        for loop in f.loops:
            co = loop.vert.co  # Blender coords; app x = co.x, app z = -co.y, app y = co.z
            ax, az, ay = co.x, -co.y, co.z
            v = (ay - (cy - height / 2)) / height
            if facing == "+z":
                u = (ax - (cx - width / 2)) / width
            elif facing == "-z":
                u = ((cx + width / 2) - ax) / width
            elif facing == "+x":
                u = ((cz + width / 2) - az) / width
            else:
                u = (az - (cz - width / 2)) / width
            loop[uv].uv = (u, v) if front else (ax + az, ay)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat(front_material, HOOK_COLORS.get(front_material.split("_")[0], "#888888")))
    me.materials.append(mat(back_material))
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


# --------------------------------------------------------------------------------------------
# The park
# --------------------------------------------------------------------------------------------


def ground():
    box("Asphalt", (0, -0.25, 0), (700, 0.5, 700))
    f = L["fence"]
    box("ParkGround", (0, 0.02, (f["north"] + f["south"]) / 2), (f["x"] * 2, 0.04, f["south"] - f["north"]))
    # Sidewalks with curbs around the park.
    for (x0, x1, z0, z1) in [(-92, 92, -82, f["north"]), (-92, 92, f["south"], 76), (-92, -f["x"], f["north"], f["south"]), (f["x"], 90, f["north"], f["south"])]:
        box("Sidewalk", ((x0 + x1) / 2, 0.15, (z0 + z1) / 2), (x1 - x0, 0.3, z1 - z0))
    # Court surface: its own object with 0..1 UVs; the app paints lines and the court name on it.
    fl = L["floor"]
    me = bpy.data.meshes.new("CourtSurface")
    hw, hd = fl["length"] / 2, fl["width"] / 2
    me.from_pydata([B(-hw, 0.06, -hd), B(hw, 0.06, -hd), B(hw, 0.06, hd), B(-hw, 0.06, hd)], [], [(3, 2, 1, 0)])
    uv = me.uv_layers.new(name="UVMap")
    corner_uv = [(0, 1), (1, 1), (1, 0), (0, 0)]
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = corner_uv[me.loops[li].vertex_index]
    me.materials.append(mat("CourtSurface", HOOK_COLORS["CourtSurface"]))
    obj = bpy.data.objects.new("CourtSurface", me)
    bpy.context.scene.collection.objects.link(obj)
    if obj.data.polygons[0].normal.z < 0:
        obj.data.flip_normals()


def bleachers():
    s = L["bleacherShape"]
    half = (44 * s["seatSpacing"]) / 2 + 1.5
    for b in L["bleachers"]:
        side = b["side"]
        rows = b["rows"]
        for r in range(rows):
            y = s["firstHeight"] + r * s["rowRise"]
            z = side * (s["front"] + r * s["rowDepth"])
            box("Aluminum", (0, y, z + side * 0.2), (half * 2, 0.16, 1.1))  # seat plank
            box("Aluminum", (0, y - 1.1, z - side * 1.05), (half * 2, 0.12, 0.9))  # footboard
            box("Metal", (0, y - 0.55, z - side * 0.45), (half * 2, 1.1, 0.06))  # riser plate
        top_y = s["firstHeight"] + (rows - 1) * s["rowRise"]
        back_z = side * (s["front"] + (rows - 1) * s["rowDepth"] + 1.2)
        front_z = side * (s["front"] - 1.6)
        # Frames: a sloped stringer and posts every ~11 ft, plus end rails and a back rail.
        for x in [-half + 0.3] + [(-half + i * (2 * half / 8)) for i in range(1, 8)] + [half - 0.3]:
            beam("Metal", (x, 0, front_z), (x, top_y + 0.2, back_z), 0.35)
            box("Metal", (x, (top_y + 0.2) / 2, back_z), (0.35, top_y + 0.2, 0.35))
        for x in (-half, half):
            beam("Metal", (x, s["firstHeight"] + 3.2, side * (s["front"] - 0.5)), (x, top_y + 3.2, back_z), 0.18)
            for r in range(0, rows, 2):
                y = s["firstHeight"] + r * s["rowRise"]
                z = side * (s["front"] + r * s["rowDepth"])
                box("Metal", (x, y + 1.6, z), (0.12, 3.2, 0.12))
        box("Metal", (0, top_y + 3.4, back_z), (half * 2, 0.18, 0.18))
        for i in range(12):
            x = -half + i * (2 * half / 11)
            box("Metal", (x, top_y + 1.7, back_z), (0.12, 3.4, 0.12))
        # Skirt panels hiding the space under the stands.
        box("Metal", (0, top_y / 2, back_z + side * 0.1), (half * 2, top_y, 0.1))


def barriers_and_banners():
    bar = L["barrier"]
    sb = L["sidelineBanners"]
    eb = L["endBanners"]
    idx = 0
    for side, facing in ((-1, "+z"), (1, "-z")):
        z = side * bar["z"]
        box("Padding", (0, bar["height"] / 2, z), (bar["length"], bar["height"], 0.8))
        box("Trim", (0, bar["height"] + 0.06, z), (bar["length"], 0.12, 0.9))
        gap = 0.4
        span = sb["perSide"] * sb["length"] + (sb["perSide"] - 1) * gap
        for i in range(sb["perSide"]):
            x = -span / 2 + sb["length"] / 2 + i * (sb["length"] + gap)
            if side == 1:
                x = -x  # keep indices running left-to-right as seen from the court
            face_z = z - side * (0.4 + 0.06)
            hook(f"Banner_{idx}", (x, sb["y"] + sb["height"] / 2, face_z), sb["length"], sb["height"], facing, f"Banner_{idx}", "BannerBack", depth=0.1)
            idx += 1
    for sx, facing in ((1, "-x"), (-1, "+x")):
        x = sx * eb["x"]
        span = eb["perEnd"] * eb["length"] + (eb["perEnd"] - 1) * eb["gap"]
        for i in range(eb["perEnd"]):
            z = -span / 2 + eb["length"] / 2 + i * (eb["length"] + eb["gap"])
            hook(f"Banner_{idx}", (x - sx * 0.25, eb["y"] + eb["height"] / 2, z), eb["length"], eb["height"], facing, f"Banner_{idx}", "BannerBack", depth=0.12)
            idx += 1


def fence():
    f = L["fence"]
    h = f["height"]
    x, zn, zs = f["x"], f["north"], f["south"]
    runs = [((-x, zn), (x, zn)), ((x, zn), (x, zs)), ((x, zs), (-x, zs)), ((-x, zs), (-x, zn))]
    for (x0, z0), (x1, z1) in runs:
        length = math.hypot(x1 - x0, z1 - z0)
        n = max(1, int(length // 10))
        for i in range(n + 1):
            t = i / n
            px, pz = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            cyl("Metal", (px, 0, pz), 0.17, h + 0.3, segs=8)
        beam("Metal", (x0, h, z0), (x1, h, z1), 0.16)
        beam("Metal", (x0, 0.4, z0), (x1, 0.4, z1), 0.1)
        # Chain-link panel: world UVs in feet so the app can tile a wire texture.
        horizontal = abs(z1 - z0) < 1e-6
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        size = (length, h, 0.04) if horizontal else (0.04, h, length)
        box("ChainLink", (cx, h / 2, cz), size)


def hoops():
    hp = L["hoop"]
    rim = L["rim"]
    for s in (1, -1):
        px = s * hp["poleX"]
        cyl("Padding", (px, 0, 0), 0.62, 6.5, segs=14)
        cyl("Metal", (px, 6.5, 0), 0.34, 7.2, segs=12)
        beam("Metal", (px, 13.2, 0), (s * (hp["boardX"] + 0.4), 12.6, 0), 0.45)
        beam("Metal", (px, 9.8, 0), (s * (hp["boardX"] + 0.6), 12.4, 0), 0.25)
        box("Backboard", (s * hp["boardX"], 11.6, 0), (0.3, 3.6, 6.2))
        box("Rim", (s * (hp["boardX"] - 0.2), 11.0, 0), (0.1, 1.6, 2.0))  # shooter's square
        box("Backboard", (s * (hp["boardX"] - 0.23), 11.05, 0), (0.08, 1.3, 1.6))
        # Rim: a torus made of short beams.
        cx = s * rim["x"]
        n = 20
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            p0 = (cx + math.cos(a0) * rim["radius"], rim["y"], math.sin(a0) * rim["radius"])
            p1 = (cx + math.cos(a1) * rim["radius"], rim["y"], math.sin(a1) * rim["radius"])
            beam("Rim", p0, p1, 0.09)
        box("Rim", (s * (rim["x"] + 0.9), rim["y"], 0), (0.9, 0.12, 0.3))
        cyl("Net", (cx, rim["y"] - 1.5, 0), 0.45, 1.5, segs=16, top_radius=rim["radius"] - 0.02)


def building(x0, x1, z0, z1, height, facade, water_tower=None, fire_escape=None, cornice=True):
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    w, d = x1 - x0, z1 - z0
    box(facade, (cx, height / 2, cz), (w, height, d))
    box("Roof", (cx, height + 0.2, cz), (w - 0.6, 0.4, d - 0.6))
    if cornice:
        box("Cornice", (cx, height - 0.7, cz), (w + 1.4, 1.4, d + 1.4))
        box("Cornice", (cx, 12.5, cz), (w + 0.6, 0.8, d + 0.6))
    if water_tower:
        tx, tz = water_tower
        for dx, dz in ((-2.6, -2.6), (2.6, -2.6), (-2.6, 2.6), (2.6, 2.6)):
            beam("Metal", (tx + dx, height, tz + dz), (tx + dx * 0.8, height + 9, tz + dz * 0.8), 0.35)
        box("Metal", (tx, height + 9.1, tz), (7.4, 0.3, 7.4))
        cyl("Wood", (tx, height + 9.2, tz), 4.2, 9.5, segs=16)
        for k in range(3):
            cyl("Metal", (tx, height + 10.5 + k * 3, tz), 4.28, 0.25, segs=16)
        cyl("Roof", (tx, height + 18.7, tz), 4.5, 3.4, segs=16, top_radius=0.3)
    if fire_escape:
        fx, fz, facing = fire_escape  # a point on the facade and which way it faces
        floors = int((height - 14) // 10)
        for k in range(floors):
            y = 14 + k * 10
            if facing in ("+z", "-z"):
                sz = 1 if facing == "+z" else -1
                box("Metal", (fx, y, fz + sz * 1.6), (12, 0.2, 3.2))
                box("Metal", (fx, y + 3.2, fz + sz * 3.15), (12, 0.12, 0.12))
                for i in range(7):
                    box("Metal", (fx - 6 + i * 2, y + 1.6, fz + sz * 3.15), (0.08, 3.2, 0.08))
                if k < floors - 1:
                    beam("Metal", (fx - 4.5, y, fz + sz * 2.4), (fx + 3.5, y + 10, fz + sz * 2.4), 0.25)
            else:
                sx = 1 if facing == "+x" else -1
                box("Metal", (fx + sx * 1.6, y, fz), (3.2, 0.2, 12))
                box("Metal", (fx + sx * 3.15, y + 3.2, fz), (0.12, 0.12, 12))
                for i in range(7):
                    box("Metal", (fx + sx * 3.15, y + 1.6, fz - 6 + i * 2), (0.08, 3.2, 0.08))
                if k < floors - 1:
                    beam("Metal", (fx + sx * 2.4, y, fz - 4.5), (fx + sx * 2.4, y + 10, fz + 3.5), 0.25)


def city():
    # North: the big building with the screen and the naming sign.
    building(-74, 74, -132, -80, 72, "FacadeRed", water_tower=(48, -110), fire_escape=(-46, -80, "+z"))
    sc = L["screen"]
    box("ScreenFrame", (sc["x"], sc["y"], sc["z"] + 0.3), (sc["width"] + 2.4, sc["height"] + 2.4, 0.6))
    hook("BigScreen", (sc["x"], sc["y"], sc["z"] + 0.75), sc["width"], sc["height"], "+z", "BigScreen", "ScreenFrame", depth=0.3)
    ns = L["namingSign"]
    box("Metal", (ns["x"], ns["y"], ns["z"] + 0.2), (ns["width"] + 1.6, ns["height"] + 1.6, 0.4))
    hook("NamingSign", (ns["x"], ns["y"], ns["z"] + 0.55), ns["width"], ns["height"], "+z", "NamingSign", "Metal", depth=0.3)
    for sx in (-1, 1):
        beam("Metal", (sx * 24, ns["y"] + ns["height"] / 2 + 0.8, ns["z"] + 0.5), (sx * 24, ns["y"] + ns["height"] / 2 + 6, ns["z"] + 0.5), 0.3)
    # Fire escape on the right-hand side of the facade too.
    building_escape(46, -80, 72)

    # West: the handball wall with graffiti and murals, buildings behind it.
    box("WallPaint", (-75, 11, 0), (2, 22, 90))
    box("Cornice", (-75, 22.3, 0), (2.4, 0.6, 90.4))
    hook("GraffitiWall", (-73.9, 11, 0), 88, 22, "+x", "GraffitiWall", "WallPaint", depth=0.1)
    for i, m in enumerate(L["murals"]):
        facing = m["facing"]
        offset = 0.25 if facing == "+x" else -0.25
        hook(f"Mural_{i}", (m["x"] + offset, m["y"] + m["height"] / 2, m["z"]), m["width"], m["height"], facing, f"Mural_{i}", "BannerBack", depth=0.2)
    building(-160, -92, -74, -22, 56, "FacadeTan", water_tower=(-120, -50))
    building(-160, -92, -22, 28, 46, "FacadeRed")
    building(-160, -92, 28, 76, 62, "FacadeGray", water_tower=(-130, 52))

    # East: a low building whose side wall carries two murals, shops on the street, a tower behind.
    building(78, 112, -46, 46, 30, "FacadeTan")
    for zc, awn in ((-38, "AwningRed"), (38, "AwningGreen")):
        box(awn, (76.4, 9.4, zc), (3.2, 0.5, 10))
        box("ShopGlass", (77.9, 4.4, zc), (0.2, 7, 9))
    building(112, 164, -70, 70, 74, "FacadeGray", water_tower=(140, -30))

    # South: a row of brownstones with stoops, trees on the sidewalk.
    x = -90
    for i, (w, h, fac) in enumerate([(34, 40, "FacadeTan"), (36, 46, "FacadeRed"), (34, 38, "FacadeGray"), (38, 44, "FacadeTan"), (38, 40, "FacadeRed")]):
        building(x, x + w, 78, 124, h, fac, water_tower=(x + w / 2, 100) if i in (1, 3) else None)
        box("Cornice", (x + w / 2, 2.2, 80), (8, 4.4, 4))  # stoop
        x += w
    # North-west and north-east corners so the skyline has no gaps.
    building(-160, -80, -170, -80, 64, "FacadeGray")
    building(80, 170, -170, -76, 58, "FacadeTan", water_tower=(120, -120))
    building(90, 170, 76, 150, 50, "FacadeGray")
    building(-170, -90, 76, 150, 48, "FacadeRed")


def building_escape(fx, fz, height):
    floors = int((height - 14) // 10)
    for k in range(floors):
        y = 14 + k * 10
        box("Metal", (fx, y, fz + 1.6), (12, 0.2, 3.2))
        box("Metal", (fx, y + 3.2, fz + 3.15), (12, 0.12, 0.12))
        for i in range(7):
            box("Metal", (fx - 6 + i * 2, y + 1.6, fz + 3.15), (0.08, 3.2, 0.08))
        if k < floors - 1:
            beam("Metal", (fx - 4.5, y, fz + 2.4), (fx + 3.5, y + 10, fz + 2.4), 0.25)


def lights_and_trees():
    for lx, lz in L["lights"]:
        cyl("Metal", (lx, 0, lz), 0.55, 36, segs=10, top_radius=0.35)
        # Two lamp heads angled at the court.
        for dx in (-2.2, 2.2):
            box("Metal", (lx + dx, 36.6, lz), (3.4, 1.6, 2.4))
            box("LampGlow", (lx + dx, 35.75, lz), (3.0, 0.12, 2.0))
        box("Metal", (lx, 36.2, lz), (6.4, 0.4, 0.4))
    # Street lamps along the sidewalks.
    for x in range(-80, 81, 40):
        for z in (-76, 70):
            cyl("Metal", (x, 0.3, z), 0.25, 16, segs=8)
            box("Metal", (x, 16.2, z + (1.5 if z < 0 else -1.5)), (0.4, 0.3, 3.4))
            box("LampGlow", (x, 15.9, z + (3 if z < 0 else -3)), (1.2, 0.5, 1.2))
    # Trees: trunk plus a few overlapping blobs.
    spots = [(x, 70) for x in range(-70, 71, 20)] + [(-68, -74), (68, -74), (-68, 64), (68, 64)]
    for tx, tz in spots:
        h = rng.uniform(12, 16)
        cyl("Bark", (tx, 0.3, tz), 0.7, h, segs=8, top_radius=0.45)
        for _ in range(4):
            r = rng.uniform(4.5, 6.5)
            blob("Foliage" if rng.random() < 0.6 else "FoliageLight", (tx + rng.uniform(-3, 3), h + rng.uniform(1, 4.5), tz + rng.uniform(-3, 3)), (r, r * 0.85, r))
        box("Planter", (tx, 0.45, tz), (4.4, 0.3, 4.4))
    # A few props on the court side of the fence: benches and trash cans.
    for sx in (-1, 1):
        for sz in (-1, 1):
            cyl("Metal", (sx * 57, 0, sz * 30), 1.1, 3.4, segs=12)
    for sx in (-1, 1):
        box("Wood", (sx * 56, 1.6, -52), (6, 0.25, 1.6))
        for dx in (-2.4, 2.4):
            box("Metal", (sx * 56 + dx, 0.8, -52), (0.2, 1.6, 1.4))


def finish_static():
    for name, bm in STATIC.items():
        me = bpy.data.meshes.new(f"Static_{name}")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat(name))
        obj = bpy.data.objects.new(f"Static_{name}", me)
        bpy.context.scene.collection.objects.link(obj)


def preview(path):
    import mathutils

    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.45, 0.55, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    scene.world = world
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    scene.collection.objects.link(sun)
    sun.data.energy = 4.5
    sun.data.color = (1.0, 0.78, 0.55)
    # Low sun from the west-south-west.
    sun_dir = B(-1, 0.55, 0.45).normalized()
    sun.rotation_euler = (-sun_dir).to_track_quat("-Z", "Y").to_euler()
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    cam.data.lens = 28
    cam.data.clip_end = 2000
    cam.location = B(96, 64, 104)
    cam.rotation_euler = (B(0, 10, -14) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(sun)
    bpy.data.objects.remove(cam)
    print("PREVIEW", path)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ground()
    bleachers()
    barriers_and_banners()
    fence()
    hoops()
    city()
    lights_and_trees()
    finish_static()
    if PREVIEW:
        preview(PREVIEW)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True, export_animations=False, export_vertex_color="NONE")
    print("EXPORTED", OUT, os.path.getsize(OUT))
    print("OBJECTS", len(bpy.context.scene.objects), sorted(o.name for o in bpy.context.scene.objects if not o.name.startswith("Static_"))[:12])


main()
