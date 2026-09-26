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
import { downloadSpotCard } from './ui/share';
import { createMoments } from './world/moments';
import { setMuralUnderpainting } from './world/signs';
import { createGameplay } from './ui/gameplay';
import { createRecording } from './ui/recording';
import { createDiagnostics } from './ui/diagnostics';

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
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return window.matchMedia('(pointer: coarse)').matches || memory <= 4 ? 'low' : 'high';
}

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** Bound free orbit to the playable park and its immediate streetscape. */
function keepInsideStreets(p: THREE.Vector3) {
  if (p.y > 84) return;
  p.x = THREE.MathUtils.clamp(p.x, -72, 76);
  p.z = THREE.MathUtils.clamp(p.z, -78, 76);
  p.y = Math.max(p.y, 6);
}

async function main() {
  const loadingText = document.getElementById('loading-text')!;
  const quality = pickQuality();
  const params = new URLSearchParams(location.search);
  const stillAt = import.meta.env.DEV ? Number(params.get('still') ?? 0) : 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (params.get('preview') === '1') { showFallback('Explore a still preview, or open the interactive court with lighter graphics.'); return; }
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'low', powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.info.autoReset = false;
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
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.25;

  const { sun } = createEnvironment(scene, renderer);
  if (quality === 'low') sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 3;
  const post = createPostFX(renderer, scene, camera, quality);

  const isPortrait = () => window.innerWidth / window.innerHeight < 0.85;
  const homeView = () =>
    isPortrait()
      ? { camera: new THREE.Vector3(66, 70, 84), target: new THREE.Vector3(0, 2, -4) }
      : { camera: new THREE.Vector3(46, 42, 68), target: new THREE.Vector3(0, 3, -4) };
  function fitCamera() {
    camera.fov = isPortrait() ? 60 : 45;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  fitCamera();
  const home = homeView();
  camera.position.copy(home.camera);
  controls.target.copy(home.target);
  controls.update();
  post.resize();

  // Models load together. Optional display fonts never hold up the first frame.
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => (loadingText.textContent = `LOADING THE COURT… ${Math.round((loaded / total) * 100)}%`);
  const loader = new GLTFLoader(manager);
  const base = import.meta.env.BASE_URL;
  const [parkGltf, ballerGltf, fansGltf] = await Promise.all([
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
  const moments = createMoments();
  scene.add(moments.group);

  let demo = readDemoPref();
  let state: ArenaState = await loadArenaState(demo);
  function applyState() {
    park.setState(state);
    crowd.setState(state);
    canvas.dataset.demo = String(state.demo);
    document.getElementById('cinematic-disclosure')!.textContent = state.demo ? 'FICTIONAL DEMO · Brands & activity simulated' : 'COURT PREVIEW · Checkout is not live';
  }
  applyState();
  const underpainting = new Image();
  underpainting.decoding = 'async';
  underpainting.onload = () => { setMuralUnderpainting(underpainting); park.setState(state); };
  // The optional art arrives after the interactive court; procedural murals are the fallback.
  requestAnimationFrame(() => { underpainting.src = `${base}textures/mural-underpainting.webp`; });
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
    const slot = slotOf(ref)!;
    const distance = ref.kind === 'banner' ? 21 : ref.kind === 'mural' ? 28 : 30;
    const camera = slot.center.clone().addScaledVector(slot.normal, distance * back).add(new THREE.Vector3(0, ref.kind === 'screen' || ref.kind === 'naming' ? 0 : 5, 0));
    return { target: slot.center.clone(), camera };
  }

  // --- Selection & camera moves ---------------------------------------------
  type View = 'overview' | 'courtside' | 'crowd';
  let currentView: View = 'overview';
  let followAction = false;
  let selected: SpotRef | null = null;
  let fly: { fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3; t: number } | null = null;

  function focus(ref: SpotRef) {
    followAction = false;
    selected = ref;
    const view = spotView(ref);
    keepInsideStreets(view.camera);
    fly = { fromT: controls.target.clone(), toT: view.target, fromP: camera.position.clone(), toP: view.camera, t: 0 };
    controls.autoRotate = false;
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
    ui.setTrailerMode(trailer);
    document.body.classList.toggle('trailer', trailer);
    controls.enabled = !trailer;
    hint.hidden = !trailer;
    if (trailer) {
      gameplay.watch();
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

  function actionView() {
    const subject = game.cinematicTarget;
    const dir = game.attackingDirection;
    const dunk = game.cinematicMode === 'dunk';
    const distance = isPortrait() ? 1.4 : 1;
    wantTarget.copy(subject);
    wantTarget.y = dunk ? 8 : Math.max(4, subject.y);
    wantPos.set(
      THREE.MathUtils.clamp(subject.x + dir * (dunk ? -8 : game.cinematicMode === 'drive' ? -5 : 11) * distance, -54, 54),
      dunk ? 11 : 9,
      subject.z + (dunk ? 23 : 18) * distance,
    );
  }

  function updateTrailer(dt: number) {
    trailerT += dt;
    const beat = trailerT % 26;
    if (stillAt > 0 || game.cinematicMode === 'drive' || game.cinematicMode === 'dunk' || (beat > 5 && beat < 15)) {
      actionView();
    } else if (beat >= 15 && beat < 20) {
      wantPos.set(16 - (beat - 15) * 2, 7, -16);
      wantTarget.set(-5, 7, -37);
    } else {
      const a = trailerT * 0.025 + 0.78;
      wantPos.set(Math.cos(a) * 51, 27 + 3 * Math.sin(trailerT * 0.1), Math.sin(a) * 40);
      wantTarget.set(0, 7, -8);
    }
    const speed = game.cinematicMode === 'dunk' ? 3 : 1.4;
    camera.position.lerp(wantPos, 1 - Math.exp(-dt * speed));
    keepInsideStreets(camera.position);
    trailerTarget.lerp(wantTarget, 1 - Math.exp(-dt * 2.5));
    camera.lookAt(trailerTarget);
    if (trailerT > nextWave) {
      crowd.startWave();
      nextWave = trailerT + 24;
    }
  }

  function setView(view: View) {
    if (trailer) toggleTrailer();
    ui.hidePanels();
    clearFocus();
    currentView = view;
    followAction = view === 'courtside';
    controls.autoRotate = false;
    const shot = view === 'overview' ? homeView() : view === 'crowd'
      ? { camera: new THREE.Vector3(14, 7, -17), target: new THREE.Vector3(0, 6, -37) }
      : (actionView(), { camera: wantPos.clone(), target: wantTarget.clone() });
    fly = { fromT: controls.target.clone(), toT: shot.target, fromP: camera.position.clone(), toP: shot.camera, t: 0 };
    ui.setView(view);
  }

  function playHighlight() {
    gameplay.watch();
    game.playHighlight();
    setView('courtside');
    crowd.startWave();
    ui.setHighlightPlaying(true);
    window.setTimeout(() => ui.setHighlightPlaying(false), 7000);
  }

  // --- UI --------------------------------------------------------------------
  let previewOriginal: ArenaState | null = null;
  let previewTimer = 0;
  function restorePreview() {
    window.clearTimeout(previewTimer);
    if (!previewOriginal) return;
    state = previewOriginal;
    previewOriginal = null;
    applyState();
    ui.render(state);
    if (selected) ui.showSpot(selected);
  }
  function previewTakeover() {
    restorePreview();
    previewOriginal = state;
    const brand = { id: 'local-takeover-preview', name: 'Moonstep Works', tagline: 'A little air. A lot of ambition.', url: 'https://example.com', color: '#48675e', accent: '#ffe0a1' };
    state = { ...state, demo: true, brands: { ...state.brands, [brand.id]: brand }, naming: { ...state.naming, brandId: brand.id }, totalSalesCents: null };
    applyState();
    ui.render(state);
    focus({kind: 'naming'});
    ui.hidePanels();
    moments.group.position.copy(NAMING_SLOT.center);
    if (!reducedMotion) moments.start(brand.color, brand.accent);
    crowd.cheer();
    ui.showToast('Demo takeover preview · the original court returns in 8 seconds.');
    previewTimer = window.setTimeout(restorePreview, 8000);
  }
  async function toggleDemo() {
    restorePreview();
    demo = !demo;
    saveDemoPref(demo);
    state = await loadArenaState(demo);
    applyState();
    ui.render(state);
    if (selected) ui.showSpot(selected);
  }

  const ui = createUI({
    focus, clearFocus, toggleTrailer, toggleDemo: () => void toggleDemo(), setView, playHighlight, previewTakeover,
    onShare: async (ref) => {
      const previousPosition = camera.position.clone();
      const previousRotation = camera.quaternion.clone();
      const previousHighlight = highlight.visible;
      const shot = spotView(ref);
      let card: Promise<void>;
      try {
        camera.position.copy(shot.camera);
        camera.lookAt(shot.target);
        highlight.visible = false;
        park.prepareCapture(ref);
        post.render();
        // The card copies pixels synchronously before its first await.
        card = downloadSpotCard(renderer.domElement, state, ref);
      } finally {
        camera.position.copy(previousPosition);
        camera.quaternion.copy(previousRotation);
        highlight.visible = previousHighlight;
        post.render();
      }
      await card;
    },
  });
  ui.render(state);
  const gameplay = createGameplay(game, () => setView('courtside'));
  const recording = createRecording(canvas, ui.showToast);
  function disableShadows() {
    if (!renderer.shadowMap.enabled) return;
    renderer.shadowMap.enabled = false;
    sun.castShadow = false;
    // Changing shadowMap.enabled alone does not invalidate compiled USE_SHADOWMAP
    // variants. Recompile before releasing their texture, or they sample freed data.
    scene.traverse(object => {
      const material = (object as THREE.Mesh).material;
      if (material) for (const entry of Array.isArray(material) ? material : [material]) entry.needsUpdate = true;
    });
  }
  function lowerGraphics() {
    if (post.quality === 'low') disableShadows();
    post.degrade();
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  const diagnostics = createDiagnostics(game, renderer, () => post.quality, lowerGraphics, disableShadows);

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
    followAction = false;
    fly = null;
  });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
    const key = e.key.toLowerCase();
    if (key === 't') toggleTrailer();
    else if (key === 'escape') {
      if (trailer) toggleTrailer();
      else {
        ui.hidePanels();
        clearFocus();
      }
    } else if (key === 'w' && !gameplay.manual) crowd.startWave();
    else if (key === '1') setView('overview');
    else if (key === '2') setView('courtside');
    else if (key === '3') setView('crowd');
    else if (key === 'h') playHighlight();
  });

  // Local-only hook for scripted checks; stripped from production builds.
  if (import.meta.env.DEV) Object.assign(window, { __court: { focus, pickAt, toggleTrailer, startWave: crowd.startWave, game, camera, controls, renderer, post, scene, setView, playHighlight } });

  window.addEventListener('resize', () => {
    fitCamera();
    post.resize();
    if (!selected && !trailer) setView(currentView);
  });

  // --- Loop ------------------------------------------------------------------
  let last = performance.now();
  let elapsed = 0;
  let firstFrame = true;
  let metricsTime = 0;
  let metricsFrames = 0;
  let sampleTime = 0;
  let sampleFrames = 0;
  let adaptations = 0;
  let pageVisible = !document.hidden;
  document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; last = performance.now(); });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFallback('The graphics connection paused. Reload to return to the court.');
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  const startView = params.get('view') ?? (isPortrait() ? 'courtside' : 'overview');
  if (startView === 'courtside' || startView === 'crowd') setView(startView);
  if (params.get('highlight') === '1') playHighlight();
  if (params.get('trailer') === '1') toggleTrailer();
  renderer.setAnimationLoop((now: number) => {
    if (!pageVisible) return;
    const rawDt = (now - last) / 1000;
    const dt = Math.min(rawDt, 0.05);
    last = now;
    const simDt = stillAt > 0 ? Math.max(0, Math.min(dt, stillAt - elapsed)) : dt;
    elapsed += simDt;

    game.update(simDt, elapsed);
    park.update(elapsed, simDt, game);
    crowd.update(elapsed, simDt);
    moments.update(simDt);

    if (trailer) updateTrailer(dt);
    else {
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / 1.0);
        const k = easeInOutCubic(fly.t);
        controls.target.lerpVectors(fly.fromT, fly.toT, k);
        camera.position.lerpVectors(fly.fromP, fly.toP, k);
        if (fly.t >= 1) fly = null;
      } else if (followAction && !selected && !reducedMotion) {
        actionView();
        camera.position.lerp(wantPos, 1 - Math.exp(-dt * 2));
        controls.target.lerp(wantTarget, 1 - Math.exp(-dt * 3));
      }
      controls.update(dt);
      keepInsideStreets(camera.position);
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -70, 70);
      controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 60);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -76, 60);
      hover(now);
    }

    if (elapsed > 5 && adaptations < 2 && !params.has('quality')) {
      sampleTime += rawDt;
      sampleFrames++;
      if (sampleTime > 4) {
        // A stable 30 Hz presentation cadence is playable; degrade only below it.
        if (sampleFrames / sampleTime < 28) {
          lowerGraphics();
          adaptations++;
        } else adaptations = 2;
        sampleTime = 0;
        sampleFrames = 0;
      }
    }
    renderer.info.reset();
    post.render();
    recording.frame();
    gameplay.update();
    diagnostics.frame(rawDt, elapsed);
    metricsTime += rawDt;
    metricsFrames++;
    if (metricsTime >= 2) {
      const fps = Math.round(metricsFrames / metricsTime);
      canvas.dataset.fps = String(fps);
      canvas.dataset.quality = post.quality;
      canvas.dataset.calls = String(renderer.info.render.calls);
      canvas.dataset.triangles = String(renderer.info.render.triangles);
      metricsTime = 0;
      metricsFrames = 0;
    }
    if (firstFrame) {
      firstFrame = false;
      document.getElementById('loading')?.remove();
    }
  });
}

function showFallback(message: string) {
  document.getElementById('loading')?.remove();
  document.getElementById('ui')?.setAttribute('hidden', '');
  const fallback = document.createElement('section');
  fallback.id = 'graphics-fallback';
  fallback.style.cssText = 'position:fixed;inset:0;z-index:60;display:grid;place-content:center;padding:24px;background:#191b20;color:#f5edda;text-align:center;font:16px system-ui';
  const image = document.createElement('img');
  image.src = `${import.meta.env.BASE_URL}court-preview.jpg`;
  image.alt = 'Preview of the fictional street basketball court';
  image.style.cssText = 'width:min(100%,800px);max-height:60vh;object-fit:cover;border-radius:12px';
  const text = document.createElement('p');
  text.textContent = message;
  const retry = document.createElement('a');
  const url = new URL(location.href);
  url.searchParams.set('quality', 'low');
  url.searchParams.delete('preview');
  retry.href = url.href;
  retry.textContent = 'Open with lighter graphics →';
  retry.style.color = '#f4c967';
  const disclosure = document.createElement('small');
  disclosure.textContent = 'FICTIONAL DEMO · Static preview';
  fallback.append(image, disclosure, text, retry);
  document.body.append(fallback);
}

main().catch((err) => {
  console.error(err);
  showFallback('The interactive court could not load on this device. Here is a preview.');
});
