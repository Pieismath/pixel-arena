import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FLOOR, RIM, TEAMS, THREE_POINT } from '../config';
import { mulberry32 } from '../data/random';
import { numberTexture, type Scoreboard } from './signs';
import { BALL_FLOOR, BALL_RADIUS, createBasketball, createBallContactShadow } from './ball';

type TeamId = 0 | 1;
/** fetch → inbound → advance → set ⇄ pass → shot → (fetch | loose) */
type Phase = 'fetch' | 'inbound' | 'advance' | 'set' | 'pass' | 'shot' | 'drive' | 'dunk' | 'loose';
type Clip = 'Idle' | 'Run' | 'RunDribble' | 'IdleDribble' | 'Defend' | 'Shoot' | 'Pass' | 'Celebrate' | 'Dunk' | 'Catch' | 'Crossover' | 'Shuffle' | 'Jump' | 'Land' | 'Rebound';
export type QaScenario = 'pass' | 'shot-make' | 'shot-miss' | 'dunk' | 'rebound' | 'reset' | 'crossover';

const SKINS = ['#dfac8d', '#cf986f', '#b77c55', '#925c3e', '#65432f', '#a86d4b'];
const HAIR_COLORS = ['#1b1412', '#2e1f16', '#4a2f1d', '#80603b', '#1b1412'];
const LOOKS: string[][] = [['HairBuzz'], ['HairAfro'], ['HairTwists', 'Headband'], ['HairBuzz', 'HairBeard'], ['HairTwists'], ['HairAfro', 'Headband'], ['HairBuzz', 'Headband'], ['HairTwists', 'HairBeard']];
// Region order matches PLAYER_MATS in blender/build_characters.py.
const REGIONS = ['Skin', 'Jersey', 'Trim', 'Shorts', 'Socks', 'Shoe', 'Sole', 'EyeWhite', 'Dark', 'Hair'] as const;
const FPS = 24;
const SHOOT_RELEASE = 14 / FPS;
const DUNK_RELEASE = 18 / FPS;
const PASS_RELEASE = 5 / FPS;
const dirOf = (team: TeamId) => (team === 0 ? 1 : -1);

// Offensive spots relative to the rim being attacked, written for a team attacking +x.
const SPOTS = [
  new THREE.Vector2(-25, 0),
  new THREE.Vector2(-19, 15),
  new THREE.Vector2(-19, -15),
  new THREE.Vector2(-1.5, 22.8),
  new THREE.Vector2(-7, -7.5),
];

/** One draw call per body: every face carries a region code; the palette is per player. */
function playerMaterial(colors: THREE.Color[]) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const uniforms = { uPalette: { value: colors } };
  m.userData.palette = uniforms;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPalette = uniforms.uPalette;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 region;\nuniform vec3 uPalette[${REGIONS.length}];\nvarying vec3 vRegionColor;\nvarying vec3 vClothPosition;\nvarying float vRegion;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        int ri = int(floor(region.r * 16.0));
        vRegion = float(ri);
        vClothPosition = position;
        vRegionColor = uPalette[0];
        for (int i = 1; i < ${REGIONS.length}; i++) { if (i == ri) vRegionColor = uPalette[i]; }
        vRegionColor *= region.g > 0.1 ? region.g : 1.0;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRegionColor;\nvarying vec3 vClothPosition;\nvarying float vRegion;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        float isCloth = step(0.5, vRegion) * (1.0 - step(4.5, vRegion));
        vec2 weaveUV = vec2(vClothPosition.x * 72.0, vClothPosition.y * 64.0 + vClothPosition.z * 77.0);
        float visibleWeave = 1.0 - smoothstep(0.7, 2.2, max(fwidth(weaveUV.x), fwidth(weaveUV.y)));
        float knit = sin(weaveUV.x) * sin(weaveUV.y);
        float fabric = 1.0 + isCloth * knit * visibleWeave * 0.075;
        vec4 diffuseColor = vec4(diffuse * vRegionColor * fabric, opacity);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float micro = sin(vClothPosition.x * 183.0) * sin(vClothPosition.y * 197.0) * sin(vClothPosition.z * 171.0);
        float poreAA = 1.0 - smoothstep(.45, 1.2, length(fwidth(vClothPosition * 183.0)));
        roughnessFactor = vRegion < .5 ? .63 + micro * poreAA * .035 :
          (vRegion > 8.5 ? .96 : (vRegion > 6.5 && vRegion < 8.5 ? .34 : (vRegion > 4.5 && vRegion < 5.5 ? .77 : .9)));`);
  };
  return m;
}

/** Ink outline that stays about the same thickness on screen at any distance. */
const outlineMaterial = (() => {
  const m = new THREE.MeshBasicMaterial({ color: '#352132', side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: 0.0003 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float outlineWidth;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      #ifdef USE_SKINNING
        vec3 outlineN = objectNormal;
      #else
        vec3 outlineN = normal;
      #endif
      vec4 clipN = projectionMatrix * vec4(normalize(normalMatrix * outlineN), 0.0);
      vec2 dir = clipN.xy / max(length(clipN.xy), 1e-4);
      dir.x *= projectionMatrix[0][0] / projectionMatrix[1][1];
      gl_Position.xy += dir * outlineWidth * gl_Position.w;`,
    );
  };
  return m;
})();

interface Player {
  team: TeamId;
  slot: number;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<Clip, THREE.AnimationAction>;
  current: Clip;
  /** Seconds left in a one-shot clip (shot, pass, celebration) that shouldn't be interrupted. */
  busy: number;
  hand: THREE.Object3D;
  leftHand: THREE.Object3D;
  aim: number | null;
  pos: THREE.Vector2;
  target: THREE.Vector2;
  heading: number;
  speed: number;
  reach: number;
  height: number;
  depth: number;
  dunkGrip: THREE.Vector3;
  contactShadow: ReturnType<typeof createBallContactShadow>;
  feet: THREE.Object3D[];
}

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Negative while the ball is still in the passer's or shooter's hand. */
  t: number;
  dur: number;
  arc: number;
  launched: boolean;
  holder?: Player;
  receiver?: Player;
  gatherFrom?: THREE.Vector3;
  release?: number;
  purpose: 'pass' | 'shot' | 'dunk' | 'score' | 'rebound';
  done: () => void;
}

type BallMode =
  | { kind: 'held'; owner: Player; gatherFrom: THREE.Vector3; gatherAge: number; gatherDuration: number }
  | { kind: 'flight'; flight: Flight }
  | { kind: 'loose'; velocity: THREE.Vector3 };

/** Position is always in the game's court space; bone world matrices are converted exactly once.
 * The single mode union prevents simultaneous possession/flight/rest owners. */
interface BallState { position: THREE.Vector3; mode: BallMode }

/** Deterministic streetball simulation; the ball has one owner and one persistent scene mesh. */
export class GameSim implements Scoreboard {
  readonly group = new THREE.Group();
  score: [number, number] = [0, 0];
  quarter = 1;
  clock = 720;
  onScore: ((team: TeamId, points: number) => void) | null = null;

  private readonly ball: THREE.Mesh;
  private readonly ballShadow = createBallContactShadow();
  private readonly ballState: BallState = { position: new THREE.Vector3(0, BALL_FLOOR, 0), mode: { kind: 'loose', velocity: new THREE.Vector3() } };
  private readonly ballWorld = new THREE.Vector3();
  private readonly previousBall = new THREE.Vector3();
  private maxBallStep = 0;
  private simulationTime = 0;
  private frameCount = 0;
  private lastTransition = 'initialize';
  private transitionCount = 0;
  private manualControl = false;
  private readonly manualInput = new THREE.Vector2();
  private queuedAction: 'shoot' | 'pass' | 'crossover' | null = null;
  private forcedMake: boolean | null = null;
  private pendingScenario: QaScenario | null = null;
  private readonly rnd = mulberry32(99);
  private readonly teams: Player[][] = [[], []];
  private readonly players: Player[] = [];
  private offense: TeamId = 0;
  private phase: Phase = 'advance';
  private get holder(): Player | null { return this.ballState.mode.kind === 'held' ? this.ballState.mode.owner : null; }
  private get flight(): Flight | null { return this.ballState.mode.kind === 'flight' ? this.ballState.mode.flight : null; }
  private get ballPos(): THREE.Vector3 { return this.ballState.position; }
  private timer = 0;
  private passesLeft = 0;
  private possessions = 0;
  private highlightNext = true;
  private cinematicHold = 0;
  private featured: Player | null = null;
  private dunker: Player | null = null;
  private dunkTime = 0;
  private readonly dunkFrom = new THREE.Vector2();
  private readonly dunkTo = new THREE.Vector2();
  private readonly cameraTarget = new THREE.Vector3();
  private spotOf = [0, 1, 2, 3, 4];
  private readonly ballRest = new THREE.Vector3(0, BALL_FLOOR, 0);
  private readonly tmp = new THREE.Vector2();
  private readonly tmp3 = new THREE.Vector3();

  constructor(gltf: GLTF) {
    this.group.name = 'game';
    for (const team of [0, 1] as TeamId[]) {
      for (let slot = 0; slot < 5; slot++) {
        const p = this.buildPlayer(gltf, team, slot);
        const side = team === 0 ? -1 : 1;
        p.pos.set(side * (4 + slot * 3), (slot - 2) * 6);
        p.target.copy(p.pos);
        this.teams[team].push(p);
        this.players.push(p);
      }
    }
    this.ball = createBasketball();
    this.group.add(this.ball, this.ballShadow);
    for (const p of this.players) { p.root.position.set(p.pos.x, 0, p.pos.y); p.root.rotation.y = p.heading; }
    this.group.updateMatrixWorld(true);
    this.handWorld(this.teams[0][0], this.ballPos);
    this.gainPossession(this.teams[0][0], 0);
    this.syncBallMesh(0);
    this.featured = this.holder;
  }

  get ballPosition(): THREE.Vector3 {
    return this.group.localToWorld(this.ballWorld.copy(this.ballPos));
  }

  /** Current action focus, independent of the airborne ball so close cameras stay stable. */
  get cinematicTarget(): THREE.Vector3 {
    const p = this.dunker ?? this.featured ?? this.holder ?? this.players[0];
    const lift = this.dunker ? Math.max(0, Math.sin(Math.min(1, this.dunkTime / 1.2) * Math.PI)) * 2.6 : 0;
    return this.cameraTarget.set(p.pos.x, 3.7 + lift, p.pos.y);
  }

  get cinematicMode(): 'play' | 'drive' | 'dunk' | 'celebrate' {
    if (this.phase === 'dunk' || this.dunker) return 'dunk';
    if (this.phase === 'drive') return 'drive';
    return this.cinematicHold > 0 ? 'celebrate' : 'play';
  }

  get attackingDirection(): number { return dirOf((this.dunker ?? this.featured ?? this.holder)?.team ?? this.offense); }

  /** Start a highlight from the current possession; never teleport players or the live ball. */
  playHighlight(): void {
    this.highlightNext = true;
    this.cinematicHold = 0;
    if (this.holder && !this.dunker) {
      this.holder.busy = 0;
      this.beginDrive();
    }
  }

  update(dt: number, _t: number) {
    dt = THREE.MathUtils.clamp(dt, 0, 0.05);
    this.simulationTime += dt;
    this.frameCount++;
    this.previousBall.copy(this.ballPos);
    this.clock -= dt;
    if (this.clock <= 0) {
      this.clock = 720;
      this.quarter++;
      if (this.quarter > 4) {
        this.quarter = 1;
        this.score = [0, 0];
      }
    }
    this.timer -= dt;
    this.cinematicHold = Math.max(0, this.cinematicHold - dt);
    this.assignTargets();
    if (this.pendingScenario && this.holder) { const scenario = this.pendingScenario; this.pendingScenario = null; this.runQaScenario(scenario); }
    this.think();
    for (const p of this.players) this.movePlayer(p, dt);
    this.separate(dt);
    if (this.dunker) {
      this.dunkTime += dt;
      // The approach travels under the ball hand; all vertical movement is authored in the rig.
      const travel = THREE.MathUtils.smoothstep(this.dunkTime, 0.12, DUNK_RELEASE);
      this.dunker.pos.lerpVectors(this.dunkFrom, this.dunkTo, travel);
      if (this.dunkTime >= this.dunker.actions.Dunk.getClip().duration) {
        const landed = this.dunker; this.dunker = null;
        this.playOnce(landed, 'Land', landed.actions.Land.getClip().duration);
      }
    }
    for (const p of this.players) {
      p.busy = Math.max(0, p.busy - dt);
      this.animate(p);
      p.mixer.update(dt);
      const jumpWeight = this.dunker === p
        ? THREE.MathUtils.smoothstep(this.dunkTime, .20, .5) * (1 - THREE.MathUtils.smoothstep(this.dunkTime, .85, p.actions.Dunk.getClip().duration)) : 0;
      p.root.position.set(p.pos.x, (10.15 - p.dunkGrip.y) * jumpWeight, p.pos.y);
      p.root.rotation.y = p.heading;
    }
    this.group.updateMatrixWorld(true);
    for(const p of this.players) {
      let footHeight=0;
      if(p.feet.length) footHeight=Math.min(...p.feet.map(foot=>{foot.getWorldPosition(this.tmp3);this.group.worldToLocal(this.tmp3);return this.tmp3.y;}));
      p.contactShadow.position.set(p.pos.x,.071,p.pos.y);
      p.contactShadow.material.opacity=.42/(1+Math.max(0,footHeight-.25)*.65);
    }
    this.updateBall(dt);
    this.maxBallStep = Math.max(this.maxBallStep, this.previousBall.distanceTo(this.ballPos));
    if (this.holder && this.cinematicHold <= 0 && !this.dunker) this.featured = this.holder;
  }

  // --- Decisions -------------------------------------------------------------

  private spotWorld(team: TeamId, spot: number, out: THREE.Vector2) {
    const s = SPOTS[spot];
    return out.set(dirOf(team) * (RIM.x + s.x), s.y);
  }

  private assignTargets() {
    const off = this.offense;
    const dir = dirOf(off);
    const offense = this.teams[off];
    const defense = this.teams[1 - off];
    for (const p of offense) {
      if (p.busy > 0 && p.current === 'Celebrate') continue;
      this.spotWorld(off, this.spotOf[p.slot], p.target);
    }
    for (const p of defense) {
      if (p.busy > 0 && p.current === 'Celebrate') continue;
      const man = offense[p.slot].pos;
      this.tmp.set(dir * RIM.x - man.x, -man.y).normalize();
      p.target.copy(man).addScaledVector(this.tmp, 3.4);
    }
    if (this.phase === 'drive' && this.holder) {
      // Keep a lane open while the off-ball players flare toward the wings.
      this.holder.target.set(dir * (RIM.x - 4.8), -.8);
      for (const p of offense) if (p !== this.holder) p.target.y *= 1.12;
      const marker = defense[this.holder.slot];
      marker.target.copy(this.holder.pos).add(new THREE.Vector2(-dir * 2.7, 3.5));
    }
    if (this.phase === 'fetch') offense[1].target.set(this.ballRest.x, this.ballRest.z);
    else if (this.phase === 'inbound') {
      offense[1].target.set(-dir * 48.5, 3);
      offense[0].target.set(-dir * 38, -8);
    } else if (this.phase === 'loose') {
      for (const team of this.teams) {
        const chasers = [...team].sort((a, b) => this.distToRest(a) - this.distToRest(b)).slice(0, 2);
        for (const p of chasers) p.target.set(this.ballRest.x, this.ballRest.z);
      }
    }
    // Receivers show a target and plant their feet; release and landing poses keep their support foot.
    for (const p of this.players) if (p.busy > 0 && ['Shoot', 'Pass', 'Dunk', 'Catch', 'Rebound', 'Land', 'Jump', 'Crossover'].includes(p.current)) p.target.copy(p.pos);
    if (this.manualControl && this.holder && this.holder.busy <= 0 && !['fetch', 'inbound'].includes(this.phase)) {
      this.holder.target.copy(this.holder.pos).addScaledVector(this.manualInput, 8);
    }
  }

  private distToRest(p: Player) {
    return Math.hypot(p.pos.x - this.ballRest.x, p.pos.y - this.ballRest.z);
  }

  private think() {
    if (this.manualControl && this.holder && !['fetch', 'inbound'].includes(this.phase)) {
      if (this.queuedAction && this.holder.busy <= 0) {
        const action = this.queuedAction; this.queuedAction = null;
        if (action === 'shoot') {
          if (Math.hypot(this.holder.pos.x - dirOf(this.offense) * RIM.x, this.holder.pos.y) < 5.7) this.dunk(); else this.shoot();
        } else if (action === 'pass') this.passToTeammate();
        else this.playOnce(this.holder, 'Crossover', this.holder.actions.Crossover.getClip().duration);
      }
      return;
    }
    switch (this.phase) {
      case 'fetch': {
        const inbounder = this.teams[this.offense][1];
        if (this.distToRest(inbounder) < 1.8) {
          this.gainPossession(inbounder, .3);
          this.playOnce(inbounder, 'Catch', .35);
          this.phase = 'inbound';
          this.timer = 0.6;
        }
        break;
      }
      case 'inbound': {
        const h = this.holder;
        if (h && this.timer <= 0 && h.pos.distanceTo(h.target) < 1.5) this.pass(this.teams[this.offense][0], () => (this.phase = 'advance'));
        break;
      }
      case 'advance': {
        const h = this.holder;
        if (h && h.pos.distanceTo(this.spotWorld(this.offense, this.spotOf[h.slot], this.tmp)) < 3) {
          this.phase = 'set';
          this.timer = 0.5 + this.rnd() * 0.5;
        }
        break;
      }
      case 'set':
        if (this.timer <= 0 && this.holder && this.holder.busy <= 0) {
          if (this.passesLeft > 0) this.passToTeammate();
          else if (this.highlightNext || this.possessions % 3 !== 2) this.beginDrive();
          else this.shoot();
        }
        break;
      case 'drive':
        if (this.holder && Math.hypot(this.holder.pos.x - dirOf(this.offense) * RIM.x, this.holder.pos.y) < 5.7) this.dunk();
        break;
      case 'loose':
        this.checkPickup();
        break;
      case 'pass':
      case 'shot':
      case 'dunk':
        break;
    }
  }

  private play(p: Player, clip: Clip, fade = 0.2, timeScale = 1) {
    const next = p.actions[clip];
    next.timeScale = timeScale;
    if (p.current === clip) return;
    const previous = p.actions[p.current];
    const ballMode = this.ballState.mode;
    if (ballMode.kind === 'held' && ballMode.owner === p) {
      ballMode.gatherFrom.copy(this.ballPos); ballMode.gatherAge = 0; ballMode.gatherDuration = fade;
    }
    const locomotion = ['Run','RunDribble','Shuffle'].includes(clip) && ['Run','RunDribble','Shuffle'].includes(p.current);
    const stridePhase = (previous.time / previous.getClip().duration) % 1;
    const dribbling = (clip === 'RunDribble' || clip === 'IdleDribble') && (p.current === 'RunDribble' || p.current === 'IdleDribble');
    const phase = dribbling ? (previous.time / this.dribblePeriod(p.current, previous.getClip().duration)) % 1 : .5;
    next.reset().fadeIn(fade).play();
    if (locomotion) next.time = stridePhase * next.getClip().duration;
    if (!locomotion && (clip === 'RunDribble' || clip === 'IdleDribble')) next.time = phase * this.dribblePeriod(clip, next.getClip().duration);
    p.actions[p.current].fadeOut(fade);
    p.current = clip;
  }

  private playOnce(p: Player, clip: Clip, duration: number) {
    const mode = this.ballState.mode;
    if (mode.kind === 'held' && mode.owner === p && mode.gatherAge >= mode.gatherDuration) {
      mode.gatherFrom.copy(this.ballPos); mode.gatherAge = 0; mode.gatherDuration = .18;
    }
    const action = p.actions[clip];
    action.reset();
    action.timeScale = 1;
    action.fadeIn(0.08).play();
    if (p.current !== clip) p.actions[p.current].fadeOut(0.08);
    p.current = clip;
    p.busy = duration;
    p.speed = 0;
  }

  private pass(receiver: Player, onCatch: () => void) {
    const passer = this.holder!;
    this.playOnce(passer, 'Pass', 0.5);
    this.face(passer, receiver.pos);
    this.phase = 'pass';
    this.startFlight({
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      t: -PASS_RELEASE,
      dur: 0,
      arc: 0,
      launched: false,
      holder: passer,
      receiver,
      release: PASS_RELEASE,
      gatherFrom: this.ballPos.clone(),
      purpose: 'pass',
      done: () => {
        this.gainPossession(receiver, .12);
        this.playOnce(receiver, 'Catch', .3);
        onCatch();
      },
    });
    const flight = this.flight!;
    this.handWorld(receiver, flight.to);
    flight.dur = 0.15 + passer.pos.distanceTo(receiver.pos) / 42;
    flight.arc = 0.8 + passer.pos.distanceTo(receiver.pos) * 0.025;
    this.face(receiver, passer.pos);
    this.playOnce(receiver, 'Catch', PASS_RELEASE + flight.dur + .12);
  }

  private passToTeammate() {
    const holder = this.holder!;
    const mates = this.teams[this.offense].filter((p) => p !== holder);
    const receiver = mates[Math.floor(this.rnd() * mates.length)];
    this.pass(receiver, () => {
      this.passesLeft--;
      const others = [0, 1, 2, 3, 4].filter((s) => s !== receiver.slot);
      const a = others[Math.floor(this.rnd() * others.length)];
      const b = others[Math.floor(this.rnd() * others.length)];
      [this.spotOf[a], this.spotOf[b]] = [this.spotOf[b], this.spotOf[a]];
      this.phase = 'set';
      this.timer = 0.35 + this.rnd() * 0.5;
    });
  }

  private beginDrive() {
    if (!this.holder) return;
    this.phase = 'drive';
    this.featured = this.holder;
    this.highlightNext = false;
    this.timer = 0;
  }

  private dunk() {
    const p = this.holder!;
    const dir = dirOf(this.offense);
    this.featured = p;
    this.dunker = p;
    this.dunkTime = 0;
    this.dunkFrom.copy(p.pos);
    // Right-handed finish: offset the torso to put the extended hand over the rim.
    this.dunkTo.set(dir * (RIM.x - p.dunkGrip.z), dir * p.dunkGrip.x);
    this.face(p, this.tmp.set(dir * (RIM.x + 2), p.pos.y));
    p.speed = 0;
    this.playOnce(p, 'Dunk', p.actions.Dunk.getClip().duration);
    this.phase = 'dunk';
    this.startFlight({
      from: new THREE.Vector3(),
      to: new THREE.Vector3(dir * RIM.x, RIM.y - .25, 0),
      t: -DUNK_RELEASE,
      dur: .14,
      arc: .05,
      launched: false,
      holder: p,
      release: DUNK_RELEASE,
      gatherFrom: this.ballPos.clone(),
      purpose: 'dunk',
      done: () => this.scored(2, p),
    });
  }

  private shoot() {
    const shooter = this.holder!;
    this.featured = shooter;
    const dir = dirOf(this.offense);
    const rim = new THREE.Vector3(dir * RIM.x, RIM.y + 0.4, 0);
    const d = Math.hypot(shooter.pos.x - rim.x, shooter.pos.y);
    const three = d > THREE_POINT.radius || (Math.abs(shooter.pos.y) > THREE_POINT.cornerZ && d > 21.5);
    const make = this.forcedMake ?? this.rnd() < (three ? 0.42 : 0.56);
    this.forcedMake = null;
    this.face(shooter, this.tmp.set(rim.x, rim.z));
    this.playOnce(shooter, 'Shoot', shooter.actions.Shoot.getClip().duration);
    const contest = this.teams[1 - shooter.team].find(p => p.busy <= 0 && p.pos.distanceTo(shooter.pos) < 7);
    if (contest) { this.face(contest, shooter.pos); this.playOnce(contest, 'Jump', contest.actions.Jump.getClip().duration); }
    this.phase = 'shot';
    this.startFlight({
      from: new THREE.Vector3(),
      to: make ? rim : new THREE.Vector3(dir * (RIM.x - 0.7), RIM.y + 0.5, (this.rnd() - 0.5) * 1.2),
      t: -SHOOT_RELEASE,
      dur: 0.8 + d / 55,
      arc: Math.max(4, 3 + d * 0.3),
      launched: false,
      holder: shooter,
      release: SHOOT_RELEASE,
      gatherFrom: this.ballPos.clone(),
      purpose: 'shot',
      done: () => (make ? this.scored(three ? 3 : 2, shooter) : this.missed()),
    });
  }

  private scored(points: number, shooter: Player) {
    const team = shooter.team;
    this.score[team] += points;
    this.onScore?.(team, points);
    this.possessions++;
    this.featured = shooter;
    this.cinematicHold = 2.8;
    // Finish the landing before celebrating a dunk; nearby teammates react immediately.
    if (shooter.current !== 'Dunk') this.playOnce(shooter, 'Celebrate', 1.7);
    for (const p of this.teams[team]) {
      if (p !== shooter && p.pos.distanceTo(shooter.pos) < 30) this.playOnce(p, 'Celebrate', 1.2 + p.slot * .12);
    }
    const at = this.ballPos.clone();
    this.startFlight({
      from: at,
      to: new THREE.Vector3(at.x, BALL_FLOOR, at.z),
      t: 0,
      dur: 0.45,
      arc: 0,
      launched: true,
      purpose: 'score',
      done: () => {
        this.releaseLoose(new THREE.Vector3(0, 6, 0));
        this.ballRest.set(at.x, BALL_FLOOR, at.z);
        this.offense = (1 - team) as TeamId;
        this.passesLeft = this.possessions % 3 === 0 ? 0 : 1 + Math.floor(this.rnd() * 2);
        this.spotOf = [0, 1, 2, 3, 4];
        this.phase = 'fetch';
      },
    });
  }

  private missed() {
    const dir = dirOf(this.offense);
    const land = new THREE.Vector3(dir * (RIM.x - 4 - this.rnd() * 8), BALL_FLOOR, (this.rnd() - 0.5) * 18);
    this.ballRest.copy(land); this.phase = 'loose';
    this.startFlight({
      from: this.ballPos.clone(),
      to: land,
      t: 0,
      dur: 0.75,
      arc: 3.5,
      launched: true,
      purpose: 'rebound',
      done: () => {
        this.releaseLoose(new THREE.Vector3(0, 7, 0));
        this.ballRest.copy(land);
        this.phase = 'loose';
      },
    });
  }

  private checkPickup() {
    let best: Player | null = null;
    let bestD = 1.8;
    for (const p of this.players) {
      const d = this.distToRest(p);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best || this.flight) return;
    this.awardRebound(best);
  }

  private awardRebound(best: Player) {
    this.gainPossession(best, .32);
    this.playOnce(best, 'Rebound', best.actions.Rebound.getClip().duration);
    if (best.team === this.offense) {
      this.passesLeft = Math.floor(this.rnd() * 2);
      this.phase = 'set';
      this.timer = 0.4;
    } else {
      this.offense = best.team;
      this.passesLeft = 1 + Math.floor(this.rnd() * 3);
      this.spotOf = [0, 1, 2, 3, 4];
      this.phase = 'advance';
    }
  }

  // --- Motion ----------------------------------------------------------------

  private face(p: Player, at: THREE.Vector2) {
    p.aim = Math.atan2(at.x - p.pos.x, at.y - p.pos.y);
  }

  private movePlayer(p: Player, dt: number) {
    this.tmp.copy(p.target).sub(p.pos);
    const dist = this.tmp.length();
    const maxSpeed = p === this.holder ? (this.phase === 'drive' ? 14 : 10.8) : 12.4;
    const desired = dist > 0.25 && p.busy <= 0 ? Math.min(maxSpeed, dist * 2.2) : p.current === 'Celebrate' ? Math.min(8, dist * 2) : 0;
    p.speed += (desired - p.speed) * (1 - Math.exp(-dt * 5));
    if (dist > 0.001 && p.speed > 0.01) {
      // Turn before sprinting: bodies no longer skate sideways through sharp cuts.
      const turn = Math.atan2(this.tmp.x,this.tmp.y)-p.heading;
      const steering = p.team === this.offense ? .25+.75*Math.max(0,Math.cos(turn)) : 1;
      const travel = Math.min(p.speed*steering*dt,dist);
      p.pos.addScaledVector(this.tmp.normalize(),travel);
      p.speed = travel / Math.max(dt,1e-5);
    }
    const defending = p.team !== this.offense && p.speed < 3;
    const face = p.busy > 0 && p.aim !== null ? p.aim :
      !defending && desired > .1 && dist > 0.25
        ? Math.atan2(this.tmp.x, this.tmp.y)
        : Math.atan2(this.ballPos.x - p.pos.x, this.ballPos.z - p.pos.y);
    let delta = face - p.heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    p.heading += THREE.MathUtils.clamp(delta * (1-Math.exp(-dt*10)), -dt * 5, dt * 5);
    if (p.busy <= 0) p.aim = null;
  }

  private animate(p: Player) {
    if (p.busy > 0) return;
    if (['Jump', 'Rebound', 'Shoot'].includes(p.current)) { this.playOnce(p, 'Land', p.actions.Land.getClip().duration); return; }
    if (p.current === 'Land' && this.cinematicHold > 0 && p === this.featured) { this.playOnce(p, 'Celebrate', 1.2); return; }
    const wasMoving = ['Run','RunDribble','Shuffle'].includes(p.current);
    const moving = p.speed > (wasMoving ? .65 : 1.15);
    const scale = THREE.MathUtils.clamp(p.speed / (6.34121 * p.depth), 0.15, 2.05);
    if (p === this.holder && this.phase !== 'fetch' && this.phase !== 'inbound') this.play(p, moving ? 'RunDribble' : 'IdleDribble', 0.2, moving ? scale : 1);
    else if (moving) {
      const lateral = (p.target.x - p.pos.x) * Math.cos(p.heading) - (p.target.y - p.pos.y) * Math.sin(p.heading);
      if (p.team !== this.offense && p.speed < 3 && Math.abs(lateral) > .2) this.play(p, 'Shuffle', .18, Math.sign(lateral) * p.speed / (2.516097 * p.reach));
      else this.play(p, 'Run', .2, scale);
    }
    else if (p.team !== this.offense) this.play(p, 'Defend');
    else this.play(p, 'Idle');
  }

  private separate(dt: number) {
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i].pos;
        const b = this.players[j].pos;
        const d = a.distanceTo(b);
        if (d < 2.4 && d > 1e-4 && this.players[i] !== this.dunker && this.players[j] !== this.dunker) {
          const push = Math.min((2.4 - d) * .5, dt * 2.5);
          this.tmp.copy(a).sub(b).divideScalar(d);
          const aPlanted = this.players[i].busy > 0, bPlanted = this.players[j].busy > 0;
          if (!aPlanted) a.addScaledVector(this.tmp, bPlanted ? push * 2 : push);
          if (!bPlanted) b.addScaledVector(this.tmp, aPlanted ? -push * 2 : -push);
        }
      }
    }
    const maxX = FLOOR.length / 2 - 1.5;
    const maxZ = FLOOR.width / 2 - 2;
    for (const p of this.players) {
      p.pos.x = THREE.MathUtils.clamp(p.pos.x, -maxX, maxX);
      p.pos.y = THREE.MathUtils.clamp(p.pos.y, -maxZ, maxZ);
    }
  }

  private handWorld(p: Player, out: THREE.Vector3, left = false) {
    (left ? p.leftHand : p.hand).getWorldPosition(out);
    return this.group.worldToLocal(out);
  }

  private gainPossession(owner: Player, duration = .2) {
    this.lastTransition = `catch:${owner.team}/${owner.slot}`;
    this.transitionCount++;
    this.ballState.mode = { kind: 'held', owner, gatherFrom: this.ballPos.clone(), gatherAge: 0, gatherDuration: duration };
  }

  private startFlight(flight: Flight) {
    this.lastTransition = `flight:${flight.purpose}`;
    this.transitionCount++;
    this.ballState.mode = { kind: 'flight', flight };
  }

  private releaseLoose(velocity = new THREE.Vector3()) {
    this.lastTransition = 'loose';
    this.transitionCount++;
    this.ballState.mode = { kind: 'loose', velocity };
    this.ballRest.copy(this.ballPos);
  }

  private dribblePeriod(_clip: Clip, duration: number) { return duration; }

  private updateBall(dt: number) {
    const mode = this.ballState.mode;
    if (mode.kind === 'flight') {
      const f = mode.flight;
      f.t += dt;
      // Pass endpoints follow the receiver's actual animated palm, in the same coordinate space.
      if (f.receiver) this.handWorld(f.receiver, f.to);
      if (f.t < 0 && f.holder) {
        this.handWorld(f.holder, this.tmp3);
        const gather = THREE.MathUtils.smoothstep((f.release ?? 0) + f.t, 0, Math.min(.16, f.release ?? .16));
        this.ballPos.lerpVectors(f.gatherFrom ?? this.ballPos, this.tmp3, gather);
      } else {
        if (!f.launched) {
          // Release at the visible contact point; no reparenting or scene-space mismatch.
          f.from.copy(this.ballPos);
          if (f.holder) {
            this.handWorld(f.holder, this.tmp3);
            const releaseFraction = 1 - Math.max(0, f.t) / Math.max(dt, 1e-9);
            f.from.lerp(this.tmp3, THREE.MathUtils.clamp(releaseFraction, 0, 1));
          }
          f.launched = true;
        }
        const s = Math.min(1, Math.max(0, f.t) / Math.max(f.dur, .01));
        this.ballPos.lerpVectors(f.from, f.to, s);
        this.ballPos.y += 4 * f.arc * s * (1 - s);
        if (f.purpose === 'rebound' && s > .5 && this.ballPos.y < 7 && this.ballPos.y > 2) {
          const rebounder = this.players.find(p => p.busy <= 0 && Math.hypot(p.pos.x - this.ballPos.x, p.pos.y - this.ballPos.z) < 2.1);
          if (rebounder) this.awardRebound(rebounder);
        }
        if (s >= 1 && this.ballState.mode === mode) {
          this.releaseLoose();
          f.done();
        }
      }
    } else if (mode.kind === 'held') {
      const h = mode.owner;
      this.handWorld(h, this.tmp3);
      const dribbling = (h.current === 'RunDribble' || h.current === 'IdleDribble') && this.phase !== 'inbound';
      if (dribbling) {
        const action = h.actions[h.current];
        const period = this.dribblePeriod(h.current, action.getClip().duration);
        const phase = (action.time % period) / period;
        const top = Math.max(this.tmp3.y, BALL_FLOOR);
        this.tmp3.y = BALL_FLOOR + (top - BALL_FLOOR) * Math.sin(Math.PI * phase);
      } else if (h.current === 'Crossover') {
        const phase = h.actions.Crossover.time / h.actions.Crossover.getClip().duration;
        const right = this.tmp3.clone();
        this.handWorld(h, this.tmp3, true);
        const across = Math.sin(Math.PI * Math.min(1, phase));
        this.tmp3.lerpVectors(right, this.tmp3, across);
        this.tmp3.y = BALL_FLOOR + (this.tmp3.y - BALL_FLOOR) * Math.abs(Math.cos(phase * Math.PI * 2));
      }
      mode.gatherAge += dt;
      const gather = mode.gatherDuration ? THREE.MathUtils.smoothstep(mode.gatherAge, 0, mode.gatherDuration) : 1;
      this.ballPos.lerpVectors(mode.gatherFrom, this.tmp3, gather);
    } else {
      const v = mode.velocity;
      v.y -= 32.2 * dt;
      this.ballPos.addScaledVector(v, dt);
      if (this.ballPos.y <= BALL_FLOOR) {
        this.ballPos.y = BALL_FLOOR;
        v.y = Math.abs(v.y) > 1.3 ? -v.y * .59 : 0;
        v.x *= .86; v.z *= .86;
      }
      this.ballRest.copy(this.ballPos); this.ballRest.y = BALL_FLOOR;
    }
    this.syncBallMesh(dt);
  }

  private syncBallMesh(dt: number) {
    this.ball.position.copy(this.ballPos);
    this.ball.rotation.x += dt * 5;
    this.ball.rotation.z += dt * 2;
    this.ballShadow.position.set(this.ballPos.x, .045, this.ballPos.z);
    const altitude = Math.max(0, this.ballPos.y - BALL_FLOOR);
    this.ballShadow.scale.setScalar(1 + Math.min(altitude, 10) * .1);
    (this.ballShadow.material as THREE.MeshBasicMaterial).opacity = .32 / (1 + altitude * .7);
  }

  setManualControl(enabled: boolean) { this.manualControl = enabled; this.manualInput.set(0, 0); this.queuedAction = null; }
  setManualInput(x: number, z: number) { this.manualInput.set(x, z).clampLength(0, 1); }
  requestShot() { if (this.manualControl) this.queuedAction = 'shoot'; }
  requestPass() { if (this.manualControl) this.queuedAction = 'pass'; }
  requestCrossover() { if (this.manualControl) this.queuedAction = 'crossover'; }

  /** A stable diagnostic surface for automated regressions and the live renderer. */
  qaSnapshot() {
    const material = this.ball.material as THREE.MeshStandardMaterial;
    return {
      frame: this.frameCount, time: this.simulationTime, phase: this.phase, mode: this.ballState.mode.kind,
      holder: this.holder ? `${this.holder.team}/${this.holder.slot}` : null,
      holderClip: this.holder?.current ?? null,
      position: this.ballPos.toArray(), worldPosition: this.ballPosition.toArray(),
      maxStep: this.maxBallStep, transitionCount: this.transitionCount, lastTransition: this.lastTransition,
      flight: this.flight ? { purpose: this.flight.purpose, released: this.flight.launched, time: this.flight.t, from: this.flight.from.toArray(), to: this.flight.to.toArray() } : null,
      visible: this.ball.visible, attached: this.ball.parent === this.group, ballCount: this.group.children.filter(o => o.name === 'basketball').length,
      frustumCulled: this.ball.frustumCulled, boundingRadius: this.ball.geometry.boundingSphere?.radius,
      depthTest: material.depthTest, depthWrite: material.depthWrite, opacity: material.opacity, radius: BALL_RADIUS,
      pendingScenario: this.pendingScenario, score: [...this.score], animations: Object.keys(this.players[0].actions), manualControl: this.manualControl,
    };
  }

  /** Starts actual game actions, using the same transitions as normal play. */
  runQaScenario(scenario: QaScenario) {
    this.queuedAction = null; this.pendingScenario = null;
    if (scenario === 'dunk') { this.playHighlight(); return; }
    if (scenario === 'reset') {
      this.score = [0, 0]; this.clock = 720; this.quarter = 1;
      this.phase = 'advance'; this.dunker = null; this.cinematicHold = 0;
      this.offense = 0; this.passesLeft = 2;
      this.releaseLoose(); this.phase = 'loose';
      return;
    }
    if (!this.holder) { this.pendingScenario = scenario; return; }
    const p = this.holder!;
    p.busy = 0;
    if (scenario === 'pass') this.passToTeammate();
    else if (scenario === 'shot-make' || scenario === 'shot-miss') { this.forcedMake = scenario === 'shot-make'; this.shoot(); }
    else if (scenario === 'crossover') this.playOnce(p, 'Crossover', p.actions.Crossover.getClip().duration);
    else { this.forcedMake = false; this.shoot(); }
  }

  // --- Models ----------------------------------------------------------------

  private buildPlayer(gltf: GLTF, team: TeamId, slot: number): Player {
    const kit = TEAMS[team];
    const root = SkeletonUtils.clone(gltf.scene);
    const seed = team * 5 + slot;
    const physiques = [[.98, .985, .96], [.94, 1.03, .95], [1.04, 1.015, 1.02], [1.10, .97, 1.06], [.99, 1.06, 1.00]];
    const shape = physiques[(slot + team * 2) % physiques.length];
    root.scale.set(shape[0], shape[1], shape[2]);
    const look = LOOKS[(slot + team * 3) % LOOKS.length];
    const palette = REGIONS.map((r) => {
      switch (r) {
        case 'Skin':
          return new THREE.Color(SKINS[(seed * 7 + 3) % SKINS.length]);
        case 'Jersey':
          return new THREE.Color(kit.jersey);
        case 'Trim':
          return new THREE.Color(kit.trim);
        case 'Shorts':
          return new THREE.Color(kit.shorts);
        case 'Socks':
          return new THREE.Color(kit.sock);
        case 'Shoe':
          return new THREE.Color(kit.shoe);
        case 'Sole':
          return new THREE.Color('#f3efe6');
        case 'EyeWhite':
          return new THREE.Color('#fbfbf6');
        case 'Dark':
          return new THREE.Color('#150e12');
        case 'Hair':
          return new THREE.Color(HAIR_COLORS[(seed * 3 + 1) % HAIR_COLORS.length]);
      }
    });
    const body = playerMaterial(palette);
    const number = [0, 1, 3, 5, 7, 11, 12, 23, 24, 30][(seed * 3) % 10] + (team ? 2 : 0);
    const numberMat = new THREE.MeshStandardMaterial({ map: numberTexture(number, kit.trim, kit.jersey), alphaTest: 0.5, roughness: 0.7 });
    const outlines: THREE.SkinnedMesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const base = mesh.name.replace(/_\d+$/, '');
      if (base.startsWith('Number')) {
        mesh.material = numberMat;
        return;
      }
      const color = mesh.geometry.getAttribute('color');
      if (color) {
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.setAttribute('region', color);
        mesh.geometry.deleteAttribute('color');
      }
      mesh.material = body;
      if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences.fill(0);
        const face = ['FaceBroad', 'FaceLean', 'FaceStrong'][seed % 3];
        const index = mesh.morphTargetDictionary[face];
        if (index !== undefined) mesh.morphTargetInfluences[index] = .55 + (seed % 4) * .1;
      }
      if (/^(Hair|Headband)/.test(base)) mesh.visible = look.includes(base);
      if (mesh.visible && mesh.isSkinnedMesh && !root.getObjectByName('VoxelAthlete')) outlines.push(mesh);
    });
    for (const mesh of outlines) {
      const outline = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial);
      outline.bind(mesh.skeleton, mesh.bindMatrix);
      outline.morphTargetInfluences = mesh.morphTargetInfluences;
      outline.frustumCulled = false;
      outline.position.copy(mesh.position);
      outline.quaternion.copy(mesh.quaternion);
      outline.scale.copy(mesh.scale);
      mesh.parent!.add(outline);
    }
    this.group.add(root);

    const mixer = new THREE.AnimationMixer(root);
    const actions = {} as Record<Clip, THREE.AnimationAction>;
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      if (['Shoot', 'Pass', 'Dunk', 'Catch', 'Crossover', 'Jump', 'Land', 'Rebound'].includes(clip.name)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions[clip.name as Clip] = action;
    }
    // Older cached GLBs remain loadable while a newly exported asset is being deployed.
    const fallbacks: Partial<Record<Clip, Clip>> = { Catch: 'Pass', Crossover: 'IdleDribble', Shuffle: 'Defend', Jump: 'Shoot', Land: 'Defend', Rebound: 'Shoot' };
    for (const [clip, fallback] of Object.entries(fallbacks)) {
      if (!actions[clip as Clip]) { const source = actions[fallback!].getClip().clone(); source.name = clip; const action = mixer.clipAction(source); if (clip !== 'Shuffle') { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; } actions[clip as Clip] = action; }
    }
    actions.Idle.play();
    const handBone = root.getObjectByName('handR') ?? root.getObjectByName('hand.R') ?? root;
    const hand = root.getObjectByName('ballGripR') ?? root.getObjectByName('BallSocketR') ?? new THREE.Object3D();
    if (!hand.parent) { hand.position.set(0, .29, .08); handBone.add(hand); }
    const leftHand = root.getObjectByName('ballGripL') ?? root.getObjectByName('BallSocketL') ?? new THREE.Object3D();
    if (!leftHand.parent) { leftHand.position.set(0, .29, .08); (root.getObjectByName('handL') ?? root.getObjectByName('hand.L') ?? root).add(leftHand); }
    // Measure the authored socket, rather than hard-coding proportions from an older athlete.
    mixer.stopAllAction();
    actions.Dunk.reset().play(); mixer.update(DUNK_RELEASE);
    this.group.updateMatrixWorld(true);
    const dunkGrip = new THREE.Vector3(); hand.getWorldPosition(dunkGrip); this.group.worldToLocal(dunkGrip);
    mixer.stopAllAction(); actions.Idle.reset().play(); mixer.update(0);
    const contactShadow=createBallContactShadow();contactShadow.name='player-contact-shadow';
    contactShadow.scale.set(1.45,1.05,1);this.group.add(contactShadow);
    const feet=['foot_l','foot_r'].map(name=>root.getObjectByName(name)).filter((o): o is THREE.Object3D => !!o);
    return {
      contactShadow, feet,
      team,
      slot,
      root,
      mixer,
      actions,
      current: 'Idle',
      busy: 0,
      hand,
      leftHand,
      aim: null,
      pos: new THREE.Vector2(),
      target: new THREE.Vector2(),
      heading: team === 0 ? Math.PI / 2 : -Math.PI / 2,
      speed: 0,
      reach: shape[0],
      height: shape[1],
      depth: shape[2],
      dunkGrip,
    };
  }
}
