import { Fragment } from 'react';
import { clamp, jam, nf } from '../lib/format';
import { AREA_T, GROUPS, R, SOURCES, branchKey, huluOf } from '../domain/network';
import { pola } from '../domain/status';
import { grpK } from '../domain/simulation';
import { cur, sim } from '../domain/state';
import type { Group } from '../domain/types';
import { goToTwin } from '../store/twinStore';
import { StatusChip } from '../components/Ui';
import { PageHead } from '../components/PageHead';
import { RowLink, Stat } from './TelemetryPage';

const MAX_K = 1.5, pct = (v: number) => clamp(v / MAX_K, 0, 1) * 100;
const colOf = (K: number) => K < 0.75 ? 'var(--crit)' : K < 0.95 || K >= 1.1 ? 'var(--warn)' : 'var(--good)';

/** Tab Neraca air: Faktor K per kelompok layanan, pola pemberian air, dan tabel neraca. */
export function NeracaPage() {
  const s = cur(), nLocal = SOURCES.filter(x => x.kind === 'lokal').length, nSup = SOURCES.filter(x => x.kind === 'suplesi').length;
  const byBranch: Record<string, Group[]> = {};
  GROUPS.forEach(g => { const key = branchKey(g); (byBranch[key] = byBranch[key] || []).push(g); });
  return (
    <section id="tab-neraca" className="view" aria-labelledby="h-neraca">
      <PageHead id="h-neraca" icon="neraca" title="Neraca air" sub={`Faktor K per kelompok layanan · ${GROUPS.length} kelompok, ${nf(AREA_T, 0)} ha terlayani`} />
      <div className="sumrow">
        <Stat label="Q butuh (sawah terlayani)" value={nf(s.need * 1000, 0)} unit="l/dt" />
        <Stat label="Q tersalur ke petak" value={nf(s.got * 1000, 0)} unit="l/dt" />
        <Stat label="Faktor K D.I." value={nf(s.K)} unit="" />
        <Stat label="Air terbuang" value={nf(s.waste * 1000, 0)} unit="l/dt" />
        <Stat label="Luas terlayani jaringan" value={nf(AREA_T, 0)} unit="ha" />
        <Stat label="Sumber air" value={1 + nLocal} unit={`bendung + ${nSup} suplesi`} />
      </div>
      <div className="neraca-grid">
        <div className="panel">
          <h3>Faktor K per kelompok layanan</h3>
          <div className="kbars">
            {Object.entries(byBranch).map(([key, gs]) => <Fragment key={key}>
              <div className="kgroup">{key}</div>
              {gs.map(g => { const K = grpK(s, g.gi); return (
                <div key={g.id} className="kb" title={`${g.name}: ${nf(s.grpGot[g.gi] * 1000, 0)} dari ${nf(s.grpNeed[g.gi] * 1000, 0)} l/dt`} onClick={() => goToTwin({ kind: 'grp', id: g.id })}>
                  <span className="nm">{g.short}</span>
                  <div className="ktrack"><div className="bar" style={{ width: `${pct(K).toFixed(1)}%`, ['--c' as string]: colOf(K) }} /><div className="ref" style={{ left: `${pct(0.75)}%` }} /><div className="ref" style={{ left: `${pct(1)}%` }} /></div>
                  <span className="v">{nf(K)}</span>
                </div>); })}
            </Fragment>)}
            <div className="kaxis"><span /><div className="ax">{[0, 0.5, 0.75, 1, 1.5].map(v => <span key={v} style={{ left: `${pct(v)}%` }}>{nf(v, v % 0.5 ? 2 : 1)}</span>)}</div><span /></div>
          </div>
        </div>
        <div className="panel">
          <h3>Pola pemberian air</h3>
          <ul className="rules">
            <li><code>K ≥ 0,95</code><span>Pemberian air menerus ke semua petak tersier.</span></li>
            <li><code>0,75–0,95</code><span>Menerus dengan pengurangan debit di tiap sadap.</span></li>
            <li><code>0,50–0,75</code><span>Giliran antar petak tersier.</span></li>
            <li><code>K &lt; 0,50</code><span>Giliran antar saluran sekunder; pertimbangkan pembatasan luas tanam.</span></li>
          </ul>
          <div className="formula">Q butuh tersier = hasil hitungan WMS (FAO-56, rezim FL, tanam Januari)<br />× faktor skenario × (1 − pengaruh hujan efektif)<br />Faktor K = Q tersalur ÷ Q butuh</div>
          <p className="fine">Kelompok layanan = petak tersier yang menyadap langsung dari satu saluran sekunder/primer. Waktu tempuh air diambil dari hitungan hidraulik per ruas (notebook WMS).</p>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Kelompok</th><th>Hulu</th><th className="num">Luas (ha)</th><th className="num">Tersier</th><th className="num">Q butuh (l/dt)</th><th className="num">Q tersalur (l/dt)</th><th className="num">Faktor K</th><th>Pola</th><th className="num">Tempuh air</th><th className="num">Bukaan pintu</th></tr></thead>
          <tbody>
            {GROUPS.map(g => {
              const r = R[g.ri], K = grpK(s, g.gi);
              return <RowLink key={g.id} sel={{ kind: 'grp', id: g.id }}>
                <td><span className="nm">{g.name}</span></td><td>{huluOf(r)}</td><td className="num">{nf(g.area, 0)}</td><td className="num">{g.members.length}</td>
                <td className="num">{nf(s.grpNeed[g.gi] * 1000, 0)}</td><td className="num">{nf(s.grpGot[g.gi] * 1000, 0)}</td><td className="num">{nf(K)}</td><td><StatusChip s={pola(K)} /></td><td className="num">{jam(r.tA)}</td><td className="num">{r.gate ? sim.open[r.gate] + '%' : '—'}</td>
              </RowLink>;
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
