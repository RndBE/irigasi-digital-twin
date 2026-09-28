import { GATES } from './gates';
import { GROUPS, INTREE, LOCAL, R, ROOT, branchKey } from './network';
import { recommendWeir } from './weir';
import { grpK, steadyView } from './simulation';
import { STEP } from './state';
import type { Env, Group, OpenMap, Snapshot } from './types';

/**
 * Hitungan untuk halaman Dashboard dan Analisa: neraca volume 24 jam, keandalan pasokan per kelompok, pembagian air
 * per cabang, dan kepekaan jaringan terhadap debit Cimanuk.
 */

/** Pintu tempat air masuk jaringan: intake Bendung Copong, pengambilan bendung lokal, dan suplesi. */
const SUPPLY = GATES.flatMap((g, k) => g.kind === 'intake' || g.kind === 'lokal' || g.kind === 'suplesi' ? [k] : []);
const DT = STEP * 60;
/** Debit yang masuk jaringan pada satu cuplikan (m³/s). */
export const supplyOf = (s: Snapshot) => SUPPLY.reduce((a, k) => a + s.gateQ[k], 0);

/** Volume masuk, tersalur ke petak, dan terbuang selama riwayat (m³), serta waktu Faktor K di bawah 0,75. */
export function volumeBalance(hist: Snapshot[]) {
  let vin = 0, vgot = 0, vneed = 0, vwaste = 0, kSum = 0, below = 0;
  hist.forEach(s => { vin += supplyOf(s) * DT; vgot += s.got * DT; vneed += s.need * DT; vwaste += s.waste * DT; kSum += s.K; if (s.K < 0.75) below++; });
  const n = hist.length || 1;
  return { vin, vgot, vneed, vwaste, eff: vin > 0 ? vgot / vin : 0, meanK: kSum / n, hoursBelow: below * STEP / 60, hours: hist.length * STEP / 60 };
}

export interface Reliability { g: Group; meanK: number; minK: number; okShare: number }
/** Per kelompok: Faktor K rata-rata, terendah, dan bagian waktu dengan K ≥ 0,75. */
export function groupReliability(hist: Snapshot[]): Reliability[] {
  const n = hist.length || 1;
  return GROUPS.map(g => {
    let sum = 0, min = Infinity, ok = 0;
    hist.forEach(s => { const K = grpK(s, g.gi); sum += K; if (K < min) min = K; if (K >= 0.75) ok++; });
    return { g, meanK: sum / n, minK: min === Infinity ? 0 : min, okShare: ok / n };
  });
}

export interface Branch { key: string; got: number; need: number; area: number; groups: number }
/** Pasokan dan kebutuhan per cabang; `K` opsional per kelompok untuk bukaan lain (mis. rekomendasi). */
export function branchBalance(s: Snapshot, K?: number[]): Branch[] {
  const out = new Map<string, Branch>();
  GROUPS.forEach(g => {
    const key = branchKey(g), b = out.get(key) || { key, got: 0, need: 0, area: 0, groups: 0 };
    const need = s.grpNeed[g.gi];
    b.got += K ? K[g.gi] * need : s.grpGot[g.gi]; b.need += need; b.area += g.area; b.groups++;
    out.set(key, b);
  });
  return [...out.values()];
}

/** Waktu tempuh air (jam) dari sumber sampai ujung terjauh tiap saluran primer/sekunder, terlama lebih dulu. */
export function travelTimes(limit = 12) {
  const maxT = (i: number): number => Math.max(R[i].tA || 0, ...R[i].ck.map(maxT));
  const name = (i: number) => LOCAL.includes(i) ? 'Sistem ' + R[i].srcObj!.name : R[i].n;
  return R.filter(r => INTREE[r.i] && (r.type === 'P' || r.type === 'S') && r.i !== ROOT && !r.situ)
    .map(r => ({ key: name(r.i), tA: maxT(r.i) })).sort((a, b) => b.tA - a.tA).slice(0, limit);
}

/** Debit Cimanuk yang diuji pada analisis kepekaan (m³/s). */
export const SENS_Q = Array.from({ length: 40 }, (_, i) => i + 1);
/**
 * Muka air hulu, debit intake, dan Faktor K pada tiap debit Cimanuk: sekali dengan bukaan pintu bendung saat ini
 * (tidak diubah), sekali dengan pintu banjir/penguras yang disesuaikan untuk menahan muka air normal.
 */
export function riverSensitivity(open: OpenMap, env: Env) {
  return SENS_Q.map(Q => {
    const e = { ...env, Qriver: Q }, fixed = steadyView(open, e), adj = { ...open };
    recommendWeir(e, adj, false);
    const tuned = steadyView(adj, e);
    return { Q, H: fixed.H, Qin: fixed.Qin, K: fixed.K, Ha: tuned.H, Qina: tuned.Qin, Ka: tuned.K };
  });
}
