import * as THREE from 'three';
import { clamp, lerp } from '../lib/format';
import { jitter, rnd } from '../lib/random';
import { C, S, T3, fbm, hash2, riverHW, riverX } from './context';
import { M4, inst, mergeGeos, type GeoPart } from './geometry';
import { TB, isFree, occRect } from './occupancy';
import { gY, groundInfo } from './terrain';

/** Pohon (rindang, kelapa, bambu, pinus di bukit), perbukitan latar, dan awan. */
function blobGeo(parts: number[][], jit = 0.16, detail = 1) {
  const list: GeoPart[] = [];
  parts.forEach(([ox, oy, oz, r, sy], q) => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, nrm: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), j = 1 + (hash2(x * 7.1 + q * 3.3, y * 5.3 + z * 9.7) - 0.5) * 2 * jit;
      p.setXYZ(i, ox + x * r * j, oy + y * r * sy * j, oz + z * r * j); nrm.push(x, y * 0.8 + 0.2, z);
    }
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.attributes.normal.normalized = false;
    list.push({ g });
  });
  const out = mergeGeos(list); const nn = out.attributes.normal; for (let i = 0; i < nn.count; i++) { const x = nn.getX(i), y = nn.getY(i), z = nn.getZ(i), l = Math.hypot(x, y, z) || 1; nn.setXYZ(i, x / l, y / l, z / l); } return out;
}
function treeGeos() {
  const G = S.G;
  G.broad = blobGeo([[0, 2.1, 0, 1, 0.82], [0.62, 1.92, 0.3, 0.74, 0.78], [-0.6, 1.98, -0.28, 0.72, 0.8]]);
  G.broadFar = blobGeo([[0, 2.1, 0, 1.05, 0.85]]);
  G.broadTrunk = (() => { const g = new THREE.CylinderGeometry(0.07, 0.11, 1.9, 6); g.translate(0, 0.95, 0); return g; })();
  G.palmTrunk = (() => { const g = new THREE.CylinderGeometry(0.045, 0.075, 3.0, 6, 6); g.translate(0, 1.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 3; p.setX(i, p.getX(i) + 0.35 * y * y); } g.computeVertexNormals(); return g; })();
  G.palmCrown = (() => {
    const Pp: number[] = [], top = [0.35, 3.0, 0];
    for (let k = 0; k < 11; k++) {
      const a = k / 11 * Math.PI * 2 + (k % 2) * 0.2, ca = Math.cos(a), sa = Math.sin(a), L = 1.2 + (k % 3) * 0.13, seg = 4;
      let prev: { l: number[]; r: number[]; m: number[] } | null = null;
      for (let s = 0; s <= seg; s++) {
        const t = s / seg, r = L * t, yy = top[1] + 0.3 * t - 1.0 * t * t, wd = 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.12)) + 0.015;
        const cx = top[0] + ca * r, cz = top[2] + sa * r, px = -sa * wd, pz = ca * wd;
        const cur = { l: [cx + px, yy - 0.05 * t, cz + pz], r: [cx - px, yy - 0.05 * t, cz - pz], m: [cx, yy + 0.03, cz] };
        if (prev) { Pp.push(...prev.l, ...prev.m, ...cur.m, ...prev.l, ...cur.m, ...cur.l); Pp.push(...prev.m, ...prev.r, ...cur.r, ...prev.m, ...cur.r, ...cur.m); }
        prev = cur;
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(Pp, 3)); g.computeVertexNormals(); return g;
  })();
  const culms: GeoPart[] = [], tops: number[][] = [];
  for (let k = 0; k < 13; k++) {
    const a = k / 13 * 6.283 + jitter(0.3), lean = 0.1 + rnd() * 0.22, h = 2.6 + rnd() * 1.1, g = new THREE.CylinderGeometry(0.02, 0.03, h, 5); g.translate(0, h / 2, 0);
    culms.push({ g, m: M4(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16, Math.sin(a) * lean, 0, -Math.cos(a) * lean) });
  }
  for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + 0.3, rr = 0.34 + (k % 2) * 0.28; tops.push([Math.cos(a) * rr, 1.75 + (k % 3) * 0.45, Math.sin(a) * rr, 0.62, 1.6]); }
  tops.push([0, 2.95, 0, 0.5, 1.5]);
  G.bambooCulm = mergeGeos(culms); G.bambooTop = blobGeo(tops, 0.24, 0);
  G.pine = mergeGeos([[0.9, 1.6, 1.3], [0.7, 1.3, 2.2], [0.45, 1.0, 3.0]].map(([r, h, y]) => { const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y, 0); return { g }; }));
  G.pineTrunk = (() => { const g = new THREE.CylinderGeometry(0.06, 0.09, 1.3, 5); g.translate(0, 0.65, 0); return g; })();
}
type Tree = { x: number; y: number; z: number; s: number; ry: number; rz?: number };
export function buildTrees() {
  treeGeos();
  const W = T3.W, broad: Tree[] = [], far: Tree[] = [], palm: Tree[] = [], bamboo: Tree[] = [], pine: Tree[] = [];
  const add = (type: string, x: number, z: number, s: number, y?: number) => {
    const t: Tree = { x, y: y == null ? gY(x, z) : y, z, s, ry: rnd() * 6.28 };
    if (type === 'broad') broad.push(t); else if (type === 'far') far.push(t); else if (type === 'palm') { t.rz = jitter(0.08); palm.push(t); } else if (type === 'bamboo') bamboo.push(t); else pine.push(t);
    occRect(x - 0.35, z - 0.35, x + 0.35, z + 0.35, TB);
  };
  const tryTree = (type: string, x: number, z: number, s: number, pad = 0.45) => { if (!isFree(x, z, pad, TB)) return false; add(type, x, z, s); return true; };
  // riparian belt along the Cimanuk
  for (let z = W.z0 - 140; z < W.z1 + 140; z += 0.85) for (const side of [-1, 1]) {
    if (rnd() > 0.72) continue;
    const t = 1.9 + Math.pow(rnd(), 1.5) * 8.5, x = riverX(z) + side * (riverHW(z) + t);
    if (z > T3.zA - 6 && z < T3.zB + 8 && x > riverX(z) - 16 && x < T3.KL.x1 + 6) continue;
    const g = groundInfo(x, z); if (g.y < g.wl + 0.15) continue;
    if (!isFree(x, z, 0.4, TB)) continue;
    add(t < 4.8 && rnd() < 0.3 ? 'bamboo' : rnd() < 0.1 ? 'palm' : 'broad', x, z, 0.75 + rnd() * 0.5, g.y);
  }
  // along the small rivers
  T3.streams.forEach(pts => { for (let k = 0; k < pts.length; k += 2) for (const side of [-1, 1]) { if (rnd() > 0.55) continue; const [x, z] = pts[k], [x2, z2] = pts[Math.min(pts.length - 1, k + 1)], a = Math.atan2(z2 - z, x2 - x), o = 1.6 + rnd() * 2.4; tryTree(rnd() < 0.35 ? 'bamboo' : 'broad', x - Math.sin(a) * o * side, z + Math.cos(a) * o * side, 0.6 + rnd() * 0.45); } });
  // kampung trees: coconut palms and fruit trees around the houses
  S.villages.forEach(c => { for (let k = 0, t = 0; k < 10 + c.n && t < 80; t++) { const x = c.x + jitter(7.5), z = c.z + jitter(7.5); if (tryTree(rnd() < 0.45 ? 'palm' : rnd() < 0.12 ? 'bamboo' : 'broad', x, z, 0.7 + rnd() * 0.45, 0.3)) k++; } });
  // road trees
  const r1 = T3.roads.r1;
  for (let k = 0; k < r1.length - 1; k += 5) { const [x, z] = r1[k], [x2, z2] = r1[k + 1], a = Math.atan2(z2 - z, x2 - x); for (const side of [-1, 1]) if (rnd() < 0.7) tryTree(rnd() < 0.25 ? 'palm' : 'broad', x - Math.sin(a) * 1.7 * side, z + Math.cos(a) * 1.7 * side, 0.95 + rnd() * 0.4, 0.35); }
  // trees on the inspection road side of primaries and secondaries
  Object.keys(T3.lines).map(Number).forEach(i => { const L = T3.lines[i], D = L.D; if (!D.road) return; for (let x = L.sx + 3; x < L.ex - 2; x += 3.4) if (rnd() < 0.45) tryTree('broad', x + jitter(0.6), L.z - D.outUp - 0.55, 0.62 + rnd() * 0.3, 0.3); });
  // mixed gardens (kebun) in the open plain
  for (let t = 0; t < 2600; t++) {
    const x = W.x0 + rnd() * (W.x1 - W.x0), z = W.z0 + 20 + rnd() * (W.z1 - W.z0 - 20);
    if (rnd() > 0.3 || !isFree(x, z, 1.4, TB) || Math.abs(gY(x, z)) > 0.4) continue;
    const n = 2 + Math.floor(rnd() * 5); for (let k = 0; k < n; k++) tryTree(rnd() < 0.3 ? 'palm' : rnd() < 0.15 ? 'bamboo' : 'broad', x + jitter(2.2), z + jitter(2.2), 0.6 + rnd() * 0.5, 0.35);
  }
  // forest on the hills and the valley sides north of the weir
  for (let t = 0; t < 26000 && pine.length + far.length < 4200; t++) {
    const x = W.x0 - 150 + rnd() * (W.x1 - W.x0 + 300), z = W.z0 - 150 + rnd() * (W.z1 - W.z0 + 300), g = groundInfo(x, z);
    if (g.base < 0.8 || g.kind === 'bank' || !isFree(x, z, 0.5, TB)) continue;
    if (Math.abs(x - riverX(z)) < riverHW(z) + 2) continue;
    add(g.base > 7 && rnd() < 0.75 ? 'pine' : 'far', x, z, 0.9 + rnd() * 0.7, g.y);
  }
  const M = S.M, col = (h: number, s: number, l: number) => new THREE.Color().setHSL(h, s, l).convertSRGBToLinear();
  inst(S.G.broadTrunk, M.trunk, [...broad, ...far], null, true);
  inst(S.G.broad, M.leaf, broad, () => col(0.22 + rnd() * 0.09, 0.34 + rnd() * 0.2, 0.15 + rnd() * 0.1), true);
  inst(S.G.broadFar, M.leaf, far, () => col(0.24 + rnd() * 0.07, 0.3 + rnd() * 0.15, 0.13 + rnd() * 0.06), true);
  inst(S.G.palmTrunk, M.trunk, palm, null, true);
  inst(S.G.palmCrown, M.palmLeaf, palm, () => col(0.2 + rnd() * 0.05, 0.4 + rnd() * 0.15, 0.22 + rnd() * 0.07), true);
  inst(S.G.bambooCulm, new THREE.MeshStandardMaterial({ color: C(0x8e8f44), roughness: 0.7 }), bamboo, null, true);
  inst(S.G.bambooTop, M.leaf, bamboo, () => col(0.19 + rnd() * 0.04, 0.42 + rnd() * 0.12, 0.25 + rnd() * 0.06), true);
  inst(S.G.pineTrunk, M.trunk, pine, null, false);
  inst(S.G.pine, M.leaf, pine, () => col(0.3 + rnd() * 0.05, 0.28 + rnd() * 0.12, 0.13 + rnd() * 0.05), true);
  // trees round Situ Bagendit, laid out with the lake and coloured with their own generator, so the shared random
  // stream stays the same
  const lk = T3.lakeTrees || [];
  let sd = 0x71c3a95d;
  const lr = () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296;
  const lb = lk.filter(t => !t.palm), lp = lk.filter(t => t.palm);
  inst(S.G.broadTrunk, M.trunk, lb, null, true); inst(S.G.broad, M.leaf, lb, () => col(0.22 + lr() * 0.09, 0.34 + lr() * 0.2, 0.15 + lr() * 0.1), true);
  inst(S.G.palmTrunk, M.trunk, lp, null, true); inst(S.G.palmCrown, M.palmLeaf, lp, () => col(0.2 + lr() * 0.05, 0.4 + lr() * 0.15, 0.22 + lr() * 0.07), true);
}
export function buildBackdrop() {
  const cx = T3.maxX / 2, cz = T3.maxZ / 2;
  [[cx - 740, cz - 60, 430, 190], [cx + 160, cz + 860, 540, 270], [cx - 580, cz + 660, 380, 170], [cx + 800, cz - 180, 460, 160], [cx + 40, cz - 800, 500, 210], [cx + 720, cz + 560, 360, 140], [cx - 360, cz - 720, 340, 120]].forEach(([px, pz, r, h], k) => {
    const g = new THREE.PlaneGeometry(2 * r, 2 * r, 90, 90); g.rotateX(-Math.PI / 2); g.translate(px, 0, pz);
    const p = g.attributes.position, colr = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x - px, z - pz) / r, a = Math.atan2(z - pz, x - px);
      const y = d >= 1 ? -8 : h * Math.pow(1 - d, 1.45) * (0.85 + 0.3 * fbm(x * 0.012 + k, z * 0.012)) * (1 + 0.08 * Math.sin(a * 13 + k) * d) - (d < 0.06 && k === 1 ? (0.06 - d) * 180 : 0);
      p.setY(i, y);
      const f = clamp(y / h, 0, 1); c.setRGB(lerp(0.3, 0.5, f * f), lerp(0.42, 0.47, f), lerp(0.24, 0.4, f * f)).convertSRGBToLinear();
      colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3)); g.computeVertexNormals();
    S.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  });
  for (let k = 0; k < 16; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.tex.cloud, transparent: true, depthWrite: false, fog: false, opacity: 0.8 }));
    const a = rnd() * 6.28, d = 300 + rnd() * 700; sp.position.set(cx + Math.cos(a) * d, 170 + rnd() * 110, cz + Math.sin(a) * d); sp.scale.set(180 + rnd() * 160, 60 + rnd() * 40, 1);
    S.scene.add(sp); S.clouds.push(sp);
  }
}
