import { useEffect, useRef, useState } from 'react';
import { nf } from '../lib/format';
import { B } from '../domain/network';
import { GMAP, gIdx, pctTxt } from '../domain/gates';
import { WEIR, pondStatus } from '../domain/weir';
import { pola } from '../domain/status';
import { gateLevels, type GateSpec } from '../domain/gateSpec';
import { stVal, steadyView } from '../domain/simulation';
import { cur, sim } from '../domain/state';
import type { Gate } from '../domain/types';
import { applyDraft, cancelDraft, closeGate, draftOpen, setDraft, ui } from '../store/twinStore';
import { createGateViewer, type GateViewer } from '../three/gateViewer';
import type { GateRefs } from '../three/gateModel';
import { sceneReady } from '../three/twinScene';
import { shownOpen } from './GateControl';
import { Rd } from './Ui';

/** Jendela detail pintu: model 3D pintu pada ukuran rencananya, bacaan, penggeser bukaan, dan spesifikasi. */
export function GateModal() {
  const id = ui.gateId, G = id != null && sceneReady() ? GMAP[id] : null;
  const viewHost = useRef<HTMLDivElement>(null), viewer = useRef<GateViewer | null>(null), closeBtn = useRef<HTMLButtonElement>(null);
  const [refs, setRefs] = useState<GateRefs | null>(null);

  // model dibangun ulang tiap kali pintu lain dibuka; renderer dibuat sekali
  useEffect(() => {
    if (!G) { viewer.current?.stop(); return; }
    if (!viewer.current) viewer.current = createGateViewer(viewHost.current!);
    setRefs(viewer.current.show(G));
    viewer.current.start();
    closeBtn.current?.focus();
  }, [G]);
  useEffect(() => {
    if (!G) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeGate(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [G]);

  const spec = refs && G ? refs.spec : null;
  // bukaan diterapkan, muka air, dan daun bayangan pratinjau ke model tiap render
  useEffect(() => {
    if (!G || !spec || !viewer.current) return;
    const o = sim.open[G.id], dv = ui.draft && ui.draft.id === G.id ? ui.draft.val : null;
    viewer.current.setState(o, gateLevels(G, spec, o), dv);
  });

  return (
    <div className="gmodal" hidden={!G} onClick={e => { if (e.target === e.currentTarget) closeGate(); }}>
      <div className="gm-card" role="dialog" aria-modal="true" aria-labelledby="gmTitle">
        <div className="gm-head">
          <div><div className="eyebrow">{G?.role}</div><h2 id="gmTitle">{G?.name}</h2><div className="d-sub">{G?.sub}</div></div>
          <button ref={closeBtn} type="button" className="gm-close" aria-label="Tutup detail pintu" onClick={closeGate}>×</button>
        </div>
        <div className="gm-body">
          <div className="gm-view" ref={viewHost}>
            <div className="gm-lights">{spec && (spec.motor ? ['R', 'S', 'T'].map((t, k) => <span key={t} className={`gm-lamp l${k}`}><b>{t}</b>ON</span>) : <span className="gm-lamp man"><b>MANUAL</b>stang ulir</span>)}</div>
            <span className="gm-hint">Seret: putar · Scroll: zoom</span>
          </div>
          {G && spec && <GateSide G={G} spec={spec} refs={refs!} />}
        </div>
      </div>
    </div>
  );
}

function GateSide({ G, spec, refs }: { G: Gate; spec: GateSpec; refs: GateRefs }) {
  const s = cur(), gk = gIdx[G.id], o = sim.open[G.id], dv = ui.draft && ui.draft.id === G.id ? ui.draft.val : null;
  const lv = gateLevels(G, spec, o), K = G.kind === 'suplesi' ? null : s.gateK[gk], v = shownOpen(G);
  let readings;
  if (spec.weir) {
    const b = dv != null ? steadyView(draftOpen()) : null, [, txt] = pondStatus(s.hMercu);
    readings = <>
      <Rd k="Bukaan" v={`${nf(o, 1)}%`} u={`${nf(lv.a * 100, 0)} cm${dv != null ? ` → ${nf(dv, 1)}%` : ''}`} />
      <Rd k="Debit lewat pintu" v={nf(s.gateQ[gk], 2)} u={`m³/s${b ? ` → ${nf(b.wq[G.w!.bay], 2)}` : ''}`} />
      <Rd k="TMA hulu" v={nf(B.el_mercu + s.hMercu)} u={`mdpl${b ? ` → ${nf(B.el_mercu + b.H)}` : ''}`} />
      <Rd k="Di atas mercu" v={nf(s.hMercu)} u={`m · ${txt}`} />
      <Rd k="Debit Cimanuk" v={nf(s.Qriver, 1)} u="m³/s" />
      <Rd k="Debit intake" v={nf(s.Qin, 2)} u={`m³/s${b ? ` → ${nf(b.Qin, 2)}` : ''}`} />
    </>;
  } else {
    readings = <>
      <Rd k="Bukaan" v={`${o}%`} u={`${nf(lv.a * 100, 0)} cm${dv != null ? ` → ${dv}%` : ''}`} />
      <Rd k="Debit lewat pintu" v={nf(s.gateQ[gk] * 1000, 0)} u="l/dt" />
      <Rd k="TMA hulu pintu" v={nf(lv.hU)} u="m dari ambang" />
      <Rd k="TMA hilir pintu" v={nf(lv.hD)} u="m dari ambang" />
      {G.kind === 'suplesi' ? <Rd k="Kapasitas saluran" v="250" u="l/dt" /> : <Rd k="Kebutuhan hilir" v={nf(s.gateNeed[gk] * 1000, 0)} u="l/dt" />}
      <Rd k="Faktor K hilir" v={K == null ? '—' : nf(K)} u={K == null ? 'suplesi' : pola(K)[1]} />
      {refs.stn && <Rd k={refs.stn.code} v={nf(stVal(refs.stn, s), refs.stn.main.d)} u={refs.stn.main.unit} />}
    </>;
  }
  const wz = spec.weir;
  return (
    <div className="gm-side">
      <div className="readings">{readings}</div>
      <div className="ctrl"><div className="ctrl-h"><span>Atur bukaan</span><output>{pctTxt(G.id, v)}% · {Math.round(v / 100 * G.maxCm)} cm</output></div>
        <input type="range" min="0" max="100" step={G.w ? 0.1 : 1} value={v} disabled={sim.auto} aria-label="Bukaan pintu dalam persen" onChange={e => setDraft(G.id, +e.currentTarget.value)} />
        <div className="btns"><button className="btn primary" type="button" disabled={dv == null} onClick={() => applyDraft(G.id)}>Terapkan ke twin</button><button className="btn" type="button" disabled={dv == null} onClick={cancelDraft}>Batal</button></div>
        <p className="fine">Daun kuning transparan = posisi yang sedang dipratinjau. Di sistem nyata, perintah ke pintu butuh otorisasi operator.</p></div>
      <div className="gm-spec">
        <h3 className="h3">Spesifikasi</h3>
        {wz ? <dl className="gm-dl">
          <dt>Tipe</dt><dd>{wz.kind === 'banjir' ? 'Pintu sorong baja bendung gerak, di atas mercu' : 'Pintu penguras (pembilas) di depan intake'}</dd>
          <dt>Lebar daun</dt><dd>{nf(wz.b, 1)} m</dd><dt>Tinggi daun</dt><dd>{nf(wz.leafH, 1)} m</dd>
          <dt>Ambang</dt><dd>{wz.sill ? `${nf(-wz.sill, 1)} m di bawah mercu` : 'Sama dengan mercu'} (mercu +{nf(B.el_mercu, 2)} mdpl)</dd>
          <dt>Muka air normal</dt><dd>+{nf(B.el_mercu + WEIR.hN, 2)} mdpl, {nf(WEIR.hN, 1)} m di atas mercu</dd>
          <dt>Penggerak</dt><dd>Motor listrik 3 fasa + roda tangan darurat</dd>
          <dt>Sumber ukuran</dt><dd>Aprilia &amp; Permana (2021): mercu 3 × 12,5 m, pintu 3,5 m, pembilas 5 m × 8 m</dd>
        </dl> : <dl className="gm-dl">
          <dt>Tipe</dt><dd>{spec.intake ? 'Pintu sorong baja, 3 lubang, tiap lubang 2 daun: muka hulu (roda tangan) dan muka hilir (motor) dinding penahan' : spec.leaves > 1 ? 'Pintu sorong baja, 2 daun' : 'Pintu sorong baja'}</dd>
          <dt>Lebar daun</dt><dd>{spec.leaves} × {nf(spec.bw)} m</dd><dt>Tinggi daun</dt><dd>{nf(spec.leafH)} m</dd>
          <dt>Angkat maks.</dt><dd>{nf(spec.maxLift)} m</dd><dt>Penggerak</dt><dd>{spec.motor ? 'Motor listrik 3 fasa + roda tangan darurat' : 'Manual, stang ulir + roda putar'}</dd>
          <dt>Sumber ukuran</dt><dd>{spec.intake ? 'Data Bendung Copong (intake 3 × 3 m × 1,15 m)' : spec.r.b > 0.05 ? `Rencana saluran b ${nf(spec.r.b)} m × h ${nf(spec.r.h)} m` : 'Asumsi menurut jenis saluran'}</dd>
        </dl>}
      </div>
    </div>
  );
}

