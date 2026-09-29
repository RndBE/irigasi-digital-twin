import * as THREE from 'three';
import { clamp } from '../lib/format';
import { rnd } from '../lib/random';
import { C, S, T3, riverX, type CanalDims, type Layout3D, type P } from './context';
import { bld, ribbon } from './geometry';
import { occLine } from './occupancy';
import { car } from './props';
import { gY } from './terrain';

/** Jalan raya, jalan ke bendung, jembatan di atas sungai kecil, jembatan pelat dan timbunan oprit di persilangan saluran, dan mobil. */
function roadY(x: number, z: number) {
  let y = gY(x, z);
  for (const s of T3.cseg) {
    // the approach ramp reaches the ground 2.1 units past the embankment, inside the search box, so it ends smoothly
    // and roads running alongside a canal further out are not lifted
    const m = s.out + 2.2, [ax, az] = s.a, [bx, bz] = s.b, minx = Math.min(ax, bx) - m, maxx = Math.max(ax, bx) + m, minz = Math.min(az, bz) - m, maxz = Math.max(az, bz) + m;
    if (x < minx || x > maxx || z < minz || z > maxz) continue;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    y = Math.max(y, (s.T + 0.12) * (1 - Math.max(0, d - s.out) / 2.1));
  }
  return y;
}
function nearStream(x: number, z: number, r: number) { for (const pts of T3.streams) for (let k = 0; k < pts.length; k += 2) if (Math.abs(pts[k][0] - x) < r && Math.abs(pts[k][1] - z) < r && Math.hypot(pts[k][0] - x, pts[k][1] - z) < r) return pts[k]; return null; }
export function buildRoads() {
  const zw = T3.weirZ, cx = riverX(zw), W = T3.W, ZMIN = W.z0 - 150, ZMAX = W.z1 + 150, M = S.M;
  const lastZ = T3.systems[T3.systems.length - 1].z;
  const R1 = [[34, ZMIN], [34, -20], [33.4, 2], [33, 9.6], [33, 18], [30, 32], [27, 60], [26.5, 120], [27.2, 200], [26, 270], [26.6, 340], ...(lastZ + 25 > 345 ? [[26, lastZ + 25]] : []), [26.5, ZMAX]];
  // where local weir systems lie south of the Copong area the main road ends before them: it is not in the survey
  // data, and running on past them it made separate systems look joined along one line. Its full course still lays
  // out the villages, the road trees and the cars, so the rest of the scene stays where it was
  const R1_END = T3.systems.length > 1 ? T3.systems[1].z - 12 : Infinity;
  // from the service bridge straight down the platform ramp, then past the control-house forecourt
  const RE = [[cx + 6.4, zw + 3.8], [cx + 8.1, zw + 3.8], [cx + 9.8, zw + 3.7], [cx + 11.3, zw + 2.5], [cx + 12.8, zw + 1.45], [16, zw + 1.3], [22, zw + 2.0], [28, zw + 3.8], [31.6, zw + 5.8]];
  const RW = [[cx - 6.4, zw + 3.8], [cx - 9, zw + 3.7], [-13.5, zw + 3.6], [-17, zw + 7], [-19, zw + 20], [-20, 80], [-19, 160], [-21, 260], [-20, 360], [-21, ZMAX]];
  const RN = [[-13.5, zw + 3.4], [-16, zw - 4], [-19.5, zw - 20], [-24, -40], [-30, -90], [-34, ZMIN]];
  const smoothPath = (ctrl: number[][], stp = 0.6) => { const c = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), n = Math.ceil(c.getLength() / stp), out: P[] = []; for (let k = 0; k <= n; k++) { const p = c.getPoint(k / n); out.push([p.x, p.z]); } return out; };
  const bridges: number[][] = [], roadYs = new Map<P[], number[]>();
  // the deck sits on the highest ground across its width, so a road running across a slope does not sink into it
  // `zEnd`: the road is drawn (with its bridges) only up to there
  const road = (ctrl: number[][], width: number, mat: THREE.Material, stp?: number, zEnd = Infinity) => {
    const pts = smoothPath(ctrl, stp);
    const withY = pts.map(([x, z], k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * width / 2, nz = (b[0] - a[0]) / L * width / 2;
      return [x, z, Math.max(roadY(x, z), roadY(x + nx, z + nz), roadY(x - nx, z - nz)) + 0.03];
    });
    ribbon(withY.filter(p => p[1] <= zEnd), width, 0, mat, width * 1.1);
    roadYs.set(pts, withY.map(p => p[2]));
    occLine(pts, width / 2 + 0.7, 3);
    for (let k = 2; k < pts.length - 2; k += 1) { const [x, z] = pts[k], s = nearStream(x, z, 0.6); if (z <= zEnd && s && !bridges.some(bb => Math.hypot(bb[0] - x, bb[1] - z) < 3)) bridges.push([x, z, Math.atan2(pts[k + 1][0] - pts[k - 1][0], pts[k + 1][1] - pts[k - 1][1]), width]); }
    return pts;
  };
  const r1 = road(R1, 1.3, M.asphalt, undefined, R1_END), re = road(RE, 1.1, M.asphalt, 0.3), rw = road(RW, 1.1, M.asphalt); road(RN, 1.0, M.asphalt);
  bridges.forEach(([x, z, a, w]) => { const b = bld(x, 0, z, a); b.box(M.concrete, w + 0.3, 0.16, 2.6, 0, 0.1, 0); for (const s of [-1, 1]) b.box(M.paint, 0.08, 0.2, 2.6, s * (w / 2 + 0.12), 0.28, 0); });
  // canal crossings: a short slab bridge over the lined channel, and approach fills (oprit) that carry the road up
  // the canal embankment, so the raised road no longer floats over open ground
  const spans: Span[] = [];
  ([[r1, 1.3], [re, 1.1], [rw, 1.1]] as [P[], number][]).forEach(([pts, w]) => T3.cseg.forEach(s => {
    if (Math.abs(s.a[1] - s.b[1]) > 0.01) return;
    const z0 = s.a[1], x0 = Math.min(s.a[0], s.b[0]), x1 = Math.max(s.a[0], s.b[0]);
    let k = -1, bd = 0.4;
    pts.forEach(([x, z], i) => { const d = Math.abs(z - z0); if (x >= x0 && x <= x1 && d < bd) { bd = d; k = i; } });
    if (k < 1 || k > pts.length - 2 || (pts === r1 && z0 > R1_END) || spans.some(p => Math.hypot(p.x - pts[k][0], p.z - z0) < 1)) return;
    spans.push({ pts, k, x: pts[k][0], z: z0, a: Math.atan2(pts[k + 1][0] - pts[k - 1][0], pts[k + 1][1] - pts[k - 1][1]), w, s });
  }));
  spans.forEach(sp => {
    const { x, z, a, w, s } = sp, D = s.D, b = bld(x, 0, z, a), top = D.T + 0.14, L = D.hw + Math.min(0.25, D.b), P = w / 2 + 0.17, Lp = D.hw + D.b;
    b.box(M.concrete, w + 0.52, 0.17, 2 * L, 0, top - 0.085, 0);
    for (const e of [-1, 1]) {
      b.box(M.concreteDark, 0.16, 0.1, 2 * L, e * (w / 2 + 0.1), top - 0.22, 0);
      b.box(M.paint, 0.1, 0.24, 2 * Lp, e * P, top + 0.12, 0);
      b.box(M.concrete, 0.14, 0.04, 2 * Lp, e * P, top + 0.26, 0);
      for (const f of [-1, 1]) b.box(M.concrete, 0.18, 0.4, 0.18, e * P, top + 0.2, f * (Lp - 0.09));
    }
    approachFill(sp, roadYs.get(sp.pts)!);
  });
  T3.roads = { r1, rw, re };
  // cars on the main road, kept off the bridges and their approach ramps; the index is shifted along the road
  // instead of drawn again, so the random sequence stays the same for the scene built after the roads
  const busy = (x: number, z: number) => spans.some(p => Math.hypot(p.x - x, p.z - z) < p.s.out + 4.2) || bridges.some(bb => Math.hypot(bb[0] - x, bb[1] - z) < 2.5);
  const ys1 = roadYs.get(r1)!;
  for (let k = 0; k < 9; k++) {
    let i = Math.floor(30 + rnd() * (r1.length - 60)); const side = rnd() < 0.5 ? -1 : 1;
    while (i < r1.length - 31 && busy(r1[i][0], r1[i][1])) i++;
    const [x, z] = r1[i], [x2, z2] = r1[i + 1], a = Math.atan2(x2 - x, z2 - z);
    if (z > R1_END) continue;
    car(x + Math.cos(a) * 0.3 * side, z - Math.sin(a) * 0.3 * side, a + Math.PI / 2 + (side < 0 ? Math.PI : 0), k + 2, ys1[i]);
  }
}

interface Span { pts: P[]; k: number; x: number; z: number; a: number; w: number; s: Layout3D['cseg'][number] }
/** Height of the canal embankment at signed distance `sd` from the canal axis (inspection road on the -z bank). */
function embY(D: CanalDims, sd: number) {
  const top = D.hw + D.b + (sd < 0 ? D.road : 0), d = Math.abs(sd);
  return d <= top ? D.T : d < top + D.s ? D.T * (1 - (d - top) / D.s) : 0;
}
// earth fill under the raised road on both sides of a crossing: gravel shoulder along the asphalt, grassed side slopes
// down to the embankment or the ground, from the bank top out to where the road meets the ground again
function approachFill(sp: Span, ys: number[]) {
  const { pts, k: kc, w, s } = sp, D = s.D, hw = w / 2 + 0.14, green = C(0x6d8a45), grit = C(0xb0a68a);
  for (const dir of [-1, 1]) {
    const secs: number[][][] = [];
    for (let k = kc; k >= 1 && k < pts.length - 1; k += dir) {
      const [x, z] = pts[k], sd = z - sp.z;
      if (Math.abs(sd) < D.hw + D.b - 0.02) continue;
      const a = pts[k - 1], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
      const yt = ys[k] - 0.012, base = (px: number, pz: number) => Math.max(gY(px, pz), embY(D, pz - sp.z)) - 0.03;
      // stop where the road is back on the ground (its ribbon rides 0,03 above the terrain everywhere else)
      const lift = ys[k] - 0.03 - Math.max(gY(x, z), embY(D, sd)); if (lift < 0.01 && secs.length > 2) break;
      const h = yt - base(x, z);
      const run = hw + Math.max(0, h) * 1.4 + 0.06, sec: number[][] = [];
      for (const [o, onTop] of [[-run, false], [-hw, true], [-w / 2, true], [w / 2, true], [hw, true], [run, false]] as [number, boolean][]) {
        const px = x + nx * o, pz = z + nz * o;
        sec.push([px, onTop ? yt : Math.min(yt, base(px, pz)), pz]);
      }
      secs.push(sec);
    }
    if (secs.length < 2) continue;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    secs.forEach(sec => sec.forEach((p, j) => { pos.push(p[0], p[1], p[2]); const c = j === 2 || j === 3 ? grit : green; col.push(c.r, c.g, c.b); }));
    const v = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), at = (i: number) => v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).clone();
    for (let i = 0; i < secs.length - 1; i++) for (let j = 0; j < 5; j++) {
      const a0 = i * 6 + j, a1 = a0 + 1, b0 = a0 + 6, b1 = b0 + 1, p0 = at(a0);
      // wind each quad so it faces up (slopes and shoulder are all seen from above)
      const up = e1.subVectors(at(b0), p0).cross(e2.subVectors(at(a1), p0)).y >= 0;
      if (up) idx.push(a0, b0, a1, a1, b0, b1); else idx.push(a0, a1, b0, a1, b1, b0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((_, i) => i % 3 === 1 ? [] : [pos[i] / 1.5]), 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, S.M.embank); m.receiveShadow = true; S.scene.add(m);
  }
}
