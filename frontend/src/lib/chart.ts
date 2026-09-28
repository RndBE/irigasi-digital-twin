import { clamp, hhmm, nf, tanggal, wibHour } from './format';

/**
 * Grafik deret waktu SVG ringan (garis atau batang) dengan garis bantu dan tooltip.
 *
 * Grafik digambar langsung ke DOM, bukan lewat React: ukurannya mengikuti lebar wadah (ResizeObserver) dan
 * tooltip-nya bergerak mengikuti penunjuk tanpa memicu render ulang komponen. Seri boleh memakai sumbu Y kanan
 * untuk satuan kedua (grafik multi parameter).
 */
export interface ChartSeries {
  name: string; color: string; values: (number | null)[]; dash?: boolean; colorOf?: (v: number) => string;
  /** Sumbu Y kanan (satuan kedua pada grafik multi parameter). */
  axis?: 'right';
  /** Satuan dan jumlah desimal di tooltip bila berbeda dari sumbunya. */
  unit?: string; digits?: number;
}
export interface ChartData { times: number[]; series: ChartSeries[] }
export interface ChartConfig {
  height?: number; kind?: 'line' | 'bar'; refs?: { v: number; label: string }[]; unit?: string; digits?: number;
  /** Sumbu datar bukan waktu: label dan pilihan titik yang diberi label (bawaan: jam, tiap 6 jam). */
  xLabel?: (x: number) => string; xTick?: (x: number, i: number) => boolean;
  /** false = sumbu Y mengikuti rentang data, tidak dimulai dari nol (garis saja). */
  zero?: boolean;
  /** Satuan sumbu kanan; dengan `axisTitles` satuan tiap sumbu ditulis di atasnya. */
  unitR?: string; axisTitles?: boolean;
}

const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
let chartUid = 0;
export function niceStep(raw: number) { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }

interface Axis { y0: number; y1: number; stp: number; dig: number }
/** Rentang dan jarak garis bantu satu sumbu dari nilai seri dan garis acuannya. */
function axisOf(series: ChartSeries[], refs: { v: number }[], zero: boolean | undefined): Axis {
  let max = -Infinity, min = Infinity;
  series.forEach(s => s.values.forEach(v => { if (v != null) { if (v > max) max = v; if (v < min) min = v; } }));
  refs.forEach(r => { if (r.v > max) max = r.v; if (r.v < min) min = r.v; });
  if (!isFinite(min)) { min = 0; max = 0; }
  let stp: number, y0 = 0, y1: number;
  if (zero === false && min > 0) {
    // sumbu mengikuti rentang data (mis. muka air 695 mdpl), bukan dari nol
    const span = max - min || Math.abs(max) * 0.02 || 1;
    stp = niceStep(span / 3.2); y0 = Math.floor((min - span * 0.04) / stp) * stp; y1 = Math.max(y0 + stp, Math.ceil((max + span * 0.04) / stp) * stp);
  } else { max = Math.max(0, max); stp = niceStep((max || 1) / 3.2); y1 = Math.max(stp, Math.ceil(max * 1.04 / stp) * stp); }
  return { y0, y1, stp, dig: stp < 0.1 ? 2 : stp < 1 ? 1 : 0 };
}

export function makeChart(el: HTMLElement, config: ChartConfig) {
  const cfg = { height: 150, kind: 'line' as const, refs: [] as { v: number; label: string }[], ...config };
  const uid = ++chartUid;
  el.classList.add('chart');
  el.innerHTML = '<svg aria-hidden="true"></svg><div class="tip" hidden></div>';
  const svg = el.firstChild as SVGSVGElement, tip = el.lastChild as HTMLDivElement;
  let D: ChartData | null = null, G: { W: number; H: number; n: number; L: Axis; R: Axis | null } | null = null, hoverI: number | null = null;
  const pad = { l: 42, r: 14, t: 10, b: 22 };
  const X = (i: number) => pad.l + (G!.n <= 1 ? 0 : i / (G!.n - 1)) * (G!.W - pad.l - pad.r);
  const Y = (v: number, a: Axis = G!.L) => pad.t + (1 - (v - a.y0) / (a.y1 - a.y0)) * (G!.H - pad.t - pad.b);
  const axisFor = (s: ChartSeries) => s.axis === 'right' && G!.R ? G!.R : G!.L;
  function render() {
    if (!D) return;
    const W = el.clientWidth; if (!W) return;
    const H = cfg.height, n = D.times.length, right = D.series.filter(s => s.axis === 'right');
    pad.r = right.length ? 50 : 14; pad.t = cfg.axisTitles ? 24 : 10;
    G = { W, H, n, L: axisOf(D.series.filter(s => s.axis !== 'right'), cfg.refs, cfg.zero), R: right.length ? axisOf(right, [], cfg.zero) : null };
    const { L, R } = G;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H));
    let h = `<defs>${D.series.map((s, k) => `<linearGradient id="g${uid}_${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${s.color};stop-opacity:.2"/><stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`).join('')}</defs><g class="grid">`;
    for (let v = L.y0; v <= L.y1 + 1e-9; v += L.stp) { const yy = Y(v).toFixed(1); h += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"${v === L.y0 ? ' class="base"' : ''}/><text x="${pad.l - 6}" y="${yy}" dy="0.32em" text-anchor="end">${nf(v, L.dig)}</text>`; }
    if (R) for (let v = R.y0; v <= R.y1 + 1e-9; v += R.stp) h += `<text x="${W - pad.r + 6}" y="${Y(v, R).toFixed(1)}" dy="0.32em" text-anchor="start">${nf(v, R.dig)}</text>`;
    if (cfg.axisTitles) {
      if (cfg.unit) h += `<text class="ax" x="${pad.l - 6}" y="10" text-anchor="end">${esc(cfg.unit)}</text>`;
      if (R && cfg.unitR) h += `<text class="ax" x="${W - pad.r + 6}" y="10" text-anchor="start">${esc(cfg.unitR)}</text>`;
    }
    h += '</g><g>';
    // label sumbu waktu berjarak paling sedikit 44 px: di layar sempit sebagian dilewati, tidak bertumpuk
    let lastX = -Infinity;
    D.times.forEach((t, i) => { if (cfg.xTick ? !cfg.xTick(t, i) : wibHour(t) % 6 !== 0) return; const xx = X(i); if (xx < pad.l + 16 || xx > W - pad.r - 16 || xx - lastX < 44) return; lastX = xx; h += `<text x="${xx.toFixed(1)}" y="${H - 5}" text-anchor="middle">${cfg.xLabel ? cfg.xLabel(t) : hhmm(t)}</text>`; });
    h += '</g>';
    cfg.refs.forEach(r => { const yy = Y(r.v).toFixed(1); h += `<g class="ref"><line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/><text x="${W - pad.r}" y="${yy}" dy="-4" text-anchor="end">${r.label}</text></g>`; });
    D.series.forEach((s, k) => {
      const a = axisFor(s);
      if (cfg.kind === 'bar') {
        const bw = Math.max(1, (W - pad.l - pad.r) / Math.max(1, n - 1) * 0.72);
        s.values.forEach((v, i) => { if (v == null || v <= 0) return; const yy = Y(v, a); h += `<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, Y(0, a) - yy).toFixed(1)}" rx="${bw > 5 ? 2 : 0}" style="fill:${s.colorOf ? s.colorOf(v) : s.color}"/>`; });
        return;
      }
      let dl = '', da = '', run: string[][] = [];
      const base = Y(a.y0, a).toFixed(1);
      const flush = () => { if (run.length > 1) da += `M${run[0][0]} ${base}` + run.map(p => `L${p[0]} ${p[1]}`).join('') + `L${run[run.length - 1][0]} ${base}Z`; run = []; };
      s.values.forEach((v, i) => { if (v == null) { flush(); return; } const p = [X(i).toFixed(1), Y(v, a).toFixed(1)]; dl += (run.length ? 'L' : 'M') + p[0] + ' ' + p[1]; run.push(p); });
      flush();
      if (da && D!.series.length === 1) h += `<path d="${da}" fill="url(#g${uid}_${k})"/>`;
      h += `<path class="ln${s.dash ? ' dash' : ''}" d="${dl}" style="stroke:${s.color}"/>`;
      let li = s.values.length - 1; while (li >= 0 && s.values[li] == null) li--;
      if (li >= 0 && !s.dash) h += `<circle class="end" cx="${X(li).toFixed(1)}" cy="${Y(s.values[li]!, a).toFixed(1)}" r="3.6" style="fill:${s.color}"/>`;
    });
    h += `<g class="hov" visibility="hidden"><line class="xh" y1="${pad.t}" y2="${H - pad.b}"/>${D.series.map((s, k) => `<circle class="hd" r="4" style="fill:${s.color}" data-k="${k}"/>`).join('')}</g>`;
    svg.innerHTML = h;
    if (hoverI != null) show(hoverI);
  }
  function show(i: number) {
    if (!D || !G) return;
    i = clamp(i, 0, G.n - 1);
    const g = svg.querySelector('.hov'); if (!g) return;
    g.setAttribute('visibility', 'visible');
    const x = X(i), ln = g.querySelector('.xh')!; ln.setAttribute('x1', String(x)); ln.setAttribute('x2', String(x));
    g.querySelectorAll<SVGCircleElement>('.hd').forEach(c => { const s = D!.series[+c.dataset.k!], v = s.values[i]; if (v == null || cfg.kind === 'bar') c.setAttribute('visibility', 'hidden'); else { c.setAttribute('visibility', 'visible'); c.setAttribute('cx', String(x)); c.setAttribute('cy', String(Y(v, axisFor(s)))); } });
    tip.innerHTML = `<div class="tt">${cfg.xLabel ? cfg.xLabel(D.times[i]) : `${tanggal(D.times[i])} · ${hhmm(D.times[i])}`}</div>` + D.series.map(s => { const v = s.values[i], u = s.unit ?? cfg.unit; return `<div><i style="background:${s.color}"></i>${esc(s.name)}: ${v == null ? 'tidak ada data' : nf(v, s.digits ?? cfg.digits ?? 2) + (u ? ' ' + u : '')}</div>`; }).join('');
    tip.hidden = false;
    if (x < G.W / 2) { tip.style.left = (x + 10) + 'px'; tip.style.transform = 'none'; } else { tip.style.left = (x - 10) + 'px'; tip.style.transform = 'translateX(-100%)'; }
  }
  const move = (e: PointerEvent) => { if (!G) return; const r = svg.getBoundingClientRect(); hoverI = Math.round(clamp((e.clientX - r.left - pad.l) / (G.W - pad.l - pad.r), 0, 1) * (G.n - 1)); show(hoverI); };
  const leave = () => { hoverI = null; tip.hidden = true; const g = svg.querySelector('.hov'); if (g) g.setAttribute('visibility', 'hidden'); };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  const ro = new ResizeObserver(() => render()); ro.observe(el);
  return {
    update(d: ChartData) { D = d; render(); },
    dispose() { ro.disconnect(); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); },
  };
}
export type ChartHandle = ReturnType<typeof makeChart>;

/** Keterangan gambar grafik yang diunduh: kepala seperti di mini-stesy, legenda, dan nama berkas. */
export interface ChartExport { eyebrow: string; title: string; lines: string[]; legend: { name: string; color: string; dash?: boolean }[]; filename: string }
const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'stop-color', 'stop-opacity', 'font-family', 'font-size', 'font-weight', 'visibility'];
/**
 * Unduh grafik di dalam `el` sebagai PNG di latar panel: gaya CSS tiap unsur SVG ditanam dulu (warna dari variabel
 * tema ikut terbaca), lalu SVG digambar ke kanvas di bawah kepala judul dan di atas legenda.
 */
export async function downloadChartPng(el: HTMLElement, meta: ChartExport) {
  const src = el.querySelector('svg'); if (!src) return;
  const W = +src.getAttribute('width')!, H = +src.getAttribute('height')!; if (!W || !H) return;
  const clone = src.cloneNode(true) as SVGSVGElement, a = src.querySelectorAll('*'), b = clone.querySelectorAll('*');
  a.forEach((node, i) => { const cs = getComputedStyle(node); (b[i] as SVGElement).setAttribute('style', STYLE_PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';')); });
  clone.querySelector('.hov')?.remove();
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const img = new Image();
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone)); });
  const root = getComputedStyle(document.documentElement), css = (k: string, d: string) => root.getPropertyValue(k).trim() || d;
  const ink = css('--ink', '#eaf1ff'), ink2 = css('--ink-2', '#b8c7e6'), muted = css('--muted', '#7f93bb'), accent = css('--accent', '#3b8cff');
  const body = css('--f-body', 'sans-serif'), mono = css('--f-mono', 'monospace');
  const S = 2, P = 28, HEAD = 58 + meta.lines.length * 19, LEG = 40, CW = W + P * 2, CH = HEAD + H + LEG + P * 0.6;
  const cv = document.createElement('canvas'); cv.width = CW * S; cv.height = CH * S;
  const ctx = cv.getContext('2d')!; ctx.scale(S, S);
  ctx.fillStyle = '#0f1f42'; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = accent; ctx.fillRect(P, 22, 7, 7);
  ctx.fillStyle = muted; ctx.font = `500 10px ${mono}`; ctx.letterSpacing = '2px'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(meta.eyebrow.toUpperCase(), P + 15, 29);
  ctx.letterSpacing = '0px'; ctx.fillStyle = ink; ctx.font = `700 17px ${body}`; ctx.fillText(meta.title, P, 52);
  ctx.fillStyle = ink2; ctx.font = `600 12px ${body}`;
  meta.lines.forEach((ln, k) => ctx.fillText(ln, P, 74 + k * 19));
  ctx.strokeStyle = 'rgba(120,160,220,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P, HEAD - 6); ctx.lineTo(CW - P, HEAD - 6); ctx.stroke();
  ctx.drawImage(img, P, HEAD, W, H);
  // legenda di tengah, di bawah grafik
  ctx.font = `500 12px ${body}`;
  const items = meta.legend.map(l => ({ ...l, w: 26 + ctx.measureText(l.name).width }));
  let x = (CW - items.reduce((s, it) => s + it.w + 18, -18)) / 2; const y = HEAD + H + 24;
  items.forEach(it => {
    const col = it.color.startsWith('var(') ? css(it.color.slice(4, -1), accent) : it.color;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash(it.dash ? [5, 4] : []); ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 18, y - 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ink2; ctx.fillText(it.name, x + 26, y); x += it.w + 18;
  });
  ctx.fillStyle = muted; ctx.font = `500 9.5px ${mono}`; ctx.textAlign = 'right'; ctx.fillText('Digital Twin Irigasi · D.I. Leuwigoong · mode peraga', CW - P, CH - 10);
  cv.toBlob(blob => {
    if (!blob) return;
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${meta.filename}.png`;
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }, 'image/png');
}

/** Profil muka tanah sepanjang jalur air, dengan titik bangunan. */
export interface ProfileData { pts: [number, number, string][]; marks: { km: number; name: string; ruas: string }[] }
export function profileChart(el: HTMLElement, data: ProfileData) {
  el.classList.add('chart');
  el.innerHTML = '<svg aria-hidden="true"></svg><div class="tip" hidden></div>';
  const svg = el.firstChild as SVGSVGElement, tip = el.lastChild as HTMLDivElement, W = el.clientWidth || 300, Hh = 130, pad = { l: 42, r: 12, t: 12, b: 22 };
  const { pts, marks } = data, x1 = pts[pts.length - 1][0] || 1;
  let lo = Math.min(...pts.map(p => p[1])), hi = Math.max(...pts.map(p => p[1]));
  const stp = niceStep(Math.max(5, (hi - lo) / 3)); lo = Math.floor(lo / stp) * stp; hi = Math.ceil(hi / stp) * stp; if (hi === lo) hi = lo + stp;
  const X = (v: number) => pad.l + v / x1 * (W - pad.l - pad.r), Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (Hh - pad.t - pad.b);
  let h = '<g class="grid">';
  for (let v = lo; v <= hi + 1e-6; v += stp) h += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"${v === lo ? ' class="base"' : ''}/><text x="${pad.l - 6}" y="${Y(v).toFixed(1)}" dy="0.32em" text-anchor="end">${nf(v, 0)}</text>`;
  h += '</g>';
  const kst = niceStep(x1 / 4);
  for (let v = 0; v <= x1 + 1e-6; v += kst) h += `<text x="${X(v).toFixed(1)}" y="${Hh - 5}" text-anchor="middle">${nf(v, kst < 1 ? 1 : 0)} km</text>`;
  const line = pts.map((p, k) => (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  h += `<path d="${line}L${X(x1).toFixed(1)} ${Y(lo)}L${X(0)} ${Y(lo)}Z" style="fill:var(--s1);opacity:.14"/><path class="ln" d="${line}" style="stroke:var(--s1)"/>`;
  marks.forEach(mk => { const p = pts.reduce((b, q) => Math.abs(q[0] - mk.km) < Math.abs(b[0] - mk.km) ? q : b, pts[0]); h += `<circle class="end" cx="${X(mk.km).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.4" style="fill:var(--s2)"/>`; });
  h += `<g class="hov" visibility="hidden"><line class="xh" y1="${pad.t}" y2="${Hh - pad.b}"/><circle class="hd" r="4" style="fill:var(--s1)"/></g>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('width', String(W)); svg.setAttribute('height', String(Hh));
  svg.innerHTML = h;
  el.onpointermove = e => {
    const r = svg.getBoundingClientRect(), km = clamp((e.clientX - r.left - pad.l) / (W - pad.l - pad.r), 0, 1) * x1;
    const p = pts.reduce((b, q) => Math.abs(q[0] - km) < Math.abs(b[0] - km) ? q : b, pts[0]);
    const mk = marks.filter(m => m.km <= p[0] + 1e-6).pop();
    const g = svg.querySelector('.hov')!; g.setAttribute('visibility', 'visible');
    g.querySelector('.xh')!.setAttribute('x1', String(X(p[0]))); g.querySelector('.xh')!.setAttribute('x2', String(X(p[0])));
    const c = g.querySelector('.hd')!; c.setAttribute('cx', String(X(p[0]))); c.setAttribute('cy', String(Y(p[1])));
    tip.innerHTML = `<div class="tt">km ${nf(p[0], 2)}</div><div>Muka tanah ±${nf(p[1], 0)} mdpl</div><div>${esc(p[2])}${mk ? ' · dari ' + esc(mk.name) : ''}</div>`;
    tip.hidden = false; const x = X(p[0]);
    if (x < W / 2) { tip.style.left = (x + 10) + 'px'; tip.style.transform = 'none'; } else { tip.style.left = (x - 10) + 'px'; tip.style.transform = 'translateX(-100%)'; }
  };
  el.onpointerleave = () => { tip.hidden = true; svg.querySelector('.hov')!.setAttribute('visibility', 'hidden'); };
}
