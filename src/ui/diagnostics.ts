import type * as THREE from 'three';
import type { GameSim } from '../world/players';

/** Optional, visible audit surface. It exercises the same public action paths as gameplay. */
export function createDiagnostics(game: GameSim, renderer: THREE.WebGLRenderer, quality: () => string, lowerGraphics: () => void, disableShadows: () => void) {
  const params = new URLSearchParams(location.search);
  if (!params.has('inspect') && !params.has('audit')) return { frame(_dt: number, _elapsed: number) {} };
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
    container.append(actions,ball);
  }
  document.body.append(container);
  const samples: number[] = [];
  let collected = 0, next = 0;
  let drawCalls = 0, triangles = 0;
  let tier = ''; 
  return {
    frame(dt: number, elapsed: number) {
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
