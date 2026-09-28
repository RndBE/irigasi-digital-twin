import { R, mainOf, pathTo } from './network';
import { cutLine, distAlongTo, lineLen, pointAlong } from './geometry';
import { ELEV } from './terrain';

/** Profil muka tanah (km, mdpl, nama ruas) dari sumber air sampai ruas `i`, dengan titik tiap bangunan. */
export function profileData(i: number) {
  const path = pathTo(i), pts: [number, number, string][] = [], marks: { km: number; name: string; ruas: string }[] = [];
  const src = R[path[0]].srcObj;
  let off = 0;
  path.forEach((k, n) => {
    let line = mainOf(k);
    if (n < path.length - 1) line = cutLine(line, distAlongTo(line, mainOf(path[n + 1])[0]));
    const L = lineLen(line), cnt = Math.max(2, Math.ceil(L / 0.4));
    for (let s = 0; s <= cnt; s++) { const p = pointAlong(line, L * s / cnt); pts.push([(off + L * s / cnt) / 10, ELEV(p[0], p[1]), R[k].n]); }
    marks.push({ km: off / 10, name: n === 0 ? (src ? src.name : 'Bendung Copong') : (R[k].s || R[k].n), ruas: R[k].n });
    off += L;
  });
  return { pts, marks, src };
}
