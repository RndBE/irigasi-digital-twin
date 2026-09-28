/** Tipe data jaringan D.I. Leuwigoong, pintu, stasiun, dan keadaan simulasi. */

/** Titik skema [x, z] dalam piksel skema; garis ruas adalah deret titik. */
export type Pt = [number, number];
export type Line = Pt[];

/** Tingkat status: baik, perlu perhatian, kritis, atau offline. */
export type Lvl = 'good' | 'warn' | 'crit' | 'serious';
export type Status = [Lvl, string];

export type RuasType = 'P' | 'S' | 'U' | 'T';
export type ScenarioId = 'normal' | 'kemarau' | 'banjir';
export type OpenMap = Record<string, number>;

export interface Bendung {
  x: number; z: number;
  mercu_m: number; tinggi_m: number; el_mercu: number;
  tipe: string; intake: string; q_rencana: number; pintu_kanan: string;
  kantong_lumpur_m: number; das_km2: number; tahun: string; kec: string; desa: string; luas_baku: number;
}

/** Simpul tata letak skema; diisi `computeLayout` sebelum adegan 3D dibangun. */
export interface SchemeItem {
  kind: 'line' | 'box' | 'in' | 'self';
  c: number;
  d: number;
  x: number;
  members: number[];
  side: 'up' | 'down';
}
export interface SchemeNode {
  sx: number; ex: number; maxX: number; pad: number;
  items: SchemeItem[];
  dy: number; h: number; y: number; py: number | null;
}

/**
 * Satu ruas saluran. Kolom huruf pendek berasal dari data (notebook WMS + layer SISDA), sisanya diturunkan
 * saat jaringan disiapkan (`domain/network.ts`).
 */
export interface Ruas {
  // dari data
  k: string; n: string; j: string; p: number;
  A: number; D: number; L: number;
  b: number; h: number; v: number; m: number; n2: number; S: number; fr: number;
  tA: number; tH: number; ta: number;
  s: string | null; src: string | null; into: number | null;
  g: Line[];
  // turunan
  i: number;
  kids: number[];
  ck: number[];
  type: RuasType;
  situ: boolean;
  via: boolean;
  D0: number;
  own0: number;
  eta: number;
  Dc: number;
  cap: number;
  subA: number;
  sys: number;
  srcObj?: Source;
  grp?: number;
  gate?: string;
  sk: SchemeNode;
}

export interface Fix { k: string; n: string; j: string; kind: 'ruas' | 'src' | 'sup'; to: string; into: string | null; gap: number; st: string; why: string }

export interface NetworkData {
  bbox: [number, number, number, number];
  dem: { n: number; elev: number[] };
  bendung: Bendung;
  ruas: Ruas[];
  fixes: Fix[];
  /** Per bangunan: [jenis, indeks ruas yang berawal di bangunan itu]. */
  bmeta: [string, number[]][];
  rivers: { n: string; o: number; pts: Line }[];
  /** [x, z, nama] tiap bangunan irigasi SISDA. */
  bangunan: [number, number, string][];
}

export type SourceKind = 'utama' | 'lokal' | 'suplesi';
export interface Source {
  key: string; raw: string; name: string; kind: SourceKind;
  ri: number; gate: string; pos: Pt;
  cap: number; into?: number;
  idx: number;
  /** Debit sungai dasar per skenario [normal, kemarau, banjir] dalam m³/s. */
  base: [number, number, number];
}

/** Kelompok layanan: tersier yang menyadap dari satu saluran sekunder/primer. */
export interface Group {
  gi: number; ri: number; members: number[]; area: number;
  name: string; short: string; id: string; src: Source | undefined;
}

export interface WeirGate { id: string; bay: number; kind: 'banjir' | 'kuras'; b: number; sill: number; leafH: number; maxA: number }

export type GateKind = 'intake' | 'bendung' | 'sadap' | 'lokal' | 'suplesi';
export interface Gate {
  id: string; ri: number; kind: GateKind;
  name: string; role: string; sub: string; maxCm: number;
  src?: Source; w?: WeirGate; situ?: boolean;
  sys: number;
  /** Posisi di adegan 3D [x, z], diisi saat model pintu dibangun. */
  pos3?: Pt;
}

export interface Env { Qriver: number; rain: number; src: Record<string, number> }

export interface SimState {
  scenario: ScenarioId;
  auto: boolean;
  /** Waktu simulasi, menit epoch. */
  t: number;
  env: Env;
  rainBuf: number[];
  /** Bukaan tiap pintu dalam persen. */
  open: OpenMap;
  /** Cuplikan 10 menitan, 24 jam terakhir. */
  hist: Snapshot[];
}

export interface Snapshot {
  t: number; Qriver: number; rain: number; f: number; Qin: number; spill: number; situ: number;
  need: number; got: number; K: number; waste: number;
  /** Tinggi air di atas mercu (m). */
  hMercu: number;
  /** Debit lewat tiap pintu bendung [banjir 1–3, penguras] (m³/s). */
  wq: number[];
  grpGot: number[]; grpNeed: number[];
  gateQ: number[]; gateNeed: number[]; gateK: number[];
  srcRiver: number[];
  q: Float32Array;
  sv: number[]; sv2: number[]; ss: Status[];
  open: OpenMap;
}

/** Konteks baca stasiun: cuplikan + debit dan pasokan per ruas. */
export interface StationCtx extends Omit<Snapshot, 'sv' | 'sv2' | 'ss' | 'open'> {
  Q: Float64Array; sg: Float64Array; sn: Float64Array;
}

export interface Reading { label: string; unit: string; d: number; get: (c: StationCtx) => number }
export interface Station {
  id: string; code: string; name: string;
  type: 'AWLR' | 'Debit' | 'ARR';
  comm: 'Satelit' | '4G';
  pos: Pt; where: string; lod: number;
  ri?: number; offline?: boolean;
  main: Reading; sub: Reading;
  status: (c: StationCtx) => Status;
  batt: number; sig: number | null;
  pos3?: Pt; y3?: number;
}

/** Hasil model tunak: debit per ruas, pasokan ke petak, dan keseimbangan bendung. */
export interface WeirBalance { H: number; q: number[]; qin: number }
export interface Steady {
  Q: Float64Array; got: Float64Array; sup: Float64Array;
  Qin: number; spill: number; situ: number; f: number; weir: WeirBalance | null;
}

/** Keadaan yang ditampilkan adegan 3D: kini (dengan jeda tempuh air) atau pratinjau tunak. */
export interface SceneView {
  Q: ArrayLike<number>; Kt: Float64Array; sK: Float64Array;
  Qriver: number; rain: number; H: number; wq: number[];
}
export interface SteadyView extends SceneView { grp: number[]; K: number; waste: number; Qin: number }

export type Sel =
  | { kind: 'station'; id: string }
  | { kind: 'gate'; id: string }
  | { kind: 'ruas'; id: string }
  | { kind: 'grp'; id: string };

export type LayerKey = 'st' | 'gt' | 'cells';
export type Layers = Record<LayerKey, boolean>;
