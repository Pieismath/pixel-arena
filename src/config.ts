import L from './world/park-layout.json';

// World units are feet. Layout numbers are shared with the Blender build scripts.
export const COURT = L.court;
export const FLOOR = L.floor;
export const RIM = L.rim;
export const THREE_POINT = { radius: 23.75, cornerZ: 22 } as const;

export const BANNER_COUNT = L.sidelineBanners.perSide * 2 + L.endBanners.perEnd * 2;
export const MURAL_COUNT = L.murals.length;
export const SEAT_COUNT = L.bleachers.reduce((n, b) => n + b.rows * b.seats, 0);

// Placeholder prices, to tune before launch.
export const PRICES = {
  seatCents: 500,
  bannerBaseCents: 2500,
  muralBaseCents: 5000,
  namingBaseCents: 10000,
  screenDayCents: 2900,
  takeoverMultiplier: 1.25,
} as const;

export const TEAMS = [
  { name: 'SUNSETS', jersey: '#ff7a1a', trim: '#fff4e0', shorts: '#f06a12', shoe: '#1c1f2b', sock: '#fff4e0' },
  { name: 'TIDES', jersey: '#17a79b', trim: '#0d1b2a', shorts: '#12958a', shoe: '#f5f2ea', sock: '#0d1b2a' },
] as const;

/** Price to take a spot from its current holder, rounded up to whole dollars. */
export function takeoverPrice(valueCents: number): number {
  return Math.ceil((valueCents * PRICES.takeoverMultiplier) / 100) * 100;
}

export function usd(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}
