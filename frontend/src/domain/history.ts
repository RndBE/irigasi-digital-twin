import { BLN, BULAN, daysIn, hhmm, tanggal, tglPanjang, wibDate, wibDay, wibT } from '../lib/format';
import { GATES } from './gates';
import { SOURCES } from './network';
import { SCEN } from './scenarios';
import { recommendWeir } from './weir';
import { steady, subtree, sumRoots } from './simulation';
import { STEP, T0, sim } from './state';
import type { EvalCtx, LogParam, Logger } from './loggers';
import type { Env, OpenMap } from './types';

/**
 * Riwayat data untuk halaman Analisa.
 *
 * Mode peraga hanya punya cuplikan 24 jam terakhir dari simulasi berjalan. Waktu sebelum itu diisi riwayat sintetis
 * yang bisa diulang: debit Cimanuk mengikuti pola musim (tinggi Des–Apr, rendah Jul–Sep), hujan harian acak berbenih
 * per tanggal dengan puncak sore hari, dan jaringan dihitung dalam keadaan tunak dengan bukaan pintu awal serta pintu
 * bendung yang disetel menahan muka air normal. Di tahap sambung data, fungsi ini diganti pembacaan riwayat logger
 * dari API SimHidro.
 */

/** Debit relatif Cimanuk per bulan (Jan–Des) dan peluang hari hujan. */
const S_MONTH = [1.9, 2.0, 1.9, 1.6, 1.1, 0.8, 0.6, 0.5, 0.55, 0.8, 1.3, 1.7];
const P_WET = [0.7, 0.7, 0.65, 0.55, 0.4, 0.25, 0.15, 0.1, 0.15, 0.35, 0.6, 0.7];
const M_REF = wibDate(T0).m;
const dayRand = (day: number, k: number) => { const x = Math.sin(day * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
/** Curah hujan total satu hari WIB (mm). */
function rainDay(day: number) {
  const m = wibDate(day * 1440 - 420).m;
  if (dayRand(day, 1) > P_WET[m]) return 0;
  return -Math.log(1 - dayRand(day, 2) * 0.97) * 14 * (0.6 + S_MONTH[m] * 0.3);
}
/** Intensitas hujan (mm/jam) pada waktu `t`: sebaran normal sekitar puncak sore. */
function rainAt(t: number) {
  const day = wibDay(t), R = rainDay(day); if (!R) return 0;
  const h = wibDate(t).h + (t % 60) / 60, peak = 14.5 + dayRand(day, 3) * 2.5, sig = 1.1;
  return R * Math.exp(-((h - peak) ** 2) / (2 * sig * sig)) / (sig * Math.sqrt(2 * Math.PI));
}
function envAt(t: number): Env {
  const day = wibDay(t), w = wibDate(t), sm = S_MONTH[w.m] / S_MONTH[M_REF];
  const runoff = 0.35 * rainDay(day - 1) + 0.15 * rainDay(day - 2) + (w.h >= 16 ? 0.25 * rainDay(day) : 0);
  const Qriver = Math.max(0.8, SCEN.normal.river * sm * (1 + 0.05 * Math.sin((w.h - 9) / 24 * 2 * Math.PI) + 0.08 * (dayRand(day, 4) - 0.5)) + runoff * 0.8);
  const src: Record<string, number> = {};
  SOURCES.forEach(s => { if (s.kind !== 'utama') src[s.key] = Math.max(0.004, s.base[0] * sm * (1 + 0.03 * runoff)); });
  return { Qriver, rain: rainAt(t), src };
}

let pastOpen: OpenMap | null = null;
// keadaan tunak per waktu dipakai bersama oleh semua parameter (grafik multi parameter menghitung beberapa sekaligus)
const ctxCache = new Map<number, EvalCtx>();
/** Keadaan jaringan pada waktu lampau `t` (tunak, skenario normal). */
function ctxAt(t: number, envOnly: boolean): EvalCtx {
  const env = envAt(t);
  if (!pastOpen) pastOpen = { ...sim.hist[0].open };
  if (envOnly) return { t, Qriver: env.Qriver, rain: env.rain, srcRiver: SOURCES.map(s => s.kind === 'utama' ? env.Qriver : env.src[s.key]), open: pastOpen } as EvalCtx;
  let c = ctxCache.get(t);
  if (!c) { c = steadyCtx(t, env); ctxCache.set(t, c); if (ctxCache.size > 3000) ctxCache.delete(ctxCache.keys().next().value!); }
  return c;
}
function steadyCtx(t: number, env: Env): EvalCtx {
  const open = { ...pastOpen }; recommendWeir(env, open);
  const ss = steady(env, open, 'normal'), f = ss.f, { sg, sn } = subtree(ss.got, f), need = sumRoots(sn), got = sumRoots(sg);
  const wq = ss.weir ? ss.weir.q : [0, 0, 0, 0];
  return {
    t, Qriver: env.Qriver, rain: env.rain, f, Qin: ss.Qin, spill: ss.spill, situ: ss.situ, need, got, K: got / need, waste: ss.spill,
    hMercu: ss.weir ? ss.weir.H : 0, wq, grpGot: [], grpNeed: [], gateNeed: [], gateK: [],
    gateQ: GATES.map(g => g.w ? wq[g.w.bay] : ss.Q[g.ri]),
    srcRiver: SOURCES.map(s => s.kind === 'utama' ? env.Qriver : env.src[s.key]), q: new Float32Array(0),
    Q: ss.Q, sg, sn, open,
  };
}

export interface Sample { t: number; v: number | null; w: number }
const cache = new Map<string, Sample[]>();
function synthetic(p: LogParam, key: string, t0: number, t1: number, step: number): Sample[] {
  const k = `${key}|${t0}|${t1}|${step}`;
  let out = cache.get(k);
  if (!out) {
    out = [];
    for (let t = t0; t < t1; t += step) out.push({ t, v: p.fromCtx(ctxAt(t, !!p.envOnly)), w: step / 60 });
    cache.set(k, out);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return out;
}
/** Nilai parameter dalam [t0, t1): riwayat sintetis sebelum cuplikan tertua, cuplikan simulasi sesudahnya. */
function samples(lg: Logger, p: LogParam, t0: number, t1: number, step: number): Sample[] {
  const hs = sim.hist[0].t, out: Sample[] = [];
  if (t0 < hs) { const s0 = Math.ceil(t0 / step) * step; out.push(...synthetic(p, `${lg.id}|${p.key}`, s0, Math.min(t1, hs), step)); }
  sim.hist.forEach(s => { if (s.t >= t0 && s.t < t1) out.push({ t: s.t, v: p.fromSnap(s), w: STEP / 60 }); });
  return out;
}

export type RangeKind = 'day' | 'month' | 'year' | 'custom';
export interface Period { range: RangeKind; t0: number; t1: number }
export interface Bucket { t: number; label: string; long: string; mean: number | null; min: number | null; max: number | null; sum: number | null; peak: number | null; n: number; ok: number; tMin: number | null; tMax: number | null }
export interface Series { buckets: Bucket[]; mean: number | null; min: number | null; max: number | null; sum: number | null; tMin: number | null; tMax: number | null; n: number; ok: number; title: string }

/** Judul periode seperti di mini-stesy: "28 September 2026", "September 2026", "2026", "1–7 Sep 2026". */
export function periodTitle(p: Period) {
  const a = wibDate(p.t0);
  if (p.range === 'day') return tglPanjang(p.t0);
  if (p.range === 'month') return `${BULAN[a.m]} ${a.y}`;
  if (p.range === 'year') return String(a.y);
  return `${tglPanjang(p.t0)} – ${tglPanjang(p.t1 - 1)}`;
}

/** Rerata, minimum, maksimum (atau jumlah untuk curah hujan) per jam, hari, atau bulan dalam periode. */
export function analyse(lg: Logger, p: LogParam, per: Period): Series {
  const now = sim.t + STEP, t1 = Math.min(per.t1, now), a = wibDate(per.t0);
  const edges: { t: number; e: number; label: string; long: string }[] = [];
  if (per.range === 'day') for (let h = 0; h < 24; h++) { const t = per.t0 + h * 60; edges.push({ t, e: t + 60, label: hhmm(t), long: hhmm(t) }); }
  else if (per.range === 'year') for (let m = 0; m < 12; m++) { const t = wibT(a.y, m, 1); edges.push({ t, e: wibT(a.y, m + 1, 1), label: BLN[m], long: `${BULAN[m]} ${a.y}` }); }
  else for (let t = per.t0; t < per.t1; t += 1440) { const w = wibDate(t); edges.push({ t, e: t + 1440, label: per.range === 'month' ? String(w.d) : `${w.d} ${BLN[w.m]}`, long: tanggal(t) }); }
  const step = per.range === 'day' ? STEP : per.range === 'year' && !p.envOnly ? 360 : 60;
  const all = t1 > per.t0 ? samples(lg, p, per.t0, t1, step) : [];
  let k = 0;
  const buckets: Bucket[] = edges.map(ed => {
    const b: Bucket = { t: ed.t, label: ed.label, long: ed.long, mean: null, min: null, max: null, sum: null, peak: null, n: 0, ok: 0, tMin: null, tMax: null };
    let sw = 0, sv = 0;
    while (k < all.length && all[k].t < ed.e) {
      const s = all[k++]; b.n++;
      if (s.v == null || !isFinite(s.v)) continue;
      b.ok++; sw += s.w; sv += s.v * s.w;
      if (b.min == null || s.v < b.min) { b.min = s.v; b.tMin = s.t; }
      if (b.max == null || s.v > b.max) { b.max = s.v; b.tMax = s.t; }
    }
    if (sw > 0) { b.mean = sv / sw; if (p.sum) { b.sum = sv; b.peak = b.max; } }
    return b;
  }).filter(b => b.t < t1 || per.range === 'day');
  const has = buckets.filter(b => b.mean != null);
  const pick = (f: (b: Bucket) => number | null, better: (x: number, y: number) => boolean) => has.reduce<Bucket | null>((best, b) => best == null || better(f(b)!, f(best)!) ? b : best, null);
  const lo = pick(b => b.min, (x, y) => x < y), hi = pick(b => b.max, (x, y) => x > y);
  const totalW = has.reduce((x, b) => x + b.ok, 0);
  const mean = has.length ? has.reduce((x, b) => x + b.mean! * b.ok, 0) / Math.max(1, totalW) : null;
  return {
    buckets, mean, min: lo ? lo.min : null, max: hi ? hi.max : null, tMin: lo ? lo.tMin : null, tMax: hi ? hi.tMax : null,
    sum: p.sum ? has.reduce((x, b) => x + (b.sum || 0), 0) : null,
    n: buckets.reduce((x, b) => x + b.n, 0), ok: buckets.reduce((x, b) => x + b.ok, 0), title: periodTitle(per),
  };
}

/** Periode untuk pilihan rentang: hari/bulan/tahun berisi `t`, atau rentang tanggal [from, to]. */
export function makePeriod(range: RangeKind, t: number, to?: number): Period {
  const w = wibDate(t);
  if (range === 'day') { const t0 = wibT(w.y, w.m, w.d); return { range, t0, t1: t0 + 1440 }; }
  if (range === 'month') return { range, t0: wibT(w.y, w.m, 1), t1: wibT(w.y, w.m, daysIn(w.y, w.m) + 1) };
  if (range === 'year') return { range, t0: wibT(w.y, 0, 1), t1: wibT(w.y + 1, 0, 1) };
  const t0 = wibT(w.y, w.m, w.d), e = wibDate(to ?? t), t1 = wibT(e.y, e.m, e.d) + 1440;
  return { range, t0, t1: Math.max(t0 + 1440, Math.min(t1, t0 + 62 * 1440)) };
}

/** Kelas intensitas hujan per jam (BMKG) dan per hari. */
export const RAIN_HOURLY: [number, string, string][] = [[0.0001, 'Tidak hujan', '#7c8aa5'], [1, 'Sangat ringan', '#8fd3ff'], [5, 'Ringan', '#4aa3ff'], [10, 'Sedang', '#46d78f'], [20, 'Lebat', '#ffb454'], [Infinity, 'Sangat lebat', '#ff7a66']];
export const RAIN_DAILY: [number, string, string][] = [[0.5, 'Tidak hujan', '#7c8aa5'], [20, 'Ringan', '#4aa3ff'], [50, 'Sedang', '#46d78f'], [100, 'Lebat', '#ffb454'], [150, 'Sangat lebat', '#ff7a66'], [Infinity, 'Ekstrem', '#c86bff']];
export const rainClass = (v: number, table: [number, string, string][]) => table.find(r => v < r[0]) || table[table.length - 1];
