import { T3 } from './context';
import type { P } from './context';

/** Grid penanda lahan terpakai, supaya rumah dan pohon tidak menimpa saluran, jalan, atau bangunan. */
const OG = { res: 0.5, x0: 0, z0: 0, nx: 0, nz: 0, a: new Uint8Array(0) };
/** Bit 1: tertutup rumah; bit 2: tertutup pohon. */
export const HB = 1, TB = 2;
export function ogInit() {
  OG.x0 = T3.W.x0 - 170; OG.z0 = T3.W.z0 - 170;
  OG.nx = Math.ceil((T3.W.x1 + 170 - OG.x0) / OG.res); OG.nz = Math.ceil((T3.W.z1 + 170 - OG.z0) / OG.res);
  OG.a = new Uint8Array(OG.nx * OG.nz);
}
export function occRect(x0: number, z0: number, x1: number, z1: number, m = 3) {
  const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - OG.x0) / OG.res)), i1 = Math.min(OG.nx - 1, Math.floor((Math.max(x0, x1) - OG.x0) / OG.res));
  const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - OG.z0) / OG.res)), j1 = Math.min(OG.nz - 1, Math.floor((Math.max(z0, z1) - OG.z0) / OG.res));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) OG.a[j * OG.nx + i] |= m;
}
export function occLine(pts: P[], r: number, m = 3) {
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4));
    for (let s = 0; s <= n; s++) { const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n; occRect(x - r, z - r, x + r, z + r, m); }
  }
}
export function isFree(x: number, z: number, pad = 0, m = 3) {
  const i0 = Math.floor((x - pad - OG.x0) / OG.res), i1 = Math.floor((x + pad - OG.x0) / OG.res), j0 = Math.floor((z - pad - OG.z0) / OG.res), j1 = Math.floor((z + pad - OG.z0) / OG.res);
  if (i0 < 0 || j0 < 0 || i1 >= OG.nx || j1 >= OG.nz) return false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (OG.a[j * OG.nx + i] & m) return false;
  return true;
}
