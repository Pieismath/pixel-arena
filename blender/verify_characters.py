"""Validate exported character GLBs, run from the repository root with Python 3."""
import json,struct,math
from pathlib import Path
def load(p):
 d=Path(p).read_bytes();n=struct.unpack_from('<I',d,12)[0];j=json.loads(d[20:20+n]);return j,d[28+n:]
def acc(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];fmt={5126:'f',5123:'H',5121:'B',5125:'I'}[a['componentType']];k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];sz=struct.calcsize(fmt)*k;stride=v.get('byteStride',sz);off=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+fmt*k,b,off+r*stride) for r in range(a['count'])]
j,b=load('public/models/baller.glb');ns=[n.get('name','') for n in j['nodes']];assert all(n in ns for n in ['ballGripR','ballGripL'])
req=['Idle','Run','RunDribble','IdleDribble','Defend','Shuffle','Crossover','Pass','Catch','Shoot','Jump','Dunk','Land','Rebound','Celebrate'];assert set(req)<={a['name'] for a in j['animations']}
count=0;worst=0
for mesh in j['meshes']:
 for p in mesh['primitives']:
  if 'WEIGHTS_0' in p['attributes']:
   for w in acc(j,b,p['attributes']['WEIGHTS_0']):
    assert all(math.isfinite(x) and x>=0 for x in w)
    err=abs(sum(w)-1);worst=max(worst,err);assert err<.001
    count+=1
  assert 'TEXCOORD_0' in p['attributes']
print('PASS athlete:',len(j['skins'][0]['joints']),'joints;',len(req),'clips;',count,'weightedvertices; maximum weight normalization error',worst)
j,b=load('public/models/fans.glb');assert len(j['meshes'])==15
assert all(len(m['primitives'])==1 for m in j['meshes'])
assert not j.get('skins')
print('PASS crowd: 15 baked pose/hair meshes, single primitive each; no live skeleton')
