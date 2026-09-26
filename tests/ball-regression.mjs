/** Run with `node tests/ball-regression.mjs`.
 * Exercises the real GLB, Three.js skeletons/mixers and production GameSim without WebGL.
 * Only Canvas2D texture painting is stubbed. This is a simulation regression, not a GPU benchmark.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
fs.mkdirSync('work', { recursive: true });
const context = new Proxy({}, {
  get(_, key) {
    if (key === 'measureText') return text => ({ width: text.length * 20 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return () => {};
  }, set() { return true; },
});
globalThis.document = { createElement: () => ({ getContext: () => context }) };
globalThis.ProgressEvent = class { constructor(type, data) { this.type = type; Object.assign(this, data); } };
await build({ input: 'src/world/players.ts', external: id => id === 'three' || id.startsWith('three/'), output: { file: 'work/ball-test-module.mjs', format: 'esm' } });
const { GameSim } = await import('../work/ball-test-module.mjs');
const bytes = fs.readFileSync('public/models/baller.glb');
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const expectedClips = ['Idle', 'Run', 'RunDribble', 'IdleDribble', 'Defend', 'Shuffle', 'Shoot', 'Pass', 'Catch', 'Crossover', 'Jump', 'Dunk', 'Land', 'Rebound', 'Celebrate'];
for (const clip of expectedClips) assert(gltf.animations.some(a => a.name === clip), `Missing authored animation ${clip}`);
for (const grip of ['ballGripR', 'ballGripL']) assert(gltf.scene.getObjectByName(grip), `Missing modeled palm socket ${grip}`);

const footPlant = {};
for (const [name, speed, axis] of [['Run', 9.36084, 'z'], ['RunDribble', 9.36084, 'z'], ['Shuffle', 2.516097, 'x']]) {
  const root = SkeletonUtils.clone(gltf.scene), mixer = new THREE.AnimationMixer(root);
  const clip = gltf.animations.find(a => a.name === name);
  mixer.clipAction(clip).play();
  const foot = root.getObjectByName('foot_l');
  const points = [];
  for (const phase of [.05, .125, .25, .375, .45]) {
    const time = phase * clip.duration;
    mixer.setTime(time); root.position[axis] = speed * time; root.updateMatrixWorld(true);
    points.push(foot.getWorldPosition(new THREE.Vector3()));
  }
  const drift = Math.max(...points.map(p => p.distanceTo(points[0])));
  assert(drift < .04, `${name} support foot slides ${drift} feet at calibrated gait speed`);
  footPlant[name] = { calibratedFeetPerSecond: speed, stanceDriftFeet: drift };
}

const sim = new GameSim(gltf);
let previous = new THREE.Vector3(...sim.qaSnapshot().position);
let segmentMaxStep = 0;
let frames = 0, maxStep = 0, maxSpeed = 0, minY = Infinity, catches = 0, scored = 0;
const phases = {}, actions = {}, modes = {}, transitions = {};
let last = sim.qaSnapshot();
function tick(dt = 1 / 60) {
  sim.update(dt, frames * dt);
  const state = sim.qaSnapshot();
  const p = new THREE.Vector3(...state.position), step = p.distanceTo(previous);
  assert(state.position.every(Number.isFinite), `Nonfinite ball at frame ${frames}`);
  assert(p.y >= state.radius + .0249, `Ball penetrated court at frame ${frames}: ${p.y}`);
  assert(state.visible && state.attached && state.ballCount === 1, `Ball lost or duplicated at frame ${frames}`);
  assert(state.frustumCulled && state.boundingRadius >= state.radius, 'Ball culling bounds must enclose the real geometry');
  assert(state.depthTest && state.depthWrite && state.opacity === 1, 'Ball must use ordinary opaque depth testing');
  assert(step <= dt * 85 + 1e-6, `Ball teleported ${step.toFixed(3)}ft in ${dt}s at frame ${frames}: ${last.phase} -> ${state.phase}, ${last.holderClip} -> ${state.holderClip}`);
  const mesh = sim.group.getObjectByName('basketball');
  const world = mesh.getWorldPosition(new THREE.Vector3());
  assert(world.distanceTo(new THREE.Vector3(...state.worldPosition)) < 1e-6, 'Rendered ball and authoritative world position differ');
  if (last.flight?.purpose === 'pass' && state.mode === 'held') {
    catches++;
    const grip = sim.holder.hand.getWorldPosition(new THREE.Vector3());
    assert(grip.distanceTo(world) < 1e-5, `Pass catch missed palm by ${grip.distanceTo(world)}ft`);
  }
  if (state.lastTransition !== last.lastTransition) transitions[state.lastTransition] = (transitions[state.lastTransition] || 0) + 1;
  for (const player of sim.players) actions[player.current] = (actions[player.current] || 0) + 1;
  phases[state.phase] = (phases[state.phase] || 0) + 1;
  modes[state.mode] = (modes[state.mode] || 0) + 1;
  segmentMaxStep = Math.max(segmentMaxStep, step); maxStep = Math.max(maxStep, step); maxSpeed = Math.max(maxSpeed, step / dt); minY = Math.min(minY, p.y);
  previous.copy(p); last = state; frames++;
  return state;
}
sim.onScore = () => scored++;
// The original disappearance reproducer: eight minutes at the actual simulation cadence.
for (let i = 0; i < 60 * 480; i++) tick();
const autoplay = { frames, maxStep, maxSpeed, minY, catches, scores: scored, finalScore: [...sim.score], phases: { ...phases } };
assert(catches > 30 && scored > 15 && phases.loose > 50, 'Autoplay did not exercise enough possession/score/rebound transitions');

segmentMaxStep = 0;
const thirtyCatchStart = catches, thirtyScoreStart = scored;
for (let i = 0; i < 30 * 240; i++) tick(1 / 30);
const autoplay30 = { frames: 7200, seconds: 240, maxStepFeet: segmentMaxStep, catches: catches - thirtyCatchStart, scores: scored - thirtyScoreStart };
assert(autoplay30.catches > 10 && autoplay30.scores > 5, '30 Hz run did not exercise enough possessions');

// Repeated forced misses, catches, dunks, crossovers and resets under mixed frame rates.
for (let repeat = 0; repeat < 3; repeat++) {
  for (const scenario of ['pass', 'shot-make', 'shot-miss', 'dunk', 'rebound', 'crossover', 'reset']) {
    sim.runQaScenario(scenario);
    for (let frame = 0; frame < 480; frame++) tick([1 / 120, 1 / 60, 1 / 30, .05][frame % 4]);
  }
}

// A transformed game parent used to mix bone-world coordinates with ball-local coordinates.
sim.group.position.set(13, 2, -9);
sim.group.rotation.y = .71;
sim.group.scale.setScalar(1.25);
sim.group.updateMatrixWorld(true);
for (let frame = 0; frame < 600; frame++) tick();

// Real input drives the existing ball owner; pass and shot requests run the same state machine.
sim.setManualControl(true);
for (let frame = 0; !sim.qaSnapshot().holder && frame < 600; frame++) tick();
assert(sim.qaSnapshot().holder, 'Manual mode never regained possession');
const beforeMove = sim.holder.pos.clone();
sim.setManualInput(0, 1);
for (let i = 0; i < 90; i++) tick();
assert(sim.holder.pos.distanceTo(beforeMove) > 2, 'Manual input did not move the controlled athlete');
sim.setManualInput(0, 0);
sim.requestCrossover();
for (let i = 0; i < 120; i++) tick();
sim.requestPass();
let manualPass = false;
for (let i = 0; i < 180; i++) { if (tick().flight?.purpose === 'pass') manualPass = true; }
assert(manualPass, 'Manual pass did not release the ball');
sim.requestShot();
let manualShot = false;
for (let i = 0; i < 240; i++) { if (['shot', 'dunk'].includes(tick().flight?.purpose)) manualShot = true; }
assert(manualShot, 'Manual shot did not release the ball');
sim.setManualControl(false);
for (const clip of expectedClips) assert(actions[clip], `Authored clip not exercised: ${clip}`);
const baseline = JSON.parse(fs.readFileSync('tests/evidence/ball-before.json'));
const report = {
  kind: 'Real production GLB / GameSim deterministic regression; Canvas2D drawing stubbed; no GPU timings',
  before: { frames: baseline.frames, seconds: baseline.seconds, worstSingleFrameFeet: baseline.maxJump, jumpsOver2_5Feet: baseline.events.length },
  footPlant, assetSha256: createHash('sha256').update(bytes).digest('hex'), autoplay, autoplay30, total: { frames, maxStepFeet: maxStep, maxSpeedFeetPerSecond: maxSpeed, minimumHeightFeet: minY, catches, scores: scored },
  scenarios: ['dribble', 'moving receiver pass', 'forced score', 'forced miss', 'rim rebound', 'dunk', 'crossover', 'reset', 'transformed parent', 'manual move/pass/shot'],
  phases, actions, modes, transitions,
};
fs.writeFileSync('tests/evidence/ball-after.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, actions: Object.keys(actions), transitions: undefined }, null, 2));
