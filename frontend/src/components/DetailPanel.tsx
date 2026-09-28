import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { hhmm, jam, nf } from '../lib/format';
import { profileChart, type ChartConfig, type ChartSeries } from '../lib/chart';
import { B, FIX, GMAPi, GROUPS, GRPID, INTREE, JLABEL, R, RK, ROOT, huluOf, pathTo } from '../domain/network';
import { GMAP, gIdx } from '../domain/gates';
import { STMAP, stIdx } from '../domain/stations';
import { WEIR, pondStatus } from '../domain/weir';
import { fixStatus, pola } from '../domain/status';
import { profileData } from '../domain/profile';
import { Qa, battNow, ga, grpK, stLast, stStatus, stVal, subtree } from '../domain/simulation';
import { OFF_SINCE, cur, sim } from '../domain/state';
import type { Gate, Group, Ruas, Sel, Station } from '../domain/types';
import { openGate, ui } from '../store/twinStore';
import { CrossSection } from './CrossSection';
import { GateControl } from './GateControl';
import { Chart, Chip, Legend2, Rd, SelLink, StatusChip } from './Ui';

/**
 * Panel kanan halaman twin: rincian objek terpilih (stasiun, pintu, pintu bendung, kelompok layanan, ruas) dengan
 * bacaan kini, grafik 24 jam, dan untuk pintu penggeser bukaan dengan pratinjau.
 */
export function DetailPanel() {
  const sel = ui.sel;
  return (
    <aside className="panel detail" aria-live="polite">
      <DetailBody key={`${sel.kind}:${sel.id}`} sel={sel} />
    </aside>
  );
}

function DetailBody({ sel }: { sel: Sel }) {
  if (sel.kind === 'station') return <StationDetail stn={STMAP[sel.id]} />;
  if (sel.kind === 'gate') return GMAP[sel.id].w ? <WeirGateDetail g={GMAP[sel.id]} /> : <GateDetail g={GMAP[sel.id]} />;
  if (sel.kind === 'grp') return <GroupDetail g={GRPID[sel.id]} />;
  return <RuasDetail r={RK[sel.id]} />;
}

interface LayoutProps {
  eyebrow: ReactNode; title: string; sub: ReactNode; chip: ReactNode; readings: ReactNode;
  mid?: ReactNode; extra?: ReactNode; ctrl?: ReactNode;
  legend?: ReactNode; chart: ChartConfig; series: ChartSeries[];
}
function Layout({ eyebrow, title, sub, chip, readings, mid, extra, ctrl, legend, chart, series }: LayoutProps) {
  const times = sim.hist.map(h => h.t);
  return <>
    <div className="d-head"><div className="eyebrow">{eyebrow}</div><h2>{title}</h2><div className="d-sub">{sub}</div><div className="d-chip">{chip}</div></div>
    <div className="readings">{readings}</div>
    {mid}{extra}
    <div className="d-sec"><div className="d-sec-h"><h3 className="h3">24 jam terakhir</h3><div className="legend">{legend}</div></div><Chart config={chart} data={{ times, series }} /></div>
    {ctrl}
  </>;
}
const Links = ({ children }: { children: ReactNode }) => <div className="dlinks">{children}</div>;
const Gate3dButton = ({ g }: { g: Gate }) => <button className="btn primary" type="button" onClick={() => openGate(g.id)}>Lihat pintu 3D</button>;
const autoChip = () => sim.auto ? <Chip lvl="good">Otomatis</Chip> : null;

function StationDetail({ stn }: { stn: Station }) {
  const s = cur(), ls = stLast(stn), k = stIdx[stn.id];
  return <Layout
    eyebrow={`Stasiun ${stn.type === 'ARR' ? 'penakar hujan' : stn.type}`} title={stn.name} sub={`${stn.id} · ${stn.where}`}
    chip={<StatusChip s={stStatus(stn, s)} />}
    readings={<>
      <Rd k={stn.main.label} v={nf(ls.sv[k], stn.main.d)} u={stn.main.unit} big />
      <Rd k={stn.sub.label} v={nf(ls.sv2[k], stn.sub.d)} u={stn.sub.unit} />
      <Rd k="Update terakhir" v={hhmm(stn.offline ? OFF_SINCE : s.t)} u="WIB" />
      <Rd k="Baterai" v={nf(battNow(stn), 1)} u="V" />
      <Rd k="Sinyal" v={stn.sig == null ? 'Iridium' : stn.offline ? '—' : stn.sig} u={stn.sig == null ? 'SBD' : 'dBm'} />
    </>}
    extra={<>
      {stn.id === 'AWLR-CPG-02'
        ? <p className="fix-note">Data bendung (SISDA): tipe {B.tipe.toLowerCase()}, mercu {nf(B.mercu_m, 0)} m, tinggi {nf(B.tinggi_m, 1)} m, elevasi mercu +{nf(B.el_mercu, 2)} mdpl, pintu kanan {B.pintu_kanan}, dibangun {B.tahun}. DAS Cimanuk {nf(B.das_km2, 0)} km².</p>
        : stn.offline && <p className="fix-note">Tidak ada kiriman sejak {hhmm(OFF_SINCE)} WIB. Langkah cek: tegangan baterai terakhir, status modem, lalu kunjungan lapangan.</p>}
      {stn.ri != null && <Links><SelLink className="btn" sel={{ kind: 'ruas', id: R[stn.ri].k }}>Lihat ruas {R[stn.ri].n}</SelLink></Links>}
    </>}
    chart={{ height: 140, unit: stn.main.unit, digits: stn.main.d, kind: stn.type === 'ARR' ? 'bar' : 'line' }}
    series={[{ name: stn.main.label, color: 'var(--s1)', values: sim.hist.map(h => stVal(stn, h)) }]}
  />;
}

function WeirGateDetail({ g }: { g: Gate }) {
  const s = cur(), gk = gIdx[g.id], o = sim.open[g.id], [lvl, txt] = pondStatus(s.hMercu);
  return <Layout
    eyebrow={g.role} title={g.name} sub={g.sub}
    chip={<><Chip lvl={lvl}>Muka air hulu · {txt}</Chip>{autoChip()}</>}
    readings={<>
      <Rd k="Bukaan" v={`${nf(o, 1)}%`} u={`${Math.round(o / 100 * g.maxCm)} cm`} />
      <Rd k="Debit lewat pintu" v={nf(s.gateQ[gk], 2)} u="m³/s" />
      <Rd k="TMA hulu" v={nf(B.el_mercu + s.hMercu)} u="mdpl" />
      <Rd k="Di atas mercu" v={nf(s.hMercu)} u={`m · normal ${nf(WEIR.hN, 1)} m`} />
      <Rd k="Debit Cimanuk" v={nf(s.Qriver, 1)} u="m³/s" />
      <Rd k="Debit intake" v={nf(s.Qin, 2)} u="m³/s" />
      <Rd k="Mode" v={sim.auto ? 'Otomatis' : 'Manual'} />
    </>}
    extra={<Links><Gate3dButton g={g} /><SelLink className="btn" sel={{ kind: 'station', id: 'AWLR-CPG-02' }}>Lihat AWLR mercu</SelLink></Links>}
    ctrl={<GateControl g={g} />}
    legend={<Legend2 a="Debit lewat pintu" b="Debit Cimanuk" />}
    chart={{ height: 140, unit: 'm³/s', digits: 1 }}
    series={[{ name: 'Debit', color: 'var(--s1)', values: sim.hist.map(h => h.gateQ[gk]) }, { name: 'Debit Cimanuk', color: 'var(--s2)', dash: true, values: sim.hist.map(h => h.Qriver) }]}
  />;
}

function GateDetail({ g }: { g: Gate }) {
  const s = cur(), gk = gIdx[g.id], o = sim.open[g.id], r = R[g.ri], sup = g.kind === 'suplesi';
  const K = sup ? null : s.gateK[gk];
  const chip = K == null ? <Chip lvl="good">Masuk {R[g.src!.into!].n}</Chip> : (p => <Chip lvl={p[0]}>K hilir {nf(K)} · {p[1]}</Chip>)(pola(K));
  const srcRow = g.src
    ? <Rd k={g.kind === 'intake' ? 'Debit Cimanuk' : 'Debit sungai'} v={g.kind === 'intake' ? nf(s.Qriver, 1) : nf(s.srcRiver[g.src.idx] * 1000, 0)} u={g.kind === 'intake' ? 'm³/s' : 'l/dt'} />
    : <Rd k="Luas hilir" v={nf(r.subA, 0)} u="ha" />;
  return <Layout
    eyebrow={g.role} title={g.name} sub={g.sub}
    chip={<>{chip}{autoChip()}</>}
    readings={<>
      <Rd k="Bukaan" v={`${o}%`} u={`${Math.round(o / 100 * g.maxCm)} cm`} />
      <Rd k="Debit lewat pintu" v={nf(s.gateQ[gk] * 1000, 0)} u="l/dt" />
      {sup ? <Rd k="Kapasitas saluran" v={nf(0.25 * 1000, 0)} u="l/dt" /> : <Rd k="Kebutuhan hilir" v={nf(s.gateNeed[gk] * 1000, 0)} u="l/dt" />}
      {srcRow}
      <Rd k="Tempuh air ke ujung" v={jam(r.tA)} />
      <Rd k="Mode" v={sim.auto ? 'Otomatis' : 'Manual'} />
    </>}
    extra={<Links><Gate3dButton g={g} /><SelLink className="btn" sel={{ kind: 'ruas', id: r.k }}>Lihat ruas {r.n}</SelLink></Links>}
    ctrl={<GateControl g={g} />}
    legend={<Legend2 a="Debit lewat pintu" b={sup ? 'Debit sungai' : 'Kebutuhan'} />}
    chart={{ height: 140, unit: 'l/dt', digits: 0 }}
    series={[{ name: 'Debit', color: 'var(--s1)', values: sim.hist.map(h => h.gateQ[gk] * 1000) },
      { name: sup ? 'Debit sungai' : 'Kebutuhan', color: 'var(--s2)', dash: true, values: sim.hist.map(h => sup ? h.srcRiver[g.src!.idx] * 1000 : h.gateNeed[gk] * 1000) }]}
  />;
}

function GroupDetail({ g }: { g: Group }) {
  const s = cur(), r = R[g.ri], K = grpK(s, g.gi);
  return <Layout
    eyebrow={`Kelompok layanan · ${JLABEL[r.type]}`} title={g.name} sub={`${r.k} · ${nf(r.L, 1)} km · hulu ${huluOf(r)}`}
    chip={<StatusChip s={pola(K)} />}
    readings={<>
      <Rd k="Faktor K" v={nf(K)} big />
      <Rd k="Q tersalur" v={nf(s.grpGot[g.gi] * 1000, 0)} u="l/dt" />
      <Rd k="Q butuh" v={nf(s.grpNeed[g.gi] * 1000, 0)} u="l/dt" />
      <Rd k="Luas layanan" v={nf(g.area, 0)} u={`ha · ${g.members.length} tersier`} />
      <Rd k="Tempuh air dari sumber" v={jam(r.tA)} />
      <Rd k="Rencana saluran" v={r.b ? `${nf(r.b)} × ${nf(r.h)}` : '—'} u={r.b ? 'm (b × h)' : ''} />
      {r.gate && <Rd k="Bukaan pintu" v={`${sim.open[r.gate]}%`} u={r.s || ''} />}
    </>}
    extra={<Links><SelLink className="btn" sel={{ kind: 'ruas', id: r.k }}>Lihat ruas {r.n}</SelLink>{r.gate && <SelLink className="btn" sel={{ kind: 'gate', id: r.gate }}>Atur pintu</SelLink>}</Links>}
    legend={<Legend2 a="Q tersalur" b="Q butuh" />}
    chart={{ height: 140, unit: 'l/dt', digits: 0 }}
    series={[{ name: 'Q tersalur', color: 'var(--s1)', values: sim.hist.map(h => h.grpGot[g.gi] * 1000) }, { name: 'Q butuh', color: 'var(--s2)', dash: true, values: sim.hist.map(h => h.grpNeed[g.gi] * 1000) }]}
  />;
}

function ProfileChart({ i }: { i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) profileChart(ref.current, profileData(i)); }, [i]);
  return <div ref={ref} />;
}
function RuasDetail({ r }: { r: Ruas }) {
  const s = cur(), q = Qa[r.i], f = FIX[r.k], live = INTREE[r.i] || r.via;
  const sub = subtree(ga, s.f), K = sub.sn[r.i] > 0 ? sub.sg[r.i] / sub.sn[r.i] : null;
  const Qd = r.Dc > 0 ? r.Dc : null, h = r.h || (r.type === 'T' ? 0.2 : 0.4), hn = Qd ? h * Math.pow(Math.max(0, q) / Qd, 0.6) : null;
  const hulu = r.via ? `suplesi dari ${r.srcObj!.name} ke ${R[r.into!].n}` : r.p >= 0 ? 'hulu ' + R[r.p].n : r.srcObj ? 'sumber ' + r.srcObj.name : 'Bendung Copong';
  const path = pathTo(r.i), rootI = path[0], srcName = R[rootI].srcObj ? R[rootI].srcObj!.name : 'Bendung Copong';
  const srcGate = r.via ? r.gate! : rootI === ROOT ? 'g-intake' : R[rootI].gate!;
  const grpLink = r.grp != null ? <SelLink className="btn" sel={{ kind: 'grp', id: GROUPS[r.grp].id }}>Kelompok {GROUPS[r.grp].short}</SelLink>
    : GMAPi[r.i] != null ? <SelLink className="btn" sel={{ kind: 'grp', id: GROUPS[GMAPi[r.i]].id }}>Kelompok layanan</SelLink> : null;
  const fs = f ? fixStatus(f) : null;
  return <Layout
    eyebrow={`Ruas ${JLABEL[r.type]} · ${r.k}`} title={r.n} sub={`${nf(r.L, 2)} km · ${hulu}${r.s ? ' · bangunan ' + r.s : ''}`}
    chip={<>{K != null ? (p => <Chip lvl={p[0]}>K hilir {nf(K)} · {p[1]}</Chip>)(pola(K)) : live ? null : <Chip lvl="serious">Tidak tersambung</Chip>}{fs && <StatusChip s={fs} />}</>}
    readings={<>
      <Rd k="Debit sekarang" v={nf(q * 1000, 0)} u="l/dt" />
      <Rd k={r.via ? 'Kapasitas' : 'Kebutuhan rencana'} v={r.via ? '250' : nf((Qd || 0) * s.f * 1000, 0)} u="l/dt" />
      <Rd k="Muka air kini" v={hn == null ? '—' : nf(hn)} u={`m dari rencana ${nf(h)} m`} />
      <Rd k="Kecepatan rencana" v={r.v ? nf(r.v) : '—'} u="m/dt" />
      <Rd k="Luas layanan hilir" v={nf(r.subA || 0, 0)} u="ha" />
      <Rd k="Tempuh air dari sumber" v={jam(r.tA)} />
      <Rd k="Manning n · kemiringan" v={r.n2 ? `${nf(r.n2, 3)} · ${nf((r.S || 0) * 1000, 2)}‰` : '—'} />
      <Rd k="Bilangan Froude" v={r.fr ? nf(r.fr) : '—'} u={r.fr ? (r.fr < 1 ? 'subkritis' : 'superkritis') : ''} />
    </>}
    mid={<>
      <div className="d-sec"><h3 className="h3">Penampang saluran</h3><div className="xsec"><CrossSection r={r} q={q} /></div></div>
      <div className="d-sec"><h3 className="h3">Jalur air dari sumber</h3><div className="crumbs">
        <SelLink sel={{ kind: 'gate', id: srcGate }}>{srcName}</SelLink><span className="sep">›</span>
        {path.map((k, n) => <Fragment key={k}>{n > 0 && <span className="sep">›</span>}{n === path.length - 1 ? <span className="here">{R[k].n}</span> : <SelLink sel={{ kind: 'ruas', id: R[k].k }}>{R[k].n}</SelLink>}</Fragment>)}
      </div></div>
      <div className="d-sec"><div className="d-sec-h"><h3 className="h3">Profil muka tanah</h3><span className="legend">DEM ±400 m, sepanjang jalur</span></div><ProfileChart i={r.i} /></div>
    </>}
    extra={<>
      {f && <p className="fix-note"><b>Perbaikan topologi:</b> {f.why}</p>}
      <Links>{r.gate && <SelLink className="btn" sel={{ kind: 'gate', id: r.gate }}>Atur pintu</SelLink>}{grpLink}</Links>
    </>}
    legend={<Legend2 a="Debit" b={r.via ? 'Kapasitas' : 'Kebutuhan'} />}
    chart={{ height: 140, unit: 'l/dt', digits: 0 }}
    series={[{ name: 'Debit', color: 'var(--s1)', values: sim.hist.map(hh => hh.q[r.i] * 1000) }, { name: r.via ? 'Kapasitas' : 'Kebutuhan', color: 'var(--s2)', dash: true, values: sim.hist.map(hh => r.via ? 250 : (r.Dc || 0) * hh.f * 1000) }]}
  />;
}
