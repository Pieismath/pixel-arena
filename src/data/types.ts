export interface Brand {
  id: string;
  name: string;
  tagline: string;
  url: string;
  /** Background color used on banners, cards, murals and the big screen. */
  color: string;
  /** Text color drawn on top of `color`. */
  accent: string;
}

/** Who holds a spot that can be taken over, and what it last sold for. */
export interface Holding {
  brandId: string | null;
  valueCents: number;
  takeovers: number;
}

export interface SeatSale {
  section: number;
  row: number;
  col: number;
  brandId: string;
  /** Color of the card this fan holds up; blocks of cards spell out logos. */
  card: string;
}

export interface ArenaState {
  demo: boolean;
  brands: Record<string, Brand>;
  /** Whoever holds this names the court. */
  naming: Holding;
  /** The big screen on the building, rented by the day. */
  screen: { brandId: string | null; dayPriceCents: number };
  banners: Holding[];
  murals: Holding[];
  seats: SeatSale[];
  /** Null until real sales exist; the UI never shows a made-up number. */
  totalSalesCents: number | null;
}

export type SpotRef =
  | { kind: 'naming' }
  | { kind: 'screen' }
  | { kind: 'banner'; index: number }
  | { kind: 'mural'; index: number }
  | { kind: 'seat'; section: number; row: number; col: number };
