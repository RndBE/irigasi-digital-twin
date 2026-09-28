import * as THREE from 'three';
import { jitter, rnd } from '../lib/random';
import { LV, S, T3, WEIR_HW, riverHW, riverX, waterLevel, type P } from './context';
import { inst, railing, ribbon } from './geometry';
import { HB, occRect } from './occupancy';
import { gY } from './terrain';

/** Sungai Cimanuk: muka air hulu (naik-turun mengikuti bendung), hilir, dan batu di dasar dan tebing. */
export function buildRiver() {
  const zw = T3.weirZ, zA = T3.zA, zB = T3.zB, ZMIN = T3.W.z0 - 160, ZMAX = T3.W.z1 + 160, M = S.M;
  const up: P[] = [], dn: P[] = [];
  const pushUp = (z: number) => up.push([riverX(z), z, waterLevel(z), z > zA ? WEIR_HW + 0.02 : riverHW(z) + 1.3]);
  for (let z = ZMIN; z < zA - 0.02; z += z < zw - 40 ? 1.5 : 0.5) pushUp(z);
  pushUp(zA - 0.02); pushUp(zA + 0.02); pushUp(zw - 0.08);
  const pushDn = (z: number) => dn.push([riverX(z), z, LV.down, z < zB ? WEIR_HW + 0.02 : riverHW(z) + 1.0]);
  pushDn(zw + 0.75); pushDn(zB - 0.02); pushDn(zB + 0.02);
  for (let z = zB + 0.5; z <= ZMAX; z += z < zw + 40 ? 0.5 : 1.5) pushDn(z);
  S.riverUp = ribbon(up, 1, 0, M.river, 1.7);
  [S.riverUp, ribbon(dn, 1, 0, M.river, 1.7)].forEach(m => { m.userData.sel = { kind: 'station', id: 'AWLR-CMK-01' }; S.pickables.push(m); });
  for (let z = ZMIN; z <= ZMAX; z += 0.5) { const rc = riverX(z), hw = riverHW(z); occRect(rc - hw - 1.6, z, rc + hw + 1.6, z + 0.5, 3); occRect(rc - hw - 9, z, rc + hw + 9, z + 0.5, HB); }
  // boulders below the weir and along the bends
  const rocks: { x: number; y: number; z: number; s: number; ry: number }[] = [];
  for (let k = 0; k < 140; k++) { const z = zw + 6.4 + rnd() * 5, x = riverX(zw) + jitter(5.2); rocks.push({ x, y: -1.45, z, s: 0.18 + rnd() * 0.22, ry: rnd() * 6 }); }
  for (let k = 0; k < 160; k++) { const z = zB + 8 + rnd() * (ZMAX - zB - 20), side = rnd() < 0.5 ? -1 : 1, hw = riverHW(z), x = riverX(z) + side * (hw + 0.2 + rnd() * 0.8); rocks.push({ x, y: gY(x, z), z, s: 0.12 + rnd() * 0.25, ry: rnd() * 6 }); }
  const rg = new THREE.DodecahedronGeometry(1, 0); rg.scale(1, 0.6, 1);
  inst(rg, M.rock, rocks, null, true);
}

// stone pitching (pasangan batu) on both river banks upstream of the flared wing walls, railing along the top
export function buildRiprap() {
  const zA = T3.zA, TS = [-0.4, 0, 0.35, 0.7, 1.05, 1.45], N = TS.length;
  for (const s of [-1, 1]) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], top: (number[] | null)[] = [];
    let rows = 0;
    for (let z = zA - 0.02; z >= zA - 19; z -= 0.4) {
      const rc = riverX(z), hw = riverHW(z);
      const tWall = z > zA - 2.6 ? 5.7 + (zA - z) / 2.6 * 1.9 - hw - 0.22 : 99;
      let prev: number[] | null = null, dist = 0;
      TS.forEach(t0 => {
        const t = Math.min(t0, tWall), x = rc + s * (hw + t), y = gY(x, z) + 0.03;
        if (prev) dist += Math.hypot(x - prev[0], y - prev[1]);
        pos.push(x, y, z); uv.push(dist / 0.55, z / 0.55); prev = [x, y];
      });
      if (tWall > 1.5) { const x = rc + s * (hw + 1.62); top.push(s > 0 && z > T3.weirZ - 12.9 ? null : [x, gY(x, z), z]); }
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) for (let i = 0; i < N - 1; i++) {
      const a = r * N + i, b = a + 1, c = a + N, d = c + 1;
      if (s > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, S.M.riprap); m.receiveShadow = true; S.scene.add(m);
    let run: number[][] = [];
    top.concat([null]).forEach((p, k) => { if (p && (k % 2 === 0 || !top[k + 1])) run.push(p); if (!p) { if (run.length > 1) railing(run, S.M.railY, 0.3, 0.45); run = []; } });
  }
}
