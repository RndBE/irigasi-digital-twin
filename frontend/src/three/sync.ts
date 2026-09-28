import * as THREE from 'three';
import { clamp, nf } from '../lib/format';
import { GRPID, R, RK, ROOT } from '../domain/network';
import { GATES, GMAP, pctTxt } from '../domain/gates';
import { STATIONS, STMAP, stIdx } from '../domain/stations';
import { stStatus } from '../domain/simulation';
import type { OpenMap, SceneView, Sel, Snapshot } from '../domain/types';
import { C, S, T3, kRGB } from './context';
import { lineMid } from './layout';

/** Salin keadaan simulasi ke adegan: warna dan aliran air, warna petak, pintu, muka air bendung, lampu stasiun. */
const lerpHex = (a: number, b: number, f: number) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(f, 0, 1));
const waterColor = (K: number, flow: boolean) => (flow ? (K >= 0.9 ? new THREE.Color(0x3f6d68) : lerpHex(0x94794c, 0x3f6d68, (K - 0.45) / 0.45)) : new THREE.Color(0x76674a)).convertSRGBToLinear();
const SENSOR_COL = { good: 0x1fae4b, warn: 0xf2a900, crit: 0xd03b3b, serious: 0x6d7476 };

export function syncScene(view: SceneView, open: OpenMap, cs: Snapshot, sel: Sel | null) {
  if (!S.ready) return;
  GATES.forEach(G => { if (S.gates[G.id]) S.gates[G.id].target = open[G.id] / 100; });
  const { Q, Kt, sK } = view, selR = sel && sel.kind === 'ruas' ? RK[sel.id].i : -1;
  for (const k in S.canal) {
    const i = +k, r = R[i], c = S.canal[k], q = Q[i] || 0;
    const ratio = r.via ? q / 0.25 : q / (r.cap || 0.01), K = r.via ? 1 : r.type === 'T' ? Kt[i] : sK[i], flow = q > 0.0005;
    c.speed = 0.06 + 1.6 * clamp(ratio * 1.6, 0, 1.3);
    c.level = 0.03 + (c.D.T - 0.1) * (flow ? clamp(0.2 + 0.8 * Math.sqrt(clamp(ratio * 1.4, 0, 1.25)), 0.15, 1.05) : 0.06);
    c.mat.color.copy(waterColor(K, flow)); c.mat.opacity = flow ? 0.93 : 0.75;
    c.mat.emissive.setHex(i === selR ? 0x0d4a52 : 0x000000);
  }
  const col = new THREE.Color(), grpSel = sel && sel.kind === 'grp' ? GRPID[sel.id].gi : -1;
  for (let k = 0; k < S.plotOf.length; k++) {
    const m = S.plotOf[k], rgb = kRGB(Kt[m]), f = S.plotVary[k] * (m === selR || R[m].grp === grpSel ? 1.16 : 1);
    col.setRGB(Math.min(1, rgb[0] * f), Math.min(1, rgb[1] * f), Math.min(1, rgb[2] * f)).convertSRGBToLinear(); S.plots.setColorAt(k, col);
  }
  S.plots.instanceColor!.needsUpdate = true;
  const flood = clamp((view.Qriver - 40) / 70, 0, 1);
  S.M.river.color.copy(lerpHex(0x6c6749, 0x86623e, flood).convertSRGBToLinear());
  S.riverSpeed = 0.25 + clamp(view.Qriver / 30, 0, 4);
  const qs = Math.max(0, view.Qriver - (cs.Qin || 0));
  // weir gates at the operator's openings, jets by the flow through each gate, pond level from the weir balance
  const wq = view.wq || [0, 0, 0, 0];
  S.weir.forEach(g => { g.target = (open[g.id] || 0) / 100; });
  S.weirJets.forEach((m, k) => { m.opacity = wq[k] < 0.05 ? 0 : clamp(0.18 + wq[k] / (k < 3 ? 30 : 14), 0.18, 0.9); });
  if (view.H != null) S.pondY = clamp((view.H - 3.26) * 0.2057, -1.1, 0.4);
  if (S.inJet) { const q = view.Q ? view.Q[ROOT] : 0; S.inJet.opacity = q < 0.02 ? 0 : clamp(0.22 + q / 2.4 * 0.45, 0.22, 0.7); }
  if (S.klJet) { const q = view.Q ? view.Q[ROOT] : 0; S.klJet.opacity = q < 0.02 ? 0 : clamp(0.12 + q / 2.4 * 0.33, 0.12, 0.45); }
  S.M.foam.opacity = clamp(0.16 + qs / 90, 0.16, 0.85); S.foamMat2.opacity = clamp(0.05 + qs / 200, 0.05, 0.5);
  S.rainLevel = clamp(view.rain / 22, 0, 1);
  STATIONS.forEach(stn => {
    const m = S.sensors[stn.id]; if (!m) return;
    const [lvl] = stStatus(stn, cs), c = C(SENSOR_COL[lvl] || SENSOR_COL.good);
    m.led.material.color.copy(c); m.led.material.emissive.copy(c); m.led.material.emissiveIntensity = lvl === 'serious' ? 0.1 : 1.6;
    m.alarm = lvl === 'crit' || lvl === 'warn'; m.ring.material.color.setHex(SENSOR_COL[lvl] || SENSOR_COL.good);
  });
}
/** Nilai di label stasiun dan bukaan di label pintu. */
export function updateTags(s: Snapshot, open: OpenMap) {
  if (!S.ready) return;
  STATIONS.forEach(stn => { const el = S.tags[stn.id]; if (!el) return; const [lvl] = stStatus(stn, s), k = stIdx[stn.id]; el.dataset.st = lvl; el.querySelector('.tv')!.textContent = stn.offline ? 'offline' : `${nf(s.sv[k], stn.main.d)} ${stn.main.unit}`; });
  GATES.forEach(G => { const el = S.tags[G.id]; if (el) el.querySelector('.tv')!.textContent = `${pctTxt(G.id, open[G.id])}%`; });
}

/** Posisi sorotan objek: [x, z, skala cincin, tinggi cincin]. */
export function selPos(sel: Sel | null): [number, number, number, number] | null {
  if (!sel || !T3.lines) return null;
  if (sel.kind === 'station') { const s = STMAP[sel.id]; return s.pos3 ? [s.pos3[0], s.pos3[1], 1, (s.y3 || 0) + 0.15] : null; }
  if (sel.kind === 'gate') { const g = GMAP[sel.id]; return g.pos3 ? [g.pos3[0], g.pos3[1], g.w ? 1.35 : g.id === 'g-intake' ? 2.2 : 1, g.w ? 2.16 : g.id === 'g-intake' ? 1.1 : 0.62] : null; }
  if (sel.kind === 'ruas') { const r = RK[sel.id]; if (T3.lines[r.i]) { const p = lineMid(r.i)!; return [p[0], p[1], 1.6, T3.lines[r.i].D.T + 0.08]; } if (T3.plot[r.i]) return [...T3.plot[r.i], 1.3, 0.14]; if (r.via && T3.inflow[r.i]) return [...T3.inflow[r.i], 1, 0.5]; return null; }
  if (sel.kind === 'grp') { const p = lineMid(GRPID[sel.id].ri); return p ? [p[0], p[1], 2.4, 0.6] : null; }
  return null;
}
/** Cincin sorotan di adegan dan tanda pilih pada label. */
export function markSelection(sel: Sel | null) {
  for (const id in S.tags) S.tags[id].classList.toggle('sel', !!sel && sel.id === id);
  if (!S.ready || !sel) return;
  const p = selPos(sel);
  S.selRing.visible = !!p;
  if (p) { S.selRing.position.set(p[0], p[3], p[1]); S.selScale = p[2]; }
}
