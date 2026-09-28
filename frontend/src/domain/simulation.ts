import { clamp, wibHour } from '../lib/format';
import { jitter, rnd } from '../lib/random';
import { GROUPS, N, ORDER, R, ROOT, ROOTS, SOURCES, VIA, byName } from './network';
import { ENV_FLOW, INTAKE_CAP, headF, recommendWeir, weirSolve } from './weir';
import { GATES, pctRound } from './gates';
import { SCEN, SCEN_IDX } from './scenarios';
import { STATIONS, stIdx } from './stations';
import { OFF_SINCE, STEP, cur, sim } from './state';
import type { Env, OpenMap, ScenarioId, SceneView, Snapshot, Station, StationCtx, Status, Steady, SteadyView } from './types';

/**
 * Mesin simulasi mode peraga.
 *
 * Tiap langkah 10 menit: debit Cimanuk dan sungai kecil mengikuti skenario dan hujan, bendung mencari muka air
 * hulu yang seimbang dengan bukaan pintu, lalu air dibagi ke hilir sebanding kapasitas dan bukaan pintu sadap.
 * Debit tiap ruas mendekati keadaan tunak dengan jeda sesuai waktu tempuh airnya.
 */

// initial openings: deliberately unbalanced so the upstream/downstream problem shows
SOURCES.forEach(s => { if (s.kind !== 'utama') sim.env.src[s.key] = s.base[0]; });
GATES.forEach(g => { sim.open[g.id] = g.kind === 'suplesi' ? 60 : g.kind === 'lokal' ? 70 : 58; });
const INIT: Record<string, number> = { 'g-intake': 60, 'SI Copong Kanan': 62, 'SI Copong Kiri': 66, 'Inlet Situ Bagendit': 25, 'SS Copong Kanan': 78, 'SS Tegal Buah': 52, 'SS Lewo': 30, 'SS Cipanas Kiara': 80, 'SS Ciduga': 62, 'SS Leuwigoong': 40, 'SS Kawung Luwuk': 28, 'SS Cinanti': 75, 'SS Parigi': 45, 'SS Cikukuk': 82, 'Suplesi Cicukanggantung': 40 };
for (const k in INIT) { const id = k.startsWith('g-') ? k : (byName(k) >= 0 && R[byName(k)].gate); if (id && id in sim.open) sim.open[id] = INIT[k]; }
recommendWeir(sim.env, sim.open);

/** Debit (m³/s) dan pasokan ke petak tiap ruas pada saat ini, dengan jeda tempuh air. */
export const Qa = new Float64Array(N), ga = new Float64Array(N);
let warm = false;

const dFactor = (env: Env, scenario: ScenarioId = sim.scenario) => SCEN[scenario].f * Math.max(0.15, 1 - 0.06 * env.rain);

/** Keadaan tunak untuk debit sungai dan bukaan pintu tertentu (kebutuhan air menurut `scenario`, bawaan skenario aktif). */
export function steady(env: Env, open: OpenMap, scenario: ScenarioId = sim.scenario): Steady {
  const f = dFactor(env, scenario);
  const Q = new Float64Array(N), got = new Float64Array(N), sup = new Float64Array(N);
  let spill = 0, situ = 0, weir: Steady['weir'] = null;
  SOURCES.forEach(s => {
    const g = open[s.gate] / 100;
    if (s.kind === 'utama') { const cap = INTAKE_CAP * g, avail = Math.max(0, env.Qriver - ENV_FLOW); weir = weirSolve(env.Qriver, open, H => Math.min(cap * headF(H), avail)); Q[s.ri] = weir.qin; }
    else { const q = Math.min(s.cap * g, env.src[s.key] * 0.85); Q[s.ri] = q; if (s.kind === 'suplesi') sup[s.into!] += q; }
  });
  for (const i of ORDER) {
    const r = R[i], a = (Q[i] + sup[i]) * r.eta;
    let S = 0;
    const ws = r.ck.map(c => { const rc = R[c]; const w = rc.situ ? rc.cap * open[rc.gate!] / 100 : rc.gate ? rc.cap * f * open[rc.gate] / 100 : rc.type === 'T' ? 1.15 * rc.Dc * f : rc.Dc * f; S += w; return w; });
    const wo = r.own0 > 0 ? 1.15 * r.own0 * f : 0; S += wo;
    if (S <= 0) { if (r.situ) situ += a; else spill += a; continue; }
    const k = S <= a ? 1 : a / S;
    r.ck.forEach((c, m) => { Q[c] = ws[m] * k; });
    got[i] = wo * k;
    if (S < a) { if (r.situ) situ += a - S; else spill += a - S; }
  }
  return { Q, got, sup, Qin: Q[ROOT], spill, situ, f, weir };
}
/** Pasokan (sg) dan kebutuhan (sn) kumulatif di hilir tiap ruas. */
export function subtree(got: Float64Array, f: number) {
  const sg = new Float64Array(N), sn = new Float64Array(N);
  for (let q = ORDER.length - 1; q >= 0; q--) {
    const i = ORDER[q], r = R[i];
    sg[i] += got[i]; sn[i] += r.own0 * f;
    if (r.p >= 0) { sg[r.p] += sg[i]; sn[r.p] += sn[i]; }
  }
  return { sg, sn };
}
export const sumRoots = (a: Float64Array) => ROOTS.reduce((x, i) => x + a[i], 0);

/** Bukaan pintu yang disarankan: intake sesuai kebutuhan, bendung menahan muka air normal, sadap diseimbangkan. */
export function recommend(env: Env): OpenMap {
  const f = dFactor(env), open = { ...sim.open };
  const avail = Math.max(0, env.Qriver - ENV_FLOW);
  let gin = Math.min(avail, R[ROOT].Dc * f * 1.03, INTAKE_CAP) / INTAKE_CAP * 100;
  if (env.Qriver > 80) gin = Math.min(gin, 40);
  open['g-intake'] = gin;
  recommendWeir(env, open);
  SOURCES.forEach(s => {
    if (s.kind === 'lokal') { const q = Math.min(env.src[s.key] * 0.85, R[s.ri].Dc * f * 1.03, s.cap); let o = q / s.cap * 100; if (env.src[s.key] > s.base[0] * 4) o = Math.min(o, 40); open[s.gate] = o; }
    if (s.kind === 'suplesi') open[s.gate] = 0;
  });
  const balance = () => {
    for (let it = 0; it < 40; it++) {
      const s = steady(env, open), { sg, sn } = subtree(s.got, f);
      for (const g of GATES) {
        if (g.kind !== 'sadap' || g.situ) continue;
        const Kt = Math.min(1, sg[g.sys] / sn[g.sys]);
        const Ks = sn[g.ri] > 0 ? sg[g.ri] / sn[g.ri] : Kt;
        open[g.id] = clamp(open[g.id] * Math.pow(Kt / Math.max(0.05, Ks), 0.5), 3, 100);
      }
    }
  };
  balance();
  { // open the supplementary feeders only when the balanced main system is still short of water
    const s1 = steady(env, open), { sg, sn } = subtree(s1.got, f), Km = sg[ROOT] / sn[ROOT];
    if (Km < 0.9 && env.Qriver <= 80) { SOURCES.forEach(s => { if (s.kind === 'suplesi') open[s.gate] = 100; }); balance(); }
  }
  for (const k in open) open[k] = pctRound(k, open[k]);
  return open;
}

function rainAt(t: number) {
  if (sim.scenario === 'kemarau') return 0;
  if (sim.scenario === 'banjir') return Math.max(0, 17 + 10 * Math.sin(t / 83) + jitter(5));
  const h = wibHour(t), r = 9.5 * Math.exp(-((h - 15.4) ** 2) / (2 * 0.6 * 0.6));
  return r > 0.4 ? Math.max(0, r * (0.8 + rnd() * 0.4)) : 0;
}
function stepEnv() {
  const sc = SCEN[sim.scenario], rain = rainAt(sim.t);
  sim.rainBuf.push(rain); if (sim.rainBuf.length > 18) sim.rainBuf.shift();
  const lag = sim.rainBuf.slice(0, Math.max(0, sim.rainBuf.length - 6));
  const runoff = lag.length ? lag.reduce((a, c) => a + c, 0) / lag.length : 0;
  const diurnal = sc.river * 0.05 * Math.sin((wibHour(sim.t) - 9) / 24 * 2 * Math.PI);
  const target = sc.river + diurnal + runoff * (sim.scenario === 'banjir' ? 2.5 : 0.9);
  sim.env.Qriver = Math.max(0.8, sim.env.Qriver + (target - sim.env.Qriver) * 0.16 + jitter(sc.river * 0.008));
  SOURCES.forEach(s => {
    if (s.kind === 'utama') return;
    const b = s.base[SCEN_IDX[sim.scenario]], tgt = b * (1 + runoff * (sim.scenario === 'banjir' ? 0.12 : 0.06)), c = sim.env.src[s.key];
    sim.env.src[s.key] = Math.max(0.004, c + (tgt - c) * 0.22 + jitter(b * 0.02));
  });
  sim.env.rain = rain;
}

function snapshot(ss: Steady): Snapshot {
  const f = ss.f, { sg, sn } = subtree(ga, f);
  const need = sumRoots(sn), got = sumRoots(sg);
  let over = 0;
  ORDER.forEach(i => { const r = R[i]; if (r.own0 > 0) over += Math.max(0, ga[i] - r.own0 * f); });
  const wq = ss.weir ? ss.weir.q : [0, 0, 0, 0];
  const base = {
    t: sim.t, Qriver: sim.env.Qriver, rain: sim.env.rain, f, Qin: Qa[ROOT], spill: ss.spill, situ: ss.situ,
    need, got, K: got / need, waste: ss.spill + over,
    hMercu: ss.weir ? ss.weir.H : 0, wq,
    grpGot: GROUPS.map(g => g.members.reduce((a, i) => a + ga[i], 0)),
    grpNeed: GROUPS.map(g => g.members.reduce((a, i) => a + R[i].own0 * f, 0)),
    gateQ: GATES.map(g => g.w ? wq[g.w.bay] : Qa[g.ri]),
    gateNeed: GATES.map(g => g.w ? 0 : R[g.ri].Dc * f),
    gateK: GATES.map(g => !g.w && sn[g.ri] > 0 ? sg[g.ri] / sn[g.ri] : 0),
    srcRiver: SOURCES.map(s => s.kind === 'utama' ? sim.env.Qriver : sim.env.src[s.key]),
    q: Float32Array.from(Qa),
  };
  const ctx: StationCtx = { ...base, Q: Qa, sg, sn };
  return { ...base, sv: STATIONS.map(s => s.main.get(ctx)), sv2: STATIONS.map(s => s.sub.get(ctx)), ss: STATIONS.map(s => s.status(ctx)), open: { ...sim.open } };
}

const ALPHA = new Float64Array(N);
ORDER.forEach(i => { const tau = ROOTS.includes(i) ? 0.15 : Math.max(0.25, R[i].tH / 2.5); ALPHA[i] = 1 - Math.exp(-(STEP / 60) / tau); });

/** Maju satu langkah 10 menit. */
export function step() {
  sim.t += STEP;
  stepEnv();
  if (sim.auto) { const rec = recommend(sim.env); for (const k in rec) { const d = rec[k] - sim.open[k]; sim.open[k] = pctRound(k, sim.open[k] + clamp(d, -8, 8)); } }
  const ss = steady(sim.env, sim.open);
  if (!warm) { Qa.set(ss.Q); ga.set(ss.got); warm = true; }
  else { ORDER.forEach(i => { Qa[i] += (ss.Q[i] - Qa[i]) * ALPHA[i]; ga[i] += (ss.got[i] - ga[i]) * ALPHA[i]; }); VIA.forEach(i => { Qa[i] = ss.Q[i]; }); }
  sim.hist.push(snapshot(ss));
  if (sim.hist.length > 144) sim.hist.shift();
}
/** Hitung ulang cuplikan terakhir setelah bukaan pintu berubah. */
export function refreshLive() { sim.hist[sim.hist.length - 1] = snapshot(steady(sim.env, sim.open)); }

let warmed = false;
/** Isi riwayat 24 jam sebelum halaman tampil (sekali saja). */
export function warmUp() {
  if (warmed) return;
  warmed = true;
  for (let i = 0; i < 144; i++) { recommendWeir(sim.env, sim.open); step(); }
}

/* ---------- pembacaan stasiun ---------- */
export const stVal = (stn: Station, snap: Snapshot, w: 'sv' | 'sv2' = 'sv') => (stn.offline && snap.t > OFF_SINCE) ? null : snap[w][stIdx[stn.id]];
export const stLast = (stn: Station) => stn.offline ? ([...sim.hist].reverse().find(s => s.t <= OFF_SINCE) || sim.hist[0]) : cur();
export const stStatus = (stn: Station, snap: Snapshot): Status => stn.offline ? ['serious', 'Offline'] : snap.ss[stIdx[stn.id]];
/** Tegangan baterai logger pada waktu `t` (naik siang hari saat panel surya mengisi). */
export const battAt = (stn: Station, t: number) => stn.batt + 0.35 * Math.max(0, Math.sin((wibHour(t) - 6) / 12 * Math.PI)) - (stn.offline ? 1.1 : 0);
export const battNow = (stn: Station) => battAt(stn, sim.t);
export const grpK = (snap: Snapshot, gi: number) => snap.grpNeed[gi] > 0 ? snap.grpGot[gi] / snap.grpNeed[gi] : 0;

/* ---------- keadaan untuk adegan dan pratinjau ---------- */
/** Keadaan kini, dengan jeda tempuh air. */
export function liveView(): SceneView {
  const s = cur(), f = s.f, Kt = new Float64Array(N), { sg, sn } = subtree(ga, f), sK = new Float64Array(N);
  ORDER.forEach(i => { const r = R[i]; Kt[i] = r.own0 > 0 ? ga[i] / (r.own0 * f) : 1; sK[i] = sn[i] > 0 ? sg[i] / sn[i] : 1; });
  return { Q: Qa, Kt, sK, Qriver: s.Qriver, rain: s.rain, H: s.hMercu, wq: s.wq };
}
/** Keadaan setelah air tiba untuk bukaan tertentu ("jika"); `env` bawaan = debit dan hujan saat ini. */
export function steadyView(open: OpenMap, env: Env = sim.env): SteadyView {
  const ss = steady(env, open), f = ss.f, Kt = new Float64Array(N), { sg, sn } = subtree(ss.got, f), sK = new Float64Array(N);
  ORDER.forEach(i => { const r = R[i]; Kt[i] = r.own0 > 0 ? ss.got[i] / (r.own0 * f) : 1; sK[i] = sn[i] > 0 ? sg[i] / sn[i] : 1; });
  let over = 0; ORDER.forEach(i => { const r = R[i]; if (r.own0 > 0) over += Math.max(0, ss.got[i] - r.own0 * f); });
  const grp = GROUPS.map(g => { let a = 0, b = 0; g.members.forEach(i => { a += ss.got[i]; b += R[i].own0 * f; }); return b > 0 ? a / b : 0; });
  return { Q: ss.Q, Kt, sK, grp, K: sumRoots(sg) / sumRoots(sn), waste: ss.spill + over, Qriver: env.Qriver, rain: env.rain, H: ss.weir!.H, wq: ss.weir!.q, Qin: ss.Qin };
}
