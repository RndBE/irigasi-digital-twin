import * as THREE from 'three';
import { R, ROOT } from '../domain/network';
import { GATES } from '../domain/gates';
import { STATIONS } from '../domain/stations';
import type { LayerKey, Sel } from '../domain/types';
import { LOC_X, S, T3, riverX, type Label3D } from './context';

/**
 * Label HTML yang menempel di adegan: nama tempat, label stasiun (kode + nilai), dan label pintu (bukaan).
 * Label jauh disembunyikan menurut jarak kamera (`lod`); posisinya dihitung ulang tiap bingkai.
 */
const ALIGN = { c: 'translate(-50%,calc(-100% - 4px))', r: 'translate(8px,-50%)', l: 'translate(calc(-100% - 8px),-50%)', m: 'translate(-50%,-50%)' };
const GATE_ICON = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 11V2.5h9V11" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 5h5v4h-5z" fill="currentColor"/><path d="M6 1v2" stroke="currentColor" stroke-width="1.3"/></svg>';

function addLabel(el: HTMLElement, x: number, y: number, z: number, align: Label3D['align'] | null, layer: LayerKey | null, lod?: number) {
  el.hidden = true; S.labelHost.appendChild(el);
  S.labels.push({ el, v: new THREE.Vector3(x, y, z), align: align || 'c', layer, lod: lod || 1e9, vis: false });
}
export function buildLabels() {
  const place = (t: string, x: number, z: number, cls: string | null, lod: number, sel: Sel | null, layer?: LayerKey | null, y = 0.6) => {
    const el = document.createElement(sel ? 'button' : 'span');
    el.className = 'place' + (cls ? ' ' + cls : ''); el.textContent = t;
    if (sel) { (el as HTMLButtonElement).type = 'button'; el.addEventListener('click', () => S.cb.onSelect(sel)); }
    addLabel(el, x, y, z, 'm', layer || null, lod);
  };
  const zw = T3.weirZ;
  place('Sungai Cimanuk', riverX(zw + 34), zw + 34, 'river', 1e9, null, null, -0.5);
  place('Bendung Copong', riverX(zw) - 1, zw - 4.8, null, 1e9, { kind: 'gate', id: 'g-intake' }, null, 3.2);
  place('Kantong lumpur', (T3.KL.x0 + T3.KL.x1) / 2 + 3, T3.KL.z0 - 1.2, null, 110, { kind: 'ruas', id: R[ROOT].k }, 'cells', 1);
  T3.systems.slice(1).forEach(sy => place(sy.src.name, LOC_X, sy.z - 3.8, null, 1e9, { kind: 'gate', id: sy.src.gate }));
  if (T3.lake) place('Situ Bagendit', T3.lake[0], T3.lake[1] + 4.6, null, 1e9, null);
  Object.keys(T3.inflow).forEach(k => { const v = R[+k], p = T3.inflow[+k]; place(v.srcObj!.name.replace('Bendung ', 'Bd. '), p[0], p[1] - 2.6, null, 140, { kind: 'gate', id: v.gate! }); });
  Object.keys(T3.lines).map(Number).forEach(i => {
    const r = R[i], L = T3.lines[i]; if (r.situ) return;
    const lod = r.type === 'P' ? 1e9 : r.type === 'T' ? 70 : 150;
    place(r.n, L.sx + (L.root ? 4.2 : 1.5) + Math.min(L.pad * 0.5, 5), L.z - L.D.outUp - 0.5, 'sec', lod, { kind: 'ruas', id: r.k }, 'cells', L.D.T + 0.2);
  });
  STATIONS.forEach(stn => {
    if (!stn.pos3) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tag st'; b.setAttribute('aria-label', stn.name);
    b.innerHTML = `<i class="dot"></i><b>${stn.code}</b><span class="tv">—</span>`;
    b.addEventListener('click', () => S.cb.onSelect({ kind: 'station', id: stn.id }));
    addLabel(b, stn.pos3[0], (stn.y3 || 0) + 2.7, stn.pos3[1], 'c', 'st', stn.id === 'AWLR-CPG-02' || stn.id === 'ARR-CPG-16' ? 80 : 1e9);
    S.tags[stn.id] = b;
  });
  GATES.forEach(G => {
    if (!G.pos3) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tag gt'; b.setAttribute('aria-label', G.name);
    b.innerHTML = `${GATE_ICON}<span class="tv">—</span>`;
    b.addEventListener('click', () => { S.cb.onSelect({ kind: 'gate', id: G.id }); S.cb.onOpenGate(G.id); });
    const main = G.w || G.id === 'g-intake' || R[G.ri].p === ROOT;
    addLabel(b, G.pos3[0], G.w ? 3.4 : G.id === 'g-intake' ? 2.75 : 1.6, G.pos3[1], 'c', 'gt', main ? 130 : 70);
    S.tags[G.id] = b;
  });
}
const _v = new THREE.Vector3();
export function placeLabels() {
  const cp = S.camera.position;
  for (const L of S.labels) {
    let vis = (!L.layer || S.layers[L.layer]) && (L.lod >= 1e9 || cp.distanceTo(L.v) < L.lod || L.el.classList.contains('sel'));
    if (vis) {
      _v.copy(L.v).project(S.camera);
      vis = _v.z < 1 && Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
      if (vis) L.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * S.w).toFixed(1)}px,${((-_v.y * 0.5 + 0.5) * S.h).toFixed(1)}px) ${ALIGN[L.align]}`;
    }
    if (vis !== L.vis) { L.el.hidden = !vis; L.vis = vis; }
  }
}
