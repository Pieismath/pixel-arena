import type * as THREE from 'three';
import type { GameSim } from '../world/players';

/** Optional, visible audit surface. It exercises the same public action paths as gameplay. */
export function createDiagnostics(game: GameSim, renderer: THREE.WebGLRenderer, quality: () => string, lowerGraphics: () => void, disableShadows: () => void, scene: THREE.Scene, inspectSection: (name: string) => void, togglePause: () => boolean) {
  const params = new URLSearchParams(location.search);
  if (!params.has('inspect') && !params.has('audit')) return { frame(_dt: number, _elapsed: number, _paused?: boolean) {} };
  const container = document.createElement('aside'); container.id = 'audit-panel';
  const stats = document.createElement('output'); stats.id = 'render-metrics'; container.append(stats);
  const benchmark = document.createElement('pre'); benchmark.id = 'benchmark-result'; container.append(benchmark);
  const ball = document.createElement('pre'); ball.id = 'ball-audit';
  if (params.get('audit') === '1') {
    const actions = document.createElement('div');
    (['pass','shot-make','shot-miss','dunk','rebound','reset','crossover'] as const).forEach(scenario => {
      const button = document.createElement('button'); button.textContent = scenario;
      button.addEventListener('click', () => game.runQaScenario(scenario)); actions.append(button);
    });
    for (const [label, action] of [['Lower graphics', lowerGraphics], ['Disable shadows', disableShadows]] as const) { const button = document.createElement('button'); button.textContent = label; button.addEventListener('click', action); actions.append(button); }
    for (const label of ['Neighborhood', 'Facade', 'Street', 'Surface', 'Cage', 'Hoop', 'Player']) {
      const button = document.createElement('button'); button.textContent = `${label} detail`;
      button.addEventListener('click', () => inspectSection(label)); actions.append(button);
    }
    const pause = document.createElement('button'); pause.textContent = 'Pause motion';
    pause.addEventListener('click', () => { pause.textContent = togglePause() ? 'Resume motion' : 'Pause motion'; }); actions.append(pause);
    const profile = document.createElement('pre'); profile.id = 'geometry-budget';
    const categories: Record<string, {meshes:number; triangles:number}> = {};
    scene.traverse(object => {
      const mesh = object as THREE.Mesh; if (!mesh.isMesh) return;
      let parent: THREE.Object3D = object; while(parent.parent && parent.parent !== scene) parent = parent.parent;
      const category = parent.name || parent.type;
      const entry = categories[category] ??= {meshes:0, triangles:0};
      entry.meshes++; entry.triangles += ((mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count)/3) * ((mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1);
    });
    profile.textContent = JSON.stringify(categories); profile.hidden = true;
    const hide = document.createElement('button'); hide.textContent = 'Hide diagnostics';
    hide.addEventListener('click', () => { container.hidden = true; }); actions.append(hide);
    document.addEventListener('keydown', event => { if (event.code === 'F8') container.hidden = !container.hidden; });
    container.append(actions,ball,profile);
  }
  document.body.append(container);
  const samples: number[] = [];
  let collected = 0, next = 0;
  let drawCalls = 0, triangles = 0;
  let tier = ''; 
  return {
    frame(dt: number, elapsed: number, paused = false) {
      if (paused) return;
      const currentTier = `${quality()}/${renderer.getPixelRatio()}/${renderer.shadowMap.enabled}/${innerWidth}/${innerHeight}`;
      if (tier !== currentTier) { samples.length = 0; collected = drawCalls = triangles = 0; tier = currentTier; benchmark.textContent = ''; }
      if (elapsed > 8 && collected < 30 && dt > 0) {
        samples.push(dt * 1000); collected += dt;
        drawCalls += renderer.info.render.calls; triangles += renderer.info.render.triangles;
      }
      if (elapsed < next) return; next = elapsed + .5;
      stats.textContent = `${quality()} · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles / 1e6).toFixed(2)}M triangles`;
      if (samples.length) {
        const ordered = [...samples].sort((a,b) => a-b);
        benchmark.textContent = JSON.stringify({ status:collected >= 30 ? 'complete':'measuring', seconds:+collected.toFixed(2), frames:samples.length, fps:+(samples.length / collected).toFixed(1), medianMs:+ordered[Math.floor(ordered.length*.5)].toFixed(2), p95Ms:+ordered[Math.floor(ordered.length*.95)].toFixed(2), meanDraws:Math.round(drawCalls/samples.length), meanTriangles:Math.round(triangles/samples.length), quality:quality(), viewport:[innerWidth,innerHeight], pixelRatio:renderer.getPixelRatio() });
      }
      if (params.get('audit') === '1') ball.textContent = JSON.stringify(game.qaSnapshot());
    },
  };
}
