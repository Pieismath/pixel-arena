/** Numerical contact sampling using the current rig; inspect recordings as a separate visual test. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {build} from 'rolldown';import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const context=new Proxy({},{get(_,k){if(k==='measureText')return s=>({width:s.length*20});if(k.includes?.('Gradient'))return()=>({addColorStop(){}});return()=>{};},set(){return true;}});
globalThis.document={createElement:()=>({getContext:()=>context}),createElementNS:()=>({addEventListener(){},removeEventListener(){}})};
await build({plugins:[{name:'test-base-url',transform:code=>code.replaceAll('import.meta.env.BASE_URL','"/"')}],input:'src/world/players.ts',external:id=>id==='three'||id.startsWith('three/'),output:{file:'work/motion-contact-game.mjs',format:'esm'}});
const{GameSim}=await import('../work/motion-contact-game.mjs');const bytes=fs.readFileSync('public/models/baller.glb');const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const game=new GameSim(gltf),feet=[],core=[],dribbleContacts=[];let previous=[];let maxHandError=0,calibrationClamps=0,plantCount=0;
for(let frame=0;frame<7200;frame++) {
 game.update(1/60,frame/60);const next=[];
 for(let i=0;i<game.players.length;i++) {
  const p=game.players[i],action=p.actions[p.current],phase=action.time/action.getClip().duration,points=p.feet.map(f=>f.getWorldPosition(new T.Vector3()));next[i]={clip:p.current,phase,points,heading:p.heading};const old=previous[i];
  if(old&&old.clip===p.current&&['Run','RunDribble'].includes(p.current)) {
   const f=phase>.05&&phase<.45?0:phase>.55&&phase<.95?1:-1;
   if(f>=0){const sample={frame,player:i,clip:p.current,phase,velocity:points[f].distanceTo(old.points[f])*60,speed:p.speed,timeScale:action.timeScale,headingDelta:p.heading-old.heading};feet.push(sample);if((phase%0.5)>.1&&(phase%0.5)<.42&&action.getEffectiveWeight()>.99)core.push(sample);}
   if(Math.abs(action.timeScale-p.speed/(6.34121*p.depth))>.02&&p.speed>1)calibrationClamps++;
  }
  plantCount+=p.legs.filter(l=>l.locked).length;
 }
 const holder=game.holder;
 if(holder?.dribbleActive&&game.ballState.mode.gatherAge>game.ballState.mode.gatherDuration){
  const phase=holder.dribbleAction.time/holder.dribbleAction.getClip().duration;
  if(Math.abs(phase-.5)<1e-5){const hand=holder.hand.getWorldPosition(new T.Vector3()),error=hand.distanceTo(game.ballPosition);maxHandError=Math.max(maxHandError,error);dribbleContacts.push({frame,error,clip:holder.current,travelSpeed:holder.speed});}
 }
 previous=next;
}
function stats(rows){rows.sort((a,b)=>a.velocity-b.velocity);return{samples:rows.length,median:rows[Math.floor(rows.length*.5)],p95:rows[Math.floor(rows.length*.95)],worst:rows.at(-1)}}
const result={kind:'Current GLB/skeleton/mixer and runtime IK over120s60Hz autoplay. Foot velocity is measured at authored stance bones, not shoe-surface penetration. Texture decode stubbed; no rendering or device FPS.',broadStance:stats(feet),fullyWeightedStance:stats(core),plantFrames:plantCount,speedCalibrationMismatches:calibrationClamps,dribble:{contacts:dribbleContacts.length,maximumPalmErrorFeet:maxHandError,samples:dribbleContacts.slice(0,8),periodSeconds:1}};
fs.writeFileSync('tests/evidence/motion-contact-after.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
assert(dribbleContacts.length>20,'Did not sample enough actual dribble hand contacts');assert(maxHandError<.001,'Ball does not meet palm at dribble contact');assert.equal(calibrationClamps,0,'Sprint clip playback clamped below actual travel speed');
