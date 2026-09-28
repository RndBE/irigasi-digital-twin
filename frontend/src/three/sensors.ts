import * as THREE from 'three';
import { R, ROOT } from '../domain/network';
import { STATIONS } from '../domain/stations';
import type { Sel, Station } from '../domain/types';
import { C, LOC_X, LV, OX, S, T3, U, WEIR_HW, riverHW, riverX } from './context';
import { bld } from './geometry';
import { stationPx } from './layout';
import { occRect } from './occupancy';

/** Titik pasang tiap stasiun di diorama: di tebing, pilar bendung, atau tanggul saluran; lengan sensor ke arah air. */
function sensorSpot(stn: Station) {
  const zw = T3.weirZ, cx = riverX(zw);
  if (stn.id === 'AWLR-CMK-01') { const z = zw - 12; return { x: riverX(z) + riverHW(z) + 1.4, z, ax: -1, az: 0, arm: 1.25, y0: LV.levee }; }
  if (stn.id === 'AWLR-CPG-02') return { x: cx - WEIR_HW - 0.25, z: zw - 3.4, ax: 1, az: 0, arm: 0.95, y0: 0.85 };
  if (stn.id === 'ARR-CPG-16') return { x: cx + 18.9, z: zw + 4.6, y0: 0, arr: true, ax: 0, az: 0, arm: 0 };
  const p = stationPx(stn); if (!p) return null;
  const x = p[0] * U + OX, z = p[1] * U;
  if (stn.id === 'AWLR-CPC-17') { const sy = T3.systems.find(s => s.root === R[stn.ri!].sys)!; return { x: LOC_X - 1.35, z: sy.z - 1.8, ax: 1, az: 0, arm: 0.95, y0: 0 }; }
  if (stn.type === 'ARR') return { x: x + 1.2, z: z - 0.4, y0: 0, arr: true, ax: 0, az: 0, arm: 0 };
  const li = stn.id === 'AWLR-BCP-04' ? ROOT : stn.ri!, L = T3.lines[li]; if (!L) return null;
  const D = L.D;
  return { x: Math.min(x, L.ex - 0.6), z: L.z - (D.hw + D.b * 0.5), ax: 0, az: 1, arm: D.b * 0.5 + D.hw * 0.7, y0: D.T };
}
/** Tiang logger dengan panel surya, antena, lampu status, pagar, dan cincin alarm. */
export function buildSensors() {
  const M = S.M;
  STATIONS.forEach(stn => {
    const sp = sensorSpot(stn); if (!sp) return;
    const arr = 'arr' in sp && !!sp.arr;
    stn.pos3 = [sp.x, sp.z]; stn.y3 = sp.y0;
    const ry = arr ? 0.3 : Math.atan2(sp.ax, sp.az), b = bld(sp.x, sp.y0, sp.z, ry), sel: Sel = { kind: 'station', id: stn.id };
    const pad = arr ? 1.3 : 0.62;
    b.box(M.concrete, pad, 0.08, pad, 0, 0.04, arr ? 0.25 : -0.12);
    b.cyl(M.galv, 0.045, 0.05, 2.3, 8, 0, 1.15, 0);
    b.box(M.panel, 0.34, 0.44, 0.22, 0, 1.0, -0.15);
    b.box(M.dark, 0.3, 0.02, 0.2, 0, 1.23, -0.15);
    b.box(M.solar, 0.68, 0.03, 0.46, 0, 2.05, -0.2, -0.35); b.box(M.galv, 0.04, 0.3, 0.04, 0, 1.9, -0.12);
    b.cyl(M.galv, 0.012, 0.012, 0.75, 4, 0.12, 2.5, 0.02); b.cyl(M.galv, 0.01, 0.006, 0.55, 4, 0, 2.55, 0);
    if (!arr) {
      b.box(M.galv, 0.05, 0.05, sp.arm + 0.12, 0, 1.55, sp.arm / 2);
      b.cyl(M.panel, 0.075, 0.09, 0.15, 12, 0, 1.45, sp.arm); b.cyl(M.dark, 0.06, 0.04, 0.05, 12, 0, 1.35, sp.arm);
    } else {
      b.box(M.concrete, 0.3, 0.08, 0.3, 0.45, 0.12, 0.5); b.cyl(M.panel, 0.11, 0.11, 0.48, 14, 0.45, 0.4, 0.5); b.cyl(M.galv, 0.13, 0.08, 0.07, 14, 0.45, 0.67, 0.5);
    }
    const fz = arr ? 0.25 : -0.12, fh = 0.55, fw = pad - 0.04;
    for (const [px, pz, a] of [[0, fz - fw / 2, 0], [0, fz + fw / 2, 0], [-fw / 2, fz, Math.PI / 2], [fw / 2, fz, Math.PI / 2]]) b.geo(M.fence, S.G.plane, px, fh / 2 + 0.06, pz, fw, fh, 1, 0, a, 0);
    const led = new THREE.Mesh(S.G.sphere, new THREE.MeshStandardMaterial({ color: C(0x1fae4b), emissive: C(0x1fae4b), emissiveIntensity: 1.6, roughness: 0.3 }));
    led.scale.setScalar(0.075); b.mesh(led, 0, 2.36, 0);
    const led2 = new THREE.Mesh(S.G.sphere, led.material); led2.scale.setScalar(0.03); b.mesh(led2, 0.1, 1.12, -0.265);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 36), new THREE.MeshBasicMaterial({ color: 0xd03b3b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, sp.y0 + 0.12, sp.z); S.scene.add(ring);
    b.pick(0.9, 2.7, 0.9, 0, 1.35, 0, sel); if (!arr) b.pick(0.3, 0.3, sp.arm + 0.2, 0, 1.5, sp.arm / 2, sel);
    S.sensors[stn.id] = { led, ring, alarm: false, x: sp.x };
    occRect(sp.x - 1, sp.z - 1, sp.x + 1, sp.z + 1, 3);
  });
}
