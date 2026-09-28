import * as THREE from 'three';
import { S, type P } from './context';

/**
 * Pembantu geometri: penggabungan mesh statis per bahan, penyusun bangunan (`bld`), sapuan profil untuk saluran,
 * sungai, dan jalan, serta instancing untuk pohon dan rumah.
 */
export const M4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export interface GeoPart { g: THREE.BufferGeometry; m?: THREE.Matrix4 | null }
export function mergeGeos(parts: GeoPart[], worldUV = 0) {
  let n = 0; const Pp: ArrayLike<number>[] = [], Nn: ArrayLike<number>[] = [], UV: ArrayLike<number>[] = [];
  parts.forEach(({ g, m }) => {
    const gg = g.index ? g.toNonIndexed() : g.clone(); if (m) gg.applyMatrix4(m);
    const cnt = gg.attributes.position.count;
    Pp.push(gg.attributes.position.array); Nn.push(gg.attributes.normal.array);
    let uv: ArrayLike<number> = gg.attributes.uv ? gg.attributes.uv.array : new Float32Array(cnt * 2);
    if (worldUV) {
      const w = new Float32Array(cnt * 2), p = gg.attributes.position.array, nr = gg.attributes.normal.array;
      for (let i = 0; i < cnt; i++) {
        const ax = Math.abs(nr[i * 3]), ay = Math.abs(nr[i * 3 + 1]), az = Math.abs(nr[i * 3 + 2]), x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        if (ay >= ax && ay >= az) { w[i * 2] = x / worldUV; w[i * 2 + 1] = z / worldUV; } else if (ax >= az) { w[i * 2] = z / worldUV; w[i * 2 + 1] = y / worldUV; } else { w[i * 2] = x / worldUV; w[i * 2 + 1] = y / worldUV; }
      }
      uv = w;
    }
    UV.push(uv); n += cnt;
  });
  const cat = (arrs: ArrayLike<number>[], k: number) => { const out = new Float32Array(n * k); let o = 0; arrs.forEach(a => { out.set(a, o); o += a.length; }); return out; };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cat(Pp, 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(cat(Nn, 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(cat(UV, 2), 2));
  return geo;
}

/* ---------- static batches: one merged mesh per material ---------- */
const BATCH = new Map<THREE.Material, GeoPart[]>();
export function addStatic(mat: THREE.Material, g: THREE.BufferGeometry, m: THREE.Matrix4 | null) { if (!BATCH.has(mat)) BATCH.set(mat, []); BATCH.get(mat)!.push({ g, m }); }
export function flushStatic() {
  BATCH.forEach((parts, mat) => {
    const mesh = new THREE.Mesh(mergeGeos(parts, mat.userData.worldUV || 0), mat);
    mesh.castShadow = !mat.userData.noShadow; mesh.receiveShadow = true; S.scene.add(mesh);
  });
  BATCH.clear();
}
export const geoCache: Record<string, THREE.BufferGeometry> = {};
export const boxG = (w: number, h: number, d: number) => geoCache['b' + w + ',' + h + ',' + d] || (geoCache['b' + w + ',' + h + ',' + d] = new THREE.BoxGeometry(w, h, d));
export const cylG = (r0: number, r1: number, seg: number) => geoCache['c' + r0 + ',' + r1 + ',' + seg] || (geoCache['c' + r0 + ',' + r1 + ',' + seg] = new THREE.CylinderGeometry(r0, r1, 1, seg));

/** Penyusun bangunan di titik (x, y, z) dengan putaran `ry`; bagian statis masuk batch. */
export function bld(x: number, y: number, z: number, ry = 0) {
  const Pm = M4(x, y, z, 0, ry, 0);
  const put = (mat: THREE.Material, g: THREE.BufferGeometry, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, rx = 0, ryy = 0, rz = 0) => addStatic(mat, g, Pm.clone().multiply(M4(lx, ly, lz, rx, ryy, rz, sx, sy, sz)));
  const at = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyMatrix4(Pm);
  return {
    box: (mat: THREE.Material, w: number, h: number, d: number, lx: number, ly: number, lz: number, rx?: number, ryy?: number, rz?: number) => put(mat, S.G.box, lx, ly, lz, w, h, d, rx, ryy, rz),
    cyl: (mat: THREE.Material, r0: number, r1: number, h: number, seg: number, lx: number, ly: number, lz: number, rx?: number, ryy?: number, rz?: number) => put(mat, cylG(r0, r1, seg), lx, ly, lz, 1, h, 1, rx, ryy, rz),
    geo: (mat: THREE.Material, g: THREE.BufferGeometry, lx: number, ly: number, lz: number, sx = 1, sy = 1, sz = 1, rx?: number, ryy?: number, rz?: number) => put(mat, g, lx, ly, lz, sx, sy, sz, rx, ryy, rz),
    at,
    mesh: <T extends THREE.Object3D>(m: T, lx: number, ly: number, lz: number) => { m.position.copy(at(lx, ly, lz)); m.rotation.y = ry; S.scene.add(m); return m; },
    pick: (w: number, h: number, d: number, lx: number, ly: number, lz: number, sel: unknown) => { const m = new THREE.Mesh(S.G.box, S.pickMat); m.scale.set(w, h, d); m.position.copy(at(lx, ly, lz)); m.rotation.y = ry; m.userData.sel = sel; S.scene.add(m); S.pickables.push(m); return m; },
  };
}

export function makeGeos() {
  const G = S.G;
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.plane = new THREE.PlaneGeometry(1, 1);
  G.wedge = (() => { const g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getZ(i) > 0) p.setY(i, -0.5); g.computeVertexNormals(); return g; })();
  G.gable = (() => {
    const x0 = -0.56, x1 = 0.56, zf = 0.62, zb = -0.62, yb = -0.04, yt = 1, Pp: number[] = [], UV: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => { Pp.push(...a, ...b, ...c, ...a, ...c, ...d); UV.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); };
    quad([x0, yb, zf], [x1, yb, zf], [x1, yt, 0], [x0, yt, 0]);
    quad([x1, yb, zb], [x0, yb, zb], [x0, yt, 0], [x1, yt, 0]);
    Pp.push(x1, yb, zf, x1, yb, zb, x1, yt, 0, x0, yb, zb, x0, yb, zf, x0, yt, 0); UV.push(0, 0, 1, 0, 0.5, 0.4, 0, 0, 1, 0, 0.5, 0.4);
    quad([x0, yb, zb], [x1, yb, zb], [x1, yb, zf], [x0, yb, zf]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.computeVertexNormals(); return g;
  })();
  G.hip = (() => {
    const x0 = -0.56, x1 = 0.56, z0 = -0.6, z1 = 0.6, r = 0.2, yb = -0.04, Pp: number[] = [], UV: number[] = [];
    const tri = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => { Pp.push(...a, ...b, ...c); UV.push(...ua, ...ub, ...uc); };
    const A = [x0, yb, z1], Bq = [x1, yb, z1], Cq = [x1, yb, z0], Dq = [x0, yb, z0], E = [-r, 1, 0], Fq = [r, 1, 0];
    tri(A, Bq, Fq, [0, 0], [1, 0], [0.68, 1]); tri(A, Fq, E, [0, 0], [0.68, 1], [0.32, 1]);
    tri(Cq, Dq, E, [0, 0], [1, 0], [0.68, 1]); tri(Cq, E, Fq, [0, 0], [0.68, 1], [0.32, 1]);
    tri(Bq, Cq, Fq, [0, 0], [1, 0], [0.5, 1]); tri(Dq, A, E, [0, 0], [1, 0], [0.5, 1]);
    tri(Dq, Cq, Bq, [0, 0], [0, 0], [0, 0]); tri(Dq, Bq, A, [0, 0], [0, 0], [0, 0]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.computeVertexNormals(); return g;
  })();
  G.torus = new THREE.TorusGeometry(0.13, 0.018, 6, 18);
  G.pyr = (() => { const g = new THREE.ConeGeometry(0.72, 1, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; })();
  G.houseBody = (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; })();
  G.leaf = mergeGeos([{ g: G.box, m: M4(0, 0, 0, 0, 0, 0, 2.46, 0.72, 0.12) }, ...[-0.24, 0, 0.24].map(y => ({ g: G.box, m: M4(0, y, 0.08, 0, 0, 0, 2.46, 0.04, 0.05) })), ...[-0.8, 0, 0.8].map(x => ({ g: G.box, m: M4(x, 0, 0.08, 0, 0, 0, 0.05, 0.72, 0.05) }))]);
  G.sphere = new THREE.SphereGeometry(1, 14, 10);
}

/* ---------- sweeps (canals, rivers, roads) ---------- */
export interface Frame { x: number; z: number; y: number; ws: number; nx: number; nz: number; dx: number; dz: number; sc: number; dist: number; cum: number[]; hw: number }
export function frames(pts: P[]): Frame[] {
  const out: Frame[] = []; let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz, nz = dx; let sc = 1;
    if (i > 0 && i < pts.length - 1) { const ax = p[0] - a[0], az = p[1] - a[1], la = Math.hypot(ax, az) || 1; sc = 1 / Math.max(0.4, (-az / la) * nx + (ax / la) * nz); }
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    out.push({ x: p[0], z: p[1], y: p[2] || 0, ws: p[3] == null ? 1 : p[3], nx, nz, dx, dz, sc, dist, cum: [], hw: 0 });
  }
  return out;
}
/** Titik profil: [offset, y, indeks warna, sisi] dari sisi −n ke sisi +n. */
export type ProfPt = [number, number, number?, ('L' | 'R' | null)?];
export interface SweepOpt { uvU?: number; uvV?: number; holes?: { side: 'L' | 'R'; d0: number; d1: number }[]; colors?: THREE.Color[] }
// prof: [[offset, y, colorIndex, side]] from the -n side to the +n side; faces point up / into the channel
export function sweep(pts: P[], prof: ProfPt[], opt: SweepOpt = {}) {
  const F = frames(pts), uvU = opt.uvU || 1, uvV = opt.uvV || 4, holes = opt.holes || [], cols = opt.colors;
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  F.forEach(f => { f.cum = [0]; for (let j = 1; j < prof.length; j++) f.cum.push(f.cum[j - 1] + Math.hypot((prof[j][0] - prof[j - 1][0]) * f.ws, prof[j][1] - prof[j - 1][1])); });
  for (let j = 0; j < prof.length - 1; j++) {
    const A = prof[j], Bq = prof[j + 1], side = A[3] || null, c = cols && cols[A[2] || 0], base = pos.length / 3;
    F.forEach(f => {
      for (const Pp of [A, Bq]) pos.push(f.x + f.nx * Pp[0] * f.ws * f.sc, f.y + Pp[1], f.z + f.nz * Pp[0] * f.ws * f.sc);
      uv.push(f.cum[j] / uvU, f.dist / uvV, f.cum[j + 1] / uvU, f.dist / uvV);
      if (c) col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    });
    for (let i = 0; i < F.length - 1; i++) {
      if (side && holes.length) { const dm = (F[i].dist + F[i + 1].dist) / 2; if (holes.some(hh => hh.side === side && dm > hh.d0 && dm < hh.d1)) continue; }
      const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
export function ribbon(pts: P[], width: number, y: number, mat: THREE.Material, uvScale = 4, add = true) {
  const geo = sweep(pts.map(p => [p[0], p[1], p[2] == null ? 0 : p[2], p[3] == null ? width / 2 : p[3]]), [[-1, 0], [1, 0]], { uvU: uvScale, uvV: uvScale });
  const m = new THREE.Mesh(geo, mat); m.position.y = y; m.receiveShadow = true; if (add) S.scene.add(m); return m;
}
export function quadMesh(p: P[], y: number, mat: THREE.Material) {
  const pos: number[] = [], idx = [0, 1, 2, 0, 2, 3];
  p.forEach(([x, z]) => pos.push(x, 0, z));
  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1]];
  if (e1[1] * e2[0] - e1[0] * e2[1] < 0) idx.reverse();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(p.flatMap(([x, z]) => [x / 3, z / 3]), 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.position.y = y; m.receiveShadow = true; S.scene.add(m); return m;
}

export interface InstSpec { x: number; y?: number; z: number; s?: number; sx?: number; sy?: number; sz?: number; rx?: number; ry?: number; rz?: number }
export function inst<T extends InstSpec>(geo: THREE.BufferGeometry, mat: THREE.Material, list: T[], colorFn: ((t: T, k: number) => THREE.Color) | null, shadow = true) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  list.forEach((t, k) => { q.setFromEuler(e.set(t.rx || 0, t.ry || 0, t.rz || 0)); m4.compose(p.set(t.x, t.y || 0, t.z), q, s.set((t.sx ?? t.s)!, (t.sy ?? t.s)!, (t.sz ?? t.s)!)); m.setMatrixAt(k, m4); if (colorFn) m.setColorAt(k, colorFn(t, k)); });
  m.castShadow = shadow; m.receiveShadow = true; m.frustumCulled = false; S.scene.add(m); return m;
}

const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3();
// thin square bar from a to b ([x, y, z]), batched with the static geometry
export function bar(mat: THREE.Material, a: number[], b: number[], r: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz); if (L < 1e-4) return;
  _q.setFromUnitVectors(_up, _dir.set(dx / L, dy / L, dz / L));
  addStatic(mat, S.G.box, new THREE.Matrix4().compose(new THREE.Vector3(a[0] + dx / 2, a[1] + dy / 2, a[2] + dz / 2), _q, new THREE.Vector3(r, L, r)));
}
// handrail with top and mid rails along a polyline on the walking surface
export function railing(pts: number[][], mat: THREE.Material = S.M.railY, h = 0.3, gap = 0.42) {
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / gap));
    bar(mat, [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.032);
    bar(mat, [a[0], a[1] + h * 0.5, a[2]], [b[0], b[1] + h * 0.5, b[2]], 0.022);
    for (let s = k === 1 ? 0 : 1; s <= n; s++) { const f = s / n, p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; bar(mat, p, [p[0], p[1] + h + 0.016, p[2]], 0.028); }
  }
}
