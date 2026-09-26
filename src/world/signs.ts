import * as THREE from 'three';
import { COURT, FLOOR, RIM, TEAMS, THREE_POINT, usd } from '../config';
import { mulberry32 } from '../data/random';
import type { Brand } from '../data/types';
import { BODY_FONT, canvasTexture, fitText, makeCanvas, MARKER_FONT, shade, SIGN_FONT, wrapWords } from './textures';

export interface Scoreboard {
  score: [number, number];
  quarter: number;
  clock: number;
}

/** A canvas-backed surface on one of the park's named meshes. */
export class Painted {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;

  constructor(width: number, height: number) {
    const { canvas, ctx } = makeCanvas(width, height);
    this.canvas = canvas;
    this.ctx = ctx;
    this.texture = canvasTexture(canvas);
  }

  get w() {
    return this.canvas.width;
  }

  get h() {
    return this.canvas.height;
  }

  commit() {
    this.texture.needsUpdate = true;
  }
}

// --- Court ------------------------------------------------------------------------------------

const PX = 12; // texture pixels per foot

export class CourtPainter extends Painted {
  private readonly worn: HTMLCanvasElement;

  constructor() {
    super(FLOOR.length * PX, FLOOR.width * PX);
    this.worn = this.paintBase();
  }

  private X(x: number) {
    return (x + FLOOR.length / 2) * PX;
  }

  private Z(z: number) {
    return (z + FLOOR.width / 2) * PX;
  }

  /** Acrylic paint over asphalt: broad sun-faded patches, aggregate and shoe wear. */
  private paintBase() {
    const { canvas, ctx } = makeCanvas(this.w, this.h);
    const rnd = mulberry32(21);
    const hl = COURT.length / 2;
    const hw = COURT.width / 2;
    ctx.fillStyle = '#354752';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#98677e';
    ctx.fillRect(this.X(-hl), this.Z(-hw), COURT.length * PX, COURT.width * PX);
    // A contrasting faded teal key makes both baskets legible in the wide shot.
    for (const s of [1, -1]) {
      const xa = this.X(s * hl);
      const xb = this.X(s * (hl - 19));
      ctx.fillStyle = '#3d7775';
      ctx.fillRect(Math.min(xa, xb), this.Z(-8), Math.abs(xb - xa), 16 * PX);
      ctx.fillStyle = '#deb982';
      ctx.fillRect(this.X(s < 0 ? -hl - 0.85 : hl + 0.45), this.Z(-hw), 0.4 * PX, COURT.width * PX);
    }
    // Irregular broad patches of worn acrylic, rather than uniform digital noise.
    for (let i = 0; i < 160; i++) {
      const r = 10 + rnd() * 80;
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, i % 3 ? 'rgba(244,205,161,0.13)' : 'rgba(49,49,65,0.10)');
      grd.addColorStop(1, 'rgba(244,205,161,0)');
      ctx.save();
      ctx.translate(rnd() * this.w, rnd() * this.h);
      ctx.scale(1.5 + rnd(), 0.3 + rnd() * 0.7);
      ctx.fillStyle = grd;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
    // Aggregate showing through worn paint around high-traffic areas.
    for (let i = 0; i < 175; i++) {
      const x = this.X((rnd() - 0.5) * COURT.length);
      const y = this.Z((rnd() - 0.5) * COURT.width);
      const r = 2 + rnd() * 13;
      ctx.fillStyle = ['#a19487', '#b49d8a', '#737b78', '#bd9b97'][Math.floor(rnd() * 4)];
      ctx.globalAlpha = 0.12 + rnd() * 0.18;
      ctx.beginPath();
      for (let v = 0; v < 9; v++) {
        const a = v * Math.PI * 2 / 9;
        const d = r * (0.5 + rnd() * 0.8);
        const px = x + Math.cos(a) * d * 1.8;
        const py = y + Math.sin(a) * d;
        if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 24000; i++) {
      ctx.fillStyle = rnd() < 0.55 ? 'rgba(27,32,39,0.10)' : 'rgba(249,227,196,0.12)';
      const size = 0.5 + rnd() * 1.5;
      ctx.fillRect(rnd() * this.w, rnd() * this.h, size, size);
    }
    // Thin repaired cracks, with a faded rim around the tar.
    for (let i = 0; i < 8; i++) {
      let x = rnd() * this.w;
      let y = rnd() * this.h;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += (rnd() - 0.3) * 29;
        y += (rnd() - 0.5) * 32;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(231,200,168,0.18)'; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(43,44,52,0.36)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // Short rubber arcs under the baskets read as sneaker marks in close shots.
    ctx.strokeStyle = 'rgba(34,44,49,0.12)';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 105; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = this.X(side * (28 + rnd() * 17));
      const y = this.Z((rnd() - 0.5) * 24);
      ctx.beginPath(); ctx.ellipse(x, y, 3 + rnd() * 9, 2 + rnd() * 4, rnd() * 6, 0, Math.PI * 0.7); ctx.stroke();
    }
    return canvas;
  }

  draw(naming: Brand | null) {
    const { ctx } = this;
    const X = (x: number) => this.X(x);
    const Z = (z: number) => this.Z(z);
    const hl = COURT.length / 2;
    const hw = COURT.width / 2;
    ctx.drawImage(this.worn, 0, 0);

    ctx.strokeStyle = 'rgba(248,242,232,0.92)';
    ctx.fillStyle = 'rgba(248,242,232,0.92)';
    ctx.lineWidth = 3;
    ctx.strokeRect(X(-hl) + 1.5, Z(-hw) + 1.5, COURT.length * PX - 3, COURT.width * PX - 3);
    ctx.fillRect(X(0) - 1.5, Z(-hw), 3, COURT.width * PX);
    const dx = Math.sqrt(THREE_POINT.radius ** 2 - THREE_POINT.cornerZ ** 2);
    const arcHalf = Math.atan2(THREE_POINT.cornerZ, dx);
    for (const s of [1, -1]) {
      const bx = X(s * RIM.x);
      const bz = Z(0);
      const xa = X(s * hl);
      const xb = X(s * (hl - 19));
      ctx.strokeRect(Math.min(xa, xb) + 1.5, Z(-8) + 1.5, Math.abs(xb - xa) - 3, 16 * PX - 3);
      ctx.beginPath();
      ctx.arc(xb, bz, 6 * PX, 0, Math.PI * 2);
      ctx.stroke();
      const xc = X(s * (RIM.x - dx));
      for (const zs of [1, -1]) ctx.fillRect(Math.min(xa, xc), Z(zs * THREE_POINT.cornerZ) - 1.5, Math.abs(xc - xa), 3);
      ctx.beginPath();
      if (s === 1) ctx.arc(bx, bz, THREE_POINT.radius * PX, Math.PI - arcHalf, Math.PI + arcHalf);
      else ctx.arc(bx, bz, THREE_POINT.radius * PX, -arcHalf, arcHalf);
      ctx.stroke();
      ctx.beginPath();
      if (s === 1) ctx.arc(bx, bz, 4 * PX, Math.PI / 2, (3 * Math.PI) / 2);
      else ctx.arc(bx, bz, 4 * PX, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }

    // Center court belongs to the naming-rights holder.
    const plate = naming ? naming.color : '#1d1638';
    const ink = naming ? naming.accent : '#ffd23f';
    ctx.beginPath();
    ctx.arc(X(0), Z(0), 6 * PX, 0, Math.PI * 2);
    ctx.fillStyle = plate;
    ctx.fill();
    ctx.stroke();
    const name = naming ? naming.name.toUpperCase() : 'YOUR NAME HERE';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, name, SIGN_FONT, 36 * PX, 56, 18);
    const tw = ctx.measureText(name).width + 3 * PX;
    const th = parseInt(ctx.font, 10) + 2 * PX;
    ctx.fillStyle = plate;
    ctx.fillRect(X(0) - tw / 2, Z(0) - th / 2, tw, th);
    ctx.strokeRect(X(0) - tw / 2, Z(0) - th / 2, tw, th);
    ctx.fillStyle = ink;
    ctx.fillText(name, X(0), Z(0) + 2);

    // The court's name painted along both sideline aprons, reading toward the main camera.
    const title = `THE ${naming ? naming.name.toUpperCase() : '______'} COURT`;
    ctx.fillStyle = 'rgba(248,242,232,0.9)';
    fitText(ctx, title, SIGN_FONT, 70 * PX, 64, 20);
    for (const z of [-(hw + 3.4), hw + 3.4]) ctx.fillText(title, X(0), Z(z));
    // Sun-bleached pinholes in the painted lines and lettering.
    const rnd = mulberry32(717);
    ctx.fillStyle = 'rgba(63,64,67,0.12)';
    for (let i = 0; i < 1800; i++) ctx.fillRect(rnd() * this.w, rnd() * this.h, 1 + rnd() * 2, 1);
    this.commit();
  }
}

// --- Banners ----------------------------------------------------------------------------------

export function drawBanner(p: Painted, brand: Brand | null, priceCents: number) {
  const { ctx, w, h } = p;
  if (brand) {
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, shade(brand.color, 1.08));
    grd.addColorStop(1, shade(brand.color, 0.86));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = brand.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const name = brand.name.toUpperCase();
    if (h / w > 0.3) {
      fitText(ctx, name, SIGN_FONT, w * 0.86, h * 0.34, 16);
      ctx.fillText(name, w / 2, h * 0.44);
      fitText(ctx, brand.tagline, BODY_FONT, w * 0.8, h * 0.14, 10);
      ctx.globalAlpha = 0.85;
      ctx.fillText(brand.tagline, w / 2, h * 0.74);
      ctx.globalAlpha = 1;
    } else {
      fitText(ctx, name, SIGN_FONT, w * 0.86, h * 0.58, 14);
      ctx.fillText(name, w / 2, h * 0.54);
    }
  } else {
    ctx.fillStyle = '#16122b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,210,63,0.6)';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    const big = h / w > 0.3;
    fitText(ctx, 'YOUR BRAND HERE', SIGN_FONT, w * 0.8, h * (big ? 0.24 : 0.38), 12);
    ctx.fillText('YOUR BRAND HERE', w / 2, h * (big ? 0.42 : 0.42));
    ctx.fillStyle = '#37e0ff';
    fitText(ctx, `FROM ${usd(priceCents)}`, BODY_FONT, w * 0.6, h * (big ? 0.16 : 0.24), 10);
    ctx.fillText(`FROM ${usd(priceCents)}`, w / 2, h * (big ? 0.7 : 0.76));
  }
  // Long shallow folds retain readable type while giving the vinyl a physical sheen.
  for (let i = 0; i < 6; i++) {
    const x = w * (i + 0.25) / 6;
    const fold = ctx.createLinearGradient(x, 0, x + w * 0.13, h * 0.32);
    fold.addColorStop(0, 'rgba(0,0,0,0)');
    fold.addColorStop(0.38, 'rgba(5,10,20,0.13)');
    fold.addColorStop(0.52, 'rgba(255,247,224,0.10)');
    fold.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fold;
    ctx.fillRect(x, 0, w * 0.14, h);
  }
  // Double stitched hem and metal eyelets. Small highlights read even from the camera.
  ctx.strokeStyle = 'rgba(8,13,18,0.30)'; ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.strokeStyle = 'rgba(255,248,224,0.32)'; ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]); ctx.strokeRect(8, 8, w - 16, h - 16); ctx.setLineDash([]);
  for (const x of [13, w / 2, w - 13]) for (const y of [13, h - 13]) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(x + 1, y + 2, 5.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#abb1ac';
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#eff0d6'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 3.6, Math.PI, Math.PI * 1.85); ctx.stroke();
    ctx.fillStyle = '#283038';
    ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill();
  }

  p.commit();
}

// --- Murals -----------------------------------------------------------------------------------

export function drawMural(p: Painted, brand: Brand | null, priceCents: number, seed: number) {
  const { ctx, w, h } = p;
  const rnd = mulberry32(seed);
  ctx.clearRect(0, 0, w, h);
  if (!brand) {
    ctx.fillStyle = '#d7cfc2';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    ctx.strokeStyle = 'rgba(30,24,40,0.55)';
    ctx.setLineDash([18, 12]);
    ctx.lineWidth = 5;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#2b2233';
    fitText(ctx, 'YOUR MURAL HERE', MARKER_FONT, w * 0.8, h * 0.2, 16);
    ctx.fillText('YOUR MURAL HERE', w / 2, h * 0.42);
    ctx.fillStyle = '#ff3ea5';
    fitText(ctx, `FROM ${usd(priceCents)}`, SIGN_FONT, w * 0.5, h * 0.11, 12);
    ctx.fillText(`FROM ${usd(priceCents)}`, w / 2, h * 0.64);
    muralPatina(ctx, w, h, seed);
    p.commit();
    return;
  }
  // Layers of loose spray gestures feel painted onto the wall, with the brand palette intact.
  ctx.fillStyle = shade(brand.color, 0.82);
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    ctx.save();
    ctx.translate(rnd() * w, rnd() * h);
    ctx.rotate((rnd() - 0.5) * 1.5);
    ctx.strokeStyle = i % 3 === 0 ? brand.accent : shade(brand.color, i % 2 ? 0.6 : 1.2);
    ctx.globalAlpha = i % 3 === 0 ? 0.35 : 0.9;
    ctx.lineWidth = h * (0.035 + rnd() * 0.10);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * (0.2 + rnd() * 0.2), h * (0.15 + rnd() * 0.3), 0, 0, Math.PI * (1.1 + rnd()));
    ctx.stroke();
    ctx.restore();
  }
  // Overspray diffuses the hard gestural marks into the rough substrate.
  for (let i = 0; i < 15; i++) {
    const r = 30 + rnd() * 90;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, shade(brand.color, 1.3) + '77');
    grd.addColorStop(1, shade(brand.color, 1.3) + '00');
    ctx.save(); ctx.translate(rnd() * w, rnd() * h);
    ctx.fillStyle = grd; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
  }
  // Big outlined name with a drop shadow, like a throw-up piece.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapWords(brand.name.toUpperCase(), 12).slice(0, 2);
  const size = Math.min(...lines.map((l) => fitText(ctx, l, SIGN_FONT, w * 0.84, h * (lines.length > 1 ? 0.26 : 0.34), 18)));
  ctx.font = `${size}px ${SIGN_FONT}`;
  ctx.lineJoin = 'round';
  lines.forEach((line, i) => {
    const y = h * (lines.length > 1 ? 0.3 + i * 0.28 : 0.44);
    ctx.fillStyle = 'rgba(15,10,20,0.55)';
    ctx.fillText(line, w / 2 + size * 0.07, y + size * 0.07);
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = '#140e18';
    ctx.strokeText(line, w / 2, y);
    ctx.lineWidth = size * 0.1;
    ctx.strokeStyle = brand.accent;
    ctx.strokeText(line, w / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, w / 2, y);
  });
  ctx.fillStyle = brand.accent;
  fitText(ctx, brand.tagline, MARKER_FONT, w * 0.8, h * 0.1, 12);
  ctx.fillText(brand.tagline, w / 2, h * 0.84);
  // A few drips off the letters.
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) {
    const x = w * (0.15 + rnd() * 0.7);
    const y = h * (lines.length > 1 ? 0.62 : 0.55);
    const len = 10 + rnd() * 40;
    ctx.fillRect(x, y, 4, len);
    ctx.beginPath();
    ctx.arc(x + 2, y + len, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  muralPatina(ctx, w, h, seed);
  p.commit();
}

/** Local plaster detail, reused on both occupied and available wall space. */
function muralPatina(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rnd = mulberry32(seed + 733);
  ctx.save();
  // Fine uneven pores leave the mural readable rather than drowning it in noise.
  for (let i = 0; i < 11000; i++) {
    ctx.fillStyle = i % 3 ? 'rgba(22,28,30,0.085)' : 'rgba(242,222,191,0.20)';
    const size = 0.5 + rnd() * 1.8;
    ctx.fillRect(rnd() * w, rnd() * h, size, size * 0.8);
  }
  // Mortar is still faintly visible through layers of acrylic paint.
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(32,29,36,0.13)';
  const course = Math.max(24, h / 6);
  for (let row = 0; row < 6; row++) {
    const y = row * course;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    for (let x = row % 2 ? -course : 0; x < w; x += course * 2.7) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + course); ctx.stroke();
    }
  }
  // Chipped edges and a couple of short water trails physically anchor the paint.
  for (let i = 0; i < 140; i++) {
    const x = rnd() * w;
    const y = rnd() < 0.5 ? rnd() * 10 : h - rnd() * 14;
    ctx.fillStyle = rnd() < 0.4 ? '#b9aa93' : 'rgba(225,210,182,0.35)';
    ctx.fillRect(x, y, 1 + rnd() * 7, 1 + rnd() * 3);
  }
  ctx.restore();
}

// --- Naming sign ------------------------------------------------------------------------------

export function drawNamingSign(p: Painted, brand: Brand | null, priceCents: number) {
  const { ctx, w, h } = p;
  const bg = brand ? brand.color : '#141129';
  const ink = brand ? brand.accent : '#ffd23f';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  const text = `THE ${brand ? brand.name.toUpperCase() : '______'} COURT`;
  fitText(ctx, text, SIGN_FONT, w * (brand ? 0.9 : 0.62), h * 0.62, 18);
  ctx.fillText(text, brand ? w / 2 : w * 0.36, h * 0.54);
  if (!brand) {
    ctx.fillStyle = '#37e0ff';
    fitText(ctx, `NAMING RIGHTS ${usd(priceCents)}`, SIGN_FONT, w * 0.3, h * 0.3, 12);
    ctx.fillText(`NAMING RIGHTS ${usd(priceCents)}`, w * 0.83, h * 0.54);
  }
  const shadeEdge = ctx.createLinearGradient(0, 0, 0, h);
  shadeEdge.addColorStop(0, 'rgba(255,247,220,0.12)');
  shadeEdge.addColorStop(0.18, 'rgba(0,0,0,0)');
  shadeEdge.addColorStop(0.85, 'rgba(0,0,0,0)');
  shadeEdge.addColorStop(1, 'rgba(0,0,0,0.24)');
  ctx.fillStyle = shadeEdge; ctx.fillRect(0, 0, w, h);
  for (const x of [20, w - 20]) for (const y of [20, h - 20]) {
    ctx.fillStyle = '#80928d'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#32393a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.stroke();
  }
  p.commit();
}

// --- Big screen -------------------------------------------------------------------------------

type ScreenMode = 'ad' | 'score' | 'promo' | 'flash';

export class ScreenPainter extends Painted {
  private readonly led: HTMLCanvasElement;
  private renter: Brand | null = null;
  private dayPrice = 0;
  private mode: ScreenMode = 'promo';
  private modeTime = 0;
  private lastDraw = -1;
  private flashInfo: { team: 0 | 1; points: number } | null = null;

  constructor() {
    super(768, 432);
    const { canvas, ctx } = makeCanvas(this.w, this.h);
    // Pixel cells and module seams are baked once; ten screen redraws per second stay cheap.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < this.h; y += 4) ctx.fillRect(0, y, this.w, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < this.w; x += 4) ctx.fillRect(x, 0, 1, this.h);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = 0; x < this.w; x += 128) ctx.fillRect(x, 0, 2, this.h);
    for (let y = 0; y < this.h; y += 108) ctx.fillRect(0, y, this.w, 2);
    const glass = ctx.createLinearGradient(0, 0, this.w * 0.6, this.h);
    glass.addColorStop(0, 'rgba(165,220,237,0.09)');
    glass.addColorStop(0.5, 'rgba(165,220,237,0)');
    glass.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = glass; ctx.fillRect(0, 0, this.w, this.h);
    this.led = canvas;
  }

  set(renter: Brand | null, dayPriceCents: number) {
    this.renter = renter;
    this.dayPrice = dayPriceCents;
    this.mode = renter ? 'ad' : 'promo';
    this.modeTime = 0;
    this.lastDraw = -1;
  }

  flash(team: 0 | 1, points: number) {
    this.flashInfo = { team, points };
    this.mode = 'flash';
    this.modeTime = 0;
    this.lastDraw = -1;
  }

  update(t: number, dt: number, sb: Scoreboard) {
    this.modeTime += dt;
    const limit = { flash: 2, ad: 7, promo: 5, score: 4 }[this.mode];
    if (this.modeTime > limit) {
      this.mode = this.mode === 'flash' ? 'score' : this.mode === 'score' ? (this.renter ? 'ad' : 'promo') : 'score';
      this.modeTime = 0;
      this.lastDraw = -1;
    }
    if (this.lastDraw >= 0 && t - this.lastDraw < 0.1) return;
    this.lastDraw = t;
    if (this.mode === 'ad' && this.renter) this.drawAd(this.renter);
    else if (this.mode === 'flash' && this.flashInfo) this.drawFlash(this.flashInfo.team, this.flashInfo.points);
    else if (this.mode === 'promo') this.drawPromo(t);
    else this.drawScore(sb);
    this.ctx.drawImage(this.led, 0, 0);
    this.commit();
  }

  private drawAd(b: Brand) {
    const { ctx, w, h } = this;
    const grd = ctx.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, shade(b.color, 1.1));
    grd.addColorStop(1, shade(b.color, 0.8));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = b.accent;
    ctx.font = `600 22px ${BODY_FONT}`;
    ctx.fillText('ON THE BIG SCREEN TODAY', w / 2, 44);
    const lines = wrapWords(b.name.toUpperCase(), 12).slice(0, 2);
    const size = Math.min(...lines.map((l) => fitText(ctx, l, SIGN_FONT, w - 80, 96, 24)));
    ctx.font = `${size}px ${SIGN_FONT}`;
    lines.forEach((l, i) => ctx.fillText(l, w / 2, h * 0.44 + (i - (lines.length - 1) / 2) * (size + 12)));
    fitText(ctx, b.tagline, BODY_FONT, w - 80, 34, 14);
    ctx.fillText(b.tagline, w / 2, h * 0.76);
    ctx.globalAlpha = 0.8;
    ctx.font = `500 22px ${BODY_FONT}`;
    ctx.fillText(hostOf(b.url), w / 2, h * 0.88);
    ctx.globalAlpha = 1;
  }

  private drawScore(sb: Scoreboard) {
    const { ctx, w, h } = this;
    ctx.fillStyle = '#07060e';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    TEAMS.forEach((team, i) => {
      const x = i === 0 ? w * 0.22 : w * 0.78;
      ctx.fillStyle = team.jersey;
      ctx.font = `30px ${SIGN_FONT}`;
      ctx.fillText(team.name, x, h * 0.2);
      ctx.fillStyle = '#fdf6e3';
      ctx.font = `140px ${SIGN_FONT}`;
      ctx.fillText(String(sb.score[i]), x, h * 0.52);
    });
    const m = Math.floor(sb.clock / 60);
    const s = Math.floor(sb.clock % 60);
    ctx.fillStyle = '#ffd23f';
    ctx.font = `34px ${SIGN_FONT}`;
    ctx.fillText(`Q${sb.quarter}`, w / 2, h * 0.34);
    ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, w / 2, h * 0.52);
    ctx.fillStyle = '#37e0ff';
    ctx.font = `600 24px ${BODY_FONT}`;
    ctx.fillText(this.renter ? `PRESENTED BY ${this.renter.name.toUpperCase()}` : 'THIS SCREEN COULD BE YOURS', w / 2, h * 0.86);
  }

  private drawPromo(t: number) {
    const { ctx, w, h } = this;
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#1a1236');
    grd.addColorStop(1, '#0b0a18');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.font = `64px ${SIGN_FONT}`;
    ctx.fillText('YOUR LAUNCH', w / 2, h * 0.3);
    ctx.fillText('ON THIS SCREEN', w / 2, h * 0.5);
    ctx.fillStyle = Math.floor(t * 2) % 2 ? '#ff3ea5' : '#37e0ff';
    ctx.font = `44px ${SIGN_FONT}`;
    ctx.fillText(`${usd(this.dayPrice)} / DAY`, w / 2, h * 0.76);
  }

  private drawFlash(team: 0 | 1, points: number) {
    const { ctx, w, h } = this;
    ctx.fillStyle = TEAMS[team].jersey;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEAMS[team].trim;
    ctx.font = `180px ${SIGN_FONT}`;
    ctx.fillText(`+${points}`, w / 2, h * 0.44);
    ctx.font = `48px ${SIGN_FONT}`;
    ctx.fillText(points === 3 ? 'FROM DOWNTOWN' : TEAMS[team].name, w / 2, h * 0.82);
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Jersey number decal: transparent background, number in the team's trim color. */
export function numberTexture(num: number, color: string, outline: string) {
  const { canvas, ctx } = makeCanvas(128, 128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `92px ${SIGN_FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = outline;
  ctx.strokeText(String(num), 64, 70);
  ctx.fillStyle = color;
  ctx.fillText(String(num), 64, 70);
  return canvasTexture(canvas);
}
