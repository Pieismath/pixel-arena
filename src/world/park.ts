import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { ArenaState, Brand, SpotRef } from '../data/types';
import { BANNER_SLOTS, MURAL_SLOTS, NAMING_SLOT } from './layout';
import { CourtPainter, drawBanner, drawMural, drawNamingSign, Painted, ScreenPainter, type Scoreboard } from './signs';
import * as T from './textures';

type Mat = THREE.MeshStandardMaterial;
const std = (p: THREE.MeshStandardMaterialParameters): Mat => new THREE.MeshStandardMaterial({ roughness: 0.85, ...p });
/** Emissive "lamp" colors above 1.0 so the bloom pass picks them up. */
const glow = (hex: string, strength: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(strength) });

function parkMaterials(): Record<string, THREE.Material> {
  const red = T.facadeTextures('#8e5140', '#967968', 11, 0.3);
  const tan = T.facadeTextures('#aa896a', '#bca58a', 12, 0.24);
  const gray = T.facadeTextures('#66646d', '#948e8b', 13, 0.26);
  const facade = (f: { map: THREE.Texture; emissiveMap: THREE.Texture }) =>
    std({ map: f.map, emissiveMap: f.emissiveMap, emissive: new THREE.Color('#ffc27a'), emissiveIntensity: 0.8, roughness: 0.92 });
  const awning = (a: string, b: string) => {
    const t = T.stripeTexture(a, b, 3, true, 64);
    return std({ map: t, roughness: 0.8 });
  };
  return {
    Asphalt: std({ map: T.asphaltTexture('#3c3d47', 1), roughness: 0.96 }),
    ParkGround: std({ map: T.asphaltTexture('#555a68', 2, 30), roughness: 0.92 }),
    Sidewalk: std({ map: T.concreteTexture('#ada596', 3), roughness: 0.9 }),
    Curb: std({ color: '#8c877f' }),
    WallPaint: std({ color: '#d9d1c5', roughness: 0.95 }),
    Aluminum: std({ map: T.brushedTexture('#c7ced8'), metalness: 0.5, roughness: 0.38 }),
    Metal: std({ color: '#34383d', metalness: 0.35, roughness: 0.55 }),
    Padding: std({ map: T.stripeTexture('#253d75', '#1b2d58', 4, true, 3), roughness: 0.7 }),
    FacadeRed: facade(red),
    FacadeTan: facade(tan),
    FacadeGray: facade(gray),
    Roof: std({ color: '#3b3539', roughness: 0.95 }),
    Cornice: std({ color: '#ddcfb8', roughness: 0.85 }),
    Wood: std({ map: T.stripeTexture('#7d5539', '#5a3b26', 1.2, true, 6), roughness: 0.85 }),
    Foliage: std({ map: T.foliageTexture('#536943', 4), roughness: 0.95 }),
    FoliageLight: std({ map: T.foliageTexture('#8c9853', 5), roughness: 0.95 }),
    Bark: std({ color: '#5a3d2a' }),
    AwningRed: awning('#c8402f', '#f3e9d8'),
    AwningGreen: awning('#2f8f5a', '#f3e9d8'),
    LampGlow: glow('#fff1cc', 6),
    ChainLink: std({ map: T.chainLinkTexture(), alphaTest: 0.45, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 }),
    Net: std({ map: T.netTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }),
    Rim: std({ color: '#e8531f', metalness: 0.3, roughness: 0.45 }),
    Backboard: std({ color: '#b6d4d5', roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.24, depthWrite: false }),
    BannerBack: std({ color: '#e9e6df' }),
    ScreenFrame: std({ color: '#15171e', roughness: 0.6 }),
    ShopGlass: std({ color: '#2b3a4a', roughness: 0.15, metalness: 0.2, emissive: new THREE.Color('#ffb86b'), emissiveIntensity: 0.35 }),
    Trim: std({ color: '#f2e8d8' }),
    Planter: std({ color: '#6b5a4a' }),
  };
}

/** Meshes whose front face is a brand spot, keyed by their glTF material name. */
interface Hooks {
  court: THREE.Mesh | null;
  screen: THREE.Mesh | null;
  naming: THREE.Mesh | null;
  graffiti: THREE.Mesh | null;
  murals: THREE.Mesh[];
  banners: THREE.Mesh[];
}

export function createPark(gltf: GLTF) {
  const root = gltf.scene;
  root.name = 'park';
  const materials = parkMaterials();
  const hooks: Hooks = { court: null, screen: null, naming: null, graffiti: null, murals: [], banners: [] };
  const pickables: THREE.Object3D[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (mesh.material as THREE.Material).name;
    const replacement = materials[name];
    if (replacement) mesh.material = replacement;
    mesh.receiveShadow = name !== 'LampGlow';
    mesh.castShadow = !['Asphalt', 'ParkGround', 'Sidewalk', 'LampGlow', 'CourtSurface', 'Backboard'].includes(name);
    if (name === 'ChainLink' || name === 'Net' || name === 'Backboard') mesh.userData.skipAO = true;
    let m: RegExpMatchArray | null;
    if (name === 'CourtSurface') hooks.court = mesh;
    else if (name === 'BigScreen') hooks.screen = mesh;
    else if (name === 'NamingSign') hooks.naming = mesh;
    else if (name === 'GraffitiWall') hooks.graffiti = mesh;
    else if ((m = name.match(/^Mural_(\d+)$/))) hooks.murals[+m[1]] = mesh;
    else if ((m = name.match(/^Banner_(\d+)$/))) hooks.banners[+m[1]] = mesh;
  });

  // Court surface with the lines and the court's name.
  const court = new CourtPainter();
  const courtBump = T.surfaceBumpTexture('asphalt');
  courtBump.repeat.set(18, 10);
  const plasterBump = T.surfaceBumpTexture('plaster');
  plasterBump.repeat.set(6, 2);
  const vinylBump = T.surfaceBumpTexture('vinyl');
  if (hooks.court) {
    hooks.court.material = std({ map: court.texture, roughness: 0.93, bumpMap: courtBump, bumpScale: 0.025 });
    hooks.court.castShadow = false;
    hooks.court.userData.pick = (hit: THREE.Intersection): SpotRef | null =>
      hit.point.x ** 2 + hit.point.z ** 2 < 8 * 8 ? { kind: 'naming' } : null;
    pickables.push(hooks.court);
  }

  const screen = new ScreenPainter();
  if (hooks.screen) {
    hooks.screen.material = new THREE.MeshBasicMaterial({ map: screen.texture, toneMapped: false });
    hooks.screen.userData.pick = (): SpotRef => ({ kind: 'screen' });
    pickables.push(hooks.screen);
  }

  const namingSign = new Painted(1600, Math.round((1600 * NAMING_SLOT.height) / NAMING_SLOT.width));
  if (hooks.naming) {
    hooks.naming.material = new THREE.MeshBasicMaterial({ map: namingSign.texture, toneMapped: false });
    hooks.naming.userData.pick = (): SpotRef => ({ kind: 'naming' });
    pickables.push(hooks.naming);
  }

  if (hooks.graffiti) hooks.graffiti.material = std({ map: T.graffitiWallTexture(31), roughness: 0.95, bumpMap: plasterBump, bumpScale: 0.045 });

  const murals = MURAL_SLOTS.map((slot, i) => {
    const p = new Painted(768, Math.round((768 * slot.height) / slot.width));
    const mesh = hooks.murals[i];
    if (mesh) {
      mesh.material = std({ map: p.texture, roughness: 0.92, bumpMap: plasterBump, bumpScale: 0.04 });
      mesh.userData.pick = (): SpotRef => ({ kind: 'mural', index: i });
      pickables.push(mesh);
    }
    return p;
  });

  const banners = BANNER_SLOTS.map((slot, i) => {
    const p = new Painted(512, Math.round((512 * slot.height) / slot.width));
    const mesh = hooks.banners[i];
    if (mesh) {
      mesh.material = std({ map: p.texture, roughness: 0.65, bumpMap: vinylBump, bumpScale: 0.015 });
      mesh.userData.pick = (): SpotRef => ({ kind: 'banner', index: i });
      pickables.push(mesh);
    }
    return p;
  });

  const brandOf = (state: ArenaState, id: string | null): Brand | null => (id ? state.brands[id] ?? null : null);

  return {
    root,
    pickables,
    setState(state: ArenaState) {
      const naming = brandOf(state, state.naming.brandId);
      court.draw(naming);
      drawNamingSign(namingSign, naming, state.naming.valueCents);
      screen.set(brandOf(state, state.screen.brandId), state.screen.dayPriceCents);
      state.murals.forEach((h, i) => murals[i] && drawMural(murals[i], brandOf(state, h.brandId), h.valueCents, 100 + i));
      state.banners.forEach((h, i) => banners[i] && drawBanner(banners[i], brandOf(state, h.brandId), h.valueCents));
    },
    update(t: number, dt: number, sb: Scoreboard) {
      screen.update(t, dt, sb);
    },
    prepareCapture(ref: SpotRef) {
      if (ref.kind === 'screen') screen.drawAdForCapture();
    },
    flashScore(team: 0 | 1, points: number) {
      screen.flash(team, points);
    },
  };
}

export type Park = ReturnType<typeof createPark>;

/** Evening sky dome, sun, sky fill, fog and a soft environment for reflections. */
export function createEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const sunDir = new THREE.Vector3(-0.6, 0.58, 0.65).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#687c99') },
        mid: { value: new THREE.Color('#c9a9a2') },
        horizon: { value: new THREE.Color('#f6c69a') },
        sunDir: { value: sunDir },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          col = mix(col, top, smoothstep(0.18, 0.75, h));
          float sun = max(dot(normalize(vDir), sunDir), 0.0);
          col += vec3(1.0, 0.72, 0.45) * (pow(sun, 12.0) * 0.55 + pow(sun, 400.0) * 3.0);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.name = 'sky';
  sky.frustumCulled = false;
  scene.add(sky);
  scene.background = new THREE.Color('#e7a07e');
  scene.fog = new THREE.Fog('#cbaea2', 170, 660);

  scene.add(new THREE.HemisphereLight('#aebcec', '#735256', 0.86));
  const sun = new THREE.DirectionalLight('#ffd1a0', 3.2);
  sun.position.copy(sunDir).multiplyScalar(320);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -106;
  sc.right = 106;
  sc.top = 106;
  sc.bottom = -106;
  sc.near = 60;
  sc.far = 720;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.12;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#9ba7ff', 0.7);
  rim.position.set(-200, 120, -160);
  scene.add(rim);

  const pmrem = new THREE.PMREMGenerator(renderer);
  import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    scene.environmentIntensity = 0.23;
  });
  return { sun, sunDir };
}
