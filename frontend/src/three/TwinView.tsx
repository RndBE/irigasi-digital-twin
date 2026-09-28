import { useEffect, useRef, useState } from 'react';
import { GMAP, pctTxt } from '../domain/gates';
import { liveView, steadyView } from '../domain/simulation';
import { cur, sim } from '../domain/state';
import type { LayerKey } from '../domain/types';
import { attachScene, draftOpen, flyTo, openGate, select, toggleLayer, ui } from '../store/twinStore';
import { GateModal } from '../components/GateModal';
import { mountTwinScene, type TwinScene } from './twinScene';

const VIEW_BUTTONS: [string, string][] = [['overview', 'Ikhtisar'], ['bendung', 'Bendung Copong'], ['bagi', 'Bagi BCP.3'], ['hilir', 'Hilir SS Lewo'], ['situ', 'Situ Bagendit']];
const LAYER_BUTTONS: [LayerKey, string][] = [['st', 'Label sensor'], ['gt', 'Label pintu'], ['cells', 'Petak sawah']];

/**
 * Pembungkus React untuk diorama 3D. Adegan dibangun sekali; tiap render hanya menyalin keadaan simulasi
 * (atau pratinjau bukaan pintu) ke adegan, jadi langkah simulasi tidak membangun ulang geometri apa pun.
 */
export function TwinView() {
  const host = useRef<HTMLDivElement>(null), labels = useRef<HTMLDivElement>(null), scene = useRef<TwinScene | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = mountTwinScene({ host: host.current!, labelHost: labels.current!, callbacks: { onSelect: sel => select(sel), onOpenGate: id => openGate(id) } });
    if (typeof r === 'string') { setError(r); return; }
    scene.current = r;
    attachScene({ focusOn: sel => r.focusOn(sel), flyTo: name => r.flyTo(name) });
    return () => { attachScene(null); scene.current = null; };
  }, []);

  useEffect(() => {
    const sc = scene.current; if (!sc) return;
    const open = draftOpen();
    sc.update({ view: ui.draft ? steadyView(open) : liveView(), open, snap: cur(), sel: ui.sel, layers: ui.layers });
    sc.setPaused(ui.gateId != null);
  });

  const d = ui.draft, dg = d ? GMAP[d.id] : null;
  return (
    <div className="stage">
      <div className="scene" ref={host}>
        <div className="labels" ref={labels} />
        <div className="ov tl" role="group" aria-label="Sudut pandang">
          {VIEW_BUTTONS.map(([v, label]) => <button key={v} className="cbtn" type="button" onClick={() => flyTo(v)}>{label}</button>)}
        </div>
        <div className="ov tr" role="group" aria-label="Lapisan">
          {LAYER_BUTTONS.map(([k, label]) => <button key={k} className="cbtn" type="button" aria-pressed={ui.layers[k]} onClick={() => toggleLayer(k)}>{label}</button>)}
        </div>
        <div className="ov bl">
          <div className="glass legend-ov">
            <span className="lt">Warna petak = Faktor K</span>
            <div className="kramp" aria-hidden="true" />
            <div className="kticks"><span>0,3</span><span>0,6</span><span>0,85</span><span>1,0</span><span>1,3</span></div>
            <span>Garis air makin cepat = debit makin besar. Air saluran cokelat dan dangkal = kurang pasok. Petak jauh = kiri, dekat = kanan. Klik pintu untuk model 3D.</span>
          </div>
        </div>
        <div className="ov br">
          <span className="glass hint">Seret: putar · Scroll: zoom · Klik objek</span>
          <span className="glass hint">Diorama 3D, tidak berskala</span>
        </div>
        {error && <div className="fallback"><div><strong>Tampilan 3D tidak bisa dimuat</strong><br />{error}<br />Panel data di sekitarnya tetap berjalan.</div></div>}
      </div>
      <div className="preview-banner" hidden={!dg}>
        {d && dg && `Pratinjau setelah air tiba: ${dg.name} ${pctTxt(dg.id, sim.open[dg.id])}% → ${pctTxt(dg.id, d.val)}%`}
      </div>
      <GateModal />
    </div>
  );
}
