import { Fragment, useMemo } from 'react';
import { jam, nf } from '../lib/format';
import { B, GROUPS } from '../domain/network';
import { GATES, pctTxt } from '../domain/gates';
import { WEIR } from '../domain/weir';
import { branchBalance, groupReliability, riverSensitivity, travelTimes, volumeBalance } from '../domain/analysis';
import { cur, sim } from '../domain/state';
import { applyRecommendation, getSimVersion, goToTwin, recommendation } from '../store/twinStore';
import { PageHead } from '../components/PageHead';
import { BarRow, kTone } from '../components/Kpi';
import { Chart, Legend2 } from '../components/Ui';
import { Stat } from './TelemetryPage';

const TRAVEL = travelTimes();
const qLabel = (q: number) => `${nf(q, 0)} m³/s`;

/**
 * Halaman Evaluasi jaringan: neraca volume 24 jam, keandalan pasokan tiap kelompok, dampak rekomendasi bukaan pintu, dan
 * kepekaan bendung serta jaringan terhadap debit Cimanuk.
 */
export function NetworkPage() {
  const s = cur(), simV = getSimVersion();
  const vol = useMemo(() => volumeBalance(sim.hist), [simV]);
  const rel = useMemo(() => groupReliability(sim.hist).sort((a, b) => a.okShare - b.okShare || a.meanK - b.meanK), [simV]);
  const rec = recommendation();
  const sens = useMemo(() => riverSensitivity(sim.open, sim.env), [simV]);
  const nowB = branchBalance(s), recB = branchBalance(s, rec.view.grp);
  const diff = GATES.filter(g => Math.abs(rec.open[g.id] - sim.open[g.id]) >= (g.w ? 0.3 : 3));
  const ks = GROUPS.map(g => s.grpNeed[g.gi] > 0 ? s.grpGot[g.gi] / s.grpNeed[g.gi] : 0), kr = rec.view.grp;
  const spread = (a: number[]) => { const v = a.filter(isFinite); return `${nf(Math.min(...v))}–${nf(Math.max(...v))}`; };
  const kilo = (v: number) => nf(v / 1000, 1);
  const Q = sens.map(p => p.Q), maxT = Math.max(...TRAVEL.map(t => t.tA), 1);
  return (
    <section id="tab-evaluasi" className="view" aria-labelledby="h-evaluasi">
      <PageHead id="h-evaluasi" icon="gauge" title="Evaluasi jaringan" sub="Neraca volume, keandalan pasokan, uji rekomendasi bukaan pintu, dan kepekaan terhadap debit Cimanuk" />

      <div className="sumrow">
        <Stat label="Volume masuk jaringan · 24 jam" value={kilo(vol.vin)} unit="ribu m³" />
        <Stat label="Tersalur ke petak" value={kilo(vol.vgot)} unit={`ribu m³ · butuh ${kilo(vol.vneed)}`} />
        <Stat label="Terbuang (limpas + lebih)" value={kilo(vol.vwaste)} unit="ribu m³" />
        <Stat label="Efisiensi penyaluran" value={nf(vol.eff * 100, 0)} unit="% masuk → petak" />
        <Stat label="Faktor K rata-rata" value={nf(vol.meanK)} unit="24 jam" />
        <Stat label="K D.I. di bawah 0,75" value={nf(vol.hoursBelow, 1)} unit={`jam dari ${nf(vol.hours, 0)}`} />
      </div>

      <div className="dash-grid">
        <div className="panel">
          <h3>Keandalan pasokan per kelompok · 24 jam</h3>
          <p className="fine" style={{ margin: '-4px 0 10px' }}>Bagian waktu Faktor K kelompok ≥ 0,75 (pemberian air menerus). Diurutkan dari yang paling sering kekurangan; klik untuk melihat di twin.</p>
          <div className="brows brows--scroll">
            {rel.map(x => (
              <BarRow key={x.g.id} name={x.g.short} frac={x.okShare} tone={x.okShare < 0.5 ? 'crit' : x.okShare < 0.9 ? 'warn' : 'good'} onClick={() => goToTwin({ kind: 'grp', id: x.g.id })}
                value={<>{nf(x.okShare * 100, 0)}% <span className="brow__sub">K {nf(x.meanK)} · min {nf(x.minK)}</span></>} title={x.g.name} />
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Rekomendasi twin vs kondisi kini</h3>
          <dl className="cmp">
            <dt>Faktor K D.I.</dt><dd>{nf(s.K)} <span className="arr">→</span> <b>{nf(rec.view.K)}</b></dd>
            <dt>Sebaran K kelompok</dt><dd>{spread(ks)} <span className="arr">→</span> <b>{spread(kr)}</b></dd>
            <dt>Air terbuang</dt><dd>{nf(s.waste * 1000, 0)} <span className="arr">→</span> <b>{nf(rec.view.waste * 1000, 0)}</b> l/dt</dd>
            <dt>Muka air hulu</dt><dd>+{nf(B.el_mercu + s.hMercu)} <span className="arr">→</span> <b>+{nf(B.el_mercu + rec.view.H)}</b> mdpl</dd>
          </dl>
          <div className="legend" style={{ margin: '4px 0 8px' }}><span className="lg"><i style={{ ['--c' as string]: 'var(--muted)' }} />Kini</span><span className="lg"><i style={{ ['--c' as string]: 'var(--accent)' }} />Rekomendasi</span></div>
          <div className="pair-rows">
            {nowB.map((b, k) => { const K0 = b.need > 0 ? b.got / b.need : 0, K1 = recB[k].need > 0 ? recB[k].got / recB[k].need : 0; return (
              <Fragment key={b.key}>
                <span className="pair-rows__name">{b.key}</span>
                <span className="pair-rows__bars">
                  <i className="now" style={{ width: `${Math.min(100, K0 / 1.5 * 100).toFixed(1)}%` }} />
                  <i className="rec" style={{ width: `${Math.min(100, K1 / 1.5 * 100).toFixed(1)}%`, background: `var(--${kTone(K1)})` }} />
                  <i className="mark" style={{ left: `${(0.75 / 1.5 * 100).toFixed(1)}%` }} /><i className="mark" style={{ left: `${(1 / 1.5 * 100).toFixed(1)}%` }} />
                </span>
                <span className="pair-rows__val">{nf(K0)} → {nf(K1)}</span>
              </Fragment>
            ); })}
          </div>
          {diff.length ? <details className="chg"><summary>{diff.length} pintu perlu diubah</summary><div className="chg-list">{diff.map(g => <Fragment key={g.id}><span>{g.name.replace('Pintu ', '')}</span><span>{pctTxt(g.id, sim.open[g.id])}% → {pctTxt(g.id, rec.open[g.id])}%</span></Fragment>)}</div></details>
            : <p className="fine">Bukaan pintu sudah sesuai rekomendasi.</p>}
          <button className="btn primary block" type="button" style={{ marginTop: 10 }} disabled={!diff.length || sim.auto} onClick={applyRecommendation}>{sim.auto ? 'Kendali otomatis aktif' : 'Terapkan rekomendasi'}</button>
        </div>
      </div>

      <div className="dash-grid dash-grid--even">
        <div className="panel">
          <div className="panel-h"><h3>Muka air hulu vs debit Cimanuk</h3><div className="legend"><Legend2 a="Bukaan pintu bendung kini" b="Pintu disesuaikan" /></div></div>
          <p className="fine" style={{ margin: '-4px 0 8px' }}>Tinggi air di atas mercu bila debit sungai berubah. Debit kini {nf(s.Qriver, 1)} m³/s. Ambang intake {nf(WEIR.hIn, 1)} m, normal {nf(WEIR.hN, 1)} m, puncak daun pintu {nf(WEIR.hTop, 1)} m.</p>
          <Chart config={{ height: 210, unit: 'm di atas mercu', digits: 2, xLabel: qLabel, xTick: q => q % 5 === 0, refs: [{ v: WEIR.hIn, label: 'ambang intake' }, { v: WEIR.hN, label: 'normal' }, { v: WEIR.hTop, label: 'puncak daun' }] }}
            data={{ times: Q, series: [{ name: 'Bukaan kini', color: 'var(--s1)', values: sens.map(p => Math.max(0, p.H)) }, { name: 'Pintu disesuaikan', color: 'var(--s2)', dash: true, values: sens.map(p => Math.max(0, p.Ha)) }] }} />
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Pengambilan intake vs debit Cimanuk</h3><div className="legend"><Legend2 a="Bukaan pintu bendung kini" b="Pintu disesuaikan" /></div></div>
          <p className="fine" style={{ margin: '-4px 0 8px' }}>Debit yang bisa masuk SI Copong mengikuti muka air hulu; Q rencana intake {nf(B.q_rencana)} m³/s.</p>
          <Chart config={{ height: 210, unit: 'm³/s', digits: 2, xLabel: qLabel, xTick: q => q % 5 === 0, refs: [{ v: B.q_rencana, label: 'Q rencana' }] }}
            data={{ times: Q, series: [{ name: 'Pengambilan, bukaan kini', color: 'var(--s1)', values: sens.map(p => p.Qin) }, { name: 'Pengambilan, pintu disesuaikan', color: 'var(--s2)', dash: true, values: sens.map(p => p.Qina) }] }} />
        </div>
      </div>

      <div className="panel">
        <h3>Waktu tempuh air ke ujung saluran · 12 terlama</h3>
        <p className="fine" style={{ margin: '-4px 0 10px' }}>Dari hitungan hidraulik per ruas (notebook WMS): perubahan bukaan di sumber baru terasa penuh di ujung setelah selang waktu ini.</p>
        <div className="brows brows--cols">
          {TRAVEL.map(t => <BarRow key={t.key} name={t.key} frac={t.tA / maxT} value={jam(t.tA)} tone={t.tA > 24 ? 'warn' : 'info'} />)}
        </div>
      </div>
    </section>
  );
}

