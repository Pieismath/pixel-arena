import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { hash01 } from '../data/random';
import type { ArenaState, SeatSale, SpotRef } from '../data/types';
import { SEAT_INDEX, SEATS, seatKey } from './layout';

const HAIRS = ['Short', 'Afro', 'Cap'] as const;
const SKIN = ['#f1c7a3', '#e0ac85', '#c68863', '#9c6644', '#6f4a33', '#f5d6b8', '#b07a55'];
const SHIRTS = ['#e9e4d8', '#2b2f3a', '#c8402f', '#2f6fd0', '#f2b233', '#3a8f5a', '#7a4fb0', '#e46aa0', '#1fa7b0', '#8a8f99', '#ff7a1a', '#17a79b'];
const PANTS = ['#2d3a5c', '#1f2230', '#4a5a78', '#6b5a48', '#3b3b3b', '#8a7a62'];
const HAIR = ['#1b1412', '#2e1f16', '#4a2f1d', '#6b4a2b', '#b08a4a', '#8e8a86'];
const SHOES = ['#f5f2ea', '#1c1f2b', '#c8402f', '#2f6fd0'];
const pickColor = (list: string[], n: number) => new THREE.Color(list[Math.floor(hash01(n) * list.length) % list.length]);

const SEATED = new Set(['Sit', 'Clap', 'Card']);
// Where the card sits relative to a "Card" fan's origin (seat contact point), in the fan's frame.
const CARD_OFFSET = new THREE.Vector3(0, 5.0, 0.6);

/** Standard material that colors each body region from per-instance palettes. */
function fanMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.78 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 region;
        attribute vec3 iSkin;
        attribute vec3 iShirt;
        attribute vec3 iPants;
        attribute vec3 iHair;
        attribute vec3 iShoe;
        varying vec3 vFan;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        int r = int(floor(region.r * 8.0));
        vec3 c = iSkin;
        if (r == 1) c = iShirt;
        else if (r == 2) c = iPants;
        else if (r == 3) c = iHair;
        else if (r == 4) c = iShoe;
        else if (r == 5) c = vec3(0.92);
        else if (r == 6) c = vec3(0.03, 0.02, 0.025);
        else if (r == 7) c = vec3(0.86);
        vFan = c;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFan;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vFan, opacity );');
  };
  return m;
}

interface FanBatch {
  mesh: THREE.InstancedMesh;
  seat: Int32Array;
  baseY: Float32Array;
  theta: Float32Array;
  phase: Float32Array;
  count: number;
}

export function createCrowd(gltf: GLTF) {
  const group = new THREE.Group();
  group.name = 'crowd';
  const geometries = new Map<string, THREE.BufferGeometry>();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    const color = geo.getAttribute('color');
    if (color) {
      geo.setAttribute('region', color);
      geo.deleteAttribute('color');
    }
    geometries.set(mesh.name.replace(/^Fan_/, ''), geo);
  });
  const material = fanMaterial();

  // Invisible boxes over every seat, so empty seats can be clicked too.
  const proxy = new THREE.InstancedMesh(new THREE.BoxGeometry(1.9, 4.6, 2.2).translate(0, 2.3, 0.2), new THREE.MeshBasicMaterial({ visible: false }), SEATS.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  SEATS.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw);
    proxy.setMatrixAt(i, m4.compose(s.pos, q, one));
  });
  proxy.userData.pick = (hit: THREE.Intersection): SpotRef | null => (hit.instanceId === undefined ? null : seatRef(hit.instanceId));
  group.add(proxy);

  const cards = new THREE.InstancedMesh(new THREE.BoxGeometry(2.05, 1.85, 0.08), new THREE.MeshStandardMaterial({ roughness: 0.6 }), SEATS.length);
  cards.frustumCulled = false;
  cards.setColorAt(0, new THREE.Color('#ffffff'));
  const cardSeat = new Int32Array(SEATS.length);
  const cardBase = new Float32Array(SEATS.length);
  const cardFanLift = new Int32Array(SEATS.length); // index into the lift array
  let cardCount = 0;
  cards.userData.pick = (hit: THREE.Intersection): SpotRef | null => (hit.instanceId === undefined ? null : seatRef(cardSeat[hit.instanceId]));
  group.add(cards);

  let batches: FanBatch[] = [];
  const lift = new Float32Array(SEATS.length);
  const sales = new Map<number, SeatSale>();

  function seatRef(index: number): SpotRef {
    const s = SEATS[index];
    return { kind: 'seat', section: s.section, row: s.row, col: s.col };
  }

  function setState(state: ArenaState) {
    for (const b of batches) {
      group.remove(b.mesh);
      b.mesh.dispose();
    }
    batches = [];
    sales.clear();
    for (const sale of state.seats) {
      const idx = SEAT_INDEX.get(seatKey(sale.section, sale.row, sale.col));
      if (idx !== undefined) sales.set(idx, sale);
    }

    // Decide who sits where, then build one instanced mesh per pose/hair combination.
    const plan = new Map<string, number[]>();
    const poseOf = new Map<number, string>();
    SEATS.forEach((_s, i) => {
      const sale = sales.get(i);
      let pose: string;
      if (sale) pose = 'Card';
      else {
        const r = hash01(i * 3 + 7);
        if (r > 0.8) return; // empty seat
        const p = hash01(i * 5 + 1);
        pose = p < 0.58 ? 'Sit' : p < 0.84 ? 'Clap' : p < 0.95 ? 'Cheer' : 'Stand';
      }
      const hair = HAIRS[Math.floor(hash01(i * 11 + 2) * HAIRS.length) % HAIRS.length];
      const key = `${pose}_${hair}`;
      if (!geometries.has(key)) return;
      poseOf.set(i, pose);
      (plan.get(key) ?? plan.set(key, []).get(key)!).push(i);
    });

    cardCount = 0;
    const tmpColor = new THREE.Color();
    let fanIndex = 0;
    for (const [key, seats] of plan) {
      const geo = geometries.get(key)!;
      const mesh = new THREE.InstancedMesh(geo, material, seats.length);
      mesh.castShadow = false; // hundreds of fans in the shadow pass cost more than they add
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const attrs = {
        iSkin: new Float32Array(seats.length * 3),
        iShirt: new Float32Array(seats.length * 3),
        iPants: new Float32Array(seats.length * 3),
        iHair: new Float32Array(seats.length * 3),
        iShoe: new Float32Array(seats.length * 3),
      };
      const batch: FanBatch = {
        mesh,
        seat: new Int32Array(seats.length),
        baseY: new Float32Array(seats.length),
        theta: new Float32Array(seats.length),
        phase: new Float32Array(seats.length),
        count: seats.length,
      };
      seats.forEach((si, k) => {
        const s = SEATS[si];
        const sale = sales.get(si);
        const pose = poseOf.get(si)!;
        q.setFromAxisAngle(up, s.yaw);
        v.copy(s.pos);
        if (!SEATED.has(pose)) {
          // Standing fans stand on the footboard in front of their seat.
          const toCourt = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
          v.addScaledVector(toCourt, 1.05);
          v.y -= 1.12;
        }
        mesh.setMatrixAt(k, m4.compose(v, q, one));
        batch.seat[k] = si;
        batch.baseY[k] = v.y;
        batch.theta[k] = s.theta;
        batch.phase[k] = hash01(si * 13 + 3) * Math.PI * 2;
        const brand = sale ? state.brands[sale.brandId] : undefined;
        pickColor(SKIN, si * 17 + 1).toArray(attrs.iSkin, k * 3);
        (brand ? tmpColor.set(brand.color) : pickColor(SHIRTS, si * 19 + 5)).toArray(attrs.iShirt, k * 3);
        pickColor(PANTS, si * 23 + 7).toArray(attrs.iPants, k * 3);
        pickColor(HAIR, si * 29 + 11).toArray(attrs.iHair, k * 3);
        pickColor(SHOES, si * 31 + 13).toArray(attrs.iShoe, k * 3);
        if (sale) {
          const cardPos = CARD_OFFSET.clone().applyQuaternion(q).add(v);
          cards.setMatrixAt(cardCount, m4.compose(cardPos, q, one));
          cards.setColorAt(cardCount, tmpColor.set(sale.card));
          cardSeat[cardCount] = si;
          cardBase[cardCount] = cardPos.y;
          cardFanLift[cardCount] = fanIndex + k;
          cardCount++;
        }
      });
      const g = geo.clone();
      for (const [name, data] of Object.entries(attrs)) g.setAttribute(name, new THREE.InstancedBufferAttribute(data, 3));
      mesh.geometry = g;
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      batches.push(batch);
      fanIndex += seats.length;
    }
    cards.count = cardCount;
    cards.instanceMatrix.needsUpdate = true;
    if (cards.instanceColor) cards.instanceColor.needsUpdate = true;
    cards.computeBoundingSphere();
    settled = false;
  }

  const wave = { active: false, angle: 0, end: 0, speed: 1.6 };
  let cheer = 0;
  let settled = true;

  function update(t: number, dt: number) {
    if (wave.active) {
      wave.angle += dt * wave.speed;
      if (wave.angle > wave.end) wave.active = false;
    }
    cheer = Math.max(0, cheer - dt * 0.4);
    const moving = wave.active || cheer > 0;
    if (!moving && settled) return;
    let fanIndex = 0;
    for (const b of batches) {
      const arr = b.mesh.instanceMatrix.array as Float32Array;
      for (let k = 0; k < b.count; k++) {
        let l = 0;
        if (moving) {
          if (wave.active) {
            const c = Math.cos(b.theta[k] - wave.angle);
            if (c > 0) l = c ** 14 * 1.8;
          }
          if (cheer > 0) l += cheer * Math.abs(Math.sin(t * 9 + b.phase[k])) * 0.8;
        }
        lift[fanIndex + k] = l;
        arr[k * 16 + 13] = b.baseY[k] + l;
      }
      b.mesh.instanceMatrix.needsUpdate = true;
      fanIndex += b.count;
    }
    const carr = cards.instanceMatrix.array as Float32Array;
    for (let c = 0; c < cardCount; c++) carr[c * 16 + 13] = cardBase[c] + lift[cardFanLift[c]] * 1.3;
    cards.instanceMatrix.needsUpdate = true;
    settled = !moving;
  }

  return {
    group,
    pickables: [cards, proxy] as THREE.Object3D[],
    setState,
    update,
    startWave() {
      wave.active = true;
      wave.angle = -Math.PI;
      wave.end = -Math.PI + Math.PI * 4;
    },
    cheer() {
      cheer = 1;
    },
    isSold(ref: { section: number; row: number; col: number }) {
      return sales.has(SEAT_INDEX.get(seatKey(ref.section, ref.row, ref.col)) ?? -1);
    },
  };
}

export type Crowd = ReturnType<typeof createCrowd>;
