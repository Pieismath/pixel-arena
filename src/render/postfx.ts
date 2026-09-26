import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type Quality = 'high' | 'low';

/** Desktop gets contact shading and restrained lamp bloom. Mobile renders in one pass. */
export function createPostFX(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: Quality) {
  let high = quality === 'high';
  let lightweight = false;
  let composer: EffectComposer | null = null;
  let gtao: GTAOPass | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (high) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.blendIntensity = 0.72;
    gtao.updateGtaoMaterial({ radius: 2.4, distanceExponent: 1.4, thickness: 2.5, scale: 1, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    // Alpha-tested fences and nets must not become opaque sheets in the AO normal pass.
    const pass = gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    const hideLinesAndPoints = pass._overrideVisibility.bind(gtao);
    pass._overrideVisibility = () => {
      hideLinesAndPoints();
      scene.traverse((o) => {
        if (o.userData.skipAO && o.visible) { o.visible = false; pass._visibilityCache.push(o); }
      });
    };
    composer.addPass(gtao);
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.19, 0.45, 3.2);
    composer.addPass(bloom);
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          vec2 d = (vUv - .5) * vec2(1., .8);
          c.rgb *= 1.0 - smoothstep(.2, .68, length(d)) * .13;
          gl_FragColor = c;
        }`,
    }));
    composer.addPass(new OutputPass());
  }

  function resize() {
    const w = Math.max(window.innerWidth, 1), h = Math.max(window.innerHeight, 1);
    const ratio = Math.min(window.devicePixelRatio, high ? 1.5 : lightweight ? 0.8 : 1.15);
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    if (high && composer) {
      composer.setPixelRatio(ratio);
      composer.setSize(w, h);
      gtao?.setSize(Math.round(w * ratio / 2), Math.round(h * ratio / 2));
      bloom?.setSize(Math.round(w * ratio / 2), Math.round(h * ratio / 2));
    }
  }
  return {
    resize,
    get quality(): Quality { return high ? 'high' : 'low'; },
    degrade() {
      if (!high) { lightweight = true; resize(); return; }
      high = false;
      if (composer) {
        for (const pass of composer.passes) pass.dispose();
        composer.dispose();
        composer = null;
      }
      gtao = null;
      bloom = null;
      resize();
    },
    render() {
      if (window.innerWidth < 1 || window.innerHeight < 1) return;
      if (high && composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
