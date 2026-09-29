import raw from '../data/leuwigoong.json';
import type { Group, Line, NetworkData, Pt, Ruas, Source } from './types';

/**
 * Jaringan D.I. Leuwigoong siap pakai: ruas diberi turunan (jenis, anak dalam pohon, kebutuhan kumulatif,
 * kapasitas), sumber air, dan kelompok layanan.
 *
 * Kebutuhan air per tersier berasal dari notebook WMS; kebutuhan saluran di atasnya dijumlah dari hilir ke hulu
 * dengan efisiensi saluran pembawa 0,9. Ruas di luar pohon SI Copong ikut bila berakar di bendung lokal atau
 * menjadi saluran suplesi.
 */
/**
 * Bendung lokal yang dikeluarkan dari twin: Cipacing (SS Pasir Laja), Genteng Cipacing, dan Pangkalan. Ketiganya
 * sistem sendiri di luar layanan Bendung Copong. Ruasnya, bangunan yang hanya melayani ruas itu, dan catatan
 * perbaikan topologinya dibuang saat data dimuat, dan indeks ruas lain dipetakan ulang, jadi simulasi, pintu,
 * stasiun, halaman data, dan adegan 3D tidak melihatnya lagi. Hapus namanya dari daftar untuk memunculkannya lagi.
 * API backend memakai daftar yang sama (backend/src/index.js).
 */
export const DROP_SRC = ['Bendung Cipacing', 'Bendung Genteng Cipacing', 'BD. PANGKALAN'];
function prune(d: NetworkData): NetworkData {
  const ru = d.ruas, kids: number[][] = ru.map(() => []), drop = new Uint8Array(ru.length);
  ru.forEach((r, i) => { if (r.p >= 0) kids[r.p].push(i); });
  const walk = (i: number) => { drop[i] = 1; kids[i].forEach(walk); };
  ru.forEach((r, i) => { if (r.p < 0 && r.src && r.into == null && DROP_SRC.includes(r.src)) walk(i); });
  const idx = new Int32Array(ru.length).fill(-1); let n = 0;
  ru.forEach((_, i) => { if (!drop[i]) idx[i] = n++; });
  const gone = new Set(ru.filter((_, i) => drop[i]).map(r => r.k));
  const ruas = ru.filter((_, i) => !drop[i]).map(r => ({ ...r, p: r.p >= 0 ? idx[r.p] : r.p, into: r.into != null ? idx[r.into] : r.into }));
  // a structure goes with the dropped ruas when every ruas starting at it is dropped, and the weirs themselves go
  const keepB = d.bmeta.map(([, ids], k) => !(ids.length && ids.every(i => drop[i])) && !DROP_SRC.includes(d.bangunan[k][2]));
  return {
    ...d, ruas, fixes: d.fixes.filter(f => !gone.has(f.k)),
    bangunan: d.bangunan.filter((_, k) => keepB[k]),
    bmeta: d.bmeta.filter((_, k) => keepB[k]).map(([t, ids]) => [t, ids.filter(i => !drop[i]).map(i => idx[i])] as [string, number[]]),
  };
}
export const DATA = prune(raw as unknown as NetworkData);
export const B = DATA.bendung;
export const R: Ruas[] = DATA.ruas;
export const N = R.length;
export const JLABEL: Record<string, string> = { P: 'primer', S: 'sekunder', U: 'suplesi', T: 'tersier' };

R.forEach((r, i) => {
  r.i = i; r.kids = [];
  if (!r.n) r.n = 'Ruas tanpa nama ' + r.k;
  r.type = ((r.n.startsWith('Suplesi') || r.n.startsWith('Inlet')) && r.j !== 'T' ? 'U' : r.j) as Ruas['type'];
  r.situ = r.n.startsWith('Inlet Situ');
  r.via = r.into != null;
  r.D0 = r.D;
});
R.forEach(r => { if (r.p >= 0) R[r.p].kids.push(r.i); });

export const RK: Record<string, Ruas> = Object.fromEntries(R.map(r => [r.k, r]));
export const FIX = Object.fromEntries(DATA.fixes.map(f => [f.k, f]));
export const byName = (n: string) => R.findIndex(r => r.n === n);
export const ROOT = byName('SI Copong');
export const LOCAL = R.filter(r => r.p < 0 && r.src && !r.via).map(r => r.i);
export const ROOTS = [ROOT, ...LOCAL];
export const VIA = R.filter(r => r.via).map(r => r.i);
/** Urutan lebar-dulu dari akar; dibalik untuk penjumlahan hilir ke hulu. */
export const ORDER: number[] = [];
{ const q = [...ROOTS]; while (q.length) { const i = q.shift()!; ORDER.push(i); R[i].kids.forEach(c => q.push(c)); } }
export const INTREE = new Uint8Array(N); ORDER.forEach(i => { INTREE[i] = 1; });
R.forEach(r => { r.ck = r.kids.filter(c => INTREE[c]); });
const ETA_CONV = 0.9;
for (let q = ORDER.length - 1; q >= 0; q--) {
  const r = R[ORDER[q]];
  const skRaw = r.ck.reduce((a, c) => a + R[c].D0, 0), sk = r.ck.reduce((a, c) => a + R[c].Dc, 0);
  if (r.type === 'T') { r.own0 = r.D0 > 0 ? Math.max(0, r.D0 - skRaw) : r.A * 0.21 / 1000; r.eta = 1; r.Dc = r.own0 + sk; }
  else if (r.situ) { r.own0 = 0; r.eta = 1; r.Dc = 0; }
  else { r.own0 = 0; r.eta = ETA_CONV; r.Dc = sk / ETA_CONV; }
  r.cap = r.situ ? 0.12 : Math.max(0.004, 2 * r.Dc);
  r.subA = r.A * (r.type === 'T' ? 1 : 0) + r.ck.reduce((a, c) => a + R[c].subA, 0);
  if (r.tH == null) r.tH = r.p >= 0 && R[r.p].tH != null ? R[r.p].tH : 1;
  if (r.tA == null) r.tA = r.p >= 0 && R[r.p].tA != null ? R[r.p].tA : 1;
}
VIA.forEach(i => { const r = R[i]; r.own0 = 0; r.eta = 1; r.Dc = 0; r.cap = 0.25; r.subA = 0; if (r.tA == null) r.tA = r.ta || 0.5; if (r.tH == null) r.tH = r.tA * 0.7; });
ORDER.forEach(i => { let a = i; while (R[a].p >= 0) a = R[a].p; R[i].sys = a; });

/** Garis utama ruas (geometri pertama). */
export const mainOf = (i: number): Line => R[i].g[0];

// water sources: Bendung Copong plus local weirs (own system) and supplementary feeders
const prettySrc = (n: string) => n.replace(/^BD\.\s*/i, 'Bendung ').replace(/^Bd\.\s*/, 'Bendung ').replace('PANGKALAN', 'Pangkalan');
const SRC_BASE: Record<string, [number, number, number]> = { 'Bendung Cipacing': [0.30, 0.07, 3.5], 'Bendung Genteng Cipacing': [0.10, 0.025, 1.2], 'BD. PANGKALAN': [0.07, 0.018, 0.9], 'Bd. Citameng IV': [0.12, 0.03, 1.5], 'Bd. Citameng III': [0.15, 0.035, 1.8] };
const bangIdx = (n: string | null) => DATA.bangunan.findIndex(b => b[2] === n);
const bangPos = (n: string | null, r: Ruas): Pt => { const bi = bangIdx(n); return bi >= 0 ? [DATA.bangunan[bi][0], DATA.bangunan[bi][1]] : r.g[0][0]; };
export const SOURCES: Source[] = [{ key: 'copong', raw: 'Bendung Copong', name: 'Bendung Copong', kind: 'utama', ri: ROOT, gate: 'g-intake', pos: [B.x, B.z], cap: 0, idx: 0, base: [0, 0, 0] }];
LOCAL.forEach(i => { const r = R[i]; SOURCES.push({ key: r.k, raw: r.src!, name: prettySrc(r.src!), kind: 'lokal', ri: i, gate: 'g-src-' + r.k, pos: bangPos(r.src, r), cap: Math.max(0.03, 2 * r.Dc), idx: 0, base: [0, 0, 0] }); });
VIA.forEach(i => { const r = R[i]; SOURCES.push({ key: r.k, raw: r.src!, name: prettySrc(r.src!), kind: 'suplesi', ri: i, into: r.into!, gate: 'g-sup-' + r.k, pos: bangPos(r.src, r), cap: 0.25, idx: 0, base: [0, 0, 0] }); });
SOURCES.forEach((s, k) => { s.idx = k; s.base = SRC_BASE[s.raw] || [0.1, 0.03, 1]; R[s.ri].srcObj = s; });

// groups (kelompok layanan): tertiaries grouped by the nearest non-tertiary ancestor
export const GROUPS: Group[] = [];
/** Indeks kelompok per ruas induknya. */
export const GMAPi: Record<number, number> = {};
ORDER.forEach(i => {
  const r = R[i]; if (r.type !== 'T' || r.own0 <= 0) return;
  let a = r.p;
  while (a >= 0 && R[a].type === 'T' && R[a].p >= 0) a = R[a].p;
  if (a < 0) a = i;
  if (!(a in GMAPi)) { GMAPi[a] = GROUPS.length; GROUPS.push({ gi: GROUPS.length, ri: a, members: [], area: 0, name: '', short: '', id: '', src: undefined }); }
  const g = GROUPS[GMAPi[a]]; g.members.push(i); g.area += r.A; r.grp = g.gi;
});
GROUPS.forEach(g => {
  const r = R[g.ri], s = R[r.sys].srcObj;
  g.name = r.srcObj && r.srcObj.kind === 'lokal' ? (r.n.startsWith('Ruas tanpa nama') ? 'Sistem ' + r.srcObj.name : `${r.n} (${r.srcObj.name})`) : r.n + (r.type === 'P' ? ' (tersier langsung)' : '');
  g.short = r.srcObj && r.srcObj.kind === 'lokal' && r.n.startsWith('Ruas tanpa nama') ? 'Sistem ' + r.srcObj.name.replace('Bendung ', '') : r.n;
  g.id = 'grp-' + r.k; g.src = s;
});
export const GRPID: Record<string, Group> = Object.fromEntries(GROUPS.map(g => [g.id, g]));
export const AREA_T = GROUPS.reduce((a, g) => a + g.area, 0);

/** Kelompok layanan di hilir sebuah ruas (untuk suplesi: di hilir saluran yang dimasukinya). */
export function subtreeGroups(ri: number): Group[] {
  const out: Group[] = [];
  const walk = (i: number) => { if (i in GMAPi) out.push(GROUPS[GMAPi[i]]); R[i].ck.forEach(walk); };
  if (R[ri].via) walk(R[ri].into!); else walk(ri);
  return out;
}
/** Jalur ruas dari akar sistem sampai ruas `i`. */
export function pathTo(i: number): number[] { const p: number[] = []; let a = i; while (a >= 0) { p.unshift(a); a = R[a].p; } return p; }
/** Nama hulu ruas: ruas induknya, atau sumber air bila ruas itu akar sistem. */
export const huluOf = (r: Ruas) => r.p >= 0 ? R[r.p].n : (r.srcObj ? r.srcObj.name : 'Bendung Copong');
/** Nama cabang tempat kelompok berada: sistem bendung lokal, SI Copong, atau saluran di bawah BCP.3. */
export function branchKey(g: Group) {
  const r = R[g.ri], root = R[r.sys];
  if (root.i !== ROOT) return 'Sistem ' + root.srcObj!.name;
  if (g.ri === ROOT) return 'SI Copong';
  let a = g.ri; while (R[a].p !== ROOT) a = R[a].p;
  return R[a].n;
}
