import * as THREE from 'three';
import { clamp, lerp, reduceMotion } from '../lib/format';
import { jitter, rnd } from '../lib/random';
import { C, LIGHT, LV, S, T3, WEIR_HW, riverHW, riverX, waterLevel } from './context';

/**
 * Permukaan Sungai Cimanuk dan cuaca.
 *
 * Riak sungai mengikuti debit: saat kemarau tenang seperti kaca, lambat, dan agak jernih; debit normal beriak
 * sedang; saat banjir berombak kasar dengan pusaran, mengalir deras, dan keruh kecokelatan. Hujan digambar sebagai
 * garis jatuh yang miring tertiup angin, makin rapat dan panjang saat lebat, dan tiap tetes memercik lingkaran di
 * muka sungai. Hujan badai menggelapkan langit, merapatkan kabut, dan sesekali disertai kilat.
 */

interface Rip { speed: number; amp: number; amp2: number; rough: number; dry: number; flood: number }
const rip: Rip = { speed: 0.6, amp: 0.32, amp2: 0.45, rough: 0.12, dry: 0, flood: 0 };
const ripT: Rip = { ...rip };
// Pattern scales stay fixed. The texture coordinate is uv * scale + scroll, and the river uv runs to hundreds of
// units along the reach, so easing a scale (flood to normal) slid the pattern far faster than the stream and made
// the ripples run upstream. Flood swells are a second, broader sample crossfaded in instead.
// Fine layer scale 2.5 keeps that layer seamless when the main scroll wraps by 2.
const FINE = 2.5, SWELL = 0.5;
// fine ripple layer: [scale, offset u, offset v, strength]
const ripU = { value: new THREE.Vector4(FINE, 0, 0, 0.45) };
// flood swell layer: [weight, offset u, offset v]
const ripF = { value: new THREE.Vector3(0, 0, 0) };
let rainT = 0, rainL = 0, flash = 0, nextFlash = 6;

/**
 * Two layers of the wave normal map on the river: the main layer scrolls with the stream, a finer one drifts slower
 * and slightly across it, so the surface reads as moving ripples instead of one sliding pattern. In a flood the main
 * layer fades into a twice-as-broad swell moving twice as fast.
 */
export function patchRiverMaterial(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uRip = ripU; sh.uniforms.uRipF = ripF;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uRip;\nuniform vec3 uRipF;').replace('#include <normal_fragment_maps>', `
#ifdef USE_NORMALMAP_TANGENTSPACE
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	vec3 mapF = texture2D( normalMap, vNormalMapUv * ${SWELL.toFixed(2)} + uRipF.yz ).xyz * 2.0 - 1.0;
	vec3 mapN2 = texture2D( normalMap, vNormalMapUv * uRip.x + uRip.yz ).xyz * 2.0 - 1.0;
	mapN.xy = ( mix( mapN.xy, mapF.xy, uRipF.x ) + mapN2.xy * uRip.w ) * normalScale;
	normal = normalize( tbn * mapN );
#else
	#include <normal_fragment_maps>
#endif`);
  };
}

/** Sasaran riak dari debit Cimanuk (m³/s) dan tingkat hujan (0–1); nilai tampil menyusul pelan-pelan. */
export function setRiverFlow(Q: number, rain: number) {
  const qn = clamp(Math.log(Math.max(Q, 1) / 2) / Math.log(75), 0, 1), flood = clamp((Q - 40) / 70, 0, 1);
  ripT.speed = 0.2 + 0.9 * qn + 3.3 * flood;
  ripT.amp = 0.1 + 0.45 * qn + 0.15 * flood + 0.12 * rain;
  ripT.amp2 = 0.25 + 0.4 * qn + 0.15 * flood + 0.2 * rain;
  // muddy flood water is rough and dull, so the waves read as broad swells instead of sharp glints
  ripT.rough = 0.05 + 0.1 * qn + 0.42 * flood + 0.05 * rain;
  ripT.dry = clamp((8 - Q) / 6, 0, 1); ripT.flood = flood;
  rainT = rain;
}

/* ---------- rain streaks and splashes ---------- */
const RN = 12000, BASE = 2600, SN = 320, SPLASH_LIFE = 0.55;
let rain: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>, drops: Float32Array;
let splash: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
const COL = { normal: C(0x6c6749), dry: C(0x5b6a57), flood: C(0x86623e) };
const sp = new Float32Array(SN * 4), m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), c0 = new THREE.Color();

export function buildRain() {
  drops = new Float32Array(RN * 3);
  // the first drops draw from the shared random stream exactly as the old point rain did, so the simulation noise
  // after the scene build stays the same; the extra drops use a local generator
  for (let k = 0; k < BASE; k++) { drops[k * 3] = jitter(70); drops[k * 3 + 1] = rnd() * 40; drops[k * 3 + 2] = jitter(70); }
  let s = 0x2545f491;
  const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let k = BASE; k < RN; k++) { drops[k * 3] = (r() * 2 - 1) * 70; drops[k * 3 + 1] = r() * 40; drops[k * 3 + 2] = (r() * 2 - 1) * 70; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RN * 6), 3).setUsage(THREE.DynamicDrawUsage)); g.setDrawRange(0, 0);
  rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xdde6ec, transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 5; S.scene.add(rain);
  const rg = new THREE.RingGeometry(0.72, 1, 24); rg.rotateX(-Math.PI / 2);
  splash = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), SN);
  splash.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SN * 3), 3);
  for (let i = 0; i < SN; i++) { sp[i * 4 + 3] = -Math.random() * SPLASH_LIFE; m4.makeScale(0, 0, 0); splash.setMatrixAt(i, m4); }
  // drawn after the river surface, which would otherwise paint over the rings
  splash.frustumCulled = false; splash.visible = false; splash.renderOrder = 4; S.scene.add(splash);
}

// a splash spot on the open water near the view: upstream pond or downstream reach, never on the weir itself
function placeSplash(i: number, cz: number, R: number) {
  const zw = T3.weirZ;
  let z = cz + (Math.random() * 2 - 1) * R;
  if (z > zw - 0.3 && z < zw + 0.9) z += 1.5;
  const hw = z > T3.zA && z < T3.zB ? WEIR_HW : riverHW(z);
  sp[i * 4] = riverX(z) + (Math.random() * 2 - 1) * hw * 0.92; sp[i * 4 + 1] = z;
  sp[i * 4 + 2] = (z < zw ? waterLevel(z) + S.riverUp.position.y : LV.down) + 0.012;
  sp[i * 4 + 3] = -Math.random() * 0.25;
}

/* ---------- sky, fog and light under rain ---------- */
const base = { fog: new THREE.Color(), top: new THREE.Color(), hor: new THREE.Color(), bot: new THREE.Color(), sun: new THREE.Color(), glow: 0 };
let storm = { grey: new THREE.Color(), dark: false };
/** Simpan warna langit dan kabut tema sekarang sebagai dasar sebelum digelapkan hujan. */
export function setWeatherTheme(dark: boolean) {
  const u = S.sky.material.uniforms;
  base.fog.copy((S.scene.fog as THREE.Fog).color); base.top.copy(u.top.value); base.hor.copy(u.hor.value); base.bot.copy(u.bot.value); base.sun.copy(u.sunCol.value); base.glow = u.glow.value;
  storm = { grey: C(dark ? 0x2f3441 : 0x8d979f), dark };
  if (rain) rain.material.color.setHex(dark ? 0xb4c3dc : 0xdde6ec);
}

export function tickWeather(dt: number, t: number) {
  const mv = reduceMotion ? 0.25 : 1, e = Math.min(1, dt * 0.8), M = S.M;
  (Object.keys(rip) as (keyof Rip)[]).forEach(k => { rip[k] += (ripT[k] - rip[k]) * e; });
  // river surface
  const tex = S.tex.wnRiver;
  // wrapping by 2 is seamless for all three layers (scales 1, 0.5 and 2.5) and keeps the offsets small for the GPU
  tex.offset.y = (tex.offset.y - rip.speed * dt * 0.12 * mv) % 2;
  tex.offset.x = Math.sin(t * 0.23) * 0.03 * (0.2 + rip.flood);
  ripF.value.set(rip.flood, tex.offset.x * (1 - SWELL), tex.offset.y * (1 - SWELL));
  ripU.value.w = rip.amp2;
  ripU.value.y = (ripU.value.y + dt * 0.012 * (1 + 3 * rip.flood) * mv) % 1;
  ripU.value.z = (ripU.value.z + 0.55 * FINE * rip.speed * 0.12 * dt * mv) % 1;
  M.river.normalScale.set(rip.amp, rip.amp); M.river.roughness = rip.rough;
  M.river.color.copy(COL.normal).lerp(COL.dry, rip.dry).lerp(COL.flood, rip.flood);
  M.river.opacity = 0.96 - 0.07 * rip.dry + 0.03 * rip.flood; M.river.envMapIntensity = 0.75 - 0.35 * rip.flood;
  S.tex.foam.offset.y -= dt * (0.35 + 0.28 * rip.speed) * mv; S.foamMat2.map!.offset.y -= dt * (0.15 + 0.12 * rip.speed) * mv;

  // rain
  rainL += (rainT - rainL) * Math.min(1, dt * 0.7);
  const rl = rainL, on = rl > 0.02, tgt = S.controls.target, dist = S.camera.position.distanceTo(tgt);
  rain.visible = on; splash.visible = on;
  if (on) {
    const k = clamp(dist / 55, 0.4, 2.2), n = Math.round(RN * clamp(0.08 + rl * 0.92, 0, 1)), fall = reduceMotion ? 0 : (24 + 22 * rl) * dt;
    const L = 0.45 + 1.6 * rl, wx = 0.32 * rl, wz = 0.12 * rl, p = rain.geometry.attributes.position.array as Float32Array;
    rain.position.set(tgt.x, 0, tgt.z); rain.scale.setScalar(k);
    for (let i = 0; i < n; i++) {
      let y = drops[i * 3 + 1] - fall; if (y < 0) y += 40; drops[i * 3 + 1] = y;
      // drops blow downwind as they fall: the lower the drop, the further it has drifted
      const x = drops[i * 3] - wx * y, z = drops[i * 3 + 2] - wz * y, o = i * 6;
      p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = x - wx * L; p[o + 4] = y + L; p[o + 5] = z - wz * L;
    }
    rain.geometry.setDrawRange(0, n * 2); rain.geometry.attributes.position.needsUpdate = true;
    // from far away the streaks thin out, so the whole irrigation area stays readable under a storm
    rain.material.opacity = (0.2 + 0.55 * rl) * clamp(1.25 - dist / 260, 0.3, 1);
    // splash rings on the river, more of them in heavier rain
    const active = Math.round(SN * clamp(rl * 1.2, 0, 1)), R = clamp(dist * 0.55, 8, 70);
    for (let i = 0; i < SN; i++) {
      if (i >= active) { m4.makeScale(0, 0, 0); splash.setMatrixAt(i, m4); continue; }
      sp[i * 4 + 3] += reduceMotion ? 0 : dt;
      if (sp[i * 4 + 3] > SPLASH_LIFE) placeSplash(i, tgt.z, R);
      const a = sp[i * 4 + 3];
      if (a < 0) { m4.makeScale(0, 0, 0); splash.setMatrixAt(i, m4); continue; }
      const f = a / SPLASH_LIFE, rad = (0.05 + 0.3 * f) * clamp(dist / 40, 1, 3);
      m4.compose(v0.set(sp[i * 4], sp[i * 4 + 2], sp[i * 4 + 1]), q0, v1.set(rad, 1, rad)); splash.setMatrixAt(i, m4);
      const b = Math.pow(1 - f, 1.3) * (storm.dark ? 0.55 : 0.8); splash.setColorAt(i, c0.setRGB(b, b, b));
    }
    splash.instanceMatrix.needsUpdate = true; splash.instanceColor!.needsUpdate = true;
  }

  // storm: grey sky, closer fog, dimmer sun, and now and then a lightning flash in the heaviest rain
  const st = clamp((rl - 0.15) / 0.85, 0, 1), u = S.sky.material.uniforms, fog = S.scene.fog as THREE.Fog;
  fog.near = lerp(340, 90, st); fog.far = lerp(2000, 650, st); fog.color.copy(base.fog).lerp(storm.grey, 0.55 * st);
  u.top.value.copy(base.top).lerp(storm.grey, 0.6 * st); u.hor.value.copy(base.hor).lerp(storm.grey, 0.5 * st); u.bot.value.copy(base.bot).lerp(storm.grey, 0.4 * st);
  u.sunCol.value.copy(base.sun).multiplyScalar(1 - 0.8 * st); u.glow.value = base.glow * (1 - 0.8 * st);
  if (!reduceMotion && st > 0.6) { nextFlash -= dt; if (nextFlash < 0) { flash = 1; nextFlash = 7 + Math.random() * 12; } }
  flash = flash > 0.01 ? flash * Math.exp(-dt * 7) : 0;
  const flick = flash > 0 ? flash * (0.65 + 0.35 * Math.sin(t * 90)) : 0;
  S.hemi.intensity = ((S.hemiI || 0.25) * (1 - rl * 0.3) + flick * 1.8) * LIGHT;
  S.sun.intensity = (S.sunI || 1.6) * (1 - rl * 0.5) * LIGHT;
  if (flick) u.hor.value.lerp(c0.setRGB(0.9, 0.92, 1), flick * 0.5);
}
