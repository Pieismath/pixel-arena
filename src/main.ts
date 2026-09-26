import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './ui/styles.css';
import { loadArenaState } from './data/api';
import type { ArenaState, SpotRef } from './data/types';
import { createPostFX, type Quality } from './render/postfx';
import { createUI } from './ui/ui';
import { createCrowd } from './world/crowd';
import { BANNER_SLOTS, MURAL_SLOTS, NAMING_SLOT, SCREEN_SLOT, SEAT_INDEX, SEATS, seatKey, type PanelSlot } from './world/layout';
import { createEnvironment, createPark } from './world/park';
import { GameSim } from './world/players';
import { setMaxAnisotropy } from './world/textures';

const DEMO_KEY = 'street-court:demo';

function readDemoPref(): boolean {
  const param = new URLSearchParams(location.search).get('demo');
  if (param === '0' || param === '1') return param === '1';
  try {
    const saved = localStorage.getItem(DEMO_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  return true;
}

function saveDemoPref(on: boolean) {
  try {
    localStorage.setItem(DEMO_KEY, on ? '1' : '0');
  } catch {
    // Not important enough to surface.
  }
}

function pickQuality(): Quality {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'high' || q === 'low') return q;
  return window.matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
}

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** The open space between the buildings; below rooftop height the camera has to stay in it. */
function keepInsideStreets(p: THREE.Vector3) {
  if (p.y > 84) return;
  p.x = THREE.MathUtils.clamp(p.x, -72, 76);
  p.z = THREE.MathUtils.clamp(p.z, -78, 76);
  p.y = Math.max(p.y, 6);
}

async function main() {
  const loadingText = document.getElementById('loading-text')!;
  const quality = pickQuality();
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 3200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 14;
  controls.maxDistance = 125;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = 1.36;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.25;

  const { sun } = createEnvironment(scene, renderer);
  if (quality === 'low') sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 3;
  const post = createPostFX(renderer, scene, camera, quality);

  const isPortrait = () => window.innerWidth / window.innerHeight < 0.85;
  const homeView = () =>
    isPortrait()
      ? { camera: new THREE.Vector3(40, 72, 76), target: new THREE.Vector3(-2, 16, -18) }
      : { camera: new THREE.Vector3(74, 60, 76), target: new THREE.Vector3(-2, 21, -22) };
  function fitCamera() {
    camera.fov = isPortrait() ? 58 : 40;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  fitCamera();
  const home = homeView();
  camera.position.copy(home.camera);
  controls.target.copy(home.target);
  controls.update();
  post.resize();

  // Fonts first (the signs are drawn with them), then the three models built in Blender.
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => (loadingText.textContent = `LOADING THE COURT… ${Math.round((loaded / total) * 100)}%`);
  const loader = new GLTFLoader(manager);
  const base = import.meta.env.BASE_URL;
  const [, parkGltf, ballerGltf, fansGltf] = await Promise.all([
    Promise.race([
      Promise.all(['40px "Bungee"', '40px "Permanent Marker"', '600 20px "Inter"'].map((f) => document.fonts.load(f))),
      new Promise((resolve) => setTimeout(resolve, 3500)),
    ]),
    loader.loadAsync(`${base}models/park.glb`),
    loader.loadAsync(`${base}models/baller.glb`),
    loader.loadAsync(`${base}models/fans.glb`),
  ]);

  const park = createPark(parkGltf);
  scene.add(park.root);
  const crowd = createCrowd(fansGltf);
  scene.add(crowd.group);
  const game = new GameSim(ballerGltf);
  scene.add(game.group);

  let demo = readDemoPref();
  let state: ArenaState = await loadArenaState(demo);
  function applyState() {
    park.setState(state);
    crowd.setState(state);
  }
  applyState();
  void document.fonts.ready.then(() => park.setState(state));

  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.32, depthWrite: false }),
  );
  highlight.visible = false;
  highlight.renderOrder = 10;
  scene.add(highlight);

  function slotOf(ref: SpotRef): PanelSlot | null {
    if (ref.kind === 'banner') return BANNER_SLOTS[ref.index];
    if (ref.kind === 'mural') return MURAL_SLOTS[ref.index];
    if (ref.kind === 'screen') return SCREEN_SLOT;
    if (ref.kind === 'naming') return NAMING_SLOT;
    return null;
  }

  function seatOf(ref: { section: number; row: number; col: number }) {
    return SEATS[SEAT_INDEX.get(seatKey(ref.section, ref.row, ref.col)) ?? 0];
  }

  function highlightSpot(ref: SpotRef | null) {
    if (!ref || ref.kind === 'naming' || ref.kind === 'screen') {
      highlight.visible = false;
      return;
    }
    if (ref.kind === 'seat') {
      const s = seatOf(ref);
      highlight.position.set(s.pos.x, s.pos.y + 2.3, s.pos.z);
      highlight.scale.set(2.1, 4.6, 2.3);
      highlight.rotation.y = s.yaw;
    } else {
      const slot = slotOf(ref)!;
      highlight.position.copy(slot.center).addScaledVector(slot.normal, 0.2);
      highlight.scale.set(slot.width + 0.6, slot.height + 0.6, 0.6);
      highlight.rotation.y = slot.yaw;
    }
    highlight.visible = true;
  }

  function spotView(ref: SpotRef) {
    const back = isPortrait() ? 1.5 : 1;
    if (ref.kind === 'seat') {
      const s = seatOf(ref);
      const toCourt = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      const target = s.pos.clone().add(new THREE.Vector3(0, 3, 0));
      return { target, camera: target.clone().addScaledVector(toCourt, 36 * back).add(new THREE.Vector3(0, 12, 0)) };
    }
    if (ref.kind === 'naming') {
      return { target: new THREE.Vector3(0, 28, -52), camera: new THREE.Vector3(0, 40, 34 * back) };
    }
    const slot = slotOf(ref)!;
    const distance = ref.kind === 'banner' ? 24 : ref.kind === 'mural' ? 40 : 58;
    const camera = slot.center.clone().addScaledVector(slot.normal, distance * back).add(new THREE.Vector3(0, ref.kind === 'screen' ? -10 : 7, 0));
    return { target: slot.center.clone(), camera };
  }

  // --- Selection & camera moves ---------------------------------------------
  let selected: SpotRef | null = null;
  let fly: { fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3; t: number } | null = null;
  let idle = 0;

  function focus(ref: SpotRef) {
    selected = ref;
    const view = spotView(ref);
    keepInsideStreets(view.camera);
    fly = { fromT: controls.target.clone(), toT: view.target, fromP: camera.position.clone(), toP: view.camera, t: 0 };
    controls.autoRotate = false;
    idle = 0;
    highlightSpot(ref);
    ui.showSpot(ref);
  }

  function clearFocus() {
    selected = null;
    highlightSpot(null);
  }

  // --- Trailer mode: no UI, slow fly-around, for recording teasers -----------
  let trailer = false;
  let trailerT = 0;
  let nextWave = 0;
  const trailerTarget = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantTarget = new THREE.Vector3();
  const hint = document.getElementById('trailer-hint')!;

  function toggleTrailer() {
    trailer = !trailer;
    document.body.classList.toggle('trailer', trailer);
    controls.enabled = !trailer;
    hint.hidden = !trailer;
    if (trailer) {
      hint.style.animation = 'none';
      void hint.offsetHeight;
      hint.style.animation = '';
      ui.hidePanels();
      ui.hideTooltip();
      clearFocus();
      fly = null;
      trailerT = 0;
      nextWave = 3;
      trailerTarget.copy(controls.target);
    } else {
      controls.target.copy(trailerTarget);
      controls.update();
    }
  }

  function updateTrailer(dt: number) {
    trailerT += dt;
    const a = trailerT * 0.1 + 0.85;
    wantPos.set(Math.cos(a) * 68, 44 + 12 * Math.sin(trailerT * 0.17 + 1.2), Math.sin(a) * 64 - 4);
    const ball = game.ballPosition;
    wantTarget.set(ball.x * 0.5, 8 + 10 * (0.5 + 0.5 * Math.sin(trailerT * 0.13)), ball.z * 0.3 - 6);
    camera.position.lerp(wantPos, 1 - Math.exp(-dt * 1.4));
    keepInsideStreets(camera.position);
    trailerTarget.lerp(wantTarget, 1 - Math.exp(-dt * 2));
    camera.lookAt(trailerTarget);
    if (trailerT > nextWave) {
      crowd.startWave();
      nextWave = trailerT + 18;
    }
  }

  // --- UI --------------------------------------------------------------------
  async function toggleDemo() {
    demo = !demo;
    saveDemoPref(demo);
    state = await loadArenaState(demo);
    applyState();
    ui.render(state);
    if (selected) ui.showSpot(selected);
  }

  const ui = createUI({ focus, clearFocus, toggleTrailer, toggleDemo: () => void toggleDemo() });
  ui.render(state);

  game.onScore = (team, points) => {
    park.flashScore(team, points);
    crowd.cheer();
  };

  // --- Picking ---------------------------------------------------------------
  const pickables = [...park.pickables, ...crowd.pickables];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickAt(x: number, y: number): SpotRef | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false).find((h) => h.object.userData.pick);
    if (!hit) return null;
    return (hit.object.userData.pick as (h: THREE.Intersection) => SpotRef | null)(hit);
  }

  const pointer = { x: 0, y: 0, inside: false, dirty: false };
  let down: { x: number; y: number; time: number } | null = null;
  let lastHover = 0;

  canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
    if (e.pointerType === 'mouse') pointer.dirty = true;
  });
  canvas.addEventListener('pointerleave', () => {
    pointer.inside = false;
    pointer.dirty = true;
  });
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, time: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || trailer) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.time < 600;
    down = null;
    if (moved > 6 || !quick) return;
    const ref = pickAt(e.clientX, e.clientY);
    if (ref) focus(ref);
    else {
      ui.hidePanels();
      clearFocus();
    }
  });

  function hover(now: number) {
    if (!pointer.dirty || now - lastHover < 60) return;
    pointer.dirty = false;
    lastHover = now;
    const ref = pointer.inside && !down ? pickAt(pointer.x, pointer.y) : null;
    if (ref) {
      ui.showTooltip(ref, pointer.x, pointer.y);
      canvas.style.cursor = 'pointer';
    } else {
      ui.hideTooltip();
      canvas.style.cursor = '';
    }
    if (!selected) highlightSpot(ref);
  }

  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    fly = null;
    idle = 0;
  });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 't') toggleTrailer();
    else if (key === 'escape') {
      if (trailer) toggleTrailer();
      else {
        ui.hidePanels();
        clearFocus();
      }
    } else if (key === 'w') crowd.startWave();
  });

  // Local-only hook for scripted checks; stripped from production builds.
  if (import.meta.env.DEV) Object.assign(window, { __court: { focus, pickAt, toggleTrailer, startWave: crowd.startWave, game, camera, controls, renderer, post, scene } });

  window.addEventListener('resize', () => {
    fitCamera();
    post.resize();
  });

  // --- Loop ------------------------------------------------------------------
  let last = performance.now();
  let elapsed = 0;
  let firstFrame = true;
  renderer.setAnimationLoop((now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;

    game.update(dt, elapsed);
    park.update(elapsed, dt, game);
    crowd.update(elapsed, dt);

    if (trailer) updateTrailer(dt);
    else {
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / 1.0);
        const k = easeInOutCubic(fly.t);
        controls.target.lerpVectors(fly.fromT, fly.toT, k);
        camera.position.lerpVectors(fly.fromP, fly.toP, k);
        if (fly.t >= 1) fly = null;
      } else if (!controls.autoRotate && !selected) {
        idle += dt;
        if (idle > 15) controls.autoRotate = true;
      }
      controls.update(dt);
      keepInsideStreets(camera.position);
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -70, 70);
      controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 60);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -76, 60);
      hover(now);
    }

    post.render();
    if (firstFrame) {
      firstFrame = false;
      document.getElementById('loading')?.remove();
    }
  });
}

main().catch((err) => {
  console.error(err);
  const text = document.getElementById('loading-text');
  if (text) text.textContent = 'The court failed to load. Your browser may not support WebGL.';
});
