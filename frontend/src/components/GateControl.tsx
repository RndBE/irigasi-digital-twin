import { Fragment } from 'react';
import { jam, nf } from '../lib/format';
import { B, R, subtreeGroups } from '../domain/network';
import { pctTxt } from '../domain/gates';
import { WEIR } from '../domain/weir';
import { grpK, steadyView } from '../domain/simulation';
import { cur, sim } from '../domain/state';
import type { Gate } from '../domain/types';
import { applyDraft, cancelDraft, draftOpen, setDraft, ui } from '../store/twinStore';

/** Bukaan yang sedang ditampilkan untuk pintu ini: pratinjau bila ada, bukaan kini bila tidak. */
export const shownOpen = (g: Gate) => ui.draft && ui.draft.id === g.id ? ui.draft.val : sim.open[g.id];

/** Penggeser bukaan pintu dengan pratinjau "jika" dan tombol terapkan. */
export function GateControl({ g }: { g: Gate }) {
  const v = shownOpen(g);
  return (
    <div className="ctrl">
      <div className="ctrl-h"><span>Atur bukaan</span><output htmlFor="gateSlider">{pctTxt(g.id, v)}% · {Math.round(v / 100 * g.maxCm)} cm</output></div>
      <input type="range" id="gateSlider" min="0" max="100" step={g.w ? 0.1 : 1} value={v} disabled={sim.auto} aria-label={`Bukaan ${g.name} dalam persen`} onChange={e => setDraft(g.id, +e.currentTarget.value)} />
      <div><GatePrediction g={g} /></div>
      <div className="btns">
        <button className="btn primary" type="button" disabled={!ui.draft || sim.auto} onClick={() => applyDraft(g.id)}>Terapkan ke twin</button>
        <button className="btn" type="button" onClick={cancelDraft}>Batal</button>
      </div>
      <p className="fine">Di demo, perintah hanya mengubah model. Di sistem nyata, perintah ke pintu fisik butuh otorisasi operator dan konfirmasi dua langkah.</p>
    </div>
  );
}

/** Kondisi kini dibanding kondisi setelah air tiba untuk bukaan yang dipratinjau. */
function GatePrediction({ g }: { g: Gate }) {
  const s = cur(), b = steadyView(draftOpen());
  if (g.w) {
    const w = g.w, b0 = steadyView(sim.open);
    const same = (x: number, y: number, d: number) => Math.abs(y - x) < Math.pow(10, -d) / 2;
    const neu = (x: number, y: number, d: number) => same(x, y, d) ? '' : 'chg';
    const good = (x: number, y: number, d: number, better: boolean) => same(x, y, d) ? '' : 'chg ' + (better ? 'up' : 'down');
    const row = (k: string, x: number, y: number, d: number, c: string) => <Fragment key={k}><span>{k}</span><span className="n">{nf(x, d)}</span><span className="arr">→</span><span className={`n ${c}`}>{nf(y, d)}</span></Fragment>;
    return <>
      <p className="note-lag">"Jika" = kondisi setelah muka air hulu bendung menyesuaikan (±30 menit). Debit intake naik-turun mengikuti muka air.</p>
      <div className="pred"><span className="ph">Besaran</span><span className="ph n">Kini</span><span /><span className="ph n">Jika</span>
        {row('TMA hulu (mdpl)', B.el_mercu + b0.H, B.el_mercu + b.H, 2, good(b0.H, b.H, 2, Math.abs(b.H - WEIR.hN) < Math.abs(b0.H - WEIR.hN)))}
        {row('Debit pintu ini (m³/s)', b0.wq[w.bay], b.wq[w.bay], 2, neu(b0.wq[w.bay], b.wq[w.bay], 2))}
        {row('Debit intake (m³/s)', b0.Qin, b.Qin, 2, good(b0.Qin, b.Qin, 2, b.Qin > b0.Qin))}
        <span className="tot">K D.I.</span><span className="n tot">{nf(b0.K)}</span><span className="arr tot">→</span><span className={`n tot ${good(b0.K, b.K, 2, Math.abs(b.K - 1) < Math.abs(b0.K - 1))}`}>{nf(b.K)}</span>
      </div>
    </>;
  }
  const grps = subtreeGroups(g.ri).sort((x, y) => y.area - x.area).slice(0, 6);
  const cls = (x: number, y: number) => Math.abs(y - x) < 0.005 ? '' : 'chg ' + (Math.abs(y - 1) < Math.abs(x - 1) ? 'up' : 'down');
  const r = R[g.ri], lagH = Math.max(0.2, r.tA - (r.p >= 0 ? R[r.p].tA : 0));
  return <>
    <p className="note-lag">"Jika" = kondisi setelah air tiba. Perubahan di pintu ini butuh ±{jam(lagH)} untuk mencapai ujung {r.n}.</p>
    <div className="pred"><span className="ph">Kelompok hilir</span><span className="ph n">Kini</span><span /><span className="ph n">Jika</span>
      {grps.map(x => { const a = grpK(s, x.gi), c = b.grp[x.gi]; return <Fragment key={x.id}><span>{x.short}</span><span className="n">{nf(a)}</span><span className="arr">→</span><span className={`n ${cls(a, c)}`}>{nf(c)}</span></Fragment>; })}
      <span className="tot">K D.I.</span><span className="n tot">{nf(s.K)}</span><span className="arr tot">→</span><span className={`n tot ${cls(s.K, b.K)}`}>{nf(b.K)}</span>
      <span>Air terbuang (l/dt)</span><span className="n">{nf(s.waste * 1000, 0)}</span><span className="arr">→</span><span className={`n ${Math.abs(b.waste - s.waste) > 0.002 ? 'chg ' + (b.waste < s.waste ? 'up' : 'down') : ''}`}>{nf(b.waste * 1000, 0)}</span>
    </div>
  </>;
}
