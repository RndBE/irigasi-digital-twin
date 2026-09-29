import { clamp } from '../lib/format';
import { R, ROOT } from './network';
import { WEIR } from './weir';
import { Qa } from './simulation';
import { cur } from './state';
import type { Gate, Ruas, WeirGate } from './types';

/**
 * Ukuran rencana tiap pintu untuk model 3D di jendela detail: lebar b dan tinggi h dari data saluran, intake dari
 * data Bendung Copong (3 × 3 m × 1,15 m), pintu bendung dari Aprilia & Permana (2021).
 */
export interface GateSpec {
  r: Ruas;
  intake: boolean;
  weir?: WeirGate;
  motor: boolean;
  b: number; h: number;
  leaves: number;
  /** Lebar tiap daun (m). */
  bw: number;
  /** Tinggi dinding saluran di atas ambang (m). */
  depth: number;
  leafH: number;
  pier: number;
  maxLift: number;
}

export function gateSpec(G: Gate): GateSpec {
  if (G.w) { const w = G.w; return { r: R[ROOT], intake: false, weir: w, motor: true, b: w.b, h: w.leafH, leaves: 1, bw: w.b, depth: w.leafH + (w.kind === 'banjir' ? 0.9 : 0.6), leafH: w.leafH, pier: 0.3, maxLift: w.maxA }; }
  const r = R[G.ri], intake = G.kind === 'intake';
  const motor = intake || r.type === 'P';
  const b = intake ? 3.0 : r.b > 0.05 ? r.b : r.type === 'S' ? 1.0 : r.type === 'U' ? 0.8 : 0.5;
  const h = intake ? 1.15 : r.h > 0.05 ? r.h : r.type === 'T' ? 0.35 : 0.6;
  // one leaf across the whole width for every canal gate, three for the intake
  const leaves = intake ? 3 : 1, bw = b;
  const depth = intake ? 3.0 : h + 0.35;
  const leafH = intake ? h + 0.3 : Math.min(depth, h + 0.2);          // intake: 1,15 m opening under a breast wall
  return { r, intake, motor, b, h, leaves, bw, depth, leafH, pier: 0.3, maxLift: G.maxCm / 100 };
}

/** Bukaan (m) serta muka air hulu dan hilir pintu (m dari ambang) untuk bukaan `open` persen. */
export function gateLevels(G: Gate, spec: GateSpec, open: number) {
  const s = cur(), r = spec.r, a = open / 100 * spec.maxLift;
  const depthOf = (i: number) => { const x = R[i]; if (!x) return 0.4; const hh = x.h > 0.05 ? x.h : spec.h; return hh * Math.pow(clamp((Qa[i] || 0) / Math.max(1e-4, x.Dc || x.cap || 0.01), 0, 1.3), 0.6); };
  let hU: number, hD: number;
  if (spec.weir) { hU = clamp(s.hMercu - spec.weir.sill, 0.02, spec.depth - 0.05); hD = clamp(Math.min(0.61 * a, hU * 0.62), 0.03, Math.max(0.03, hU - 0.05)); }
  else if (spec.intake) { hU = clamp(s.hMercu - WEIR.hIn, 0.02, 2.9); hD = clamp(hU * 0.72 * Math.min(1, a / 0.5 + 0.2), 0.02, Math.max(0.02, hU - 0.05)); }
  else if (G.kind === 'lokal' || G.kind === 'suplesi') { hU = clamp(spec.h * 1.1, 0.25, spec.depth - 0.05); hD = clamp(depthOf(G.ri), 0.03, hU - 0.02); }
  else { hU = clamp(depthOf(r.p) * 1.05 + 0.05, 0.12, spec.depth - 0.04); hD = clamp(depthOf(G.ri), 0.02, hU - 0.02); }
  if (a < 0.005) hD = Math.min(hD, 0.04);
  return { a, hU, hD };
}
export type GateLevels = ReturnType<typeof gateLevels>;
