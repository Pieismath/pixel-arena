import { BANNER_COUNT, MURAL_COUNT, PRICES, takeoverPrice } from '../config';
import { SECTIONS } from '../world/layout';
import { textBitmap } from './pixelFont';
import { mulberry32 } from './random';
import type { ArenaState, Brand, Holding, SeatSale } from './types';

// Every demo brand is made up. Links point at example.com so nothing real gets promoted.
// `stunt` places a card stunt of the brand's initials: [section, first row, first column].
const DEMO_BRANDS: Array<Omit<Brand, 'id' | 'url'> & { stunt?: [number, number, number] }> = [
  { name: 'Quokka Cloud', tagline: 'Hosting that smiles back.', color: '#ffd23f', accent: '#2b1d0e', stunt: [0, 3, 2] },
  { name: 'Neon Noodle', tagline: 'Ramen delivered at 2am.', color: '#ff3ea5', accent: '#fff0f7', stunt: [0, 2, 34] },
  { name: 'Otter Deploy', tagline: 'Ship on Friday. Nap on Saturday.', color: '#37e0ff', accent: '#062a33', stunt: [1, 0, 3] },
  { name: 'Turbo Tofu', tagline: 'Plant protein, zero to sixty.', color: '#8ee000', accent: '#10230a', stunt: [0, 1, 13] },
  { name: 'Llama Ledger', tagline: 'Bookkeeping for tiny teams.', color: '#b983ff', accent: '#1b0b33', stunt: [0, 4, 24] },
  { name: 'Cactus CRM', tagline: 'A CRM with no prickly parts.', color: '#3ddc84', accent: '#06240f', stunt: [1, 1, 17] },
  { name: 'Blimp Analytics', tagline: 'See everything from up here.', color: '#ff5c5c', accent: '#2e0808', stunt: [1, 0, 31] },
  { name: 'Yeti Invoices', tagline: 'Get paid abominably fast.', color: '#e8f1ff', accent: '#1a2a4a' },
  { name: 'Snackstack', tagline: 'Office snacks on autopilot.', color: '#ffa94d', accent: '#2e1600' },
  { name: 'Glitch Garden', tagline: 'Pixel plants that never die.', color: '#7cffcb', accent: '#073325' },
  { name: 'Walrus Wallet', tagline: 'Budgeting without the tusks.', color: '#5c7cff', accent: '#e8edff' },
  { name: 'Hyperbagel', tagline: 'Bagels at the speed of light.', color: '#f4c27a', accent: '#3a2208' },
  { name: 'Sprocket & Fig', tagline: 'Bikes and brunch.', color: '#c2410c', accent: '#fff1e6' },
  { name: 'Mothership Mail', tagline: 'Email that actually lands.', color: '#4ade80', accent: '#052e16' },
  { name: 'Pickle Ops', tagline: 'On-call, but briny.', color: '#65a30d', accent: '#f7fee7' },
  { name: 'Moonlit Maps', tagline: 'Night routes, lit up.', color: '#1e3a8a', accent: '#fde68a' },
  { name: 'Banjo Bots', tagline: 'Support agents that twang.', color: '#f97316', accent: '#1c0a00' },
  { name: 'Velvet Queue', tagline: 'Waitlists that feel VIP.', color: '#9d174d', accent: '#fdf2f8' },
  { name: 'Parrot Docs', tagline: 'Docs that repeat themselves.', color: '#22c55e', accent: '#fefce8' },
  { name: 'Igloo Payroll', tagline: 'Cool, calm payroll.', color: '#bae6fd', accent: '#0c4a6e' },
];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /[a-z]/i.test(w[0] ?? ''))
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

function valueAfter(baseCents: number, takeovers: number): number {
  let v = baseCents;
  for (let i = 0; i < takeovers; i++) v = takeoverPrice(v);
  return v;
}

const open = (valueCents: number): Holding => ({ brandId: null, valueCents, takeovers: 0 });

export function emptyArena(): ArenaState {
  return {
    demo: false,
    brands: {},
    naming: open(PRICES.namingBaseCents),
    screen: { brandId: null, dayPriceCents: PRICES.screenDayCents },
    banners: Array.from({ length: BANNER_COUNT }, () => open(PRICES.bannerBaseCents)),
    murals: Array.from({ length: MURAL_COUNT }, () => open(PRICES.muralBaseCents)),
    seats: [],
    totalSalesCents: null,
  };
}

/** A full-looking court for previews and teaser videos. Clearly labelled as demo data in the UI. */
export function demoArena(): ArenaState {
  const rnd = mulberry32(2026);
  const state = emptyArena();
  state.demo = true;

  const brands = DEMO_BRANDS.map((b) => {
    const id = slug(b.name);
    const brand: Brand = { id, name: b.name, tagline: b.tagline, url: `https://example.com/${id}`, color: b.color, accent: b.accent };
    state.brands[id] = brand;
    return { brand, stunt: b.stunt };
  });
  const pick = () => brands[Math.floor(rnd() * brands.length)].brand;

  state.naming = { brandId: brands[0].brand.id, takeovers: 11, valueCents: valueAfter(PRICES.namingBaseCents, 11) };
  state.screen.brandId = brands[1].brand.id;

  state.banners = state.banners.map((h) => {
    if (rnd() > 0.7) return h;
    const takeovers = Math.floor(rnd() * 6);
    return { brandId: pick().id, takeovers, valueCents: valueAfter(PRICES.bannerBaseCents, takeovers) };
  });
  const muralBrands = ['otter-deploy', 'glitch-garden', null, 'hyperbagel', null];
  state.murals = state.murals.map((h, i) => {
    const id = muralBrands[i];
    if (!id) return h;
    const takeovers = 1 + Math.floor(rnd() * 3);
    return { brandId: id, takeovers, valueCents: valueAfter(PRICES.muralBaseCents, takeovers) };
  });

  const taken = new Set<string>();
  const seats: SeatSale[] = [];
  const add = (sale: SeatSale) => {
    const sec = SECTIONS[sale.section];
    const key = `${sale.section}-${sale.row}-${sale.col}`;
    if (!sec || taken.has(key) || sale.row < 0 || sale.row >= sec.rows || sale.col < 0 || sale.col >= sec.cols) return;
    taken.add(key);
    seats.push(sale);
  };

  // Card stunts: blocks of seats whose cards spell a brand's initials.
  for (const { brand, stunt } of brands) {
    if (!stunt) continue;
    const [section, row0, col0] = stunt;
    const bitmap = textBitmap(initials(brand.name));
    bitmap.forEach((line, y) =>
      line.forEach((ink, x) =>
        add({ section, row: row0 + (bitmap.length - 1 - y), col: col0 + x, brandId: brand.id, card: ink ? brand.accent : brand.color }),
      ),
    );
  }

  // Scattered single seats.
  for (let i = 0; i < 140; i++) {
    const section = Math.floor(rnd() * SECTIONS.length);
    const brand = pick();
    add({
      section,
      row: Math.floor(rnd() * SECTIONS[section].rows),
      col: Math.floor(rnd() * SECTIONS[section].cols),
      brandId: brand.id,
      card: brand.color,
    });
  }

  state.seats = seats;
  return state;
}
