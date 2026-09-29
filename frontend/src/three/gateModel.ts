import * as THREE from 'three';
import { clamp, smooth } from '../lib/format';
import { STATIONS, STMAP } from '../domain/stations';
import { sim } from '../domain/state';
import { gateSpec, type GateLevels, type GateSpec } from '../domain/gateSpec';
import type { Gate, Station } from '../domain/types';
import { C, S } from './context';
import { boxG } from './geometry';
import { drawTex, textTex } from './textures';

/**
 * Model 3D satu pintu pada ukuran rencananya, untuk jendela detail pintu. Daun pintu mengikuti bukaan, muka air
 * hulu dan hilir mengikuti model, dan penggeraknya stang ulir dengan roda putar atau, untuk intake, pintu bendung,
 * dan pintu primer, motor listrik dengan lampu fasa R/S/T seperti panel pintu SimHidro.
 */
type Lambert = THREE.MeshLambertMaterial;
type Phong = THREE.MeshPhongMaterial;
interface GmMaterials {
  conc: Lambert; concDark: Lambert; white: Lambert; grass: Lambert; earth: Lambert;
  blue: Phong; blueDark: Phong; yellow: Phong; steel: Phong; iron: Phong; orange: Phong; motor: Phong; panel: Lambert; red: Phong; rail: Phong;
  water: Phong; waterSide: Lambert; foam: Lambert; gauge: Lambert; ghost: THREE.MeshBasicMaterial; lamp: Phong[];
}
let GMM: GmMaterials | null = null;
function gaugeTex() {
  return drawTex(64, 512, g => {
    g.fillStyle = '#f5f5f0'; g.fillRect(0, 0, 64, 512);
    for (let k = 0; k < 20; k++) { const y = 512 - (k + 1) * 25.6; g.fillStyle = k % 2 ? '#f5f5f0' : '#c62828'; g.fillRect(0, y, k % 4 < 2 ? 30 : 64, 25.6); }
    g.fillStyle = '#111'; g.font = '700 20px Arial'; g.textAlign = 'right';
    for (let m = 0; m <= 10; m += 2) { const y = 512 - m * 51.2; g.fillRect(34, y - 1, 30, 2); if (m) g.fillText((m / 10 * 2).toFixed(1), 62, y + 18); }
  });
}
function gmMat(): GmMaterials {
  if (GMM) return GMM;
  const L = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o), P = (o: THREE.MeshPhongMaterialParameters) => new THREE.MeshPhongMaterial(o);
  const tex = S.tex;
  GMM = {
    conc: L({ color: C(0xd9d6cc), map: tex.concrete }), concDark: L({ color: C(0xa9a59a), map: tex.concrete }),
    white: L({ color: C(0xeeece6) }), grass: L({ color: C(0x8aac3c), map: tex.noise }), earth: L({ color: C(0x9b7f58), map: tex.noise }),
    blue: P({ color: C(0x2f6fb5), shininess: 40 }), blueDark: P({ color: C(0x1f4f8f), shininess: 30 }), yellow: P({ color: C(0xf2c230), shininess: 30 }),
    steel: P({ color: C(0x8c979d), shininess: 70, specular: 0x555555 }), iron: P({ color: C(0x3a4247), shininess: 30 }),
    orange: P({ color: C(0xf29a2e), shininess: 30 }), motor: P({ color: C(0x7f9aa0), shininess: 50 }), panel: L({ color: C(0xc6dcef), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    red: P({ color: C(0xc62828) }), rail: P({ color: C(0xf2c230), shininess: 30 }),
    water: new THREE.MeshPhongMaterial({ color: C(0x7cc4e6), map: tex.ripple, transparent: true, opacity: 0.82, shininess: 90, specular: 0x88aacc, depthWrite: false }),
    waterSide: new THREE.MeshLambertMaterial({ color: C(0x5aa8d4), transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
    foam: new THREE.MeshLambertMaterial({ color: 0xffffff, map: tex.foam, transparent: true, opacity: 0.8, depthWrite: false, vertexColors: true }),
    gauge: L({ map: gaugeTex() }), ghost: new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: 0.28, depthWrite: false }),
    lamp: ['#e53935', '#f9b000', '#1fae4b'].map(c => new THREE.MeshPhongMaterial({ color: C(0x333333), emissive: new THREE.Color(c).convertSRGBToLinear(), emissiveIntensity: 1 })),
  };
  return GMM;
}
function gmBox(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(boxG(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function gmCyl(parent: THREE.Object3D, mat: THREE.Material, r0: number, r1: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function gmWheel(parent: THREE.Object3D, mat: THREE.Material, r: number, x: number, y: number, z: number, vertical: boolean) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.09, 8, 28), mat); rim.castShadow = true; g.add(rim);
  for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(boxG(r * 2, r * 0.07, r * 0.07), mat); s.rotation.z = k * Math.PI / 4; g.add(s); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 0.25, 12), mat); hub.rotation.x = Math.PI / 2; g.add(hub);
  if (!vertical) g.rotation.x = Math.PI / 2;
  parent.add(g); return g;
}

export interface GateRefs {
  root: THREE.Group; spec: GateSpec; bt: number; D: number; Hp: number; zL: number;
  leaves: { g: THREE.Group; ghost: THREE.Mesh }[];
  rods: { m: THREE.Mesh; L: number }[];
  wheels: THREE.Group[];
  lamps: THREE.Mesh[];
  stn?: Station;
  /** Muka air dari ujung hulu ke ujung hilir: stasiun `z`, dengan tangga di dalam pelat daun antara `zG0` dan `zG1`. */
  w: { m: THREE.Mesh<THREE.BufferGeometry, Phong>; z: number[]; zG0: number; zG1: number };
  sU: THREE.Mesh; sD: THREE.Mesh;
  jets: { m: THREE.Mesh<THREE.BufferGeometry, Lambert>; x0: number; x1: number }[];
  /** Bukaan yang sedang ditampilkan (%), mendekati `target`. */
  cur: number; target: number; lv: GateLevels | null; draft: number | null;
}

export function buildGateModel(G: Gate): GateRefs {
  const M = gmMat(), sp = gateSpec(G), root = new THREE.Group();
  const bt = sp.leaves * sp.bw + (sp.leaves - 1) * sp.pier, W = 0.3, D = sp.depth, zL = 6;
  // deck high enough that a leaf at full opening (with the lifting lugs of a weir leaf) stays under it
  const Hp = Math.max(D + (sp.intake ? 1.2 : 1.1), sp.leafH + sp.maxLift + (sp.weir ? 0.32 : 0.12));
  const leaves: GateRefs['leaves'] = [], rods: GateRefs['rods'] = [], wheels: THREE.Group[] = [], lamps: THREE.Mesh[] = [];
  // floor, side walls, wing walls, ground on both banks
  gmBox(root, M.concDark, bt + 2 * W, 0.25, 2 * zL, 0, -0.125, 0);
  for (const s of [-1, 1]) {
    gmBox(root, M.conc, W, D + 0.25, 2 * zL, s * (bt / 2 + W / 2), (D - 0.25) / 2, 0);
    gmBox(root, M.grass, 5, 0.12, 2 * zL, s * (bt / 2 + W + 2.5), D - 0.06, 0);
    gmBox(root, M.earth, 5, D + 0.2, 2 * zL, s * (bt / 2 + W + 2.5), (D - 0.44) / 2, 0);
  }
  // piers between the leaves, pillars at the sides
  const bays: [number, number][] = [];
  for (let k = 0; k < sp.leaves; k++) { const x0 = -bt / 2 + k * (sp.bw + sp.pier); bays.push([x0, x0 + sp.bw]); }
  bays.forEach(([x0], k) => {
    if (k > 0) { const px = x0 - sp.pier / 2; gmBox(root, M.conc, sp.pier, Hp + 0.1, 1.4, px, (Hp - 0.25) / 2, 0.1); gmCyl(root, M.conc, sp.pier / 2, sp.pier / 2, Hp + 0.1, px, (Hp - 0.25) / 2, -0.6); }
  });
  for (const s of [-1, 1]) gmBox(root, M.conc, 0.4, Hp - D + 0.02, 0.6, s * (bt / 2 + 0.2), D + (Hp - D) / 2, 0);
  // guides on every bay edge
  bays.forEach(([x0, x1]) => { for (const x of [x0, x1]) gmBox(root, M.iron, 0.07, Hp, 0.16, x + (x === x0 ? 0.02 : -0.02), Hp / 2, 0); });
  // intake: breast wall over the 1,15 m openings, the leaves slide on its downstream face
  if (sp.intake) gmBox(root, M.conc, bt + 0.02, Hp - sp.h, 0.35, 0, sp.h + (Hp - sp.h) / 2, -0.21);
  // operating deck with railing
  gmBox(root, M.conc, bt + 1.2, 0.18, 1.1, 0, Hp + 0.09, 0);
  if (sp.motor || bt >= 1.5) for (const zz of [-0.5, 0.5]) { gmBox(root, M.rail, bt + 1.2, 0.04, 0.04, 0, Hp + 0.95, zz); gmBox(root, M.rail, bt + 1.2, 0.04, 0.04, 0, Hp + 0.55, zz); for (let k = 0; k <= Math.round((bt + 1.2) / 0.5); k++) gmBox(root, M.rail, 0.04, 0.8, 0.04, -(bt + 1.2) / 2 + k * (bt + 1.2) / Math.round((bt + 1.2) / 0.5), Hp + 0.58, zz); }
  // leaves with stiffeners
  bays.forEach(([x0, x1]) => {
    const w = x1 - x0 + 0.08, lg = new THREE.Group();
    gmBox(lg, M.blue, w, sp.leafH, 0.05, 0, sp.leafH / 2, 0);
    if (sp.weir) {
      // weir gate: main girders, stiffeners, end posts with rollers and lifting lugs on the downstream face
      const nG = Math.max(3, Math.round(sp.leafH / 0.8)), nS = Math.max(2, Math.round(w / 1.2));
      for (let k = 0; k < nG; k++) { const y = sp.leafH * (k + 0.5) / nG; gmBox(lg, M.blueDark, w - 0.3, 0.14, 0.34, 0, y, 0.2); gmBox(lg, M.blueDark, w - 0.3, 0.26, 0.04, 0, y, 0.38); }
      for (let k = 1; k < nS; k++) gmBox(lg, M.blueDark, 0.06, sp.leafH - 0.1, 0.3, -w / 2 + w * k / nS, sp.leafH / 2, 0.18);
      for (const sx of [-1, 1]) { gmBox(lg, M.blue, 0.18, sp.leafH, 0.42, sx * (w / 2 - 0.09), sp.leafH / 2, 0.19); for (const f of [0.2, 0.8]) gmCyl(lg, M.iron, 0.14, 0.14, 0.1, sx * (w / 2 - 0.02), sp.leafH * f, 0.25, 0, Math.PI / 2); }
      for (const lx of [-0.42, 0.42]) gmBox(lg, M.yellow, 0.16, 0.22, 0.24, lx * w, sp.leafH + 0.11, 0.12);
    } else {
      for (let k = 1; k <= 3; k++) gmBox(lg, M.blueDark, w, 0.05, 0.07, 0, sp.leafH * k / 4, 0.05);
      for (const fx of [-0.33, 0, 0.33]) gmBox(lg, M.blueDark, 0.05, sp.leafH, 0.06, w * fx, sp.leafH / 2, 0.05);
    }
    lg.position.set((x0 + x1) / 2, 0, 0); root.add(lg);
    const ghost = new THREE.Mesh(boxG(w, sp.leafH, 0.06), M.ghost); ghost.position.set((x0 + x1) / 2, sp.leafH / 2, sp.intake ? 0.1 : -0.06); ghost.visible = false; root.add(ghost);
    leaves.push({ g: lg, ghost });
  });
  // intake: a second leaf per bay on the upstream face of the breast wall, in its own guides, on a rising spindle to a
  // handwheel stand on the deck; it follows the same opening as the downstream leaf
  if (sp.intake) {
    const zU = -0.41, top = Hp + 0.18;
    bays.forEach(([x0, x1]) => {
      const w = x1 - x0 + 0.08, cx = (x0 + x1) / 2, lg = new THREE.Group();
      gmBox(lg, M.blue, w, sp.leafH, 0.05, 0, sp.leafH / 2, 0);
      for (let k = 1; k <= 3; k++) gmBox(lg, M.blueDark, w, 0.05, 0.07, 0, sp.leafH * k / 4, -0.05);
      for (const fx of [-0.33, 0, 0.33]) gmBox(lg, M.blueDark, 0.05, sp.leafH, 0.06, w * fx, sp.leafH / 2, -0.05);
      lg.position.set(cx, 0, zU); root.add(lg);
      const ghost = new THREE.Mesh(boxG(w, sp.leafH, 0.06), M.ghost); ghost.position.set(cx, sp.leafH / 2, zU - 0.07); ghost.visible = false; root.add(ghost);
      leaves.push({ g: lg, ghost });
      for (const x of [x0, x1]) gmBox(root, M.iron, 0.07, Hp, 0.12, x + (x === x0 ? 0.02 : -0.02), Hp / 2, zU);
      gmBox(root, M.iron, 0.14, 0.34, 0.14, cx, top + 0.17, zU);
      wheels.push(gmWheel(root, M.yellow, 0.24, cx, top + 0.4, zU, false));
      const L = top + 0.52 - sp.leafH, rod = gmCyl(root, M.steel, 0.025, 0.025, L, cx, 0, zU); rods.push({ m: rod, L });
    });
  }
  // hoists
  if (sp.motor) {
    const top = Hp + 0.18;
    for (const s of [-1, 1]) gmBox(root, M.white, 0.26, 1.7, 0.26, s * (bt / 2 + 0.35), top + 0.85, 0.35);
    gmBox(root, M.blue, bt + 1.4, 0.34, 1.3, 0, top + 1.87, 0.2);
    gmBox(root, M.blueDark, bt + 1.5, 0.06, 1.4, 0, top + 2.07, 0.2);
    for (const s of [-1, 1]) { const pn = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), M.panel); pn.position.set(s * (bt / 2 + 0.36), top + 0.8, -0.2); pn.rotation.y = Math.PI / 2; root.add(pn); }
    const pw = Math.min(2.6, bt + 0.25), plate = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw * 70 / 512 * 1.9), new THREE.MeshBasicMaterial({ map: textTex('Elevasi ' + G.name, null, 512, 70), toneMapped: false }));
    plate.position.set(-(bt + 1.4) / 2 + 0.1 + pw / 2, top + 1.87, 0.856); root.add(plate);
    ['R', 'S', 'T'].forEach((_t, k) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), M.lamp[k]); l.position.set(bt / 2 + 0.1 - (2 - k) * 0.22, top + 1.87, 0.86); root.add(l); lamps.push(l); });
    bays.forEach(([x0, x1]) => {
      const cx = (x0 + x1) / 2, w = x1 - x0;
      gmBox(root, M.blue, w + 0.3, 0.12, 0.3, cx, top + 0.25, 0);                       // hoist beam
      for (const s of [-1, 1]) { gmBox(root, M.steel, 0.2, 0.16, 0.22, cx + s * w * 0.42, top + 0.39, 0); gmBox(root, M.orange, 0.1, 0.1, 0.1, cx + s * w * 0.32, top + 0.4, 0); }
      gmCyl(root, M.blue, 0.035, 0.035, w * 0.84, cx, top + 0.4, 0, 0, Math.PI / 2);   // shaft
      gmCyl(root, M.motor, 0.13, 0.13, 0.42, cx - w * 0.12, top + 0.5, -0.05, 0, Math.PI / 2);
      gmBox(root, M.motor, 0.26, 0.28, 0.26, cx + w * 0.06, top + 0.5, -0.05);
      gmBox(root, M.red, 0.05, 0.04, 0.05, cx - w * 0.12, top + 0.66, -0.05);
      wheels.push(gmWheel(root, M.iron, 0.16, cx - w * 0.3, top + 0.5, -0.2, true));
      const L = top + 0.42 - sp.leafH;
      for (const s of [-1, 1]) { const rod = gmCyl(root, M.steel, 0.025, 0.025, L, cx + s * w * 0.42, 0, 0.02); rods.push({ m: rod, L }); }
    });
  } else {
    bays.forEach(([x0, x1]) => {
      const cx = (x0 + x1) / 2, top = Hp + 0.18;
      gmBox(root, M.iron, 0.28, 0.42, 0.28, cx, top + 0.21, 0);
      gmBox(root, M.iron, 0.36, 0.06, 0.36, cx, top + 0.03, 0);
      wheels.push(gmWheel(root, M.yellow, 0.32, cx, top + 0.48, 0, false));
      const L = top + 0.62 - sp.leafH, rod = gmCyl(root, M.steel, 0.028, 0.028, L, cx, 0, 0); rods.push({ m: rod, L });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.25), new THREE.MeshBasicMaterial({ map: textTex(sp.r.n.length > 18 ? sp.r.k : sp.r.n, sp.r.s || sp.r.k), toneMapped: false }));
      plate.position.set(cx, Hp + 0.09, 0.556); root.add(plate);
    });
  }
  // staff gauges upstream and downstream
  for (const zz of [-1.2, 1.4]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.14, Math.min(D, 2)), M.gauge); g.position.set(-bt / 2 + 0.002, Math.min(D, 2) / 2, zz); g.rotation.y = Math.PI / 2; root.add(g); }
  // trash rack in front of the intake
  if (sp.intake) { const rack = new THREE.Mesh(new THREE.PlaneGeometry(bt, D * 0.9), new THREE.MeshLambertMaterial({ map: S.tex.rack, alphaTest: 0.5, side: THREE.DoubleSide })); rack.position.set(0, D * 0.45, -2.2); rack.rotation.x = -0.25; root.add(rack); }
  // water: one surface from end to end, cut faces at both ends, foam on the jet under each leaf. The surface is level
  // upstream, draws down toward the opening once the leaf clears the water, leaves the lip of the leaf and falls to
  // the downstream level, so no floor shows between the two pools; the step at a closed or drowned leaf sits inside
  // the leaf plate (zG0..zG1). Texture v runs downstream (+z), so the scrolling carries the ripples and the foam with
  // the flow.
  const zG0 = sp.intake ? -0.42 : -0.02, zG1 = 0.02;
  const wz = [-zL, ...[4.6, 3.5, 2.6, 1.9, 1.4, 1, 0.7, 0.45, 0.25, 0.1, 0].map(d => zG0 - d), ...[0, 0.08, 0.18, 0.3, 0.45, 0.63, 0.85, 1.1, 1.4, 1.75, 2.15, 2.6, 3.2, 4, 5].map(d => zG1 + d), zL];
  const w = { m: new THREE.Mesh(waterStrip(wz.length), M.water), z: wz, zG0, zG1 }; w.m.frustumCulled = false; root.add(w.m);
  const sU = new THREE.Mesh(new THREE.PlaneGeometry(bt, 1), M.waterSide); sU.position.set(0, 0.25, -zL + 0.001); root.add(sU);
  const sD = new THREE.Mesh(new THREE.PlaneGeometry(bt, 1), M.waterSide); sD.position.set(0, 0.15, zL - 0.001); root.add(sD);
  const jets = bays.map(([x0, x1]) => { const j = new THREE.Mesh(waterStrip(FOAM_N, true), M.foam); j.frustumCulled = false; j.renderOrder = 1; root.add(j); return { m: j, x0, x1 }; });
  // station on this canal: its reading shows beside the model, but no pole is drawn in the model
  const stn = sp.weir ? STMAP['AWLR-CPG-02'] : STATIONS.find(x => x.ri === G.ri && x.type !== 'ARR');
  return { root, spec: sp, bt, D, Hp, zL, leaves, rods, wheels, lamps, stn, w, sU, sD, jets, cur: sim.open[G.id], target: sim.open[G.id], lv: null, draft: null };
}

/** Pita air memanjang aliran: dua titik (kiri, kanan) per stasiun, diisi ulang tiap bingkai oleh `gmSetWater`. */
const FOAM_N = 11;
function waterStrip(n: number, alpha = false) {
  const g = new THREE.BufferGeometry(), idx: number[] = [];
  for (let k = 0; k < n - 1; k++) { const a = 2 * k; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 4), 2));
  if (alpha) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 8).fill(1), 4));
  g.setIndex(idx); return g;
}

/** Muka air sepanjang aliran untuk bukaan dan muka air hulu/hilir saat ini, dan buih jet di hilir tiap daun. */
export function gmSetWater(refs: GateRefs, lv: GateLevels) {
  const { hU, hD, a } = lv, { w } = refs, hb = refs.bt / 2;
  // a leaf in the water holds the surface level up to its face; once it clears the water the surface draws down toward
  // the opening. The water leaves the lip at the leaf edge (or the drawn-down level) and falls to the downstream level.
  const free = smooth(0.75, 1.25, a / Math.max(0.01, hU)), dd = hU * 0.22 * free, yG = hU - dd, lip = Math.max(Math.min(a, yG), hD);
  const Lu = 1.2 + hU * 0.4, Ld = clamp(0.35 + 1.4 * (lip - hD), 0.35, 3.2);
  const y = (z: number) => z <= w.zG0 ? hU - dd * Math.max(0, 1 - (w.zG0 - z) / Lu) ** 2
    : z < w.zG1 ? yG + (lip - yG) * (z - w.zG0) / (w.zG1 - w.zG0) : hD + (lip - hD) * (1 - smooth(0, Ld, z - w.zG1));
  // slope for the normals, one-sided at the leaf faces so the step inside the plate does not tilt the pools
  const e = 0.01, slope = (z: number) => z === w.zG0 ? (y(z) - y(z - e)) / e : z === w.zG1 ? (y(z + e) - y(z)) / e : (y(z + e) - y(z - e)) / (2 * e);
  const g = w.m.geometry, P = g.attributes.position as THREE.BufferAttribute, N = g.attributes.normal as THREE.BufferAttribute, UV = g.attributes.uv as THREE.BufferAttribute;
  // texture v grows with the depth, so the ripples stretch and run faster where the water gets shallow
  let v = 0, yp = 0;
  w.z.forEach((z, k) => {
    const yy = y(z), s = slope(z), l = Math.hypot(1, s);
    if (k) v += (z - w.z[k - 1]) * clamp((yy + yp) / 2 / Math.max(0.05, hU), 0.3, 1) / refs.zL;
    yp = yy;
    for (const j of [0, 1]) { P.setXYZ(2 * k + j, j ? hb : -hb, yy, z); N.setXYZ(2 * k + j, 0, 1 / l, -s / l); UV.setXY(2 * k + j, j, v); }
  });
  P.needsUpdate = N.needsUpdate = UV.needsUpdate = true;
  refs.sU.scale.y = Math.max(0.01, hU); refs.sU.position.y = hU / 2;
  refs.sD.scale.y = Math.max(0.01, hD); refs.sD.position.y = hD / 2;
  // foam on the jet: strongest under a leaf in the water, thinner once the leaf is clear, fading out downstream
  const on = a > 0.004, len = clamp(0.6 + a * 3, 0.6, 2.4);
  if (refs.jets[0]) refs.jets[0].m.material.opacity = clamp(0.25 + a * 1.5, 0.25, 0.9) * (1 - 0.6 * free);
  refs.jets.forEach(j => {
    j.m.visible = on; if (!on) return;
    const jg = j.m.geometry, JP = jg.attributes.position as THREE.BufferAttribute, JN = jg.attributes.normal as THREE.BufferAttribute;
    const JU = jg.attributes.uv as THREE.BufferAttribute, JC = jg.attributes.color as THREE.BufferAttribute;
    for (let k = 0; k < FOAM_N; k++) {
      const f = k / (FOAM_N - 1), z = w.zG1 + 0.01 + f * len, yy = y(z) + 0.012, s = slope(z), l = Math.hypot(1, s), al = 1 - smooth(0.5, 1, f);
      for (const i of [0, 1]) { const n = 2 * k + i; JP.setXYZ(n, i ? j.x1 : j.x0, yy, z); JN.setXYZ(n, 0, 1 / l, -s / l); JU.setXY(n, i, f * len / 1.2); JC.setW(n, al); }
    }
    JP.needsUpdate = JN.needsUpdate = JU.needsUpdate = JC.needsUpdate = true;
  });
}
