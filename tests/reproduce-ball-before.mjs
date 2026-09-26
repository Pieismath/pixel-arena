/** Reproduce the original failure without modifying the working tree. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'rolldown';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const commit = '23ff85317132c317a1d93f8895b9aef024754a3e';
const folder = 'work/ball-original';
for (const file of ['src/world/players.ts', 'src/world/signs.ts', 'src/world/textures.ts', 'src/world/park-layout.json', 'src/config.ts', 'src/data/random.ts', 'src/data/types.ts', 'public/models/baller.glb']) {
  const target = `${folder}/${file}`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, execFileSync('git', ['show', `${commit}:${file}`], { maxBuffer: 10 * 1024 * 1024 }));
}
const context = new Proxy({}, { get(_, key) { if (key === 'measureText') return text => ({ width: text.length * 20 }); if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} }); return () => {}; }, set() { return true; } });
globalThis.document = { createElement: () => ({ getContext: () => context }) };
await build({ input: `${folder}/src/world/players.ts`, external: id => id === 'three' || id.startsWith('three/'), output: { file: `${folder}/game.mjs`, format: 'esm' } });
const { GameSim } = await import('../work/ball-original/game.mjs');
const bytes = fs.readFileSync(`${folder}/public/models/baller.glb`);
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const game = new GameSim(gltf);
let previous = game.ballPosition.clone(), maxStep = 0, jumps = 0;
for (let frame = 0; frame < 28800; frame++) {
  game.update(1 / 60, frame / 60);
  const step = previous.distanceTo(game.ballPosition);
  if (step > 2.5) jumps++;
  maxStep = Math.max(step, maxStep);
  previous.copy(game.ballPosition);
}
console.log(JSON.stringify({ commit, seconds: 480, frames: 28800, maxSingleFrameFeet: maxStep, jumpsOver2_5Feet: jumps }, null, 2));
