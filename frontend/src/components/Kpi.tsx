import type { ReactNode } from 'react';
import { clamp } from '../lib/format';
import type { Lvl } from '../domain/types';
import { NavIcon, type NavIconName } from './NavIcon';

/** Warna aksen kartu dan batang menurut tingkat status; tanpa status = biru. */
const TONE: Record<Lvl | 'info', string> = { info: 'var(--accent)', good: 'var(--good)', warn: 'var(--warn)', serious: 'var(--serious)', crit: 'var(--crit)' };

/** Kartu besaran kunci ala dasbor demo Beacon: ikon, label, nilai, keterangan, dan meter tipis di bawah. */
export function KpiCard({ icon, label, value, unit, note, noteTone, meter, tone = 'info', onClick }: {
  icon: NavIconName; label: string; value: ReactNode; unit?: string; note?: ReactNode; noteTone?: 'up' | 'down';
  meter?: number; tone?: Lvl | 'info'; onClick?: () => void;
}) {
  const body = <>
    <span className="kpi-card__icon"><NavIcon name={icon} /></span>
    <span className="kpi-card__label">{label}</span>
    <span className="kpi-card__value">{value}{unit && <small>{unit}</small>}</span>
    {note != null && <span className={`kpi-card__note${noteTone ? ' ' + noteTone : ''}`}>{note}</span>}
    {meter != null && <span className="kpi-card__meter"><i style={{ width: `${(clamp(meter, 0, 1) * 100).toFixed(1)}%` }} /></span>}
  </>;
  const style = { ['--kc' as string]: TONE[tone] };
  return onClick
    ? <button type="button" className="kpi-card" style={style} onClick={onClick}>{body}</button>
    : <div className="kpi-card" style={style}>{body}</div>;
}

/** Satu baris batang mendatar: nama, batang berisi `frac` (0–1), nilai di kanan. */
export function BarRow({ name, frac, value, tone = 'info', title, onClick, marks }: {
  name: ReactNode; frac: number; value: ReactNode; tone?: Lvl | 'info'; title?: string; onClick?: () => void; marks?: number[];
}) {
  const inner = <>
    <span className="brow__name">{name}</span>
    <span className="brow__track">
      <i className="brow__fill" style={{ width: `${(clamp(frac, 0, 1) * 100).toFixed(1)}%`, background: TONE[tone] }} />
      {marks?.map(m => <i key={m} className="brow__mark" style={{ left: `${(clamp(m, 0, 1) * 100).toFixed(1)}%` }} />)}
    </span>
    <span className="brow__val">{value}</span>
  </>;
  return onClick
    ? <button type="button" className="brow click" title={title} onClick={onClick}>{inner}</button>
    : <div className="brow" title={title}>{inner}</div>;
}

/** Warna menurut Faktor K: kurang (< 0,75), perlu perhatian (< 0,95 atau berlebih ≥ 1,1), baik. */
export const kTone = (K: number): Lvl => K < 0.75 ? 'crit' : K < 0.95 || K >= 1.1 ? 'warn' : 'good';
