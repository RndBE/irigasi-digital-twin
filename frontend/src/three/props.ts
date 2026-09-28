import * as THREE from 'three';
import { S } from './context';
import { bld } from './geometry';
import { gY } from './terrain';

/** Tiang lampu; cahayanya menyala saat tema senja, `light` menambah sumber cahaya sungguhan. */
export function lampPost(x: number, y: number, z: number, ry: number, light: boolean) {
  const b = bld(x, y, z, ry), M = S.M;
  b.cyl(M.galv, 0.028, 0.04, 1.6, 6, 0, 0.8, 0); b.box(M.galv, 0.03, 0.03, 0.42, 0, 1.58, 0.2); b.box(M.lamp, 0.1, 0.05, 0.2, 0, 1.55, 0.4);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.tex.glow, color: 0xffd9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sp.position.copy(b.at(0, 1.5, 0.4)); sp.scale.set(1.5, 1.5, 1); sp.visible = false; S.scene.add(sp); S.glows.push(sp);
  if (light) { const l = new THREE.PointLight(0xffc98a, 0, 14, 2); l.position.copy(b.at(0, 1.45, 0.4)); S.scene.add(l); S.lampLights.push(l); }
}
export function car(x: number, z: number, ry: number, k: number) {
  const b = bld(x, gY(x, z), z, ry), M = S.M, mat = S.carMats[k % S.carMats.length];
  b.box(mat, 0.9, 0.2, 0.42, 0, 0.19, 0); b.box(M.glass, 0.5, 0.17, 0.38, -0.05, 0.37, 0);
  for (const [wx, wz] of [[-0.28, -0.2], [0.28, -0.2], [-0.28, 0.2], [0.28, 0.2]]) b.cyl(M.dark, 0.09, 0.09, 0.07, 10, wx, 0.09, wz, Math.PI / 2);
}
