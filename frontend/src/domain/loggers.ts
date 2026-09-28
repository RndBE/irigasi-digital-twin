import { wibHour } from '../lib/format';
import { GATES, fine } from './gates';
import { STATIONS } from './stations';
import { battAt, stVal } from './simulation';
import { OFF_SINCE } from './state';
import type { Gate, OpenMap, Sel, Snapshot, Station, StationCtx } from './types';

/**
 * Daftar logger untuk halaman Analisa, mengikuti menu analisa mini-stesy: 16 stasiun telemetri (AWLR, debit,
 * penakar hujan) dan tiap pintu sebagai AWGC (pengendali pintu otomatis). Tiap logger punya beberapa parameter yang
 * bisa dibaca dari cuplikan simulasi berjalan (`fromSnap`) atau dari keadaan tunak hasil riwayat sintetis
 * (`fromCtx`).
 */
export interface EvalCtx extends StationCtx { open: OpenMap }
export interface LogParam {
  key: string; label: string; unit: string; d: number;
  /** Diakumulasi (curah hujan, mm) alih-alih dirata-rata. */
  sum?: boolean;
  /** Cukup dari debit sungai dan hujan, tanpa menghitung jaringan (lebih cepat). */
  envOnly?: boolean;
  fromSnap(s: Snapshot): number | null;
  fromCtx(c: EvalCtx): number | null;
}
export type LoggerType = 'AWLR' | 'Debit' | 'ARR' | 'AWGC';
export interface Logger {
  id: string; type: LoggerType; name: string; where: string; comm: string;
  params: LogParam[]; sel: Sel; offline: boolean;
  stn?: Station; gate?: Gate;
}

const alive = (stn: Station, t: number) => !(stn.offline && t > OFF_SINCE);
const ENV_ONLY = new Set(['AWLR-CMK-01', 'ARR-LWG-15', 'ARR-CPG-16']);
const idHash = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) / 997;
/** Suhu di dalam kotak logger (°C): hangat siang hari di bawah panel surya, turun saat hujan. */
const tempAt = (stn: Station, t: number, rain: number) =>
  24 + idHash(stn.id) * 1.6 + 7.5 * Math.max(0, Math.sin((wibHour(t) - 7.5) / 13 * Math.PI)) ** 1.3 - 2.2 * Math.min(1, rain / 4);

function stationLogger(stn: Station): Logger {
  const envOnly = ENV_ONLY.has(stn.id);
  const params: LogParam[] = [];
  if (stn.type === 'ARR') {
    params.push({ key: 'rain', label: 'Curah hujan', unit: 'mm', d: 1, sum: true, envOnly: true,
      fromSnap: s => stVal(stn, s), fromCtx: c => alive(stn, c.t) ? stn.main.get(c) : null });
  } else {
    params.push({ key: 'main', label: stn.main.label, unit: stn.main.unit, d: stn.main.d, envOnly,
      fromSnap: s => stVal(stn, s), fromCtx: c => alive(stn, c.t) ? stn.main.get(c) : null });
    params.push({ key: 'sub', label: stn.sub.label, unit: stn.sub.unit, d: stn.sub.d, envOnly,
      fromSnap: s => stVal(stn, s, 'sv2'), fromCtx: c => alive(stn, c.t) ? stn.sub.get(c) : null });
  }
  params.push({ key: 'temp', label: 'Suhu logger', unit: '°C', d: 1, envOnly: true,
    fromSnap: s => alive(stn, s.t) ? tempAt(stn, s.t, s.rain) : null, fromCtx: c => alive(stn, c.t) ? tempAt(stn, c.t, c.rain) : null });
  params.push({ key: 'batt', label: 'Baterai logger', unit: 'V', d: 2, envOnly: true,
    fromSnap: s => alive(stn, s.t) ? battAt(stn, s.t) : null, fromCtx: c => alive(stn, c.t) ? battAt(stn, c.t) : null });
  return { id: stn.id, type: stn.type, name: stn.name, where: stn.where, comm: stn.comm === 'Satelit' ? 'Satelit (Iridium)' : '4G', params, sel: { kind: 'station', id: stn.id }, offline: !!stn.offline, stn };
}

function gateLogger(g: Gate, k: number): Logger {
  const big = !!g.w || g.kind === 'intake';
  return {
    id: g.id, type: 'AWGC', name: g.name, where: `${g.role} · ${g.sub}`, comm: '4G', sel: { kind: 'gate', id: g.id }, offline: false, gate: g,
    params: [
      { key: 'open', label: 'Bukaan pintu', unit: '%', d: fine(g.id) ? 1 : 0, fromSnap: s => s.open[g.id], fromCtx: c => c.open[g.id] },
      { key: 'flow', label: 'Debit lewat pintu', unit: big ? 'm³/s' : 'l/dt', d: big ? 2 : 0,
        fromSnap: s => s.gateQ[k] * (big ? 1 : 1000), fromCtx: c => c.gateQ[k] * (big ? 1 : 1000) },
    ],
  };
}

export const LOGGERS: Logger[] = [...STATIONS.map(stationLogger), ...GATES.map(gateLogger)];
export const LOGMAP: Record<string, Logger> = Object.fromEntries(LOGGERS.map(l => [l.id, l]));
