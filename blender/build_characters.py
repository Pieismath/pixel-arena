"""Adult basketball athletes, authored in Blender from licensed continuous human meshes.

Run: Blender --background --factory-startup --python blender/build_characters.py -- [out_dir] [--preview dir]
The checked-in .blend source includes the continuous MakeHuman anatomy, original skin
weights, tailored clothing and shoes. No primitive body assembly. See sources/README.md.
Source coordinates are meters; a single rig scale converts to court feet on export.
"""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix, Quaternion, Euler
HERE=os.path.dirname(os.path.abspath(__file__))
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
OUT=os.path.abspath(ARGS[0]) if ARGS and not ARGS[0].startswith('--') else os.path.join(HERE,'../public/models')
PREVIEW=ARGS[ARGS.index('--preview')+1] if '--preview' in ARGS else None
FPS=24
REGIONS=['Skin','Jersey','Trim','Shorts','Socks','Shoe','Sole','EyeWhite','Dark','Hair']
SCALE=6.35/2.019
RADIUS=.40/SCALE
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE,'sources/adult-athlete-source.blend'))
scene=bpy.context.scene;scene.render.fps=FPS
rig=bpy.data.objects['AthleteRig'];body=bpy.data.objects['Anatomy']
for obj in bpy.data.objects:obj.select_set(False)
# Clear imported materials but keep source meshes, UVs, weights and all finger bones.
def material(name,col,rough=.78):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1);p.inputs['Roughness'].default_value=rough
 m.use_backface_culling=True
 return m
MATS=[material(n,c) for n,c in zip(REGIONS,[(.26,.115,.06),(.6,.045,.03),(.88,.79,.51),(.045,.055,.075),(.9,.88,.81),(.65,.07,.025),(.83,.79,.7),(.91,.9,.83),(.016,.01,.008),(.026,.012,.008)])]
def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def cut(o,predicate):
 bm=bmesh.new();bm.from_mesh(o.data)
 fs=[f for f in bm.faces if predicate(f.calc_center_median())]
 bmesh.ops.delete(bm,geom=fs,context='FACES')
 loose=[v for v in bm.verts if not v.link_faces]
 if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
 bm.to_mesh(o.data);bm.free();o.data.update()

def assign(o,index):
 o.data.materials.clear()
 for m in MATS:o.data.materials.append(m)
 for p in o.data.polygons:p.material_index=index;p.use_smooth=True

# Real cloth surface, cut/tailored from Namuhekam's polo shell into a basketball singlet.
jersey=bpy.data.objects['Jersey']
cut(jersey,lambda p: (abs(p.x)>.225 and p.z>1.425) or p.z>1.747 or p.z<1.13 or (abs(p.x)<.12 and p.z>(1.60+.14*(abs(p.x)/.12)**2 if p.y<-.035 else 1.71)))
# Natural air gap and broad compression folds; no stacks of primitive shapes.
for v in jersey.data.vertices:
 p=v.co;f=math.sin(p.z*41+p.x*18)*math.sin(p.x*27+p.z*12)
 tuck=max(0,min(1,(1.24-p.z)/.11));p.x*=1.035*(1-.035*tuck);p.y*=1.045*(1-.18*tuck);p.y+=math.copysign(.0025*f,p.y)
assign(jersey,1)
# Fair the newly cut edges, then add a narrow, continuous stitched trim band.
bm=bmesh.new();bm.from_mesh(jersey.data);bm.normal_update()
bound=[e for e in bm.edges if e.is_boundary];bverts=set(v for e in bound for v in e.verts)
for repeat in range(7):
 changes={}
 for v in bverts:
  neighbors=[e.other_vert(v) for e in v.link_edges if e.is_boundary]
  if len(neighbors)==2:changes[v]=v.co.lerp((neighbors[0].co+neighbors[1].co)*.5,.57)
 for v,co in changes.items():v.co=co
bm.normal_update();deform=bm.verts.layers.deform.active
outer={};inner={}
for v in bverts:
 normal=v.normal.normalized();inside=sum((f.calc_center_median()-v.co for f in v.link_faces),Vector()).normalized()
 outer[v]=bm.verts.new(v.co+normal*.0012);inner[v]=bm.verts.new(v.co+inside*.005+normal*.0014)
 if deform:
  for dst in [outer[v],inner[v]]:
   for idx,w in v[deform].items():dst[deform][idx]=w
for e in bound:
 a,b=e.verts
 if (a.co.z+b.co.z)*.5<1.2:continue
 try:f=bm.faces.new((outer[a],outer[b],inner[b],inner[a]));f.material_index=2
 except ValueError:pass
bm.to_mesh(jersey.data);bm.free()
# Preserve imported, modeled pleats and the natural crotch topology of the shorts.
shorts=bpy.data.objects['Shorts'];assign(shorts,3)
for v in shorts.data.vertices:
 v.co.x*=1.045;v.co.y*=1.075
for p in shorts.data.polygons:
 c=p.center
 if c.z<.695:p.material_index=3
# Crew socks are an offset of the actual weighted calf surface, avoiding the
# radius/weight mismatch produced by compressing a long source sock vertically.
socks=body.copy();socks.data=body.data.copy();socks.name='FittedCrewSocks';scene.collection.objects.link(socks)
bpy.data.objects.remove(bpy.data.objects['Socks'],do_unlink=True)
cut(socks,lambda p:not(.22<p.z<.41 and abs(p.x)<.36))
bm=bmesh.new();bm.from_mesh(socks.data);bm.normal_update()
for v in bm.verts:
 v.co+=Vector((v.normal.x,v.normal.y,0))*.004
 if any(e.is_boundary for e in v.link_edges):v.co.z=.22 if v.co.z<.30 else .41
bm.to_mesh(socks.data);bm.free();assign(socks,4)
shoes=bpy.data.objects['Shoes'];assign(shoes,5)
for p in shoes.data.polygons:
 if p.center.z<.047:p.material_index=6
 # Mesh-authored laces/upper panel accent, not painted blocks.
 elif p.center.y<-.065 and p.center.z>.105:p.material_index=2
# Delete fully covered geometry. Keep shoulder/deltoid, elbows, knees and calf topology intact.
assign(body,0)
cut(body,lambda p: (p.z<.115) or (.225<p.z<.405 and abs(p.x)<.36) or (.70<p.z<1.14 and abs(p.x)<.30) or (1.14<p.z<1.49 and abs(p.x)<.175) or (1.49<p.z<1.59 and abs(p.x)<.14 and p.y>.035))
# Fine facial color values are encoded separately from selectable skin tone.
eyes=bpy.data.objects['Eyes'];assign(eyes,7)
# Actual iris geometry: eye UV material retained in source, sampled for region mask.
for p in eyes.data.polygons:
 c=p.center
 # Iris faces are forward-most portion of the modeled eyeballs.
 if (abs(c.x)-.0348)**2+(c.z-1.889)**2<.0065**2 and c.y<-.160:p.material_index=8
sourcehair=bpy.data.objects.get('SourceHair')
if sourcehair:bpy.data.objects.remove(sourcehair,do_unlink=True)
# Athletic deltoid/chest fullness follows a smooth anatomical mask and keeps wrist/neck landmarks.
for o in [body,jersey]:
 for v in o.data.vertices:
  p=v.co;mask=math.exp(-((p.z-1.56)/.17)**2)*math.exp(-((abs(p.x)-.21)/.20)**2)
  p.x*=1+.075*mask;p.y*=1+.045*mask
# Runtime LOD is made from the continuous surface before authoring facial morphs.
for o,ratio in [(body,.70),(jersey,.82),(shoes,.85),(eyes,.65)]:
 active(o);dec=o.modifiers.new('Athlete runtime surface LOD','DECIMATE');dec.ratio=ratio
 bpy.ops.object.modifier_apply(modifier=dec.name)
# Keep head landmarks realistic; variant morphs alter the face, not the body scale.
body.shape_key_add(name='Basis')
for name,width,jaw,nose in [('FaceBroad',1.09,1.09,1.025),('FaceLean',.93,.91,.98),('FaceStrong',1.025,1.15,1.06)]:
 key=body.shape_key_add(name=name)
 for v,k in zip(body.data.vertices,key.data):
  p=v.co
  if p.z>1.77:
   influence=max(0,min(1,(p.z-1.77)/.08,(1.955-p.z)/.06));k.co.x*=1+(width-1)*influence
   if p.z<1.88:k.co.x*=jaw
   if abs(p.x)<.04 and p.y<-.09:k.co.y*=nose
# Cap meshes follow original skull topology, preserving the detailed facial silhouette.
def scalp(name,style):
 o=body.copy();o.data=body.data.copy();o.name=name;scene.collection.objects.link(o)
 if o.data.shape_keys:o.shape_key_clear()
 cut(o,lambda p: not ((p.z>1.951 and (p.z>1.982 or abs(p.x)<.089)) or (p.z>1.893 and p.y>-.025 and abs(p.x)<.086)))
 bm=bmesh.new();bm.from_mesh(o.data);vs=[v for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
 for _ in range(8):bmesh.ops.smooth_vert(bm,verts=vs,factor=.4,use_axis_x=True,use_axis_y=True,use_axis_z=True)
 bm.to_mesh(o.data);bm.free()
 for v in o.data.vertices:
  p=v.co;d=p-Vector((0,-.015,1.93))
  thick=.007
  if style=='afro':thick=.031+.005*math.sin(p.x*340)*math.cos(p.y*280)*math.sin(p.z*250)
  if style=='twists':thick=.018+.010*(.5+.5*math.sin(p.x*200+math.cos(p.y*110)))
  p+=d.normalized()*(thick+.006)
 assign(o,9)
 active(o);sub=o.modifiers.new('Soft hair silhouette','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
 active(o);dec=o.modifiers.new('Scalp LOD','DECIMATE');dec.ratio=.85;bpy.ops.object.modifier_apply(modifier=dec.name)
 return o
hair=[scalp('HairBuzz','buzz'),scalp('HairAfro','afro'),scalp('HairTwists','twists')]
# Beard follows jaw and chin surface, not a pasted sphere.
beard=body.copy();beard.data=body.data.copy();beard.name='HairBeard';scene.collection.objects.link(beard)
if beard.data.shape_keys:beard.shape_key_clear()
cut(beard,lambda p:not (1.765<p.z<1.851 and p.y<-.068 and (p.z<1.80 or abs(p.x)>.027)))
for v in beard.data.vertices:v.co.y-=.002
assign(beard,9)
beard.shape_key_add(name='Basis')
for name,width,jaw,nose in [('FaceBroad',1.09,1.09,1.025),('FaceLean',.93,.91,.98),('FaceStrong',1.025,1.15,1.06)]:
 key=beard.shape_key_add(name=name)
 for v,k in zip(beard.data.vertices,key.data):
  p=v.co
  if p.z>1.77:
   influence=max(0,min(1,(p.z-1.77)/.08,(1.955-p.z)/.06));k.co.x*=1+(width-1)*influence
   if p.z<1.88:k.co.x*=jaw
   if abs(p.x)<.04 and p.y<-.09:k.co.y*=nose
hair.append(beard)
# Fabric headband follows a narrow scalp strip.
headband=body.copy();headband.data=body.data.copy();headband.name='Headband';scene.collection.objects.link(headband)
if headband.data.shape_keys:headband.shape_key_clear()
cut(headband,lambda p:not(1.919<p.z<1.956))
for v in headband.data.vertices:
 v.co.x*=1.045;v.co.y=-.015+(v.co.y+.015)*1.045
assign(headband,2);hair.append(headband)
# Natural eyebrow ribbons follow the actual forehead surface through ray casting.
from mathutils.bvhtree import BVHTree
bm=bmesh.new();bm.from_mesh(body.data);tree=BVHTree.FromBMesh(bm);bm.free()
verts=[];faces=[]
for side in [-1,1]:
 start=len(verts)
 for i in range(13):
  t=i/12;x=side*(.015+.045*t);z=1.919+.004*math.sin(t*math.pi)-.003*t
  for dz in [-.0018,.0018]:
   hit=tree.ray_cast(Vector((x,-1,z+dz)),Vector((0,1,0)),2)[0]
   verts.append(tuple(hit+Vector((0,-.0025,0))) if hit else (x,-.15,z+dz))
 for i in range(12):
  a=start+i*2;faces.append((a+1,a+3,a+2,a) if side<0 else (a,a+2,a+3,a+1))
me=bpy.data.meshes.new('Eyebrows');me.from_pydata(verts,[],faces);brows=bpy.data.objects.new('Eyebrows',me);scene.collection.objects.link(brows);brows.parent=rig
vg=brows.vertex_groups.new(name='head');vg.add(range(len(verts)),1,'REPLACE');mod=brows.modifiers.new('Armature','ARMATURE');mod.object=rig;assign(brows,9)
# A four-influence normalized skin is required on every exported athlete mesh.
def normalize(o):
 for v in o.data.vertices:
  gs=[(g.group,g.weight) for g in v.groups if o.vertex_groups[g.group].name in rig.data.bones and g.weight>1e-5]
  gs.sort(key=lambda g:-g[1]);keep=gs[:4];total=sum(w for i,w in keep)
  for idx in [g.group for g in v.groups]:o.vertex_groups[idx].remove([v.index])
  if total>0:
   for idx,w in keep:o.vertex_groups[idx].add([v.index],w/total,'REPLACE')
# Rename right/left hand bones preserves existing browser attachment fallbacks.
for side in ['l','r']:
 old='hand_'+side;new='hand.'+side.upper();rig.data.bones[old].name=new
 for o in bpy.data.objects:
  if o.type=='MESH' and old in o.vertex_groups:o.vertex_groups[old].name=new
# Grip bones at the center of a basketball touching the palm. They inherit the true hand pose.
REST={b.name:b.matrix_local.copy() for b in rig.data.bones}
PALM={};FINGER={};NORMAL={}
for side in ['l','r']:
 hn='hand.'+side.upper();w=rig.data.bones[hn].head_local
 finger=(rig.data.bones['middle_01_'+side].head_local-w).normalized()
 across=rig.data.bones['index_01_'+side].head_local-rig.data.bones['pinky_01_'+side].head_local
 norm=across.cross(finger).normalized()
 if norm.y<0:norm=-norm
 PALM[side]=(rig.data.bones['middle_01_'+side].head_local-w)*.57
 FINGER[side]=finger;NORMAL[side]=norm
active(rig);bpy.ops.object.mode_set(mode='EDIT')
for side in ['l','r']:
 hn='hand.'+side.upper();b=rig.data.edit_bones.new('ballGrip'+side.upper());b.parent=rig.data.edit_bones[hn]
 b.head=b.parent.head+PALM[side]+NORMAL[side]*RADIUS;b.tail=b.head+Vector((0,0,.025));b.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT')
rig.scale=(SCALE,)*3
for p in rig.pose.bones:p.rotation_mode='QUATERNION'
REST={b.name:b.matrix_local.copy() for b in rig.data.bones}
# Reduce invisible anatomy while retaining real hand topology. No simplification of facial mesh.
for o in [body,jersey,shorts,socks,shoes,eyes,brows]+hair:normalize(o)
# Preserve UVs + region attribute. Runtime skin tones multiply the artist material shading.
def regionize(o,fan=False):
 me=o.data
 if me.color_attributes.get('Region'):me.color_attributes.remove(me.color_attributes['Region'])
 attr=me.color_attributes.new(name='Region',type='FLOAT_COLOR',domain='CORNER')
 for p in me.polygons:
  reg=p.material_index
  for li in p.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;shade=1.
   if reg==0:
    if 1.80<co.z<1.88 and co.y<-.08:shade=.85
    if 1.86<co.z<1.895 and .027<abs(co.x)<.070 and co.y<-.07:shade=.80
    if 1.805<co.z<1.826 and abs(co.x)<.038 and co.y<-.10:shade=.61
   if reg in [1,3]:shade=.95+.045*math.sin(co.z*85+co.x*60)*math.sin(co.x*39)
   if reg==9:shade=.82+.18*math.sin(co.x*530+co.y*290)**2
   if fan:reg={0:0,1:1,2:1,3:2,4:2,5:4,6:7,7:5,8:6,9:3}[reg]
   attr.data[li].color=((reg+.5)/(8 if fan else 16),shade,0,1)
 me.color_attributes.active_color=attr
 me.materials.clear();me.materials.append(material('FanPalette' if fan else 'PlayerPalette',(1,1,1)))
# Animation uses world-space two-bone IK with explicit planted feet and smooth weight transfer.
def reset_pose():
 for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
 bpy.context.view_layer.update()
def aim(name,target):
 pb=rig.pose.bones[name];h=pb.head.copy();q=(pb.tail-h).rotation_difference(Vector(target)-h)
 pb.matrix=Matrix.Translation(h)@q.to_matrix().to_4x4()@Matrix.Translation(-h)@pb.matrix
 bpy.context.view_layer.update()
def two(upper,lower,target,pole):
 a=rig.pose.bones[upper].head.copy();v=Vector(target)-a;l1=rig.data.bones[upper].length;l2=rig.data.bones[lower].length
 dist=max(.02,min(v.length,l1+l2-.001));u=v.normalized();pv=Vector(pole)-a;n=(pv-u*pv.dot(u)).normalized()
 d=(l1*l1-l2*l2+dist*dist)/(2*dist);j=a+u*d+n*math.sqrt(max(0,l1*l1-d*d))
 aim(upper,j);aim(lower,a+u*dist)
def hand(side,ball,fd=(0,-1,0),pn=(0,0,-1)):
 fd=Vector(fd).normalized();pn=Vector(pn);pn=(pn-fd*pn.dot(fd)).normalized()
 q=FINGER[side].rotation_difference(fd);normal=q@NORMAL[side]
 angle=math.atan2(fd.dot(normal.cross(pn)),normal.dot(pn));q=Quaternion(fd,angle)@q
 wrist=Vector(ball)-q@PALM[side]-pn*RADIUS
 sign=1 if side=='l' else -1
 two('upperarm_'+side,'lowerarm_'+side,wrist,(sign*.48,.08,1.26))
 hn='hand.'+side.upper();actual=rig.pose.bones[hn].head.copy();rig.pose.bones[hn].matrix=Matrix.Translation(actual)@q.to_matrix().to_4x4()@REST[hn].to_3x3().to_4x4()
 bpy.context.view_layer.update()
def smoothkeys(keys,t):
 if t<=keys[0][0]:return Vector(keys[0][1])
 for (ta,a),(tb,b) in zip(keys,keys[1:]):
  if ta<=t<=tb:
   u=(t-ta)/(tb-ta);u=u*u*(3-2*u);return Vector(a).lerp(Vector(b),u)
 return Vector(keys[-1][1])
def pose(kind,t):
 reset_pose();p=rig.pose.bones;s=math.sin(t*math.tau)
 hip=-.07;hop=0;lean=.035;spread=.225;lefty=.015;righty=.015;leftz=.088;rightz=.088
 ball=Vector((-.37,-.36,1.17));other=Vector((.37,-.22,1.13));fd=(0,-1,0);pn=(0,0,-1)
 if kind in ['Run','RunDribble']:
  hip=-.225+.025*math.cos(t*math.tau*2);lean=.12
  # Linear backward ground travel is the stance. The return lifts clear of the court.
  for side,phase in [('l',t),('r',(t+.5)%1)]:
   u=phase%1
   if u<.5:y=-.62+2.48*u;z=.088
   else:v=(u-.5)*2;y=.62-1.24*(v*v*(3-2*v));z=.088+.23*math.sin(v*math.pi)
   if side=='l':lefty,leftz=y,z
   else:righty,rightz=y,z
  ball=Vector((-.30,-.29+.10*s,1.21));other=Vector((.29,-.27-.10*s,1.21))
 if kind in ['IdleDribble','RunDribble','Crossover']:
  ball=Vector((-.38,-.36,1.08+.16*(.5-.5*math.cos(t*math.tau))))
  other=Vector((.28,-.21,1.18));hip-=.03
  if kind=='Crossover':ball.x=-.37+.70*(.5-.5*math.cos(t*math.tau));lean=.08
 if kind in ['Defend','Shuffle']:
  hip=-.22;lean=.11;spread=.35
  ball=Vector((-.52,-.28,1.22));other=Vector((.52,-.28,1.22))
  if kind=='Shuffle':lean=.08
 if kind in ['Pass','Catch']:
  u=t if kind=='Pass' else 1-t
  ball=smoothkeys([(0,(-.10,-.39,1.28)),(.208,(-.06,-.67,1.36)),(.40,(-.03,-.72,1.39)),(1,(-.28,-.30,1.19))],u)
  ball.x=0;other=ball.copy();fd=(0,-1,.1);pn=(1,0,.1);hip-=.04*math.sin(t*math.pi)
 if kind=='Shoot':
  ball=smoothkeys([(0,(-.12,-.40,1.28)),(.32,(-.10,-.25,1.67)),(.5833,(-.10,-.34,2.06)),(.75,(-.10,-.39,2.08)),(1,(-.27,-.28,1.36))],t)
  other=ball.copy();fd=(0,-1,.1);pn=(0,.1,1)
  hop=.10*math.sin(min(1,max(0,(t-.27)/.65))*math.pi);hip=-.07-.10*math.sin(min(t/.3,1)*math.pi)+hop
 if kind in ['Jump','Rebound','Dunk']:
  # A high-elevation running dunk at apex for a 6'4" athlete, with knee compression on landing.
  if kind=='Dunk':
   hop=smoothkeys([(0,(0,0,0)),(.2,(0,0,-.18)),(.56,(0,0,.69)),(.75,(0,0,1.235)),(.87,(0,0,.78)),(1,(0,0,0))],t).z
   ball=smoothkeys([(0,(-.28,-.36,1.24)),(.28,(-.20,-.24,1.70)),(.56,(-.12,-.25,2.18)),(.75,(-.10,-.43,2.28)),(.88,(-.10,-.46,2.09)),(1,(-.25,-.28,1.33))],t)+Vector((0,0,hop))
   other=Vector((.31,-.20,1.44+hop));fd=(0,-1,0);pn=(0,0,-1)
  else:
   hop=.49*math.sin(t*math.pi);ball=Vector((-.18,-.30,1.86+hop));other=Vector((.18,-.30,1.86+hop));fd=(0,-1,.2);pn=(0,0,1)
  hip=-.07+hop
  if hop>0:leftz+=hop;rightz+=hop
 if kind=='Land':
  hip=-.07-.21*math.sin(t*math.pi);lean=.16*math.sin(t*math.pi);ball.z-=.1*math.sin(t*math.pi);other.z-=.1*math.sin(t*math.pi)
 if kind=='Celebrate':
  ball=Vector((-.39,-.20,1.88+.04*s));other=Vector((.39,-.20,1.88-.04*s));hip=-.065+.025*s;fd=(0,0,1);pn=(0,-1,0)
 if kind in ['Sit','Clap','Card']:
  hip=-.05;lefty=righty=-.50;leftz=rightz=.61
  ball=Vector((-.25,-.47,1.17));other=Vector((.25,-.47,1.17))
  if kind=='Clap':ball=Vector((-.075,-.46,1.40));other=Vector((.075,-.46,1.40));pn=(1,0,0)
  if kind=='Card':ball=Vector((-.28,-.45,1.56));other=Vector((.28,-.45,1.56));pn=(1,0,0)
 # Pelvis local matrix translation is a world vector, not its tilted local axis.
 p['pelvis'].matrix=Matrix.Translation((.014*s if kind in ['Idle','IdleDribble'] else 0,0,hip))@REST['pelvis']
 p['spine_01'].rotation_quaternion=Euler((lean,0,.018*s if kind=='Idle' else 0),'XYZ').to_quaternion()
 bpy.context.view_layer.update()
 leftx,rightx=spread,-spread
 if kind=='Shuffle':
  for side,phase in [('l',t),('r',(t+.5)%1)]:
   u=phase%1
   if u<.5:x=.20-.8*u;z=.088
   else:v=(u-.5)*2;x=-.20+.40*(v*v*(3-2*v));z=.088+.065*math.sin(v*math.pi)
   if side=='l':leftx,leftz=spread+x,z
   else:rightx,rightz=-spread+x,z
 two('thigh_l','calf_l',(leftx,lefty,leftz),(.30,-.8,.60+hop))
 two('thigh_r','calf_r',(rightx,righty,rightz),(-.30,-.8,.60+hop))
 for side in ['l','r']:
  foot=p['foot_'+side];foot.matrix=Matrix.Translation(foot.head)@REST['foot_'+side].to_3x3().to_4x4()
 bpy.context.view_layer.update()
 hand('r',ball,fd,pn)
 if kind=='Shoot':hand('l',other,(0,0,1),(-1,0,0))
 else:hand('l',other,fd,(-pn[0],pn[1],pn[2]))
 # Athletic relaxed fingers curve around the ball, using all 30 real finger joints.
 for pb in p:
  if any(pb.name.startswith(a) for a in ['index_','middle_','ring_','pinky_']):
   angle=.14 if kind in ['Run','Defend','Shuffle'] else .25
   if '_03_' in pb.name:angle*=.5
   pb.rotation_quaternion=Euler((angle,0,0),'XYZ').to_quaternion()
 bpy.context.view_layer.update()

DURATIONS={'Idle':48,'Run':20,'RunDribble':20,'IdleDribble':24,'Defend':32,'Shuffle':24,'Crossover':24,'Pass':24,'Catch':20,'Shoot':24,'Jump':24,'Dunk':24,'Land':18,'Rebound':26,'Celebrate':32}
for name,frames in DURATIONS.items():
 rig.animation_data_create();act=bpy.data.actions.new(name);rig.animation_data.action=act;act.use_fake_user=True
 for f in range(frames+1):
  scene.frame_set(f);pose(name,f/frames)
  for pb in rig.pose.bones:
   pb.keyframe_insert('rotation_quaternion',frame=f,group=pb.name);pb.keyframe_insert('location',frame=f,group=pb.name)
 print('ANIMATION',name,frames,flush=True)
rig.animation_data.action=None;reset_pose()
# All pieces except optional hair are one draw call. Preserve face morphs on the main body.
active(body)
for o in [jersey,shorts,socks,shoes,eyes,brows]:o.select_set(True)
bpy.ops.object.join();body.name='AthleteBody'
# Number plates are small cloth decals bound to upper torso, separated for team typography.
def number(name,back):
 y=.145 if back else -.183;z=1.345;w=.16;h=.18
 me=bpy.data.meshes.new(name);me.from_pydata([(-w/2,y,z-h/2),(w/2,y,z-h/2),(w/2,y,z+h/2),(-w/2,y,z+h/2)],[],[(3,2,1,0) if back else (0,1,2,3)])
 uv=me.uv_layers.new(name='UVMap')
 for li,loop in enumerate(me.loops):
  co=me.vertices[loop.vertex_index].co;uv.data[li].uv=((.5-co.x/w) if back else (.5+co.x/w),.5+(co.z-z)/h)
 o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.parent=rig
 vg=o.vertex_groups.new(name='spine_02');vg.add(range(4),1,'REPLACE');mod=o.modifiers.new('Armature','ARMATURE');mod.object=rig
 o.data.materials.append(material(name,(1,1,1)))
 return o
numbers=[number('NumberFront',False),number('NumberBack',True)]
# Save editable authored asset before region conversion for QA and future art work.
os.makedirs(OUT,exist_ok=True);os.makedirs(os.path.join(HERE,'../work/athlete'),exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,'../work/athlete/adult-athlete-authored.blend'))
player_meshes=[body]+hair+numbers
for o in [body]+hair:regionize(o)
active(rig)
for o in player_meshes:o.select_set(True)
scene.frame_start=0;scene.frame_end=48
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'baller.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_vertex_color='ACTIVE',export_force_sampling=True,export_optimize_animation_size=True,export_morph=True)
# Static crowd LOD from the same continuous anatomy, baked in five natural body poses.
# 15 instanced batches; ~1,000 triangles per fan, no runtime skeleton on crowd.
for o in numbers:o.hide_render=True
fanobjs=[]
for pn in ['Sit','Clap','Card','Cheer','Stand']:
 pose({'Cheer':'Celebrate','Stand':'Idle'}.get(pn,pn),.33)
 for style,ho in [('Short',hair[0]),('Afro',hair[1]),('Cap',headband)]:
  deps=bpy.context.evaluated_depsgraph_get();parts=[]
  for src in [body,ho]:
   me=bpy.data.meshes.new_from_object(src.evaluated_get(deps));o=bpy.data.objects.new('CrowdPart',me);scene.collection.objects.link(o);o.matrix_world=src.matrix_world;parts.append(o)
  active(parts[0]);parts[1].select_set(True);bpy.ops.object.join();o=parts[0];o.name='Fan_'+pn+'_'+style
  # Convert original region codes before collapse; RGB red indexes the crowd palette.
  a=o.data.color_attributes.get('Region')
  if a:
   for c in a.data:
    r=int(c.color[0]*16);fr={0:0,1:1,2:1,3:2,4:2,5:4,6:7,7:5,8:6,9:3}.get(r,0);c.color=((fr+.5)/8,c.color[1],0,1)
  o.data.materials.clear();o.data.materials.append(MATS[0])
  for poly in o.data.polygons:poly.material_index=0
  dec=o.modifiers.new('Crowd LOD','DECIMATE');dec.ratio=.04;dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
  # Ground standing soles; seated origin is the seat-contact point at pelvis.
  offset=3.12 if pn in ['Sit','Clap','Card'] else min((o.matrix_world@v.co).z for v in o.data.vertices)
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  for v in o.data.vertices:v.co.z-=offset
  fanobjs.append(o)
active(fanobjs[0])
for o in fanobjs:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'fans.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_skins=False,export_vertex_color='ACTIVE')
# Mesh and socket data are measurable, useful to the browser integration and QA.
reset_pose();pose('Dunk',.75)
report={'source':'MakeHuman continuous hm08 mesh / MPFB game_engine rig','heightFeet':6.35,'bones':len(rig.data.bones),'clips':DURATIONS,'meshes':{},'dunkGripWorldFeet':list(rig.matrix_world@rig.pose.bones['ballGripR'].head),'scale':SCALE}
for o in player_meshes:
 o.data.calc_loop_triangles();report['meshes'][o.name]={'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'morphs':[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else []}
report['fans']={o.name:len(o.data.polygons) for o in fanobjs}
json.dump(report,open(os.path.join(HERE,'../work/athlete/asset-report.json'),'w'),indent=2)
print(json.dumps(report),flush=True)
if PREVIEW:
 # Render the actual same authored mesh/rig in two animation contact poses.
 os.makedirs(PREVIEW,exist_ok=True)
 for o in fanobjs:bpy.data.objects.remove(o,do_unlink=True)
 for o in player_meshes:o.hide_render=o in hair[1:] or o in numbers
 # Restore preview materials from vertex palette without changing GLB.
 for o in [body,hair[0]]:
  attr=o.data.color_attributes['Region'];o.data.materials.clear()
  for m in MATS:o.data.materials.append(m)
  for p in o.data.polygons:p.material_index=min(9,int(attr.data[p.loop_start].color[0]*16))
 scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True;scene.render.resolution_x=1000;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
 scene.world=bpy.data.worlds.new('Athlete QA world');scene.world.color=(.16,.16,.16);scene.view_settings.view_transform='AgX'
 bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.data.materials.append(material('Floor',(.08,.105,.1)))
 def point(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
 for loc,power,size in [((-6,-9,13),1400,7),((6,3,10),1800,5),((5,-5,5),500,5)]:
  bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size;point(l,(0,0,3))
 bpy.ops.object.camera_add(location=(7,-15,6));cam=bpy.context.object;cam.data.lens=63;point(cam,(0,0,3.3));scene.camera=cam
 for nm,t in [('IdleDribble',.5),('Shoot',.5833),('Defend',.33)]:
  pose(nm,t);scene.render.filepath=os.path.join(PREVIEW,'athlete-'+nm.lower()+'.png');bpy.ops.render.render(write_still=True)
print('ADULT_ATHLETES_EXPORTED',flush=True)
