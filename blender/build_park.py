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
    "Curb": ("#8c877f", 0.85), "WallPaint": ("#d9d1c5", 0.9), "Aluminum": ("#53595b", 0.48),
    "Metal": ("#343842", 0.5), "Padding": ("#23396b", 0.7), "FacadeRed": ("#9a4a3a", 0.9),
    "FacadeTan": ("#b98a64", 0.9), "FacadeGray": ("#6f6b73", 0.9), "Roof": ("#3a3438", 0.9),
    "Cornice": ("#d9cbb5", 0.8), "Wood": ("#7a5236", 0.8), "Foliage": ("#3f8f4a", 0.9),
    "FoliageLight": ("#5aa844", 0.9), "Bark": ("#5a3d2a", 0.9), "AwningRed": ("#c23b2e", 0.8),
    "AwningGreen": ("#2e8b57", 0.8), "LampGlow": ("#fff2c4", 0.5), "ChainLink": ("#8d949c", 0.5),
    "Net": ("#f5f5f5", 0.8), "SeatMetal": ("#272f2e", 0.76), "Stair": ("#c1a477", 0.9), "RoadPaint": ("#ddd6bc", 0.85), "CarBody": ("#343f47", 0.5), "CarSilver": ("#9dacae", 0.45), "CarRed": ("#77433c", 0.5), "Tire": ("#202321", 0.95), "LeafOchre": ("#7d8443", 0.9), "Rim": ("#e8531f", 0.5), "Backboard": ("#f4f4f4", 0.4),
    "BannerBack": ("#e9e6df", 0.9), "ScreenFrame": ("#15171e", 0.6), "ShopGlass": ("#2b3a4a", 0.2),
    "Trim": ("#f2e8d8", 0.8), "Planter": ("#6b5a4a", 0.9),
}
HOOK_COLORS = {"CourtSurface": "#c7ac81", "BigScreen": "#101018", "NamingSign": "#101426", "GraffitiWall": "#d9d1c5", "Mural": "#cfc8bb", "Banner": "#0f1326"}


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
    if name == "Backboard":
        bsdf.inputs["Alpha"].default_value = .18
        m.surface_render_method = "DITHERED"
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
    # Open sidewalks / streets replace the previous enclosed building compound.
    for x0,x1,z0,z1 in [(-67,67,-61,-50),(-67,67,46,57),(-67,-58,-50,46),(58,67,-50,46),(-120,-107,-180,170),(105,117,-180,170),(-200,200,-116,-105)]:
        box("Sidewalk", ((x0+x1)/2,.10,(z0+z1)/2), (x1-x0,.2,z1-z0))
    for x in [-67,67,-107,105]:
        box("Curb",(x,.18,-2),(0.6,.36,210))
    for z in [-61,57,-105]:
        box("Curb",(0,.18,z),(134,.36,.6))
    for x in [-88,87]:
        for z in range(-160,160,22):
            box("RoadPaint",(x,.012,z),(.22,.018,10))
        for z in [-80,75]:
            for xx in range(-13,14,4):
                box("RoadPaint",(x+xx,.014,z),(2,.02,12))
    fl=L["floor"];hw,hd=fl["length"]/2,fl["width"]/2
    me=bpy.data.meshes.new("CourtSurface")
    me.from_pydata([B(-hw,.06,-hd),B(hw,.06,-hd),B(hw,.06,hd),B(-hw,.06,hd)],[],[(3,2,1,0)])
    uv=me.uv_layers.new(name="UVMap");corner_uv=[(0,1),(1,1),(1,0),(0,0)]
    for poly in me.polygons:
        for li in poly.loop_indices: uv.data[li].uv=corner_uv[me.loops[li].vertex_index]
    me.materials.append(mat("CourtSurface",HOOK_COLORS["CourtSurface"]))
    obj=bpy.data.objects.new("CourtSurface",me);bpy.context.scene.collection.objects.link(obj)
    if obj.data.polygons[0].normal.z<0: obj.data.flip_normals()

def bleachers():
    s=L["bleacherShape"]
    half=L["bleachers"][0]["seats"]*s["seatSpacing"]/2+s["aisleWidth"]/2+1
    aisle=s["aisleWidth"]
    for b in L["bleachers"]:
        side,rows=b["side"],b["rows"]
        for r in range(rows):
            y=s["firstHeight"]+r*s["rowRise"];z=side*(s["front"]+r*s["rowDepth"])
            # Black folded-steel grandstand and clear central ochre steps, as in Oct 2021.
            for sx in [-1,1]:
                width=half-aisle/2;cx=sx*(aisle/2+width/2)
                box("SeatMetal",(cx,y,z+side*.18),(width,.16,1.3))
                box("SeatMetal",(cx,y-.58,z+side*.68),(width,1.14,.10))
                box("SeatMetal",(cx,y-1.0,z-side*.70),(width,.12,1.1))
                box("Aluminum",(cx,y+.09,z-side*.47),(width,.035,.06))
            for k in range(2):
                sh=y-.6+k*.6;sz=z-side*(.6-k*1.1)
                box("Stair",(0,sh/2,sz),(aisle,sh,1.1))
        top=s["firstHeight"]+(rows-1)*s["rowRise"];back=side*(s["front"]+(rows-1)*s["rowDepth"]+1.25)
        for x in [-half,-half/2,half/2,half]:
            beam("Metal",(x,0,side*(s["front"]-1)),(x,top,back),.19)
            box("Metal",(x,top/2,back),(.18,top,.18))
        for y in [top+.7,top+1.8,top+3.1]:
            box("Metal",(0,y,back),(2*half,.085,.085))
        for x in range(-42,43,7): box("Metal",(x,top+1.5,back),(.09,3.15,.09))
        for x in [-half,half]:
            for r in range(0,rows,2):
                y=s["firstHeight"]+r*s["rowRise"];z=side*(s["front"]+r*s["rowDepth"])
                box("Metal",(x,y+1.5,z),(.12,3,.12))
            beam("Metal",(x,s["firstHeight"]+3,side*s["front"]),(x,top+3,back),.14)

def barriers_and_banners():
    bar,sb,eb=L["barrier"],L["sidelineBanners"],L["endBanners"];idx=0
    for side,facing in [(-1,"+z"),(1,"-z")]:
        z=side*bar["z"]
        # Slim tournament crowd rails, interrupted at the center aisle.
        for sx in [-1,1]:
            for y in [.4,bar["height"]]:
                beam("Metal",(sx*3,y,z),(sx*bar["length"]/2,y,z),.10)
            for x in range(5,43,3):
                box("Metal",(sx*x,bar["height"]/2,z),(.06,bar["height"],.06))
        gap=.4;span=sb["perSide"]*sb["length"]+(sb["perSide"]-1)*gap
        for i in range(sb["perSide"]):
            x=-span/2+sb["length"]/2+i*(sb["length"]+gap)
            if side==1:x=-x
            hook(f"Banner_{idx}",(x,sb["y"]+sb["height"]/2,z-side*.46),sb["length"],sb["height"],facing,f"Banner_{idx}","BannerBack",depth=.045);idx+=1
    for sx,facing in [(1,"-x"),(-1,"+x")]:
        span=eb["perEnd"]*eb["length"]+(eb["perEnd"]-1)*eb["gap"]
        for i in range(eb["perEnd"]):
            z=-span/2+eb["length"]/2+i*(eb["length"]+eb["gap"])
            hook(f"Banner_{idx}",(sx*eb["x"]-sx*.25,eb["y"]+eb["height"]/2,z),eb["length"],eb["height"],facing,f"Banner_{idx}","BannerBack",depth=.045);idx+=1

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
        box("Backboard", (s * hp["boardX"], 11.6, 0), (0.12, 3.6, 6.2))
        # Transparent glass with real perimeter/square geometry, so a close dunk never
        # disappears behind an opaque slab or a filled painted target.
        for y in (9.8, 13.4):
            box("Aluminum", (s * hp["boardX"], y, 0), (0.22, 0.12, 6.4))
        for z in (-3.1, 3.1):
            box("Aluminum", (s * hp["boardX"], 11.6, z), (0.22, 3.6, 0.12))
        for y in (10.25, 11.85):
            box("Rim", (s * (hp["boardX"] - 0.12), y, 0), (0.04, 0.10, 2.0))
        for z in (-1, 1):
            box("Rim", (s * (hp["boardX"] - 0.12), 11.05, z), (0.04, 1.6, 0.10))
        # Circular tubular orange rim, welded mounting plate and individually knotted net ropes.
        cx=s*rim["x"];rr=rim["radius"]
        bm=sbm("Rim")
        segments,steps=48,8
        verts=[]
        for i in range(segments):
            a=2*math.pi*i/segments
            for j in range(steps):
                b=2*math.pi*j/steps
                verts.append(bm.verts.new(B(cx+(rr+.045*math.cos(b))*math.cos(a),rim["y"]+.045*math.sin(b),(rr+.045*math.cos(b))*math.sin(a))))
        for i in range(segments):
            for j in range(steps):
                f=bm.faces.new([verts[i*steps+j],verts[((i+1)%segments)*steps+j],verts[((i+1)%segments)*steps+(j+1)%steps],verts[i*steps+(j+1)%steps]]);f.smooth=True
        box("Rim",(s*(rim["x"]+.97),rim["y"],0),(.62,.10,.28))
        box("Metal",(s*(hp["boardX"]-.17),10.05,0),(.10,.5,.65))
        for j in range(12):
            for direction in [-1,1]:
                for row in range(5):
                    a=2*math.pi*j/12+direction*row*math.pi/12
                    a2=2*math.pi*j/12+direction*(row+1)*math.pi/12
                    r0=rr*(1-row*.065);r1=rr*(1-(row+1)*.065)
                    beam("Net",(cx+math.cos(a)*r0,10-row*.32,math.sin(a)*r0),(cx+math.cos(a2)*r1,10-(row+1)*.32,math.sin(a2)*r1),.025)

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
    # Northern park edge opens onto trees and the distant Polo Grounds-style tower silhouettes.
    for x,z,w,d,h in [(-73,-170,45,46,147),(55,-182,44,49,164),(142,-164,38,43,139)]:
        building(x-w/2,x+w/2,z-d/2,z+d/2,h,"FacadeRed",cornice=False)
        # Vertical recessed cores articulate the tall brick towers.
        box("FacadeGray",(x-w*.32,h/2,z+d/2+.1),(w*.15,h,.4))
        box("Roof",(x,h+.5,z),(w+1,1,d+1))
    # A separate west block across Frederick Douglass Boulevard, with sky between blocks.
    for i,(z,h,fac) in enumerate([(-105,47,"FacadeTan"),(-61,52,"FacadeRed"),(-17,45,"FacadeTan"),(27,51,"FacadeGray"),(71,44,"FacadeRed")]):
        building(-158,-117,z,z+36,h,fac,fire_escape=(-116.7,z+18,"+x"))
        for zz in [z+8,z+27]:
            box("ShopGlass",(-116.8,5,zz),(.2,7,12))
            box("AwningGreen",(-115.5,9,zz),(3,.5,12))
    building(123,156,66,102,40,"FacadeTan",fire_escape=(123,83,"-x"))
    building(159,195,66,102,46,"FacadeRed")
    # Freestanding score clock above the north stand, not a billboard on a building.
    sc=L["screen"];ns=L["namingSign"]
    for x in [-5.6,5.6]:
        box("Metal",(x,sc["y"]/2,sc["z"]),(0.5,sc["y"],.5))
    box("ScreenFrame",(sc["x"],sc["y"],sc["z"]+.3),(sc["width"]+.4,sc["height"]+.4,.6))
    hook("BigScreen",(sc["x"],sc["y"],sc["z"]+.75),sc["width"],sc["height"],"+z","BigScreen","ScreenFrame",depth=.2)
    box("Stair",(ns["x"],ns["y"],ns["z"]+.2),(ns["width"]+.25,ns["height"]+.25,.3))
    hook("NamingSign",(ns["x"],ns["y"],ns["z"]+.55),ns["width"],ns["height"],"+z","NamingSign","Metal",depth=.12)
    # Small community art panels keep live branding without surrounding the park with walls.
    for i,m in enumerate(L["murals"]):
        offset=.25 if m["facing"]=="+x" else -.25
        hook(f"Mural_{i}",(m["x"]+offset,m["y"]+m["height"]/2,m["z"]),m["width"],m["height"],m["facing"],f"Mural_{i}","BannerBack",depth=.08)
    # Quiet, unbranded parked vehicles establish a real street beyond the permeable fence.
    for x in [-72,72]:
        for j,z in enumerate([-49,-22,6,34,93]):
            car="CarBody" if j%3==0 else "CarSilver" if j%3==1 else "CarRed"
            box(car,(x,1.8,z),(5.5,2.1,12.2));box(car,(x,3.15,z+.4),(4.6,1.6,6.8))
            box("ShopGlass",(x,3.5,z+.4),(4.64,.95,6.2))
            box(car,(x,4.01,z+.4),(4.7,.12,6.6))
            for sx in [-1,1]:
                for zz in [-4,4]:blob("Tire",(x+sx*2.55,1.0,z+zz),(.36,1.02,1.02),segs=(10,6))
            for sx in [-1,1]:box("Trim",(x+sx*1.8,1.9,z-6.13),(.9,.35,.04))

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
    for lx,lz in L["lights"]:
        cyl("Metal",(lx,0,lz),.27,32,segs=10,top_radius=.18)
        box("Metal",(lx,32,lz),(4.4,.18,.25))
        for dx in [-1.5,1.5]:
            box("Metal",(lx+dx,32,lz),(1.7,.8,1.1))
            box("LampGlow",(lx+dx,31.57,lz),(1.35,.08,.8))
    # Plane / oak trees with branching trunks and thousands of individually shaped leaves.
    # Geometry is authored and merged here; foliage uses 3 materials in the renderer.
    def branch(a,b,r0,r1):
        bm=sbm("Bark");va,vb=B(*a),B(*b);d=vb-va
        ret=bmesh.ops.create_cone(bm,cap_ends=True,cap_tris=False,segments=7,radius1=r0,radius2=r1,depth=d.length)
        matrix=Matrix.Translation((va+vb)/2) @ d.to_track_quat("Z","Y").to_matrix().to_4x4()
        bmesh.ops.transform(bm,matrix=matrix,verts=ret["verts"]);_finish(bm,ret["verts"],True)
    def leaves(center,radius):
        # Small low-poly leaf sprays break the crown silhouette and leave believable sky gaps.
        for _ in range(185):
            az=rng.random()*math.tau;u=rng.uniform(-1,1);rr=radius*(rng.random()**.33)
            q=math.sqrt(1-u*u);c=B(center[0]+math.cos(az)*q*rr,center[1]+u*rr*.67,center[2]+math.sin(az)*q*rr)
            bm=sbm(rng.choices(["Foliage","FoliageLight","LeafOchre"],[.58,.35,.07])[0])
            normal=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(.15,1))).normalized()
            tx=normal.cross(Vector((0,0,1))).normalized();ty=normal.cross(tx)
            size=rng.uniform(.36,.95)
            coords=[(-1,0),(-.45,.60),(.22,.7),(.9,.2),(1.1,0),(.1,-.55),(-.5,-.4)]
            vv=[bm.verts.new(c+tx*xx*size+ty*yy*size) for xx,yy in coords]
            f=bm.faces.new(vv);f.smooth=False
    spots=[(-49,-57,41),(-23,-57,43),(27,-59,46),(50,-58,43),(-63,-35,40),(63,-30,43),(64,31,39),(-63,32,44),(-62,60,39),(66,64,40)]
    for tx,tz,h in spots:
        base=(tx,.2,tz);fork=(tx+rng.uniform(-1,1),h*.38,tz+rng.uniform(-1,1))
        branch(base,fork,1.2,.66)
        for j in range(6):
            a=j*math.tau/6+rng.random()*.5
            elbow=(fork[0]+math.cos(a)*rng.uniform(3,6),h*.61+rng.uniform(-2,2),fork[2]+math.sin(a)*rng.uniform(3,6))
            tip=(fork[0]+math.cos(a)*rng.uniform(8,13),h*.81+rng.uniform(-3,5),fork[2]+math.sin(a)*rng.uniform(8,13))
            branch(fork,elbow,.56,.28);branch(elbow,tip,.28,.08)
            leaves(tip,6.4)
            for k in [-1,1]:
                subt=(tip[0]+math.cos(a+k*.6)*4,tip[1]+rng.uniform(0,3),tip[2]+math.sin(a+k*.6)*4)
                branch(elbow,subt,.16,.035);leaves(subt,4.7)
        for j in range(4):
            a=j*math.tau/4;branch((tx,.2,tz),(tx+math.cos(a)*2.2,.06,tz+math.sin(a)*2.2),.52,.07)
    for x in [-54,54]:
        for z in [-25,24]:
            cyl("Metal",(x,0,z),.9,2.8,segs=12)
            cyl("Aluminum",(x,2.8,z),.95,.1,segs=12)
    # Backed team benches on the apron, outside play.
    for sx in [-1,1]:
        for z in [-27,27]:
            x=sx*36
            box("SeatMetal",(x,1.6,z),(10,.18,1.25))
            box("SeatMetal",(x,2.65,z+(1 if z>0 else -1)*.65),(10,1.2,.12))
            for dx in [-4,4]:box("Metal",(x+dx,.8,z),(.18,1.6,1.2))

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
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.56, 0.65, 0.74, 1)
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
    cam.location = B(92, 62, 100)
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
