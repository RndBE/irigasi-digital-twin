import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clamp, reduceMotion } from '../lib/format';
import { R, ROOT, byName } from '../domain/network';
import type { Layers, OpenMap, SceneView, Sel, Snapshot } from '../domain/types';
import { C, LIGHT, LV, S, T3, VIEWS, isDark, riverX, type SceneCallbacks } from './context';
import { flushStatic, makeGeos } from './geometry';
import { makeTextures } from './textures';
import { makeMaterials, makeSky } from './materials';
import { layout3d, lineMid } from './layout';
import { ogInit } from './occupancy';
import { buildGround } from './terrain';
import { buildRiver } from './river';
import { buildKlTransition, buildWeir, tickWeirSheets } from './weir';
import { buildCanals, buildGates, buildLake, buildLocal, buildPlots } from './canals';
import { buildSensors } from './sensors';
import { buildRoads } from './roads';
import { buildFields, buildVillages } from './villages';
import { buildBackdrop, buildTrees } from './vegetation';
import { buildLabels, placeLabels } from './labels';
import { markSelection, selPos, syncScene, updateTags } from './sync';
import { buildRain, setWeatherTheme, tickWeather } from './weather';

/**
 * Diorama 3D realistis D.I. Leuwigoong.
 *
 * Tata letak tetap mengikuti skema jaringan: tiap primer/sekunder saluran lurus, sadap berderet sesuai urutan
 * aslinya, petak tersier di tebing kiri (jauh) atau kanan (dekat). Model bangunan mengikuti bangunan aslinya.
 * Sungai mengalir ke +z, jadi daerah irigasi ada di hilir bendung. Tidak berskala.
 *
 * Adegan dibangun sekali per halaman; `update` hanya menyalin keadaan simulasi ke objek yang sudah ada.
 */
export interface SceneUpdate { view: SceneView; open: OpenMap; snap: Snapshot; sel: Sel | null; layers: Layers }
export interface TwinScene {
  update(p: SceneUpdate): void;
  flyTo(name: string, instant?: boolean): void;
  focusOn(sel: Sel): void;
  setPaused(paused: boolean): void;
}
export interface MountOptions { host: HTMLElement; labelHost: HTMLElement; callbacks: SceneCallbacks }

const THEMES = {
  day: { top: 0x3d7cc0, hor: 0xd3e1e8, bot: 0x8e9a78, sun: 0xfff0d8, sunI: 1.9, sunDir: [-0.42, 0.8, -0.43], glow: 0.35, hemiSky: 0xd6e8ff, hemiGround: 0x5d5a3c, hemiI: 0.22, exposure: 0.95, envGround: 0x5a6640, night: 0 },
  dusk: { top: 0x0c1a36, hor: 0x655d78, bot: 0x2a2c2c, sun: 0xffb884, sunI: 1.15, sunDir: [-0.84, 0.26, -0.3], glow: 1.1, hemiSky: 0x93a4d6, hemiGround: 0x34352a, hemiI: 0.9, exposure: 1.3, envGround: 0x3a4130, night: 1 },
};
function applySceneTheme() {
  if (!S.scene) return;
  const key = isDark() ? 'dusk' : 'day', P = THEMES[key];
  const setSky = (u: Record<string, THREE.IUniform>) => { u.top.value.copy(C(P.top)); u.hor.value.copy(C(P.hor)); u.bot.value.copy(C(P.bot)); u.sunCol.value.copy(C(P.sun)); u.sunDir.value.set(...P.sunDir).normalize(); u.glow.value = P.glow; };
  setSky(S.sky.material.uniforms); setSky(S.envSky.material.uniforms); S.envGround.material.color.copy(C(P.envGround));
  if (!S.env[key]) S.env[key] = S.pmrem.fromScene(S.envScene, 0.02, 0.1, 200).texture;
  S.scene.environment = S.env[key];
  (S.scene.fog as THREE.Fog).color.setHex(P.hor); S.renderer.setClearColor(P.hor);
  S.sunDir = new THREE.Vector3(...P.sunDir).normalize();
  S.sun.color.copy(C(P.sun)); S.sunI = P.sunI;
  S.hemi.color.copy(C(P.hemiSky)); S.hemi.groundColor.copy(C(P.hemiGround)); S.hemiI = P.hemiI;
  S.renderer.toneMappingExposure = P.exposure;
  const n = P.night;
  S.plotNight.value = n; S.M.wall.emissiveIntensity = n * 0.85; S.M.office.emissiveIntensity = n * 1.1; S.M.winLit.emissiveIntensity = n * 1.3; S.M.lamp.emissiveIntensity = n ? 3.2 : 0.15;
  S.glows.forEach(g => { g.visible = !!n; });
  S.lampLights.forEach(l => { l.intensity = n * 1.4 * LIGHT; });
  S.clouds.forEach(c => { c.material.color.copy(C(n ? 0x77708a : 0xffffff)); c.material.opacity = n ? 0.45 : 0.8; });
  setWeatherTheme(!!n);
}

function buildWorld() {
  ogInit();
  buildGround();
  buildRiver();
  buildWeir();
  buildCanals();
  buildKlTransition();
  buildPlots();
  buildLocal();
  buildLake();
  buildGates();
  buildSensors();
  buildRoads();
  buildVillages();
  buildFields();
  buildTrees();
  buildBackdrop();
  flushStatic();
  buildRain();
  S.selRing = new THREE.Mesh(new THREE.RingGeometry(1.72, 1.95, 48), new THREE.MeshBasicMaterial({ color: 0x19c3d0, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  S.selRing.rotation.x = -Math.PI / 2; S.selRing.position.y = 0.6; S.selRing.renderOrder = 5; S.scene.add(S.selRing); S.selScale = 1;
  buildLabels();
}

function resize() {
  if (!S.renderer) return;
  const w = S.host.clientWidth, h = S.host.clientHeight; if (!w || !h) return;
  S.w = w; S.h = h; S.renderer.setSize(w, h); S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
}

/* ---------- camera ---------- */
let tween: { k: number; p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3 } | null = null;
function moveCam(pos: THREE.Vector3, tgt: THREE.Vector3, instant?: boolean) {
  if (instant || reduceMotion) { S.camera.position.copy(pos); S.controls.target.copy(tgt); S.controls.update(); tween = null; return; }
  tween = { k: 0, p0: S.camera.position.clone(), t0: S.controls.target.clone(), p1: pos, t1: tgt };
}
function flyTo(name: string, instant?: boolean) {
  if (!S.ready) return;
  const v = VIEWS[name]; if (!v) return;
  const f = S.camera.aspect < 1 ? Math.min(1.9, 1.05 / S.camera.aspect) : 1;
  const tgt = new THREE.Vector3(...v.tgt), pos = new THREE.Vector3(...v.off).multiplyScalar(f).add(tgt);
  moveCam(pos, tgt, instant);
}
function focusOn(sel: Sel) {
  if (!S.ready) return;
  const p = selPos(sel); if (!p) return;
  const [x, z, r] = p, tgt = new THREE.Vector3(x, 0, z);
  const off = S.camera.position.clone().sub(S.controls.target).normalize().multiplyScalar(16 + r * 7);
  if (off.y < 8) off.y = 8;
  moveCam(tgt.clone().add(off), tgt);
}

/* ---------- frame loop ---------- */
let lastT = performance.now(), clockT = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (document.hidden || !S.host.offsetParent || S.paused) return;
  clockT += dt;
  const mv = reduceMotion ? 0.25 : 1;
  for (const k in S.canal) { const c = S.canal[k]; c.tex.offset.y -= c.speed * dt * mv; c.mesh.position.y += (c.level - c.mesh.position.y) * Math.min(1, dt * 2); }
  S.mouths.forEach(o => { const c = S.canal[o.p]; if (c) o.m.position.y = c.mesh.position.y; });
  if (S.klTrans) { const c = S.canal[ROOT]; S.klTrans(c.mesh.position.y, c.mat.color); }
  if (S.riverUp && S.pondY != null) S.riverUp.position.y += (S.pondY - S.riverUp.position.y) * Math.min(1, dt * 1.5);
  if (S.intakeFlow) {
    const f = S.intakeFlow; f.g.position.y = S.riverUp.position.y; f.tex.offset.y = (f.tex.offset.y - f.speed * dt * mv) % 1;
    // the passages are open to the pond up to the leaf, a hair under the river surface where the two meet
    const wl = LV.pond + S.riverUp.position.y;
    f.pass.forEach(m => { m.position.y = wl - 0.003; }); f.pf.forEach(m => { m.position.y = wl + 0.002; });
  }
  S.tex.wn.offset.y -= dt * 0.05 * mv; S.tex.wn.offset.x += dt * 0.02 * mv;
  // offtake chutes: texture v falls down the chute, so a growing offset carries the flow pattern downhill
  if (S.tex.chute) S.tex.chute.offset.y = (S.tex.chute.offset.y + dt * 1.1 * mv) % 1;
  // offtake box, basin, quarter ditch and inlets run the same way; the rings at the inlets spread into the paddy
  if (S.tex.offFlow) S.tex.offFlow.offset.y = (S.tex.offFlow.offset.y + dt * 0.45 * mv) % 1;
  if (S.tex.ring) S.tex.ring.offset.y = (S.tex.ring.offset.y - dt * 0.22 * mv) % 1;
  // at the offtake intakes the rings run the other way, into the mouth, on the canal surface
  if (S.tex.ringIn) S.tex.ringIn.offset.y = (S.tex.ringIn.offset.y + dt * 0.3 * mv) % 1;
  S.offInflow?.forEach(o => { const c = S.canal[o.i]; if (c) o.g.position.y = c.mesh.position.y; });
  S.lakeTick?.();
  // white water under the canal gates: on the canal surface, as strong as the opening and the flow allow
  if (S.tex.gateFoam) S.tex.gateFoam.offset.y = (S.tex.gateFoam.offset.y - dt * 0.5 * mv) % 1;
  S.gateFlow.forEach(f => {
    const c = S.canal[f.i], g = S.gates[f.id]; if (!c || !g) return;
    f.mat.opacity = Math.min(0.75, g.cur * 2.2) * Math.min(1, Math.max(0, (c.speed - 0.08) / 1.2));
    f.m.visible = f.mat.opacity > 0.01; f.m.position.y = c.mesh.position.y + 0.005;
  });
  for (const id in S.gates) { const g = S.gates[id]; g.cur += (g.target - g.cur) * Math.min(1, dt * 2.5); g.parts.forEach(p => { p.m.position.y = p.y0 + p.lift * g.cur; }); }
  S.weir.forEach(g => {
    g.cur += (g.target - g.cur) * Math.min(1, dt * 1.2); g.leaf.position.y = g.base + g.cur * g.lift;
    if (g.cab) { const top = g.leaf.position.y + (g.hh || 0.36), len = Math.max(0.05, 1.95 - top); g.cab.forEach(c => { c.scale.y = len; c.position.y = top + len / 2; }); }
  });
  tickWeirSheets(dt, mv);
  for (const id in S.sensors) { const m = S.sensors[id]; if (m.alarm) { const p = (clockT * 0.8 + m.x * 0.01) % 1; m.ring.scale.setScalar(1 + p * 2.2); m.ring.material.opacity = 0.7 * (1 - p); } else m.ring.material.opacity = 0; }
  const sp = 1 + 0.08 * Math.sin(clockT * 3.2); S.selRing.scale.set(S.selScale * sp, S.selScale * sp, 1);
  const tgt = S.controls.target;
  tickWeather(dt, clockT);
  if (tween) {
    tween.k = Math.min(1, tween.k + dt / 0.9);
    const e = tween.k < 0.5 ? 2 * tween.k * tween.k : 1 - Math.pow(-2 * tween.k + 2, 2) / 2;
    S.camera.position.lerpVectors(tween.p0, tween.p1, e); S.controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.k >= 1) tween = null;
  }
  S.controls.update();
  const dist = S.camera.position.distanceTo(tgt), size = clamp(dist * 0.75, 22, 300);
  // rice tufts only up close: from afar they would shimmer and cost fill for nothing
  if (S.plotShells && S.plotShells[0].visible !== dist < 40) S.plotShells.forEach(m => { m.visible = dist < 40; });
  S.sun.position.copy(tgt).addScaledVector(S.sunDir, 450); S.sun.target.position.copy(tgt); S.sun.target.updateMatrixWorld();
  if (Math.abs(size - (S.shSize || 0)) > (S.shSize || 1) * 0.08) { const c = S.sun.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.updateProjectionMatrix(); S.shSize = size; }
  const nn = clamp(dist * 0.006, 0.2, 3);
  if (Math.abs(nn - S.camera.near) / S.camera.near > 0.2) { S.camera.near = nn; S.camera.updateProjectionMatrix(); }
  S.sky.position.copy(S.camera.position);
  S.renderer.render(S.scene, S.camera);
  placeLabels();
}

const api: TwinScene = {
  update({ view, open, snap, sel, layers }) {
    if (!S.ready) return;
    S.layers = layers; S.cells.visible = layers.cells;
    syncScene(view, open, snap, sel);
    updateTags(snap, open);
    markSelection(sel);
  },
  flyTo,
  focusOn,
  setPaused(p) { S.paused = p; },
};

/**
 * Pasang adegan di `host`. Pemanggilan berikutnya (StrictMode, pindah tab) memakai adegan yang sama dan hanya
 * memindahkan kanvasnya. Mengembalikan pesan galat bila WebGL tidak tersedia.
 */
export function mountTwinScene({ host, labelHost, callbacks }: MountOptions): TwinScene | string {
  S.cb = callbacks;
  if (S.ready) {
    if (S.host !== host) { host.insertBefore(S.renderer.domElement, host.firstChild); S.host = host; new ResizeObserver(resize).observe(host); }
    if (S.labelHost !== labelHost) { S.labels.forEach(L => labelHost.appendChild(L.el)); S.labelHost = labelHost; }
    resize();
    return api;
  }
  S.host = host; S.labelHost = labelHost;
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); } catch { return 'Browser ini tidak mendukung WebGL.'; }
  if (!renderer.getContext()) return 'Browser ini tidak mendukung WebGL.';
  S.renderer = renderer;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.insertBefore(renderer.domElement, host.firstChild);
  layout3d();
  const scene = S.scene = new THREE.Scene();
  S.camera = new THREE.PerspectiveCamera(38, 1, 0.3, 5200);
  const controls = S.controls = new OrbitControls(S.camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.46; controls.minDistance = 4; controls.maxDistance = 560;
  controls.screenSpacePanning = false;
  S.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.25 * LIGHT); scene.add(S.hemi);
  const sun = S.sun = new THREE.DirectionalLight(0xffffff, 1.6 * LIGHT);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 1000;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog(0xd6e3ea, 340, 2000);
  makeGeos(); makeTextures(); makeMaterials(); makeSky();
  buildWorld();
  const cx = T3.maxX / 2, span = Math.max(T3.maxX, T3.maxZ), zw = T3.weirZ, rx = riverX(zw);
  const mid = lineMid(byName('SS Lewo')) || [cx, T3.maxZ / 2];
  const bcp = T3.lines[ROOT], sb = T3.lines[byName('Inlet Situ Bagendit')];
  VIEWS.overview = { tgt: [cx, 0, T3.mainBottom / 2 + 10], off: [-span * 0.28, span * 0.4, span * 0.56] };
  VIEWS.bendung = { tgt: [rx + 3.5, 0, zw + 0.5], off: [13, 9.5, 17] };
  VIEWS.bagi = { tgt: [bcp.ex - 6, 0, bcp.z + 1], off: [10, 12, 17] };
  VIEWS.hilir = { tgt: [mid[0] + 10, 0, mid[1]], off: [14, 22, 28] };
  VIEWS.situ = sb ? { tgt: [sb.ex + 3, 0, sb.z], off: [9, 11, 15] } : VIEWS.bagi;
  // tampilan awal: dari hulu sisi barat, menghadap bendung, intake, kantong lumpur, dan AWLR Cimanuk
  VIEWS.awal = { tgt: [rx - 1.8, 0, zw - 7.31], off: [-10.18, 20.03, -27.04] };
  applySceneTheme();
  S.ready = true;
  resize();
  flyTo('awal', true);
  new ResizeObserver(resize).observe(host);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applySceneTheme);
  new MutationObserver(applySceneTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down: [number, number] | null = null, lastHover = 0;
  const pickAt = (px: number, py: number): Sel | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, S.camera);
    const hit = ray.intersectObjects(S.pickables.filter(o => o.visible && (!o.userData.plots || S.cells.visible)), false).find(h => h.object.userData.sel || h.object.userData.plots);
    if (!hit) return null;
    if (hit.object.userData.plots) return { kind: 'ruas', id: R[S.plotOf[hit.instanceId!]].k };
    return hit.object.userData.sel as Sel;
  };
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => { if (!down) return; const mv = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null; if (mv > 6) return; const sel = pickAt(e.clientX, e.clientY); if (sel) { S.cb.onSelect(sel); if (sel.kind === 'gate') S.cb.onOpenGate(sel.id); } });
  renderer.domElement.addEventListener('pointermove', e => { const now = performance.now(); if (now - lastHover < 90 || e.buttons) return; lastHover = now; S.host.classList.toggle('pointer', !!pickAt(e.clientX, e.clientY)); });
  requestAnimationFrame(frame);
  return api;
}

/** Adegan utama siap (tekstur bersama dipakai model pintu 3D). */
export const sceneReady = () => S.ready;
