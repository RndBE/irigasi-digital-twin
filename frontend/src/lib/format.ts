/** Pembantu angka dan waktu yang dipakai domain, adegan 3D, dan antarmuka. */

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Angka gaya Indonesia (koma desimal); '—' untuk nilai kosong atau tak hingga. */
export const nf = (v: number | null | undefined, d = 2) =>
  v == null || !isFinite(v) ? '—' : v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Waktu simulasi dinyatakan dalam menit epoch. */
export const hhmm = (t: number) => new Date(t * 60000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });
export const tanggal = (t: number) => new Date(t * 60000).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
export const wibHour = (t: number) => (((t / 60) + 7) % 24 + 24) % 24;
export const jam = (h: number | null | undefined) => h == null ? '—' : h < 1 ? `${Math.round(h * 60)} mnt` : `${nf(h, h < 10 ? 1 : 0)} jam`;

export const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- tanggal WIB (UTC+7) untuk waktu simulasi dalam menit epoch ---------- */
const WIB = 7 * 60;
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** Bagian tanggal WIB dari waktu `t`: tahun, bulan (0–11), tanggal, jam. */
export const wibDate = (t: number) => { const d = new Date((t + WIB) * 60000); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours() }; };
/** Waktu (menit epoch) untuk tanggal dan jam WIB. */
export const wibT = (y: number, m: number, d = 1, h = 0) => Date.UTC(y, m, d, h) / 60000 - WIB;
/** Indeks hari WIB (bertambah 1 tiap tengah malam WIB). */
export const wibDay = (t: number) => Math.floor((t + WIB) / 1440);
export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** "28 September 2026". */
export const tglPanjang = (t: number) => { const w = wibDate(t); return `${w.d} ${BULAN[w.m]} ${w.y}`; };
/** "2026-09-28" untuk nilai input tanggal. */
export const isoDate = (t: number) => { const w = wibDate(t); return `${w.y}-${String(w.m + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`; };
/** Waktu tengah malam WIB dari "2026-09-28". */
export const fromIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return wibT(y, m - 1, d); };
