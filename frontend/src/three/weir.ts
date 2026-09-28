import * as THREE from 'three';
import { lerp } from '../lib/format';
import { R, ROOT } from '../domain/network';
import { GMAP } from '../domain/gates';
import { sim } from '../domain/state';
import type { Sel } from '../domain/types';
import { LV, S, T3, WEIR_HW, riverHW, riverX } from './context';
import { M4, addStatic, bar, bld, boxG, cylG, mergeGeos, quadMesh, railing, ribbon, type GeoPart } from './geometry';
import { occRect } from './occupancy';
import { car, lampPost } from './props';
import { buildRiprap } from './river';
import { textTex } from './textures';

/**
 * Kompleks Bendung Copong: bendung gerak dengan 3 pintu banjir 12,5 × 3,5 m dan pintu penguras 5 × 8 m, intake
 * 3 pintu 3 × 1,15 m, kantong lumpur 3 jalur, peralihan ke SI Copong, jembatan layanan, dan rumah operasi
 * (Rusdiana & Permana 2021; Aprilia & Permana 2022). Warna mengikuti peta SimHidro.
 */

// steel lift gate leaf: skin plate on the upstream face, main girders and stiffeners on the downstream face, end
// posts with rollers, lifting lugs on top; origin at the centre of the leaf, downstream = +z
function gateLeaf(W: number, H: number, D: number) {
  const M = S.M, P: Record<'s' | 'b' | 'd' | 'y', GeoPart[]> = { s: [], b: [], d: [], y: [] };
  const add = (k: 's' | 'b' | 'd' | 'y', w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) => P[k].push({ g: rz ? cylG(1, 1, 12) : S.G.box, m: M4(x, y, z, 0, 0, rz, w, h, d) });
  add('s', W, H, 0.035, 0, 0, -0.028);
  add('s', W, 0.03, D + 0.03, 0, H / 2 - 0.015, D / 2 - 0.03);
  add('d', W, 0.02, 0.05, 0, -H / 2 - 0.01, -0.02);
  const nG = Math.max(3, Math.round(H / 0.3)), nS = Math.max(2, Math.round(W / 0.35));
  for (let k = 0; k < nG; k++) { const y = -H / 2 + H * (k + 0.5) / nG; add('b', W - 0.14, 0.06, D, 0, y, D / 2 - 0.012); add('b', W - 0.14, 0.1, 0.014, 0, y, D - 0.005); }
  for (let k = 1; k < nS; k++) add('b', 0.025, H - 0.05, D * 0.85, -W / 2 + W * k / nS, 0, D * 0.42 - 0.012);
  for (const sx of [-1, 1]) {
    add('s', 0.07, H, D + 0.02, sx * (W / 2 - 0.035), 0, D / 2 - 0.02);
    for (const f of [-0.3, 0.3]) add('d', 0.055, 0.04, 0.055, sx * (W / 2 - 0.02), f * H, D * 0.55, Math.PI / 2);
  }
  if (W > 1.5) for (const lx of [-0.9, 0.9]) { add('y', 0.07, 0.1, 0.1, lx, H / 2 + 0.05, D * 0.3); add('d', 0.035, 0.08, 0.035, lx, H / 2 + 0.08, D * 0.3, Math.PI / 2); }
  else for (const lx of [-W * 0.3, W * 0.3]) { add('y', 0.06, 0.1, 0.09, lx, H / 2 + 0.05, D * 0.3); add('d', 0.03, 0.07, 0.03, lx, H / 2 + 0.08, D * 0.3, Math.PI / 2); }
  const g = new THREE.Group(), mats = { s: M.steel, b: M.gateBlue, d: M.dark, y: M.yellow };
  for (const k of ['s', 'b', 'd', 'y'] as const) if (P[k].length) { const m = new THREE.Mesh(mergeGeos(P[k]), mats[k]); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}
const plane = (tex: THREE.Texture, sx: number, sy: number, side?: THREE.Side) => { const m = new THREE.Mesh(S.G.plane, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, ...(side != null ? { side } : {}) })); m.scale.set(sx, sy, 1); return m; };

export function buildWeir() {
  const M = S.M, zw = T3.weirZ, cx = riverX(zw), K = T3.KL, zA = T3.zA, zB = T3.zB, w = bld(0, 0, 0);
  const selW: Sel = { kind: 'station', id: 'AWLR-CPG-02' }, selI: Sel = { kind: 'gate', id: 'g-intake' }, selK: Sel = { kind: 'ruas', id: R[ROOT].k };
  const bays = [-3.75, -0.75, 2.25], deckY = 1.95;
  // floors, crest, glacis, stilling basin
  w.box(M.concreteDark, 11, 0.2, zw - 1.2 - zA, cx, -0.85, (zw - 1.2 + zA) / 2);
  w.box(M.concrete, 8.5, 0.94, 1.8, cx - 0.75, LV.apron + 0.47, zw - 0.3);
  w.geo(M.concrete, S.G.wedge, cx - 0.75, LV.apron + 0.47, zw + 1.3, 8.5, 0.94, 1.4);
  w.box(M.concreteDark, 11, 0.2, 5.8, cx, LV.apron - 0.1, zw + 3.5);
  for (let k = 0; k < 8; k++) { const bx = cx - 4.55 + k * 1.3; if ([-5.25, -2.25, 0.75, 3.75].every(p => Math.abs(bx - cx - p) > 0.5)) w.box(M.concrete, 0.42, 0.3, 0.42, bx, LV.apron + 0.15, zw + 3.4); }
  w.box(M.concrete, 11, 0.36, 0.5, cx, LV.apron + 0.18, zw + 5.95);
  w.box(M.concreteDark, 1.0, 0.1, 4.4, cx + 4.5, LV.apron + 0.05, zw + 0.2);
  // piers with round noses, gate guides
  [-5.5, -2.5, 0.5, 3.5, 5.0].forEach(pl => { const px = cx + pl + 0.25; w.box(M.concrete, 0.5, 3.3, 4.4, px, LV.apron + 1.65, zw + 0.2); w.cyl(M.concrete, 0.25, 0.25, 3.3, 14, px, LV.apron + 1.65, zw - 2.0); });
  // gate slots in the pier faces: dark groove between two steel rails, stoplog grooves upstream and downstream
  [-5.0, -2.5, -2.0, 0.5, 1.0, 3.5, 4.0, 5.0].forEach((e, k) => {
    const sg = k % 2 ? -1 : 1, x = cx + e + sg * 0.01;
    w.box(M.dark, 0.022, 3.2, 0.2, x, LV.apron + 1.62, zw);
    for (const dz of [-0.11, 0.11]) w.box(M.steel, 0.04, 3.2, 0.03, cx + e + sg * 0.015, LV.apron + 1.62, zw + dz);
    for (const zz of [zw - 1.0, zw + 0.95]) w.box(M.dark, 0.02, 2.4, 0.07, x, LV.apron + 1.2, zz);
  });
  // hoist deck with motor houses
  w.box(M.concrete, 11.0, 0.18, 1.5, cx, deckY + 0.09, zw);
  // hoist houses in the SimHidro colours: blue walls, white band, flat yellow roof; yellow railings, blue fascia
  [...bays.map(b => [b, 2.0]), [4.5, 0.9]].forEach(([bx, bw]) => {
    w.box(M.intakeWall, bw, 0.74, 1.1, cx + bx, deckY + 0.55, zw);
    w.box(M.white, bw + 0.02, 0.06, 1.12, cx + bx, deckY + 0.86, zw);
    w.box(M.roofY, bw + 0.3, 0.08, 1.38, cx + bx, deckY + 0.96, zw); w.box(M.roofY, bw + 0.2, 0.04, 1.28, cx + bx, deckY + 1.02, zw);
    for (const s of [-1, 1]) { w.box(M.white, bw * 0.72 + 0.06, 0.21, 0.01, cx + bx, deckY + 0.62, zw + s * 0.553); w.box(M.winLit, bw * 0.72, 0.15, 0.012, cx + bx, deckY + 0.62, zw + s * 0.556); }
  });
  for (const zz of [zw - 0.76, zw + 0.76]) w.box(M.intakeWall, 11.0, 0.16, 0.02, cx, deckY + 0.09, zz);
  for (const zz of [zw - 0.72, zw + 0.72]) railing([[cx - 5.5, deckY + 0.18, zz], [cx + 5.5, deckY + 0.18, zz]], M.railY, 0.32, 0.5);
  const plate = plane(textTex('BENDUNG COPONG', null, 512, 64), 3.6, 0.45);
  plate.position.set(cx - 0.9, deckY + 0.09, zw + 0.774); S.scene.add(plate);
  // flood gates (leaf 3,5 m = 0,72 unit, full lift 3,5 m) and the scouring gate (leaf 8 m) follow the openings
  bays.forEach((bx, k) => {
    const id = 'w-banjir-' + (k + 1), o = (sim.open[id] || 0) / 100;
    const leaf = gateLeaf(2.46, 0.72, 0.14); leaf.position.set(cx + bx, LV.crest + 0.36 + o * 0.72, zw); S.scene.add(leaf);
    for (const ox of [-0.9, 0.9]) w.box(M.dark, 0.12, 0.1, 0.16, cx + bx + ox, deckY - 0.05, zw + 0.02);
    const cab = [-0.9, 0.9].map(o => { const m = new THREE.Mesh(cylG(0.02, 0.02, 6), M.galv); m.position.set(cx + bx + o, 1, zw + 0.02); S.scene.add(m); return m; });
    S.weir.push({ id, leaf, cab, base: LV.crest + 0.36, lift: 0.72, cur: o, target: o, kind: 'flood' });
  });
  // scouring gate (pintu penguras) 5 m × 8 m on the low sill next to the intake: tall leaf on two wire ropes, sheaves
  // under the deck, a staff gauge in the tailwater, name plates on the deck and a flushing chute downstream
  const low = gateLeaf(0.98, 1.62, 0.12); low.position.set(cx + 4.5, LV.apron + 0.81, zw); S.scene.add(low);
  const cabS = [-0.29, 0.29].map(o => { const m = new THREE.Mesh(cylG(0.02, 0.02, 6), M.galv); m.position.set(cx + 4.5 + o, 1, zw + 0.02); S.scene.add(m); return m; });
  for (const ox of [-0.29, 0.29]) w.box(M.dark, 0.1, 0.1, 0.16, cx + 4.5 + ox, deckY - 0.05, zw + 0.02);
  S.weir.push({ id: 'w-kuras', leaf: low, cab: cabS, hh: 0.81, base: LV.apron + 0.81, lift: 1.5, cur: (sim.open['w-kuras'] || 0) / 100, target: 0, kind: 'scour' });
  w.box(M.gauge, 0.012, 1.3, 0.07, cx + 4.994, LV.apron + 0.65, zw + 1.3);
  w.box(M.steel, 0.9, 0.03, 0.05, cx + 4.5, LV.apron + 0.015, zw);
  for (const sx of [-1, 1]) w.box(M.concreteDark, 0.08, 0.35, 3.2, cx + 4.5 + sx * 0.46, LV.apron + 0.17, zw + 1.9);
  const bayName = ['PINTU BANJIR 1', 'PINTU BANJIR 2', 'PINTU BANJIR 3', 'PINTU PENGURAS'];
  [...bays, 4.5].forEach((bx, k) => {
    const pm = plane(textTex(bayName[k], null, 512, 72), k < 3 ? 1.5 : 0.86, k < 3 ? 0.14 : 0.12);
    pm.rotation.y = Math.PI; pm.position.set(cx + bx, deckY + 0.09, zw - 0.774); S.scene.add(pm);
  });
  { const pk = plane(textTex('PINTU PENGURAS', null, 512, 72), 0.86, 0.12); pk.position.set(cx + 4.5, deckY + 0.09, zw + 0.774); S.scene.add(pk); }
  // service bridge at the downstream end of the piers, so the flood gates stay visible between it and the hoist deck;
  // the piers run on under it with rounded tails
  const bz = zw + 3.8, bY = LV.levee;
  [-5.5, -2.5, 0.5, 3.5, 5.0].forEach(pl => { const px = cx + pl + 0.25, h = bY - 0.52 - LV.apron; w.box(M.concrete, 0.5, h, 2.0, px, LV.apron + h / 2, zw + 3.4); w.cyl(M.concrete, 0.25, 0.25, h, 14, px, LV.apron + h / 2, zw + 4.4); });
  w.box(M.concrete, 12.8, 0.22, 1.2, cx, bY - 0.11, bz);
  for (const o of [-0.35, 0.35]) w.box(M.concrete, 12.8, 0.3, 0.3, cx, bY - 0.37, bz + o);
  w.box(M.asphalt, 12.8, 0.015, 1.0, cx, bY + 0.008, bz);
  for (const zz of [bz - 0.58, bz + 0.58]) railing([[cx - 6.4, bY, zz], [cx + 6.4, bY, zz]], M.railY, 0.32, 0.4);
  [-4.5, -1.5, 1.5, 4.5].forEach((o, k) => lampPost(cx + o, bY, bz + 0.62, 0, k === 1 || k === 2));
  // wing walls with flared ends
  const wallH = 2.4, wy = -1.55 + wallH / 2;
  w.box(M.concrete, 0.4, wallH, zB - zA, cx - WEIR_HW - 0.2, wy, (zA + zB) / 2);
  w.box(M.concrete, 0.4, wallH, zB - K.z1, cx + WEIR_HW + 0.2, wy, (K.z1 + zB) / 2);
  w.box(M.concrete, 0.4, wallH, K.z0 - zA, cx + WEIR_HW + 0.2, wy, (zA + K.z0) / 2);
  const flare = (x0: number, z0: number, x1: number, z1: number) => { const L = Math.hypot(x1 - x0, z1 - z0); w.box(M.concrete, 0.4, wallH, L + 0.2, (x0 + x1) / 2, wy, (z0 + z1) / 2, 0, Math.atan2(x1 - x0, z1 - z0), 0); };
  flare(cx - 5.7, zA, cx - 7.6, zA - 2.6); flare(cx + 5.7, zA, cx + 7.6, zA - 2.6); flare(cx - 5.7, zB, cx - 7.3, zB + 2.4); flare(cx + 5.7, zB, cx + 7.3, zB + 2.4);
  // jets under the gates, foam in the stilling basin and downstream
  S.weirJets = bays.map(bx => { const m = M.jet.clone(), j = ribbon([[cx + bx, zw + 0.07, -0.22], [cx + bx, zw + 0.55, -0.5], [cx + bx, zw + 1.35, -0.74]], 2.4, 0, m, 1.5); j.renderOrder = 2; return m; });
  { const m = M.jet.clone(), j = ribbon([[cx + 4.5, zw + 0.1, -0.73], [cx + 4.5, zw + 2.4, -0.735]], 0.95, 0, m, 1.2); j.renderOrder = 2; S.weirJets.push(m); }
  const foamA = ribbon([[cx, zw + 0.8], [cx, zw + 6.2]], 10.9, LV.down + 0.02, M.foam, 3); foamA.renderOrder = 3;
  S.foamMat2 = M.foam.clone(); S.foamMat2.map = S.tex.foam.clone(); S.foamMat2.map.needsUpdate = true;
  const tail: number[][] = []; for (let z = zw + 6.2; z < zw + 22; z += 1) tail.push([riverX(z), z, 0, (riverHW(z) + 0.6) * (1 - (z - zw - 6.2) / 20) + 1]);
  const foamB = ribbon(tail, 1, LV.down + 0.015, S.foamMat2, 3); foamB.renderOrder = 3;
  [...bays, 4.5].forEach((bx, k) => { const id = k < 3 ? 'w-banjir-' + (k + 1) : 'w-kuras'; w.pick(k < 3 ? 2.9 : 1.1, 4.6, 5, cx + bx, 0.6, zw + 0.2, { kind: 'gate', id }); GMAP[id].pos3 = [cx + bx, zw]; });
  w.pick(0.6, 4.4, 5, cx - 5.25, 0.5, zw + 0.2, selW);
  w.pick(12.8, 0.6, 1.2, cx, bY + 0.2, bz, selW);

  // intake (pintu pengambilan): three gates in the right wall with hoist portals and spindles on the deck, a gate
  // house with a flat yellow roof, an inclined trash rack, and a stair up to the weir deck. The bays stay upstream
  // of the end pier nose so every gate faces open water.
  const ix = cx + WEIR_HW, zc = (K.z0 + K.z1) / 2, bayZ = [K.z0 + 1.3, K.z0 + 3.5, K.z0 + 5.7], zFace = zw - 2.3, dY = 1.15, topY = deckY + 0.18;
  const cuts = [K.z0, ...bayZ.flatMap(z => [z - 0.3, z + 0.3]), K.z1];
  for (let k = 0; k < cuts.length; k += 2) w.box(M.concrete, 0.45, 1.85, cuts[k + 1] - cuts[k], ix + 0.225, 0.025, (cuts[k] + cuts[k + 1]) / 2);
  // each opening is 3 m wide and 1,15 m high (0,24 unit) under a breast wall. Each bay has a leaf on both faces of
  // the wall, so it reads as a gate from the river and from the trap: the trap leaf hangs on the motor hoist on the
  // deck, the river leaf on a spindle to a handwheel stand on the front strip. Both slide up over the breast wall in
  // steel guides and follow the opening, 100 % = 1,15 m.
  const ys = 0.17, yl = 0.41, gx2 = ix + 0.49, parts: { m: THREE.Object3D; y0: number; lift: number }[] = [];
  S.inJet = M.jet.clone();
  bayZ.forEach((z, k) => {
    w.box(M.concrete, 0.45, ys + 0.9, 0.6, ix + 0.225, (ys - 0.9) / 2, z); w.box(M.concrete, 0.45, 0.95 - yl, 0.6, ix + 0.225, (0.95 + yl) / 2, z);
    for (const s of [-1, 1]) {
      w.box(M.steel, 0.08, 0.95 - ys, 0.05, ix + 0.49, (ys + 0.95) / 2, z + s * 0.355);
      w.box(M.steel, 0.02, 0.95 - ys, 0.09, ix + 0.535, (ys + 0.95) / 2, z + s * 0.355);
      w.box(M.steel, 0.08, 1.03 - ys, 0.05, ix - 0.04, (ys + 1.03) / 2, z + s * 0.355);
      w.box(M.steel, 0.02, 1.03 - ys, 0.09, ix - 0.085, (ys + 1.03) / 2, z + s * 0.355);
      w.box(M.gateBlue, 0.08, 0.82, 0.08, gx2, dY + 0.41, z + s * 0.4);
    }
    w.box(M.steel, 0.1, 0.015, 0.74, ix + 0.49, ys + 0.007, z);
    const pn = plane(textTex('PINTU ' + (k + 1), null, 256, 72), 0.3, 0.085);
    pn.rotation.y = Math.PI / 2; pn.position.set(ix + 0.452, 0.86, z); S.scene.add(pn);
    ribbon([[ix + 0.01, z], [ix + 0.45, z]], 0.6, 0.3, M.klWater, 1);
    const j = ribbon([[ix + 0.53, z, 0.306], [ix + 1.45, z, 0.305]], 0.64, 0, S.inJet!, 1.0); j.renderOrder = 2;
    // hoist portal above the slot: gearbox, motor, hand wheel for emergency
    w.box(M.gateBlue, 0.14, 0.08, 0.94, gx2, dY + 0.86, z);
    w.box(M.yellow, 0.22, 0.15, 0.26, gx2, dY + 0.975, z);
    w.cyl(M.dark, 0.05, 0.05, 0.2, 10, gx2, dY + 0.97, z + 0.23, Math.PI / 2, 0, 0);
    w.geo(M.yellow, S.G.torus, gx2 - 0.15, dY + 0.97, z - 0.04, 0.72, 0.72, 0.72, 0, Math.PI / 2, 0);
    const leaf = new THREE.Mesh(S.G.leaf, M.steel); leaf.scale.set(0.68 / 2.46, 0.3 / 0.72, 0.5); leaf.rotation.y = Math.PI / 2; leaf.position.set(gx2, ys + 0.15, z); leaf.castShadow = true; S.scene.add(leaf);
    const rod = new THREE.Mesh(boxG(0.035, 1.83, 0.035), M.galv); rod.position.set(gx2, ys + 0.3 + 0.915, z); rod.castShadow = true; S.scene.add(rod);
    parts.push({ m: leaf, y0: leaf.position.y, lift: yl - ys }, { m: rod, y0: rod.position.y, lift: yl - ys });
    // river face: sill plate, leaf with its stiffeners facing the river, rising spindle, handwheel stand on the strip
    w.box(M.steel, 0.1, 0.015, 0.74, ix - 0.04, ys + 0.007, z);
    const leafR = new THREE.Mesh(S.G.leaf, M.steel); leafR.scale.copy(leaf.scale); leafR.rotation.y = -Math.PI / 2; leafR.position.set(ix - 0.04, ys + 0.15, z); leafR.castShadow = true; S.scene.add(leafR);
    const rL = dY + 0.34 - (ys + 0.3), rodR = new THREE.Mesh(boxG(0.03, rL, 0.03), M.galv); rodR.position.set(ix - 0.04, ys + 0.3 + rL / 2, z); rodR.castShadow = true; S.scene.add(rodR);
    w.box(M.gateBlue, 0.1, 0.2, 0.16, ix - 0.04, dY + 0.1, z); w.box(M.yellow, 0.13, 0.06, 0.19, ix - 0.04, dY + 0.23, z);
    w.geo(M.yellow, S.G.torus, ix - 0.04, dY + 0.29, z, 0.62, 0.62, 0.62, Math.PI / 2, 0, 0);
    parts.push({ m: leafR, y0: leafR.position.y, lift: yl - ys }, { m: rodR, y0: rodR.position.y, lift: yl - ys });
  });
  w.box(M.gauge, 0.012, 0.6, 0.06, ix + 0.456, 0.33, bayZ[1] + 0.62);
  S.gates['g-intake'] = { parts, cur: sim.open['g-intake'] / 100, target: sim.open['g-intake'] / 100 };
  GMAP['g-intake'].pos3 = [ix + 0.8, zc];
  // deck over the wall and the trap mouth, a cantilevered strip in front of the gate slot, brackets between the bays
  const dz1 = zw - 0.75;
  w.box(M.concrete, 1.95, 0.2, dz1 - K.z0, ix + 0.975, dY - 0.1, (K.z0 + dz1) / 2); w.box(M.concrete, 1.95, 0.15, dz1 - K.z1, ix + 0.975, 0.875, (K.z1 + dz1) / 2);
  w.box(M.concrete, 0.32, 0.12, zFace - K.z0, ix - 0.16, dY - 0.06, (K.z0 + zFace) / 2);
  [K.z0 + 0.25, (bayZ[0] + bayZ[1]) / 2, (bayZ[1] + bayZ[2]) / 2].forEach(z => w.box(M.concrete, 0.34, 0.16, 0.14, ix - 0.16, dY - 0.2, z));
  for (const zz of [K.z0 + 0.15, K.z1 - 0.15]) w.box(M.concrete, 1.5, 0.14, 0.3, ix + 1.2, 0.89, zz);
  // gate house: blue walls, white band, flat roof with overhang, window rows, name board, door on the upstream end
  const hx0 = ix + 0.78, hx1 = ix + 1.62, hz0 = K.z0 + 0.4, hz1 = zw - 0.8, hH = 1.0, hxm = (hx0 + hx1) / 2, hzm = (hz0 + hz1) / 2, hL = hz1 - hz0;
  w.box(M.concrete, hx1 - hx0 + 0.05, 0.08, hL + 0.05, hxm, dY + 0.04, hzm);
  w.box(M.intakeWall, hx1 - hx0, hH, hL, hxm, dY + hH / 2, hzm);
  w.box(M.white, hx1 - hx0 + 0.02, 0.07, hL + 0.02, hxm, dY + hH - 0.09, hzm);
  w.box(M.roofY, hx1 - hx0 + 0.36, 0.1, hL + 0.36, hxm, dY + hH + 0.05, hzm);
  w.box(M.roofY, hx1 - hx0 + 0.24, 0.05, hL + 0.24, hxm, dY + hH + 0.125, hzm);
  // windows: on the river face in the gaps between the hoist portals, on the land face in a row around the name board
  const win = (x: number, s: number, z: number, wd: number) => { w.box(M.white, 0.02, 0.32, wd + 0.08, x + s * 0.01, dY + 0.58, z); w.box(M.winLit, 0.02, 0.26, wd, x + s * 0.02, dY + 0.58, z); w.box(M.white, 0.024, 0.26, 0.03, x + s * 0.022, dY + 0.58, z); };
  [(bayZ[0] + bayZ[1]) / 2, (bayZ[1] + bayZ[2]) / 2].forEach(z => win(hx0, -1, z, 0.5));
  for (let k = 0; k < 5; k++) if (k !== 2) win(hx1, 1, hz0 + (k + 0.5) * hL / 5, 0.58);
  const nb = plane(textTex('PINTU PENGAMBILAN', 'Intake SI Copong · 3 pintu', 512, 128), 1.1, 0.28);
  nb.rotation.y = Math.PI / 2; nb.position.set(hx1 + 0.012, dY + 0.58, hzm); S.scene.add(nb);
  w.box(M.steel, 0.34, 0.62, 0.02, hxm, dY + 0.31, hz0 - 0.01); w.box(M.roofY, 0.52, 0.04, 0.2, hxm, dY + 0.72, hz0 - 0.1);
  for (let k = 0; k < 3; k++) w.box(M.concrete, 0.9, 0.35 / 3 * (k + 1), 0.13, hxm, 0.8 + 0.35 / 6 * (k + 1), K.z0 - 0.065 - (2 - k) * 0.13);
  // stair from the intake deck up to the weir deck, and a landing at the end of the weir deck
  const rise = (topY - dY) / 11, zS0 = zw - 0.75 - 11 * 0.125;
  for (let k = 0; k < 11; k++) w.box(M.concrete, 0.4, (k + 1) * rise, 0.125, ix + 0.22, dY + (k + 1) * rise / 2, zS0 + (k + 0.5) * 0.125);
  w.box(M.concrete, 0.5, topY - 0.8, 1.5, ix + 0.25, (topY + 0.8) / 2, zw);
  railing([[ix - 0.3, dY, K.z0 + 0.02], [ix - 0.3, dY, zFace], [ix + 0.03, dY, zFace], [ix + 0.03, dY, zS0], [ix + 0.03, topY, zw - 0.75]]);
  railing([[ix, topY, zw + 0.73], [ix + 0.48, topY, zw + 0.73], [ix + 0.48, topY, zw - 0.73]]);
  railing([[ix - 0.3, dY, K.z0 + 0.02], [hxm - 0.48, dY, K.z0 + 0.02]]);
  railing([[hxm + 0.48, dY, K.z0 + 0.02], [ix + 1.93, dY, K.z0 + 0.02], [ix + 1.93, dY, dz1 - 0.02], [ix + 0.5, dY, dz1 - 0.02]]);
  [(bayZ[0] + bayZ[1]) / 2, (bayZ[1] + bayZ[2]) / 2].forEach(z => lampPost(ix - 0.27, dY, z, -Math.PI / 2, false));
  // inclined trash rack in front of the openings, hung under the front strip
  (() => {
    const z0 = K.z0 + 0.12, z1 = zFace - 0.06, bot = new THREE.Vector3(ix - 0.62, -0.45, 0), top = new THREE.Vector3(ix - 0.29, 0.98, 0);
    const d = top.clone().sub(bot), H = d.length(); d.normalize();
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), d, new THREE.Vector3(0, 0, 1).cross(d));
    m.scale(new THREE.Vector3(z1 - z0, H, 1)); m.setPosition((bot.x + top.x) / 2, (bot.y + top.y) / 2, (z0 + z1) / 2);
    addStatic(M.rack, S.G.plane, m);
    for (let z = z0; z <= z1 + 1e-6; z += (z1 - z0) / 5) bar(M.steel, [bot.x, bot.y, z], [top.x, top.y, z], 0.045);
    bar(M.steel, [top.x, top.y, z0], [top.x, top.y, z1], 0.06);
  })();
  // divide wall (dinding pengarah) from the pier next to the scouring gate, upstream past the intake
  const gx = cx + 3.75, gz0 = K.z0 - 1.6, gz1 = zw - 2.0;
  w.box(M.concrete, 0.3, 1.62, gz1 - gz0, gx, -0.09, (gz0 + gz1) / 2); w.cyl(M.concrete, 0.15, 0.15, 1.62, 12, gx, -0.09, gz0);
  w.box(M.concreteDark, 0.34, 0.04, gz1 - gz0, gx, 0.74, (gz0 + gz1) / 2);
  buildRiprap();
  w.pick(2.6, 2.6, K.z1 - K.z0 + 0.3, ix + 0.7, 1.1, zc, selI);
  // sediment trap: three bays running out under the house at the end (no gates there; the intake gates regulate),
  // then a transition into SI Copong
  const kx0 = ix + 0.45, kx1 = K.x1, gxp = kx1 - 0.45, dY2 = 1.1, py0 = -0.05, py1 = dY2 - 0.15, kL = K.z1 - K.z0 + 0.4;
  const pierZ = [K.z0 + 0.15, K.z0 + 2.4, K.z0 + 4.6, K.z1 - 0.15];
  for (const zz of [K.z0 + 0.15, K.z1 - 0.15]) w.box(M.concrete, kx1 - 1.0 - kx0, 0.86, 0.3, (kx0 + kx1 - 1.0) / 2, 0.4, zz);
  for (const zz of [K.z0 + 2.4, K.z0 + 4.6]) w.box(M.concrete, kx1 - 1.0 - kx0, 0.86, 0.2, (kx0 + kx1 - 1.0) / 2, 0.4, zz);
  w.box(M.concreteDark, kx1 - kx0, 0.04, K.z1 - K.z0 - 0.6, (kx0 + kx1) / 2, -0.03, zc);
  const klw = ribbon([[kx0, zc], [gxp, zc]], K.z1 - K.z0 - 0.6, 0.3, M.klWater, 3);
  klw.userData.sel = selK; S.pickables.push(klw);
  pierZ.forEach((z, k) => {
    const side = k === 0 || k === 3, t = side ? 0.3 : 0.24;
    w.box(M.concrete, 1.0, py1 - py0, t, kx1 - 0.5, (py0 + py1) / 2, z);
    if (!side) w.cyl(M.concrete, t / 2, t / 2, py1 - py0, 12, kx1 - 1.0, (py0 + py1) / 2, z);
  });
  // deck over the open bays, house on the upstream part, walkway on the downstream side
  w.box(M.concrete, 1.55, 0.15, kL, kx1 - 0.525, dY2 - 0.075, zc);
  for (const zz of [K.z0 - 0.2, K.z1 + 0.2]) w.box(M.intakeWall, 1.55, 0.15, 0.02, kx1 - 0.525, dY2 - 0.075, zz);
  const qx0 = kx1 - 1.25, qx1 = kx1 - 0.62, qH = 0.9, qz0 = K.z0 + 0.05, qz1 = K.z1 - 0.05, qzm = (qz0 + qz1) / 2;
  w.box(M.intakeWall, qx1 - qx0, qH, qz1 - qz0, (qx0 + qx1) / 2, dY2 + qH / 2, qzm);
  w.box(M.white, qx1 - qx0 + 0.02, 0.07, qz1 - qz0 + 0.02, (qx0 + qx1) / 2, dY2 + qH - 0.09, qzm);
  w.box(M.roofY, 0.85, 0.1, qz1 - qz0 + 0.3, kx1 - 0.945, dY2 + qH + 0.05, qzm); w.box(M.roofY, 0.75, 0.05, qz1 - qz0 + 0.2, kx1 - 0.945, dY2 + qH + 0.125, qzm);
  const kwin = (x: number, s: number, z: number) => { w.box(M.white, 0.02, 0.32, 0.72, x + s * 0.01, dY2 + 0.5, z); w.box(M.winLit, 0.02, 0.26, 0.64, x + s * 0.02, dY2 + 0.5, z); w.box(M.white, 0.024, 0.26, 0.03, x + s * 0.022, dY2 + 0.5, z); };
  bayZ.forEach((z, k) => { kwin(qx0, -1, z); if (k !== 1) kwin(qx1, 1, z); });
  const kb = plane(textTex('KANTONG LUMPUR', 'Ujung 3 jalur · masuk SI Copong', 512, 128), 0.95, 0.24);
  kb.rotation.y = Math.PI / 2; kb.position.set(qx1 + 0.012, dY2 + 0.5, bayZ[1]); S.scene.add(kb);
  w.box(M.steel, 0.34, 0.62, 0.02, (qx0 + qx1) / 2, dY2 + 0.31, qz1 + 0.01); w.box(M.roofY, 0.5, 0.04, 0.18, (qx0 + qx1) / 2, dY2 + 0.72, qz1 + 0.1);
  bayZ.forEach(z => w.box(M.concrete, 0.3, 0.06, 2.0, gxp, 0, z));
  // walkway railings, stair down to the yard, lamps
  railing([[kx1 + 0.23, dY2, K.z0 - 0.18], [kx1 + 0.23, dY2, K.z1 + 0.18]]);
  railing([[kx1 - 1.3, dY2, K.z0 - 0.18], [kx1 + 0.23, dY2, K.z0 - 0.18]]);
  railing([[kx1 - 1.3, dY2, K.z1 + 0.18], [kx1 - 0.37, dY2, K.z1 + 0.18]]);
  for (let k = 0; k < 9; k++) w.box(M.concrete, 0.55, dY2 / 9 * (9 - k), 0.13, kx1 - 0.075, dY2 / 18 * (9 - k), K.z1 + 0.2 + (k + 0.5) * 0.13);
  railing([[kx1 + 0.23, dY2, K.z1 + 0.2], [kx1 + 0.23, dY2 / 9, K.z1 + 0.2 + 9 * 0.13]]);
  [pierZ[1], pierZ[2]].forEach(z => lampPost(kx1 + 0.2, dY2, z, Math.PI / 2, false));
  for (const zz of [K.z0 + 0.15, K.z1 - 0.15]) railing([[ix + 1.95, 0.83, zz], [kx1 - 1.36, 0.83, zz]]);
  w.pick(1.7, 2.3, kL, kx1 - 0.5, 1.0, zc, selK);
  const Lr = T3.lines[ROOT], Dr = Lr.D, tx1 = Lr.sx;
  const tw = (x0: number, z0: number, x1: number, z1: number) => { const L = Math.hypot(x1 - x0, z1 - z0); w.box(M.concrete, 0.25, 0.7, L + 0.25, (x0 + x1) / 2, 0.32, (z0 + z1) / 2, 0, Math.atan2(x1 - x0, z1 - z0), 0); };
  tw(kx1, K.z0 + 0.15, tx1, Lr.z - Dr.hw - 0.12); tw(kx1, K.z1 - 0.15, tx1, Lr.z + Dr.hw + 0.12);
  // flow texture from under the house to the canal, clipped to the inner faces of the transition walls
  {
    const wl = [K.z0 + 0.15, Lr.z - Dr.hw - 0.12], wr = [K.z1 - 0.15, Lr.z + Dr.hw + 0.12], run = tx1 - kx1;
    const off = (a: number[]) => 0.125 / Math.cos(Math.atan2(Math.abs(a[1] - a[0]), run)) + 0.04;
    const edge = (x: number, a: number[], sgn: number) => x <= kx1 ? a[0] + sgn * 0.19 : lerp(a[0], a[1], (x - kx1) / run) + sgn * off(a);
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    [gxp + 0.06, kx1, kx1 + 0.6, kx1 + 1.3, kx1 + 2.0, kx1 + 2.7, tx1 - 0.05].forEach((x, k) => {
      const zl = edge(x, wl, 1), zr = edge(x, wr, -1);
      pos.push(x, 0.285, zl, x, 0.285, zr); uv.push(0, x / 1.6, (zr - zl) / 1.6, x / 1.6);
      if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    S.klJet = M.jet.clone(); const fm = new THREE.Mesh(g, S.klJet); fm.renderOrder = 2; S.scene.add(fm);
  }
  for (const [z0, z1] of [[K.z0 + 0.15, Lr.z - Dr.hw - 0.12], [K.z1 - 0.15, Lr.z + Dr.hw + 0.12]]) railing([[kx1 + 0.35, 0.67, z0 + (z1 - z0) * 0.35 / (tx1 - kx1)], [tx1, 0.67, z1]]);
  quadMesh([[kx1, K.z0 + 0.3], [tx1 + 0.2, Lr.z - Dr.hw], [tx1 + 0.2, Lr.z + Dr.hw], [kx1, K.z1 - 0.3]], 0.0, M.concreteDark);
  const trw = quadMesh([[gxp + 0.04, K.z0 + 0.3], [tx1 + 0.25, Lr.z - Dr.hw + 0.04], [tx1 + 0.25, Lr.z + Dr.hw - 0.04], [gxp + 0.04, K.z1 - 0.3]], 0.27, M.klWater);
  trw.userData.sel = selK; S.pickables.push(trw);
  w.pick(kx1 - kx0, 1.0, K.z1 - K.z0, (kx0 + kx1) / 2, 0.4, zc, selK);
  occRect(cx - 12, zA - 4, kx1 + 4, zB + 4, 3); occRect(kx1, K.z0 - 1, tx1 + 1, K.z1 + 1, 3);
  // flushing conduit outlet back into the river
  const zo = zB + 4.5, xo = riverX(zo) + riverHW(zo) + 0.9;
  w.box(M.concrete, 0.5, 1.1, 1.9, xo, -0.55, zo); w.box(M.dark, 0.03, 0.42, 0.75, xo - 0.26, -0.72, zo);
  // control house (rumah operasi) on the flat yard below the platform ramp: paved forecourt between the access road
  // and the porch with two parked cars, flag, lamp, and a two-sided name board at the yard entrance
  const hx = cx + 14.1, hz = zw + 4.4;
  const office = new THREE.Mesh(boxG(4.2, 1.7, 2.3), M.office); office.position.set(hx, 0.85, hz); office.castShadow = office.receiveShadow = true; S.scene.add(office);
  w.geo(M.tileRoof, S.G.hip, hx, 1.7, hz, 4.2, 0.85, 2.3);
  w.box(M.concrete, 1.8, 0.08, 0.8, hx, 1.12, hz - 1.55); for (const s of [-0.8, 0.8]) w.box(M.paint, 0.1, 1.1, 0.1, hx + s, 0.56, hz - 1.88);
  w.box(M.lane, 4.8, 0.02, 1.5, hx, 0.01, hz - 1.9);
  w.box(M.concrete, 1.4, 0.06, 0.5, hx, 0.03, hz - 1.4);
  w.cyl(M.galv, 0.03, 0.04, 3.0, 8, hx + 2.9, 1.5, hz - 1.7);
  w.box(M.red, 0.8, 0.26, 0.015, hx + 3.32, 2.85, hz - 1.7); w.box(M.white, 0.8, 0.26, 0.015, hx + 3.32, 2.59, hz - 1.7);
  car(hx - 1.6, hz - 1.72, Math.PI / 2 + 0.04, 0); car(hx + 1.65, hz - 1.72, -Math.PI / 2 - 0.05, 1);
  lampPost(hx - 2.35, 0, hz - 1.3, Math.PI, true);
  {
    const sx = hx - 3.6, sz = hz + 0.9, txt = textTex('BENDUNG COPONG', 'D.I. Leuwigoong · Kab. Garut', 512, 144);
    w.box(M.intakeWall, 2.42, 0.75, 0.05, sx, 0.75, sz);
    for (const s of [1, -1]) { const p = plane(txt, 2.3, 0.65); p.rotation.y = s > 0 ? 0 : Math.PI; p.position.set(sx, 0.75, sz + s * 0.027); S.scene.add(p); }
    for (const s of [-1.05, 1.05]) w.box(M.galv, 0.06, 0.4, 0.06, sx + s, 0.2, sz);
  }
  office.userData.sel = selW; S.pickables.push(office);
  occRect(hx - 5, hz - 4, hx + 5, hz + 1.8, 3);
}
