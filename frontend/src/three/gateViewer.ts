import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clamp } from '../lib/format';
import type { GateLevels } from '../domain/gateSpec';
import type { Gate } from '../domain/types';
import { LIGHT, S, isDark } from './context';
import { geoCache } from './geometry';
import { buildGateModel, gmSetWater, type GateRefs } from './gateModel';

/** Penampil 3D di jendela detail pintu: satu renderer, model dibangun ulang tiap kali pintu lain dibuka. */
export interface GateViewer {
  show(G: Gate): GateRefs;
  /** Bukaan yang diterapkan (%), muka air untuk bukaan itu, dan bukaan pratinjau (daun bayangan). */
  setState(target: number, lv: GateLevels, draft: number | null): void;
  start(): void;
  stop(): void;
}

export function createGateViewer(host: HTMLElement): GateViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.insertBefore(renderer.domElement, host.firstChild);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 2; controls.maxDistance = 40;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888866, 0.75 * LIGHT); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.85 * LIGHT); sun.position.set(-6, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 }); sun.shadow.bias = -0.0008; scene.add(sun);
  const theme = () => { const n = isDark(); hemi.intensity = (n ? 0.55 : 0.75) * LIGHT; scene.background = new THREE.Color(n ? 0x0d1b38 : 0xdfe7f2); };
  theme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', theme);
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const resize = () => { const w = host.clientWidth, hh = host.clientHeight; if (!w || !hh) return; renderer.setSize(w, hh); camera.aspect = w / hh; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(host);

  // pegangan debug saat pengembangan: window.__gateView.camera / .controls
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gateView = { camera, controls };
  let refs: GateRefs | null = null, running = false, last = performance.now();
  const frame = (now: number) => {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!refs || !refs.lv) return;
    const prev = refs.cur;
    refs.cur += (refs.target - refs.cur) * Math.min(1, dt * 2);
    const a = refs.cur / 100 * refs.spec.maxLift, spin = (refs.cur - prev) * 0.9, r = refs;
    r.leaves.forEach(l => { l.g.position.y = a; l.ghost.visible = r.draft != null; if (r.draft != null) l.ghost.position.y = r.draft / 100 * r.spec.maxLift + r.spec.leafH / 2; });
    r.rods.forEach(o => { o.m.position.y = a + r.spec.leafH + o.L / 2; });
    r.wheels.forEach(w => { w.rotation.z += spin; });
    gmSetWater(r, { ...r.lv!, a });
    const flow = clamp(a * 4, 0.05, 1.5);
    r.wU.material.map!.offset.y -= dt * 0.15 * flow; r.wD.material.map!.offset.y -= dt * 0.45 * flow; S.tex.foam.offset.y -= dt * 0.6;
    controls.update();
    renderer.render(scene, camera);
  };

  return {
    show(G) {
      if (refs) { scene.remove(refs.root); const cached = Object.values(geoCache); refs.root.traverse(o => { const g = (o as THREE.Mesh).geometry; if (g && !cached.includes(g)) g.dispose(); }); }
      refs = buildGateModel(G); scene.add(refs.root);
      const sp = refs.spec, far = Math.max(9.5, refs.bt * 2.1 + 7.5, (refs.Hp + 2.2) * 1.9), ty = (refs.Hp + (sp.motor ? 2.2 : 0.8)) * 0.5;
      controls.maxDistance = Math.max(40, far * 1.6);
      const sh = Math.max(9, refs.bt * 0.9 + 3); Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh, far: Math.max(40, sh * 4) }); sun.shadow.camera.updateProjectionMatrix();
      sun.position.set(-6, 10, 7).multiplyScalar(Math.max(1, sh / 9));
      camera.position.set(far * 0.72, ty + far * 0.4, far * 0.95); controls.target.set(0, ty, 0.3); controls.update();
      resize();
      return refs;
    },
    setState(target, lv, draft) { if (!refs) return; refs.target = target; refs.lv = lv; refs.draft = draft; },
    start() { if (running) return; running = true; last = performance.now(); resize(); requestAnimationFrame(frame); },
    stop() { running = false; },
  };
}
