"""Builds the street-court park in Blender and exports public/models/park.glb.

Static geometry is merged per material and spatial sector (Static_<Sector>_<Material>) so the web app
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
NEIGHBORS=[]


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
    "WindowGlass": ("#283c46", .22), "WindowBlue": ("#47616b", .23), "WindowWarm": ("#897352", .45), "WindowFrame": ("#393833", .65), "CarGlass": ("#243d49", .19), "Chrome": ("#9caaae", .28), "TailLight": ("#9c2018", .28), "Headlight": ("#e5e6d7", .25),
    "FacadeCream": ("#c4b799", .88), "FacadeBrown": ("#715548", .9), "FacadePale": ("#aaada5", .88),
    "Trim": ("#f2e8d8", 0.8), "Planter": ("#6b5a4a", 0.9),
    "InteriorShadow": ("#181b1a", .94), "InteriorPlaster": ("#504c43", .9),
    "CurtainLinen": ("#aba393", .92), "CurtainWarm": ("#857367", .94),
    "ShopInterior": ("#34362d", .92), "ShopShelf": ("#655b45", .86),
    "DoorWood": ("#3b2c23", .72), "GlassPane": ("#9caba8", .16),
    "PaintedIron": ("#242b2a", .67), "Limestone": ("#a99d89", .87),
    "RoofFlashing": ("#666b66", .6), "PavingJoint": ("#5b5953", .95),
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
    if name == "GlassPane":
        bsdf.inputs["Alpha"].default_value = .14
        m.surface_render_method = "DITHERED"
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
STATIC_GROUP = "Park"


def sbm(material):
    key = (STATIC_GROUP, material)
    if key not in STATIC:
        STATIC[key] = bmesh.new()
    return STATIC[key]


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
    m = Matrix.Translation(B(*center)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Diagonal((size[0], size[2], size[1], 1))
    verts=[bm.verts.new(m @ Vector(co)) for co in [(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]]
    for face in [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]:bm.faces.new([verts[i] for i in face])
    return _finish(bm,verts)


def beam(material, p0, p1, thickness, bm=None):
    """Square beam between two app-space points."""
    bm = bm or sbm(material)
    a, b = B(*p0), B(*p1)
    d = b - a
    length = d.length
    rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    m = Matrix.Translation((a + b) / 2) @ rot @ Matrix.Diagonal((thickness, thickness, length, 1))
    verts=[bm.verts.new(m @ Vector(co)) for co in [(-.5,-.5,-.5),(.5,-.5,-.5),(.5,.5,-.5),(-.5,.5,-.5),(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]]
    for face in [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]:bm.faces.new([verts[i] for i in face])
    return _finish(bm,verts)


def wire(material, p0, p1, radius=.012, segs=4):
    """Thin round hardware kept at four radial segments, smooth normals; no box wires."""
    bm=sbm(material);a,b=B(*p0),B(*p1);d=b-a
    ret=bmesh.ops.create_cone(bm,cap_ends=False,segments=segs,radius1=radius,radius2=radius,depth=d.length)
    tr=Matrix.Translation((a+b)/2)@d.to_track_quat('Z','Y').to_matrix().to_4x4()
    bmesh.ops.transform(bm,matrix=tr,verts=ret['verts'])
    return _finish(bm,ret['verts'],smooth=True)


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
    for x0,x1,z0,z1 in [(-67,67,-61,-50),(-67,67,46,57),(-67,-58,-50,46),(58,67,-50,46),(-120,-107,-180,170),(105,117,-180,170),(-210,210,-91,-83)]:
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
    global STATIC_GROUP
    f = L["fence"]
    h = f["height"]
    x, zn, zs = f["x"], f["north"], f["south"]
    runs = [((-x, zn), (x, zn)), ((x, zn), (x, zs)), ((x, zs), (-x, zs)), ((-x, zs), (-x, zn))]
    for run_id,((x0, z0), (x1, z1)) in enumerate(runs):
        length = math.hypot(x1 - x0, z1 - z0)
        n = max(1, int(length // 10))
        for i in range(n + 1):
            t = i / n
            px, pz = x0 + (x1 - x0) * t, z0 + (z1 - z0) * t
            cyl("Metal", (px, 0, pz), 0.17, h + 0.3, segs=8)
        beam("Metal", (x0, h, z0), (x1, h, z1), 0.16)
        beam("Metal", (x0, 0.4, z0), (x1, 0.4, z1), 0.1)
        beam("Metal", (x0, h*.53, z0), (x1, h*.53, z1), .12)
        for u in [0,1]:
            px,pz=x0+(x1-x0)*u,z0+(z1-z0)*u
            beam("Metal",(px,0,pz),(px+(x1-x0)/n,h*.53,pz+(z1-z0)/n),.095)
        # Chain-link panel: world UVs in feet so the app can tile a wire texture.
        horizontal = abs(z1 - z0) < 1e-6
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        size = (length, h, 0.04) if horizontal else (0.04, h, length)
        if run_id==1:
            # One actual galvanized diamond-wire panel for the representative slice.
            # The separate alpha proxy allows runtime LOD without spending cage-wide tris.
            for bay in range(n):
                za=z0+(z1-z0)*bay/n;zb=z0+(z1-z0)*(bay+1)/n
                if bay!=4:
                    box('ChainLink',(x0,h/2,(za+zb)/2),(.04,h,zb-za))
                    continue
                STATIC_GROUP='HeroCageProxy'
                box('ChainLink',(x0,h/2,(za+zb)/2),(.012,h,zb-za))
                STATIC_GROUP='HeroCageWire'
                w=zb-za
                # 2-inch wire diamonds: physical wire diameter about 3.7mm.
                pitch=.2357
                for direction in [-1,1]:
                    k=-h
                    while k<=w:
                        lo=max(0,-k);hi=min(h,w-k)
                        if hi>lo:
                            ua=k+lo;ub=k+hi
                            if direction<0:ua=w-ua;ub=w-ub
                            wire('Aluminum',(x0+direction*.008,lo,za+ua),(x0+direction*.008,hi,za+ub),.0061)
                        k+=pitch
                for zz in [za,zb]:
                    wire('Aluminum',(x0,.2,zz),(x0,h-.2,zz),.04,segs=6)
                    for yy in [1.0,5.0,10.0,15.0,18.5]:
                        box('Aluminum',(x0,yy,zz),(.38,.10,.16))
                STATIC_GROUP='Park'
        else:
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
        # Bolted mounting carrier and four corner clamps read at the close-up hoop view.
        for yy in [10.05,13.17]:
            for zz in [-2.8,2.8]:
                box('Aluminum',(s*(hp['boardX']+.11),yy,zz),(.22,.31,.31))
                box('Metal',(s*(hp['boardX']-.15),yy,zz),(.055,.10,.10))
        for zz in [-1.0,1.0]:
            beam('Metal',(s*(hp['boardX']+.30),12.7,zz),(s*(hp['poleX']),12.2,0),.14)
        for j in range(12):
            for direction in [-1,1]:
                for row in range(5):
                    a=2*math.pi*j/12+direction*row*math.pi/12
                    a2=2*math.pi*j/12+direction*(row+1)*math.pi/12
                    r0=rr*(1-row*.065);r1=rr*(1-(row+1)*.065)
                    wire("Net",(cx+math.cos(a)*r0,10-row*.32,math.sin(a)*r0),(cx+math.cos(a2)*r1,10-(row+1)*.32,math.sin(a2)*r1),.0125,segs=4)

def facade_quad(material, points):
    """One surface rather than six hidden box faces; points supplied in app coordinates."""
    bm = sbm(material)
    vs = [bm.verts.new(B(*p)) for p in points]
    face = bm.faces.new(vs)
    world_uv(bm, [face])


def harlem_building(x0, x1, z0, z1, height, facade, style=0, facing='+z', hero=False, fire_escape=True, residential=False):
    """Original Harlem streetscape asset. Apertures are actual gaps in a masonry shell.

    Local u runs across the frontage, p points out toward the street. The occupied room
    bays sit 4.5 feet behind the facade; no opaque facade box intersects their openings.
    Architecture references: NYC LPC Central Harlem designation report LP-2607 (2018).
    """
    cx, cz = (x0+x1)/2, (z0+z1)/2
    vertical = facing in ('+x', '-x')
    normal = 1 if facing in ('+x', '+z') else -1
    span = (z1-z0) if vertical else (x1-x0)
    fixed = (x1 if normal>0 else x0) if vertical else (z1 if normal>0 else z0)
    def pt(u, y, p):
        return (fixed+normal*p, y, cz+u*normal) if vertical else (cx+u*normal, y, fixed+normal*p)
    def rect(material, u, y, p, w, h, d):
        box(material, pt(u,y,p), (d,h,w) if vertical else (w,h,d))
    def line(material, a, b, width):
        beam(material, pt(*a), pt(*b), width)
    def panel(material, u, y, p, w, h):
        # Winding is deliberately outward on both x- and z-oriented fronts.
        points = [pt(u-w/2,y-h/2,p),pt(u+w/2,y-h/2,p),pt(u+w/2,y+h/2,p),pt(u-w/2,y+h/2,p)]
        if vertical: points.reverse()
        facade_quad(material, points)

    # Core set back five feet, plus side return walls. This is not a solid facade box.
    if vertical:
        lo, hi = (x0,x1-5) if normal>0 else (x0+5,x1)
        box(facade, ((lo+hi)/2,height/2,cz), (hi-lo,height,z1-z0))
    else:
        lo, hi = (z0,z1-5) if normal>0 else (z0+5,z1)
        box(facade, (cx,height/2,(lo+hi)/2), (x1-x0,height,hi-lo))
    for u in [-span/2+.40,span/2-.40]: rect(facade,u,height/2,-2.5,.8,height,5)
    box('Roof',(cx,height+.06,cz),(x1-x0-.5,.18,z1-z0-.5))
    # Individual cast/pressed metal cornice profiles, with selective brackets.
    for y,p,w,h,d in [(height-.85,.12,span+.4,.30,.55),(height-.38,.36,span+.95,.32,1.1),(height+.05,.58,span+1.3,.20,1.5)]:
        rect('PaintedIron' if style%3==0 else 'Limestone',0,y,p,w,h,d)
    for u in [-span/2+1.2,span/2-1.2]:
        rect('Limestone',u,height-1.4,.3,.5,1.5,.7)
    for j in range(max(2,int(span/4))):
        u=-span/2+2+j*(span-4)/max(1,int(span/4)-1)
        rect('PaintedIron' if style%3==0 else 'Limestone',u,height-.93,.38,.27,.82,.70)
    for zz in [z0+.16,z1-.16]:box(facade,(cx,height+.9,zz),(x1-x0,1.6,.42))
    for xx in [x0+.16,x1-.16]:box(facade,(xx,height+.9,cz),(.42,1.6,z1-z0))
    for zz in [z0+.16,z1-.16]:box('RoofFlashing',(cx,height+1.76,zz),(x1-x0+.12,.12,.58))
    box('Roof',(cx-3,height+2.6,cz-5),(7,5.2,8))
    for k in range(2):
        box(facade,(cx+span*.25,height+2,cz+2+k*4),(1.65,4,1.85))
        box('RoofFlashing',(cx+span*.25,height+4.1,cz+2+k*4),(2.1,.2,2.3))

    base = 12.2 if height>42 else 10.5
    spacing = [10.25,10.8,9.6,11.1][style%4]
    levels = max(1,int((height-base-1.5)/spacing))
    spacing = (height-base-2.6)/levels
    count = max(2,round(span/[7.7,8.4,9.0,7.2][style%4]))
    step = span/count
    width = min([3.65,4.1,4.3,3.4][style%4],step*.60)
    win_h = min(6.25,spacing-2.65)
    ys = [base+spacing*(k+.5) for k in range(levels)]
    # Continuous wall bands and individual piers form a watertight facade around gaps.
    bandbottom=base
    for floor,y in enumerate(ys):
        bottom,top=y-win_h/2,y+win_h/2
        if bottom>bandbottom:rect(facade,0,(bandbottom+bottom)/2,-.5,span,bottom-bandbottom,1)
        left=-span/2
        for bay in range(count):
            u=-span/2+(bay+.5)*step
            if u-width/2>left:rect(facade,(left+u-width/2)/2,y,-.5,u-width/2-left,win_h,1)
            left=u+width/2
            # Deep jamb surfaces, recessed timber/metal sash and interior room volume.
            rect('Limestone',u-width/2-.075,y,-.20,.15,win_h+.15,.70)
            rect('Limestone',u+width/2+.075,y,-.20,.15,win_h+.15,.70)
            rect('InteriorShadow',u,y,-4.90,width,win_h,.12)
            for side in [-1,1]:rect('InteriorPlaster',u+side*(width/2-.04),y,-2.55,.08,win_h,4.6)
            rect('InteriorPlaster',u,bottom+.02,-2.55,width,.08,4.6)
            rect('InteriorPlaster',u,top-.02,-2.55,width,.08,4.6)
            for side in [-1,1]:rect('WindowFrame',u+side*(width/2-.10),y,-.57,.19,win_h,.18)
            for yy in [bottom+.10,y-.15,top-.10]:rect('WindowFrame',u,yy,-.52,width,.17,.19)
            panel('GlassPane',u,y,-.63,width-.25,win_h-.24)
            rect('Limestone',u,bottom-.15,.16,width+.56,.30,.90)
            rect('Limestone',u,top+.23,.05,width+.65,.43,.65)
            if style%3==1:
                rect('Limestone',u,top+.53,.19,width+.95,.13,.75)
                for side in [-1,1]:rect('Limestone',u+side*(width/2+.20),top+.05,.08,.22,.70,.56)
            # Soft corrugated curtains are real folded planes inside the recess.
            curtain = (bay*5+floor*3+style)%7
            if curtain<5:
                cw=width*(.17 if curtain<3 else .31)
                for side in [-1,1]:
                    start=u+width/2-.08-cw
                    if side<0:start=u-width/2+.08
                    for fold in range(4):
                        fu=start+cw*(fold+.5)/4
                        panel('CurtainWarm' if curtain==4 else 'CurtainLinen',fu,y,-1.03+(fold%2)*.10,cw/4+.02,win_h-.18)
            elif curtain==5:
                panel('CurtainLinen',u,top-win_h*.23,-.90,width-.2,win_h*.42)
            # Occasional open lower sash and people remain behind the facade plane.
            occupied=(hero and floor in (0,2) and bay==count-1) or (not hero and floor<2 and (bay*7+floor*13+int(cx+cz))%19==3)
            if occupied:
                pos=list(pt(u,bottom+.25,-.38))
                yaw=(math.pi/2 if normal==1 else -math.pi/2) if vertical else (0 if normal==1 else math.pi)
                NEIGHBORS.append({'position':pos,'yaw':yaw,'window':True})
            if (bay+floor*3+style)%11==2 and floor<3:
                rect('Aluminum',u,bottom+.55,.33,width*.71,.94,1.35)
                for g in range(4):rect('WindowFrame',u,bottom+.24+g*.17,1.025,width*.61,.045,.035)
        if left<span/2:rect(facade,(left+span/2)/2,y,-.5,span/2-left,win_h,1)
        bandbottom=top
    rect(facade,0,(bandbottom+height)/2,-.5,span,height-bandbottom,1)

    if residential:
        # Brownstone lower story: an elevated entrance with real reveals, not a shop clone.
        door_u=0;door_w=3.4;door_bottom=1.95;door_top=min(base-.55,9.8)
        wins=[(-span*.30,3.6),(span*.30,3.6)]
        openings=sorted([(u-w/2,u+w/2,2.1,7.7) for u,w in wins]+[(-door_w/2,door_w/2,door_bottom,door_top)])
        left=-span/2
        for a,b,bt,tp in openings:
            if a>left:rect('Limestone',(a+left)/2,base/2,-.5,a-left,base,1)
            rect('Limestone',(a+b)/2,bt/2,-.5,b-a,bt,1)
            rect('Limestone',(a+b)/2,(base+tp)/2,-.5,b-a,base-tp,1)
            left=b
        if left<span/2:rect('Limestone',(left+span/2)/2,base/2,-.5,span/2-left,base,1)
        rect('Limestone',0,base+.10,.12,span+.15,.32,.70)
        for u,ww in wins:
            rect('InteriorShadow',u,4.9,-2.7,ww,5.6,.15)
            panel('CurtainWarm' if style%2 else 'CurtainLinen',u,5.3,-1.05,ww-.4,4.8)
            panel('GlassPane',u,4.9,-.65,ww-.18,5.4)
            for du in [-ww/2+.09,ww/2-.09]:rect('WindowFrame',u+du,4.9,-.52,.16,5.6,.17)
            for yy in [2.2,4.9,7.6]:rect('WindowFrame',u,yy,-.51,ww,.14,.17)
            rect('Limestone',u,1.98,.16,ww+.58,.26,.85)
            rect('Limestone',u,7.95,.11,ww+.76,.4,.70)
            if style%2==0:
                for j in range(6):rect('PaintedIron',u-ww/2+.2+j*(ww-.4)/5,3.1,.50,.038,2.2,.038)
                for yy in [2.05,4.15]:rect('PaintedIron',u,yy,.50,ww,.06,.06)
        rect('InteriorShadow',0,(door_top+door_bottom)/2,-1.6,door_w,door_top-door_bottom,.15)
        rect('DoorWood',0,(door_top+door_bottom)/2,-.88,door_w-.20,door_top-door_bottom-.18,.2)
        for u in [-.78,.78]:
            for yy in [3.15,5.55]:rect('DoorWood',u,yy,-.74,1.19,1.7,.12)
        panel('GlassPane',0,door_top-.65,-.70,door_w-.5,.9)
        rect('Chrome',1.12,4.95,-.57,.07,.70,.10)
        for u in [-door_w/2-.25,door_w/2+.25]:rect('Limestone',u,(base+1.8)/2,.03,.5,base-1.8,.85)
        rect('Limestone',0,door_top+.25,.25,door_w+1.5,.5,1.4)
        # Six measured 4-inch rises with deep run, capped by a small landing.
        for j in range(6):rect('Limestone',0,(j+1)*.325/2,3.8-j*.52,4.8,(j+1)*.325,.64)
        rect('Limestone',0,1.02,.77,4.8,2.04,1.2)
        for side in [-1,1]:
            for j in range(5):rect('PaintedIron',side*2.23,1.6+j*.31,3.85-j*.69,.055,2.6,.055)
            line('PaintedIron',(side*2.23,2.88,3.9),(side*2.23,4.40,.6),.07)
        for u in [-span/2+.55,span/2-.55]:
            rect('Limestone',u,1.5,2.5,.8,3,.8)
            rect('Limestone',u,3.06,2.5,1,.18,1)
    else:
        # Distinct ground-floor opening proportions: one shop and one inset residential door.
        door_u=span*.31 if style%2==0 else -span*.32
        door_w=3.4;door_h=8.6 if base>11 else 8
        shop_u=-span*.12 if style%2==0 else span*.12
        shop_w=span*.56
        openings=sorted([(shop_u-shop_w/2,shop_u+shop_w/2,.55,8.85),(door_u-door_w/2,door_u+door_w/2,.35,door_h+.35)])
        left=-span/2
        for a,b,bt,tp in openings:
            if a>left:rect('Limestone',0.5*(a+left),base/2,-.5,a-left,base,1)
            rect('Limestone',(a+b)/2,bt/2,-.5,b-a,bt,1)
            rect('Limestone',(a+b)/2,(base+tp)/2,-.5,b-a,base-tp,1)
            left=b
        if left<span/2:rect('Limestone',(left+span/2)/2,base/2,-.5,span/2-left,base,1)
        rect('Limestone',0,base+.12,.12,span+.4,.42,.60)
        rect('ShopInterior',shop_u,4.55,-4.9,shop_w,8,.12)
        for u in [shop_u-shop_w/2,shop_u+shop_w/2]:rect('ShopInterior',u,4.65,-2.5,.14,8.1,5)
        rect('ShopShelf',shop_u,.54,-2.55,shop_w,.12,4.8)
        for yy in [2,4.1,6.2]:
            rect('ShopShelf',shop_u,yy,-4.10,shop_w-.9,.13,.85)
            if hero:
                for j in range(7):
                    rect('CurtainWarm' if j%3 else 'CurtainLinen',shop_u+(j-3)*(shop_w-1)/7,yy+.38,-4.08,.45,.70,.46)
        for u in [shop_u-shop_w/2+.09,shop_u,shop_u+shop_w/2-.09]:rect('PaintedIron',u,4.7,-.30,.17,8.3,.20)
        for yy in [.6,7.2,8.75]:rect('PaintedIron',shop_u,yy,-.30,shop_w,.16,.22)
        panel('GlassPane',shop_u,4.65,-.40,shop_w-.2,8.1)
        # Canvas awning is pitched fabric on a light iron frame, not a giant horizontal box.
        awning='AwningGreen' if style%2 else 'AwningRed'
        pts=[pt(shop_u-shop_w/2-.2,10.1,.15),pt(shop_u+shop_w/2+.2,10.1,.15),pt(shop_u+shop_w/2+.2,9.1,2.4),pt(shop_u-shop_w/2-.2,9.1,2.4)]
        facade_quad(awning,pts[::-1] if not vertical else pts)
        rect(awning,shop_u,8.9,2.4,shop_w+.4,.4,.06)
        for u in [shop_u-shop_w/2,shop_u+shop_w/2]:line('PaintedIron',(u,9.95,.1),(u,9.02,2.4),.055)
        # Recessed paneled residential entrance, transom, brass pull, entry light and buzzer.
        rect('InteriorShadow',door_u,4.6,-2.45,door_w,9,.12)
        rect('DoorWood',door_u,4.0,-1.60,door_w-.20,7.4,.20)
        for side in [-1,1]:
            rect('Limestone',door_u+side*(door_w/2+.18),4.85,-.04,.40,9.25,.8)
            for yy in [1.5,4.2]:rect('DoorWood',door_u+side*.73,yy,-1.43,1.19,2.1,.12)
        panel('GlassPane',door_u,7.2,-1.44,door_w-.60,1.20)
        rect('Chrome',door_u+1.13,3.6,-1.26,.07,.80,.12)
        rect('PaintedIron',door_u-door_w/2-.55,4.5,.05,.36,.75,.10)
        rect('Limestone',door_u,9.60,.10,door_w+.95,.36,1.15)
        rect('Limestone',door_u,.20,.65,door_w+1.0,.40,2.2)
        rect('PaintedIron',door_u+door_w/2+.6,7.1,.42,.35,.72,.5)
        rect('CurtainLinen',door_u+door_w/2+.6,7.12,.71,.25,.5,.04)


    if fire_escape and levels>2:
        escape_u=-step*.30
        platform_w=min(11.8,span*.56)
        for k,y in enumerate(ys):
            fy=y-win_h/2-.26
            for p in [.55,3.50]:rect('PaintedIron',escape_u,fy,p,platform_w,.17,.13)
            for j in range(12):rect('PaintedIron',escape_u-platform_w/2+(j+.5)*platform_w/12,fy,2.02,.07,.10,2.95)
            rect('PaintedIron',escape_u,fy+3.2,3.5,platform_w,.08,.08)
            for j in range(8):rect('PaintedIron',escape_u-platform_w/2+j*platform_w/7,fy+1.6,3.5,.055,3.2,.055)
            for su in [-1,1]:
                u=escape_u+su*platform_w/2
                line('PaintedIron',(u,fy+3.2,.35),(u,fy+3.2,3.5),.08)
                line('PaintedIron',(u,fy-1.5,.0),(u,fy,3.35),.12)
            if k<len(ys)-1:
                rising=1 if k%2==0 else -1
                u0=escape_u-rising*4.1;u1=escape_u+rising*4.1
                for pp in [1.4,3.15]:
                    line('PaintedIron',(u0,fy,pp),(u1,fy+spacing,pp),.12)
                    line('PaintedIron',(u0,fy+2.8,pp),(u1,fy+spacing+2.8,pp),.065)
                for j in range(14):
                    u=u0+(u1-u0)*(j+.5)/14;yy=fy+spacing*(j+.5)/14
                    rect('PaintedIron',u,yy,2.275,.68,.075,1.9)
            elif hero:
                u=escape_u+platform_w/2
                for su in [-.45,.45]:line('PaintedIron',(u+su,fy,1),(u+su,height+2,1),.07)
                for yy in range(int(fy),int(height+2)):rect('PaintedIron',u,yy,1,.95,.06,.06)


def building(x0,x1,z0,z1,height,facade,water_tower=None,fire_escape=None,cornice=True):
    # Street-facing elevation gets actual architectural depth. Party walls and far backs
    # remain plain masonry instead of thousands of fully modeled hidden windows.
    facing=('+z' if z1<0 else '-z') if abs((x0+x1)/2)<100 or z1<-89 or z0>90 else ('+x' if x1<0 else '-x')
    if fire_escape: facing=fire_escape[2]
    style=int(abs(x0*3+z0*7))%4
    harlem_building(x0,x1,z0,z1,height,facade,style=style,facing=facing,hero=False,fire_escape=bool(fire_escape),residential=z0>90)
    if water_tower:
        tx,tz=water_tower
        for dx,dz in [(-2.6,-2.6),(2.6,-2.6),(-2.6,2.6),(2.6,2.6)]:
            beam('PaintedIron',(tx+dx,height,tz+dz),(tx+dx*.8,height+8,tz+dz*.8),.24)
        box('PaintedIron',(tx,height+8.1,tz),(7.4,.22,7.4))
        cyl('Wood',(tx,height+8.2,tz),3.6,8.2,segs=18)
        for yy in [height+9.4,height+12.3,height+15.2]:cyl('PaintedIron',(tx,yy,tz),3.66,.16,segs=18)
        cyl('Roof',(tx,height+16.4,tz),3.85,2.6,segs=18,top_radius=.16)


def distant_building(x0,x1,z0,z1,height,facade):
    """Budgeted skyline tier: flat window faces at 150+ feet; no hidden frame boxes."""
    cx,cz=(x0+x1)/2,(z0+z1)/2;w,d=x1-x0,z1-z0
    box(facade,(cx,height/2,cz),(w,height,d))
    box('RoofFlashing',(cx,height+.15,cz),(w+.4,.3,d+.4))
    box('Roof',(cx-3,height+3,cz),(w*.35,6,d*.40))
    for axis,span,fixed,sign in [('z',w,z1,1),('z',w,z0,-1),('x',d,x1,1),('x',d,x0,-1)]:
        for floor in range(1,int(height/8.8)):
            for bay in range(1,int(span/5.4)):
                u=(-span/2)+bay*5.4;y=floor*8.8
                ww=2.3;hh=4.2
                if axis=='z':pts=[(cx+u-ww/2,y-hh/2,fixed+sign*.015),(cx+u+ww/2,y-hh/2,fixed+sign*.015),(cx+u+ww/2,y+hh/2,fixed+sign*.015),(cx+u-ww/2,y+hh/2,fixed+sign*.015)]
                else:pts=[(fixed+sign*.015,y-hh/2,cz+u-ww/2),(fixed+sign*.015,y-hh/2,cz+u+ww/2),(fixed+sign*.015,y+hh/2,cz+u+ww/2),(fixed+sign*.015,y+hh/2,cz+u-ww/2)]
                if (axis=='z' and sign<0) or (axis=='x' and sign>0):pts.reverse()
                facade_quad('WindowGlass' if (bay+floor)%4 else 'WindowBlue',pts)


def city():
    global STATIC_GROUP
    STATIC_GROUP = 'NorthArchitecture'
    # Dense contiguous Harlem-style street blocks, across narrow streets from the park.
    # This is an art-directed neighborhood, rather than a surveyed reconstruction.
    x=-166
    for i,w in enumerate([25,34,22,39,27,32,24,37,29,33,30]):
        print('NORTH BLOCK',i,flush=True)
        h=[45,69,36,82,52,65,43,76,57,63,39][i]
        facade=['FacadeRed','FacadeCream','FacadeBrown','FacadeGray','FacadeTan','FacadePale'][i%6]
        if i==5:
            STATIC_GROUP='NorthArchitecture'
            harlem_building(x,x+w-.3,-132,-91,h,'FacadeRed',style=0,hero=True)
            STATIC_GROUP='NorthArchitecture'
            x+=w
            continue
        building(x,x+w-.3,-132,-91,h,facade,water_tower=(x+w*.6,-113) if i%3==0 else None,fire_escape=(x+w*.5,-90.8,'+z') if i%3!=1 else None)
        x+=w
    # South street closes the world with lower brownstones, stoops and varied roofs.
    STATIC_GROUP='SouthArchitecture'
    x=-109
    for i,w in enumerate([22,29,19,34,24,26,21,31]):
        h=[29,43,26,52,35,31,46,38][i]
        building(x,x+w-.45,98,133,h,["FacadeBrown","FacadeCream","FacadeRed","FacadePale"][i%4],fire_escape=(x+w*.6,97.8,"-z") if i%3==0 else None)
        x+=w
    box("Sidewalk",(0,.1,94),(230,.2,8))
    for i in range(7):car(-89+i*29,78,["CarBody","CarRed","CarSilver"][i%3],i%3,True)
    for side in [-1,1]:
        STATIC_GROUP='NorthArchitecture' if side<0 else 'SouthArchitecture'
        for i in range(6):
            z=-89+i*29.8;h=[38,72,48,83,32,59][i];fx=side*105
            building(-141,-105,z,z+29.5,h,'FacadeTan' if i%2 else 'FacadeRed',fire_escape=(fx,z+14,'+x' if side<0 else '-x')) if side<0 else building(105,141,z,z+29.5,h,'FacadeGray' if i%2 else 'FacadeRed',fire_escape=(fx,z+14,'-x'))
    for x,z,w,d,h in [(-145,-181,43,40,135),(-52,-189,44,46,146),(67,-187,46,43,156),(161,-175,39,42,129)]:
        STATIC_GROUP='DistantCity'
        distant_building(x-w/2,x+w/2,z-d/2,z+d/2,h,'FacadeRed')
    # Freestanding score clock above the north stand, not a billboard on a building.
    STATIC_GROUP='Park'
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
    for x in [-73,73]:
        for j,z in enumerate([-52,-25,3,31,86]):car(x,z,['CarBody','CarSilver','CarRed'][j%3],j%3)
    for j in range(7):car(-90+j*28,-76,['CarSilver','CarBody','CarRed'][j%3],j%3,True)
    hero_streetscape()


def hero_streetscape():
    """Select details at the representative frontage, budgeted for a close inspection."""
    global STATIC_GROUP
    STATIC_GROUP='HeroNorthStreet'
    # Four-foot sidewalk pours with hairline saw-cut joints, curb seams and one storm inlet.
    for x in range(-22,18,4):box('PavingJoint',(x,.206,-87),(.034,.006,8))
    for z in [-89,-85]:box('PavingJoint',(-3,.206,z),(40,.006,.032))
    for x in range(-22,18,5):
        box('Curb',(x+2.45,.21,-83),(4.88,.42,.55))
    box('PaintedIron',(10,.035,-82.47),(3.1,.04,1.15))
    for x in range(9,12):
        box('Aluminum',(x,.058,-82.47),(.075,.025,1.04))
    # Tall parking regulation sign and a compact hydrant offset from the entrance.
    cyl('Aluminum',(14,.2,-84),.052,8.8,segs=6)
    box('Trim',(14,7.55,-83.96),(1.25,2.25,.055))
    for yy in [8.25,7.95,7.10]:box('AwningRed',(14,yy,-83.915),(.98,.06,.025))
    cyl('PaintedIron',(-18,.2,-83.9),.40,2.13,segs=12)
    cyl('PaintedIron',(-18,2.33,-83.9),.48,.20,segs=12)
    cyl('PaintedIron',(-18,2.53,-83.9),.39,.42,segs=12,top_radius=.12)
    box('PaintedIron',(-18,1.59,-83.9),(1.40,.50,.58))
    # A steel shop bench: slender legs, separate wood slats, hardware placed at supports.
    for xx in [-11.2,-6.8]:
        for zz in [-89.4,-88.25]:cyl('PaintedIron',(xx,.2,zz),.055,1.35,segs=6)
        box('PaintedIron',(xx,1.59,-88.82),(.14,.11,1.46))
        box('PaintedIron',(xx,2.5,-89.4),(.11,2.7,.11))
    for zz in [-89.28,-88.88,-88.48]:box('Wood',(-9,1.7,zz),(5.2,.13,.32))
    for yy in [2.22,2.68,3.14]:box('Wood',(-9,yy,-89.43),(5.2,.32,.13))
    # One tree pit and bicycle rack; leave a continuous accessible sidewalk route.
    box('InteriorShadow',(17,.208,-85.4),(4.3,.02,4.3))
    for xx in [15,19]:box('Curb',(xx,.27,-85.4),(.14,.13,4.2))
    for zz in [-87.4,-83.4]:box('Curb',(17,.27,zz),(4.1,.13,.14))
    for xx in [3.4,6.0]:
        cyl('PaintedIron',(xx,.2,-85),.075,2.5,segs=6)
    beam('PaintedIron',(3.4,2.70,-85),(6.0,2.70,-85),.12)
    STATIC_GROUP='Park'


def car(x,z,color,variant=0,turn=False):
    """Original adult-scale sedan/wagon/hatch family with genuinely open glazed cabins.

    The former roof loft continued through the rear glass and hid it behind paint.
    This mesh uses a shaped lower shell, independent roof, and explicit window openings.
    About 3k triangles/vehicle, with smooth body/tire normals and no subdivision modifier.
    """
    variant%=3
    length_scale=[1.0,1.055,.91][variant]
    width_scale=[1.0,1.045,.975][variant]
    roof=[4.72,5.20,4.93][variant]
    rear_roof=[2.10,4.20,3.50][variant]
    rear_base=[4.55,5.85,5.60][variant]
    front_axle=-4.70;rear_axle=4.50
    def pt(a,y,b):
        a*=width_scale;b*=length_scale
        return (x+b,y,z-a) if turn else (x+a,y,z+b)
    def part(material,c,size):
        sx,sy,sz=size;sx*=width_scale;sz*=length_scale
        box(material,pt(*c),(sz,sy,sx) if turn else (sx,sy,sz))
    def line(material,a,b,width):wire(material,pt(*a),pt(*b),width/2,segs=4)
    def poly(material,points,smooth=False):
        bm=sbm(material);vs=[bm.verts.new(B(*pt(*p))) for p in points]
        f=bm.faces.new(vs);f.smooth=smooth;world_uv(bm,[f]);return vs
    def loft(material,rings):
        bm=sbm(material);rr=[]
        for pts in rings:rr.append([bm.verts.new(B(*pt(*p))) for p in pts])
        for k in range(len(rr)-1):
            for j in range(len(rr[k])):
                f=bm.faces.new([rr[k][j],rr[k+1][j],rr[k+1][(j+1)%len(rr[k])],rr[k][(j+1)%len(rr[k])]])
                f.smooth=True;world_uv(bm,[f])
        for ring in [rr[0],rr[-1][::-1]]:world_uv(bm,[bm.faces.new(ring)])
    # Raised lower side edge traces wheel arches rather than covering wheels with a slab.
    sections=[(-7.70,2.34,1.90),(-7.40,2.65,2.08),(-6.95,2.85,2.27),(-5.9,2.94,2.46),(-5.45,2.97,2.54),(-4.7,2.98,2.62),(-3.95,2.98,2.66),(-3.5,2.97,2.69),(-2.4,2.95,2.71),(0,2.96,2.72),(3.3,2.98,2.74),(3.75,3.0,2.73),(4.50,3.0,2.69),(5.25,2.98,2.64),(5.7,2.92,2.59),(6.7,2.80,2.51),(7.25,2.61,2.39),(7.65,2.30,2.25)]
    rings=[]
    for zz,w,deck in sections:
        wheel_d=min(abs(zz-front_axle),abs(zz-rear_axle))
        arch=1.07+math.sqrt(max(0,1.19**2-wheel_d**2)) if wheel_d<1.19 else .74
        belt=max(arch+.10,deck-.16)
        ring=[(-w*.76,.62),(-w*.93,.70),(-w,arch),(-w,belt),(-w*.965,deck),(-w*.80,deck+.095),(-w*.45,deck+.155),(0,deck+.18),(w*.45,deck+.155),(w*.80,deck+.095),(w*.965,deck),(w,belt),(w,arch),(w*.93,.70),(w*.76,.62)]
        rings.append([(xx,yy,zz) for xx,yy in ring])
    loft(color,rings)
    part('WindowFrame',(0,.72,0),(4.9,.25,12.8))
    # Independent rolled roof; no opaque cabin shell behind the windshield/backlight.
    bm=sbm(color);grid=[]
    for j in range(7):
        t=j/6;zz=-1.52+(rear_roof+1.52)*t
        row=[]
        for i in range(9):
            u=-1+2*i/8;xx=u*(2.19-.025*math.sin(t*math.pi));yy=roof-.145*u*u+.045*math.sin(t*math.pi)
            row.append(bm.verts.new(B(*pt(xx,yy,zz))))
        grid.append(row)
    for j in range(6):
        for i in range(8):
            f=bm.faces.new([grid[j][i],grid[j+1][i],grid[j+1][i+1],grid[j][i+1]])
            f.smooth=True;world_uv(bm,[f])
    # A curved glass patch between four corners, separated physically from the body shell.
    def glass_patch(corners,bulge,back=False):
        bm=sbm('CarGlass');rows=[]
        for j in range(5):
            v=j/4;row=[]
            for i in range(7):
                u=i/6
                bottom=Vector(corners[0]).lerp(Vector(corners[1]),u)
                top=Vector(corners[3]).lerp(Vector(corners[2]),u)
                q=bottom.lerp(top,v);q.z+=bulge*math.sin(u*math.pi)*math.sin(v*math.pi)
                row.append(bm.verts.new(B(*pt(*q))))
            rows.append(row)
        for j in range(4):
            for i in range(6):
                vs=[rows[j][i],rows[j][i+1],rows[j+1][i+1],rows[j+1][i]]
                if not back:vs.reverse()
                f=bm.faces.new(vs);f.smooth=True;world_uv(bm,[f])
    glass_patch([(-2.47,2.87,-3.64),(2.47,2.87,-3.64),(2.10,roof-.15,-1.51),(-2.10,roof-.15,-1.51)],-.095)
    glass_patch([(2.42,2.91,rear_base),(-2.42,2.91,rear_base),(-2.08,roof-.16,rear_roof),(2.08,roof-.16,rear_roof)],.085,back=False)
    # Dark actual cabin volume and seat tops visible when the view grazes side glass.
    part('WindowFrame',(0,2.68,.7),(4.6,.22,6.2))
    for zz in [-.8,2.35]:
        for xx in [-1.12,1.12]:
            part('WindowFrame',(xx,3.05,zz),(1.55,.70,.43))
            part('WindowFrame',(xx,3.57,zz),(1.05,.45,.28))
    for side in [-1,1]:
        # Painted A/C pillars and dark B pillar border independently curved glass surfaces.
        a0=(side*2.61,2.79,-3.60);a1=(side*2.18,roof-.12,-1.52)
        c0=(side*2.59,2.87,rear_base+.05);c1=(side*2.18,roof-.12,rear_roof)
        line(color,a0,a1,.17);line(color,c0,c1,.24)
        line(color,a1,c1,.14)
        line('WindowFrame',(side*2.58,2.86,-3.53),(side*2.59,2.92,rear_base-.08),.085)
        line('WindowFrame',(side*2.54,2.85,.32),(side*2.18,roof-.10,.32),.19)
        # Separate door windows and quarterlight preserve credible pillar proportions.
        sets=[[(side*2.57,2.87,-3.41),(side*2.56,2.89,.18),(side*2.18,roof-.20,.18),(side*2.19,roof-.21,-1.43)],[(side*2.57,2.89,.47),(side*2.56,2.93,rear_base-.31),(side*2.18,roof-.22,rear_roof-.12),(side*2.18,roof-.20,.47)]]
        for points in sets:
            poly('CarGlass',points[::-1] if side>0 else points)
        if variant:
            line('WindowFrame',(side*2.56,2.92,rear_base-1.24),(side*2.19,roof-.20,rear_roof-.68),.11)
        # Rubber/weather seals, window chrome line, panel gaps and shoulder crease.
        line('Chrome',(side*2.64,2.78,-3.65),(side*2.64,2.87,rear_base+.05),.030)
        for zz in [-3.41,.24,3.42]:
            line('WindowFrame',(side*2.985,2.67,zz),(side*2.991,1.27,zz-.10),.013)
        line('WindowFrame',(side*2.987,1.10,-3.45),(side*2.987,1.10,3.35),.014)
        line(color,(side*2.988,2.21,-6.7),(side*2.998,2.27,6.4),.022)
        for zz in [-.42,2.79]:
            part('WindowFrame',(side*3.001,2.42,zz),(.035,.15,.69))
            part('Chrome',(side*3.027,2.45,zz),(.058,.067,.52))
        # Small rounded mirror housing, short arm, and rearward facing mirror pane.
        line('WindowFrame',(side*2.62,3.05,-2.92),(side*3.10,3.07,-2.87),.10)
        blob(color,pt(side*3.15,3.12,-2.91),(.32,.19,.46) if turn else (.46,.19,.32),segs=(10,5))
        poly('CarGlass',[(side*2.91,2.99,-2.62),(side*3.43,2.99,-2.65),(side*3.40,3.23,-2.65),(side*2.95,3.23,-2.62)][::side])
        for zz in [front_axle,rear_axle]:
            # Rounded shoulder/tread tyre cross-section, rather than a flat cylindrical coin.
            bm=sbm('Tire');rr=[];segments=24 if abs(x)<18 and z<-70 else 20
            for offset,rad in [(-.31,.79),(-.30,.95),(-.20,1.045),(.20,1.045),(.30,.95),(.31,.79)]:
                rr.append([bm.verts.new(B(*pt(side*(2.82+offset),1.065+rad*math.sin(j*math.tau/segments),zz+rad*math.cos(j*math.tau/segments)))) for j in range(segments)])
            for k in range(len(rr)-1):
                for j in range(segments):
                    vs=[rr[k][j],rr[k][(j+1)%segments],rr[k+1][(j+1)%segments],rr[k+1][j]]
                    if side>0:vs.reverse()
                    f=bm.faces.new(vs);f.smooth=True;world_uv(bm,[f])
            # Wheel dish/rim and a darker brake rotor; five spokes model the open silhouette.
            def disc(material,xx,r,depth,segs=16):
                bm=sbm(material);ret=bmesh.ops.create_cone(bm,cap_ends=True,segments=segs,radius1=r,radius2=r,depth=depth)
                p=Vector(B(*pt(side*xx,1.065,zz)));direction=Vector(B(*pt(side*(xx+1),1.065,zz)))-p
                tr=Matrix.Translation(p)@direction.to_track_quat('Z','Y').to_matrix().to_4x4()
                bmesh.ops.transform(bm,matrix=tr,verts=ret['verts']);_finish(bm,ret['verts'],True)
            disc('WindowFrame',3.09,.785,.028,20)
            disc('Aluminum',3.12,.27,.055,12)
            # A true circular rim bead and two fine tread circumferential grooves.
            for material,xx,rad,thick in [('Chrome',3.125,.745,.042)]:
                for j in range(segments):
                    a=j*math.tau/segments;b=(j+1)*math.tau/segments
                    line(material,(side*xx,1.065+rad*math.sin(a),zz+rad*math.cos(a)),(side*xx,1.065+rad*math.sin(b),zz+rad*math.cos(b)),thick)
            for k in range(5):
                a=k*math.tau/5
                line('Aluminum',(side*3.155,1.065+math.sin(a)*.20,zz+math.cos(a)*.20),(side*3.155,1.065+math.sin(a+.08)*.69,zz+math.cos(a+.08)*.69),.13)
            # Body-colored arch lip follows the real cutout edge, with a dark inner liner.
            for j in range(14):
                a=j*math.pi/14;b=(j+1)*math.pi/14
                pa=(side*3.004,1.07+1.20*math.sin(a),zz+1.20*math.cos(a))
                pb=(side*3.004,1.07+1.20*math.sin(b),zz+1.20*math.cos(b))
                line(color,pa,pb,.046)
    # Broad but curved bumpers, recessed plate, wraparound lights and restrained grille.
    for zz,sgn in [(-7.70,-1),(7.67,1)]:
        part('WindowFrame',(0,1.25,zz),(4.30,.27,.085))
        part(color,(0,1.78,zz),(4.18,.32,.12))
        part('WindowFrame',(0,1.51,zz+sgn*.09),(1.58,.64,.025))
        part('Trim',(0,1.51,zz+sgn*.12),(1.40,.51,.026))
        for i in range(5):part('WindowFrame',((i-2)*.20,1.54,zz+sgn*.139),(.10,.12,.009))
    for side in [-1,1]:
        poly('Headlight',[(side*1.34,1.90,-7.75),(side*2.18,1.90,-7.75),(side*2.18,2.12,-7.75),(side*1.36,2.13,-7.75)][::-side])
        poly('TailLight',[(side*1.29,1.94,7.735),(side*2.18,1.96,7.735),(side*2.18,2.18,7.735),(side*1.31,2.19,7.735)][::side])
        line('Headlight',(side*1.40,2.01,7.75),(side*1.80,2.02,7.75),.041)
        line('Chrome',(side*1.37,2.14,-7.77),(side*2.18,2.14,-7.77),.025)
    part('WindowFrame',(0,2.06,-7.72),(2.65,.47,.055))
    for yy in [1.91,2.03,2.15,2.27]:line('Chrome',(-1.26,yy,-7.755),(1.26,yy,-7.755),.022)
    # Hood/trunk shut lines lie just above the contoured body instead of thick black stripes.
    for side in [-1,1]:
        line('WindowFrame',(side*1.75,2.81,-3.55),(side*1.83,2.47,-6.75),.011)
        line('WindowFrame',(side*1.95,2.90,rear_base+.1),(side*1.99,2.63,6.70),.011)
    line('WindowFrame',(-2.08,2.56,7.02),(2.08,2.56,7.02),.012)
    line('TailLight',(-.55,2.97,rear_base-.03),(.55,2.97,rear_base-.03),.055)
    for a in [-.8,.7]:line('WindowFrame',(a,2.91,-3.63),(a+.95,3.03,-3.48),.039)
    if variant==1:
        for side in [-1,1]:line('WindowFrame',(side*1.65,roof+.10,-1.2),(side*1.65,roof+.10,rear_roof-.15),.075)

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
        for _ in range(120):
            az=rng.random()*math.tau;u=rng.uniform(-1,1);rr=radius*(rng.random()**.33)
            q=math.sqrt(1-u*u);c=B(center[0]+math.cos(az)*q*rr,center[1]+u*rr*.90,center[2]+math.sin(az)*q*rr)
            bm=sbm(rng.choices(["Foliage","FoliageLight","LeafOchre"],[.58,.35,.07])[0])
            normal=Vector((rng.uniform(-1,1),rng.uniform(-1,1),rng.uniform(.15,1))).normalized()
            tx=normal.cross(Vector((0,0,1))).normalized();ty=normal.cross(tx)
            size=rng.uniform(.15,.40)
            coords=[(-1,0),(-.28,.60),(.75,.27),(1.1,0),(.12,-.55)]
            vv=[bm.verts.new(c+tx*xx*size+ty*yy*size) for xx,yy in coords]
            f=bm.faces.new(vv);f.smooth=False
    spots=[(-49,-57,41),(-23,-57,43),(27,-59,46),(50,-58,43),(-63,-35,40),(63,-30,43),(64,31,39),(-63,32,44),(-62,60,39),(66,64,40)]
    for tx,tz,h in spots:
        # A continuous curved leader, with boughs emerging at different heights.
        # The former common-height radial fork made every tree an identical V shape.
        leanx,leanz=rng.uniform(-2,2),rng.uniform(-2,2)
        trunk=[(tx,.12,tz),(tx+.30,h*.18,tz-.2),(tx+leanx*.55,h*.38,tz+leanz*.6),(tx+leanx,h*.59,tz+leanz),(tx+leanx*1.25,h*.81,tz+leanz*1.2),(tx+leanx*.7,h*.99,tz+leanz*1.5)]
        for k in range(len(trunk)-1): branch(trunk[k],trunk[k+1],1.32*(1-k*.17),1.13*(1-k*.18))
        leaves(trunk[-1],5.8);leaves(trunk[-2],6.0)
        for j in range(6):
            a=j*math.tau/6+rng.random()*.7
            source=trunk[1+j%3]
            elbow=(source[0]+math.cos(a)*rng.uniform(3,6),h*rng.uniform(.52,.76),source[2]+math.sin(a)*rng.uniform(3,6))
            tip=(tx+math.cos(a)*rng.uniform(8,13),h*rng.uniform(.65,.98),tz+math.sin(a)*rng.uniform(8,13))
            branch(source,elbow,.64 if j<3 else .46,.31);branch(elbow,tip,.31,.085)
            leaves(tip,rng.uniform(5.0,6.8))
            for k in [-1,1]:
                subt=(tip[0]+math.cos(a+k*.7)*4,tip[1]+rng.uniform(-2,4),tip[2]+math.sin(a+k*.7)*4)
                branch(elbow,subt,.18,.035);leaves(subt,rng.uniform(4.2,5.5))
        for j in range(5):
            a=j*math.tau/5;branch((tx,.2,tz),(tx+math.cos(a)*2.6,.06,tz+math.sin(a)*2.6),.60,.07)
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
    profile = {}
    for (group, name), bm in STATIC.items():
        objname = f"Static_{group}_{name}"
        me = bpy.data.meshes.new(objname)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat(name))
        obj = bpy.data.objects.new(objname, me)
        bpy.context.scene.collection.objects.link(obj)
        tris = sum(len(p.vertices)-2 for p in me.polygons)
        profile[group] = profile.get(group, 0) + tris
    print("GEOMETRY_BY_GROUP", json.dumps(profile), flush=True)


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
    # Sidewalk groups look through the cage, without filling every inch uniformly.
    for side in [-1,1]:
        for j in range(18):
            z=-44+j*5+rng.uniform(-1,1)
            NEIGHBORS.append({'position':[side*(60.8+rng.uniform(0,2.7)),.2,z],'yaw':-side*math.pi/2,'window':False})
    for z,yaw in [(-54,0),(50,math.pi)]:
        for x in [-45,-41,-22,-18,9,13,32,36,40]:NEIGHBORS.append({'position':[x,.2,z+rng.uniform(-1,1)],'yaw':yaw,'window':False})
    json.dump(NEIGHBORS,open(os.path.join(HERE,'../src/world/neighbors.json'),'w'),indent=2)
    finish_static()
    if PREVIEW:
        preview(PREVIEW)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_apply=True, export_yup=True, export_animations=False, export_vertex_color="NONE")
    print("EXPORTED", OUT, os.path.getsize(OUT))
    print("OBJECTS", len(bpy.context.scene.objects), sorted(o.name for o in bpy.context.scene.objects if not o.name.startswith("Static_"))[:12])


main()
