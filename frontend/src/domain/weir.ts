import { clamp } from '../lib/format';
import type { Env, OpenMap, Status, WeirBalance, WeirGate } from './types';

/**
 * Hidrolika Bendung Copong.
 *
 * Pintu bendung (Aprilia & Permana 2021): 3 pintu banjir lebar 12,5 m dengan daun 3,5 m di atas mercu, dan
 * pintu penguras lebar 5 m dengan daun 8 m yang ambangnya 4,5 m di bawah mercu. Ambang intake 2,2 m di atas
 * mercu. Semua tinggi H dalam meter di atas mercu; muka air normal menyisakan 0,9 m di atas ambang intake.
 */
export const INTAKE_CAP = 2.4;
export const ENV_FLOW = 0.5;
export const WEIR = { mu: 0.62, cd: 1.755, hIn: 2.2, hN: 3.1, hTop: 3.5 };
export const WG: WeirGate[] = [0, 1, 2].map((k): WeirGate => ({ id: 'w-banjir-' + (k + 1), bay: k, kind: 'banjir', b: 12.5, sill: 0, leafH: 3.5, maxA: 3.5 }))
  .concat([{ id: 'w-kuras', bay: 3, kind: 'kuras', b: 5, sill: -4.5, leafH: 8, maxA: 8 }]);

// flow through one gate at head H: orifice flow under the leaf, free weir flow once the leaf clears the water,
// plus water spilling over the top of the leaf
export function wgQ(w: WeirGate, a: number, H: number) {
  const h = H - w.sill; if (h <= 0) return 0;
  const q = a > 0.001 ? Math.min(WEIR.mu * a * Math.sqrt(19.62 * h), WEIR.cd * Math.pow(h, 1.5)) : 0;
  return w.b * (q + 1.7 * Math.pow(Math.max(0, h - a - w.leafH), 1.5));
}
/** Faktor debit intake terhadap muka air hulu (0 di ambang intake, 1 di muka air normal). */
export const headF = (H: number) => Math.sqrt(clamp((H - WEIR.hIn) / (WEIR.hN - WEIR.hIn), 0, 1.4));

// pond level where river inflow = flow through the gates + intake flow (both rise with the pond)
export function weirSolve(Qriver: number, open: OpenMap, qIntake: (H: number) => number): WeirBalance {
  const A = WG.map(w => (open[w.id] || 0) / 100 * w.maxA);
  const bal = (H: number) => WG.reduce((t, w, k) => t + wgQ(w, A[k], H), 0) + qIntake(H) - Qriver;
  let lo = -4.45, hi = 9;
  for (let it = 0; it < 46; it++) { const m = (lo + hi) / 2; if (bal(m) > 0) hi = m; else lo = m; }
  const H = (lo + hi) / 2;
  return { H, q: WG.map((w, k) => wgQ(w, A[k], H)), qin: qIntake(H) };
}

export const pondStatus = (H: number): Status =>
  H > WEIR.hTop + 0.3 ? ['crit', 'Melimpas daun pintu'] : H > WEIR.hTop ? ['warn', 'Melimpas tipis'] : H > WEIR.hN + 0.25 ? ['warn', 'Di atas normal']
    : H < WEIR.hIn ? ['crit', 'Di bawah ambang intake'] : H < WEIR.hN - 0.35 ? ['warn', 'Di bawah normal'] : ['good', 'Normal'];

// openings that hold the normal pond: the flood gates pass the river minus the intake; the scouring gate only
// flushes during floods. `round` = the 0,1 % steps an operator can set; analyses pass false for smooth curves.
export function recommendWeir(env: Env, open: OpenMap, round = true) {
  const qin = Math.min(INTAKE_CAP * open['g-intake'] / 100, Math.max(0, env.Qriver - ENV_FLOW)), sc = WG[3];
  open[sc.id] = env.Qriver > 80 ? 15 : 0;
  const rest = env.Qriver - qin - wgQ(sc, open[sc.id] / 100 * sc.maxA, WEIR.hN);
  let lo = 0, hi = 300;
  for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (3 * wgQ(WG[0], m / 300 * WG[0].maxA, WEIR.hN) > rest) hi = m; else lo = m; }
  const T = (lo + hi) / 2;
  [0, 1, 2].forEach(k => { open[WG[k].id] = Math.min(100, round ? Math.round(T / 3 * 10) / 10 : T / 3); });
}
