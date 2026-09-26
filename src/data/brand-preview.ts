import type { ArenaState, Brand, SpotRef } from './types';
import { SEATS, seatKey } from '../world/layout';

/** Local campaign mock-up. Never changes server ownership or records a sale. */
export function previewBrand(source: ArenaState, ref: SpotRef, brand: Brand, seatCount = 1): ArenaState {
  const state: ArenaState = structuredClone(source);
  state.demo = true;
  state.brands[brand.id] = brand;
  state.totalSalesCents = null;
  if (ref.kind === 'seat') {
    const seats = SEATS.filter(s => s.section === ref.section).sort((a,b) => a.row-b.row || a.col-b.col);
    const start = seats.findIndex(s => s.row === ref.row && s.col === ref.col);
    const count = [1,4,12].includes(seatCount) ? seatCount : 1;
    // Keep the whole chosen block inside its section, including the final row.
    const block = seats.slice(Math.max(0,Math.min(start,seats.length-count)), Math.max(0,Math.min(start,seats.length-count))+count);
    const keys = new Set(block.map(s => seatKey(s.section,s.row,s.col)));
    state.seats = state.seats.filter(s => !keys.has(seatKey(s.section,s.row,s.col)));
    for (const s of block) state.seats.push({section:s.section,row:s.row,col:s.col,brandId:brand.id,card:brand.color});
  } else if (ref.kind === 'banner' || ref.kind === 'mural') {
    const list = ref.kind === 'banner' ? state.banners : state.murals;
    list[ref.index].brandId = brand.id;
  } else if (ref.kind === 'screen') state.screen.brandId = brand.id;
  else state.naming.brandId = brand.id;
  return state;
}
