import * as THREE from 'three';
import { mulberry32 } from '../data/random';

/** Regulation size in the court's feet-based coordinate system. */
export const BALL_RADIUS = 9.5 / 24;
export const BALL_FLOOR = BALL_RADIUS + 0.025;

/** One persistent, ordinary depth-tested mesh. No visibility changes, reparenting or overlay pass. */
export function createBasketball() {
  const width = 512, height = 256;
  const leather = document.createElement('canvas');
  leather.width = width; leather.height = height;
  const color = leather.getContext('2d')!;
  const relief = document.createElement('canvas');
  relief.width = width; relief.height = height;
  const bump = relief.getContext('2d')!;
  color.fillStyle = '#cc661f'; color.fillRect(0, 0, width, height);
  bump.fillStyle = '#898989'; bump.fillRect(0, 0, width, height);
  const rnd = mulberry32(542);
  // Leather pebbling becomes a bump surface at close range, without shimmering at game distance.
  for (let i = 0; i < 8000; i++) {
    const x = rnd() * width, y = rnd() * height, size = .55 + rnd() * .6;
    color.fillStyle = rnd() > .5 ? 'rgba(58,24,6,.16)' : 'rgba(255,192,106,.15)';
    color.beginPath(); color.arc(x, y, size, 0, Math.PI * 2); color.fill();
    bump.fillStyle = '#a6a6a6'; bump.beginPath(); bump.arc(x, y, size, 0, Math.PI * 2); bump.fill();
  }
  for (const ctx of [color, bump]) {
    ctx.strokeStyle = ctx === color ? '#342318' : '#242424';
    ctx.lineWidth = 3.1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
    for (const x of [0, width / 4, width / 2, width * .75, width]) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (const sign of [-1, 1]) {
      for (let x = 0; x <= width; x++) {
        const y = height / 2 + sign * Math.sin(x / width * Math.PI * 2) * height * .32;
        if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(leather);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bumpMap = new THREE.CanvasTexture(relief);
  bumpMap.anisotropy = 4;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24), new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: .018, roughness: .78, metalness: 0 }));
  ball.name = 'basketball';
  ball.castShadow = true;
  ball.receiveShadow = true;
  ball.geometry.computeBoundingSphere();
  return ball;
}

export function createBallContactShadow() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(17,25,22,.8)'); gradient.addColorStop(.4, 'rgba(17,25,22,.35)'); gradient.addColorStop(1, 'rgba(17,25,22,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity: .35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  shadow.name = 'basketball-contact-shadow';
  shadow.rotation.x = -Math.PI / 2;
  return shadow;
}
