import * as THREE from 'three';
import { mulberry32 } from '../data/random';

export const SIGN_FONT = '"Bungee", "Arial Black", Impact, sans-serif';
export const MARKER_FONT = '"Permanent Marker", "Marker Felt", "Comic Sans MS", cursive';
export const BODY_FONT = '"Inter", system-ui, sans-serif';

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

let maxAnisotropy = 8;
export function setMaxAnisotropy(n: number) {
  maxAnisotropy = Math.min(8, n);
}

/**
 * Canvas texture for glTF meshes. glTF UVs put v=0 at the top of the image, so flipY stays off
 * and canvases are drawn the normal way up.
 */
export function canvasTexture(canvas: HTMLCanvasElement, repeatFeet?: [number, number]) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = maxAnisotropy;
  if (repeatFeet) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1 / repeatFeet[0], 1 / repeatFeet[1]);
  }
  return tex;
}

export function shade(hex: string, factor: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return '#' + c.getHexString();
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, count: number, colors: string[], size = [1, 3]) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const s = size[0] + rnd() * (size[1] - size[0]);
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

/** Fits text to a width by shrinking the font; returns the size used. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, font: string, maxWidth: number, maxSize: number, minSize = 10): number {
  let size = maxSize;
  for (; size > minSize; size -= 2) {
    ctx.font = `${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  ctx.font = `${size}px ${font}`;
  return size;
}

export function wrapWords(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!current) current = word;
    else if ((current + ' ' + word).length <= maxChars) current += ' ' + word;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// --- Tiling surfaces --------------------------------------------------------------------------

/** Brick facade with a 4×4 grid of windows, 40 ft square. Some windows glow (emissive map). */
export function facadeTextures(brick: string, mortar: string, seed: number, lit = 0.28) {
  const S = 512;
  const px = S / 40;
  const rnd = mulberry32(seed);
  const map = makeCanvas(S, S);
  const glow = makeCanvas(S, S);
  const c = map.ctx;
  c.fillStyle = mortar;
  c.fillRect(0, 0, S, S);
  const bh = 4.5;
  const bw = 13;
  for (let row = 0, y = 0; y < S; row++, y += bh) {
    for (let x = row % 2 ? -bw / 2 : 0; x < S; x += bw) {
      c.fillStyle = shade(brick, 0.86 + rnd() * 0.26);
      c.fillRect(Math.round(x) + 1, Math.round(y) + 1, bw - 1.5, bh - 1.2);
    }
  }
  grain(c, S, S, rnd, 900, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.06)'], [1, 4]);
  const g = glow.ctx;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const stone = '#dccfb9';
  for (let floor = 0; floor < 4; floor++) {
    for (let bay = 0; bay < 4; bay++) {
      const wx = bay * 10 * px + 3 * px;
      const wy = floor * 10 * px + 2 * px;
      const ww = 4 * px;
      const wh = 6 * px;
      c.fillStyle = stone;
      c.fillRect(wx - 5, wy - 8, ww + 10, 8); // lintel
      c.fillRect(wx - 4, wy + wh, ww + 8, 6); // sill
      c.fillStyle = '#1d1f29';
      c.fillRect(wx - 3, wy - 3, ww + 6, wh + 6); // frame
      const isLit = rnd() < lit;
      const glass = c.createLinearGradient(wx, wy, wx + ww, wy + wh);
      if (isLit) {
        glass.addColorStop(0, '#ffe2a8');
        glass.addColorStop(1, '#f7a95c');
      } else {
        glass.addColorStop(0, '#46607e');
        glass.addColorStop(0.55, '#26334a');
        glass.addColorStop(1, '#1b2436');
      }
      c.fillStyle = glass;
      c.fillRect(wx, wy, ww, wh);
      if (!isLit && rnd() < 0.35) {
        c.fillStyle = ['#c9a36b', '#7a8fb0', '#b56f6f'][Math.floor(rnd() * 3)];
        c.fillRect(wx, wy, ww * (0.3 + rnd() * 0.3), wh); // curtain
      }
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(wx + 3, wy + 3, 4, wh * 0.6); // reflection
      c.fillStyle = '#1d1f29';
      c.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); // mullion
      c.fillRect(wx, wy + wh / 2 - 1.5, ww, 3);
      if (rnd() < 0.18) {
        c.fillStyle = '#9aa0a8';
        c.fillRect(wx + 6, wy + wh - 18, ww - 12, 14); // AC unit
      }
      if (isLit) {
        g.fillStyle = '#ffcb80';
        g.fillRect(wx, wy, ww, wh);
      }
    }
  }
  return { map: canvasTexture(map.canvas, [40, 40]), emissiveMap: canvasTexture(glow.canvas, [40, 40]) };
}

export function concreteTexture(base: string, seed: number, slabFeet = 5, tileFeet = 20) {
  const S = 256;
  const rnd = mulberry32(seed);
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, rnd, 1400, [shade(base, 0.9), shade(base, 1.08), shade(base, 0.8)], [1, 3]);
  for (let i = 0; i < 6; i++) {
    const r = 10 + rnd() * 30;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, 'rgba(0,0,0,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(rnd() * S, rnd() * S);
    ctx.fillStyle = grd;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  const step = (S / tileFeet) * slabFeet;
  for (let p = 0; p <= S; p += step) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }
  return canvasTexture(canvas, [tileFeet, tileFeet]);
}

export function asphaltTexture(base: string, seed: number, tileFeet = 40) {
  const S = 512;
  const rnd = mulberry32(seed);
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  grain(ctx, S, S, rnd, 5000, [shade(base, 0.82), shade(base, 1.18), shade(base, 1.35)], [1, 2.5]);
  ctx.strokeStyle = 'rgba(10,10,14,0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    let x = rnd() * S;
    let y = rnd() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 12; k++) {
      x += (rnd() - 0.5) * 30;
      y += (rnd() - 0.3) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return canvasTexture(canvas, [tileFeet, tileFeet]);
}

/** Diamond wire mesh on transparent, 2 ft square. */
export function chainLinkTexture() {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#55625b';
  ctx.lineWidth = 2;
  const n = 4;
  const step = S / n;
  for (let i = -n; i <= n * 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step + S, S);
    ctx.moveTo(i * step, S);
    ctx.lineTo(i * step + S, 0);
    ctx.stroke();
  }
  return canvasTexture(canvas, [2, 2]);
}

export function netTexture() {
  const S = 64;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(S, S);
  ctx.moveTo(S, 0);
  ctx.lineTo(0, S);
  ctx.stroke();
  return canvasTexture(canvas, [0.7, 0.7]);
}

export function stripeTexture(base: string, line: string, tileFeet: number, vertical = true, lineWidth = 2) {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  const rnd = mulberry32(3);
  grain(ctx, S, S, rnd, 300, [shade(base, 0.92), shade(base, 1.08)], [1, 2]);
  ctx.fillStyle = line;
  if (vertical) ctx.fillRect(0, 0, lineWidth, S);
  else ctx.fillRect(0, 0, S, lineWidth);
  return canvasTexture(canvas, [tileFeet, tileFeet]);
}

export function brushedTexture(base: string) {
  const S = 128;
  const rnd = mulberry32(5);
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y++) {
    ctx.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`;
    ctx.fillRect(0, y, S, 1);
  }
  return canvasTexture(canvas, [4, 4]);
}

export function foliageTexture(base: string, seed: number) {
  const S = 128;
  const rnd = mulberry32(seed);
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = rnd() < 0.5 ? shade(base, 0.78) : shade(base, 1.2);
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, 3 + rnd() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(canvas, [6, 6]);
}

export function basketballTexture() {
  const W = 512;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#e2742c');
  grd.addColorStop(1, '#c95a1a');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(9);
  grain(ctx, W, H, rnd, 3000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], [1, 2]);
  ctx.strokeStyle = '#1b1210';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  for (const x of [W / 4, (3 * W) / 4]) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let x = 0; x <= W; x += 4) {
    const y = H / 2 + Math.sin((x / W) * Math.PI * 2) * H * 0.3;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- The graffiti wall ------------------------------------------------------------------------

const TAGS = ['NEXT UP', 'HOOPS', 'ONE MORE', 'BALL IS LIFE', 'KING OF THE COURT', 'RUN IT BACK', 'GAME TIME', 'BUCKETS', 'SKY HIGH', 'CITY', 'NO CALLS', 'AND ONE'];
const SPRAY = ['#de7866', '#4f9c9a', '#d9b66b', '#5c697f', '#f1d2a5', '#9b769c', '#33485b', '#eae0c8'];

/**
 * The handball wall: stained paint covered in tags. `murals` are the wall-space rectangles (in
 * canvas pixels) the murals cover, so the loudest pieces go around them rather than under them.
 */
export function graffitiWallTexture(seed: number) {
  const W = 2048;
  const H = 512;
  const rnd = mulberry32(seed);
  const { canvas, ctx } = makeCanvas(W, H);
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#b7a58d');
  base.addColorStop(1, '#8e9385');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, rnd, 9000, ['rgba(0,0,0,0.06)', 'rgba(255,255,255,0.08)'], [1, 3]);
  // Paint patches from old cover-ups.
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = ['#bdae98', '#8b9d98', '#a39182', '#b39886'][Math.floor(rnd() * 4)];
    ctx.fillRect(rnd() * W, rnd() * H, 80 + rnd() * 260, 40 + rnd() * 160);
  }
  // Older, mural-scale ribbons peek through the new tags and sellable panels.
  // Their broad shapes remain visible in a camera pass where tiny lettering disappears.
  for (let i = 0; i < 16; i++) {
    ctx.save();
    ctx.translate(rnd() * W, H * (0.3 + rnd() * 0.6));
    ctx.rotate((rnd() - 0.5) * 1.4);
    ctx.strokeStyle = SPRAY[i % SPRAY.length];
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 12 + rnd() * 36;
    ctx.beginPath();
    ctx.ellipse(0, 0, 100 + rnd() * 180, 45 + rnd() * 70, 0, 0, Math.PI * (1.2 + rnd() * 0.6));
    ctx.stroke(); ctx.restore();
  }
  // Water stains running down from the top.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W;
    const grd = ctx.createLinearGradient(0, 0, 0, H * 0.5);
    grd.addColorStop(0, 'rgba(60,50,40,0.18)');
    grd.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x, 0, 4 + rnd() * 16, H * (0.2 + rnd() * 0.4));
  }
  // Tags and throw-ups: a band along the bottom, one along the top, and big pieces at each end.
  const piece = (text: string, x: number, y: number, size: number, rot: number) => {
    const fill = SPRAY[Math.floor(rnd() * SPRAY.length)];
    let outline = SPRAY[Math.floor(rnd() * SPRAY.length)];
    if (outline === fill) outline = '#1a1214';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `${size}px ${rnd() < 0.5 ? SIGN_FONT : MARKER_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(20,14,16,0.85)';
    ctx.fillText(text, size * 0.08, size * 0.08); // drop shadow
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = '#1a1214';
    ctx.strokeText(text, 0, 0);
    ctx.lineWidth = size * 0.08;
    ctx.strokeStyle = outline;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    // Drips.
    ctx.fillStyle = fill;
    const w = ctx.measureText(text).width;
    for (let d = 0; d < 5; d++) {
      const dx = (rnd() - 0.5) * w;
      const len = 10 + rnd() * size * 0.8;
      ctx.fillRect(dx, size * 0.3, 3, len);
      ctx.beginPath();
      ctx.arc(dx + 1.5, size * 0.3 + len, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };
  for (let x = 60; x < W; x += 170 + rnd() * 120) piece(TAGS[Math.floor(rnd() * TAGS.length)], x, H - 50 - rnd() * 30, 34 + rnd() * 18, (rnd() - 0.5) * 0.15);
  for (let x = 90; x < W; x += 200 + rnd() * 160) piece(TAGS[Math.floor(rnd() * TAGS.length)], x, 40 + rnd() * 20, 28 + rnd() * 12, (rnd() - 0.5) * 0.12);
  piece('HOOPS', 130, H / 2, 110, -0.08);
  piece('NEXT', W - 140, H / 2 - 40, 90, 0.06);
  piece('UP', W - 140, H / 2 + 60, 110, -0.04);
  // Spray dots and splatter.
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = SPRAY[Math.floor(rnd() * SPRAY.length)] + '88';
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, rnd() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(canvas);
}

/** A tiny generated height map; no external assets or additional requests. */
export function surfaceBumpTexture(kind: 'asphalt' | 'plaster' | 'vinyl', seed = 91) {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
  if (kind === 'vinyl') {
    // Smooth diagonal creases, small enough that they catch highlights rather than deform type.
    for (let i = 0; i < 5; i++) {
      const x = i * S / 5;
      const g = ctx.createLinearGradient(x, 0, x + 30, S * 0.12);
      g.addColorStop(0, '#808080'); g.addColorStop(0.4, '#565656');
      g.addColorStop(0.54, '#999999'); g.addColorStop(1, '#808080');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 35, S);
    }
  } else {
    for (let i = 0; i < 15000; i++) {
      const v = Math.floor(85 + rnd() * 90);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      const size = kind === 'plaster' ? 0.5 + rnd() * 2 : 0.5 + rnd();
      ctx.fillRect(rnd() * S, rnd() * S, size, size);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/** Plane-tree bark: vertical fissures and exfoliating warm gray plates. */
export function barkTexture() {
  const { canvas, ctx } = makeCanvas(256, 512);
  const rnd = mulberry32(916);
  ctx.fillStyle = '#6e6958'; ctx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 520; i++) {
    const x = rnd() * 256, y = rnd() * 512;
    ctx.fillStyle = ['#565747', '#96917b', '#827b64', '#454a3e'][i % 4];
    ctx.beginPath(); ctx.roundRect(x, y, 4 + rnd() * 18, 9 + rnd() * 68, rnd() * 6); ctx.fill();
  }
  grain(ctx, 256, 512, rnd, 4500, ['rgba(0,0,0,.12)', 'rgba(234,222,191,.10)'], [1, 2]);
  return canvasTexture(canvas, [3, 7]);
}
