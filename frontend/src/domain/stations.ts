import { clamp } from '../lib/format';
import { rnd } from '../lib/random';
import { B, DATA, R, ROOT, SOURCES, byName, mainOf } from './network';
import { lineLen, offsetPt, pointAlong } from './geometry';
import { pondStatus } from './weir';
import { kStatus } from './status';
import { rain24 } from './state';
import type { Pt, Station } from './types';

/**
 * 16 stasiun telemetri (AWLR, debit, penakar hujan) di titik bangunan nyata jaringan D.I. Leuwigoong.
 * Nilainya dibaca dari model simulasi lewat `main.get` / `sub.get`; di tahap sambung data, fungsi ini diganti
 * pembacaan dari API SimHidro.
 */
const cimanukPts = DATA.rivers.filter(r => r.o === 1).flatMap(r => r.pts);
const upstreamPt: Pt = (() => { let best: Pt | null = null, bd = 1e9; cimanukPts.forEach(p => { const d = Math.hypot(p[0] - B.x, p[1] - B.z); if (p[1] > B.z && Math.abs(d - 7) < bd) { bd = Math.abs(d - 7); best = p; } }); return best || [B.x, B.z + 7]; })();

export const STATIONS: Station[] = [];
function addStation(o: Omit<Station, 'code' | 'batt' | 'sig'>) { STATIONS.push({ ...o, code: o.id.split('-').slice(1).join('-'), batt: 0, sig: null }); }

addStation({ id: 'AWLR-CMK-01', name: 'AWLR Cimanuk hulu bendung', type: 'AWLR', comm: 'Satelit', pos: [upstreamPt[0] + 1.6, upstreamPt[1]], where: 'Sungai Cimanuk, ±700 m hulu Bendung Copong', lod: 1e9,
  main: { label: 'TMA', unit: 'm', d: 2, get: c => 0.42 * Math.pow(c.Qriver, 0.55) }, sub: { label: 'Debit (lengkung debit)', unit: 'm³/s', d: 1, get: c => c.Qriver },
  status: c => c.Qriver > 80 ? ['crit', 'Siaga banjir'] : c.Qriver < 3 ? ['warn', 'Debit rendah'] : ['good', 'Normal'] });
addStation({ id: 'AWLR-CPG-02', name: 'AWLR mercu Bendung Copong', type: 'AWLR', comm: 'Satelit', pos: [B.x - 2.2, B.z + 0.6], where: `Bendung Copong, Ds. ${B.desa}, Kec. ${B.kec}`, lod: 70,
  main: { label: 'TMA hulu bendung', unit: 'mdpl', d: 2, get: c => B.el_mercu + c.hMercu }, sub: { label: 'Tinggi air di atas mercu', unit: 'm', d: 2, get: c => c.hMercu },
  status: c => pondStatus(c.hMercu) });
{
  const sic = mainOf(ROOT), p = pointAlong(sic, 5), o = offsetPt(p, 1.1), e = sic[sic.length - 1];
  addStation({ id: 'FLOW-SIC-03', name: 'Debit SI Copong', type: 'Debit', comm: '4G', pos: o, ri: ROOT, where: 'SI Copong, ±500 m hilir intake (lewat kantong lumpur 185 m)', lod: 1e9,
    main: { label: 'Debit', unit: 'm³/s', d: 2, get: c => c.Q[ROOT] }, sub: { label: 'TMA saluran', unit: 'm', d: 2, get: c => (R[ROOT].h || 0.86) * Math.pow(c.Q[ROOT] / R[ROOT].Dc, 0.6) },
    status: c => c.K < 0.75 ? ['warn', 'Pasokan kurang'] : ['good', 'Normal'] });
  addStation({ id: 'AWLR-BCP-04', name: 'AWLR Bangunan Bagi BCP.3', type: 'AWLR', comm: '4G', pos: [e[0] - 1.4, e[1] - 1.2], where: 'BCP.3, ujung SI Copong (bagi ke Kanan, Kiri, Inlet Situ Bagendit)', lod: 1e9,
    main: { label: 'TMA hulu pintu bagi', unit: 'm', d: 2, get: c => (R[ROOT].h || 0.86) * Math.pow(c.Q[ROOT] * R[ROOT].eta / R[ROOT].Dc, 0.6) * 0.92 }, sub: { label: 'Limpas ke pembuang', unit: 'm³/s', d: 3, get: c => c.spill },
    status: c => c.spill > 0.08 ? ['warn', 'Ada limpas'] : ['good', 'Normal'] });
}
['SS Copong Kanan', 'SS Tegal Buah', 'SS Lewo', 'SS Ciduga', 'SS Leuwigoong', 'SS Cinanti', 'SS Cikukuk'].forEach((n, k) => {
  const i = byName(n); if (i < 0) return;
  const p = pointAlong(mainOf(i), 1.4), o = offsetPt(p, 0.9);
  addStation({ id: `FLOW-${['CKA', 'TGB', 'LWO', 'CDG', 'LWG', 'CNT', 'CKK'][k]}-${String(5 + k).padStart(2, '0')}`, name: `Debit ${n}`, type: 'Debit', comm: '4G', pos: o, ri: i, lod: 1e9,
    where: `${n}, hilir pintu sadap ${R[i].s || ''}`.trim(),
    main: { label: 'Debit', unit: 'l/dt', d: 0, get: c => c.Q[i] * 1000 }, sub: { label: 'Faktor K hilir', unit: '', d: 2, get: c => c.sn[i] > 0 ? c.sg[i] / c.sn[i] : 0 },
    status: c => kStatus(c.sn[i] > 0 ? c.sg[i] / c.sn[i] : 1) });
});
([['SI Copong Kanan', 'AWLR-UKA-12', false], ['SS Lewo', 'AWLR-ULW-13', true], ['SS Citikey Kiri', 'AWLR-UCK-14', false]] as const).forEach(([n, id, off]) => {
  const i = byName(n); if (i < 0) return;
  const ln = mainOf(i), p = pointAlong(ln, lineLen(ln) - 0.4), o = offsetPt(p, 0.9);
  addStation({ id, name: `AWLR ujung ${n}`, type: 'AWLR', comm: '4G', pos: o, ri: i, offline: off, lod: 1e9, where: `Ujung ${n}`,
    main: { label: 'TMA ujung', unit: 'm', d: 2, get: c => (R[i].h || 0.3) * 0.55 * Math.pow(clamp(c.sn[i] > 0 ? c.sg[i] / c.sn[i] : 0, 0, 1.4), 1.2) }, sub: { label: 'Faktor K hilir', unit: '', d: 2, get: c => c.sn[i] > 0 ? c.sg[i] / c.sn[i] : 0 },
    status: c => { const K = c.sn[i] > 0 ? c.sg[i] / c.sn[i] : 1; return K < 0.6 ? ['warn', 'Ujung kering'] : ['good', 'Normal']; } });
});
{
  const i = byName('SS Leuwigoong'), p = pointAlong(mainOf(i), lineLen(mainOf(i)) * 0.5), o = offsetPt(p, 2.2);
  addStation({ id: 'ARR-LWG-15', name: 'Penakar hujan Leuwigoong', type: 'ARR', comm: '4G', pos: o, where: 'Areal sawah SS Leuwigoong', lod: 1e9,
    main: { label: 'Intensitas hujan', unit: 'mm/jam', d: 1, get: c => c.rain }, sub: { label: 'Akumulasi 24 jam', unit: 'mm', d: 1, get: () => rain24() },
    status: c => c.rain > 20 ? ['crit', 'Sangat lebat'] : c.rain > 10 ? ['warn', 'Lebat'] : ['good', 'Normal'] });
  addStation({ id: 'ARR-CPG-16', name: 'Penakar hujan Bendung Copong', type: 'ARR', comm: 'Satelit', pos: [B.x + 3.2, B.z - 2.6], where: 'Kompleks Bendung Copong', lod: 70,
    main: { label: 'Intensitas hujan', unit: 'mm/jam', d: 1, get: c => c.rain * 1.12 }, sub: { label: 'Akumulasi 24 jam', unit: 'mm', d: 1, get: () => rain24() * 1.12 },
    status: c => c.rain > 18 ? ['crit', 'Sangat lebat'] : c.rain > 9 ? ['warn', 'Lebat'] : ['good', 'Normal'] });
}
{
  const s = SOURCES.find(x => x.raw === 'Bendung Cipacing');
  if (s) addStation({ id: 'AWLR-CPC-17', name: 'AWLR Bendung Cipacing', type: 'AWLR', comm: '4G', pos: [s.pos[0] - 1.4, s.pos[1] + 0.8], where: 'Bendung Cipacing, hulu SS Pasir Laja', lod: 1e9, ri: s.ri,
    main: { label: 'Debit sungai', unit: 'l/dt', d: 0, get: c => c.srcRiver[s.idx] * 1000 }, sub: { label: 'Pengambilan', unit: 'l/dt', d: 0, get: c => c.Q[s.ri] * 1000 },
    status: c => c.srcRiver[s.idx] < s.base[0] * 0.4 ? ['warn', 'Debit rendah'] : ['good', 'Normal'] });
}
export const STMAP: Record<string, Station> = Object.fromEntries(STATIONS.map(s => [s.id, s]));
export const stIdx: Record<string, number> = Object.fromEntries(STATIONS.map((s, k) => [s.id, k]));
STATIONS.forEach(s => { s.batt = 12.5 + rnd() * 0.9; s.sig = s.comm === 'Satelit' ? null : Math.round(-67 - rnd() * 26); });
