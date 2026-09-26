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

  /** Surface, lanes and wear never change, so they're painted once. */
  private paintBase() {
    const { canvas, ctx } = makeCanvas(this.w, this.h);
    const rnd = mulberry32(21);
    const hl = COURT.length / 2;
    const hw = COURT.width / 2;
    ctx.fillStyle = '#35285a';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#5b3f8c';
    ctx.fillRect(this.X(-hl), this.Z(-hw), COURT.length * PX, COURT.width * PX);
    // Painted lanes.
    ctx.fillStyle = '#e46a2e';
    for (const s of [1, -1]) {
      const xa = this.X(s * hl);
      const xb = this.X(s * (hl - 19));
      ctx.fillRect(Math.min(xa, xb), this.Z(-8), Math.abs(xb - xa), 16 * PX);
    }
    // Wear: lighter scuffs where players run, a few cracks, grain everywhere.
    for (let i = 0; i < 70; i++) {
      const r = 20 + rnd() * 90;
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.07)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(this.X((rnd() - 0.5) * COURT.length), this.Z((rnd() - 0.5) * COURT.width));
      ctx.scale(1.6, 1);
      ctx.fillStyle = grd;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(rnd() * this.w, rnd() * this.h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    ctx.strokeStyle = 'rgba(20,12,34,0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      let x = rnd() * this.w;
      let y = rnd() * this.h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
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
  // Grommets, so it reads as a vinyl banner zip-tied on.
  ctx.fillStyle = 'rgba(220,220,225,0.95)';
  for (const [x, y] of [
    [12, 12],
    [w - 12, 12],
    [12, h - 12],
    [w - 12, h - 12],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
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
    p.commit();
    return;
  }
  // Spray-painted background: brand color with soft blobs and a sunburst.
  ctx.fillStyle = shade(brand.color, 0.75);
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  for (let i = 0; i < 18; i++) {
    ctx.rotate((Math.PI * 2) / 18);
    ctx.fillStyle = i % 2 ? shade(brand.color, 0.9) : shade(brand.color, 1.05);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, -w * 0.09);
    ctx.lineTo(w, w * 0.09);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  for (let i = 0; i < 12; i++) {
    const r = 30 + rnd() * 90;
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, shade(brand.color, 1.3) + 'aa');
    grd.addColorStop(1, shade(brand.color, 1.3) + '00');
    ctx.save();
    ctx.translate(rnd() * w, rnd() * h);
    ctx.fillStyle = grd;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
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
  p.commit();
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
  p.commit();
}

// --- Big screen -------------------------------------------------------------------------------

type ScreenMode = 'ad' | 'score' | 'promo' | 'flash';

export class ScreenPainter extends Painted {
  private renter: Brand | null = null;
  private dayPrice = 0;
  private mode: ScreenMode = 'promo';
  private modeTime = 0;
  private lastDraw = -1;
  private flashInfo: { team: 0 | 1; points: number } | null = null;

  constructor() {
    super(768, 432);
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
    // Faint LED rows.
    const { ctx, w, h } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
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
