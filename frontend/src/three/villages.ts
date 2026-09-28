import * as THREE from 'three';
import { jitter, rnd } from '../lib/random';
import { C, S, T3 } from './context';
import { bld, inst } from './geometry';
import { drawTex } from './textures';
import { HB, isFree, occRect } from './occupancy';
import { gY } from './terrain';

/** Kampung di sepanjang jalan (rumah, masjid, kolam ikan) dan kebun/ladang di dataran yang tidak diairi jaringan. */
const WALLS = [0xf3efe6, 0xefe6d2, 0xe4ede1, 0xe9e2ef, 0xf1dccf, 0xdde8ee, 0xf6f1c9];
const ROOFS = [0xa4532f, 0xa4532f, 0x8e4428, 0xb86b45, 0x7d8286, 0x5a6570];
interface House { x: number; z: number; ry: number; w: number; d: number; h: number; rh: number; wall: number; roof: number; hip: boolean }
export function buildVillages() {
  const M = S.M, houses: House[] = [], clusters: { x: number; z: number; n: number; a: number }[] = [];
  const tryHouse = (x: number, z: number, ry: number, w: number, d: number, extra?: Partial<House>) => {
    const r = Math.max(w, d) / 2 + 0.3; if (!isFree(x, z, r, HB)) return false;
    const y = gY(x, z); if (y > 0.25 || y < -0.05) return false;
    houses.push({ x, z, ry, w, d, h: 0.72 + rnd() * 0.26, rh: 0.42 + rnd() * 0.2, wall: WALLS[Math.floor(rnd() * WALLS.length)], roof: ROOFS[Math.floor(rnd() * ROOFS.length)], hip: rnd() < 0.3, ...extra });
    occRect(x - r, z - r, x + r, z + r, 3); return true;
  };
  const cluster = (cx: number, cz: number, dirA: number, n: number, spread: number) => {
    let placed = 0; const ca = Math.cos(dirA), sa = Math.sin(dirA);
    for (let t = 0; t < n * 6 && placed < n; t++) {
      const a = jitter(spread), b = jitter(spread * 0.65), x = cx + ca * a - sa * b, z = cz + sa * a + ca * b;
      if (tryHouse(x, z, -dirA + (rnd() < 0.25 ? Math.PI / 2 : 0) + jitter(0.06), 1.2 + rnd() * 0.8, 0.95 + rnd() * 0.5)) placed++;
    }
    if (placed > 2) clusters.push({ x: cx, z: cz, n: placed, a: dirA });
  };
  if (S.postHouse) tryHouse(S.postHouse.x, S.postHouse.z, 0, 1.6, 1.2, { wall: 0xf0ece2, roof: 0xa4532f, hip: false });
  const alongRoad = (pts: number[][], step: number, off: number) => {
    for (let k = 12; k < pts.length - 12; k += step) {
      const [x, z] = pts[k], [x2, z2] = pts[k + 1], a = Math.atan2(z2 - z, x2 - x), nx = -Math.sin(a), nz = Math.cos(a);
      for (const s of [-1, 1]) if (rnd() < 0.62) { const o = off + rnd() * 2.5; cluster(x + nx * o * s, z + nz * o * s, a, 7 + Math.floor(rnd() * 9), 4.5); }
    }
  };
  alongRoad(T3.roads.r1, 22, 2.6); alongRoad(T3.roads.rw, 24, 2.4);
  for (let t = 0, made = 0; t < 900 && made < 30; t++) {
    const x = T3.W.x0 + 6 + rnd() * (T3.W.x1 - T3.W.x0 - 12), z = T3.W.z0 + 36 + rnd() * (T3.W.z1 - T3.W.z0 - 40);
    if (!isFree(x, z, 3.5, HB)) continue;
    cluster(x, z, rnd() * Math.PI, 7 + Math.floor(rnd() * 9), 3.8); made++;
  }
  // mosques
  clusters.filter(c => c.n >= 9).slice(0, 6).forEach((c, k) => {
    if (k % 2) return;
    for (let t = 0; t < 30; t++) {
      const x = c.x + jitter(5), z = c.z + jitter(5); if (!isFree(x, z, 1.8, HB) || Math.abs(gY(x, z)) > 0.2) continue;
      const b = bld(x, 0, z, -c.a);
      b.box(M.paint, 2.2, 1.0, 2.2, 0, 0.5, 0); b.box(M.concrete, 2.5, 0.1, 2.5, 0, 0.05, 0);
      b.geo(M.greenRoof, S.G.pyr, 0, 1.0, 0, 3.1, 0.62, 3.1); b.box(M.paint, 1.1, 0.25, 1.1, 0, 1.62, 0); b.geo(M.greenRoof, S.G.pyr, 0, 1.74, 0, 1.6, 0.5, 1.6);
      b.cyl(M.yellow, 0.02, 0.06, 0.28, 8, 0, 2.36, 0);
      b.cyl(M.paint, 0.16, 0.2, 2.8, 10, 1.55, 1.4, 1.1); b.cyl(M.greenRoof, 0.0, 0.2, 0.4, 10, 1.55, 3.0, 1.1);
      for (const s of [-1, 1]) b.box(M.glass, 0.01, 0.45, 1.2, s * 1.105, 0.55, 0);
      occRect(x - 2.2, z - 2.2, x + 2.2, z + 2.2, 3); break;
    }
  });
  // fish ponds beside the houses
  clusters.forEach(c => {
    const n = Math.floor(rnd() * 3.2);
    for (let k = 0, t = 0; k < n && t < 20; t++) {
      const x = c.x + jitter(7), z = c.z + jitter(7), w = 1.6 + rnd() * 0.8, d = 1.1 + rnd() * 0.5;
      if (!isFree(x, z, Math.max(w, d) / 2 + 0.2, 3) || Math.abs(gY(x, z)) > 0.1) continue;
      const b = bld(x, 0, z, -c.a); b.box(M.pond, w, 0.02, d, 0, 0.02, 0);
      for (const s of [-1, 1]) { b.box(M.bund, w + 0.16, 0.1, 0.08, 0, 0.05, s * (d / 2 + 0.04)); b.box(M.bund, 0.08, 0.1, d + 0.16, s * (w / 2 + 0.04), 0.05, 0); }
      occRect(x - w / 2 - 0.2, z - d / 2 - 0.2, x + w / 2 + 0.2, z + d / 2 + 0.2, 3); k++;
    }
  });
  const wc = new THREE.Color();
  inst(S.G.houseBody, M.wall, houses.map(h => ({ x: h.x, y: 0, z: h.z, ry: h.ry, sx: h.w, sy: h.h, sz: h.d })), (_t, k) => wc.set(houses[k].wall).convertSRGBToLinear().clone(), true);
  const gab = houses.filter(h => !h.hip), hip = houses.filter(h => h.hip);
  inst(S.G.gable, M.roofInst, gab.map(h => ({ x: h.x, y: h.h, z: h.z, ry: h.ry, sx: h.w, sy: h.rh, sz: h.d })), (_t, k) => new THREE.Color(gab[k].roof).convertSRGBToLinear(), true);
  inst(S.G.hip, M.roofInst, hip.map(h => ({ x: h.x, y: h.h, z: h.z, ry: h.ry, sx: h.w, sy: h.rh, sz: h.d })), (_t, k) => new THREE.Color(hip[k].roof).convertSRGBToLinear(), true);
  S.villages = clusters;
}
export function buildFields() {
  const W = T3.W, list: { x: number; y: number; z: number; ry: number; sx: number; sy: number; sz: number; c: number }[] = [], cols = [0x7c8a4e, 0x8b8f58, 0x8a7a58, 0x6f8248, 0x9a9660, 0x7d7050, 0x74874c];
  S.tex.crop = drawTex(128, 128, g => { g.fillStyle = '#8f8b80'; g.fillRect(0, 0, 128, 128); for (let y = 0; y < 128; y += 8) { g.fillStyle = 'rgba(60,50,30,.45)'; g.fillRect(0, y, 128, 2); for (let x = 0; x < 128; x += 4) { const l = 170 + rnd() * 70; g.fillStyle = `rgb(${l},${l},${l - 20})`; g.fillRect(x + jitter(1), y + 3 + jitter(1), 3, 3); } } });
  for (let t = 0; t < 1400 && list.length < 650; t++) {
    const x0 = W.x0 + rnd() * (W.x1 - W.x0), z0 = W.z0 + 30 + rnd() * (W.z1 - W.z0 - 30), a = rnd() < 0.75 ? 0 : Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    if (!isFree(x0, z0, 2.5, 3)) continue;
    const w = 2.2 + rnd() * 1.6, d = 1.5 + rnd() * 1.2, nx = 1 + Math.floor(rnd() * 3), nz = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx = (i - (nx - 1) / 2) * (w + 0.12), lz = (j - (nz - 1) / 2) * (d + 0.12), x = x0 + lx * ca + lz * sa, z = z0 - lx * sa + lz * ca;
      const hx = (Math.abs(ca) * w + Math.abs(sa) * d) / 2, hz = (Math.abs(sa) * w + Math.abs(ca) * d) / 2;
      if (!isFree(x, z, Math.max(hx, hz) + 0.15, 3) || Math.abs(gY(x, z)) > 0.05) continue;
      list.push({ x, y: 0, z, ry: a + jitter(0.03), sx: w, sy: 1, sz: d, c: cols[Math.floor(rnd() * cols.length)] });
      occRect(x - hx - 0.05, z - hz - 0.05, x + hx + 0.05, z + hz + 0.05, 3);
    }
  }
  const g = new THREE.BoxGeometry(1, 0.03, 1); g.translate(0, 0.015, 0);
  inst(g, new THREE.MeshStandardMaterial({ color: 0xffffff, map: S.tex.crop, roughness: 0.95 }), list, t => C(t.c), false);
}
