import { useEffect, useRef, type ReactNode } from 'react';
import type { Lvl, Sel, Status } from '../domain/types';
import { makeChart, type ChartConfig, type ChartData, type ChartHandle } from '../lib/chart';
import { select } from '../store/twinStore';

/** Komponen kecil yang dipakai banyak panel: ikon status, chip, bacaan, tautan objek, grafik. */

const ICON_PATHS: Record<Lvl | 'gate', ReactNode> = {
  good: <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  warn: <><path d="M6 1.4l5 9.1H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6 4.8v2.6M6 9.1v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  serious: <><circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M2.8 9.2l6.4-6.4" stroke="currentColor" strokeWidth="1.4" /></>,
  crit: <><path d="M4 1h4l3 3v4l-3 3H4L1 8V4z" fill="currentColor" /><path d="M6 3.4v3.2M6 8.4v.1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></>,
  gate: <><path d="M1.5 11V2.5h9V11" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M3.5 5h5v4h-5z" fill="currentColor" /><path d="M6 1v2" stroke="currentColor" strokeWidth="1.3" /></>,
};
export function Icon({ name }: { name: Lvl | 'gate' }) {
  return <svg viewBox="0 0 12 12" aria-hidden="true">{ICON_PATHS[name]}</svg>;
}
export function Chip({ lvl, children }: { lvl: Lvl; children: ReactNode }) {
  return <span className={`chip ${lvl}`}><Icon name={lvl} />{children}</span>;
}
export const StatusChip = ({ s }: { s: Status }) => <Chip lvl={s[0]}>{s[1]}</Chip>;

/** Satu bacaan: label, nilai, satuan. */
export function Rd({ k, v, u, big }: { k: ReactNode; v: ReactNode; u?: ReactNode; big?: boolean }) {
  return <div className={`rd${big ? ' big' : ''}`}><div className="k">{k}</div><div className="v">{v}{u ? <> <small>{u}</small></> : null}</div></div>;
}

/** Tombol yang memilih objek dan menerbangkan kamera ke sana. */
export function SelLink({ sel, className = 'linkbtn', children }: { sel: Sel; className?: string; children: ReactNode }) {
  return <button className={className} type="button" onClick={() => select(sel, { fly: true })}>{children}</button>;
}

/** Grafik deret waktu; dibuat sekali per komponen, datanya diperbarui tiap render. */
export function Chart({ config, data }: { config: ChartConfig; data: ChartData }) {
  const ref = useRef<HTMLDivElement>(null), chart = useRef<ChartHandle | null>(null);
  useEffect(() => {
    chart.current = makeChart(ref.current!, config);
    return () => { chart.current?.dispose(); chart.current = null; };
    // konfigurasi tetap selama komponen hidup; komponen diberi `key` baru bila konfigurasinya berubah
  }, []);
  useEffect(() => { chart.current?.update(data); });
  return <div ref={ref} />;
}

/** Garis tren kecil di panel kondisi. */
export function Spark({ values }: { values: number[] }) {
  const W = 78, H = 30, n = values.length;
  if (n < 2) return <svg className="spark" aria-hidden="true" />;
  const mx = Math.max(...values), mn = Math.min(...values), rg = (mx - mn) || 1;
  const pts = values.map((v, i) => [(i / (n - 1)) * W, H - 3 - ((v - mn) / rg) * (H - 8)]);
  const l = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const e = pts[n - 1];
  return (
    <svg className="spark" aria-hidden="true" viewBox={`0 0 ${W} ${H}`}>
      <path className="a" d={`${l}L${W} ${H}L0 ${H}Z`} /><path className="l" d={l} /><circle cx={e[0].toFixed(1)} cy={e[1].toFixed(1)} r="3" />
    </svg>
  );
}

/** Legenda dua deret: garis penuh dan garis putus. */
export function Legend2({ a, b }: { a: string; b: string }) {
  return <><span className="lg"><i style={{ ['--c' as string]: 'var(--s1)' }} />{a}</span><span className="lg"><i className="dash" style={{ ['--c' as string]: 'var(--s2)' }} />{b}</span></>;
}
