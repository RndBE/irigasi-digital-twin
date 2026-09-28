import { R, ROOT, ROOTS, SOURCES, VIA, byName, mainOf } from '../domain/network';
import { distAlongTo } from '../domain/geometry';
import type { Pt, Ruas, SchemeItem, Station } from '../domain/types';
import { LOC_X, OX, RIV0, T3, U, WEIR_HW, type CanalDims, type SchemeSystem } from './context';

/**
 * Tata letak skema jaringan, dasar diorama 3D.
 *
 * Jaringan diletakkan seperti skema irigasi biasa: tiap saluran primer/sekunder satu garis lurus, sadap berderet
 * sesuai urutan aslinya (jarak di sepanjang saluran), petak tersier di tebing kiri (jauh) atau kanan (dekat), dan
 * cabang sekunder turun ke barisnya sendiri. Satuan skema piksel; adegan 3D memakai `U` satuan per piksel.
 */
export const SLOT_T = 36, SLOT_L = 38, SLOT_IN = 46;
const ABOVE = 42, BELOW = 42, BAND = 92, ROWGAP = 16;

const lineDesc = new Map<number, boolean>();
const hasLineDesc = (i: number): boolean => { if (lineDesc.has(i)) return lineDesc.get(i)!; const v = R[i].ck.some(c => R[c].type !== 'T' || hasLineDesc(c)); lineDesc.set(i, v); return v; };
const isLine = (i: number) => ROOTS.includes(i) || R[i].type !== 'T' || hasLineDesc(i);
function sideOf(r: Ruas): 'up' | 'down' | null {
  const t = r.n.split(/[.,\s]+/).filter(x => x === 'Ki' || x === 'Ka');
  return t.length ? (t[t.length - 1] === 'Ki' ? 'up' : 'down') : null;
}
const boxMembers = (c: number): number[] => { const out = [c]; R[c].ck.forEach(k => out.push(...boxMembers(k))); return out; };
function itemsOf(i: number): SchemeItem[] {
  const r = R[i], main = mainOf(i), items: SchemeItem[] = [];
  const item = (kind: SchemeItem['kind'], c: number, d: number): SchemeItem => ({ kind, c, d, x: 0, members: [], side: 'up' });
  r.ck.forEach(c => items.push(item(isLine(c) ? 'line' : 'box', c, distAlongTo(main, mainOf(c)[0]))));
  VIA.forEach(v => { if (R[v].into === i) { const vm = mainOf(v); items.push(item('in', v, distAlongTo(main, vm[vm.length - 1]))); } });
  items.sort((a, b) => a.d - b.d);
  if (r.type === 'T' && r.own0 > 0) items.push(item('self', i, 1e9));
  return items;
}
function layX(i: number, x0: number) {
  const r = R[i], items = itemsOf(i);
  r.sk = { sx: x0, items, pad: Math.max(96, r.n.length * 6.4 + 46), ex: 0, maxX: 0, dy: 0, h: 0, y: 0, py: null };
  let x = x0 + r.sk.pad, alt = 0;
  items.forEach(it => {
    it.x = x;
    if (it.kind === 'line') { layX(it.c, x); x += SLOT_L; }
    else if (it.kind === 'in') x += SLOT_IN;
    else { it.members = it.kind === 'self' ? [i] : boxMembers(it.c); it.side = (it.kind === 'box' && sideOf(R[it.c])) || (alt++ % 2 ? 'down' : 'up'); x += SLOT_T * it.members.length; }
  });
  r.sk.ex = x + 14;
  r.sk.maxX = Math.max(r.sk.ex + (r.situ ? 90 : 40), ...items.filter(it => it.kind === 'line').map(it => R[it.c].sk.maxX));
}
function layY(i: number): number {
  const r = R[i], placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  r.sk.items.filter(it => it.kind === 'line').reverse().forEach(it => {
    const c = R[it.c], h = layY(it.c), x0 = c.sk.sx - 12, x1 = c.sk.maxX + 12;
    const cands = [BAND, ...placed.map(p => p.y1 + ROWGAP + ABOVE)].sort((a, b) => a - b);
    const y = cands.find(yy => placed.every(p => x1 < p.x0 || x0 > p.x1 || yy + h < p.y0 || yy - ABOVE > p.y1))!;
    c.sk.dy = y; placed.push({ x0, x1, y0: y - ABOVE, y1: y + h });
  });
  r.sk.h = Math.max(BELOW, ...placed.map(p => p.y1));
  return r.sk.h;
}
function assignY(i: number, y: number, py: number | null) { const r = R[i]; r.sk.y = y; r.sk.py = py; r.sk.items.forEach(it => { if (it.kind === 'line') assignY(it.c, y + R[it.c].sk.dy, y); }); }

/** Jelajahi saluran (bukan tersier dalam kotak) di bawah akar `i`. */
export const walkLines = (i: number, f: (i: number) => void) => { f(i); R[i].sk.items.forEach(it => { if (it.kind === 'line') walkLines(it.c, f); }); };

const SK = { systems: null as SchemeSystem[] | null, cw: 0, ch: 0 };
export function computeLayout(): SchemeSystem[] {
  if (SK.systems) return SK.systems;
  const systems: SchemeSystem[] = [{ root: ROOT, src: SOURCES[0], y: 0 }, ...SOURCES.filter(s => s.kind === 'lokal').map(s => ({ root: s.ri, src: s, y: 0 }))];
  let top = 96;
  systems.forEach(sy => { layX(sy.root, 150); layY(sy.root); assignY(sy.root, top, null); sy.y = top; top += R[sy.root].sk.h + 150; });
  let maxX = 0; systems.forEach(sy => walkLines(sy.root, i => { maxX = Math.max(maxX, R[i].sk.maxX); }));
  SK.cw = maxX + 60; SK.ch = top - 40; SK.systems = systems;
  return systems;
}

/** Posisi stasiun di skema (piksel), dekat bangunan tempat alatnya dipasang. */
export function stationPx(stn: Station): Pt | null {
  const systems = computeLayout(), main = systems[0];
  if (stn.id === 'AWLR-CMK-01') return [70, main.y - 44];
  if (stn.id === 'AWLR-CPG-02') return [104, main.y - 26];
  if (stn.id === 'ARR-CPG-16') return [36, main.y + 30];
  if (stn.id === 'AWLR-BCP-04') { const s = R[ROOT].sk; return [s.ex + 12, s.y]; }
  if (stn.id === 'AWLR-CPC-17') { const sy = systems.find(x => x.root === R[stn.ri!].sys)!; return [104, sy.y - 26]; }
  if (stn.type === 'ARR') { const s = R[byName('SS Leuwigoong')].sk; return [s.ex + 14, s.y - 26]; }
  if (stn.id.startsWith('AWLR-U')) { const s = R[stn.ri!].sk; return [s.ex + 12, s.y]; }
  if (stn.ri != null) { const s = R[stn.ri].sk; return [s.sx + s.pad - 14, s.y]; }
  return null;
}

/** Ukuran penampang saluran di diorama menurut jenisnya. */
export function canalDims(r: Ruas): CanalDims {
  const t = r.type, w = t === 'P' ? 2.0 : t === 'S' ? 1.2 : t === 'U' ? 1.0 : 0.7;
  const T = t === 'P' ? 0.5 : t === 'S' ? 0.44 : 0.36, road = t === 'P' || t === 'S' ? 0.6 : 0, b = 0.28, s = 0.34;
  return { w, hw: w / 2, T, road, b, s, outUp: w / 2 + b + road + s, outDn: w / 2 + b + s };
}

/** Isi `T3` dari tata letak skema. */
export function layout3d() {
  const systems = computeLayout(), main = systems[0];
  T3.weirZ = main.y * U + 2.4;
  T3.mainBottom = (main.y + R[ROOT].sk.h) * U;
  T3.maxX = SK.cw * U + OX; T3.maxZ = SK.ch * U;
  T3.lines = {};
  systems.forEach(sy => walkLines(sy.root, i => {
    const s = R[i].sk;
    T3.lines[i] = { sx: s.sx * U + OX, ex: s.ex * U + OX, z: s.y * U, pz: s.py == null ? null : s.py * U, root: ROOTS.includes(i), pad: s.pad * U, D: canalDims(R[i]) };
  }));
  const zw = T3.weirZ;
  // sediment trap: its three bays line up with the three intake gates, all upstream of the end pier of the weir
  T3.KL = { x0: RIV0 + WEIR_HW, x1: 24.6, z0: zw - 8.45, z1: zw - 1.45 };
  T3.zA = T3.KL.z0 - 1; T3.zB = zw + 6.5;
  T3.lines[ROOT].sx = 28;
  T3.systems = systems.map(sy => ({ ...sy, z: sy.y * U }));
  T3.systems.slice(1).forEach(sy => { T3.lines[sy.root].sx = LOC_X + 1.35; });
  T3.W = { x0: -46, x1: T3.maxX + 24, z0: -30, z1: T3.maxZ + 26 };
  T3.plot = {}; T3.inflow = {}; T3.feeder = {}; T3.cseg = []; T3.streams = [];
}
/** Titik tengah (atau 26 satuan dari hulu) sebuah saluran. */
export function lineMid(i: number): Pt | null { const L = T3.lines[i]; return L ? [L.sx + Math.min(26, (L.ex - L.sx) / 2), L.z] : null; }
