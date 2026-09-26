import { PRICES, takeoverPrice, usd } from '../config';
import type { ArenaState, Brand, SpotRef } from '../data/types';
import { bannerSideName, muralWallName, SECTIONS } from '../world/layout';

function spotDetails(state: ArenaState, ref: SpotRef): { label: string; place: string; brand: Brand | null; price: string } {
  let brandId: string | null = null;
  let label = '';
  let place = '';
  let price = '';
  if (ref.kind === 'seat') {
    brandId = state.seats.find((s) => s.section === ref.section && s.row === ref.row && s.col === ref.col)?.brandId ?? null;
    label = 'A SEAT IN THE GAME';
    place = `${SECTIONS[ref.section].name} bleachers · Row ${ref.row + 1} · Seat ${ref.col + 1}`;
    price = `${usd(PRICES.seatCents)} / seat`;
  } else if (ref.kind === 'screen') {
    brandId = state.screen.brandId;
    label = 'UP IN LIGHTS';
    place = 'The big screen';
    price = `${usd(state.screen.dayPriceCents)} / day`;
  } else if (ref.kind === 'naming') {
    brandId = state.naming.brandId;
    label = 'A NAME THAT OWNS THE COURT';
    place = 'Court naming rights';
    price = usd(brandId ? takeoverPrice(state.naming.valueCents) : state.naming.valueCents);
  } else {
    const holding = (ref.kind === 'banner' ? state.banners : state.murals)[ref.index];
    brandId = holding.brandId;
    label = ref.kind === 'banner' ? 'RIGHT ON THE SIDELINE' : 'LEAVE YOUR MARK';
    place = `${ref.kind === 'banner' ? bannerSideName(ref.index) : muralWallName(ref.index)} · ${ref.kind} ${ref.index + 1}`;
    price = usd(brandId ? takeoverPrice(holding.valueCents) : holding.valueCents);
  }
  return { label, place, brand: brandId ? state.brands[brandId] ?? null : null, price };
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, weight = 800) {
  let fontSize = size;
  do {
    ctx.font = `${weight} ${fontSize}px Inter, Arial, sans-serif`;
    fontSize -= 1;
  } while (ctx.measureText(text).width > maxWidth && fontSize > 18);
  ctx.fillText(text, x, y, maxWidth);
}

/** Capture immediately after the final scene render; no preserveDrawingBuffer or extra WebGL memory required. */
export async function downloadSpotCard(source: HTMLCanvasElement, state: ArenaState, ref: SpotRef): Promise<void> {
  if (!source.width || !source.height) throw new Error('The scene has not rendered yet.');
  const portrait = source.width < source.height;
  const w = portrait ? 1080 : 1600;
  const h = portrait ? 1350 : 1000;
  const top = 62;
  const captionHeight = portrait ? 294 : 250;
  const photoHeight = h - captionHeight - top;
  const card = document.createElement('canvas');
  card.width = w;
  card.height = h;
  const ctx = card.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable.');
  const spot = spotDetails(state, ref);

  ctx.fillStyle = '#252a24';
  ctx.fillRect(0, 0, w, h);
  // Cover the photo area without stretching. Copy before yielding so WebGL's transient buffer is intact.
  const scale = Math.max(w / source.width, photoHeight / source.height);
  const sw = w / scale;
  const sh = photoHeight / scale;
  ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, top, w, photoHeight);

  const gradient = ctx.createLinearGradient(0, top + photoHeight - 150, 0, top + photoHeight);
  gradient.addColorStop(0, '#252a2400');
  gradient.addColorStop(1, '#252a2499');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, top + photoHeight - 150, w, 150);

  ctx.fillStyle = '#eee8dc';
  ctx.font = '800 20px Inter, Arial, sans-serif';
  ctx.fillText('STREET COURT', 38, 40);
  ctx.textAlign = 'right';
  ctx.font = '500 14px Inter, Arial, sans-serif';
  ctx.fillStyle = '#c3c6b5';
  ctx.fillText(state.demo ? 'FICTIONAL BRANDS / DEMO PREVIEW' : 'INTERACTIVE PREVIEW', w - 38, 39);
  ctx.textAlign = 'left';

  const courtBrand = state.naming.brandId ? state.brands[state.naming.brandId] : null;
  ctx.fillStyle = '#f8f0e0';
  fitText(ctx, courtBrand ? `THE ${courtBrand.name.toUpperCase()} COURT` : 'THIS COULD BE YOUR COURT.', 40, top + photoHeight - 34, w - 80, portrait ? 24 : 27, 700);

  const y = top + photoHeight;
  ctx.fillStyle = '#eee8dc';
  ctx.fillRect(0, y, w, captionHeight);
  ctx.fillStyle = spot.brand?.color ?? '#d96332';
  ctx.fillRect(0, y, 10, captionHeight);
  ctx.fillStyle = '#787d6c';
  ctx.font = '600 14px Inter, Arial, sans-serif';
  ctx.fillText(spot.label, 40, y + 41);
  ctx.fillStyle = '#252a24';
  const headline = spot.brand?.name ?? 'Your name. Right here.';
  fitText(ctx, headline, 38, y + 115, w - (portrait ? 80 : 390), portrait ? 62 : 66);
  ctx.fillStyle = '#697060';
  fitText(ctx, spot.place, 40, y + 151, w - (portrait ? 80 : 390), 21, 500);
  ctx.font = '500 13px Inter, Arial, sans-serif';
  ctx.fillText(state.demo ? 'Fictional demo · No purchase made · Checkout is not live' : 'Preview · No purchase made · Checkout is not live', 40, h - 31);

  if (!portrait) {
    ctx.strokeStyle = '#252a2433';
    ctx.beginPath();
    ctx.moveTo(w - 315, y + 36);
    ctx.lineTo(w - 315, h - 37);
    ctx.stroke();
    ctx.fillStyle = '#787d6c';
    ctx.font = '600 13px Inter, Arial, sans-serif';
    ctx.fillText('MAKE YOUR MARK', w - 275, y + 62);
    ctx.fillStyle = '#252a24';
    fitText(ctx, spot.price, w - 277, y + 122, 238, 47);
    ctx.fillStyle = '#787d6c';
    ctx.font = '400 13px Inter, Arial, sans-serif';
    ctx.fillText('Preview pricing', w - 275, y + 150);
  } else {
    ctx.fillStyle = '#252a24';
    fitText(ctx, `${spot.price}  /  Preview pricing`, 40, y + 203, w - 80, 20, 600);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    card.toBlob((result) => result ? resolve(result) : reject(new Error('Image export failed.')), 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `street-court-${ref.kind}-${(spot.brand?.name ?? 'your-spot').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
