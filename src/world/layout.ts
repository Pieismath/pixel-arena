import * as THREE from 'three';
import L from './park-layout.json';

export const LAYOUT = L;

export const SECTIONS = L.bleachers.map((b) => ({ name: b.name, rows: b.rows, cols: b.seats, side: b.side }));

export interface SeatInfo {
  section: number;
  row: number;
  col: number;
  /** Top of the seat plank, where a seated fan touches down. */
  pos: THREE.Vector3;
  /** Y rotation that turns a fan toward the court. */
  yaw: number;
  /** Angle around the court center, used to run the crowd wave. */
  theta: number;
}

export const seatKey = (section: number, row: number, col: number) => `${section}-${row}-${col}`;

export const SEATS: SeatInfo[] = [];
export const SEAT_INDEX = new Map<string, number>();

{
  const s = L.bleacherShape;
  SECTIONS.forEach((sec, section) => {
    for (let row = 0; row < sec.rows; row++) {
      for (let col = 0; col < sec.cols; col++) {
        // Columns run left to right as seen from the court, so card-stunt letters read correctly.
        const along = (col - (sec.cols - 1) / 2) * s.seatSpacing;
        const x = sec.side === -1 ? along : -along;
        const y = s.firstHeight + row * s.rowRise + 0.08;
        const z = sec.side * (s.front + row * s.rowDepth);
        const pos = new THREE.Vector3(x, y, z);
        SEAT_INDEX.set(seatKey(section, row, col), SEATS.length);
        SEATS.push({ section, row, col, pos, yaw: sec.side === -1 ? 0 : Math.PI, theta: Math.atan2(z, x) });
      }
    }
  });
}

type Facing = '+x' | '-x' | '+z' | '-z';

export interface PanelSlot {
  center: THREE.Vector3;
  width: number;
  height: number;
  facing: Facing;
  /** Unit vector pointing out of the panel, toward whoever reads it. */
  normal: THREE.Vector3;
  /** Y rotation for a box aligned with the panel. */
  yaw: number;
}

function panel(center: THREE.Vector3, width: number, height: number, facing: Facing): PanelSlot {
  const normal = {
    '+z': new THREE.Vector3(0, 0, 1),
    '-z': new THREE.Vector3(0, 0, -1),
    '+x': new THREE.Vector3(1, 0, 0),
    '-x': new THREE.Vector3(-1, 0, 0),
  }[facing];
  return { center, width, height, facing, normal, yaw: facing === '+z' || facing === '-z' ? 0 : Math.PI / 2 };
}

/** Banner order matches blender/build_park.py: north barrier, south barrier, east fence, west fence. */
export const BANNER_SLOTS: PanelSlot[] = (() => {
  const out: PanelSlot[] = [];
  const bar = L.barrier;
  const sb = L.sidelineBanners;
  const gap = 0.4;
  const span = sb.perSide * sb.length + (sb.perSide - 1) * gap;
  for (const side of [-1, 1]) {
    for (let i = 0; i < sb.perSide; i++) {
      let x = -span / 2 + sb.length / 2 + i * (sb.length + gap);
      if (side === 1) x = -x;
      const z = side * bar.z - side * 0.46;
      out.push(panel(new THREE.Vector3(x, sb.y + sb.height / 2, z), sb.length, sb.height, side === -1 ? '+z' : '-z'));
    }
  }
  const eb = L.endBanners;
  const endSpan = eb.perEnd * eb.length + (eb.perEnd - 1) * eb.gap;
  for (const sx of [1, -1]) {
    for (let i = 0; i < eb.perEnd; i++) {
      const z = -endSpan / 2 + eb.length / 2 + i * (eb.length + eb.gap);
      out.push(panel(new THREE.Vector3(sx * eb.x - sx * 0.25, eb.y + eb.height / 2, z), eb.length, eb.height, sx === 1 ? '-x' : '+x'));
    }
  }
  return out;
})();

export function bannerSideName(index: number): string {
  const per = L.sidelineBanners.perSide;
  if (index < per) return 'NORTH SIDELINE';
  if (index < per * 2) return 'SOUTH SIDELINE';
  if (index < per * 2 + L.endBanners.perEnd) return 'EAST FENCE';
  return 'WEST FENCE';
}

export const MURAL_SLOTS: PanelSlot[] = L.murals.map((m) =>
  panel(new THREE.Vector3(m.x + (m.facing === '+x' ? 0.25 : -0.25), m.y + m.height / 2, m.z), m.width, m.height, m.facing as Facing),
);

export function muralWallName(index: number): string {
  return L.murals[index].facing === '+x' ? 'HANDBALL WALL' : 'CORNER STORE WALL';
}

export const SCREEN_SLOT = panel(new THREE.Vector3(L.screen.x, L.screen.y, L.screen.z + 0.75), L.screen.width, L.screen.height, '+z');
export const NAMING_SLOT = panel(new THREE.Vector3(L.namingSign.x, L.namingSign.y, L.namingSign.z + 0.55), L.namingSign.width, L.namingSign.height, '+z');
