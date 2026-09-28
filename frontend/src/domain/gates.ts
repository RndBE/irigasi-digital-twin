import { nf } from '../lib/format';
import { B, ORDER, R, ROOT, ROOTS, SOURCES } from './network';
import { WG } from './weir';
import type { Gate } from './types';

/**
 * Daftar pintu yang bisa diatur: pintu pengambilan Bendung Copong, 3 pintu banjir dan pintu penguras bendung,
 * pintu bagi/sadap tiap saluran non-tersier yang punya kebutuhan, dan pintu pengambilan bendung lokal serta
 * pintu suplesi.
 */
export const GATES: Gate[] = [{ id: 'g-intake', ri: ROOT, kind: 'intake', src: SOURCES[0], name: 'Pintu Pengambilan Bendung Copong', role: 'Pintu pengambilan · intake kiri', maxCm: 115, sub: `Intake ${B.intake} · Q rencana ${nf(B.q_rencana)} m³/s`, sys: 0 }];
WG.forEach(w => GATES.push({ id: w.id, ri: ROOT, kind: 'bendung', w, maxCm: w.maxA * 100,
  name: w.kind === 'banjir' ? `Pintu Banjir ${w.bay + 1} Bendung Copong` : 'Pintu Penguras Bendung Copong',
  role: w.kind === 'banjir' ? 'Pintu bendung gerak · di atas mercu' : 'Pintu penguras · depan intake',
  sub: w.kind === 'banjir' ? 'Lebar 12,5 m · daun 3,5 m · mengatur muka air hulu' : 'Lebar 5 m · daun 8 m · ambang 4,5 m di bawah mercu', sys: 0 }));
ORDER.forEach(i => {
  const r = R[i]; if (ROOTS.includes(i) || r.type === 'T') return;
  if (!(r.Dc > 0 || r.situ)) return;
  GATES.push({ id: 'g-' + r.k, ri: i, kind: 'sadap', name: 'Pintu ' + r.n, role: r.p === ROOT ? 'Pintu bagi · BCP.3' : 'Pintu sadap · ' + (r.s || 'bangunan sadap'), maxCm: Math.max(40, Math.round((r.h || 0.4) * 160 / 5) * 5), sub: `${r.k} · ${nf(r.L, 1)} km · rencana b ${nf(r.b)} m × h ${nf(r.h)} m`, situ: r.situ, sys: 0 });
  r.gate = 'g-' + r.k;
});
SOURCES.filter(s => s.kind !== 'utama').forEach(s => {
  const r = R[s.ri];
  GATES.push({ id: s.gate, ri: s.ri, kind: s.kind as 'lokal' | 'suplesi', src: s, name: (s.kind === 'lokal' ? 'Pintu pengambilan ' : 'Pintu suplesi ') + s.name, role: s.kind === 'lokal' ? 'Pintu pengambilan · bendung lokal' : 'Pintu suplesi · masuk ' + R[s.into!].n, maxCm: s.kind === 'lokal' ? 60 : 50, sub: `${r.k} · ${nf(r.L, 1)} km · debit sungai disimulasikan`, sys: 0 });
  r.gate = s.gate;
});
GATES.forEach(g => { g.sys = R[g.ri].sys != null ? R[g.ri].sys : g.ri; });

export const GMAP: Record<string, Gate> = Object.fromEntries(GATES.map(g => [g.id, g]));
export const gIdx: Record<string, number> = Object.fromEntries(GATES.map((g, k) => [g.id, k]));
/** Pintu bendung diatur per 0,1 %: 1 % bukaan pintu banjir sudah ±2 m³/s. */
export const fine = (id: string) => !!(GMAP[id] && GMAP[id].w);
export const pctRound = (id: string, v: number) => fine(id) ? Math.round(v * 10) / 10 : Math.round(v);
export const pctTxt = (id: string, v: number) => fine(id) ? nf(v, 1) : String(v);
