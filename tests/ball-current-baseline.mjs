/** Fresh pre-change reproduction using a saved CURRENT runtime, not the historical bug reconstruction.
 * No browser/GPU is used: camera projection is mathematical; occlusion remains a capture check. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'rolldown';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const context = new Proxy({}, {get(_,k) {if(k==='measureText') return text=>({width:text.length*20}); if(k==='createLinearGradient'||k==='createRadialGradient')return()=>({addColorStop(){}});return()=>{};},set(){return true;}});
globalThis.document={createElement:()=>({getContext:()=>context}),createElementNS:()=>({addEventListener(){},removeEventListener(){}})};
globalThis.ProgressEvent=class{constructor(type,data){this.type=type;Object.assign(this,data);}};
const current=process.argv.includes('--current');
const baselineCommit='6906d600daef31be80655c2d011eee9616781196';
const folder='work/ball-current-before';
if(!current) {
 for(const file of ['src/world/players.ts','src/world/ball.ts','src/world/signs.ts','src/world/textures.ts','src/world/park-layout.json','src/config.ts','src/data/random.ts','src/data/types.ts','public/models/baller.glb']) {
  const target=`${folder}/${file}`;fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,execFileSync('git',['show',`${baselineCommit}:${file}`],{maxBuffer:16*1024*1024}));
 }
}
await build({plugins:[{name:'test-base-url',transform:code=>code.replaceAll('import.meta.env.BASE_URL','"/"')}],input:current?'src/world/players.ts':`${folder}/src/world/players.ts`,external:id=>id==='three'||id.startsWith('three/'),output:{file:current?'work/ball-current-test.mjs':`${folder}/game.mjs`,format:'esm'}});
const {GameSim}=await import(current?'../work/ball-current-test.mjs':'../work/ball-current-before/game.mjs');
const bytes=fs.readFileSync(current?'public/models/baller.glb':`${folder}/public/models/baller.glb`);
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const cameras=[['overview',45,new THREE.Vector3(40,52,70),new THREE.Vector3(0,3,-4)],['portrait',60,new THREE.Vector3(66,70,84),new THREE.Vector3(0,2,-4)]].map(([name,fov,pos,target])=>{const camera=new THREE.PerspectiveCamera(fov,name==='portrait'?390/844:1280/720,1,3200);camera.position.copy(pos);camera.lookAt(target);camera.updateMatrixWorld();return{name,camera,outside:0};});
let globalFrame=0;
function trace(game, seconds, output, resets=false) {
 let prev=game.qaSnapshot(), prior=new THREE.Vector3(...prev.position);
 for(let i=0;i<Math.ceil(seconds*60);i++) {
  game.update(1/60,i/60);const state=game.qaSnapshot(),p=new THREE.Vector3(...state.position),step=p.distanceTo(prior);
  output.frames++;output.maximumStep=Math.max(output.maximumStep,step);output.maximumSpeed=Math.max(output.maximumSpeed,step*60);
  if(!state.visible||!state.attached||state.ballCount!==1||!p.toArray().every(Number.isFinite))output.invalid.push({frame:globalFrame,state});
  if(step>85/60)output.largeSteps.push({frame:globalFrame,time:state.time,step,from:prev.position,to:state.position,previous:prev.lastTransition,transition:state.lastTransition,mode:state.mode,phase:state.phase});
  if(prev.mode==='loose' && state.mode==='held' && prev.position[1]>7.1*game.holder.height)output.unreachablePickups.push({fromHeight:prev.position[1],reach:7.1*game.holder.height,time:state.time});
  if(state.transitionCount!==prev.transitionCount)output.transitions.push({frame:globalFrame,time:state.time,transition:state.lastTransition,position:state.position});
  for(const c of cameras){const projected=p.clone().project(c.camera);if(Math.abs(projected.x)>1||Math.abs(projected.y)>1||Math.abs(projected.z)>1)c.outside++;}
  prior.copy(p);prev=state;globalFrame++;
 }
 return game.qaSnapshot();
}
const makeReport=name=>({name,frames:0,maximumStep:0,maximumSpeed:0,invalid:[],largeSteps:[],transitions:[],unreachablePickups:[]});
const autoplay=makeReport('600 seconds current shipped autoplay');trace(new GameSim(gltf),600,autoplay);
const cases=[];
for(const requested of ['held','pass-before-release','pass-flight','shot-before-release','shot-flight','dunk-before-release','dunk-flight','score-flight','rebound-flight','loose']) {
 const game=new GameSim(gltf),report=makeReport(requested);
 if(requested.startsWith('pass'))game.runQaScenario('pass');
 else if(requested.startsWith('shot')||requested==='score-flight')game.runQaScenario('shot-make');
 else if(requested==='rebound-flight'||requested==='loose')game.runQaScenario('shot-miss');
 else if(requested.startsWith('dunk'))game.runQaScenario('dunk');
 for(let f=0;f<1800;f++) {
  const s=game.qaSnapshot();
  const match=requested==='held'?s.mode==='held':requested==='loose'?s.mode==='loose':requested==='score-flight'?s.flight?.purpose==='score':requested==='rebound-flight'?s.flight?.purpose==='rebound':requested.includes('before-release')?s.flight?.purpose===requested.split('-')[0]&&!s.flight.released:s.flight?.purpose===requested.split('-')[0]&&s.flight.released&&(requested.startsWith('shot')?s.position[1]>22:true);
  if(match){report.beforeReset=s;break;}
  game.update(1/60,f/60);
 }
 if(!report.beforeReset){report.unreached=true;cases.push(report);continue;}
 game.runQaScenario('reset');report.atReset=game.qaSnapshot();
 if(current){assert.deepEqual(report.atReset.position,report.beforeReset.position,`${requested}: reset relocated ball`);assert.deepEqual(report.atReset.score,[0,0]);assert.equal(report.atReset.mode,'loose');assert.equal(game.clock,720);}
 trace(game,8,report,true);cases.push(report);
}
if(current)for(const r of [autoplay,...cases]){assert(!r.unreached,`${r.name}: untested state`);assert.equal(r.invalid.length,0,`${r.name}: lost mesh`);assert.equal(r.largeSteps.length,0,`${r.name}: discontinuous ball`);assert.equal(r.unreachablePickups.length,0,`${r.name}: unreachable pickup`);}
const result={baselineCommit,current,kind:'Fresh current-build baseline; actual production GameSim and GLB, no rendering or GPU. Camera projection cannot detect occlusion.',created:new Date().toISOString(),assetSha256:createHash('sha256').update(bytes).digest('hex'),sourceSha256:createHash('sha256').update(fs.readFileSync(current?'src/world/players.ts':`${folder}/src/world/players.ts`)).digest('hex'),autoplay,cases,legacyPresetProjection:cameras.map(c=>({name:c.name,outsideFrames:c.outside,totalFrames:globalFrame}))};
fs.writeFileSync(current?'tests/evidence/ball-current-after.json':'tests/evidence/ball-current-before.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({current,assetSha256:result.assetSha256,autoplay:{frames:autoplay.frames,maximumStep:autoplay.maximumStep,invalid:autoplay.invalid.length,unreachablePickups:autoplay.unreachablePickups},cases:cases.map(c=>({name:c.name,maximumStep:c.maximumStep,invalid:c.invalid.length,unreachablePickups:c.unreachablePickups,unreached:c.unreached})),legacyPresetProjection:result.legacyPresetProjection},null,2));
