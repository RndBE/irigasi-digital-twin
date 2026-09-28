import { clamp } from '../lib/format';
import { DATA } from './network';

/**
 * Muka tanah dari Copernicus DEM GLO-90 (grid `DATA.dem.n` × `DATA.dem.n`), dirapatkan dua kali lalu diinterpolasi
 * per segitiga. Dipakai profil muka tanah di panel ruas.
 */
const DEM = (() => {
  const n = DATA.dem.n, e = DATA.dem.elev, [x0, z0, x1, z1] = DATA.bbox, m = n * 2 - 1;
  const el = new Float32Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const fi = i / 2, fj = j / 2, i0 = Math.floor(fi), j0 = Math.floor(fj), i1 = Math.min(n - 1, i0 + 1), j1 = Math.min(n - 1, j0 + 1), a = fi - i0, b = fj - j0;
    el[i * m + j] = e[i0 * n + j0] * (1 - a) * (1 - b) + e[i0 * n + j1] * (1 - a) * b + e[i1 * n + j0] * a * (1 - b) + e[i1 * n + j1] * a * b;
  }
  return { m, el, x0, z0, dx: (x1 - x0) / (m - 1), dz: (z1 - z0) / (m - 1) };
})();

/** Elevasi muka tanah (mdpl) di titik skema (x, z). */
export function ELEV(x: number, z: number) {
  const { m, x0, z0, dx, dz, el } = DEM;
  const fx = clamp((x - x0) / dx, 0, m - 1.0001), fz = clamp((z - z0) / dz, 0, m - 1.0001);
  const j = Math.floor(fx), i = Math.floor(fz), u = fx - j, v = fz - i;
  const h00 = el[i * m + j], h01 = el[i * m + j + 1], h10 = el[(i + 1) * m + j], h11 = el[(i + 1) * m + j + 1];
  return u + v <= 1 ? h00 + (h01 - h00) * u + (h10 - h00) * v : h11 + (h10 - h11) * (1 - u) + (h01 - h11) * (1 - v);
}
