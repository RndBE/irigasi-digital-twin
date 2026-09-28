import * as THREE from 'three';
import { lerp, smooth } from '../lib/format';
import { LV, RIV0, S, T3, WEIR_HW, fbm, riverHW, riverX, vnoise, waterLevel } from './context';

/**
 * Medan diorama: dataran sawah, tanggul dan palung Cimanuk, pelataran bendung, dan perbukitan di tepi. Tidak
 * memakai DEM (diorama tidak berskala); DEM hanya untuk profil muka tanah di panel ruas.
 */
export interface GroundInfo { y: number; kind: 'kl' | 'bed' | 'plat' | 'grass' | 'bank' | 'levee'; t: number; base: number; hill: number; wl: number }
/** Width of the flat weir platform from the river centre line, on the bank of the control-house yard. */
const YARD_D0 = 7.5, YARD_D1 = 9.5;
// weir platform at levee height; on the intake bank downstream of the sediment trap it ends sooner and ramps down so
// the control-house yard, its road and parking lie flat at ground level
function platY(x: number, z: number, d: number) {
  if (x > riverX(z) && z > T3.KL.z1) return LV.levee * (1 - smooth(YARD_D0, YARD_D1, d));
  return LV.levee - Math.max(0, d - 9) * 0.4;
}
export function groundInfo(x: number, z: number): GroundInfo {
  const zw = T3.weirZ, W = T3.W, K = T3.KL;
  let base = 0, hill = 0;
  if (z < zw - 16) base += Math.min(7, (zw - 16 - z) * 0.055) * (0.75 + 0.5 * fbm(x * 0.04, z * 0.04));
  const dh = Math.hypot(Math.max(0, W.x0 - x, x - W.x1), Math.max(0, W.z0 - z, z - W.z1));
  if (dh > 0) { hill = Math.min(34, dh * 0.34) * (0.55 + 0.6 * fbm(x * 0.025 + 7, z * 0.025)); base += hill + (fbm(x * 0.09, z * 0.09) - 0.5) * 0.8 * smooth(0, 10, dh); }
  const rc = riverX(z), hw = riverHW(z), d = Math.abs(x - rc), t = d - hw, wl = waterLevel(z);
  if (x > K.x0 && x < K.x1 && z > K.z0 && z < K.z1) return { y: -0.03, kind: 'kl', t, base, hill, wl };
  if (z > T3.zA && z < T3.zB) {
    if (d < WEIR_HW) return { y: z < zw ? -0.85 : -1.5, kind: 'bed', t, base, hill, wl };
    const y = platY(x, z, d);
    return { y: Math.max(base, y), kind: y > LV.levee - 0.05 ? 'plat' : 'grass', t, base, hill, wl };
  }
  const lf = z < zw ? smooth(zw - 75, zw - 50, z) : 0;
  const lev = t < 0 ? 0 : t < 0.9 ? LV.levee * t / 0.9 : t < 2.1 ? LV.levee : t < 3.7 ? LV.levee * (1 - (t - 2.1) / 1.6) : 0;
  // the weir platform ramps down upstream and behind the downstream wing walls instead of ending in a step
  const pf = z < T3.zA ? smooth(T3.zA - 7, T3.zA, z) : z > T3.zB ? smooth(T3.zB + 3, T3.zB, z) : 0;
  const land = Math.max(base, lev * lf, pf * platY(x, z, d));
  const chan = t < -1.5 ? wl - 1.0 : t < 0 ? wl - 1.0 + (t + 1.5) * 0.4 : wl - 0.4 + t * 0.6;
  // the flared downstream wing walls retain the platform fill; only the river side of them is carved into a bank
  const behindWing = z > T3.zB && z < T3.zB + 2.4 && d > 5.7 + (z - T3.zB) / 2.4 * 1.6;
  if (chan < land && !behindWing) return { y: chan, kind: 'bank', t, base, hill, wl };
  return { y: land, kind: lf > 0.3 && t > 0.8 && t < 2.2 ? 'levee' : 'grass', t, base, hill, wl };
}
/** Tinggi muka tanah di (x, z). */
export const gY = (x: number, z: number) => groundInfo(x, z).y;
function groundColor(g: GroundInfo, x: number, z: number, c: THREE.Color) {
  const n = fbm(x * 0.12, z * 0.12), n2 = vnoise(x * 0.7, z * 0.7), nl = fbm(x * 0.021 + 3, z * 0.021);
  let r = lerp(0.47, 0.55, n) + (n2 - 0.5) * 0.04, gg = lerp(0.5, 0.56, n) + (n2 - 0.5) * 0.04, b = lerp(0.3, 0.33, n);
  const mix = (cr: number, cg: number, cb: number, f: number) => { r = lerp(r, cr, f); gg = lerp(gg, cg, f); b = lerp(b, cb, f); };
  if (nl > 0.55) mix(0.6, 0.58, 0.38, smooth(0.55, 0.75, nl) * 0.55); else if (nl < 0.42) mix(0.37, 0.45, 0.27, smooth(0.42, 0.25, nl) * 0.6);
  if (g.kind === 'bank' || g.kind === 'bed') {
    const above = g.y - g.wl;
    if (above < 0.12) mix(0.36, 0.33, 0.25, 1); else if (above < 0.55) mix(0.63, 0.57, 0.44, 1 - smooth(0.3, 0.55, above)); else mix(0.4, 0.5, 0.26, 0.5);
  } else if (g.kind === 'levee') mix(0.6, 0.55, 0.42, 0.75);
  else if (g.kind === 'plat') mix(0.5, 0.51, 0.38, 0.45);
  else if (g.kind === 'kl') mix(0.45, 0.44, 0.4, 1);
  if (g.base > 0.3) { mix(0.27, 0.37, 0.2, smooth(0.3, 5, g.base)); if (g.base > 16) mix(0.46, 0.44, 0.38, smooth(16, 30, g.base) * (0.5 + n * 0.5)); }
  c.setRGB(r, gg, b).convertSRGBToLinear();
}
export function buildGround() {
  const zw = T3.weirZ, W = T3.W, K = T3.KL;
  const ZMIN = W.z0 - 160, ZMAX = W.z1 + 160, UMIN = W.x0 - 160 - RIV0, UMAX = W.x1 + 160 - RIV0;
  const axis = (ranges: [number, number, number][], brk: number[]) => { const a: number[] = []; ranges.forEach(([p, q, s]) => { for (let v = p; v < q - 1e-6; v += s) a.push(v); }); a.push(ranges[ranges.length - 1][1]); brk.forEach(v => a.push(v - 0.03, v + 0.03)); return [...new Set(a.map(v => Math.round(v * 1000) / 1000))].sort((p, q) => p - q); };
  const zs = axis([[ZMIN, zw - 40, 2], [zw - 40, zw - 9, 0.8], [zw - 9, zw + 12, 0.25], [zw + 12, zw + 40, 0.8], [zw + 40, ZMAX, 1.4]], [T3.zA, T3.zB, K.z0, K.z1]);
  // fine columns across the platform edges and the yard ramp, so roads laid on the analytic height do not dip under
  const us = axis([[UMIN, -45, 4], [-45, -20, 1.5], [-20, -11, 0.6], [-11, 11, 0.25], [11, 20, 0.6], [20, 45, 1.5], [45, UMAX, 4]], [-WEIR_HW, WEIR_HW, K.x1 - RIV0]);
  const nx = us.length, nz = zs.length, pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), c = new THREE.Color();
  for (let j = 0; j < nz; j++) {
    const z = zs[j], sh = riverX(z) - RIV0;
    for (let i = 0; i < nx; i++) {
      const u = us[i], x = RIV0 + u + sh * (1 - smooth(16, 40, Math.abs(u))), g = groundInfo(x, z), k = j * nx + i;
      pos[k * 3] = x; pos[k * 3 + 1] = g.y; pos[k * 3 + 2] = z;
      groundColor(g, x, z, c); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 4; uv[k * 2 + 1] = z / 4;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let n = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1; idx[n++] = a; idx[n++] = cc; idx[n++] = b; idx[n++] = b; idx[n++] = cc; idx[n++] = d; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, S.M.ground); mesh.receiveShadow = true; S.scene.add(mesh);
}
