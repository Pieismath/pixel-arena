import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type Quality = 'high' | 'low';

/**
 * Scene render (with MSAA) → ambient occlusion (high quality only) → bloom for lamps, windows and
 * screens → tone mapping and sRGB output.
 */
export function createPostFX(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: Quality) {
  const high = quality === 'high';
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  let gtao: GTAOPass | null = null;
  if (high) {
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 3.5, distanceExponent: 1.4, thickness: 4, scale: 1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    // Alpha-tested surfaces (chain-link, nets) would render solid in the AO normal pass.
    const pass = gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    const hideLinesAndPoints = pass._overrideVisibility.bind(gtao);
    pass._overrideVisibility = () => {
      hideLinesAndPoints();
      scene.traverse((o) => {
        if (o.userData.skipAO && o.visible) {
          o.visible = false;
          pass._visibilityCache.push(o);
        }
      });
    };
    composer.addPass(gtao);
  }

  // Threshold is in scene (pre-tone-mapping) units: sunlit white walls reach ~2.5, lamps and screens far more.
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), high ? 0.42 : 0.3, 0.5, 2.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = Math.max(window.innerWidth, 1);
    const h = Math.max(window.innerHeight, 1);
    const ratio = Math.min(window.devicePixelRatio, high ? 1.5 : 1.25);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    // Ambient occlusion at half resolution is plenty and much cheaper.
    gtao?.setSize(Math.round((w * ratio) / 2), Math.round((h * ratio) / 2));
    bloom.resolution.set(Math.round((w * ratio) / 2), Math.round((h * ratio) / 2));
  }

  return {
    resize,
    render() {
      if (window.innerWidth < 1 || window.innerHeight < 1) return;
      composer.render();
    },
  };
}
