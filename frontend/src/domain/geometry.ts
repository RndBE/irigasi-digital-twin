import { clamp } from '../lib/format';
import type { Line, Pt } from './types';

/** Titik sejauh `d` di sepanjang garis: [x, z, arah x, arah z]. */
export function pointAlong(line: Line, d: number): [number, number, number, number] {
  let acc = 0;
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1], L = Math.hypot(bx - ax, bz - az);
    if (acc + L >= d && L > 0) { const t = (d - acc) / L; return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / L, (bz - az) / L]; }
    acc += L;
  }
  const n = line.length, [ax, az] = line[Math.max(0, n - 2)], [bx, bz] = line[n - 1], L = Math.hypot(bx - ax, bz - az) || 1;
  return [bx, bz, (bx - ax) / L, (bz - az) / L];
}
export const lineLen = (l: Line) => l.reduce((a, p, k) => k ? a + Math.hypot(p[0] - l[k - 1][0], p[1] - l[k - 1][1]) : 0, 0);
/** Geser titik hasil `pointAlong` ke samping garis sejauh `off`. */
export const offsetPt = (p: [number, number, number, number], off: number): Pt => [p[0] - p[3] * off, p[1] + p[2] * off];

/** Jarak sepanjang garis ke titik terdekat dengan `pt`. */
export function distAlongTo(line: Line, pt: Pt) {
  let acc = 0, best = 1e9, bd = 0;
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const t = L ? clamp(((pt[0] - ax) * dx + (pt[1] - az) * dz) / (L * L), 0, 1) : 0;
    const d = Math.hypot(pt[0] - ax - t * dx, pt[1] - az - t * dz);
    if (d < best) { best = d; bd = acc + t * L; }
    acc += L;
  }
  return bd;
}
/** Potong garis pada jarak `dmax`. */
export function cutLine(line: Line, dmax: number): Line {
  const out: Line = [line[0]]; let acc = 0;
  for (let k = 1; k < line.length; k++) {
    const L = Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]);
    if (acc + L >= dmax) { const t = L ? (dmax - acc) / L : 0; out.push([line[k - 1][0] + (line[k][0] - line[k - 1][0]) * t, line[k - 1][1] + (line[k][1] - line[k - 1][1]) * t]); return out; }
    acc += L; out.push(line[k]);
  }
  return out;
}
