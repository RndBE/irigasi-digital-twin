import { hhmm, nf } from '../lib/format';
import { B, GROUPS, SOURCES } from './network';
import { WEIR } from './weir';
import { STATIONS } from './stations';
import { grpK } from './simulation';
import { OFF_SINCE, sim } from './state';
import type { Lvl, Sel, Snapshot } from './types';

export interface Alarm { lvl: Exclude<Lvl, 'good'>; text: string; sel: Sel }

/** Peringatan aktif dari cuplikan terbaru, urut kritis → offline → perlu perhatian. */
export function buildAlarms(s: Snapshot): Alarm[] {
  const A: Alarm[] = [];
  if (s.Qriver > 80) A.push({ lvl: 'crit', text: `Debit Cimanuk ${nf(s.Qriver, 0)} m³/s. Siaga banjir di Bendung Copong, air ${nf(s.hMercu)} m di atas mercu.`, sel: { kind: 'station', id: 'AWLR-CPG-02' } });
  else if (s.Qriver < 3) A.push({ lvl: 'warn', text: `Debit Cimanuk rendah, ${nf(s.Qriver, 1)} m³/s. Pengambilan dibatasi.`, sel: { kind: 'station', id: 'AWLR-CMK-01' } });
  {
    const H = s.hMercu, el = nf(B.el_mercu + H), wsel: Sel = { kind: 'gate', id: 'w-banjir-2' };
    if (H > WEIR.hTop + 0.3) A.push({ lvl: 'crit', text: `Muka air hulu Bendung Copong +${el} mdpl, melimpas di atas daun pintu banjir. Buka pintu banjir.`, sel: wsel });
    else if (H > WEIR.hTop) A.push({ lvl: 'warn', text: `Air mulai melimpas di atas daun pintu banjir (+${el} mdpl). Naikkan sedikit bukaan pintu banjir.`, sel: wsel });
    else if (H < WEIR.hIn) A.push({ lvl: 'crit', text: `Muka air hulu Bendung Copong +${el} mdpl, di bawah ambang intake. Air tidak masuk SI Copong; kecilkan bukaan pintu banjir.`, sel: wsel });
    else if (H < WEIR.hN - 0.35) A.push({ lvl: 'warn', text: `Muka air hulu Bendung Copong turun ke +${el} mdpl. Pengambilan berkurang; kecilkan bukaan pintu banjir.`, sel: wsel });
  }
  if (s.Qriver > 80 && sim.open['g-intake'] > 40) A.push({ lvl: 'crit', text: `Pintu pengambilan terbuka ${sim.open['g-intake']}% saat banjir. Turunkan ke 40% atau kurang agar sedimen tidak masuk.`, sel: { kind: 'gate', id: 'g-intake' } });
  const low = GROUPS.map(g => [g, grpK(s, g.gi)] as const).filter(([, K]) => K < 0.75).sort((a, b) => a[1] - b[1]);
  low.slice(0, 4).forEach(([g, K]) => A.push({ lvl: 'crit', text: `${g.name}: Faktor K ${nf(K)}. Air kurang, siapkan giliran.`, sel: { kind: 'grp', id: g.id } }));
  if (low.length > 4) A.push({ lvl: 'crit', text: `${low.length - 4} kelompok lain juga di bawah K 0,75. Lihat tab Neraca air.`, sel: { kind: 'grp', id: low[4][0].id } });
  const hi = GROUPS.map(g => [g, grpK(s, g.gi)] as const).filter(([, K]) => K > 1.1).sort((a, b) => b[1] - a[1]);
  hi.slice(0, 2).forEach(([g, K]) => A.push({ lvl: 'warn', text: `${g.name}: pasokan ${nf(K * 100, 0)}% dari kebutuhan, kelebihan air terbuang.`, sel: { kind: 'grp', id: g.id } }));
  if (s.spill > 0.08) A.push({ lvl: 'warn', text: `Limpas ${nf(s.spill * 1000, 0)} l/dt ke pembuang. Pengambilan melebihi kapasitas sadap.`, sel: { kind: 'station', id: 'AWLR-BCP-04' } });
  const dry = SOURCES.filter(x => x.kind !== 'utama' && s.srcRiver[x.idx] < x.base[0] * 0.4);
  if (dry.length) A.push({ lvl: 'warn', text: `Sungai di ${dry.map(x => x.name).join(', ')} tinggal sedikit. Sistem lokal dan suplesi ikut kekurangan air.`, sel: { kind: 'gate', id: dry[0].gate } });
  if (s.rain > 10) A.push({ lvl: s.rain > 20 ? 'crit' : 'warn', text: `Hujan ${s.rain > 20 ? 'sangat lebat' : 'lebat'} ${nf(s.rain, 1)} mm/jam di ARR Leuwigoong.`, sel: { kind: 'station', id: 'ARR-LWG-15' } });
  STATIONS.filter(x => x.offline).forEach(x => A.push({ lvl: 'serious', text: `${x.name} tidak mengirim data sejak ${hhmm(OFF_SINCE)} WIB.`, sel: { kind: 'station', id: x.id } }));
  const ord = { crit: 0, serious: 1, warn: 2 };
  A.sort((a, b) => ord[a.lvl] - ord[b.lvl]);
  return A;
}
