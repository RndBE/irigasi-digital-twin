import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clamp, smooth } from '../lib/format';
import type { Layers, Pt, Sel, Source } from '../domain/types';

/**
 * Keadaan bersama adegan 3D: objek three.js yang perlu diperbarui tiap langkah simulasi, tata letak diorama, dan
 * konstanta dunia. Adegannya satu per halaman, jadi keadaan ini modul tunggal yang diisi saat adegan dibangun.
 *
 * Warna disusun dengan alur three r128: warna sRGB dikonversi manual lewat `C()`, jadi manajemen warna otomatis
 * dimatikan agar tidak dikonversi dua kali. Sejak r155 cahaya memakai satuan fisik; intensitas lama dikali π
 * (`LIGHT`) supaya terang adegan sama dengan demo r128.
 */
THREE.ColorManagement.enabled = false;
export const LIGHT = Math.PI;
export const C = (h: THREE.ColorRepresentation) => new THREE.Color(h).convertSRGBToLinear();

/* ---------- world constants ---------- */
export const U = 0.1;              // scene units per scheme pixel
export const OX = 12;              // the network shifts east to leave room for the river and the weir complex
export const LOC_X = 15.4;         // small rivers of the local weirs
export const RIV0 = -1.5, WEIR_HW = 5.5;
export const LV = { pond: 0.36, down: -0.75, levee: 0.8, crest: -0.31, apron: -1.25 };

/** Titik adegan: [x, z] atau [x, z, y] atau [x, z, y, lebar]. */
export type P = number[];

export interface CanalDims { w: number; hw: number; T: number; road: number; b: number; s: number; outUp: number; outDn: number }
export interface Line3D { sx: number; ex: number; z: number; pz: number | null; root: boolean; pad: number; D: CanalDims }
export interface SchemeSystem { root: number; src: Source; y: number }
export interface Layout3D {
  weirZ: number; mainBottom: number; maxX: number; maxZ: number;
  lines: Record<number, Line3D>;
  /** Kantong lumpur. */
  KL: { x0: number; x1: number; z0: number; z1: number };
  zA: number; zB: number;
  systems: (SchemeSystem & { z: number })[];
  W: { x0: number; x1: number; z0: number; z1: number };
  plot: Record<number, Pt>;
  inflow: Record<number, Pt>;
  feeder: Record<number, { x: number; gz: number; D: CanalDims }>;
  /** Ruas lurus tiap saluran (`i`) dengan setengah lebar sampai kaki tanggulnya: terlebar, sisi jalan (−n), sisi lain (+n). */
  cseg: { a: P; b: P; out: number; outL?: number; outR?: number; T: number; D: CanalDims; i?: number }[];
  streams: P[][];
  situ?: number;
  lake?: Pt;
  /** Pohon di kaki luar tanggul Situ Bagendit (ditanam bersama pohon lain di buildTrees). */
  lakeTrees?: { x: number; y: number; z: number; s: number; ry: number; rz?: number; palm: boolean }[];
  roads: { r1: P[]; rw: P[]; re: P[] };
}

export interface CanalWater { mat: THREE.MeshStandardMaterial; tex: THREE.Texture; mesh: THREE.Mesh; D: CanalDims; speed: number; level: number }
export interface GateAnim { parts: { m: THREE.Object3D; y0: number; lift: number }[]; cur: number; target: number }
export interface WeirAnim { id: string; leaf: THREE.Object3D; cab: THREE.Mesh[]; hh?: number; base: number; lift: number; cur: number; target: number; kind: 'flood' | 'scour' }
export interface SensorMarker { led: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; alarm: boolean; x: number }
export interface Label3D { el: HTMLElement; v: THREE.Vector3; align: 'c' | 'r' | 'l' | 'm'; layer: keyof Layers | null; lod: number; vis: boolean }
export interface SkyUniforms { top: { value: THREE.Color }; hor: { value: THREE.Color }; bot: { value: THREE.Color }; sunCol: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; glow: { value: number } }
export interface SceneCallbacks { onSelect(sel: Sel): void; onOpenGate(id: string): void }

export interface SceneState {
  ready: boolean;
  host: HTMLElement; labelHost: HTMLElement;
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
  hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; sunDir: THREE.Vector3; sunI: number; hemiI: number;
  sky: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; envScene: THREE.Scene; envSky: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  envGround: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; pmrem: THREE.PMREMGenerator; env: Record<string, THREE.Texture>;
  canal: Record<number, CanalWater>;
  gates: Record<string, GateAnim>;
  sensors: Record<string, SensorMarker>;
  labels: Label3D[];
  tags: Record<string, HTMLElement>;
  pickables: THREE.Object3D[];
  plotOf: number[]; plotVary: number[];
  weir: WeirAnim[];
  mouths: { m: THREE.Mesh; p: number }[];
  tex: Record<string, THREE.Texture>;
  M: Record<string, THREE.MeshStandardMaterial>;
  pickMat: THREE.MeshBasicMaterial;
  carMats: THREE.MeshStandardMaterial[];
  G: Record<string, THREE.BufferGeometry>;
  glows: THREE.Sprite[]; lampLights: THREE.PointLight[]; clouds: THREE.Sprite[];
  plotNight: { value: number };
  cells: THREE.Group; plots: THREE.InstancedMesh;
  /** Lapisan rumpun padi di atas tiap petak (bawah ke atas), berwarna sama dengan petaknya. */
  plotShells?: THREE.InstancedMesh[];
  /**
   * Air bangunan sadap tersier sampai ke petak, per bagian (instanced): matriks tiap instans dan, per sadap (urutan
   * sama dengan `m`), instans miliknya; kering bila ruasnya tak berdebit.
   */
  offtakes?: { parts: { mesh: THREE.InstancedMesh; base: THREE.Matrix4[]; idx: number[][] }[]; m: number[]; on: boolean[] };
  /** Riak air masuk di muka pengambilan tiap sadap, per saluran: grup yang mengikuti muka air saluran `i`. */
  offInflow?: { g: THREE.Group; i: number }[];
  /** Air masuk Situ Bagendit tiap frame: air di saluran inlet, terjunan, buih, dan riak mengikuti saluran. */
  lakeTick?: () => void;
  /** Buih keluaran di hilir tiap pintu saluran: mengikuti muka air saluran `i`, bukaan pintu `id`, dan debit. */
  gateFlow: { m: THREE.Mesh; mat: THREE.MeshStandardMaterial; i: number; id: string }[];
  riverUp: THREE.Mesh;
  weirJets: THREE.MeshStandardMaterial[];
  foamMat2: THREE.MeshStandardMaterial;
  inJet?: THREE.MeshStandardMaterial; klJet?: THREE.MeshStandardMaterial;
  /** Samakan air peralihan kantong lumpur ke SI Copong dengan tinggi dan warna air saluran saat ini. */
  klTrans?: (canalY: number, canalCol: THREE.Color) => void;
  /** Arus masuk di muka intake (sisi sungai): garis arus, cekungan muka air, air dan buih di lorong tiap pintu. */
  intakeFlow?: {
    g: THREE.Group; tex: THREE.Texture; streak: THREE.MeshStandardMaterial; dip: THREE.MeshBasicMaterial; speed: number;
    pass: THREE.Mesh[]; pf: THREE.Mesh[]; foam: THREE.MeshStandardMaterial;
  };
  selRing: THREE.Mesh; selScale: number;
  pondY?: number; shSize?: number;
  w: number; h: number;
  pend: number[][];
  postHouse?: { x: number; z: number };
  villages: { x: number; z: number; n: number; a: number }[];
  paused: boolean;
  layers: Layers;
  cb: SceneCallbacks;
}

export const S = {
  ready: false, canal: {}, gates: {}, gateFlow: [], sensors: {}, labels: [], tags: {}, pickables: [], plotOf: [], plotVary: [], weir: [], mouths: [],
  tex: {}, M: {}, G: {}, glows: [], lampLights: [], clouds: [], pend: [], villages: [], paused: false,
  layers: { st: true, gt: true, cells: true }, w: 1, h: 1,
} as unknown as SceneState;
export const T3 = {} as Layout3D;

/** Sudut pandang: sasaran kamera dan posisi kamera relatif terhadap sasaran. */
export interface View { tgt: [number, number, number]; off: [number, number, number] }
export const VIEWS: Record<string, View> = {};

export const isDark = () => { const a = document.documentElement.getAttribute('data-theme'); if (a === 'dark') return true; if (a === 'light') return false; return matchMedia('(prefers-color-scheme: dark)').matches; };

const K_STOPS: [number, number[]][] = [[0.3, [0xc7, 0xa5, 0x6a]], [0.6, [0xc9, 0xb7, 0x5c]], [0.85, [0x9d, 0xbb, 0x4b]], [1.0, [0x5e, 0x9f, 0x3e]], [1.3, [0x3f, 0x8f, 0x55]]];
/** Warna petak sawah menurut Faktor K (sRGB 0–1). */
export function kRGB(K: number) { K = clamp(K, 0.3, 1.3); for (let i = 1; i < K_STOPS.length; i++) if (K <= K_STOPS[i][0]) { const [k0, c0] = K_STOPS[i - 1], [k1, c1] = K_STOPS[i], f = (K - k0) / (k1 - k0); return c0.map((c, j) => (c + (c1[j] - c) * f) / 255); } return K_STOPS[4][1].map(c => c / 255); }

/* ---------- river course ---------- */
export const riverX = (z: number) => RIV0 + (2.4 * Math.sin(z / 27) + 1.1 * Math.sin(z / 10.5 + 1.3)) * smooth(12, 40, Math.abs(z - T3.weirZ));
export const riverHW = (z: number) => 4.7 + 0.95 * (1 - smooth(5, 18, Math.abs(z - T3.weirZ)));
export const waterLevel = (z: number) => z > T3.weirZ ? LV.down : LV.pond + Math.max(0, T3.weirZ - 50 - z) * 0.03;

/* ---------- noise ---------- */
export function hash2(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, z: number) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5.2, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3 + 1.7) * 0.15;

