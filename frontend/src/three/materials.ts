import * as THREE from 'three';
import { C, S } from './context';
import { patchRiverMaterial } from './weather';

/** Bahan adegan. Warna kompleks intake dan bendung mengikuti peta SimHidro: dinding biru, atap dan pagar kuning. */
export function makeMaterials() {
  const T = S.tex, M = S.M, std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const wuv = (m: THREE.MeshStandardMaterial, s: number) => { m.userData.worldUV = s; return m; };
  M.concrete = wuv(std({ color: C(0xc4c0b5), map: T.concrete, roughness: 0.92 }), 2.5);
  M.concreteDark = wuv(std({ color: C(0x8c877b), map: T.concrete, roughness: 0.95 }), 2.5);
  M.paint = wuv(std({ color: C(0xf0ece2), map: T.concrete, roughness: 0.85 }), 4);
  M.steel = std({ color: C(0x3a5d77), metalness: 0.45, roughness: 0.42 });
  M.galv = std({ color: C(0xa5adb0), metalness: 0.75, roughness: 0.35 });
  M.dark = std({ color: C(0x2c3236), roughness: 0.6, metalness: 0.3 });
  M.yellow = std({ color: C(0xe3a824), roughness: 0.45, metalness: 0.2 });
  M.red = std({ color: C(0xc62828), roughness: 0.6 });
  M.white = std({ color: C(0xf2f2ee), roughness: 0.6 });
  M.rail = std({ color: C(0x2c5f94), roughness: 0.5, metalness: 0.3 });
  M.blueRoof = std({ color: C(0x3b6b8f), roughness: 0.45, metalness: 0.5 });
  M.greenRoof = std({ color: C(0x2f5a49), roughness: 0.45, metalness: 0.5 });
  M.tileRoof = std({ color: C(0xa4532f), map: T.roof, roughness: 0.8 });
  M.panel = std({ color: C(0xd9dddc), roughness: 0.55, metalness: 0.15 });
  M.solar = std({ color: C(0x1b2c47), roughness: 0.18, metalness: 0.7 });
  M.gauge = std({ map: T.gauge, roughness: 0.6 });
  M.fence = std({ map: T.fence, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }); M.fence.userData.noShadow = true;
  M.rack = std({ map: T.rack, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }); M.rack.userData.noShadow = true;
  M.rock = wuv(std({ color: C(0x6f695d), map: T.concrete, roughness: 1, flatShading: true }), 1.5);
  M.asphalt = std({ color: C(0xffffff), map: T.asphalt, roughness: 0.9 });
  M.lane = std({ color: C(0xffffff), map: T.lane, roughness: 0.95 });
  M.mud = std({ color: C(0x756a52), map: T.noise, roughness: 1 });
  M.embank = std({ vertexColors: true, map: T.noise, roughness: 0.95 });
  M.ground = std({ vertexColors: true, map: T.noise, roughness: 0.97 });
  M.trunk = std({ color: C(0x6b5440), roughness: 0.95 });
  M.leaf = std({ color: 0xffffff, roughness: 0.85 });
  M.palmLeaf = std({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  M.wall = std({ color: 0xffffff, map: T.wall, emissiveMap: T.wallLit, emissive: C(0xffc070), emissiveIntensity: 0, roughness: 0.9 });
  M.roofInst = std({ color: 0xffffff, map: T.roof, roughness: 0.8 });
  M.office = std({ color: 0xffffff, map: T.office, emissiveMap: T.officeLit, emissive: C(0xffc070), emissiveIntensity: 0, roughness: 0.85 });
  M.lamp = std({ color: C(0xfff4d6), emissive: C(0xffd58a), emissiveIntensity: 0, roughness: 0.4 });
  M.plot = std({ color: 0xffffff, map: T.rice, roughness: 0.85, metalness: 0, envMapIntensity: 0.45 });
  // at dusk the plots keep a faint glow of their own colour so the Faktor K stays readable
  S.plotNight = { value: 0 };
  M.plot.onBeforeCompile = sh => { sh.uniforms.uNight = S.plotNight; sh.fragmentShader = 'uniform float uNight;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uNight * 0.28;'); };
  M.bund = std({ color: C(0x7f8748), map: T.noise, roughness: 1 });
  M.foam = std({ color: 0xffffff, map: T.foam, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.9 });
  M.jet = std({ color: 0xffffff, map: T.foam, transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.6 });
  M.river = std({ color: C(0x6c6749), roughness: 0.12, metalness: 0.05, normalMap: T.wnRiver, normalScale: new THREE.Vector2(0.32, 0.32), envMapIntensity: 0.75, transparent: true, opacity: 0.96 });
  patchRiverMaterial(M.river);
  M.lake = std({ color: C(0x46685f), roughness: 0.06, metalness: 0.05, normalMap: T.wn, normalScale: new THREE.Vector2(0.3, 0.3), transparent: true, opacity: 0.95 });
  M.pond = wuv(std({ color: C(0x55724c), roughness: 0.1, normalMap: T.wn, normalScale: new THREE.Vector2(0.25, 0.25) }), 3);
  M.klWater = std({ color: C(0x7d7a57), roughness: 0.12, normalMap: T.wn, normalScale: new THREE.Vector2(0.3, 0.3), transparent: true, opacity: 0.96 });
  M.ditch = std({ color: C(0x4f7570), roughness: 0.15, normalMap: T.wn, normalScale: new THREE.Vector2(0.2, 0.2) });
  M.glass = std({ color: C(0x25313a), roughness: 0.15, metalness: 0.4 });
  // intake complex, coloured like the SimHidro map: blue walls, yellow roof and railings, light-blue gate portals
  M.intakeWall = wuv(std({ color: C(0x2f66a8), map: T.concrete, roughness: 0.78 }), 4);
  M.roofY = wuv(std({ color: C(0xf0b62b), map: T.concrete, roughness: 0.6 }), 4);
  M.railY = std({ color: C(0xf2c230), roughness: 0.45, metalness: 0.25 });
  M.gateBlue = std({ color: C(0x62a6d8), roughness: 0.42, metalness: 0.35 });
  M.winLit = std({ color: C(0x22303b), emissive: C(0xffc475), emissiveIntensity: 0, roughness: 0.15, metalness: 0.4 });
  M.riprap = std({ map: T.riprap, bumpMap: T.riprapH, bumpScale: 0.03, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  S.pickMat = new THREE.MeshBasicMaterial({ visible: false });
  S.carMats = [0xf2f2f0, 0xb9bdc0, 0xa3252a, 0x2f3b4a, 0x4a4f53].map(h => std({ color: C(h), metalness: 0.5, roughness: 0.35 }));
}

const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FS = `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunCol; uniform vec3 sunDir; uniform float glow; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0.0 ? mix(hor, top, pow(min(h * 1.35, 1.0), 0.6)) : mix(hor, bot, min(-h * 5.0, 1.0));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * glow * 0.55 + pow(s, 3.0) * glow * 0.18 * (1.0 - clamp(h * 3.0, 0.0, 1.0)));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;
function skyMat() {
  return new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: 0 } } });
}
/** Langit gradasi dan adegan kecil untuk peta lingkungan (pantulan air dan logam). */
export function makeSky() {
  S.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat()); S.sky.frustumCulled = false; S.sky.renderOrder = -1; S.scene.add(S.sky);
  S.envScene = new THREE.Scene(); S.envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat()); S.envScene.add(S.envSky);
  S.envGround = new THREE.Mesh(new THREE.CircleGeometry(49, 32), new THREE.MeshBasicMaterial({ color: 0x556040, toneMapped: false })); S.envGround.rotation.x = -Math.PI / 2; S.envGround.position.y = -3; S.envScene.add(S.envGround);
  S.pmrem = new THREE.PMREMGenerator(S.renderer); S.env = {};
}
