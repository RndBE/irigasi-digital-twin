import * as THREE from 'three';
import { clamp } from '../lib/format';
import { rnd } from '../lib/random';
import { S, T3, riverX, type P } from './context';
import { bld, ribbon } from './geometry';
import { occLine } from './occupancy';
import { car } from './props';
import { gY } from './terrain';

/** Jalan raya, jalan ke bendung, jembatan di atas sungai kecil, tembok jembatan di atas saluran, dan mobil. */
function roadY(x: number, z: number) {
  let y = gY(x, z);
  for (const s of T3.cseg) {
    const [ax, az] = s.a, [bx, bz] = s.b, minx = Math.min(ax, bx) - s.out - 2, maxx = Math.max(ax, bx) + s.out + 2, minz = Math.min(az, bz) - s.out - 2, maxz = Math.max(az, bz) + s.out + 2;
    if (x < minx || x > maxx || z < minz || z > maxz) continue;
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    y = Math.max(y, s.T + 0.12 - Math.max(0, d - s.out) * 0.2);
  }
  return y;
}
function nearStream(x: number, z: number, r: number) { for (const pts of T3.streams) for (let k = 0; k < pts.length; k += 2) if (Math.abs(pts[k][0] - x) < r && Math.abs(pts[k][1] - z) < r && Math.hypot(pts[k][0] - x, pts[k][1] - z) < r) return pts[k]; return null; }
export function buildRoads() {
  const zw = T3.weirZ, cx = riverX(zw), W = T3.W, ZMIN = W.z0 - 150, ZMAX = W.z1 + 150, M = S.M;
  const lastZ = T3.systems[T3.systems.length - 1].z;
  const R1 = [[34, ZMIN], [34, -20], [33.4, 2], [33, 9.6], [33, 18], [30, 32], [27, 60], [26.5, 120], [27.2, 200], [26, 270], [26.6, 340], [26, lastZ + 25], [26.5, ZMAX]];
  // from the service bridge straight down the platform ramp, then past the control-house forecourt
  const RE = [[cx + 6.4, zw + 3.8], [cx + 8.1, zw + 3.8], [cx + 9.8, zw + 3.7], [cx + 11.3, zw + 2.5], [cx + 12.8, zw + 1.45], [16, zw + 1.3], [22, zw + 2.0], [28, zw + 3.8], [31.6, zw + 5.8]];
  const RW = [[cx - 6.4, zw + 3.8], [cx - 9, zw + 3.7], [-13.5, zw + 3.6], [-17, zw + 7], [-19, zw + 20], [-20, 80], [-19, 160], [-21, 260], [-20, 360], [-21, ZMAX]];
  const RN = [[-13.5, zw + 3.4], [-16, zw - 4], [-19.5, zw - 20], [-24, -40], [-30, -90], [-34, ZMIN]];
  const smoothPath = (ctrl: number[][], stp = 0.6) => { const c = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), n = Math.ceil(c.getLength() / stp), out: P[] = []; for (let k = 0; k <= n; k++) { const p = c.getPoint(k / n); out.push([p.x, p.z]); } return out; };
  const bridges: number[][] = [];
  // the deck sits on the highest ground across its width, so a road running across a slope does not sink into it
  const road = (ctrl: number[][], width: number, mat: THREE.Material, stp?: number) => {
    const pts = smoothPath(ctrl, stp);
    const withY = pts.map(([x, z], k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L * width / 2, nz = (b[0] - a[0]) / L * width / 2;
      return [x, z, Math.max(roadY(x, z), roadY(x + nx, z + nz), roadY(x - nx, z - nz)) + 0.03];
    });
    ribbon(withY, width, 0, mat, width * 1.1);
    occLine(pts, width / 2 + 0.7, 3);
    for (let k = 2; k < pts.length - 2; k += 1) { const [x, z] = pts[k], s = nearStream(x, z, 0.6); if (s && !bridges.some(bb => Math.hypot(bb[0] - x, bb[1] - z) < 3)) bridges.push([x, z, Math.atan2(pts[k + 1][0] - pts[k - 1][0], pts[k + 1][1] - pts[k - 1][1]), width]); }
    return pts;
  };
  const r1 = road(R1, 1.3, M.asphalt), re = road(RE, 1.1, M.asphalt, 0.3), rw = road(RW, 1.1, M.asphalt); road(RN, 1.0, M.asphalt);
  bridges.forEach(([x, z, a, w]) => { const b = bld(x, 0, z, a); b.box(M.concrete, w + 0.3, 0.16, 2.6, 0, 0.1, 0); for (const s of [-1, 1]) b.box(M.paint, 0.08, 0.2, 2.6, s * (w / 2 + 0.12), 0.28, 0); });
  // parapets where the main road crosses a canal
  for (let k = 1; k < r1.length - 1; k++) {
    const [x, z] = r1[k];
    for (const s of T3.cseg) {
      if (Math.abs(s.a[1] - s.b[1]) > 0.01 || Math.abs(z - s.a[1]) > 0.35 || x < Math.min(s.a[0], s.b[0]) || x > Math.max(s.a[0], s.b[0])) continue;
      const b = bld(x, 0, s.a[1], 0), y = s.T + 0.15;
      for (const o of [-0.78, 0.78]) b.box(M.paint, 0.1, 0.22, s.out * 2 + 0.6, o, y + 0.1, 0);
    }
  }
  T3.roads = { r1, rw, re };
  // cars on the main road
  for (let k = 0; k < 9; k++) { const i = Math.floor(30 + rnd() * (r1.length - 60)), [x, z] = r1[i], [x2, z2] = r1[i + 1], a = Math.atan2(x2 - x, z2 - z), side = rnd() < 0.5 ? -1 : 1; car(x + Math.cos(a) * 0.3 * side, z - Math.sin(a) * 0.3 * side, a + Math.PI / 2 + (side < 0 ? Math.PI : 0), k + 2); }
}
