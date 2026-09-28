import * as THREE from 'three';
import { clamp, lerp, smooth } from '../lib/format';
import { rnd } from '../lib/random';
import { R, ROOT, ROOTS } from '../domain/network';
import { GATES } from '../domain/gates';
import { sim } from '../domain/state';
import type { Gate, Sel } from '../domain/types';
import { C, LOC_X, LV, OX, S, T3, U, riverHW, riverX, type CanalDims, type P } from './context';
import { M4, addStatic, bld, boxG, frames, inst, mergeGeos, ribbon, sweep, type Frame, type ProfPt } from './geometry';
import { SLOT_IN, SLOT_T, canalDims } from './layout';
import { HB, occLine, occRect } from './occupancy';
import { lampPost } from './props';
import { textTex } from './textures';

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
    const pts: P[] = [...start, ...mids.filter(x => x > L.sx + 0.1 && x < L.ex - 0.1).sort((a, b) => a - b).map(x => [x, L.z]), [L.ex, L.z]];
    const hs = holes.map(hh => ({ d0: lv + hh.x - hh.h - L.sx - 0.01, d1: lv + hh.x + hh.h - L.sx + 0.01, side: hh.side }));
    const emb = new THREE.Mesh(sweep(pts, prof, { uvU: 1.5, uvV: 1.5, holes: hs, colors: cols }), M.embank);
    emb.castShadow = true; emb.receiveShadow = true; emb.userData.sel = { kind: 'ruas', id: r.k }; S.scene.add(emb); S.pickables.push(emb);
    const F = frames(pts), fe = F[F.length - 1]; fe.hw = D.hw;
    if (!r.situ) { endCap(fe, prof, false); endCap(fe, prof, true); }
    // bridges of the inspection road over feeder channels
    holes.filter(hh => hh.feed && D.road).forEach(hh => { S.pend.push([hh.x, D.T - 0.03, L.z - (D.hw + D.b + D.road / 2), hh.h * 2 + 0.3, D.road + 0.1]); });
    // water surface, starting after the gate of a branch
    const gz = !L.root && L.pz != null ? L.pz + T3.lines[r.p].D.hw + 0.34 : null;
    const wpts: P[] = gz != null ? [[L.sx, gz], [L.sx, L.z], [L.ex - 0.18, L.z]] : [[L.sx + (ROOTS.includes(i) && i !== ROOT ? 0.75 : 0), L.z], [L.ex - 0.18, L.z]];
    const tex = S.tex.streak.clone(); tex.needsUpdate = true;
    const mat = waterMat(tex);
    const wm = new THREE.Mesh(sweep(wpts, [[-(D.hw - 0.04), 0], [D.hw - 0.04, 0]], { uvU: D.w, uvV: D.w * 2.6 }), mat);
    wm.position.y = D.T * 0.6; wm.receiveShadow = true; wm.userData.sel = { kind: 'ruas', id: r.k }; S.scene.add(wm); S.pickables.push(wm);
    S.canal[i] = { mat, tex, mesh: wm, D, speed: 0.3, level: D.T * 0.6 };
    // mouth patch between the parent channel and the gate
    if (gz != null) {
      const Dp = T3.lines[r.p].D, mm = new THREE.Mesh(sweep([[L.sx, L.pz! + Dp.hw - 0.12], [L.sx, gz - 0.03]], [[-(D.hw - 0.04), 0], [D.hw - 0.04, 0]], { uvU: 1, uvV: 1 }), mat);
      mm.position.y = D.T * 0.6; S.scene.add(mm); S.mouths.push({ m: mm, p: r.p });
    }
    for (let k = 1; k < pts.length; k++) T3.cseg.push({ a: pts[k - 1], b: pts[k], out: Math.max(D.outUp, D.outDn), T: D.T });
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

export function buildPlots() {
  const M = S.M, plots: { x: number; y: number; z: number; sx: number; sy: number; sz: number; m: number }[] = [], ditches: typeof plots = [];
  Object.keys(T3.lines).map(Number).forEach(i => {
    const r = R[i], L = T3.lines[i], D = L.D, b = bld(0, 0, 0);
    r.sk.items.forEach(it => {
      if (it.kind === 'line' || it.kind === 'in') return;
      const dir = it.side === 'up' ? -1 : 1, off0 = (dir < 0 ? D.outUp : D.outDn) + 0.12;
      it.members.forEach((m, k) => {
        const rr = R[m], cx = (it.x + SLOT_T * k + SLOT_T / 2) * U + OX, rows = clamp(Math.ceil(rr.A / 30), 1, 3);
        const pitch = Math.min(1.0, (4.15 - off0) / rows), pd = pitch - 0.02;
        for (let row = 0; row < rows; row++) for (const ox of [-0.84, 0.84]) plots.push({ x: cx + ox, y: 0, z: L.z + dir * (off0 + pitch * (row + 0.5)), sx: 1.6, sy: 1, sz: pd, m });
        const z0 = L.z + dir * (D.hw + D.b + D.road * (dir < 0 ? 1 : 0)), z1 = L.z + dir * (off0 + pitch * rows);
        ditches.push({ x: cx, y: 0.035, z: (z0 + z1) / 2, sx: 0.08, sy: 0.03, sz: Math.abs(z1 - z0), m });
        b.box(M.concrete, 0.32, D.T + 0.05, 0.3, cx, (D.T + 0.05) / 2, L.z + dir * (D.hw + D.b * 0.6));
        b.box(M.steel, 0.2, 0.2, 0.03, cx, D.T - 0.1, L.z + dir * (D.hw - 0.01));
        T3.plot[m] = [cx, L.z + dir * (off0 + pitch * rows / 2)];
        occRect(cx - 1.65, Math.min(L.z, z1 + dir * 0.2), cx + 1.65, Math.max(L.z, z1 + dir * 0.2), 3);
      });
    });
  });
  const pg = new THREE.BoxGeometry(1, 0.05, 1); pg.translate(0, 0.025, 0);
  const fg = mergeGeos([[0, 0.5], [0, -0.5], [0.5, 0], [-0.5, 0]].map(([x, z]) => ({ g: S.G.box, m: M4(x, 0.05, z, 0, 0, 0, x ? 0.045 : 1.045, 0.1, z ? 0.07 : 1.07) })));
  S.cells = new THREE.Group(); S.scene.add(S.cells);
  const pim = inst(pg, M.plot, plots, () => new THREE.Color(1, 1, 1), false)!;
  pim.receiveShadow = true; pim.userData.plots = true; S.scene.remove(pim); S.cells.add(pim); S.pickables.push(pim); S.plots = pim;
  plots.forEach((p, k) => { S.plotOf[k] = p.m; S.plotVary[k] = 0.9 + rnd() * 0.18; });
  const bim = inst(fg, M.bund, plots.map(p => ({ ...p, sx: 1.62, sz: p.sz + 0.03 })), null, false)!; S.scene.remove(bim); S.cells.add(bim);
  const dim = inst(S.G.box, M.ditch, ditches, null, false)!; S.scene.remove(dim); S.cells.add(dim);
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
/** Situ Bagendit di ujung Inlet Situ Bagendit, dengan saung di tepinya. */
export function buildLake() {
  if (T3.situ == null) return;
  const L = T3.lines[T3.situ], lx = L.ex + 4.4, lz = L.z, sel: Sel = { kind: 'ruas', id: R[T3.situ].k };
  const ring = (sx: number, sz: number, jig: number) => { const s = new THREE.Shape(); for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, rr = 1 + 0.1 * Math.sin(3 * a + 1) + 0.07 * Math.sin(5 * a + jig); const x = Math.cos(a) * sx * rr, z = Math.sin(a) * sz * rr; if (k) s.lineTo(x, -z); else s.moveTo(x, -z); } return s; };
  const mk = (shape: THREE.Shape, y: number, mat: THREE.Material) => { const g = new THREE.ShapeGeometry(shape, 2); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3.5, uv.getY(i) / 3.5); const m = new THREE.Mesh(g, mat); m.position.set(lx, y, lz); m.receiveShadow = true; S.scene.add(m); return m; };
  mk(ring(6.2, 4.1, 0.4), 0.012, new THREE.MeshStandardMaterial({ color: C(0x9d9272), map: S.tex.noise, roughness: 1 }));
  const lake = mk(ring(5.5, 3.5, 0.4), 0.03, S.M.lake); lake.userData.sel = sel; S.pickables.push(lake);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + 0.4, x = lx + Math.cos(a) * 3, z = lz + Math.sin(a) * 1.8, b = bld(x, 0.04, z, a);
    b.box(S.M.trunk, 0.8, 0.05, 0.45, 0, 0.02, 0); for (const [px, pz] of [[-0.3, -0.16], [0.3, -0.16], [-0.3, 0.16], [0.3, 0.16]]) b.box(S.M.trunk, 0.03, 0.3, 0.03, px, 0.18, pz);
    b.geo(S.M.tileRoof, S.G.gable, 0, 0.33, 0, 0.75, 0.16, 0.42);
  }
  occRect(lx - 7, lz - 4.8, lx + 7, lz + 4.8, 3); occRect(lx - 7.5, lz - 5.3, lx + 7.5, lz + 5.3, HB);
  T3.lake = [lx, lz];
}

/** Pintu sorong di mulut saluran: pilar, daun baja, stang ulir dengan roda putar, papan nama, dan peilschaal. */
function gateModel(G: Gate, x: number, z: number, ry: number, D: CanalDims) {
  const M = S.M, b = bld(x, 0, z, ry), hw = D.hw, T = D.T, top = T + 0.7, sel: Sel = { kind: 'gate', id: G.id }, r = R[G.ri];
  for (const s of [-1, 1]) {
    b.box(M.concrete, 0.36, T + 0.08, 0.9, s * (hw + 0.18), (T + 0.08) / 2, 0);
    b.box(M.concrete, 0.2, top - T + 0.02, 0.26, s * (hw + 0.1), T + (top - T) / 2, 0);
    b.box(M.steel, 0.05, top - 0.02, 0.09, s * (hw + 0.005), top / 2, 0);
  }
  b.box(M.concrete, D.w + 0.62, 0.1, 0.36, 0, top + 0.05, 0);
  b.box(M.dark, 0.14, 0.12, 0.14, 0, top + 0.16, 0);
  b.geo(M.yellow, S.G.torus, 0, top + 0.27, 0, 1, 1, 1, Math.PI / 2, 0, 0);
  b.box(M.gauge, 0.07, T + 0.06, 0.012, hw - 0.07, (T + 0.06) / 2 + 0.01, 0.46);
  const leafH = T - 0.03;
  const leaf = b.mesh(new THREE.Mesh(boxG(D.w + 0.06, leafH, 0.05), M.steel), 0, leafH / 2 + 0.03, 0); leaf.castShadow = true;
  const rod = b.mesh(new THREE.Mesh(boxG(0.035, 0.9, 0.035), M.galv), 0, leafH + 0.48, 0);
  const plate = b.mesh(new THREE.Mesh(S.G.plane, new THREE.MeshStandardMaterial({ map: textTex(r.n.length > 18 ? r.k : r.n, r.s || r.k), roughness: 0.6 })), 0, top + 0.05, 0.185);
  plate.scale.set(0.62, 0.17, 1);
  b.pick(D.w + 1.0, top + 0.5, 1.1, 0, (top + 0.5) / 2, 0, sel);
  S.gates[G.id] = { parts: [{ m: leaf, y0: leaf.position.y, lift: leafH * 0.95 }, { m: rod, y0: rod.position.y, lift: leafH * 0.95 }], cur: sim.open[G.id] / 100, target: sim.open[G.id] / 100 };
}
export function buildGates() {
  const M = S.M;
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
      const tex = S.tex.streak.clone(); tex.needsUpdate = true;
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
    if (G.kind === 'lokal') { const L = T3.lines[G.ri]; if (!L) return; gateModel(G, L.sx + 0.45, L.z, Math.PI / 2, L.D); G.pos3 = [L.sx + 0.45, L.z]; return; }
    if (r.via) { const f = T3.feeder[G.ri]; if (!f) return; gateModel(G, f.x, f.gz, 0, f.D); G.pos3 = [f.x, f.gz]; return; }
    const L = T3.lines[G.ri]; if (!L || L.pz == null) return;
    const gz = L.pz + T3.lines[r.p].D.hw + 0.34;
    gateModel(G, L.sx, gz, 0, L.D); G.pos3 = [L.sx, gz];
  });
}
