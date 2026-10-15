/** Mathematical projection of actual GameSim trajectories through the running camera function.
 * No browser, GPU, depth/occlusion, or physical phone timing is claimed by this test. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {build} from 'rolldown';
import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const context=new Proxy({},{get(_,k){if(k==='measureText')return s=>({width:s.length*20});if(k.includes?.('Gradient'))return()=>({addColorStop(){}});return()=>{};},set(){return true;}});
globalThis.document={createElement:()=>({getContext:()=>context}),createElementNS:()=>({addEventListener(){},removeEventListener(){}})};
await build({plugins:[{name:'test-base-url',transform:code=>code.replaceAll('import.meta.env.BASE_URL','"/"')}],input:'src/world/players.ts',external:id=>id==='three'||id.startsWith('three/'),output:{file:'work/camera-test-game.mjs',format:'esm'}});
await build({plugins:[{name:'test-base-url',transform:code=>code.replaceAll('import.meta.env.BASE_URL','"/"')}],input:'src/render/camera-framing.ts',external:['three'],output:{file:'work/camera-test-framing.mjs',format:'esm'}});
const{GameSim}=await import('../work/camera-test-game.mjs');const{actionFraming,overviewFraming}=await import('../work/camera-test-framing.mjs');
const bytes=fs.readFileSync('public/models/baller.glb');const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const game=new GameSim(gltf);const views=[];
for(const[name,aspect,fov]of[['desktop',1280/720,45],['portrait',390/844,60],['narrow-phone',360/800,60]])for(const mode of['overview','courtside']) {
 const camera=new T.PerspectiveCamera(fov,aspect,1,3200);const shot=name==='desktop'?{camera:new T.Vector3(40,52,70),target:new T.Vector3(0,3,-4)}:overviewFraming(aspect,fov);
 camera.position.copy(shot.camera);const target=shot.target.clone();camera.lookAt(target);camera.updateMatrixWorld();views.push({name,mode,camera,target,outside:0,nearEdge:0,examples:[],maximumAbsX:0,maximumAbsY:0});
}
for(let frame=0;frame<7200;frame++) {
 game.update(1/60,frame/60);const ball=game.ballPosition.clone();
 for(const view of views) {
  const{camera,target}=view;
  if(view.mode==='courtside') {const shot=actionFraming(game.cinematicTarget,ball,game.attackingDirection,game.cinematicMode==='dunk',camera.aspect,camera.fov);camera.position.lerp(shot.camera,1-Math.exp(-4/60));target.lerp(shot.target,1-Math.exp(-6/60));}
  if(view.mode!=='courtside' && camera.position.y<=84){camera.position.x=T.MathUtils.clamp(camera.position.x,-72,76);camera.position.z=T.MathUtils.clamp(camera.position.z,-78,76);camera.position.y=Math.max(6,camera.position.y);}
  target.x=T.MathUtils.clamp(target.x,-105,105);target.y=T.MathUtils.clamp(target.y,0,110);target.z=T.MathUtils.clamp(target.z,-115,115);
  camera.lookAt(target);camera.updateMatrixWorld();const p=ball.clone().project(camera);
  if(frame>120){view.maximumAbsX=Math.max(view.maximumAbsX,Math.abs(p.x));view.maximumAbsY=Math.max(view.maximumAbsY,Math.abs(p.y));if(Math.max(Math.abs(p.x),Math.abs(p.y))>.95)view.nearEdge++;if(Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))>1){view.outside++;if(view.examples.length<5)view.examples.push({frame,time:frame/60,state:game.qaSnapshot(),camera:camera.position.toArray(),target:target.toArray(),ndc:p.toArray()});}}
 }
}
const synthetic=[];
for(const[aspect,fov]of[[390/844,60],[360/800,60],[1280/720,45]])for(const[subject,ball]of[
 [new T.Vector3(-40,0,0),new T.Vector3(40,6,0)],
 [new T.Vector3(40,3.7,-22),new T.Vector3(-40,6,22)],
 [new T.Vector3(-42,3.7,20),new T.Vector3(0,35,0)],
]) {
 const shot=actionFraming(subject,ball,1,false,aspect,fov),camera=new T.PerspectiveCamera(fov,aspect,1,3200);
 camera.position.copy(shot.camera);camera.lookAt(shot.target);camera.updateMatrixWorld();
 const endpoints=[subject,ball].map(p=>p.clone().project(camera).toArray());
 synthetic.push({aspect,fov,subject:subject.toArray(),ball:ball.toArray(),camera:camera.position.toArray(),endpoints});
 for(const p of endpoints)assert(Math.abs(p[0])<.95&&Math.abs(p[1])<.95&&Math.abs(p[2])<1,'Extreme pass left fitted camera');
}
const result={kind:'Actual camera-framing.ts and current GLB/GameSim; 120s60Hz, initial2s excluded; no rendered occlusion or device FPS measurement',sampledFrames:7079,synthetic,views:views.map(({camera,target,...r})=>r)};
fs.writeFileSync('tests/evidence/camera-framing-after.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
for(const view of views)assert.equal(view.outside,0,`${view.name}/${view.mode}: ball outside frustum`);
