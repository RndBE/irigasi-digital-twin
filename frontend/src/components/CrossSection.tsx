import { clamp, nf } from '../lib/format';
import type { Ruas } from '../domain/types';

/** Penampang saluran trapesium: dimensi rencana, tinggi air rencana, dan tinggi air saat ini. */
export function CrossSection({ r, q }: { r: Ruas; q: number }) {
  const b = r.b || (r.type === 'T' ? 0.3 : 0.6), h = r.h || (r.type === 'T' ? 0.2 : 0.4), m = r.m == null ? 1 : r.m;
  const fb = Math.max(0.2, h * 0.3), Ht = h + fb, Qd = r.Dc > 0 ? r.Dc : (r.cap / 2 || 0.01);
  const hn = clamp(h * Math.pow(Math.max(0, q) / Qd, 0.6), 0, Ht);
  const topW = b + 2 * m * Ht, W = 300, Hs = 132, bank = 0.5;
  const sc = Math.min((W - 40) / (topW + 2 * bank), (Hs - 42) / Ht);
  const cx = W / 2, y0 = Hs - 26, X = (u: number) => (cx + u * sc).toFixed(1), Y = (v: number) => (y0 - v * sc).toFixed(1);
  const hw = (d: number) => b / 2 + m * d;
  const ground = `M${X(-topW / 2 - bank)} ${Y(Ht)} L${X(-hw(Ht))} ${Y(Ht)} L${X(-b / 2)} ${Y(0)} L${X(b / 2)} ${Y(0)} L${X(hw(Ht))} ${Y(Ht)} L${X(topW / 2 + bank)} ${Y(Ht)} L${X(topW / 2 + bank)} ${Hs - 4} L${X(-topW / 2 - bank)} ${Hs - 4}Z`;
  const lining = `M${X(-hw(Ht))} ${Y(Ht)} L${X(-b / 2)} ${Y(0)} L${X(b / 2)} ${Y(0)} L${X(hw(Ht))} ${Y(Ht)}`;
  return (
    <svg viewBox={`0 0 ${W} ${Hs}`} role="img" aria-label={`Penampang saluran ${r.n}`}>
      <path className="gr" d={ground} />
      {hn > 0.001 && <path className="wt" d={`M${X(-hw(hn))} ${Y(hn)} L${X(-b / 2)} ${Y(0)} L${X(b / 2)} ${Y(0)} L${X(hw(hn))} ${Y(hn)}Z`} />}
      <path className="lining" d={lining} />
      <line className="ds" x1={X(-hw(h) - 0.15)} x2={X(hw(h) + 0.15)} y1={Y(h)} y2={Y(h)} />
      <text x={X(hw(h) + 0.2)} y={Y(h)} dy="0.32em" className="k">h rencana {nf(h)} m</text>
      <text x={X(-hw(hn) - 0.2)} y={Y(hn)} dy="0.32em" textAnchor="end" className="k">air kini {nf(hn)} m</text>
      <text x={cx} y={Hs - 10} textAnchor="middle">b = {nf(b)} m · talud 1 : {nf(m, 1)} · jagaan {nf(fb)} m</text>
    </svg>
  );
}
