import { useMemo } from 'react';
import { hhmm, nf, tanggal } from '../lib/format';
import { B } from '../domain/network';
import { STATIONS } from '../domain/stations';
import { SCEN } from '../domain/scenarios';
import { pondStatus } from '../domain/weir';
import { buildAlarms } from '../domain/alarms';
import { cur, sim } from '../domain/state';
import type { Lvl } from '../domain/types';
import { getSimVersion, setNav, setSpeed, togglePlay, ui } from '../store/twinStore';
import { NavIcon } from './NavIcon';

/** Bilah status di atas konten: mode peraga, besaran kunci, jumlah peringatan, jam simulasi, dan kendali putar ulang. */
export function TopBar() {
  const s = cur(), simV = getSimVersion();
  const alarms = useMemo(() => buildAlarms(s).length, [simV]);
  const online = STATIONS.filter(x => !x.offline).length;
  const [pond] = pondStatus(s.hMercu);
  return (
    <div className="topbar">
      <button className="topbar__menu" type="button" aria-label="Buka menu" onClick={() => setNav(true)}><NavIcon name="menu" /></button>
      <span className="topbar__brand" title="Geometri dan kebutuhan air dari data asli; debit dan sensor disimulasikan"><span className="topbar__pulse" />Mode peraga · sensor simulasi</span>
      <span className="topbar__div" />
      <Kv k="Skenario" v={SCEN[sim.scenario].label} hide="opt" />
      <Kv k="Muka air hulu" v={`+${nf(B.el_mercu + s.hMercu)} mdpl`} tone={pond} />
      <Kv k="Debit Cimanuk" v={`${nf(s.Qriver, 1)} m³/s`} hide="opt" />
      <Kv k="Stasiun online" v={`${online} / ${STATIONS.length}`} tone={online < STATIONS.length ? 'warn' : 'good'} hide="md" />
      <Kv k="Peringatan aktif" v={String(alarms)} tone={alarms ? 'crit' : 'good'} />
      <span className="topbar__clock"><b>{hhmm(s.t)} WIB</b><span className="topbar__date">{tanggal(s.t)}</span></span>
      <div className="seg" role="group" aria-label="Kontrol replay">
        <button type="button" aria-pressed={!ui.playing} onClick={togglePlay}>{ui.playing ? 'Jeda' : 'Lanjut'}</button>
        {[1, 6].map(x => <button key={x} type="button" aria-pressed={ui.speed === x} onClick={() => setSpeed(x)}>{x}×</button>)}
      </div>
    </div>
  );
}

/** Satu besaran di bilah status; `hide` menyembunyikannya lebih dulu saat layar menyempit. */
function Kv({ k, v, tone, hide }: { k: string; v: string; tone?: Lvl; hide?: 'opt' | 'md' }) {
  return <div className={`topbar__kv${hide ? ' topbar__kv--' + hide : ''}`}><span className="topbar__kv-k">{k}</span><span className={`topbar__kv-v${tone && tone !== 'good' ? ' ' + tone : ''}`}>{v}</span></div>;
}
