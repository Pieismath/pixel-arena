"""Original faceted basketball cast. Shaped meshes retain the tested basketball skeleton/socket clips.
Run Blender --background --python blender/build_voxel_characters.py
The faceted geometry and pixel faces are original work; reference images are not embedded.
"""
import bpy, math, os, json, random
from mathutils import Vector, Matrix, Euler, Quaternion
HERE=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.join(HERE,'../public/models')
os.makedirs(os.path.join(HERE,'../work/voxel'),exist_ok=True)
SOURCE=os.path.join(HERE,'sources/basketball-motion.blend')
if not os.path.exists(SOURCE):
 bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE,'../work/athlete/adult-athlete-authored.blend'))
 for o in list(bpy.data.objects):
  if o.type!='ARMATURE':bpy.data.objects.remove(o,do_unlink=True)
 bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
else:bpy.ops.wm.open_mainfile(filepath=SOURCE)
scene=bpy.context.scene;rig=bpy.data.objects['AthleteRig'];rig.animation_data.action=None
SCALE=6.35/2.019;RADIUS=.40/SCALE
REST={b.name:b.matrix_local.copy() for b in rig.data.bones}
PALM={};FINGER={};NORMAL={}
for side in ['l','r']:
 hn='hand.'+side.upper();w=rig.data.bones[hn].head_local
 finger=(rig.data.bones['middle_01_'+side].head_local-w).normalized()
 across=rig.data.bones['index_01_'+side].head_local-rig.data.bones['pinky_01_'+side].head_local
 norm=across.cross(finger).normalized()
 if norm.y<0:norm=-norm
 PALM[side]=(rig.data.bones['middle_01_'+side].head_local-w)*.57;FINGER[side]=finger;NORMAL[side]=norm
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
  hip=-.13+.018*math.cos(t*math.tau*2);lean=.085
  # Linear backward ground travel is the stance. The return lifts clear of the court.
  for side,phase in [('l',t),('r',(t+.5)%1)]:
   u=phase%1
   if u<.5:y=-.42+1.68*u;z=.088
   else:v=(u-.5)*2;y=.42-.84*(v*v*(3-2*v));z=.088+.16*math.sin(v*math.pi)
   if side=='l':lefty,leftz=y,z
   else:righty,rightz=y,z
  ball=Vector((-.30,-.29+.10*s,1.21));other=Vector((.29,-.27-.20*s,1.21))
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
 p['spine_01'].rotation_quaternion=Euler((lean,.025*s if kind in ['Run','RunDribble'] else 0,.065*s if kind in ['Run','RunDribble'] else .018*s if kind=='Idle' else 0),'XYZ').to_quaternion()
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

reset_pose()
for o in list(bpy.data.objects):
 if o.type=='MESH':bpy.data.objects.remove(o,do_unlink=True)
def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
palette=bpy.data.materials.new('VoxelPalette');palette.diffuse_color=(1,1,1,1)
class Blocks:
 def __init__(self,name):self.name=name;self.verts=[];self.faces=[];self.regions=[];self.weights=[]
 def box(self,c,size,region,bone='head',shade=1,rot=None):
  # Three chamfered octagonal rings: broad planes with sculpted corners, not cubes.
  c=Vector(c);rot=rot or Matrix.Identity(3);x,y,z=[v/2 for v in size]
  bevel=min(x,y,z)*.23 if min(size)>.035 else 0
  if bevel==0:
   rings=[(-z,x,y),(z,x,y)]
  else:rings=[(-z,x-bevel,y-bevel),(-z+bevel,x,y),(z-bevel,x,y),(z,x-bevel,y-bevel)]
  start=len(self.verts)
  for zz,xx,yy in rings:
   cut=min(xx,yy)*.26
   for vx,vy in [(-xx+cut,-yy),(xx-cut,-yy),(xx,-yy+cut),(xx,yy-cut),(xx-cut,yy),(-xx+cut,yy),(-xx,yy-cut),(-xx,-yy+cut)]:
    self.verts.append(c+rot@Vector((vx,vy,zz)));self.weights.append(bone)
  self.faces.append(tuple(start+i for i in reversed(range(8))));self.regions.append((region,shade))
  for j in range(len(rings)-1):
   for i in range(8):
    self.faces.append((start+j*8+i,start+j*8+(i+1)%8,start+(j+1)*8+(i+1)%8,start+(j+1)*8+i));self.regions.append((region,shade))
  self.faces.append(tuple(start+(len(rings)-1)*8+i for i in range(8)));self.regions.append((region,shade))
 def limb(self,bone,start,end,width,depth,reg,shade=1):
  b=rig.data.bones[bone];a=b.head_local.lerp(b.tail_local,start);z=b.head_local.lerp(b.tail_local,end);d=z-a
  # Rounded, tapered eight-sided limbs; fingers retain small readable facets.
  basis=d.to_track_quat('Z','Y').to_matrix();base=len(self.verts)
  for t,r in [(0,.78),(.18,1),(.72,.92),(1,.72)]:
   for i in range(8):
    angle=math.tau*i/8+math.pi/8
    self.verts.append(a+d*t+basis@Vector((math.cos(angle)*width*r*.5,math.sin(angle)*depth*r*.5,0)));self.weights.append(bone)
  self.faces.append(tuple(base+i for i in reversed(range(8))));self.regions.append((reg,shade))
  for j in range(3):
   for i in range(8):self.faces.append((base+j*8+i,base+j*8+(i+1)%8,base+(j+1)*8+(i+1)%8,base+(j+1)*8+i));self.regions.append((reg,shade))
  self.faces.append(tuple(base+24+i for i in range(8)));self.regions.append((reg,shade))
 def jersey(self):
  base=len(self.verts)
  for z,w,d,bone in [(1.115,.195,.140,'pelvis'),(1.22,.183,.143,'spine_02'),(1.38,.220,.153,'spine_02'),(1.52,.244,.142,'spine_03'),(1.595,.176,.107,'spine_03')]:
   for x,y in [(-.74,-1),(.74,-1),(1,-.65),(1,.65),(.74,1),(-.74,1),(-1,.65),(-1,-.65)]:
    self.verts.append(Vector((x*w,y*d-.008,z)));self.weights.append(bone)
  for j in range(4):
   for i in range(8):self.faces.append((base+j*8+i,base+j*8+(i+1)%8,base+(j+1)*8+(i+1)%8,base+(j+1)*8+i));self.regions.append((1,.92 if i in [2,6] else 1))
  self.faces.append(tuple(base+32+i for i in range(8)));self.regions.append((1,1))
 def mesh(self):
  for i,bone in enumerate(self.weights):
   if bone=='head':
    v=self.verts[i];v.x*=.82;v.y*=.92;v.z=1.85+(v.z-1.85)*.89
  m=bpy.data.meshes.new(self.name);m.from_pydata(self.verts,[],self.faces);m.update()
  o=bpy.data.objects.new(self.name,m);scene.collection.objects.link(o);o.parent=rig
  m.materials.append(palette);attr=m.color_attributes.new(name='Region',type='FLOAT_COLOR',domain='CORNER')
  uv=m.uv_layers.new(name='UVMap')
  for p,(reg,shade) in zip(m.polygons,self.regions):
   p.use_smooth=False
   for li in p.loop_indices:
    attr.data[li].color=((reg+.5)/16,shade,0,1)
    co=m.vertices[m.loops[li].vertex_index].co;uv.data[li].uv=(co.x,co.z)
  for bone in set(self.weights):
   vg=o.vertex_groups.new(name=bone);vg.add([i for i,b in enumerate(self.weights) if b==bone],1,'REPLACE')
  mod=o.modifiers.new('Basketball rig','ARMATURE');mod.object=rig
  m.color_attributes.active_color=attr
  return o
b=Blocks('VoxelAthlete')
# Stepped jersey: flat planes, pixel seam panels, recognizable athletic silhouette.
b.jersey()
b.box((0,.012,1.615),(.135,.135,.14),0,'neck_01')
for s in [-1,1]:
 b.box((s*.205,-.172,1.45),(.036,.014,.25),2,'spine_03')
 b.box((s*.077,-.169,1.57),(.095,.016,.027),2,'spine_03')
 b.box((s*.04,-.169,1.541),(.043,.017,.03),2,'spine_03')
 b.box((s*.166,-.164,1.26),(.034,.016,.11),1,'spine_02',.76)
 b.box((s*.094,-.171,1.19),(.09,.019,.029),2,'spine_02')
b.box((0,-.005,1.129),(.414,.29,.038),2,'pelvis')
# Broad pixel head, stepped jaw and asymmetrical face pixels.
b.box((0,-.044,1.869),(.40,.35,.345),0)
b.box((0,-.058,1.698),(.30,.30,.080),0,shade=.9)
for s in [-1,1]:
 b.box((s*.212,-.037,1.842),(.055,.10,.105),0,shade=.87)
 b.box((s*.094,-.226,1.892),(.080,.016,.032),7)
 b.box((s*.079,-.238,1.887),(.036,.013,.035),8)
 b.box((s*.086,-.228,1.945),(.115,.019,.026),9)
 b.box((s*.14,-.225,1.806),(.071,.014,.036),0,shade=1.1)
b.box((0,-.239,1.835),(.056,.064,.064),0,shade=.90)
b.box((.015,-.218,1.745),(.093,.023,.024),8)
for side,s in [('l',1),('r',-1)]:
 b.limb('upperarm_'+side,.03,.54,.16,.165,0);b.limb('upperarm_'+side,.53,1,.14,.15,0,.91)
 b.limb('lowerarm_'+side,0,.58,.13,.14,0);b.limb('lowerarm_'+side,.56,1,.11,.125,0)
 b.limb('lowerarm_'+side,.83,.99,.122,.14,2)
 # Preserve exact palm plane and socket. Small square finger segments articulate with it.
 hn='hand.'+side.upper();h=rig.data.bones[hn].head_local
 center=h+PALM[side];f=FINGER[side];n=NORMAL[side];across=f.cross(n).normalized();basis=Matrix((across,f,n)).transposed()
 b.box(center,(.10,.10,.050),0,hn,1,basis)
 for finger in ['index','middle','ring','pinky','thumb']:
  for joint in ['01','02']:
   name=finger+'_'+joint+'_'+side
   b.limb(name,0,1,.025,.027,0)
 b.limb('thigh_'+side,0,.58,.23,.265,3)
 b.limb('thigh_'+side,.57,.68,.237,.27,2)
 b.limb('thigh_'+side,.67,1,.15,.16,0)
 b.limb('calf_'+side,0,.62,.135,.15,0)
 b.limb('calf_'+side,.61,1,.14,.16,4)
 x=rig.data.bones['foot_'+side].head_local.x
 b.box((x,-.077,.066),(.185,.35,.115),5,'foot_'+side)
 b.box((x,-.081,.022),(.192,.36,.035),6,'foot_'+side)
 b.box((x,-.15,.12),(.143,.17,.045),2,'foot_'+side)
 for y in [-.10,-.13,-.16]:b.box((x,y,.145),(.09,.012,.010),6,'foot_'+side)
body=b.mesh();optional=[]
for style in ['HairBuzz','HairAfro','HairTwists','HairBeard','Headband']:
 h=Blocks(style)
 if style=='HairBeard':
  for x,z,w,ht in [(-.15,1.762,.065,.14),(.15,1.762,.065,.14),(0,1.68,.29,.075),(0,1.786,.105,.026)]:h.box((x,-.229,z),(w,.036,ht),9,shade=.9)
 elif style=='Headband':
  h.box((0,-.048,1.986),(.426,.375,.055),2)
 else:
  h.box((0,-.030,2.046),(.405,.355,.10),9,shade=.9)
  for s in [-1,1]:h.box((s*.191,.004,1.972),(.06,.29,.17),9,shade=.82)
  h.box((0,.122,1.957),(.39,.05,.20),9,shade=.76)
  if style!='HairBuzz':
   rr=random.Random(32 if style=='HairAfro' else 74)
   for ix in range(-2,3):
    for iy in range(-2,3):
     ht=rr.choice([.055,.085,.12]) if style=='HairAfro' else rr.choice([.045,.075])
     h.box((ix*.075+rr.uniform(-.012,.012),iy*.068-.025,2.079+ht/2-(abs(ix)+abs(iy))*.008),(.10,.092,ht+.025),9,shade=rr.uniform(.8,1.05),rot=Euler((rr.uniform(-.15,.15),rr.uniform(-.22,.22),rr.uniform(-.2,.2))).to_matrix())
 optional.append(h.mesh())
# Flat number plates remain editable at runtime for each fictional player.
def number(name,back):
 y=.166 if back else -.166;z=1.33;w=.16;ht=.18
 me=bpy.data.meshes.new(name);me.from_pydata([(-w/2,y,z-ht/2),(w/2,y,z-ht/2),(w/2,y,z+ht/2),(-w/2,y,z+ht/2)],[],[(3,2,1,0) if back else (0,1,2,3)])
 uv=me.uv_layers.new(name='UVMap')
 for li,loop in enumerate(me.loops):
  co=me.vertices[loop.vertex_index].co;uv.data[li].uv=((.5-co.x/w) if back else (.5+co.x/w),.5+(co.z-z)/ht)
 o=bpy.data.objects.new(name,me);scene.collection.objects.link(o);o.parent=rig
 vg=o.vertex_groups.new(name='spine_02');vg.add(range(4),1,'REPLACE');mod=o.modifiers.new('Rig','ARMATURE');mod.object=rig;me.materials.append(palette)
 return o
numbers=[number('NumberFront',False),number('NumberBack',True)]
# A shorter stride, quieter pelvis, opposing shoulder swing, and a planted stance.
# Re-author only locomotion; action release/contact timing stays unchanged.
for name in ['Run','RunDribble']:
 old=bpy.data.actions.get(name)
 if old:bpy.data.actions.remove(old)
 rig.animation_data_create();act=bpy.data.actions.new(name);rig.animation_data.action=act;act.use_fake_user=True
 for f in range(41):
  frame=f*.5;scene.frame_set(int(frame),subframe=frame%1);pose(name,f/40)
  for pb in rig.pose.bones:
   pb.keyframe_insert('rotation_quaternion',frame=frame,group=pb.name);pb.keyframe_insert('location',frame=frame,group=pb.name)
rig.animation_data.action=None;reset_pose()

active(rig)
for o in [body]+optional+numbers:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'baller.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_vertex_color='ACTIVE',export_force_sampling=True,export_optimize_animation_size=True)
fans=[]
for pn in ['Sit','Clap','Card','Cheer','Stand']:
 pose({'Cheer':'Celebrate','Stand':'Idle'}.get(pn,pn),.33)
 for style,ho in [('Short',optional[0]),('Afro',optional[1]),('Cap',optional[0])]:
  deps=bpy.context.evaluated_depsgraph_get();parts=[]
  for src in [body,ho]+([optional[-1]] if style=='Cap' else []):
   me=bpy.data.meshes.new_from_object(src.evaluated_get(deps));o=bpy.data.objects.new('Part',me);scene.collection.objects.link(o);o.matrix_world=src.matrix_world;parts.append(o)
  active(parts[0])
  for o in parts:o.select_set(True)
  bpy.ops.object.join();o=parts[0];o.name='Fan_'+pn+'_'+style
  a=o.data.color_attributes['Region']
  for c in a.data:
   r=int(c.color[0]*16);fr={0:0,1:1,2:1,3:2,4:2,5:4,6:7,7:5,8:6,9:3}.get(r,0);c.color=((fr+.5)/8,c.color[1],0,1)
  bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
  off=3.12 if pn in ['Sit','Clap','Card'] else min(v.co.z for v in o.data.vertices)
  for v in o.data.vertices:v.co.z-=off
  fans.append(o)
active(fans[0])
for o in fans:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'fans.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_skins=False,export_vertex_color='ACTIVE')
report={'style':'Original faceted geometry, tapered limbs and pixel faces; re-authored locomotion on the tested basketball skeleton','bones':len(rig.data.bones),'clips':[a.name for a in bpy.data.actions],'meshes':{}}
for o in [body]+optional:
 o.data.calc_loop_triangles();report['meshes'][o.name]=len(o.data.loop_triangles)
json.dump(report,open(os.path.join(HERE,'../work/voxel/assets.json'),'w'),indent=2)
print('VOXEL_EXPORTED',json.dumps(report),flush=True)
