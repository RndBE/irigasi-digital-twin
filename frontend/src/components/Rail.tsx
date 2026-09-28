import { Fragment, useMemo } from 'react';
import { jam, nf } from '../lib/format';
import { GROUPS, R } from '../domain/network';
import { GATES, pctTxt } from '../domain/gates';
import { STATIONS } from '../domain/stations';
import { SCEN, SCEN_IDS } from '../domain/scenarios';
import { pola } from '../domain/status';
import { buildAlarms } from '../domain/alarms';
import { grpK } from '../domain/simulation';
import { cur, rain24, sim } from '../domain/state';
import { applyRecommendation, getSimVersion, recommendation, select, setAuto, setScenario } from '../store/twinStore';
import { Chip, Icon, Spark, StatusChip } from './Ui';

/** Kolom kiri halaman twin: kondisi sekarang, skenario, rekomendasi bukaan pintu, dan peringatan aktif. */
export function Rail() {
  const s = cur(), simV = getSimVersion();
  const last36 = sim.hist.slice(-36);
  const on = STATIONS.filter(x => !x.offline).length;
  const { open: recOpen, view: recView } = recommendation(), rec = { open: recOpen, p: recView };
  const ks = GROUPS.map(g => grpK(s, g.gi)).filter(isFinite), kp = rec.p.grp.filter(isFinite);
  const diff = GATES.filter(g => Math.abs(rec.open[g.id] - sim.open[g.id]) >= (g.w ? 0.3 : 3));
  const rng = (a: number[]) => `${nf(Math.min(...a))}–${nf(Math.max(...a))}`;
  const lagMax = diff.reduce((a, g) => Math.max(a, R[g.ri].tA || 0), 0);
  const alarms = useMemo(() => buildAlarms(s), [simV]);
  return (
    <aside className="rail">
      <div className="panel">
        <h3>Kondisi sekarang</h3>
        <div className="kpi"><div className="lab">Debit Sungai Cimanuk</div><div className="val">{nf(s.Qriver, 1)}<span className="u">m³/s</span></div><div className="side"><Spark values={last36.map(h => h.Qriver)} /></div></div>
        <div className="kpi"><div className="lab">Pengambilan SI Copong</div><div className="val">{nf(s.Qin, 2)}<span className="u">m³/s</span></div><div className="side"><Spark values={last36.map(h => h.Qin)} /></div></div>
        <div className="kpi"><div className="lab">Faktor K D.I.</div><div className="val">{nf(s.K)}</div><div className="side"><StatusChip s={pola(s.K)} /></div></div>
        <div className="kpi"><div className="lab">Hujan 24 jam (ARR)</div><div className="val">{nf(rain24(), 1)}<span className="u">mm</span></div>
          <div className="side">{s.rain > 0.3 ? <Chip lvl={s.rain > 20 ? 'crit' : s.rain > 10 ? 'warn' : 'good'}>{nf(s.rain, 1)} mm/jam</Chip> : <Chip lvl="good">Tidak hujan</Chip>}</div></div>
        <div className="kpi"><div className="lab">Stasiun mengirim data</div><div className="val">{on}<span className="u">/ {STATIONS.length}</span></div>
          <div className="side">{on < STATIONS.length ? <Chip lvl="serious">{STATIONS.length - on} offline</Chip> : <Chip lvl="good">Semua</Chip>}</div></div>
      </div>

      <div className="panel">
        <h3>Skenario simulasi</h3>
        <div className="seg full" role="group" aria-label="Skenario">
          {SCEN_IDS.map(id => <button key={id} type="button" aria-pressed={sim.scenario === id} onClick={() => setScenario(id)}>{SCEN[id].label}</button>)}
        </div>
        <p className="scen-desc">{SCEN[sim.scenario].desc}</p>
      </div>

      <div className="panel">
        <h3>Rekomendasi twin</h3>
        <div>
          <dl className="rec-grid"><dt>Sebaran K kelompok</dt><dd>{rng(ks)} → {rng(kp)}</dd><dt>K D.I.</dt><dd>{nf(s.K)} → {nf(rec.p.K)}</dd><dt>Air terbuang</dt><dd>{nf(s.waste * 1000, 0)} → {nf(rec.p.waste * 1000, 0)} l/dt</dd></dl>
          {diff.length ? <>
            <p className="fine" style={{ margin: '0 0 6px' }}>Hasil penuh terasa ±{jam(lagMax)} kemudian (waktu tempuh air terjauh).</p>
            <details className="chg"><summary>{diff.length} pintu perlu diubah</summary><div className="chg-list">{diff.map(g => <Fragment key={g.id}><span>{g.name.replace('Pintu ', '')}</span><span>{pctTxt(g.id, sim.open[g.id])}% → {pctTxt(g.id, rec.open[g.id])}%</span></Fragment>)}</div></details>
          </> : <p className="fine" style={{ margin: '0 0 4px' }}>Bukaan pintu sudah sesuai rekomendasi.</p>}
        </div>
        <button className="btn primary block" type="button" disabled={!diff.length || sim.auto} onClick={applyRecommendation}>{sim.auto ? 'Kendali otomatis aktif' : 'Terapkan rekomendasi'}</button>
        <label className="switch"><input type="checkbox" checked={sim.auto} onChange={e => setAuto(e.currentTarget.checked)} /> Kendali otomatis (simulasi)</label>
      </div>

      <div className="panel">
        <h3>Peringatan aktif <span className="count">{alarms.length}</span></h3>
        <ul className="alarms">
          {alarms.map((a, i) => <li key={i}><button type="button" className={`alarm ${a.lvl}`} onClick={() => select(a.sel, { fly: true })}><Icon name={a.lvl} /><span>{a.text}</span></button></li>)}
        </ul>
      </div>
    </aside>
  );
}
