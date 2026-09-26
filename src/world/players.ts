import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { FLOOR, RIM, TEAMS, THREE_POINT } from '../config';
import { mulberry32 } from '../data/random';
import { numberTexture, type Scoreboard } from './signs';
import { basketballTexture } from './textures';

type TeamId = 0 | 1;
/** fetch → inbound → advance → set ⇄ pass → shot → (fetch | loose) */
type Phase = 'fetch' | 'inbound' | 'advance' | 'set' | 'pass' | 'shot' | 'drive' | 'dunk' | 'loose';
type Clip = 'Idle' | 'Run' | 'RunDribble' | 'IdleDribble' | 'Defend' | 'Shoot' | 'Pass' | 'Celebrate' | 'Dunk';

const SKINS = ['#f1c7a3', '#e0ac85', '#c68863', '#9c6644', '#6f4a33', '#b07a55'];
const HAIR_COLORS = ['#1b1412', '#2e1f16', '#4a2f1d', '#b08a4a', '#1b1412'];
const LOOKS: string[][] = [['HairBuzz'], ['HairAfro'], ['HairTwists', 'Headband'], ['HairBuzz', 'HairBeard'], ['HairAfro', 'Headband'], ['HairTwists']];
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
        for (int i = 1; i < ${REGIONS.length}; i++) { if (i == ri) vRegionColor = uPalette[i]; }`,
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
        roughnessFactor = vRegion < 0.5 ? 0.62 : (vRegion > 6.5 && vRegion < 8.5 ? 0.44 : 0.87);`);
  };
  return m;
}

/** Ink outline that stays about the same thickness on screen at any distance. */
const outlineMaterial = (() => {
  const m = new THREE.MeshBasicMaterial({ color: '#352132', side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.outlineWidth = { value: 0.00115 };
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
  pos: THREE.Vector2;
  target: THREE.Vector2;
  heading: number;
  speed: number;
  reach: number;
  height: number;
  depth: number;
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
  done: () => void;
}

/** A small scripted streetball game, so the court always has something happening for the camera. */
export class GameSim implements Scoreboard {
  readonly group = new THREE.Group();
  score: [number, number] = [0, 0];
  quarter = 1;
  clock = 720;
  onScore: ((team: TeamId, points: number) => void) | null = null;

  private readonly ball: THREE.Mesh;
  private readonly rnd = mulberry32(99);
  private readonly teams: Player[][] = [[], []];
  private readonly players: Player[] = [];
  private offense: TeamId = 0;
  private phase: Phase = 'advance';
  private holder: Player | null = null;
  private flight: Flight | null = null;
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
  private readonly ballPos = new THREE.Vector3(0, 1, 0);
  private readonly ballRest = new THREE.Vector3(0, 0.45, 0);
  private restBounce = 0;
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
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshStandardMaterial({ map: basketballTexture(), roughness: 0.65 }));
    this.ball.castShadow = true;
    this.group.add(this.ball);
    this.holder = this.teams[0][0];
    this.featured = this.holder;
  }

  get ballPosition(): THREE.Vector3 {
    return this.ballPos;
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

  /** A deterministic, repeatable clip for the share/highlight button. */
  playHighlight(): void {
    this.flight = null;
    this.dunker = null;
    this.cinematicHold = 0;
    this.offense = 0;
    this.holder = this.teams[0][2];
    this.featured = this.holder;
    this.holder.pos.set(RIM.x - 18, -5.5);
    this.holder.target.copy(this.holder.pos);
    this.holder.heading = Math.PI / 2;
    this.holder.busy = 0;
    this.holder.speed = 7;
    this.players.forEach((p) => {
      p.busy = 0;
      if (p === this.holder) return;
      this.spotWorld(0, p.slot, p.pos);
      p.pos.y += p.team === 1 ? 5 : -3;
      p.pos.x -= p.team === 1 ? 3 : 0;
      p.target.copy(p.pos);
    });
    this.phase = 'drive';
    this.highlightNext = false;
    this.timer = 0;
  }

  update(dt: number, t: number) {
    dt = Math.min(dt, 0.05);
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
    this.think();
    for (const p of this.players) this.movePlayer(p, dt);
    this.separate();
    if (this.dunker) {
      this.dunkTime += dt;
      // The approach travels under the ball hand; all vertical movement is authored in the rig.
      const travel = THREE.MathUtils.smoothstep(this.dunkTime, 0.12, DUNK_RELEASE);
      this.dunker.pos.lerpVectors(this.dunkFrom, this.dunkTo, travel);
      if (this.dunkTime > 1.5) this.dunker = null;
    }
    for (const p of this.players) {
      p.busy = Math.max(0, p.busy - dt);
      this.animate(p);
      p.mixer.update(dt);
      const jumpWeight = this.dunker === p
        ? THREE.MathUtils.smoothstep(this.dunkTime, 5 / FPS, 12 / FPS) * (1 - THREE.MathUtils.smoothstep(this.dunkTime, 21 / FPS, 28 / FPS)) : 0;
      p.root.position.set(p.pos.x, (1.06 - p.height) * 9.85 * jumpWeight, p.pos.y);
      p.root.rotation.y = p.heading;
    }
    this.group.updateMatrixWorld(true);
    this.updateBall(dt, t);
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
    // Anyone shooting or passing plants their feet.
    for (const p of this.players) if (p.busy > 0 && (p.current === 'Shoot' || p.current === 'Pass' || p.current === 'Dunk')) p.target.copy(p.pos);
  }

  private distToRest(p: Player) {
    return Math.hypot(p.pos.x - this.ballRest.x, p.pos.y - this.ballRest.z);
  }

  private think() {
    switch (this.phase) {
      case 'fetch': {
        const inbounder = this.teams[this.offense][1];
        if (this.distToRest(inbounder) < 1.8) {
          this.holder = inbounder;
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
        if (h && h.pos.distanceTo(h.target) < 3) {
          this.phase = 'set';
          this.timer = 0.5 + this.rnd() * 0.5;
        }
        break;
      }
      case 'set':
        if (this.timer <= 0) {
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
    next.reset().fadeIn(fade).play();
    p.actions[p.current].fadeOut(fade);
    p.current = clip;
  }

  private playOnce(p: Player, clip: Clip, duration: number) {
    const action = p.actions[clip];
    action.reset();
    action.timeScale = 1;
    action.fadeIn(0.08).play();
    if (p.current !== clip) p.actions[p.current].fadeOut(0.08);
    p.current = clip;
    p.busy = duration;
  }

  private pass(receiver: Player, onCatch: () => void) {
    const passer = this.holder!;
    this.playOnce(passer, 'Pass', 0.5);
    this.face(passer, receiver.pos);
    this.holder = null;
    this.phase = 'pass';
    this.flight = {
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      t: -PASS_RELEASE,
      dur: 0,
      arc: 0,
      launched: false,
      holder: passer,
      done: () => {
        this.holder = receiver;
        onCatch();
      },
    };
    this.flight.to.set(receiver.pos.x, 4.4, receiver.pos.y);
    this.flight.dur = 0.15 + passer.pos.distanceTo(receiver.pos) / 42;
    this.flight.arc = 0.8 + passer.pos.distanceTo(receiver.pos) * 0.025;
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
    this.dunkTo.set(dir * (RIM.x + .56 * p.depth), -dir * 1.02 * p.reach);
    this.face(p, this.tmp.set(dir * (RIM.x + 2), p.pos.y));
    p.speed = 0;
    this.playOnce(p, 'Dunk', 1.5);
    this.holder = null;
    this.phase = 'dunk';
    this.flight = {
      from: new THREE.Vector3(),
      to: new THREE.Vector3(dir * RIM.x, RIM.y - .25, 0),
      t: -DUNK_RELEASE,
      dur: .14,
      arc: .05,
      launched: false,
      holder: p,
      done: () => this.scored(2, p),
    };
  }

  private shoot() {
    const shooter = this.holder!;
    this.featured = shooter;
    const dir = dirOf(this.offense);
    const rim = new THREE.Vector3(dir * RIM.x, RIM.y + 0.4, 0);
    const d = Math.hypot(shooter.pos.x - rim.x, shooter.pos.y);
    const three = d > THREE_POINT.radius || (Math.abs(shooter.pos.y) > THREE_POINT.cornerZ && d > 21.5);
    const make = this.rnd() < (three ? 0.42 : 0.56);
    this.face(shooter, this.tmp.set(rim.x, rim.z));
    this.playOnce(shooter, 'Shoot', 1.0);
    this.holder = null;
    this.phase = 'shot';
    this.flight = {
      from: new THREE.Vector3(),
      to: make ? rim : new THREE.Vector3(dir * (RIM.x - 0.7), RIM.y + 0.5, (this.rnd() - 0.5) * 1.2),
      t: -SHOOT_RELEASE,
      dur: 0.8 + d / 55,
      arc: Math.max(4, 3 + d * 0.3),
      launched: false,
      holder: shooter,
      done: () => (make ? this.scored(three ? 3 : 2, shooter) : this.missed()),
    };
  }

  private scored(points: number, shooter: Player) {
    const team = this.offense;
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
    this.flight = {
      from: at,
      to: new THREE.Vector3(at.x, 0.45, at.z),
      t: 0,
      dur: 0.45,
      arc: 0,
      launched: true,
      done: () => {
        this.ballRest.set(at.x, 0.45, at.z);
        this.restBounce = 1.5;
        this.offense = (1 - team) as TeamId;
        this.passesLeft = this.possessions % 3 === 0 ? 0 : 1 + Math.floor(this.rnd() * 2);
        this.spotOf = [0, 1, 2, 3, 4];
        this.phase = 'fetch';
      },
    };
  }

  private missed() {
    const dir = dirOf(this.offense);
    const land = new THREE.Vector3(dir * (RIM.x - 4 - this.rnd() * 8), 0.45, (this.rnd() - 0.5) * 18);
    this.flight = {
      from: this.ballPos.clone(),
      to: land,
      t: 0,
      dur: 0.75,
      arc: 3.5,
      launched: true,
      done: () => {
        this.ballRest.copy(land);
        this.restBounce = 2;
        this.phase = 'loose';
      },
    };
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
    if (!best) return;
    this.holder = best;
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
    p.heading = Math.atan2(at.x - p.pos.x, at.y - p.pos.y);
  }

  private movePlayer(p: Player, dt: number) {
    this.tmp.copy(p.target).sub(p.pos);
    const dist = this.tmp.length();
    const maxSpeed = p === this.holder ? (this.phase === 'drive' ? 18 : 13.5) : 15.5;
    const desired = dist > 0.25 && p.busy <= 0 ? Math.min(maxSpeed, dist * 2.2) : p.current === 'Celebrate' ? Math.min(8, dist * 2) : 0;
    p.speed += (desired - p.speed) * (1 - Math.exp(-dt * 8));
    if (dist > 0.001 && p.speed > 0.01) p.pos.addScaledVector(this.tmp.normalize(), Math.min(p.speed * dt, dist));
    if (p.busy > 0 && p.current !== 'Celebrate') return; // keep facing where the shot or pass went
    const face =
      p.speed > 1.5 && dist > 0.25
        ? Math.atan2(this.tmp.x, this.tmp.y)
        : Math.atan2(this.ballPos.x - p.pos.x, this.ballPos.z - p.pos.y);
    let delta = face - p.heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    p.heading += delta * (1 - Math.exp(-dt * 10));
  }

  private animate(p: Player) {
    if (p.busy > 0) return;
    if (p.current === 'Dunk' && this.cinematicHold > 0) { this.playOnce(p, 'Celebrate', 1.2); return; }
    const moving = p.speed > 1.8;
    const scale = THREE.MathUtils.clamp(p.speed / 12, 0.7, 1.35);
    if (p === this.holder && this.phase !== 'fetch' && this.phase !== 'inbound') this.play(p, moving ? 'RunDribble' : 'IdleDribble', 0.2, moving ? scale : 1);
    else if (moving) this.play(p, 'Run', 0.2, scale);
    else if (p.team !== this.offense) this.play(p, 'Defend');
    else this.play(p, 'Idle');
  }

  private separate() {
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i].pos;
        const b = this.players[j].pos;
        const d = a.distanceTo(b);
        if (d < 2.4 && d > 1e-4 && this.players[i] !== this.dunker && this.players[j] !== this.dunker) {
          const push = (2.4 - d) * 0.5;
          this.tmp.copy(a).sub(b).divideScalar(d);
          a.addScaledVector(this.tmp, push);
          b.addScaledVector(this.tmp, -push);
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

  private handWorld(p: Player, out: THREE.Vector3) {
    return p.hand.getWorldPosition(out);
  }

  private updateBall(dt: number, t: number) {
    const f = this.flight;
    if (f) {
      f.t += dt;
      if (f.t < 0 && f.holder) {
        this.handWorld(f.holder, this.ballPos);
      } else {
        if (!f.launched) {
          if (f.holder) this.handWorld(f.holder, f.from);
          f.launched = true;
        }
        const s = Math.min(1, Math.max(0, f.t) / Math.max(f.dur, 0.01));
        this.ballPos.lerpVectors(f.from, f.to, s);
        this.ballPos.y += 4 * f.arc * s * (1 - s);
        if (s >= 1) {
          this.flight = null;
          f.done();
        }
      }
    } else if (this.holder) {
      const h = this.holder;
      this.handWorld(h, this.tmp3);
      if (this.phase === 'fetch' || this.phase === 'inbound' || h.current === 'Celebrate') this.ballPos.copy(this.tmp3);
      else {
        // Dribble: in the hand at the top of each bounce, on the floor halfway through.
        const running = h.current === 'RunDribble';
        const period = running ? 8 / FPS : 12 / FPS;
        const time = h.actions[h.current].time;
        const phase = (time % period) / period;
        const top = Math.max(this.tmp3.y, 1.2);
        this.ballPos.set(this.tmp3.x, 0.45 + (top - 0.45) * Math.abs(Math.sin(Math.PI * phase)), this.tmp3.z);
      }
    } else {
      this.restBounce = Math.max(0, this.restBounce - dt * 2.2);
      this.ballPos.set(this.ballRest.x, 0.45 + Math.abs(Math.sin(t * 7)) * this.restBounce, this.ballRest.z);
    }
    this.ball.position.copy(this.ballPos);
    this.ball.rotation.x += dt * 6;
    this.ball.rotation.z += dt * 2;
  }

  // --- Models ----------------------------------------------------------------

  private buildPlayer(gltf: GLTF, team: TeamId, slot: number): Player {
    const kit = TEAMS[team];
    const root = SkeletonUtils.clone(gltf.scene);
    const seed = team * 5 + slot;
    const physiques = [[.97, 1.02, .94], [.90, 1.10, .92], [1.07, 1.06, 1.03], [1.15, 1.00, 1.12], [.98, 1.13, .98]];
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
      if (/^(Hair|Headband)/.test(base)) mesh.visible = look.includes(base);
      if (mesh.visible && mesh.isSkinnedMesh) outlines.push(mesh);
    });
    for (const mesh of outlines) {
      const outline = new THREE.SkinnedMesh(mesh.geometry, outlineMaterial);
      outline.bind(mesh.skeleton, mesh.bindMatrix);
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
      if (clip.name === 'Shoot' || clip.name === 'Pass' || clip.name === 'Dunk') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions[clip.name as Clip] = action;
    }
    actions.Idle.play();
    const handBone = root.getObjectByName('handR') ?? root.getObjectByName('hand.R') ?? root;
    const hand = new THREE.Object3D();
    hand.position.set(0, .29, .08);
    handBone.add(hand);
    return {
      team,
      slot,
      root,
      mixer,
      actions,
      current: 'Idle',
      busy: 0,
      hand,
      pos: new THREE.Vector2(),
      target: new THREE.Vector2(),
      heading: team === 0 ? Math.PI / 2 : -Math.PI / 2,
      speed: 0,
      reach: shape[0],
      height: shape[1],
      depth: shape[2],
    };
  }
}
