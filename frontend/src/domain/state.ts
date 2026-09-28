import type { SimState } from './types';

/** Langkah simulasi dalam menit; logger telemetri juga mengirim tiap 10 menit. */
export const STEP = 10;
/** Waktu mulai: kelipatan 10 menit terdekat sebelum halaman dibuka. */
export const T0 = Math.floor(Date.now() / 60000 / STEP) * STEP;
/** Stasiun yang offline berhenti mengirim sejak waktu ini. */
export const OFF_SINCE = T0 - 130;

/**
 * Keadaan simulasi bersama. Diisi `domain/simulation.ts` (bukaan awal, pemanasan 24 jam); dibaca stasiun,
 * panel, dan adegan 3D.
 */
export const sim: SimState = {
  scenario: 'normal',
  auto: false,
  t: T0 - 144 * STEP,
  env: { Qriver: 16, rain: 0, src: {} },
  rainBuf: [],
  open: {},
  hist: [],
};

/** Cuplikan terbaru. */
export const cur = () => sim.hist[sim.hist.length - 1];
export const rain24 = () => sim.hist.reduce((a, s) => a + s.rain * STEP / 60, 0);
