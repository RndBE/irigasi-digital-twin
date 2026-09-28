import { sim } from '../domain/state';
import { recommend, refreshLive, steadyView, step, warmUp } from '../domain/simulation';
import type { LayerKey, Layers, OpenMap, ScenarioId, Sel, SteadyView } from '../domain/types';

/**
 * Keadaan antarmuka dan aksi pengguna.
 *
 * Keadaan simulasi (`domain/state.ts`) dan keadaan antarmuka di sini sama-sama objek biasa yang diubah lewat
 * aksi; tiap aksi menaikkan nomor versi dan memberi tahu pelanggan. Komponen React membaca nomor versi lewat
 * `useTwin()` lalu membaca keadaannya langsung, jadi satu langkah simulasi cukup satu kali gambar ulang.
 */
export type TabId = 'dashboard' | 'twin' | 'telemetri' | 'neraca' | 'analisa' | 'evaluasi' | 'konsep';
export interface Draft { id: string; val: number }
export interface UiState {
  sel: Sel;
  /** Bukaan pintu yang sedang dipratinjau, belum diterapkan. */
  draft: Draft | null;
  layers: Layers;
  tab: TabId;
  playing: boolean;
  speed: number;
  /** Pintu yang sedang dibuka di jendela model 3D. */
  gateId: string | null;
  /** Laci menu samping terbuka (layar sempit). */
  navOpen: boolean;
}

/** Kamera adegan 3D; didaftarkan TwinView begitu adegannya siap. */
export interface SceneControl {
  focusOn(sel: Sel): void;
  flyTo(name: string): void;
}

const TABS: TabId[] = ['dashboard', 'twin', 'telemetri', 'neraca', 'analisa', 'evaluasi', 'konsep'];
/** Halaman dari alamat (#telemetri, #neraca, #konsep); tanpa alamat halaman twin. */
const tabFromHash = (): TabId => { const h = (typeof location !== 'undefined' ? location.hash : '').slice(1) as TabId; return TABS.includes(h) ? h : 'twin'; };

// riwayat 24 jam diisi sebelum apa pun digambar
warmUp();

export const ui: UiState = {
  // tampilan awal: AWLR Cimanuk di hulu Bendung Copong
  sel: { kind: 'station', id: 'AWLR-CMK-01' },
  draft: null,
  layers: { st: true, gt: typeof innerWidth === 'number' ? innerWidth > 700 : true, cells: true },
  tab: tabFromHash(),
  playing: true,
  speed: 1,
  gateId: null,
  navOpen: false,
};

let version = 0, simVersion = 0;
const listeners = new Set<() => void>();
function emit(simChanged = false) {
  version++;
  if (simChanged) simVersion++;
  listeners.forEach(l => l());
}
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getVersion = () => version;
/** Naik hanya bila keadaan simulasi atau bukaan pintu berubah (bukan saat memilih objek atau pratinjau). */
export const getSimVersion = () => simVersion;

let recCache: { v: number; open: OpenMap; view: SteadyView } | null = null;
/** Bukaan rekomendasi twin dan keadaan setelah air tiba; dihitung sekali per perubahan simulasi. */
export function recommendation() {
  if (!recCache || recCache.v !== simVersion) { const open = recommend(sim.env); recCache = { v: simVersion, open, view: steadyView(open) }; }
  return recCache;
}

let scene: SceneControl | null = null;
export function attachScene(s: SceneControl | null) { scene = s; }

let timer: ReturnType<typeof setInterval> | undefined;
function restartTimer() {
  clearInterval(timer);
  timer = setInterval(() => { if (ui.playing) { step(); emit(true); } }, 1500 / ui.speed);
}
/** Jalankan jam simulasi (sekali saja). */
export function startClock() { if (timer === undefined) restartTimer(); }

/** Bukaan pintu yang ditampilkan: bukaan kini ditimpa pratinjau bila ada. */
export const draftOpen = (): OpenMap => ui.draft ? { ...sim.open, [ui.draft.id]: ui.draft.val } : sim.open;

export function select(sel: Sel, opts: { fly?: boolean } = {}) {
  ui.sel = sel; ui.draft = null;
  if (opts.fly) scene?.focusOn(sel);
  emit();
}
export function flyTo(name: string) { scene?.flyTo(name); }
export function setDraft(id: string, val: number) { ui.draft = val === sim.open[id] ? null : { id, val }; emit(); }
export function cancelDraft() { ui.draft = null; emit(); }
export function applyDraft(id: string) {
  if (!ui.draft || ui.draft.id !== id) return;
  sim.open[id] = ui.draft.val; ui.draft = null;
  refreshLive(); emit(true);
}
export function applyRecommendation() { Object.assign(sim.open, recommend(sim.env)); ui.draft = null; refreshLive(); emit(true); }
export function setAuto(on: boolean) { sim.auto = on; ui.draft = null; emit(true); }
export function setScenario(id: ScenarioId) { sim.scenario = id; step(); emit(true); }
export function setSpeed(x: number) { ui.speed = x; restartTimer(); emit(); }
export function togglePlay() { ui.playing = !ui.playing; emit(); }
export function toggleLayer(k: LayerKey) { ui.layers = { ...ui.layers, [k]: !ui.layers[k] }; emit(); }
/** Pindah halaman; alamatnya ikut berubah supaya tombol kembali peramban dan muat ulang tetap di halaman itu. */
export function showTab(tab: TabId) {
  ui.tab = tab; ui.navOpen = false;
  if (tabFromHash() !== tab) history.pushState(null, '', '#' + tab);
  emit();
}
export function setNav(open: boolean) { ui.navOpen = open; emit(); }
if (typeof window !== 'undefined') window.addEventListener('popstate', () => { ui.tab = tabFromHash(); emit(); });
export function openGate(id: string) { ui.gateId = id; emit(); }
export function closeGate() { ui.gateId = null; emit(); }
/** Dari baris tabel ke objeknya di digital twin. */
export function goToTwin(sel: Sel) { showTab('twin'); select(sel, { fly: true }); }
