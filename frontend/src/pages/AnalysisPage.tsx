import { useEffect, useRef, useState } from 'react';
import { fromIso, hhmm, isoDate, nf, tanggal, wibDate, wibT } from '../lib/format';
import { downloadChartPng, type ChartExport, type ChartSeries } from '../lib/chart';
import { LOGGERS, LOGMAP, type LogParam, type Logger } from '../domain/loggers';
import { RAIN_DAILY, RAIN_HOURLY, analyse, makePeriod, periodTitle, rainClass, type Bucket, type RangeKind, type Series } from '../domain/history';
import { battNow, stStatus } from '../domain/simulation';
import { OFF_SINCE, T0, cur, sim } from '../domain/state';
import { gIdx, pctTxt } from '../domain/gates';
import { goToTwin, ui } from '../store/twinStore';
import { Chart, StatusChip } from '../components/Ui';
import { NavIcon } from '../components/NavIcon';

/**
 * Halaman Analisa, mengikuti "Konsol Analisa" mini-stesy: pilih logger, lalu satu parameter (grafik rerata/minimum/
 * maksimum atau akumulasi curah hujan, ringkasan, dan tabel) atau beberapa parameter sekaligus (mode multi: satu
 * garis per parameter, satuan pertama di sumbu kiri dan satuan kedua di sumbu kanan), dalam hari, bulan, tahun, atau
 * rentang tanggal.
 */
type Mode = 'single' | 'multi';
interface ConsoleState { logger: string; param: string; mode: Mode; checked: string[]; range: RangeKind; day: string; month: string; year: number; from: string; to: string }
let saved: ConsoleState | null = null;
const defaultChecked = (lg: Logger) => lg.params.slice(0, 2).map(p => p.key);
function initialState(): ConsoleState {
  const t = cur().t, w = wibDate(t), s = ui.sel;
  const lg = (s.kind === 'station' || s.kind === 'gate') && LOGMAP[s.id] ? LOGMAP[s.id] : LOGMAP['AWLR-CMK-01'];
  return { logger: lg.id, param: lg.params[0].key, mode: 'single', checked: defaultChecked(lg), range: 'day', day: isoDate(t), month: `${w.y}-${String(w.m + 1).padStart(2, '0')}`, year: w.y, from: isoDate(t - 6 * 1440), to: isoDate(t) };
}
const RANGES: [RangeKind, string][] = [['day', 'Hari'], ['month', 'Bulan'], ['year', 'Tahun'], ['custom', 'Rentang']];
const RANGE_PREFIX: Record<RangeKind, string> = { day: 'Tanggal', month: 'Bulan', year: 'Tahun', custom: 'Rentang' };
const TYPE_LABEL: Record<Logger['type'], string> = { AWLR: 'AWLR', Debit: 'Debit', ARR: 'ARR', AWGC: 'AWGC' };
/** Warna garis mode multi, tetap per urutan parameter logger. */
const PALETTE = ['#4aa3ff', '#ff9b54', '#46d78f', '#c86bff', '#ffd166', '#ff7a9c', '#3cd6d6', '#b0c4ff'];

function periodOf(c: ConsoleState) {
  if (c.range === 'day') return makePeriod('day', fromIso(c.day));
  if (c.range === 'month') { const [y, m] = c.month.split('-').map(Number); return makePeriod('month', wibT(y, m - 1, 1)); }
  if (c.range === 'year') return makePeriod('year', wibT(c.year, 0, 1));
  return makePeriod('custom', fromIso(c.from), fromIso(c.to));
}
const valueOf = (p: LogParam, b: Bucket) => p.sum ? b.sum : b.mean;
const fileSafe = (s: string) => s.replace(/[^\w]+/g, '-');

/** Unduh tabel sebagai CSV (dibuka Excel; pemisah titik koma, desimal koma). */
function saveCsv(name: string, title: string, head: string[], rows: string[][]) {
  const csv = '﻿' + [title, head.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvNum = (v: number | null, d: number) => v == null ? '' : nf(v, d).replace(/\./g, '');
function downloadCsv(lg: Logger, p: LogParam, s: Series, range: RangeKind) {
  const head = p.sum ? ['Waktu', `Curah hujan (${p.unit})`, 'Intensitas maks (mm/jam)'] : ['Waktu', `Rerata (${p.unit})`, `Minimum (${p.unit})`, `Maksimum (${p.unit})`];
  const rows = s.buckets.map(b => p.sum ? [b.long, csvNum(b.sum, p.d), csvNum(b.peak, p.d)] : [b.long, csvNum(b.mean, p.d), csvNum(b.min, p.d), csvNum(b.max, p.d)]);
  saveCsv(`analisa_${lg.id}_${p.key}_${range}_${fileSafe(s.title)}.csv`, `${lg.name} (${lg.id}) · ${p.label} · ${s.title}`, head, rows);
}
interface MultiItem { p: LogParam; s: Series; color: string; axis?: 'right' }
function downloadCsvMulti(lg: Logger, items: MultiItem[], title: string, range: RangeKind) {
  const head = ['Waktu', ...items.map(m => `${m.p.label} (${m.p.unit})${m.p.sum ? ' jumlah' : ' rerata'}`)];
  const rows = items[0].s.buckets.map((b, i) => [b.long, ...items.map(m => csvNum(valueOf(m.p, m.s.buckets[i]), m.p.d))]);
  saveCsv(`analisa_${lg.id}_multi_${range}_${fileSafe(title)}.csv`, `${lg.name} (${lg.id}) · multi parameter · ${title}`, head, rows);
}

export function AnalysisPage() {
  const [c, setC] = useState<ConsoleState>(() => saved || initialState());
  const [info, setInfo] = useState(false);
  const chartBox = useRef<HTMLDivElement>(null);
  useEffect(() => { saved = c; }, [c]);
  const set = (patch: Partial<ConsoleState>) => setC(prev => ({ ...prev, ...patch }));
  const lg = LOGMAP[c.logger], p = lg.params.find(x => x.key === c.param) || lg.params[0];
  const per = periodOf(c), snap = cur(), multi = c.mode === 'multi';
  const online = !lg.offline, nowW = wibDate(snap.t), firstYear = wibDate(T0).y - 2;
  const stn = lg.stn, status = stn ? stStatus(stn, snap) : null;

  // mode tunggal: satu parameter dengan rerata/minimum/maksimum; mode multi: rerata (atau jumlah) tiap parameter
  const s = multi ? null : analyse(lg, p, per);
  const units: string[] = [];
  const items: MultiItem[] = !multi ? [] : lg.params.filter(x => c.checked.includes(x.key)).map(x => {
    if (!units.includes(x.unit)) units.push(x.unit);
    return { p: x, s: analyse(lg, x, per), color: PALETTE[lg.params.indexOf(x) % PALETTE.length], axis: units.indexOf(x.unit) === 1 ? 'right' as const : undefined };
  });
  const base = s || items[0]?.s || null, title = periodTitle(per);
  const buckets = base ? base.buckets : [];
  const labels = new Map(buckets.map(b => [b.t, b.label]));
  const xTick = (_t: number, i: number) => c.range === 'day' ? i % 3 === 0 : c.range === 'month' ? i % 5 === 0 : c.range === 'custom' ? i % Math.max(1, Math.ceil(buckets.length / 10)) === 0 : true;
  const hourlyRain = c.range === 'day';
  const rainTable = hourlyRain ? RAIN_HOURLY : RAIN_DAILY;

  const pickLogger = (id: string) => { const l = LOGMAP[id]; set({ logger: l.id, param: l.params[0].key, checked: defaultChecked(l) }); };
  const toggle = (key: string, on: boolean) => setC(prev => ({ ...prev, checked: lg.params.map(x => x.key).filter(k => k === key ? on : prev.checked.includes(k)) }));
  const legendMulti = items.map(m => ({ name: `${m.p.label} (${m.p.unit})${units.indexOf(m.p.unit) > 1 ? ' · sumbu kiri' : ''}`, color: m.color }));
  const legendSingle = p.sum ? [{ name: 'Curah hujan', color: 'var(--s1)' }] : [{ name: 'Rerata', color: 'var(--s1)' }, { name: 'Minimum', color: 'var(--good)', dash: true }, { name: 'Maksimum', color: 'var(--crit)', dash: true }];
  const exportChart = () => {
    if (!chartBox.current) return;
    const meta: ChartExport = multi
      ? { eyebrow: 'Grafik multi parameter', title: `${lg.name} (${lg.id})`, lines: [`Parameter: ${items.map(m => m.p.label).join(', ')}`, `${RANGE_PREFIX[c.range]}: ${title}`], legend: legendMulti, filename: `grafik_${lg.id}_multi_${fileSafe(title)}` }
      : { eyebrow: 'Grafik pengukuran', title: `${lg.name} (${lg.id})`, lines: [`Parameter: ${p.label} (${p.unit})`, `${RANGE_PREFIX[c.range]}: ${title}`], legend: legendSingle, filename: `grafik_${lg.id}_${p.key}_${fileSafe(title)}` };
    void downloadChartPng(chartBox.current, meta);
  };

  return (
    <section id="tab-analisa" className="view" aria-labelledby="h-analisa">
      <div className="an-station">
        <span className={`an-led ${online ? 'on' : 'off'}`} />
        <div className="an-station__txt">
          <div className="an-station__eyebrow">{TYPE_LABEL[lg.type]} · ID {lg.id}</div>
          <h1 id="h-analisa" className="an-station__name">{lg.name}</h1>
          <div className={`an-station__sub ${online ? 'ok' : 'bad'}`}>{online ? `Koneksi terhubung · data tiap 10 menit · update ${hhmm(snap.t)} WIB` : `Koneksi terputus sejak ${hhmm(OFF_SINCE)} WIB`}</div>
        </div>
        <div className="an-station__actions">
          <button type="button" className="an-action" onClick={() => setInfo(true)}><NavIcon name="info" /><span>Informasi</span></button>
          <button type="button" className="an-action primary" onClick={() => goToTwin(lg.sel)}><NavIcon name="pin" /><span>Lihat di twin</span></button>
        </div>
      </div>
      <div className="an-ruler" aria-hidden="true" />

      <div className="an-grid">
        <div className="an-deck">
          <div className="an-deck__head"><span className="an-deck__dot" />Konsol analisa</div>
          <div className="an-deck__body">
            <label className="an-label" htmlFor="an-logger">Pilih logger</label>
            <select id="an-logger" className="an-input" value={lg.id} onChange={e => pickLogger(e.currentTarget.value)}>
              <optgroup label="Stasiun telemetri">{LOGGERS.filter(l => l.type !== 'AWGC').map(l => <option key={l.id} value={l.id}>{l.id} · {l.name}</option>)}</optgroup>
              <optgroup label="Pintu air (AWGC)">{LOGGERS.filter(l => l.type === 'AWGC').map(l => <option key={l.id} value={l.id}>{l.name.replace('Pintu ', '')}</option>)}</optgroup>
            </select>
            <span className="an-label">Mode analisa</span>
            <div className="an-mode" role="group" aria-label="Mode analisa">
              {(['single', 'multi'] as const).map(m => <button key={m} type="button" className={c.mode === m ? 'is-active' : ''} aria-pressed={c.mode === m} onClick={() => set({ mode: m })}>{m === 'single' ? 'Single parameter' : 'Multi parameter'}</button>)}
            </div>
            {!multi && <>
              <label className="an-label" htmlFor="an-param">Parameter</label>
              <select id="an-param" className="an-input" value={p.key} onChange={e => set({ param: e.currentTarget.value })}>
                {lg.params.map(x => <option key={x.key} value={x.key}>{x.label}{x.unit ? ` (${x.unit})` : ''}</option>)}
              </select>
            </>}
            {multi && <>
              <div className="an-check-head">
                <span className="an-label">Parameter multi</span>
                <span className="an-check-acts">
                  <button type="button" className="an-link" onClick={() => set({ checked: lg.params.map(x => x.key) })}>Pilih semua</button>
                  <button type="button" className="an-link" onClick={() => set({ checked: [] })}>Hapus semua</button>
                </span>
              </div>
              <div className="an-checklist" role="group" aria-label="Parameter multi">
                {lg.params.map((x, k) => (
                  <label key={x.key} className="an-check">
                    <input type="checkbox" checked={c.checked.includes(x.key)} onChange={e => toggle(x.key, e.currentTarget.checked)} />
                    <i style={{ background: PALETTE[k % PALETTE.length] }} />
                    <span className="an-check__t">{x.label}</span>
                    <span className="an-check__u">{x.unit}</span>
                  </label>
                ))}
              </div>
              <p className="an-hint">Satuan pertama di sumbu kiri, satuan kedua di sumbu kanan; satuan berikutnya ikut sumbu kiri.</p>
            </>}
            <span className="an-label">Analisa dalam</span>
            <div className="an-seg" role="radiogroup" aria-label="Rentang analisa">
              {RANGES.map(([k, label]) => <label key={k} className="an-seg__opt"><input type="radio" name="an-range" checked={c.range === k} onChange={() => set({ range: k })} /><span>{label}</span></label>)}
            </div>
            {c.range === 'day' && <><label className="an-label" htmlFor="an-day">Tanggal</label><input id="an-day" type="date" className="an-input" value={c.day} max={isoDate(snap.t)} onChange={e => e.currentTarget.value && set({ day: e.currentTarget.value })} /></>}
            {c.range === 'month' && <><label className="an-label" htmlFor="an-month">Bulan</label><input id="an-month" type="month" className="an-input" value={c.month} max={`${nowW.y}-${String(nowW.m + 1).padStart(2, '0')}`} onChange={e => e.currentTarget.value && set({ month: e.currentTarget.value })} /></>}
            {c.range === 'year' && <><label className="an-label" htmlFor="an-year">Tahun</label>
              <select id="an-year" className="an-input" value={c.year} onChange={e => set({ year: +e.currentTarget.value })}>{Array.from({ length: nowW.y - firstYear + 1 }, (_, i) => nowW.y - i).map(y => <option key={y} value={y}>{y}</option>)}</select></>}
            {c.range === 'custom' && <>
              <label className="an-label" htmlFor="an-from">Dari tanggal</label><input id="an-from" type="date" className="an-input" value={c.from} max={c.to} onChange={e => e.currentTarget.value && set({ from: e.currentTarget.value })} />
              <label className="an-label" htmlFor="an-to">Sampai tanggal</label><input id="an-to" type="date" className="an-input" value={c.to} min={c.from} max={isoDate(snap.t)} onChange={e => e.currentTarget.value && set({ to: e.currentTarget.value })} />
              <p className="an-hint">Rentang paling panjang 62 hari.</p>
            </>}
            <div className="an-sep" />
            <button type="button" className="btn primary block" disabled={multi && !items.length}
              onClick={() => s ? downloadCsv(lg, p, s, c.range) : items.length && downloadCsvMulti(lg, items, title, c.range)}><NavIcon name="download" />Unduh Excel (CSV)</button>
            <p className="an-hint">Hari ini dari simulasi berjalan; hari-hari sebelumnya riwayat sintetis mode peraga (pola musim Cimanuk).</p>
          </div>
        </div>

        {s ? (
          <div className="an-panel">
            {p.sum ? <RainSummary s={s} hourly={hourlyRain} table={rainTable} /> : <StatSummary s={s} p={p} range={c.range} />}
            <div className="an-panel__head">
              <div><div className="an-eyebrow">Grafik pengukuran</div><div className="an-title">{p.sum ? 'Akumulasi' : 'Rerata'} {p.label} · {s.title} — {lg.name}</div></div>
              <ExportButton onClick={exportChart} />
            </div>
            <div ref={chartBox}>
              <Chart key={`${lg.id}|${p.key}|${c.range}`} config={{ height: 300, unit: p.unit, digits: p.d, kind: p.sum ? 'bar' : 'line', zero: !!p.sum || p.unit === '%', xLabel: t => labels.get(t) ?? '', xTick }}
                data={{ times: s.buckets.map(b => b.t), series: p.sum
                  ? [{ name: 'Curah hujan', color: 'var(--s1)', values: s.buckets.map(b => b.sum), colorOf: v => rainClass(v, c.range === 'year' ? RAIN_DAILY : rainTable)[2] }]
                  : [{ name: 'Rerata', color: 'var(--s1)', values: s.buckets.map(b => b.mean) },
                    { name: 'Minimum', color: 'var(--good)', dash: true, values: s.buckets.map(b => b.min) },
                    { name: 'Maksimum', color: 'var(--crit)', dash: true, values: s.buckets.map(b => b.max) }] }} />
            </div>
            {!p.sum && <Legend items={legendSingle} />}

            <div className="an-panel__head an-panel__head--table">
              <div><div className="an-eyebrow">Tabel data</div><div className="an-title">Tabel {p.sum ? 'akumulasi' : 'rerata'} {p.label} · {s.title}</div></div>
            </div>
            <div className="tbl-wrap an-table">
              <table>
                <thead>{p.sum
                  ? <tr><th>Waktu</th><th className="num">Curah hujan ({p.unit})</th><th className="num">Intensitas maks (mm/jam)</th><th>Kelas</th></tr>
                  : <tr><th>Waktu</th><th className="num">Rerata</th><th className="num">Minimum</th><th className="num">Maksimum</th><th className="num">Data masuk</th></tr>}</thead>
                <tbody>{s.buckets.map(b => <Row key={b.t} b={b} p={p} table={c.range === 'year' ? RAIN_DAILY : rainTable} />)}</tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="an-panel">
            <div className="an-panel__head">
              <div><div className="an-eyebrow">Grafik multi parameter</div><div className="an-title">{title} — {lg.name}</div></div>
              {items.length > 0 && <ExportButton onClick={exportChart} />}
            </div>
            {items.length ? <>
              <MultiSummary items={items} range={c.range} />
              <div ref={chartBox}>
                <Chart key={`multi|${lg.id}|${c.range}|${units.join(',')}`} config={{ height: 340, unit: units[0], unitR: units[1], axisTitles: true, zero: false, xLabel: t => labels.get(t) ?? '', xTick }}
                  data={{ times: buckets.map(b => b.t), series: items.map((m): ChartSeries => ({ name: m.p.label, color: m.color, axis: m.axis, unit: m.p.unit, digits: m.p.d, values: m.s.buckets.map(b => valueOf(m.p, b)) })) }} />
              </div>
              <Legend items={legendMulti} />
              <div className="an-panel__head an-panel__head--table">
                <div><div className="an-eyebrow">Tabel data multi</div><div className="an-title">Tabel multi parameter · {title}</div></div>
              </div>
              <div className="tbl-wrap an-table">
                <table>
                  <thead><tr><th>Waktu</th>{items.map(m => <th key={m.p.key} className="num"><span className="an-th"><i style={{ background: m.color }} />{m.p.label} ({m.p.unit})</span></th>)}</tr></thead>
                  <tbody>{buckets.map((b, i) => <tr key={b.t}><td>{b.long}</td>{items.map(m => { const v = valueOf(m.p, m.s.buckets[i]); return <td key={m.p.key} className="num">{v == null ? '—' : nf(v, m.p.d)}</td>; })}</tr>)}</tbody>
                </table>
              </div>
            </> : <div className="an-empty">Centang parameter untuk menampilkan grafik</div>}
          </div>
        )}
      </div>

      {info && <>
        <button type="button" className="an-drawer__scrim" aria-label="Tutup informasi" onClick={() => setInfo(false)} />
        <aside className="an-drawer" role="dialog" aria-label="Informasi logger">
          <div className="an-drawer__head"><span>Informasi logger</span><button type="button" className="gm-close" aria-label="Tutup" onClick={() => setInfo(false)}>×</button></div>
          <dl className="an-drawer__list">
            <dt>ID logger</dt><dd>{lg.id}</dd>
            <dt>Nama</dt><dd>{lg.name}</dd>
            <dt>Jenis</dt><dd>{lg.type === 'AWGC' ? 'AWGC · pengendali pintu otomatis' : lg.type === 'ARR' ? 'ARR · penakar hujan otomatis' : lg.type === 'AWLR' ? 'AWLR · pos duga muka air otomatis' : 'Pengukur debit'}</dd>
            <dt>Lokasi</dt><dd>{lg.where}</dd>
            <dt>Komunikasi</dt><dd>{lg.comm}</dd>
            <dt>Parameter</dt><dd>{lg.params.map(x => x.label).join(', ')}</dd>
            <dt>Status</dt><dd>{status ? <StatusChip s={status} /> : 'Online'}</dd>
            {stn && <><dt>Baterai</dt><dd>{nf(battNow(stn), 1)} V</dd><dt>Sinyal</dt><dd>{stn.sig == null ? 'Iridium SBD' : stn.offline ? '—' : `${stn.sig} dBm`}</dd></>}
            {lg.gate && <><dt>Bukaan kini</dt><dd>{pctTxt(lg.gate.id, sim.open[lg.gate.id])}%</dd><dt>Debit kini</dt><dd>{nf(snap.gateQ[gIdx[lg.gate.id]] * (lg.gate.w || lg.gate.kind === 'intake' ? 1 : 1000), lg.gate.w || lg.gate.kind === 'intake' ? 2 : 0)} {lg.gate.w || lg.gate.kind === 'intake' ? 'm³/s' : 'l/dt'}</dd></>}
            <dt>Interval kirim</dt><dd>10 menit</dd>
          </dl>
        </aside>
      </>}
    </section>
  );
}

const ExportButton = ({ onClick }: { onClick: () => void }) =>
  <button type="button" className="an-action an-action--sm" onClick={onClick}><NavIcon name="download" /><span>Unduh grafik</span></button>;

function Legend({ items }: { items: { name: string; color: string; dash?: boolean }[] }) {
  return <div className="legend an-legend">{items.map(it => <span key={it.name} className="lg"><i className={it.dash ? 'dash' : ''} style={{ ['--c' as string]: it.color }} />{it.name}</span>)}</div>;
}

function Row({ b, p, table }: { b: Bucket; p: LogParam; table: [number, string, string][] }) {
  const f = (v: number | null) => v == null ? '—' : nf(v, p.d);
  if (p.sum) {
    const cls = b.sum == null ? null : rainClass(b.sum, table);
    return <tr><td>{b.long}</td><td className="num">{f(b.sum)}</td><td className="num">{f(b.peak)}</td><td>{cls ? <span className="an-class"><i style={{ background: cls[2] }} />{cls[1]}</span> : '—'}</td></tr>;
  }
  return <tr><td>{b.long}</td><td className="num">{f(b.mean)}</td><td className="num">{f(b.min)}</td><td className="num">{f(b.max)}</td><td className="num">{b.n ? `${b.ok}/${b.n}` : '—'}</td></tr>;
}

const whenOf = (t: number | null, range: RangeKind) => t == null ? '—' : range === 'day' ? `${hhmm(t)} WIB` : `${tanggal(t)} · ${hhmm(t)}`;
function StatSummary({ s, p, range }: { s: Series; p: LogParam; range: RangeKind }) {
  const u = p.unit ? <small>{p.unit}</small> : null;
  return (
    <div className="an-stats">
      <div className="an-stat"><span className="an-stat__k">Rerata</span><span className="an-stat__v">{nf(s.mean, p.d)}{u}</span><span className="an-stat__s">{s.title}</span></div>
      <div className="an-stat"><span className="an-stat__k">Minimum</span><span className="an-stat__v">{nf(s.min, p.d)}{u}</span><span className="an-stat__s">{whenOf(s.tMin, range)}</span></div>
      <div className="an-stat"><span className="an-stat__k">Maksimum</span><span className="an-stat__v">{nf(s.max, p.d)}{u}</span><span className="an-stat__s">{whenOf(s.tMax, range)}</span></div>
      <div className="an-stat"><span className="an-stat__k">Data masuk</span><span className="an-stat__v">{s.n ? nf(s.ok / s.n * 100, 0) : '—'}<small>%</small></span><span className="an-stat__s">{s.ok} dari {s.n} data</span></div>
    </div>
  );
}

/** Ringkasan singkat tiap parameter di mode multi: rerata (atau jumlah hujan) dan rentang minimum–maksimum. */
function MultiSummary({ items, range }: { items: MultiItem[]; range: RangeKind }) {
  return (
    <div className="an-mstats">
      {items.map(({ p, s, color }) => (
        <div key={p.key} className="an-mstat" style={{ ['--c' as string]: color }}>
          <span className="an-stat__k">{p.label}</span>
          <span className="an-mstat__v">{nf(p.sum ? s.sum : s.mean, p.d)}<small>{p.unit}{p.sum ? ' total' : ' rerata'}</small></span>
          <span className="an-stat__s">{p.sum ? `Intensitas maks ${nf(s.max, p.d)} mm/jam · ${whenOf(s.tMax, range)}` : `${nf(s.min, p.d)} – ${nf(s.max, p.d)} ${p.unit}`}</span>
        </div>
      ))}
    </div>
  );
}

function RainSummary({ s, hourly, table }: { s: Series; hourly: boolean; table: [number, string, string][] }) {
  const total = s.sum ?? 0, cls = rainClass(total, RAIN_DAILY);
  return (
    <div className="an-stats an-stats--rain">
      <div className="an-stat an-stat--rain">
        <span className="an-stat__k">Akumulasi curah hujan</span>
        <span className="an-stat__v">{nf(total, 1)}<small>mm</small></span>
        <span className="an-stat__s"><span className="an-class"><i style={{ background: cls[2] }} />{hourly ? cls[1] : `${s.title}`}</span></span>
      </div>
      <div className="an-stat an-stat--legend">
        <span className="an-stat__k">Keterangan intensitas hujan {hourly ? 'per jam' : 'per hari'}</span>
        <div className="an-rain-legend">
          {table.map(([lim, name, color], i) => { const lo = i ? table[i - 1][0] : 0; return (
            <span key={name} className="an-class"><i style={{ background: color }} />{name}<em>{i === 0 ? (hourly ? '0 mm' : `< ${nf(lim, 1)} mm`) : lim === Infinity ? `> ${nf(lo, 0)} mm` : `${nf(lo, lo < 1 ? 1 : 0)}–${nf(lim, 0)} mm`}</em></span>
          ); })}
        </div>
      </div>
    </div>
  );
}
