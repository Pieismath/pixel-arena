"""Validate exported character GLBs, run from the repository root with Python 3."""
import json,struct,math,sys
from pathlib import Path
ROOT=Path(sys.argv[1]) if len(sys.argv)>1 else Path('public/models')
def load(p):
 d=Path(p).read_bytes();n=struct.unpack_from('<I',d,12)[0];j=json.loads(d[20:20+n]);return j,d[28+n:]
def acc(j,b,i):
 a=j['accessors'][i];fmt={5126:'f',5123:'H',5121:'B',5125:'I'}[a['componentType']];k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];sz=struct.calcsize(fmt)*k
 rows=[(0,)*k for _ in range(a['count'])]
 if 'bufferView' in a:
  v=j['bufferViews'][a['bufferView']];stride=v.get('byteStride',sz);off=v.get('byteOffset',0)+a.get('byteOffset',0)
  rows=[struct.unpack_from('<'+fmt*k,b,off+r*stride) for r in range(a['count'])]
 if 'sparse' in a:
  sp=a['sparse'];inds=sp['indices'];iv=j['bufferViews'][inds['bufferView']];ifs={5121:'B',5123:'H',5125:'I'}[inds['componentType']];isz=struct.calcsize(ifs);io=iv.get('byteOffset',0)+inds.get('byteOffset',0)
  vals=sp['values'];vv=j['bufferViews'][vals['bufferView']];vo=vv.get('byteOffset',0)+vals.get('byteOffset',0)
  for r in range(sp['count']):
   idx=struct.unpack_from('<'+ifs,b,io+r*isz)[0];rows[idx]=struct.unpack_from('<'+fmt*k,b,vo+r*sz)
 return rows
j,b=load(ROOT/'baller.glb');ns=[n.get('name','') for n in j['nodes']];assert all(n in ns for n in ['ballGripR','ballGripL'])
assert 'AthleteBody' in ns and 'VoxelAthlete' not in ns, 'Wrong character pipeline was shipped'
req=['Idle','Run','RunDribble','IdleDribble','Defend','Shuffle','Crossover','Pass','Catch','Shoot','Jump','Dunk','Land','Rebound','Celebrate'];assert set(req)<={a['name'] for a in j['animations']}
count=0;worst=0;triangles={}
for mesh in j['meshes']:
 triangles[mesh.get('name','mesh')]=sum(j['accessors'][p['indices']]['count']//3 for p in mesh['primitives'])
 for p in mesh['primitives']:
  positions=acc(j,b,p['attributes']['POSITION'])
  assert all(all(math.isfinite(v) for v in row) for row in positions)
  assert max(row[0] for row in acc(j,b,p['indices']))<len(positions)
  if 'WEIGHTS_0' in p['attributes']:
   for w in acc(j,b,p['attributes']['WEIGHTS_0']):
    assert all(math.isfinite(x) and x>=0 for x in w)
    err=abs(sum(w)-1);worst=max(worst,err);assert err<.001
    count+=1
  assert 'TEXCOORD_0' in p['attributes']
# Inspect actual GLB sparse morph accessors: shape keys must not inherit earlier
# variant coordinates or move registered eyes, brows, forehead, scalp or ears.
# glTF POSITION and sparse deltas are already exported in court feet.
morph_max={}
for mesh in j['meshes']:
 names=mesh.get('extras',{}).get('targetNames',[])
 for primitive in mesh['primitives']:
  positions=acc(j,b,primitive['attributes']['POSITION'])
  for name,target in zip(names,primitive.get('targets',[])):
   deltas=acc(j,b,target['POSITION'])
   peak=max(sum(v*v for v in row)**.5 for row in deltas);morph_max[name]=max(morph_max.get(name,0),peak)
   assert peak<.0315, (name,'excessive face deformation',peak)
   for position,delta in zip(positions,deltas):
    if position[1]>=1.87501*(6.35/2.019) or abs(position[0])>=.08201*(6.35/2.019):
     assert sum(v*v for v in delta)<1e-10, (name,'moved protected facial landmark',position,delta)
print('PASS localized Basis-derived GLB morphs:',morph_max)
print('PASS athlete:',len(j['skins'][0]['joints']),'joints;',len(req),'clips;',count,'weightedvertices; maximum weight normalization error',worst)
print('Athlete triangles by mesh:',triangles)
j,b=load(ROOT/'fans.glb');assert len(j['meshes'])==30
assert all(len(m['primitives'])==1 for m in j['meshes'])
assert not j.get('skins')
tiers={'near':[],'far':[]}
for n in j['nodes']:
 if 'mesh' not in n:continue
 name=n['name'];mesh=j['meshes'][n['mesh']]
 triangles=sum(j['accessors'][p['indices']]['count']//3 for p in mesh['primitives'])
 tiers['far' if name.startswith('FanFar_') else 'near'].append(triangles)
for pn in ['Sit','Clap','Card','Cheer','Stand']:
 for hair in ['Short','Afro','Cap']:
  assert all(any(n.get('name')==f'{prefix}_{pn}_{hair}' for n in j['nodes']) for prefix in ['Fan','FanFar'])
assert len(tiers['near'])==len(tiers['far'])==15
assert max(tiers['far'])<1500, ('Far crowd triangle budget exceeded',tiers['far'])
assert min(tiers['near'])>2700 and max(tiers['near'])<3300, ('Near crowd triangle budget exceeded',tiers['near'])
print('PASS crowd: 15 pose/hair meshes in each of two tiers; single primitive each; no live skeleton')
for tier,triangles in tiers.items():print(tier,'crowd triangles per person:',min(triangles),'–',max(triangles))
