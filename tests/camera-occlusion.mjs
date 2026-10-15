/** Actual park geometry + runtime trajectory: catches camera retreats behind solid buildings.
 * Does not replace visual inspection of alpha-tested fences, bodies, or video frames. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'rolldown';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const context=new Proxy({},{get(_,k){if(k==='measureText')return s=>({width:s.length*20});if(k.includes?.('Gradient'))return()=>({addColorStop(){}});return()=>{};},set(){return true;}});
globalThis.document={createElement:()=>({getContext:()=>context}),createElementNS:()=>({addEventListener(){},removeEventListener(){}})};
const options={plugins:[{name:'base-url',transform:code=>code.replaceAll('import.meta.env.BASE_URL','"/"')}],external:id=>id==='three'||id.startsWith('three/')};
await build({...options,input:'src/world/players.ts',output:{file:'work/occlusion-game.mjs',format:'esm'}});
await build({...options,input:'src/render/camera-framing.ts',output:{file:'work/occlusion-framing.mjs',format:'esm'}});
const {GameSim}=await import('../work/occlusion-game.mjs');const {actionFraming}=await import('../work/occlusion-framing.mjs');
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
async function glb(path){const b=fs.readFileSync(path);return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const [athlete,park]=await Promise.all([glb('public/models/baller.glb'),glb('public/models/park.glb')]);park.scene.updateMatrixWorld(true);
const buildings=[];park.scene.traverse(o=>{if(o.isMesh&&/^(Facade|Roof|Cornice|Limestone|InteriorShadow|InteriorPlaster|WindowFrame|DoorWood|ShopInterior|ShopShelf)/.test(o.material.name)){o.geometry.computeBoundingBox();buildings.push(o);}});
const game=new GameSim(athlete);const ray=new T.Raycaster();const result=[];
const views=[['desktop',1280/720,45],['portrait',390/844,60]].map(([name,aspect,fov])=>({name,aspect,fov,position:new T.Vector3(40,52,70),checks:0,blocked:0,examples:[]}));
for(let frame=0;frame<7200;frame++){
 game.update(1/60,frame/60);const ball=game.ballPosition.clone();
 for(const view of views){const shot=actionFraming(game.cinematicTarget,ball,game.attackingDirection,game.cinematicMode==='dunk',view.aspect,view.fov);view.position.lerp(shot.camera,1-Math.exp(-4/60));
  if(frame<120||frame%12)continue;
  view.checks++;const direction=ball.clone().sub(view.position);ray.set(view.position,direction.clone().normalize());ray.near=.1;ray.far=direction.length()-.5;
  const hit=ray.intersectObjects(buildings,false)[0];if(hit){view.blocked++;if(view.examples.length<5)view.examples.push({time:frame/60,mesh:hit.object.name,point:hit.point.toArray(),camera:view.position.toArray(),ball:ball.toArray()});}
 }
}
for(const view of views){const {position,...record}=view;result.push(record);}
const report={method:'120s runtime trajectory; 60Hz camera integration, sampled rays5Hz against opaque architectural meshes in actual park.glb; no GPU or phone FPS claim',views:result};
fs.writeFileSync('tests/evidence/camera-occlusion-after.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
for(const view of result)assert.equal(view.blocked,0,`${view.name}: camera behind opaque architecture`);
