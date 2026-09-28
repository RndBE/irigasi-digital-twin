import { useMemo } from 'react';
import { hhmm, nf } from '../lib/format';
import { B, R, ROOT } from '../domain/network';
import { GMAP, gIdx, pctTxt } from '../domain/gates';
import { STATIONS, stIdx } from '../domain/stations';
import { WEIR, pondStatus } from '../domain/weir';
import { pola } from '../domain/status';
import { buildAlarms } from '../domain/alarms';
import { branchBalance, groupReliability, supplyOf } from '../domain/analysis';
import { Qa, grpK, stStatus } from '../domain/simulation';
import { OFF_SINCE, cur, sim } from '../domain/state';
import type { Sel } from '../domain/types';
import { getSimVersion, goToTwin } from '../store/twinStore';
import { PageHead } from '../components/PageHead';
import { BarRow, KpiCard, kTone } from '../components/Kpi';
import { Chart, Chip, Icon, Legend2, StatusChip } from '../components/Ui';

/** Satu baris daftar bangunan/objek yang membuka objeknya di digital twin. */
function AssetRow({ sel, name, sub, value, chip }: { sel: Sel; name: string; sub: string; value: string; chip?: React.ReactNode }) {
  return (
    <button type="button" className="asset" onClick={() => goToTwin(sel)}>
      <span className="asset__txt"><b>{name}</b><span>{sub}</span></span>
      <span className="asset__val">{value}{chip}</span>
    </button>
  );
}

/** Halaman Dashboard: ringkasan kondisi D.I. Leuwigoong dalam satu layar. */
export function DashboardPage() {
  const s = cur(), simV = getSimVersion(), times = sim.hist.map(h => h.t);
  const hour = sim.hist[Math.max(0, sim.hist.length - 7)];
  const alarms = useMemo(() => buildAlarms(s), [simV]);
  const rel = useMemo(() => groupReliability(sim.hist), [simV]);
  const branches = useMemo(() => branchBalance(s).sort((a, b) => b.need - a.need), [simV]);
  const supply = supplyOf(s), [pondLvl, pondTxt] = pondStatus(s.hMercu), [kLvl, kTxt] = pola(s.K);
  const crit = alarms.filter(a => a.lvl === 'crit').length, offline = STATIONS.filter(x => x.offline).length;
  const dQ = s.Qriver - hour.Qriver;
  const weirQ = ['w-banjir-1', 'w-banjir-2', 'w-banjir-3', 'w-kuras'].reduce((a, id) => a + s.gateQ[gIdx[id]], 0);
  const worst = rel.slice().sort((a, b) => grpK(s, a.g.gi) - grpK(s, b.g.gi)).slice(0, 6);
  const attention = STATIONS.filter(x => x.offline || ['warn', 'crit'].includes(stStatus(x, s)[0]));
  const types = (['AWLR', 'Debit', 'ARR'] as const).map(t => { const all = STATIONS.filter(x => x.type === t); return { t, all: all.length, on: all.filter(x => !x.offline).length }; });
  return (
    <section id="tab-dashboard" className="view" aria-labelledby="h-dashboard">
      <PageHead id="h-dashboard" icon="dashboard" title="Dashboard" sub={`Ringkasan D.I. Leuwigoong · ${hhmm(s.t)} WIB · data simulasi, diperbarui tiap 10 menit`} />

      <div className="kpis">
        <KpiCard icon="waves" label="Debit Sungai Cimanuk" value={nf(s.Qriver, 1)} unit="m³/s" tone={s.Qriver > 80 ? 'crit' : s.Qriver < 3 ? 'warn' : 'info'}
          note={`${dQ >= 0 ? '▲' : '▼'} ${nf(Math.abs(dQ), 1)} m³/s · 1 jam`} noteTone={dQ >= 0 ? 'up' : 'down'} meter={s.Qriver / 40}
          onClick={() => goToTwin({ kind: 'station', id: 'AWLR-CMK-01' })} />
        <KpiCard icon="weir" label="Muka air hulu bendung" value={`+${nf(B.el_mercu + s.hMercu)}`} unit="mdpl" tone={pondLvl}
          note={`${nf(s.hMercu)} m di atas mercu · ${pondTxt}`} meter={s.hMercu / WEIR.hTop}
          onClick={() => goToTwin({ kind: 'station', id: 'AWLR-CPG-02' })} />
        <KpiCard icon="gate" label="Pengambilan SI Copong" value={nf(s.Qin, 2)} unit="m³/s"
          note={`${nf(s.Qin / B.q_rencana * 100, 0)}% Q rencana ${nf(B.q_rencana)} m³/s`} meter={s.Qin / B.q_rencana}
          onClick={() => goToTwin({ kind: 'gate', id: 'g-intake' })} />
        <KpiCard icon="sprout" label="Faktor K D.I." value={nf(s.K)} tone={kLvl} note={kTxt} meter={s.K / 1.5} />
        <KpiCard icon="neraca" label="Air terbuang" value={nf(s.waste * 1000, 0)} unit="l/dt" tone={s.waste / Math.max(1e-6, supply) > 0.08 ? 'warn' : 'info'}
          note={`${nf(s.waste / Math.max(1e-6, supply) * 100, 1)}% dari pasokan ${nf(supply * 1000, 0)} l/dt`} meter={s.waste / Math.max(1e-6, supply) * 4} />
        <KpiCard icon="alert" label="Peringatan aktif" value={alarms.length} tone={crit ? 'crit' : alarms.length ? 'warn' : 'good'}
          note={`${crit} kritis · ${offline} stasiun offline`} noteTone={crit ? 'down' : undefined} meter={alarms.length / 12} />
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-h"><h3>Pasokan vs kebutuhan sawah · 24 jam</h3><div className="legend"><Legend2 a="Tersalur ke petak" b="Kebutuhan" /></div></div>
          <Chart config={{ height: 190, unit: 'l/dt', digits: 0 }} data={{ times, series: [
            { name: 'Tersalur ke petak', color: 'var(--s1)', values: sim.hist.map(h => h.got * 1000) },
            { name: 'Kebutuhan', color: 'var(--s2)', dash: true, values: sim.hist.map(h => h.need * 1000) }] }} />
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Faktor K D.I. · 24 jam</h3></div>
          <Chart config={{ height: 190, digits: 2, refs: [{ v: 0.75, label: 'giliran < 0,75' }, { v: 1, label: 'K = 1' }] }}
            data={{ times, series: [{ name: 'Faktor K', color: 'var(--s1)', values: sim.hist.map(h => h.K) }] }} />
        </div>
      </div>

      <div className="dash-grid dash-grid--3">
        <div className="panel">
          <h3>Bangunan utama</h3>
          <div className="assets">
            <AssetRow sel={{ kind: 'gate', id: 'w-banjir-2' }} name="Bendung Copong" sub={`Pintu banjir ${['w-banjir-1', 'w-banjir-2', 'w-banjir-3'].map(id => pctTxt(id, sim.open[id]) + '%').join(' · ')} · penguras ${pctTxt('w-kuras', sim.open['w-kuras'])}%`}
              value={`${nf(weirQ, 1)} m³/s`} chip={<Chip lvl={pondLvl}>{pondTxt}</Chip>} />
            <AssetRow sel={{ kind: 'gate', id: 'g-intake' }} name="Pintu pengambilan" sub={`3 pintu 3 × 1,15 m · bukaan ${sim.open['g-intake']}%`} value={`${nf(s.Qin, 2)} m³/s`} />
            <AssetRow sel={{ kind: 'station', id: 'AWLR-BCP-04' }} name="Bangunan bagi BCP.3" sub={`Limpas ke pembuang ${nf(s.spill * 1000, 0)} l/dt`}
              value={`${nf(s.sv[stIdx['AWLR-BCP-04']], 2)} m`} chip={<StatusChip s={stStatus(STATIONS[stIdx['AWLR-BCP-04']], s)} />} />
            {R[ROOT].ck.filter(c => R[c].gate).map(c => { const r = R[c], g = r.gate ? GMAP[r.gate] : null; return (
              <AssetRow key={c} sel={g ? { kind: 'gate', id: g.id } : { kind: 'ruas', id: r.k }} name={r.n} sub={g ? `Pintu bagi · bukaan ${sim.open[g.id]}%` : 'Saluran'} value={`${nf(Qa[c] * 1000, 0)} l/dt`} />
            ); })}
          </div>
        </div>
        <div className="panel">
          <h3>Pembagian air per cabang</h3>
          <p className="fine" style={{ margin: '-4px 0 10px' }}>Faktor K tiap cabang (tersalur ÷ butuh). Garis tipis = 0,75 dan 1,0.</p>
          <div className="brows">
            {branches.map(b => { const K = b.need > 0 ? b.got / b.need : 0; return (
              <BarRow key={b.key} name={b.key} frac={K / 1.5} tone={kTone(K)} marks={[0.75 / 1.5, 1 / 1.5]} value={nf(K)} title={`${b.key}: ${nf(b.got * 1000, 0)} dari ${nf(b.need * 1000, 0)} l/dt · ${nf(b.area, 0)} ha, ${b.groups} kelompok`} />
            ); })}
          </div>
        </div>
        <div className="panel">
          <h3>Peringatan aktif <span className="count">{alarms.length}</span></h3>
          <ul className="alarms">
            {alarms.slice(0, 7).map((a, i) => <li key={i}><button type="button" className={`alarm ${a.lvl}`} onClick={() => goToTwin(a.sel)}><Icon name={a.lvl} /><span>{a.text}</span></button></li>)}
            {!alarms.length && <li className="fine">Tidak ada peringatan.</li>}
          </ul>
        </div>
      </div>

      <div className="dash-grid">
        <div className="panel">
          <h3>Kelompok paling kekurangan air</h3>
          <div className="brows">
            {worst.map(x => { const K = grpK(s, x.g.gi); return (
              <BarRow key={x.g.id} name={x.g.short} frac={K / 1.5} tone={kTone(K)} marks={[0.75 / 1.5, 1 / 1.5]} onClick={() => goToTwin({ kind: 'grp', id: x.g.id })}
                value={<>{nf(K)} <span className="brow__sub">{nf(x.okShare * 100, 0)}% waktu ≥ 0,75</span></>} title={`${x.g.name} · ${pola(K)[1]}`} />
            ); })}
          </div>
        </div>
        <div className="panel">
          <h3>Status stasiun telemetri</h3>
          <div className="stn-types">
            {types.map(t => <div key={t.t} className="stn-type"><span className="stn-type__k">{t.t}</span><span className="stn-type__v">{t.on}<small>/{t.all}</small></span><span className="stn-type__s">online</span></div>)}
          </div>
          <div className="assets">
            {attention.map(x => { const k = stIdx[x.id]; return (
              <AssetRow key={x.id} sel={{ kind: 'station', id: x.id }} name={x.name} sub={x.offline ? `Tidak mengirim sejak ${hhmm(OFF_SINCE)} WIB` : x.where}
                value={x.offline ? '—' : `${nf(s.sv[k], x.main.d)} ${x.main.unit}`} chip={<StatusChip s={stStatus(x, s)} />} />
            ); })}
          </div>
        </div>
      </div>
    </section>
  );
}
