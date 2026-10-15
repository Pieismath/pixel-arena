import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { ArenaState, Brand, SpotRef } from '../data/types';
import { BANNER_SLOTS, MURAL_SLOTS, NAMING_SLOT } from './layout';
import { CourtPainter, drawBanner, drawMural, drawNamingSign, Painted, ScreenPainter, type Scoreboard } from './signs';
import * as T from './textures';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { courtSurface, type SurfaceLibrary } from './pbr';
import { FLOOR } from '../config';

type Mat = THREE.MeshStandardMaterial;
const std = (p: THREE.MeshStandardMaterialParameters): Mat => new THREE.MeshStandardMaterial({ roughness: 0.85, ...p });
/** Emissive "lamp" colors above 1.0 so the bloom pass picks them up. */
const glow = (hex: string, strength: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(strength) });

function parkMaterials(surfaces: SurfaceLibrary): Record<string, THREE.Material> {
  const facade = (color: string) => std({ ...surfaces.brick, color, normalScale: new THREE.Vector2(.7, .7), roughness: .96, aoMapIntensity: .55 });
  const concrete = (color: string) => std({ ...surfaces.concrete, color, normalScale: new THREE.Vector2(.35, .35), roughness: .92, aoMapIntensity: .4 });
  const awning = (a: string, b: string) => {
    const t = T.stripeTexture(a, b, 3, true, 64);
    return std({ map: t, roughness: 0.8 });
  };
  return {
    Asphalt: std({ ...surfaces.asphalt, color: '#b6b8ba', roughness: .98, normalScale: new THREE.Vector2(.65,.65), aoMapIntensity:.45 }),
    ParkGround: std({ ...surfaces.asphalt, color: '#a8b1a8', roughness: .98, normalScale: new THREE.Vector2(.5,.5), aoMapIntensity:.4 }),
    Sidewalk: concrete('#d5cebd'),
    Curb: concrete('#c3bda9'),
    WallPaint: std({ color: '#d9d1c5', roughness: 0.95 }),
    Aluminum: std({ map: T.brushedTexture('#727a75'), metalness: 0.65, roughness: 0.5 }),
    SeatMetal: std({ color: '#283330', roughness: 0.76, metalness: 0.28 }),
    Stair: concrete('#c8c1b2'),
    RoadPaint: std({ color: '#d8d0ad', roughness: 0.96 }),
    Metal: std({ color: '#34383d', metalness: 0.35, roughness: 0.55 }),
    Padding: std({ map: T.stripeTexture('#1e2a28', '#263532', 4, true, 3), roughness: 0.88 }),
    FacadeRed: facade('#b2a89b'),
    FacadeTan: facade('#d0b68b'),
    FacadeGray: facade('#8e9393'),
    FacadeCream: facade('#ece0ba'),
    FacadeBrown: facade('#817267'),
    FacadePale: concrete('#d4d1c4'),
    WindowGlass: std({color:'#283e4a',roughness:.27,metalness:.40}),
    WindowBlue: std({color:'#4b6570',roughness:.24,metalness:.38}),
    WindowWarm: std({color:'#88785f',roughness:.48}),
    WindowFrame: std({color:'#302f29',roughness:.73}),
    CarGlass: std({color:'#233e4a',roughness:.18,metalness:.52}),
    Chrome: std({color:'#a7b3b3',roughness:.28,metalness:.8}),
    CarBody: std({color:'#293f48',roughness:.32,metalness:.4}),
    CarRed: std({color:'#70362e',roughness:.32,metalness:.4}),
    CarSilver: std({color:'#a2aca9',roughness:.28,metalness:.55}),
    Roof: std({ color: '#3b3539', roughness: 0.95 }),
    Cornice: std({ color: '#ddcfb8', roughness: 0.85 }),
    Wood: std({ map: T.stripeTexture('#7d5539', '#5a3b26', 1.2, true, 6), roughness: 0.85 }),
    Foliage: std({ color: '#354b2d', side: THREE.DoubleSide, roughness: 0.98 }),
    FoliageLight: std({ color: '#5d713d', side: THREE.DoubleSide, roughness: 0.96 }),
    LeafOchre: std({ color: '#79804a', side: THREE.DoubleSide, roughness: 0.96 }),
    Bark: std({ map: T.barkTexture(), roughness: 0.99 }),
    AwningRed: awning('#c8402f', '#f3e9d8'),
    AwningGreen: awning('#2f8f5a', '#f3e9d8'),
    LampGlow: glow('#fff1cc', 1.15),
    ChainLink: std({ map: T.chainLinkTexture(), alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 }),
    Net: std({ color: '#e5e0cd', roughness: 0.97 }),
    Rim: std({ color: '#e8531f', metalness: 0.3, roughness: 0.45 }),
    Backboard: std({ color: '#b6d4d5', roughness: 0.11, metalness: 0.05, transparent: true, opacity: 0.18, depthWrite: false }),
    BannerBack: std({ color: '#e9e6df' }),
    ScreenFrame: std({ color: '#15171e', roughness: 0.6 }),
    ShopGlass: std({ map: T.shopGlassTexture(), roughness: 0.24, metalness: 0.32 }),
    Trim: std({ color: '#f2e8d8' }),
    Planter: concrete('#8e7562'),
    InteriorShadow: std({ color: '#161715', roughness: 1, envMapIntensity: .2 }),
    InteriorPlaster: concrete('#9d917c'),
    CurtainLinen: std({ color: '#c6bda6', roughness: 1, side: THREE.DoubleSide }),
    CurtainWarm: std({ color: '#81765f', roughness: 1, side: THREE.DoubleSide }),
    ShopInterior: std({ color: '#4e4940', roughness: .98, envMapIntensity: .3 }),
    ShopShelf: std({ color: '#796650', roughness: .86 }),
    DoorWood: std({ color: '#494033', roughness: .75 }),
    GlassPane: std({ color: '#a2b3b7', transparent: true, opacity: .16, depthWrite: false, roughness: .14, metalness: 0, envMapIntensity: .8 }),
    PaintedIron: std({ color: '#272c28', roughness: .62, metalness: .35 }),
    Limestone: concrete('#e2d3b9'),
    RoofFlashing: std({ color: '#929b97', roughness: .65, metalness: .72 }),
    PavingJoint: std({ color: '#54534a', roughness: 1 }),
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

export function createPark(gltf: GLTF, surfaces: SurfaceLibrary) {
  const root = gltf.scene;
  root.name = 'park';
  const materials = parkMaterials(surfaces);
  const hooks: Hooks = { court: null, screen: null, naming: null, graffiti: null, murals: [], banners: [] };
  const pickables: THREE.Object3D[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = (mesh.material as THREE.Material).name;
    const replacement = materials[name];
    if (replacement) mesh.material = replacement;
    mesh.receiveShadow = name !== 'LampGlow';
    // Subpixel alpha wire shadows alias into dark stripes on athletes. Posts and nearby
    // rails cast; both subpixel wire representations only supply the visible fence.
    mesh.castShadow = !['Asphalt', 'ParkGround', 'Sidewalk', 'LampGlow', 'CourtSurface', 'Backboard', 'GlassPane', 'ChainLink'].includes(name) && !mesh.name.includes('HeroCageWire');
    if (name === 'ChainLink' || name === 'Net' || name === 'Backboard' || name === 'GlassPane') mesh.userData.skipAO = true;
    let m: RegExpMatchArray | null;
    if (name === 'CourtSurface') hooks.court = mesh;
    else if (name === 'BigScreen') hooks.screen = mesh;
    else if (name === 'NamingSign') hooks.naming = mesh;
    else if (name === 'GraffitiWall') hooks.graffiti = mesh;
    else if ((m = name.match(/^Mural_(\d+)$/))) hooks.murals[+m[1]] = mesh;
    else if ((m = name.match(/^Banner_(\d+)$/))) hooks.banners[+m[1]] = mesh;
  });

  // Court surface with the lines and the court's name.
  const court = new CourtPainter(surfaces.asphalt.map.image as HTMLImageElement);
  const plasterBump = T.surfaceBumpTexture('plaster');
  plasterBump.repeat.set(6, 2);
  const vinylBump = T.surfaceBumpTexture('vinyl');
  if (hooks.court) {
    hooks.court.material = std({ map: court.texture, ...courtSurface(surfaces, FLOOR.length, FLOOR.width) });
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

  const cageCenter = new THREE.Vector3(58, 9.5, -2);
  const cageWires: THREE.Object3D[] = [], cageProxies: THREE.Object3D[] = [];
  root.traverse(o => {
    if (o.name.includes('HeroCageWire')) cageWires.push(o);
    if (o.name.includes('HeroCageProxy')) cageProxies.push(o);
  });
  let cageNear: boolean | null = null;
  const brandOf = (state: ArenaState, id: string | null): Brand | null => (id ? state.brands[id] ?? null : null);

  return {
    root,
    updateLod(camera: THREE.Camera) {
      const near = camera.position.distanceToSquared(cageCenter) < 72 * 72;
      if (near === cageNear) return false;
      cageNear = near;
      cageWires.forEach(o => o.visible = near);
      cageProxies.forEach(o => o.visible = !near);
      return true;
    },
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

/** Afternoon sunlight and measured outdoor HDR reflections, with a neutral procedural sky. */
export function createEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const sunDir = new THREE.Vector3(-0.6, 0.58, 0.65).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#7199ba') },
        mid: { value: new THREE.Color('#bdd0d4') },
        horizon: { value: new THREE.Color('#d8dfe0') },
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
  scene.background = new THREE.Color('#bfd0d3');
  scene.fog = new THREE.Fog('#c8d3da', 280, 1050);

  scene.add(new THREE.HemisphereLight('#c8d9e8', '#777666', .52));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.35);
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
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.14;
  scene.add(sun, sun.target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ready = new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}textures/pbr/wide_street_02-hdri.hdr`).then(hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    // This HDRI supplies diffuse/reflection detail; the scene's single sun casts shadows.
    scene.environmentIntensity = .72;
    scene.environmentRotation.y = 1.8;
    hdr.dispose(); pmrem.dispose();
  });
  return { sun, sunDir, ready };
}
