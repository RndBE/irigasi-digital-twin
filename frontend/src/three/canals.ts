import * as THREE from 'three';
import { clamp, lerp, smooth } from '../lib/format';
import { rnd } from '../lib/random';
import { R, ROOT, ROOTS } from '../domain/network';
import { GATES } from '../domain/gates';
import { sim } from '../domain/state';
import type { Gate, Sel } from '../domain/types';
import { C, LOC_X, LV, OX, S, T3, U, riverHW, riverX, type CanalDims, type P } from './context';
import { M4, addStatic, bld, boxG, frames, inst, railing, ribbon, sweep, type Frame, type ProfPt } from './geometry';
import { SLOT_IN, SLOT_T, canalDims } from './layout';
import { HB, occLine, occRect } from './occupancy';
import { lampPost } from './props';
import { gY } from './terrain';
import { drawTex, textTex } from './textures';

/**
 * Saluran berlapis dengan jalan inspeksi, muka air yang naik-turun dan mengalir sesuai debit, petak sawah tersier
 * yang diwarnai Faktor K, sungai dan bendung lokal, Situ Bagendit, serta model pintu sadap.
 */
const CANAL_COL = () => [C(0x6d8a45), C(0xb0a68a), C(0x88a054), C(0xbdb9ae), C(0x6c695c)];
function canalProfile(D: CanalDims): ProfPt[] {
  const { hw, T, b, road, s } = D, Pp: ProfPt[] = [[-(hw + b + road + s), 0, 0, 'L'], [-(hw + b + road), T, road ? 1 : 2, 'L']];
  if (road) Pp.push([-(hw + b), T, 2, 'L']);
  Pp.push([-hw, T, 3, 'L'], [-(hw - 0.1), 0.03, 4, null], [hw - 0.1, 0.03, 3, 'R'], [hw, T, 2, 'R'], [hw + b, T, 0, 'R'], [hw + b + s, 0, 0, 'R']);
  return Pp;
}
function endCap(f: Frame, prof: ProfPt[], back: boolean) {
  const pts = prof.filter(p => !(p[1] < 0.1 && Math.abs(p[0]) < f.hw)).map(p => new THREE.Vector2(p[0], p[1]));
  const tris = THREE.ShapeUtils.triangulateShape(pts, []), pos: number[] = [];
  const ox = back ? -f.dx * 0.15 : 0, oz = back ? -f.dz * 0.15 : 0;
  tris.forEach(t => { const o = back ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]]; o.forEach(k => pos.push(f.x + f.nx * pts[k].x + ox, pts[k].y, f.z + f.nz * pts[k].x + oz)); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const n = g.attributes.normal; if (n.count && (n.getX(0) * f.dx + n.getZ(0) * f.dz) * (back ? -1 : 1) < 0) { const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; } g.computeVertexNormals(); }
  addStatic(S.M.concrete, g, null);
}
const waterMat = (tex: THREE.Texture) => new THREE.MeshStandardMaterial({ color: C(0x4f8a86), map: tex, normalMap: S.tex.wn, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.2, metalness: 0.02, envMapIntensity: 0.55, transparent: true, opacity: 0.93 });

// A sweep takes each point's direction from its two neighbours, so at the right-angle bend where a branch turns
// from its long leg off the parent onto its own line, the bend frame leant almost along the long leg and the whole
// next straight run came out twisted and about half as wide. Two close points either side of every bend give the
// bend a clean 45° mitre and keep the straight runs square to their line.
function easeBends(pts: P[]) {
  const out: P[] = [pts[0]];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k - 1], p = pts[k], b = pts[k + 1];
    const ux = p[0] - a[0], uz = p[1] - a[1], vx = b[0] - p[0], vz = b[1] - p[1], lu = Math.hypot(ux, uz), lw = Math.hypot(vx, vz);
    if (lu < 1e-6 || lw < 1e-6 || (ux * vx + uz * vz) / (lu * lw) > 0.99) { out.push(p); continue; }
    const e = Math.min(0.6, lu / 3, lw / 3);
    out.push([p[0] - ux / lu * e, p[1] - uz / lu * e], p, [p[0] + vx / lw * e, p[1] + vz / lw * e]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function lineHoles(i: number) {
  const r = R[i], holes: { x: number; h: number; side: 'L' | 'R'; feed?: boolean }[] = [];
  r.sk.items.forEach(it => {
    if (it.kind === 'line') { const c = T3.lines[it.c]; if (!c) return; holes.push({ x: c.sx, h: c.D.hw + c.D.b, side: 'R' }); }
    else if (it.kind === 'in') { const Dv = canalDims(R[it.c]), x = (it.x + SLOT_IN / 2) * U + OX; holes.push({ x, h: Dv.hw + Dv.b, side: 'L', feed: true }); }
  });
  return holes;
}
export function buildCanals() {
  const M = S.M, cols = CANAL_COL();
  Object.keys(T3.lines).map(Number).forEach(i => {
    const r = R[i], L = T3.lines[i], D = L.D, prof = canalProfile(D);
    const holes = lineHoles(i), start: P[] = [];
    let lv = 0;
    if (!L.root && L.pz != null) { const Dp = T3.lines[r.p].D; start.push([L.sx, L.pz + Dp.hw - 0.05], [L.sx, L.z]); lv = L.z - (L.pz + Dp.hw - 0.05); }
    else start.push([L.sx, L.z]);
    const mids: number[] = []; holes.forEach(hh => { mids.push(hh.x - hh.h, hh.x + hh.h); });
    const pts: P[] = easeBends([...start, ...mids.filter(x => x > L.sx + 0.1 && x < L.ex - 0.1).sort((a, b) => a - b).map(x => [x, L.z]), [L.ex, L.z]]);
    const hs = holes.map(hh => ({ d0: lv + hh.x - hh.h - L.sx - 0.01, d1: lv + hh.x + hh.h - L.sx + 0.01, side: hh.side }));
    const emb = new THREE.Mesh(sweep(pts, prof, { uvU: 1.5, uvV: 1.5, holes: hs, colors: cols }), M.embank);
    emb.castShadow = true; emb.receiveShadow = true; emb.userData.sel = { kind: 'ruas', id: r.k }; S.scene.add(emb); S.pickables.push(emb);
    const F = frames(pts), fe = F[F.length - 1]; fe.hw = D.hw;
    if (!r.situ) { endCap(fe, prof, false); endCap(fe, prof, true); }
    // bridges of the inspection road over feeder channels
    holes.filter(hh => hh.feed && D.road).forEach(hh => { S.pend.push([hh.x, D.T - 0.03, L.z - (D.hw + D.b + D.road / 2), hh.h * 2 + 0.3, D.road + 0.1]); });
    // water surface, starting after the gate of a branch
    const gz = !L.root && L.pz != null ? L.pz + T3.lines[r.p].D.hw + 0.34 : null;
    const wpts: P[] = gz != null ? easeBends([[L.sx, gz], [L.sx, L.z], [L.ex - 0.18, L.z]]) : [[L.sx + (ROOTS.includes(i) && i !== ROOT ? 0.75 : 0), L.z], [L.ex - 0.18, L.z]];
    const tex = flowTextures().flow.clone(); tex.needsUpdate = true;
    const mat = waterMat(tex);
    const wm = new THREE.Mesh(sweep(wpts, [[-(D.hw - 0.04), 0], [D.hw - 0.04, 0]], { uvU: D.w, uvV: D.w * 2.6 }), mat);
    wm.position.y = D.T * 0.6; wm.receiveShadow = true; wm.userData.sel = { kind: 'ruas', id: r.k }; S.scene.add(wm); S.pickables.push(wm);
    S.canal[i] = { mat, tex, mesh: wm, D, speed: 0.3, level: D.T * 0.6 };
    // mouth patch between the parent channel and the gate
    if (gz != null) {
      const Dp = T3.lines[r.p].D, mm = new THREE.Mesh(sweep([[L.sx, L.pz! + Dp.hw - 0.12], [L.sx, gz - 0.03]], [[-(D.hw - 0.04), 0], [D.hw - 0.04, 0]], { uvU: 1, uvV: 1 }), mat);
      mm.position.y = D.T * 0.6; S.scene.add(mm); S.mouths.push({ m: mm, p: r.p });
    }
    for (let k = 1; k < pts.length; k++) T3.cseg.push({ a: pts[k - 1], b: pts[k], out: Math.max(D.outUp, D.outDn), outL: D.outUp, outR: D.outDn, T: D.T, D, i });
    occLine(pts, Math.max(D.outUp, D.outDn) + 0.25, 3);
    if (r.situ) T3.situ = i;
  });
  S.pend.forEach(([x, y, z, w, d]) => { const b = bld(x, 0, z); b.box(S.M.concrete, w, 0.08, d, 0, y, 0); });
  // BCP.3: end structure, operator post, name board
  const L = T3.lines[ROOT], D = L.D, b = bld(L.ex, 0, L.z);
  b.box(M.concrete, 1.6, D.T + 0.12, D.outUp + D.outDn, 0.55, (D.T + 0.12) / 2, (D.outDn - D.outUp) / 2);
  b.box(M.concrete, 0.8, 0.1, 1.4, -0.2, D.T + 0.17, 0);
  const brd = new THREE.Mesh(S.G.plane, new THREE.MeshStandardMaterial({ map: textTex('BCP.3', 'Bangunan bagi SI Copong'), roughness: 0.6, side: THREE.DoubleSide }));
  brd.scale.set(1.2, 0.34, 1); brd.position.set(L.ex + 1.1, 0.95, L.z + D.outDn + 0.6); S.scene.add(brd);
  for (const s of [-0.55, 0.55]) b.box(M.galv, 0.04, 0.8, 0.04, 1.1 + s, 0.4, D.outDn + 0.58);
  lampPost(L.ex + 1.2, 0, L.z - D.outUp - 0.4, 0, false);
  S.postHouse = { x: L.ex + 3.1, z: L.z - 3.0 };
}

// Flowing water, drawn with a local generator like the paddy textures below: soft dark troughs and light streaks
// drawn out along the flow (v), and small wavelets across it, every stroke repeated across the edges so the tile
// wraps. The ring texture holds soft bands across v, which the fan under a paddy inlet maps to the radius, so a
// scrolling offset spreads the ripples outward.
let flowTex: { flow: THREE.Texture; ring: THREE.Texture } | null = null;
function flowTextures() {
  if (flowTex) return flowTex;
  let seed = 0x2f6b9c11;
  const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const W = 128, H = 256, wrap = (fn: (ox: number, oy: number) => void) => { for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) fn(ox, oy); };
  const flow = drawTex(W, H, g => {
    g.fillStyle = '#c4cccc'; g.fillRect(0, 0, W, H);
    g.filter = 'blur(1.6px)';
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rx = 3 + r() * 7, ry = 14 + r() * 36, a = 0.07 + r() * 0.1;
      g.fillStyle = `rgba(70,96,98,${a.toFixed(3)})`; wrap((ox, oy) => { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, 0, 0, 7); g.fill(); });
    }
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = r() * H, rx = 1 + r() * 2.2, ry = 8 + r() * 24, a = 0.12 + r() * 0.24;
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`; wrap((ox, oy) => { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, 0, 0, 7); g.fill(); });
    }
    g.filter = 'none'; g.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      const x = r() * W, y = r() * H, w = 5 + r() * 8, a = 0.22 + r() * 0.3, lw = 1 + r() * 0.7;
      g.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.lineWidth = lw;
      wrap((ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.quadraticCurveTo(x + ox + w / 2, y + oy - 2.2, x + ox + w, y + oy); g.stroke(); });
    }
  });
  const ring = drawTex(16, 64, g => {
    g.clearRect(0, 0, 16, 64);
    for (let y = 0; y < 64; y++) { const d = ((y % 16) - 7.5) / 2.4; g.fillStyle = `rgba(255,255,255,${(Math.exp(-d * d) * 0.9).toFixed(3)})`; g.fillRect(0, y, 16, 1); }
  });
  flowTex = { flow, ring };
  return flowTex;
}

// Half disc facing +z, radius 1, for the ripples spreading from a paddy inlet: u runs round the rim, v out along the
// radius, and the vertex alpha fades them in at the inlet and out towards the rim.
function fanGeo() {
  const NA = 14, NR = 6, pos: number[] = [], uv: number[] = [], col: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NA; i++) for (let j = 0; j <= NR; j++) {
    const a = -Math.PI / 2 + Math.PI * i / NA, t = j / NR, rr = 0.08 + 0.92 * t;
    pos.push(Math.sin(a) * rr, 0, Math.cos(a) * rr); nrm.push(0, 1, 0); uv.push(i / NA * 3, rr);
    col.push(1, 1, 1, Math.min(1, t / 0.2) * (1 - t) ** 1.3 * Math.cos(a * 0.8));
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = a + NR + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  return g;
}

// Soft foam patch: a disc of radius 0.5 in the xz plane, opaque at the heart and fading to nothing at the rim, so
// white water has no square edges. Planar uv, so the foam texture keeps its scale across the patch.
function blobGeo() {
  const NA = 18, NR = 4, pos: number[] = [0, 0, 0], uv: number[] = [0.5, 0.5], col: number[] = [1, 1, 1, 1], nrm: number[] = [0, 1, 0], idx: number[] = [];
  for (let j = 1; j <= NR; j++) for (let i = 0; i < NA; i++) {
    const a = i / NA * Math.PI * 2, t = j / NR, rr = 0.5 * t, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    pos.push(x, 0, z); nrm.push(0, 1, 0); uv.push(x + 0.5, 0.5 - z); col.push(1, 1, 1, (1 - t * t) ** 1.5);
  }
  const at = (j: number, i: number) => j === 0 ? 0 : 1 + (j - 1) * NA + (i % NA);
  for (let i = 0; i < NA; i++) idx.push(0, at(1, i + 1), at(1, i));
  for (let j = 1; j < NR; j++) for (let i = 0; i < NA; i++) idx.push(at(j, i), at(j, i + 1), at(j + 1, i), at(j + 1, i), at(j, i + 1), at(j + 1, i + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  return g;
}

// Water leaving the offtake pipe: the pipe runs part full, so the jet has a flat top and a round belly, and it falls
// on a parabola from the mouth (origin) out along +z. Unit width (x), length (z) and drop (y); the belly is drawn
// against a drop of about 0.14 so it comes out about 0.014 thick. Texture v runs against the flow like the other
// offtake water, so the same scrolling carries it out of the pipe.
function pourGeo() {
  const NS = 8, NC = 12, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k <= NS; k++) {
    const t = k / NS, y0 = -t * t, wk = 1 - 0.3 * t;
    for (let j = 0; j <= NC; j++) {
      const ph = j / NC * Math.PI * 2, x = 0.5 * Math.cos(ph) * wk, y = y0 + (ph < Math.PI ? 0.02 : 0.1) * Math.sin(ph);
      pos.push(x, y, t); uv.push(j / NC * 2, -t * 0.4);
    }
  }
  for (let k = 0; k < NS; k++) for (let j = 0; j < NC; j++) { const a = k * (NC + 1) + j, b = a + NC + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Rice paddy textures, drawn with a local generator so the shared random stream (and everything built after it)
// stays the same: rows of rice clumps standing in flooded mud, the matching roughness (glossy water between the
// rows, matt leaves), and the clumps alone with alpha fading from the heart to the leaf tips for the tuft shells.
// One texture spans a whole plot (about 1.6 × 1 unit), so leaf strokes are squeezed along u to come out round.
let paddyTex: { map: THREE.Texture; rough: THREE.Texture; tuft: THREE.Texture } | null = null;
function paddyTextures() {
  if (paddyTex) return paddyTex;
  let seed = 0x68e31da4;
  const r = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const N = 256, SQ = 0.6, leaves: { x: number; y: number; dx: number; dy: number; w: number; l: number }[] = [];
  for (let row = 0; row < 16; row++) for (let k = 0; k < 26; k++) {
    const x = (k + 0.5) * N / 26 + (r() - 0.5) * 2.5, y = (row + 0.5) * N / 16 + (r() - 0.5) * 2, a0 = r() * 6.28, sc = 0.8 + r() * 0.45;
    for (let j = 0; j < 7; j++) { const a = a0 + j * 0.9 + (r() - 0.5) * 0.5, len = (3.5 + r() * 3) * sc; leaves.push({ x, y, dx: Math.cos(a) * len * SQ, dy: Math.sin(a) * len, w: 1 + r() * 0.8, l: 0.85 + r() * 0.3 }); }
  }
  const blobs = Array.from({ length: 40 }, () => [r() * N, r() * N, 10 + r() * 26, r()]);
  const map = drawTex(N, N, g => {
    g.fillStyle = '#8a928a'; g.fillRect(0, 0, N, N);
    // mud and sky showing through the standing water
    blobs.forEach(([x, y, rad, t]) => { g.fillStyle = t < 0.5 ? 'rgba(70,74,60,.18)' : 'rgba(170,182,186,.16)'; g.beginPath(); g.ellipse(x, y, rad, rad * 0.6, 0, 0, 7); g.fill(); });
    g.lineCap = 'round';
    leaves.forEach(f => { const v = Math.round(225 * f.l); g.strokeStyle = `rgb(${v},${Math.min(255, v + 10)},${v - 20})`; g.lineWidth = f.w; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + f.dx, f.y + f.dy); g.stroke(); });
  });
  const rough = drawTex(N, N, g => {
    g.fillStyle = 'rgb(46,46,46)'; g.fillRect(0, 0, N, N); g.lineCap = 'round'; g.strokeStyle = 'rgb(220,220,220)';
    leaves.forEach(f => { g.lineWidth = f.w + 1; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + f.dx, f.y + f.dy); g.stroke(); });
  }, false);
  const tuft = drawTex(N, N, g => {
    g.clearRect(0, 0, N, N); g.lineCap = 'round';
    leaves.forEach(f => {
      const gr = g.createLinearGradient(f.x, f.y, f.x + f.dx, f.y + f.dy);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0.12)');
      g.strokeStyle = gr; g.lineWidth = f.w + 0.6; g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + f.dx, f.y + f.dy); g.stroke();
    });
  });
  paddyTex = { map, rough, tuft };
  return paddyTex;
}

// Earth ridges of the paddies: trapezoid ridges, grass on the crown and bare earth down the flanks, capped at both
// ends; `add` lays them out with `ridge` (along x or z, centred at `c` across and `o` along, `L` long, its
// cross-section narrowed by `k` for instances stretched by that factor in x).
function ridgeGeo(add: (ridge: (alongZ: boolean, c: number, L: number, k: number, o?: number) => void) => void) {
  const pos: number[] = [], col: number[] = [], uv: number[] = [], grass = C(0x7f9a4a), earth = C(0x7b6c4b), h = 0.1, wb = 0.075, wt = 0.032;
  const sec = [[-wb / 2, 0], [-wt / 2, h], [wt / 2, h], [wb / 2, 0]];
  const ridge = (alongZ: boolean, c: number, L: number, k: number, o = 0) => {
    const P = (s: number, i: number) => { const [a, y] = sec[i]; return alongZ ? [c + a / k, y, s] : [s, y, c + a]; };
    const put = (p: number[], i: number, s: number) => { pos.push(...p); const cc = sec[i][1] > 0 ? grass : earth; col.push(cc.r, cc.g, cc.b); uv.push(s * 2, i / 3); };
    for (let i = 0; i < 3; i++) {
      const a0 = P(o - L / 2, i), a1 = P(o - L / 2, i + 1), b0 = P(o + L / 2, i), b1 = P(o + L / 2, i + 1);
      put(a0, i, 0); put(b0, i, 1); put(b1, i + 1, 1); put(a0, i, 0); put(b1, i + 1, 1); put(a1, i + 1, 0);
    }
    for (const s of [o - L / 2, o + L / 2]) { const q = [0, 1, 2, 3].map(i => P(s, i)); [[0, 1, 2], [0, 2, 3]].forEach(t => t.forEach(i => put(q[i], i, 0))); }
  };
  add(ridge);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Pematang: a ridge along each side of the unit plot. The instances stretch x by the plot width `kx`, so the ridges
// facing ±x are drawn narrower by that factor to come out as wide as the others. The ridge on the `cut` side (the
// quarter ditch) has a gap at its middle, `gap` long, where the water comes in.
function bundGeo(kx: number, cut: number, gap: number) {
  return ridgeGeo(ridge => {
    for (const zz of [-0.5, 0.5]) ridge(false, zz, 1.045, 1);
    const Lh = (1.07 - gap) / 2;
    for (const xx of [-0.5, 0.5]) {
      if (Math.sign(xx) === cut) for (const o of [-1, 1]) ridge(true, xx, Lh, kx, o * (gap / 2 + Lh / 2));
      else ridge(true, xx, 1.07, kx);
    }
  });
}

// Water of the tertiary offtakes, per part for all offtakes at once: [offtake index, matrix] of every instance.
// Box: the chamber behind the gate with white water where it comes in from the canal; the jet out of the pipe mouth,
// with foam where it lands on the chute and round the baffles; the stilling basin; the quarter ditch in short pieces so its flow pattern keeps one scale;
// and at every plot the spill through the cut in the bund with foam where it lands and ripples spreading into the
// paddy. All of it is dry while the tertiary gets no water (sync).
const OW = ['box', 'boxFoam', 'pour', 'chute', 'chuteFoam', 'baffle', 'basin', 'basinFoam', 'ditch', 'spill', 'spillFoam', 'ripple'] as const;
type OwPart = typeof OW[number];
export function buildPlots() {
  // plots carry their side of the ditch `s`, the share `f` of the full width left after clearing a branch, and the
  // side of the inlet cut in their bund (`cut`, 0 without an inlet)
  const M = S.M, plots: { x: number; y: number; z: number; sx: number; sy: number; sz: number; m: number; s: number; f: number; cut: number }[] = [];
  const ditches: { x: number; y: number; z: number; sx: number; sy: number; sz: number; m: number }[] = [], ridges: typeof ditches = [], tails: typeof ditches = [];
  const ow = { m: [] as number[], p: Object.fromEntries(OW.map(n => [n, []])) as unknown as Record<OwPart, [number, THREE.Matrix4][]> };
  // inflow at each offtake intake, relative to the canal surface of canal `i`: the dip and the rings
  const inflow: { n: number; i: number; dip: THREE.Matrix4; rip: THREE.Matrix4 }[] = [];
  // plot columns either side of the quarter ditch: plot width, centre offset, and the ditch between them
  const PW = 1.52, PX = 0.86, DW = 2 * PX - PW, WY = 0.066;
  // a plot or ditch must keep clear of the other canals out to the toe of their banks, and of the first leg of its own
  // canal where a branch runs out from its parent (its main run is cleared by the plot offset). Where the scheme
  // puts a tertiary right beside a branch junction, the plots that would lie under the branch are left out.
  // The bank on the road side (-n of the canal's run, see frames) reaches further out than the other one.
  const blocked = (i: number, x0: number, x1: number, z0: number, z1: number) => T3.cseg.some(c => {
    if (c.i === i && Math.abs(c.a[1] - c.b[1]) < 0.3) return false;
    const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1], l = Math.hypot(dx, dz) || 1;
    const side = (((x0 + x1) / 2 - c.a[0]) * -dz + ((z0 + z1) / 2 - c.a[1]) * dx) / l, o = (side < 0 ? c.outL : c.outR) ?? c.out;
    return !(x1 < Math.min(c.a[0], c.b[0]) - o || x0 > Math.max(c.a[0], c.b[0]) + o || z1 < Math.min(c.a[1], c.b[1]) - o || z0 > Math.max(c.a[1], c.b[1]) + o);
  });
  Object.keys(T3.lines).map(Number).forEach(i => {
    const r = R[i], L = T3.lines[i], D = L.D, b = bld(0, 0, 0);
    r.sk.items.forEach(it => {
      if (it.kind === 'line' || it.kind === 'in') return;
      const dir = it.side === 'up' ? -1 : 1, off0 = (dir < 0 ? D.outUp : D.outDn) + 0.12, yaw = dir < 0 ? Math.PI : 0;
      it.members.forEach((m, k) => {
        const rr = R[m], cx = (it.x + SLOT_T * k + SLOT_T / 2) * U + OX, rows = clamp(Math.ceil(rr.A / 30), 1, 3);
        const pitch = Math.min(1.0, (4.15 - off0) / rows), pd = pitch - 0.02, n = ow.m.push(m) - 1;
        const put = (part: OwPart, mm: THREE.Matrix4) => { ow.p[part].push([n, mm]); };
        // crest and foot of the outer bank slope; the quarter ditch runs from the foot out between the plot columns
        const z0 = L.z + dir * (D.hw + D.b + D.road * (dir < 0 ? 1 : 0)), zf = z0 + dir * D.s, z1 = L.z + dir * (off0 + pitch * rows);
        const ditch = !blocked(i, cx - DW / 2, cx + DW / 2, Math.min(zf, z1), Math.max(zf, z1));
        // width share of the last plot each side of the ditch (undefined where there is none)
        const endF: Record<number, number | undefined> = {};
        for (let row = 0; row < rows; row++) for (const sd of [-1, 1]) {
          // a plot that reaches under a branch is narrowed from its ditch side, or left out if too little is left
          const zr = L.z + dir * (off0 + pitch * (row + 0.5));
          const f = [1, 0.85, 0.7, 0.55].find(f => { const px = cx + sd * (PX + PW * (1 - f) / 2); return !blocked(i, px - PW * f / 2, px + PW * f / 2, zr - pd / 2, zr + pd / 2); });
          if (row === rows - 1) endF[sd] = f;
          // no plot, or a narrowed one, beside the ditch: a plain earth ridge keeps the ditch water in on that side
          if ((f == null || f < 1) && ditch) ridges.push({ x: cx + sd * (DW / 2 + 0.03), y: 0.04, z: zr, sx: 0.06, sy: 0.08, sz: pitch, m });
          if (f == null) continue;
          const inlet = ditch && f === 1;
          plots.push({ x: cx + sd * (PX + PW * (1 - f) / 2), y: 0, z: zr, sx: PW * f, sy: 1, sz: pd, m, s: sd, f, cut: inlet ? -sd : 0 });
          // inlet: the ditch water runs through the cut in the bund, lands in the paddy and spreads out
          if (!inlet) continue;
          put('spill', M4(cx + sd * (DW / 2 + 0.005), WY - 0.004, zr, 0, sd * Math.PI / 2, 0, 0.075, 1, 0.11));
          put('spillFoam', M4(cx + sd * (DW / 2 + 0.075), 0.0535, zr, 0, 0, 0, 0.1, 1, 0.1));
          put('ripple', M4(cx + sd * (DW / 2 + 0.04), 0.0515, zr, 0, sd * Math.PI / 2, 0, 0.36, 1, 0.36));
        }
        if (ditch) {
          ditches.push({ x: cx, y: 0.0125, z: (zf + z1) / 2, sx: DW, sy: 0.045, sz: Math.abs(z1 - zf), m });
          // the ditch ends at the last plots against a ridge across it, in line with their outer bunds, which closes
          // it and holds its water in. It is a little thicker and higher than a bund, so it covers the ends of the
          // bunds along the ditch; each half runs from the middle over the end bund of the plot on its side or,
          // without a full plot there, out to the side ridge
          for (const sd of [-1, 1]) { const e = endF[sd] === 1 ? 0.14 : 0.16; tails.push({ x: cx + sd * e / 2, y: 0, z: z1 + dir * 0.005, sx: e, sy: 1.06, sz: 1.25, m }); }
          const zs = zf + dir * 0.15, dl = Math.abs(z1 - dir * 0.01 - zs), nd = Math.max(1, Math.round(dl / 0.5)), sl = dl / nd;
          for (let j = 0; j < nd; j++) put('ditch', M4(cx, WY, zs + dir * sl * (j + 0.5), 0, yaw, 0, DW - 0.04, 1, sl));
        }
        // intake on the canal face: a headwall set into the lining with a wing wall each side and the culvert mouth
        // at the water. The gate leaf slides down the front of the headwall over the mouth (raised a little, so the
        // water runs in under it) in two guide posts that rise above the headwall and carry the crossbeam with the
        // gearbox; the rising spindle goes from the top of the leaf to a small handwheel. While the tertiary takes
        // water the canal surface dips in front of the mouth and rings run into it (inflow, on the canal surface)
        const zi = L.z + dir * (D.hw - 0.05), zf1 = L.z + dir * (D.hw - 0.08), yi = D.T * 0.5, zg = zf1 - dir * 0.012, gt = D.T + 0.25;
        b.box(M.concrete, 0.3, D.T + 0.03, 0.06, cx, (D.T + 0.03) / 2, zi);
        for (const s of [-1, 1]) b.box(M.concrete, 0.03, D.T * 0.6, 0.1, cx + s * 0.165, D.T * 0.3 + 0.01, zf1 - dir * 0.03);
        b.box(M.dark, 0.16, 0.12, 0.01, cx, yi, zf1 - dir * 0.002);
        // the leaf reaches from just above the sill of the mouth to the top of the headwall, so it shows above the water
        const l0 = yi - 0.03, l1 = D.T + 0.02, lh = l1 - l0, ly = (l0 + l1) / 2;
        b.box(M.steel, 0.2, lh, 0.012, cx, ly, zg);
        for (const f of [-1 / 6, 1 / 6, 1 / 2 - 0.04]) b.box(M.dark, 0.2, 0.01, 0.006, cx, ly + lh * f, zg - dir * 0.009);
        b.box(M.dark, 0.03, 0.02, 0.016, cx, l1 + 0.01, zg);
        for (const s of [-0.11, 0.11]) b.box(M.steel, 0.022, gt - 0.05, 0.02, cx + s, (gt + 0.05) / 2, zg);
        b.box(M.steel, 0.244, 0.02, 0.02, cx, gt, zg);
        b.box(M.dark, 0.07, 0.05, 0.05, cx, gt + 0.035, zg);
        const st = l1, sl = gt + 0.16 - st;
        b.box(M.galv, 0.012, sl, 0.012, cx, st + sl / 2, zg);
        b.geo(M.yellow, S.G.torus, cx, gt + 0.09, zg, 0.35, 0.35, 0.35, Math.PI / 2, 0, 0);
        inflow.push({ n, i, dip: M4(cx, 0.004, L.z + dir * (D.hw - 0.2), 0, 0, 0, 0.34, 1, 0.24), rip: M4(cx, 0.005, zg - dir * 0.01, 0, dir > 0 ? Math.PI : 0, 0, 0.3, 1, 0.3) });
        // offtake box on the berm behind the intake: open chamber on a footing, its walls standing clear of the berm
        // so the water in it shows, half covered by a grating, with a staff gauge inside; it ends before the
        // inspection road on the road side
        const top = D.T + 0.1, fl = D.T - 0.25, wb = D.T + 0.035, bd = 0.26, zc = L.z + dir * (D.hw + 0.005 + bd / 2);
        b.box(M.concrete, 0.32, fl, bd, cx, fl / 2, zc);
        for (const s of [-1, 1]) {
          b.box(M.concrete, 0.035, top - fl, bd, cx + s * 0.1425, (top + fl) / 2, zc);
          b.box(M.concrete, 0.25, top - fl, 0.035, cx, (top + fl) / 2, zc + s * (bd / 2 - 0.0175));
        }
        addStatic(M.rack, S.G.plane, M4(cx, top + 0.003, zc + dir * 0.05, -Math.PI / 2, 0, 0, 0.25, 0.1, 1));
        b.box(M.gauge, 0.004, 0.09, 0.03, cx - 0.123, D.T + 0.05, zc);
        // the offtake pipe comes out just past the road edge (or the bank crest), below the road, from a headwall on
        // the top of the slope with a concrete collar round its mouth, and falls into a lined chute down the slope
        // with three baffle blocks near the bottom, which drops into a small stilling basin at the foot where the
        // quarter ditch starts
        const yp = D.T - 0.045, zh = z0 + dir * 0.09;
        b.box(M.concrete, 0.26, 0.145, 0.09, cx, D.T - 0.0675, z0 + dir * 0.045);
        b.cyl(M.concrete, 0.048, 0.048, 0.03, 12, cx, yp, zh + dir * 0.015, Math.PI / 2, 0, 0);
        b.cyl(M.dark, 0.034, 0.034, 0.032, 10, cx, yp, zh + dir * 0.015, Math.PI / 2, 0, 0);
        // the chute lies on the bank slope (not sunk into it), so its whole length shows below the pipe
        const za = zh, ya = D.T - 0.12, yb = 0.045, Lc = Math.hypot(zf - za, ya - yb), ang = Math.atan2(ya - yb, Math.abs(zf - za)) * dir;
        const zm = (za + zf) / 2, ym = (ya + yb) / 2, zb = zf + dir * 0.07;
        b.box(M.concrete, 0.17, 0.02, Lc, cx, ym - 0.01, zm, ang);
        for (const s of [-1, 1]) b.box(M.concrete, 0.025, 0.065, Lc, cx + s * 0.0725, ym + 0.02, zm, ang);
        // on the road side of a canal the pipe runs under the inspection road: a concrete cover strip flush with the
        // road over the culvert, from the box to the far road edge
        if (D.road && dir < 0) {
          const zb0 = zc + dir * bd / 2;
          b.box(M.concrete, 0.2, 0.006, Math.abs(z0 - zb0), cx, D.T + 0.003, (zb0 + z0) / 2);
        }
        const baffles = [[0.55, -0.03], [0.7, 0.03], [0.85, -0.03]];
        for (const [t, ox] of baffles) b.box(M.concrete, 0.045, 0.028, 0.03, cx + ox, lerp(ya, yb, t) + 0.012, lerp(za, zf, t), ang);
        b.box(M.concrete, 0.22, 0.02, 0.16, cx, 0.01, zb);
        for (const s of [-1, 1]) b.box(M.concrete, 0.025, WY + 0.012, 0.16, cx + s * 0.0975, (WY + 0.012) / 2, zb);
        // water of this offtake, drawn per part for all offtakes at once (see below) and dry when it gets no flow
        // chute water surface over the chute floor at z
        const onChute = (z: number) => lerp(ya, yb, Math.abs(z - za) / Math.abs(zf - za)) + 0.014;
        // jet: out of the lower part of the mouth (the pipe runs part full), landing a little down the chute
        const zj = zh + dir * 0.031, yj = yp - 0.012, zl = zj + dir * 0.07;
        put('box', M4(cx, wb, zc, 0, yaw, 0, 0.25, 1, bd - 0.07));
        put('boxFoam', M4(cx, wb + 0.002, zc - dir * 0.06, 0, 0, 0, 0.24, 1, 0.09));
        put('pour', M4(cx, yj, zj, 0, yaw, 0, 0.05, yj - onChute(zl) + 0.004, 0.07));
        put('chute', M4(cx, ym + 0.014, zm, ang, yaw, 0, 0.12, 1, Lc));
        put('chuteFoam', M4(cx, onChute(zl + dir * 0.02) + 0.004, zl + dir * 0.02, ang, 0, 0, 0.12, 1, 0.11));
        for (const [t, ox] of baffles) put('baffle', M4(cx + ox, onChute(lerp(za, zf, t)) + 0.004, lerp(za, zf, t) - dir * 0.008, ang, 0, 0, 0.075, 1, 0.08));
        put('basin', M4(cx, WY - 0.006, zb, 0, yaw, 0, 0.17, 1, 0.16));
        put('basinFoam', M4(cx, WY - 0.003, zb - dir * 0.02, 0, 0, 0, 0.19, 1, 0.13));
        T3.plot[m] = [cx, L.z + dir * (off0 + pitch * rows / 2)];
        occRect(cx - 1.65, Math.min(L.z, z1 + dir * 0.2), cx + 1.65, Math.max(L.z, z1 + dir * 0.2), 3);
      });
    });
  });
  const pg = new THREE.BoxGeometry(1, 0.05, 1); pg.translate(0, 0.025, 0);
  // flooded paddy: rice rows over glossy water, the sky showing in the water between the rows; the moving water
  // normals make the standing water shimmer
  const pt = paddyTextures();
  M.plot.map = pt.map; M.plot.roughnessMap = pt.rough; M.plot.roughness = 1; M.plot.envMapIntensity = 0.8;
  M.plot.normalMap = S.tex.wn; M.plot.normalScale.set(0.22, 0.22); M.plot.needsUpdate = true;
  S.cells = new THREE.Group(); S.scene.add(S.cells);
  const pim = inst(pg, M.plot, plots, () => new THREE.Color(1, 1, 1), false)!;
  pim.receiveShadow = true; pim.userData.plots = true; S.scene.remove(pim); S.cells.add(pim); S.pickables.push(pim); S.plots = pim;
  plots.forEach((p, k) => { S.plotOf[k] = p.m; S.plotVary[k] = 0.9 + rnd() * 0.18; });
  // rice clumps standing out of the water: three shells of the clump texture, each cut at a higher alpha so the
  // tufts narrow towards the leaf tips; coloured per plot like the paddy, shown only when the camera is close
  S.plotShells = [[0.018, 0.22, 0.82], [0.036, 0.45, 0.92], [0.054, 0.7, 1.02]].map(([h, cut, shade]) => {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0.05 + h, 0);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade, shade, shade), map: pt.tuft, alphaTest: cut, roughness: 0.8 });
    mat.onBeforeCompile = M.plot.onBeforeCompile;
    const im = inst(g, mat, plots, () => new THREE.Color(1, 1, 1), false)!;
    im.receiveShadow = true; S.scene.remove(im); S.cells.add(im); return im;
  });
  // bunds as wide as their plot, with the inlet cut on the ditch side where the plot has an inlet; one instanced
  // mesh per plot width and cut, since the ridges facing ±x are drawn for the width they are stretched to
  const bundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: S.tex.noise, roughness: 1, side: THREE.DoubleSide });
  const kinds = new Map<string, typeof plots>();
  plots.forEach(p => { const key = `${p.f}|${p.cut}`; if (!kinds.has(key)) kinds.set(key, []); kinds.get(key)!.push(p); });
  kinds.forEach(list => {
    const { f, cut } = list[0], w = PW * f + 0.02;
    const bim = inst(bundGeo(w, cut, 0.09), bundMat, list.map(p => ({ ...p, sx: w, sz: p.sz + 0.03 })), null, false); if (bim) { S.scene.remove(bim); S.cells.add(bim); }
  });
  const tim = inst(ridgeGeo(ridge => ridge(false, 0, 1, 1)), bundMat, tails, null, false); if (tim) { S.scene.remove(tim); S.cells.add(tim); }
  const ridgeMat = new THREE.MeshStandardMaterial({ color: C(0x7f9a4a), map: S.tex.noise, roughness: 1 });
  const rim = inst(S.G.box, ridgeMat, ridges, null, false); if (rim) { S.scene.remove(rim); S.cells.add(rim); }
  // quarter ditch bed: wet earth between the bunds, under the ditch water
  const bedMat = M.mud.clone(); bedMat.color = C(0x4a4131);
  const dim = inst(S.G.box, bedMat, ditches, null, false)!; S.scene.remove(dim); S.cells.add(dim);
  // offtake water, one instanced mesh per part so every offtake costs nothing extra. The chute carries the fast
  // streaks, the box, basin, ditch and spills the calmer flow pattern; both are scrolled in the frame loop so they
  // run downstream (texture v runs against the flow), and the rings spread out from each inlet
  const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
  const ft = flowTextures();
  S.tex.chute = S.tex.streak.clone(); S.tex.chute.needsUpdate = true;
  S.tex.offFlow = ft.flow.clone(); S.tex.offFlow.needsUpdate = true; S.tex.ring = ft.ring;
  const chuteMat = new THREE.MeshStandardMaterial({ color: C(0x4f8a86), map: S.tex.chute, normalMap: S.tex.wn, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.2, transparent: true, opacity: 0.9 });
  const flowMat = new THREE.MeshStandardMaterial({ color: C(0x4f8a86), map: S.tex.offFlow, normalMap: S.tex.wn, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.18, envMapIntensity: 0.6, transparent: true, opacity: 0.92 });
  const foamMat = M.foam.clone(); foamMat.opacity = 0.8; foamMat.vertexColors = true;
  // the jet is fast, aerated water: the chute streaks, paler, and see-through at its thin edges
  const pourMat = chuteMat.clone(); pourMat.side = THREE.DoubleSide; pourMat.color = C(0x8fbcb6); pourMat.opacity = 0.8;
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: S.tex.ring, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, roughness: 0.3 });
  const fan = fanGeo(), blob = blobGeo();
  const spec: Record<OwPart, [THREE.BufferGeometry, THREE.Material, number, boolean]> = {
    box: [flat, flowMat, 0, false], boxFoam: [blob, foamMat, 3, false], pour: [pourGeo(), pourMat, 2, false], chute: [flat, chuteMat, 2, false],
    chuteFoam: [blob, foamMat, 3, false], baffle: [blob, foamMat, 3, false], basin: [flat, flowMat, 0, false], basinFoam: [blob, foamMat, 3, false],
    ditch: [flat, flowMat, 0, true], spill: [flat, flowMat, 1, true], spillFoam: [blob, foamMat, 3, true], ripple: [fan, ringMat, 2, true],
  };
  const parts = OW.map(name => {
    const list = ow.p[name], [geo, mat, order, cell] = spec[name];
    const im = new THREE.InstancedMesh(geo, mat, list.length), idx: number[][] = ow.m.map(() => []);
    list.forEach(([n, mm], j) => { im.setMatrixAt(j, mm); idx[n].push(j); });
    im.frustumCulled = false; im.receiveShadow = true; im.renderOrder = order; (cell ? S.cells : S.scene).add(im);
    return { mesh: im, base: list.map(([, mm]) => mm), idx };
  });
  // inflow parts per canal, in a group that the frame loop keeps on that canal's surface; they join the same dry switch
  S.tex.ringIn = ft.ring.clone(); S.tex.ringIn.needsUpdate = true;
  const dipMat = new THREE.MeshBasicMaterial({ color: C(0x0c1f1d), vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false });
  const inMat = ringMat.clone(); inMat.map = S.tex.ringIn; inMat.opacity = 0.55;
  S.offInflow = [];
  [...new Set(inflow.map(f => f.i))].forEach(i => {
    const list = inflow.filter(f => f.i === i), g = new THREE.Group(); S.scene.add(g); S.offInflow!.push({ g, i });
    for (const [key, geo, mat, order] of [['dip', blob, dipMat, 1], ['rip', fan, inMat, 2]] as const) {
      const im = new THREE.InstancedMesh(geo, mat, list.length), idx: number[][] = ow.m.map(() => []), base = list.map(f => f[key]);
      base.forEach((mm, j) => { im.setMatrixAt(j, mm); idx[list[j].n].push(j); });
      im.frustumCulled = false; im.renderOrder = order; g.add(im); parts.push({ mesh: im, base, idx });
    }
  });
  S.offtakes = { parts, m: ow.m, on: ow.m.map(() => true) };
}

function streamMesh(pts: P[], sel: Sel | null, wWater = 1.5) {
  const M = S.M;
  ribbon(pts.map(p => [p[0], p[1], p[2] - 0.035, (wWater + 1.2) / 2]), 1, 0, M.mud, 2);
  const wm = ribbon(pts.map(p => [p[0], p[1], p[2], wWater / 2]), 1, 0, M.river, 3);
  if (sel) { wm.userData.sel = sel; S.pickables.push(wm); }
  occLine(pts, wWater / 2 + 1.0, 3); occLine(pts, wWater / 2 + 4, HB);
  T3.streams.push(pts);
  return wm;
}
/** Sungai kecil dan bendung tetap tiap sistem bendung lokal. */
export function buildLocal() {
  const M = S.M;
  T3.systems.slice(1).forEach(sy => {
    const z0 = sy.z, zc = z0 + 1.1, sel: Sel = { kind: 'gate', id: sy.src.gate };
    const ctrl = [[T3.W.x1 + 40, z0 - 9.3], [140, z0 - 9.6], [70, z0 - 8.9], [36, z0 - 8.5], [24, z0 - 6.8], [17.6, z0 - 3.6], [LOC_X, z0 - 0.4], [LOC_X, z0 + 2.4], [LOC_X - 1.4, z0 + 5], [9.5, z0 + 7.3], [riverX(z0 + 8.6) + riverHW(z0 + 8.6) + 0.2, z0 + 8.6]];
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const n = Math.ceil(curve.getLength() / 0.8), pts: P[] = [];
    for (let k = 0; k <= n; k++) { const p = curve.getPoint(k / n); const y = p.z < zc ? 0.07 : lerp(0.03, LV.down + 0.02, smooth(z0 + 5.5, z0 + 8.8, p.z)); pts.push([p.x, p.z, y]); }
    streamMesh(pts, sel, 1.5);
    const b = bld(LOC_X, 0, zc);
    b.box(M.concrete, 2.5, 0.4, 0.45, 0, 0.0, 0); b.geo(M.concrete, S.G.wedge, 0, -0.05, 0.55, 2.3, 0.3, 0.65);
    for (const s of [-1, 1]) b.box(M.concrete, 0.22, 0.5, 2.0, s * 1.2, 0.05, 0.2);
    const f = ribbon([[LOC_X, zc + 0.3], [LOC_X, zc + 1.9]], 1.6, 0.06, M.foam, 1.2); f.renderOrder = 3;
    b.pick(2.8, 0.8, 1.2, 0, 0.1, 0, sel);
    occRect(LOC_X - 2, z0 - 2, LOC_X + 3, z0 + 3, 3);
  });
}
/**
 * Situ Bagendit di ujung Inlet Situ Bagendit: waduk tampungan dengan tanggul keliling. Di puncak tanggul jalan
 * setapak berpagar dengan lampu dan bangku, lereng dalamnya pasangan batu sampai dasar waduk. Saluran masuk lewat
 * bangunan inlet beton di bawah jembatan jalan tanggul dan terjun ke waduk (air terjun, buih, dan riak sebesar debit
 * masuk). Di sisi seberang menara pengambilan dengan rumah pintu, saringan sampah, dan papan duga, dengan jembatan dari
 * tanggul. Di air ada dermaga berperahu, saung dan rakit bambu terapung, serta rumpun eceng gondok di tepi.
 */
export function buildLake() {
  if (T3.situ == null) return;
  const M = S.M, i = T3.situ, r = R[i], L = T3.lines[i], D = L.D, c = S.canal[i], lx = L.ex + 4.4, lz = L.z, sel: Sel = { kind: 'ruas', id: r.k };
  // local generator, so the shared random stream (and everything built after the lake) stays the same
  let seed = 0x3c9e51b7;
  const rn = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const wood = new THREE.MeshStandardMaterial({ color: C(0x8b6b4a), map: S.tex.noise, roughness: 0.9 });
  const bamboo = new THREE.MeshStandardMaterial({ color: C(0xb39a5c), roughness: 0.75 });
  const hullIn = new THREE.MeshStandardMaterial({ color: C(0x5a4630), roughness: 0.9 });
  // crest line of the embankment: an irregular oval, drawn straight across the canal end on the west side (a soft
  // max on x) where the canal comes in. H: crest, WL: lake level, GH: half width of the inlet through the bank
  const H = 0.37, WL = 0.15, GH = 0.62, XW = L.ex - 0.12, wz = D.hw - 0.06;
  const crest = (a: number): P => {
    const rr = 1 + 0.07 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a + 0.4), x = lx + Math.cos(a) * 5.6 * rr;
    return [(x + XW + Math.hypot(x - XW, 0.9)) / 2, lz + Math.sin(a) * 3.75 * rr];
  };
  // the line runs anticlockwise with a, so its +n (−dz, dx) points into the lake
  const inward = (a: number) => { const p = crest(a - 1e-3), q = crest(a + 1e-3), l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [-(q[1] - p[1]) / l, (q[0] - p[0]) / l]; };
  const XG = crest(Math.PI)[0], XM = XG + 0.74;
  // the embankment from one side of the inlet round to the other, ending square to the inlet walls
  const arc: P[] = []; let prev: P | null = null;
  const inGap = (p: P) => Math.abs(p[1] - lz) < GH && p[0] < lx;
  for (let k = 0; k <= 200; k++) {
    const p = crest(Math.PI + Math.PI * 2 * k / 200);
    if (prev && inGap(prev) !== inGap(p)) { const zb = lz + (p[1] > lz ? GH : -GH), t = (zb - prev[1]) / (p[1] - prev[1]); arc.push([lerp(prev[0], p[0], t), zb]); }
    if (!inGap(p)) arc.push(p);
    prev = p;
  }
  // grass outer slope, the crest path, the concrete coping, and on the inner face stone pitching down to the bed
  const dike = new THREE.Mesh(sweep(arc, [[-0.74, -0.03, 0], [-0.34, H - 0.02, 0], [-0.3, H, 1], [0.2, H, 2], [0.27, H, 2], [0.28, H - 0.02, 2]], { uvU: 1.5, uvV: 1.5, colors: [C(0x6d8a45), C(0xa99f86), C(0xbdb9ae)] }), M.embank);
  dike.castShadow = true; dike.receiveShadow = true; dike.userData.sel = sel; S.scene.add(dike); S.pickables.push(dike);
  const pitch = new THREE.Mesh(sweep(arc, [[0.275, H - 0.015], [0.76, -0.05]], { uvU: 0.45, uvV: 0.45 }), M.riprap);
  pitch.receiveShadow = true; S.scene.add(pitch);

  // water and bed: rings from the middle out to a line under the pitching (the bed out to where the pitching
  // meets it); the water keeps out of the inlet channel and shades from deep in the middle to shallow at the shore
  const NW = 160, NR = 7;
  const disc = (o: number, y: number, mat: THREE.Material, deep?: THREE.Color, shallow?: THREE.Color) => {
    const rim = Array.from({ length: NW }, (_, k) => {
      const a = k / NW * Math.PI * 2, p = crest(a), n = inward(a), z = p[1] + n[1] * o;
      return [Math.abs(z - lz) < wz && p[0] < lx ? Math.max(XM, p[0] + n[0] * o) : p[0] + n[0] * o, z];
    });
    const pos = [lx, 0, lz], uv = [0, 0], nrm = [0, 1, 0], col = deep ? [deep.r, deep.g, deep.b] : [], idx: number[] = [], cc = new THREE.Color();
    for (let j = 1; j <= NR; j++) rim.forEach(([x, z]) => {
      const t = j / NR, px = lx + (x - lx) * t, pz = lz + (z - lz) * t;
      pos.push(px, 0, pz); uv.push((px - lx) / 1.6, (pz - lz) / 1.6); nrm.push(0, 1, 0);
      if (deep) { cc.copy(deep).lerp(shallow!, t ** 2.2); col.push(cc.r, cc.g, cc.b); }
    });
    const at = (j: number, k: number) => j === 0 ? 0 : 1 + (j - 1) * NW + (k % NW);
    for (let k = 0; k < NW; k++) idx.push(0, at(1, k + 1), at(1, k));
    for (let j = 1; j < NR; j++) for (let k = 0; k < NW; k++) idx.push(at(j, k), at(j, k + 1), at(j + 1, k), at(j + 1, k), at(j, k + 1), at(j + 1, k + 1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (deep) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.position.y = y; m.receiveShadow = true; S.scene.add(m); return m;
  };
  disc(0.72, 0.006, new THREE.MeshStandardMaterial({ color: C(0x3d3b2d), map: S.tex.noise, roughness: 1 }));
  const water = disc(0.46, WL, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.07, metalness: 0.05, normalMap: S.tex.wn, normalScale: new THREE.Vector2(0.14, 0.14), envMapIntensity: 0.7, transparent: true, opacity: 0.9 }), C(0x2a4b4b), C(0x607d68));
  water.userData.sel = sel; S.pickables.push(water);

  // inlet: the canal runs on through the bank in a concrete channel under a slab bridge that carries the crest
  // path over it, with a staff gauge inside and wing walls sloping down the inner face with the pitching
  const b = bld(0, 0, 0), wt = GH - wz;
  b.box(M.concrete, XM + 0.12 - L.ex, 0.08, 2 * GH, (L.ex + XM + 0.12) / 2, -0.01, lz);
  for (const s of [-1, 1]) {
    const zc = lz + s * (wz + wt / 2);
    b.box(M.concrete, XG + 0.27 - L.ex, H - 0.02, wt, (L.ex + XG + 0.27) / 2, (H - 0.02) / 2, zc);
    b.geo(M.concrete, S.G.wedge, (XG + 0.27 + XM) / 2, (H - 0.02) / 2, zc, wt, H - 0.02, XM - XG - 0.27, 0, Math.PI / 2, 0);
  }
  for (const k of [-1, 0, 1]) b.box(M.concreteDark, 0.06, 0.05, 0.1, XM - 0.02, 0.04, lz + k * 0.26);
  b.box(M.concrete, 0.54, 0.05, 2 * GH + 0.06, XG - 0.05, H, lz);
  for (const x of [XG - 0.29, XG + 0.19]) railing([[x, H + 0.025, lz - GH - 0.02], [x, H + 0.025, lz + GH + 0.02]], M.paint, 0.12, 0.32);
  b.box(M.gauge, 0.04, 0.28, 0.006, XG + 0.31, 0.17, lz + wz - 0.004);
  // the canal water runs on through the channel (its flow pattern carried on from the canal) and drops into the
  // lake at the mouth, with foam where it lands and rings spreading out, all as strong as the inflow (lakeTick)
  const Dp = T3.lines[r.p].D, wp = easeBends([[L.sx, L.pz! + Dp.hw + 0.34], [L.sx, L.z], [L.ex - 0.18, L.z]]), v0 = frames(wp)[wp.length - 1].dist / (D.w * 2.6);
  const fg = sweep([[L.ex - 0.18, lz], [XM, lz]], [[-(D.hw - 0.04), 0], [D.hw - 0.04, 0]], { uvU: D.w, uvV: D.w * 2.6 }), fuv = fg.attributes.uv;
  for (let k = 0; k < fuv.count; k++) fuv.setY(k, fuv.getY(k) + v0);
  const flume = new THREE.Mesh(fg, c.mat); flume.position.y = c.level; flume.receiveShadow = true; flume.userData.sel = sel; S.scene.add(flume); S.pickables.push(flume);
  const pourMat = new THREE.MeshStandardMaterial({ color: C(0x8fbcb6), map: S.tex.chute ?? null, roughness: 0.2, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const pour = new THREE.Mesh(S.G.plane, pourMat); pour.rotation.y = Math.PI / 2; pour.scale.set(2 * wz, 0.05, 1); pour.position.set(XM, WL, lz); pour.renderOrder = 2; S.scene.add(pour);
  const foamMat = M.foam.clone(); foamMat.vertexColors = true;
  const foam = new THREE.Mesh(blobGeo(), foamMat); foam.scale.set(0.5, 1, 1.05); foam.position.set(XM + 0.15, WL + 0.004, lz); foam.renderOrder = 3; S.scene.add(foam);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: S.tex.ring ?? null, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.3 });
  const rings = new THREE.Mesh(fanGeo(), ringMat); rings.rotation.y = Math.PI / 2; rings.scale.setScalar(1.6); rings.position.set(XM + 0.02, WL + 0.003, lz); rings.renderOrder = 2; S.scene.add(rings);
  S.lakeTick = () => {
    const cy = c.mesh.position.y, k = clamp((c.speed - 0.08) / 0.8, 0, 1), drop = cy - WL;
    flume.position.y = cy;
    pour.visible = k > 0.02 && drop > 0.006; pour.scale.y = Math.max(0.006, drop); pour.position.y = WL + pour.scale.y / 2;
    pourMat.opacity = 0.8 * k; foamMat.opacity = 0.75 * k; ringMat.opacity = 0.55 * k;
  };

  // name board outside the bank beside the inlet
  const brd = new THREE.Mesh(S.G.plane, new THREE.MeshStandardMaterial({ map: textTex('SITU BAGENDIT', 'Waduk · Inlet Situ Bagendit'), roughness: 0.6, side: THREE.DoubleSide }));
  const nb = bld(XG - 1.0, 0, lz + 1.8, 0.6); nb.mesh(brd, 0, 0.5, 0).scale.set(1.1, 0.31, 1);
  for (const s of [-0.5, 0.5]) nb.box(M.galv, 0.035, 0.66, 0.035, s, 0.33, -0.02);

  // outlet works on the far side: an intake tower standing in the lake with a gate house, a trash rack and a staff
  // gauge on its lake face, and a footbridge on a pier from the coping
  const pE = crest(0), nE = inward(0), tb = bld(pE[0] + nE[0] * 1.3, 0, pE[1] + nE[1] * 1.3, Math.atan2(nE[0], nE[1]));
  tb.box(M.concrete, 0.34, H + 0.04, 0.34, 0, (H + 0.04) / 2, 0);
  tb.box(M.concrete, 0.46, 0.04, 0.46, 0, H + 0.06, 0);
  tb.box(M.paint, 0.3, 0.2, 0.3, 0, H + 0.18, 0);
  tb.geo(M.blueRoof, S.G.pyr, 0, H + 0.28, 0, 0.3, 0.12, 0.3);
  tb.box(M.dark, 0.1, 0.14, 0.006, 0, H + 0.15, -0.152);
  for (const s of [-1, 1]) tb.box(M.glass, 0.006, 0.06, 0.1, s * 0.152, H + 0.2, 0);
  tb.geo(M.rack, S.G.plane, 0, 0.13, 0.172, 0.24, 0.24, 1);
  tb.box(M.gauge, 0.04, H + 0.02, 0.006, 0.13, (H + 0.02) / 2, 0.173);
  const bz0 = 0.27 - 1.3, bz1 = -0.17;
  tb.box(M.concrete, 0.22, 0.03, bz1 - bz0, 0, H + 0.015, (bz0 + bz1) / 2);
  tb.box(M.concrete, 0.1, H, 0.08, 0, H / 2, (bz0 + bz1) / 2);
  for (const s of [-1, 1]) railing([tb.at(s * 0.1, H + 0.03, bz0), tb.at(s * 0.1, H + 0.03, bz1)].map(v => [v.x, v.y, v.z]), M.paint, 0.12, 0.3);

  // jetty on the near side: a ramp from the crest path down to a deck on piles with a T head, hand rails, and two
  // boats moored at the head
  const pJ = crest(1.35), nJ = inward(1.35), ryJ = Math.atan2(nJ[0], nJ[1]), jb = bld(pJ[0], 0, pJ[1], ryJ);
  const dy = WL + 0.06, r0 = 0.2, r1 = 0.78, d1 = 1.9;
  jb.box(wood, 0.3, 0.025, Math.hypot(r1 - r0, H - dy), 0, (H + dy) / 2, (r0 + r1) / 2, Math.atan2(H - dy, r1 - r0));
  jb.box(wood, 0.3, 0.025, d1 - r1, 0, dy, (r1 + d1) / 2);
  jb.box(wood, 0.9, 0.025, 0.3, 0, dy, d1 + 0.15);
  for (let z = r1 + 0.1; z < d1; z += 0.32) for (const s of [-0.14, 0.14]) jb.cyl(M.trunk, 0.016, 0.016, dy + 0.04, 6, s, (dy + 0.04) / 2 - 0.02, z);
  for (const s of [-0.43, 0.43]) for (const z of [d1 + 0.02, d1 + 0.28]) jb.cyl(M.trunk, 0.016, 0.016, dy + 0.1, 6, s, (dy + 0.1) / 2 - 0.02, z);
  for (const s of [-1, 1]) railing([jb.at(s * 0.14, H, r0), jb.at(s * 0.14, dy, r1), jb.at(s * 0.14, dy, d1)].map(v => [v.x, v.y, v.z]), M.trunk, 0.1, 0.35);
  const boat = (p: THREE.Vector3, ry: number, hull: THREE.Material) => {
    const bb = bld(p.x, WL - 0.012, p.z, ry);
    bb.box(hull, 0.44, 0.05, 0.13, 0, 0.025, 0); bb.cyl(hull, 0.075, 0.075, 0.05, 3, 0.2575, 0.025, 0, 0, Math.PI / 2, 0);
    bb.box(hullIn, 0.4, 0.004, 0.1, 0, 0.051, 0);
    for (const x of [-0.1, 0.08]) bb.box(wood, 0.03, 0.012, 0.12, x, 0.056, 0);
  };
  boat(jb.at(-0.24, 0, d1 + 0.4), ryJ, M.gateBlue); boat(jb.at(0.26, 0, d1 + 0.4), ryJ + Math.PI + 0.08, M.red);

  // bamboo rafts floating on the lake: culms side by side tied with cross bars; the four saung stand on large ones
  // with a plank deck and a mat, two small tourist rafts carry a canopy on four poles
  const raft = (x: number, z: number, ry: number, w: number, d: number) => {
    const rb = bld(x, WL, z, ry), n = Math.round(d / 0.052);
    for (let k = 0; k < n; k++) rb.cyl(bamboo, 0.024, 0.024, w, 7, 0, 0.004, -d / 2 + (k + 0.5) * d / n, 0, 0, Math.PI / 2);
    for (const xx of [-w / 2 + 0.06, w / 2 - 0.06]) rb.box(bamboo, 0.03, 0.02, d, xx, 0.03, 0);
    return rb;
  };
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.4, sb = raft(lx + Math.cos(a) * 3, lz + Math.sin(a) * 1.8, a, 0.92, 0.52);
    sb.box(wood, 0.84, 0.02, 0.48, 0, 0.045, 0); sb.box(M.white, 0.5, 0.004, 0.3, 0, 0.057, 0);
    for (const [px, pz] of [[-0.34, -0.2], [0.34, -0.2], [-0.34, 0.2], [0.34, 0.2]]) sb.box(M.trunk, 0.03, 0.28, 0.03, px, 0.19, pz);
    sb.geo(M.tileRoof, S.G.gable, 0, 0.33, 0, 0.8, 0.16, 0.46);
  }
  for (const [x, z, ry] of [[lx + 0.6, lz - 2.1, 0.3], [lx + 3.6, lz + 1.7, -0.5]]) {
    const tr = raft(x, z, ry, 0.78, 0.4);
    for (const [px, pz] of [[-0.3, -0.16], [0.3, -0.16], [-0.3, 0.16], [0.3, 0.16]]) tr.cyl(bamboo, 0.01, 0.01, 0.22, 5, px, 0.14, pz);
    tr.box(M.blueRoof, 0.7, 0.012, 0.4, 0, 0.255, 0);
  }

  // water hyacinth in clumps along the shore, some flowering
  const hya: { x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; f: number }[] = [];
  for (const a0 of [2.45, 3.95, 4.75, 5.9]) for (let k = 0; k < 20; k++) {
    const a = a0 + (rn() - 0.5) * 0.3, p = crest(a), n = inward(a), o = 0.5 + rn() * rn() * 0.7, sx = 0.05 + rn() * 0.05;
    hya.push({ x: p[0] + n[0] * o, y: WL + 0.004, z: p[1] + n[1] * o, sx, sy: 0.02, sz: sx * (0.8 + rn() * 0.3), ry: rn() * 6.28, f: 0 });
    if (rn() < 0.2) hya.push({ x: p[0] + n[0] * o + 0.01, y: WL + 0.024, z: p[1] + n[1] * o, sx: 0.012, sy: 0.012, sz: 0.012, ry: 0, f: 1 });
  }
  inst(S.G.sphere, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), hya, t => t.f ? C(0xb49ad6) : new THREE.Color().setHSL(0.24 + rn() * 0.06, 0.45 + rn() * 0.2, 0.2 + rn() * 0.08).convertSRGBToLinear(), false);

  // along the crest: a railing on the lake side (open at the jetty and the tower bridge), street lamps on the outer
  // edge of the path, benches facing the lake between them, and trees below the outer toe on the far side (the
  // views look at the lake from the near, +z side)
  const F = frames(arc), len = F[F.length - 1].dist;
  const along = (d: number) => {
    let k = 1; while (k < F.length - 1 && F[k].dist < d) k++;
    const f0 = F[k - 1], f1 = F[k], t = clamp((d - f0.dist) / ((f1.dist - f0.dist) || 1), 0, 1), nx = -(f1.z - f0.z), nz = f1.x - f0.x, l = Math.hypot(nx, nz) || 1;
    return { x: lerp(f0.x, f1.x, t), z: lerp(f0.z, f1.z, t), nx: nx / l, nz: nz / l };
  };
  const near = (x: number, z: number, [px, pz]: P, rad: number) => Math.hypot(x - px, z - pz) < rad;
  const open = (x: number, z: number) => near(x, z, pJ, 0.3) || near(x, z, pE, 0.2);
  let run: number[][] = [];
  const flush = () => { if (run.length > 1) railing(run, M.paint, 0.12, 0.5); run = []; };
  for (let k = 0, nk = Math.ceil(len / 0.25); k <= nk; k++) {
    const q = along(len * k / nk), x = q.x + q.nx * 0.235, z = q.z + q.nz * 0.235;
    if (open(q.x, q.z)) flush(); else run.push([x, H, z]);
  }
  flush();
  for (let d = 1.3; d < len - 1; d += 2.6) {
    const q = along(d), ry = Math.atan2(q.nx, q.nz);
    if (!near(q.x, q.z, pJ, 0.7) && !near(q.x, q.z, pE, 0.7)) lampPost(q.x - q.nx * 0.27, H, q.z - q.nz * 0.27, ry, false);
    const e = along(d + 1.3);
    if (d + 1.3 < len - 1 && !near(e.x, e.z, pJ, 0.6) && !near(e.x, e.z, pE, 0.6)) {
      const bb = bld(e.x + e.nx * 0.12, H, e.z + e.nz * 0.12, Math.atan2(e.nx, e.nz));
      bb.box(wood, 0.2, 0.015, 0.06, 0, 0.05, 0); bb.box(wood, 0.2, 0.045, 0.012, 0, 0.085, -0.03);
      for (const s of [-0.08, 0.08]) bb.box(M.dark, 0.012, 0.05, 0.055, s, 0.025, 0);
    }
  }
  T3.lakeTrees = [];
  for (let d = 0.7; d < len; d += 1.45) {
    const q = along(d), x = q.x - q.nx * 1.02, z = q.z - q.nz * 1.02;
    if ((x < XG + 1.2 && Math.abs(z - lz) < 2.3) || z > lz - 0.6 || Math.abs(x - lx) > 6.8 || Math.abs(z - lz) > 4.7) continue;
    const palm = rn() < 0.4;
    T3.lakeTrees.push({ x, y: gY(x, z), z, s: 0.45 + rn() * 0.2, ry: rn() * 6.28, rz: palm ? (rn() - 0.5) * 0.16 : undefined, palm });
  }
  occRect(lx - 7, lz - 4.8, lx + 7, lz + 4.8, 3); occRect(lx - 7.5, lz - 5.3, lx + 7.5, lz + 5.3, HB);
  T3.lake = [lx, lz];
}

/**
 * Pintu sorong di mulut saluran, seperti model di jendela detail pintu: dinding samping beton dengan alur baja, daun
 * biru dengan rusuk penguat di muka hilir, lantai kerja di atas pilar, dan di atasnya dudukan dengan roda putar dan
 * stang ulir (pintu saluran primer: rumah motor di atas tiang), papan nama di muka lantai kerja, dan peilschaal di
 * hulu dan hilir. Lokal +z mengarah ke hilir.
 */
let gateMats: { blue: THREE.MeshStandardMaterial; blueDark: THREE.MeshStandardMaterial } | null = null;
function gateModel(G: Gate, x: number, z: number, ry: number, D: CanalDims, z0 = 0.035) {
  const M = S.M, b = bld(x, 0, z, ry), hw = D.hw, T = D.T, deck = T + 0.7, sel: Sel = { kind: 'gate', id: G.id }, r = R[G.ri], motor = r.type === 'P';
  if (!gateMats) gateMats = {
    blue: new THREE.MeshStandardMaterial({ color: C(0x2f6fb5), roughness: 0.45, metalness: 0.3 }),
    blueDark: new THREE.MeshStandardMaterial({ color: C(0x1f4f8f), roughness: 0.5, metalness: 0.3 }),
  };
  const { blue, blueDark } = gateMats, wt = 0.16, py = T + 0.06, ph = deck - 0.08 - py;
  // gate section: side walls with a steel guide channel in each face, a sill under the leaf, pillars up to the deck
  for (const s of [-1, 1]) {
    b.box(M.concrete, wt, py, 1.0, s * (hw + wt / 2), py / 2, 0);
    b.box(M.concrete, 0.22, ph, 0.34, s * (hw + 0.11), py + ph / 2, 0);
    b.box(M.dark, 0.03, deck - 0.08, 0.07, s * (hw + 0.008), (deck - 0.08) / 2, 0);
  }
  b.box(M.concreteDark, D.w, 0.03, 0.08, 0, 0.015, 0);
  b.box(M.concrete, D.w + 0.7, 0.08, 0.5, 0, deck - 0.04, 0);
  // staff gauges on the left wall face, upstream and downstream of the leaf
  for (const zz of [-0.38, 0.4]) b.box(M.gauge, 0.012, T, 0.05, -hw + 0.006, T / 2 + 0.01, zz);
  // leaf: plate with three horizontal and three vertical stiffeners on its downstream face
  const leafH = T - 0.03, lw = D.w + 0.03, lg = new THREE.Group();
  const part = (g: THREE.BufferGeometry, m: THREE.Material, px: number, pyy: number, pz: number) => { const o = new THREE.Mesh(g, m); o.position.set(px, pyy, pz); o.castShadow = true; lg.add(o); };
  part(boxG(lw, leafH, 0.04), blue, 0, 0, 0);
  for (let k = 1; k <= 3; k++) part(boxG(lw, 0.035, 0.03), blueDark, 0, leafH * (k / 4 - 0.5), 0.035);
  for (const fx of [-1 / 3, 0, 1 / 3]) part(boxG(0.035, leafH, 0.03), blueDark, lw * fx, 0, 0.035);
  const leaf = b.mesh(lg, 0, leafH / 2 + 0.03, 0);
  let rodTop: number, pickH: number;
  if (motor) {
    // electric hoist: two posts carrying the blue motor housing over the deck, motor and gearbox on the deck
    for (const s of [-1, 1]) b.box(M.white, 0.09, 0.62, 0.09, s * (hw + 0.22), deck + 0.31, 0.12);
    b.box(blue, D.w + 0.7, 0.16, 0.44, 0, deck + 0.7, 0.05);
    b.box(blueDark, D.w + 0.76, 0.03, 0.5, 0, deck + 0.795, 0.05);
    b.cyl(M.steel, 0.05, 0.05, 0.16, 12, -0.13, deck + 0.07, -0.1, 0, 0, Math.PI / 2);
    b.box(M.steel, 0.12, 0.12, 0.12, 0.03, deck + 0.06, -0.1);
    b.box(M.dark, 0.12, 0.1, 0.12, 0, deck + 0.05, 0);
    rodTop = deck + 0.2; pickH = deck + 0.85;
  } else {
    // manual hoist: base plate and pedestal with the handwheel lying flat on top
    b.box(M.dark, 0.2, 0.03, 0.2, 0, deck + 0.015, 0);
    b.box(M.dark, 0.13, 0.22, 0.13, 0, deck + 0.14, 0);
    b.geo(M.yellow, S.G.torus, 0, deck + 0.3, 0, 1.6, 1.6, 1.6, Math.PI / 2, 0, 0);
    for (let k = 0; k < 4; k++) b.box(M.yellow, 0.4, 0.016, 0.016, 0, deck + 0.3, 0, 0, k * Math.PI / 4, 0);
    b.cyl(M.yellow, 0.03, 0.03, 0.04, 10, 0, deck + 0.3, 0);
    rodTop = deck + 0.36; pickH = deck + 0.5;
  }
  // rising spindle from the top of the leaf through the hoist
  const rl = rodTop - T, rod = b.mesh(new THREE.Mesh(boxG(0.03, rl, 0.03), M.galv), 0, T + rl / 2, 0);
  const pw = motor ? Math.min(D.w + 0.5, 1.3) : 0.62;
  const plate = b.mesh(new THREE.Mesh(S.G.plane, new THREE.MeshStandardMaterial({ map: textTex(r.n.length > 18 ? r.k : r.n, r.s || r.k), roughness: 0.6 })), 0, motor ? deck + 0.7 : deck - 0.04, motor ? 0.273 : 0.252);
  plate.scale.set(pw, motor ? 0.14 : 0.075, 1);
  b.pick(D.w + 1.0, pickH, 1.1, 0, pickH / 2, 0, sel);
  S.gates[G.id] = { parts: [{ m: leaf, y0: leaf.position.y, lift: leafH * 0.95 }, { m: rod, y0: rod.position.y, lift: leafH * 0.95 }], cur: sim.open[G.id] / 100, target: sim.open[G.id] / 100 };
  // white water where the flow comes out under the leaf (local +z is downstream), churning at the leaf and thinning
  // out downstream; the frame loop keeps it on the canal surface and scales it with the opening and the flow
  const fw = D.w - 0.1, fL = Math.min(1.2, 0.55 + D.w * 0.3), NS = 8, pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  for (let k = 0; k <= NS; k++) {
    const t = k / NS, zz = z0 + t * fL, al = t < 0.12 ? 0.55 + t / 0.12 * 0.45 : (1 - (t - 0.12) / 0.88) ** 1.6;
    for (const s of [-1, 1]) { pos.push(s * fw / 2, 0, zz); uv.push((s + 1) / 2 * fw / 0.45, zz / 0.45); col.push(1, 1, 1, al); }
    if (k) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); fg.setIndex(idx); fg.computeVertexNormals();
  if (!S.tex.gateFoam) { S.tex.gateFoam = S.tex.foam.clone(); S.tex.gateFoam.needsUpdate = true; }
  const fm = M.foam.clone(); fm.map = S.tex.gateFoam; fm.vertexColors = true; fm.opacity = 0;
  const foam = new THREE.Mesh(fg, fm); foam.position.set(x, 0, z); foam.rotation.y = ry; foam.renderOrder = 2; foam.visible = false; S.scene.add(foam);
  S.gateFlow.push({ m: foam, mat: fm, i: G.ri, id: G.id });
}
export function buildGates() {
  const M = S.M;
  S.gateFlow = [];
  // supplementary feeders: short creek with a small weir, lined feeder into the canal
  Object.keys(T3.lines).map(Number).forEach(i => {
    const L = T3.lines[i];
    R[i].sk.items.forEach(it => {
      if (it.kind !== 'in') return;
      const v = R[it.c], Dv = canalDims(v), cx = (it.x + SLOT_IN / 2) * U + OX, cz = L.z - 4.45, D = L.D;
      const sel: Sel = { kind: 'gate', id: v.gate! }, b = bld(cx, 0, cz);
      streamMesh([[cx - 2.25, cz - 0.05, 0.05], [cx - 0.8, cz, 0.06], [cx + 0.8, cz, 0.04], [cx + 2.25, cz + 0.05, 0.04]], sel, 0.8);
      for (const s of [-1, 1]) { b.box(M.concrete, 0.3, 0.4, 1.4, s * 2.35, 0.12, 0); b.box(M.dark, 0.02, 0.22, 0.6, s * 2.19, 0.1, 0); }
      b.box(M.concrete, 0.22, 0.2, 1.0, -0.8, 0.06, 0); const f = ribbon([[cx - 0.65, cz], [cx + 0.2, cz]], 0.8, 0.075, M.foam, 1); f.renderOrder = 3;
      const fpts: P[] = [[cx, cz + 0.42], [cx, L.z - D.hw + 0.05]], prof = canalProfile(Dv);
      const emb = new THREE.Mesh(sweep(fpts, prof, { uvU: 1.5, uvV: 1.5, colors: CANAL_COL() }), M.embank); emb.castShadow = emb.receiveShadow = true; emb.userData.sel = sel; S.scene.add(emb); S.pickables.push(emb);
      const tex = flowTextures().flow.clone(); tex.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({ color: C(0x4f8a86), map: tex, normalMap: S.tex.wn, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.2, envMapIntensity: 0.55, transparent: true, opacity: 0.93 });
      const gz = cz + 1.05, wm = new THREE.Mesh(sweep([[cx, gz], [cx, L.z - D.hw + 0.02]], [[-(Dv.hw - 0.04), 0], [Dv.hw - 0.04, 0]], { uvU: Dv.w, uvV: Dv.w * 2.6 }), mat);
      wm.position.y = Dv.T * 0.6; wm.userData.sel = sel; S.scene.add(wm); S.pickables.push(wm);
      S.canal[v.i] = { mat, tex, mesh: wm, D: Dv, speed: 0.3, level: Dv.T * 0.6 };
      T3.feeder[v.i] = { x: cx, gz, D: Dv }; T3.inflow[v.i] = [cx, gz];
      occRect(cx - 2.6, cz - 0.9, cx + 2.6, L.z, 3);
    });
  });
  GATES.forEach(G => {
    if (G.id === 'g-intake' || G.w) return;
    const r = R[G.ri];
    if (G.kind === 'lokal') { const L = T3.lines[G.ri]; if (!L) return; gateModel(G, L.sx + 0.45, L.z, Math.PI / 2, L.D, 0.32); G.pos3 = [L.sx + 0.45, L.z]; return; }
    if (r.via) { const f = T3.feeder[G.ri]; if (!f) return; gateModel(G, f.x, f.gz, 0, f.D); G.pos3 = [f.x, f.gz]; return; }
    const L = T3.lines[G.ri]; if (!L || L.pz == null) return;
    const gz = L.pz + T3.lines[r.p].D.hw + 0.34;
    gateModel(G, L.sx, gz, 0, L.D); G.pos3 = [L.sx, gz];
  });
}
