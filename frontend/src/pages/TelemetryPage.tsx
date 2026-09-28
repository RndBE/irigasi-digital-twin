import { hhmm, nf } from '../lib/format';
import { B } from '../domain/network';
import { STATIONS, stIdx } from '../domain/stations';
import { battNow, stLast, stStatus } from '../domain/simulation';
import { OFF_SINCE, cur, sim } from '../domain/state';
import type { Sel } from '../domain/types';
import { goToTwin } from '../store/twinStore';
import { Chart, StatusChip } from '../components/Ui';
import { PageHead } from '../components/PageHead';

/** Baris tabel yang membuka objeknya di digital twin (klik atau Enter). */
export function RowLink({ sel, children }: { sel: Sel; children: React.ReactNode }) {
  return <tr className="click" tabIndex={0} onClick={() => goToTwin(sel)} onKeyDown={e => { if (e.key === 'Enter') goToTwin(sel); }}>{children}</tr>;
}
export function Stat({ label, value, unit }: { label: string; value: React.ReactNode; unit: string }) {
  return <div className="stat"><div className="lab">{label}</div><div className="val">{value}<span className="u">{unit}</span></div></div>;
}

/** Tab Telemetri: ringkasan stasiun, grafik 24 jam, dan tabel semua stasiun. */
export function TelemetryPage() {
  const s = cur(), times = sim.hist.map(h => h.t);
  const lv = STATIONS.map(x => stStatus(x, s)[0]), att = lv.filter(l => l === 'warn' || l === 'crit').length;
  return (
    <section id="tab-telemetri" className="view" aria-labelledby="h-telemetri">
      <PageHead id="h-telemetri" icon="telemetri" title="Telemetri" sub={`${STATIONS.length} stasiun AWLR, debit, dan penakar hujan · kiriman tiap 10 menit`} />
      <div className="sumrow">
        <Stat label="Stasiun terpasang" value={STATIONS.length} unit="" />
        <Stat label="Mengirim data" value={STATIONS.length - lv.filter(l => l === 'serious').length} unit={`/ ${STATIONS.length}`} />
        <Stat label="Perlu perhatian" value={att} unit="stasiun" />
        <Stat label="Interval kirim" value={10} unit="menit" />
      </div>
      <div className="charts3">
        <div className="panel"><h3>Debit Sungai Cimanuk</h3><p className="sub">AWLR CMK-01, hulu Bendung Copong · m³/s · 24 jam</p>
          <Chart config={{ height: 170, unit: 'm³/s', digits: 1 }} data={{ times, series: [{ name: 'Debit Cimanuk', color: 'var(--s1)', values: sim.hist.map(h => h.Qriver) }] }} /></div>
        <div className="panel"><h3>Debit pengambilan SI Copong</h3><p className="sub">FLOW SIC-03, hilir kantong lumpur · m³/s · 24 jam</p>
          <Chart config={{ height: 170, unit: 'm³/s', digits: 2, refs: [{ v: B.q_rencana, label: `Q rencana ${nf(B.q_rencana)}` }] }} data={{ times, series: [{ name: 'Debit SI Copong', color: 'var(--s1)', values: sim.hist.map(h => h.Qin) }] }} /></div>
        <div className="panel"><h3>Intensitas hujan</h3><p className="sub">ARR LWG-15 Leuwigoong · mm/jam · 24 jam</p>
          <Chart config={{ height: 170, unit: 'mm/jam', digits: 1, kind: 'bar' }} data={{ times, series: [{ name: 'Hujan', color: 'var(--s1)', values: sim.hist.map(h => h.rain) }] }} /></div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>ID</th><th>Stasiun</th><th>Jenis</th><th className="num">Nilai terakhir</th><th className="num">Nilai kedua</th><th>Status</th><th className="num">Baterai</th><th className="num">Sinyal</th><th>Komunikasi</th><th className="num">Update</th></tr></thead>
          <tbody>
            {STATIONS.map(stn => {
              const ls = stLast(stn), k = stIdx[stn.id];
              return <RowLink key={stn.id} sel={{ kind: 'station', id: stn.id }}>
                <td className="id">{stn.id}</td><td><div className="nm">{stn.name}</div><div className="ds">{stn.where}</div></td><td>{stn.type}</td>
                <td className="num">{nf(ls.sv[k], stn.main.d)} {stn.main.unit}</td><td className="num">{nf(ls.sv2[k], stn.sub.d)} {stn.sub.unit}</td><td><StatusChip s={stStatus(stn, s)} /></td>
                <td className="num">{nf(battNow(stn), 1)} V</td><td className="num">{stn.sig == null ? '—' : stn.offline ? '—' : stn.sig + ' dBm'}</td><td>{stn.comm === 'Satelit' ? 'Satelit (Iridium)' : stn.comm}</td><td className="num">{hhmm(stn.offline ? OFF_SINCE : s.t)}</td>
              </RowLink>;
            })}
          </tbody>
        </table>
      </div>
      <p className="fine">Klik baris untuk melihat stasiun di digital twin. Titik stasiun dipilih di bangunan bagi/sadap nyata pada jaringan D.I. Leuwigoong; nilainya simulasi. Logger mengirim tiap 10 menit; stasiun dianggap offline bila 3 kiriman berturut-turut tidak masuk.</p>
    </section>
  );
}
