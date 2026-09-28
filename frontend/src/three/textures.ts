import * as THREE from 'three';
import { lerp, smooth } from '../lib/format';
import { jitter, rnd } from '../lib/random';
import { S } from './context';

/** Tekstur prosedural dari kanvas: beton, sawah, genteng, dinding, riak air, batu kosong (riprap), aspal, awan. */
function tnoise(size: number, oct: [number, number][]) {
  const out = new Float32Array(size * size);
  oct.forEach(([cells, amp], k) => {
    const hh = (i: number, j: number) => { i = ((i % cells) + cells) % cells; j = ((j % cells) + cells) % cells; const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
    for (let y = 0; y < size; y++) {
      const fy = y / size * cells, j = Math.floor(fy), v = fy - j, sv = v * v * (3 - 2 * v);
      for (let x = 0; x < size; x++) {
        const fx = x / size * cells, i = Math.floor(fx), u = fx - i, su = u * u * (3 - 2 * u);
        const a = hh(i, j), b = hh(i + 1, j), c = hh(i, j + 1), d = hh(i + 1, j + 1);
        out[y * size + x] += amp * (a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv);
      }
    }
  });
  return out;
}
function finishTex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, S.renderer.capabilities.getMaxAnisotropy()); return t;
}
function texFrom(size: number, fn: (x: number, y: number, k: number) => number[], srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!, img = g.createImageData(size, size);
  for (let k = 0; k < size * size; k++) img.data.set(fn(k % size, Math.floor(k / size), k), k * 4);
  g.putImageData(img, 0, 0); return finishTex(c, srgb);
}
export function drawTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!, w, h); return finishTex(c, srgb); }
/** Papan nama biru-putih seperti papan bangunan irigasi. */
export function textTex(text: string, sub: string | null, w = 256, h = 72) {
  return drawTex(w, h, g => {
    g.fillStyle = '#f5f4ee'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1f4e79'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#1f3a5a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(h * (sub ? 0.36 : 0.44))}px "Plus Jakarta Sans", Arial, sans-serif`; g.fillText(text, w / 2, sub ? h * 0.38 : h / 2, w - 20);
    if (sub) { g.font = `500 ${Math.round(h * 0.22)}px "Plus Jakarta Sans", Arial, sans-serif`; g.fillText(sub, w / 2, h * 0.75, w - 20); }
  });
}

export function makeTextures() {
  const T = S.tex;
  const n1 = tnoise(256, [[8, 0.5], [32, 0.3], [128, 0.2]]);
  T.noise = texFrom(256, (_x, _y, k) => { const v = 188 + n1[k] * 62 + (rnd() - 0.5) * 28; return [v, v, v, 255]; });
  const n2 = tnoise(256, [[4, 0.45], [16, 0.35], [64, 0.2]]);
  T.concrete = texFrom(256, (x, y, k) => { let v = 196 + n2[k] * 50 + (rnd() - 0.5) * 16; if (y % 64 < 1 || x % 128 < 1) v -= 22; return [v, v * 0.99, v * 0.96, 255]; });
  T.rice = drawTex(256, 256, g => {
    g.fillStyle = '#b4b8aa'; g.fillRect(0, 0, 256, 256);
    for (let y = 3; y < 256; y += 6) for (let x = 2; x < 256; x += 5) { const l = 205 + rnd() * 50; g.fillStyle = `rgb(${l},${l},${l - 8})`; g.beginPath(); g.ellipse(x + jitter(0.7), y + jitter(0.7), 2.2, 2.7, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(200,196,170,.8)'; g.fillRect(0, 126, 256, 4);
  });
  T.roof = drawTex(128, 128, g => {
    for (let r = 0; r < 8; r++) {
      const gr = g.createLinearGradient(0, r * 16, 0, r * 16 + 16); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.78, '#dcdcdc'); gr.addColorStop(1, '#8a8a8a');
      g.fillStyle = gr; g.fillRect(0, r * 16, 128, 16);
      for (let c = 0; c < 9; c++) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(c * 16 + (r % 2) * 8, r * 16, 1.2, 16); }
    }
    for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.1})`; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
  });
  const wallDraw = (g: CanvasRenderingContext2D, W: number, Hh: number, lit: boolean, rows: number) => {
    g.fillStyle = lit ? '#000' : '#f3f0e8'; g.fillRect(0, 0, W, Hh);
    if (!lit) { for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(90,80,60,${rnd() * 0.06})`; g.fillRect(rnd() * W, rnd() * Hh, 3, 3); } g.fillStyle = '#9b968b'; g.fillRect(0, Hh * 0.86, W, Hh * 0.14); }
    const win = (x: number, y: number, w: number, h: number) => {
      if (lit) { g.fillStyle = '#ffd89a'; g.fillRect(x + 2, y + 2, w - 4, h - 4); return; }
      g.fillStyle = '#e4dfd3'; g.fillRect(x - 3, y - 3, w + 6, h + 6); g.fillStyle = '#2a3036'; g.fillRect(x, y, w, h);
      g.fillStyle = '#e4dfd3'; g.fillRect(x + w / 2 - 1.5, y, 3, h); g.fillRect(x, y + h * 0.34, w, 3);
    };
    if (rows === 1) {
      g.fillStyle = lit ? '#2a1c0c' : '#6b4a2e'; g.fillRect(W * 0.13, Hh * 0.3, W * 0.17, Hh * 0.56);
      win(W * 0.44, Hh * 0.33, W * 0.18, Hh * 0.28); win(W * 0.7, Hh * 0.33, W * 0.18, Hh * 0.28);
    } else {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { if (r === 1 && c === 1) continue; win(W * (0.07 + c * 0.235), Hh * (0.1 + r * 0.44), W * 0.15, Hh * 0.22); }
      g.fillStyle = lit ? '#3a2a14' : '#4f3b28'; g.fillRect(W * 0.3, Hh * 0.56, W * 0.16, Hh * 0.3);
    }
  };
  T.wall = drawTex(128, 128, (g, W, Hh) => wallDraw(g, W, Hh, false, 1));
  T.wallLit = drawTex(128, 128, (g, W, Hh) => wallDraw(g, W, Hh, true, 1));
  T.office = drawTex(256, 128, (g, W, Hh) => wallDraw(g, W, Hh, false, 2));
  T.officeLit = drawTex(256, 128, (g, W, Hh) => wallDraw(g, W, Hh, true, 2));
  T.wn = (() => {
    const Nn = 256, hgt = new Float32Array(Nn * Nn), waves: number[][] = [];
    for (let k = 0; k < 16; k++) waves.push([Math.round(jitter(7)) || 1, Math.round(jitter(7)) || 2, rnd() * 6.28, 0.5 + rnd()]);
    for (let y = 0; y < Nn; y++) for (let x = 0; x < Nn; x++) { let h = 0; waves.forEach(([a, b, p, amp]) => { h += amp / Math.hypot(a, b) * Math.sin(2 * Math.PI * (a * x + b * y) / Nn + p); }); hgt[y * Nn + x] = h; }
    return texFrom(Nn, (x, y) => {
      const hx = hgt[y * Nn + (x + 1) % Nn] - hgt[y * Nn + (x + Nn - 1) % Nn], hy = hgt[((y + 1) % Nn) * Nn + x] - hgt[((y + Nn - 1) % Nn) * Nn + x];
      const nx = -hx * 3.2, ny = -hy * 3.2, l = Math.hypot(nx, ny, 1);
      return [(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255];
    }, false);
  })();
  T.wnRiver = T.wn.clone(); T.wnRiver.needsUpdate = true;
  T.ripple = drawTex(128, 128, g => {
    g.fillStyle = '#eef6fa'; g.fillRect(0, 0, 128, 128); g.lineCap = 'round';
    for (let i = 0; i < 28; i++) {
      const x = rnd() * 118, y = 6 + rnd() * 116, w = 8 + rnd() * 14;
      g.strokeStyle = `rgba(255,255,255,${0.65 + rnd() * 0.35})`; g.lineWidth = 1.5 + rnd(); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 2.6, x + w, y); g.stroke();
      g.strokeStyle = 'rgba(120,170,200,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 2, y + 2.4); g.quadraticCurveTo(x + w / 2, y, x + w - 2, y + 2.4); g.stroke();
    }
  });
  T.streak = drawTex(64, 256, g => { g.fillStyle = '#c4cccc'; g.fillRect(0, 0, 64, 256); for (let i = 0; i < 42; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.45})`; g.fillRect(rnd() * 64, rnd() * 256, 1 + rnd() * 1.5, 12 + rnd() * 34); } });
  T.foam = drawTex(128, 128, g => { for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`; g.beginPath(); g.arc(rnd() * 128, rnd() * 128, 0.8 + rnd() * 3.8, 0, 7); g.fill(); } });
  T.gauge = drawTex(32, 256, g => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 32, 256); g.fillStyle = '#c62828'; for (let y = 0; y < 256; y += 32) { g.fillRect(0, y, 16, 16); g.fillRect(16, y + 16, 16, 16); } g.fillStyle = '#222'; for (let y = 0; y < 256; y += 8) g.fillRect(0, y, y % 32 ? 6 : 12, 1); });
  T.glow = drawTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(0.22, 'rgba(255,205,130,.5)'); gr.addColorStop(1, 'rgba(255,180,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  T.fence = drawTex(64, 32, g => { g.clearRect(0, 0, 64, 32); g.strokeStyle = '#c9ced1'; g.lineWidth = 1.5; for (let x = 0; x <= 64; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 32); g.stroke(); } for (let y = 2; y <= 32; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); } g.lineWidth = 3; g.strokeRect(1, 1, 62, 30); });
  T.rack = drawTex(64, 64, g => { g.clearRect(0, 0, 64, 64); g.fillStyle = '#7d878c'; for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 1.6, 64); g.fillRect(0, 0, 64, 3); g.fillRect(0, 30, 64, 2); g.fillRect(0, 61, 64, 3); });
  T.rack.repeat.set(10, 1);
  (() => {
    const Nn = 256, cells = 9, pts: number[][] = [], a1 = new Float32Array(Nn * Nn), gap = new Float32Array(Nn * Nn), id = new Int32Array(Nn * Nn);
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.15 + rnd() * 0.7) / cells * Nn, (j + 0.15 + rnd() * 0.7) / cells * Nn, 0.75 + rnd() * 0.5, rnd()]);
    for (let y = 0; y < Nn; y++) for (let x = 0; x < Nn; x++) {
      const ci = Math.floor(x / Nn * cells), cj = Math.floor(y / Nn * cells); let d1 = 1e9, d2 = 1e9, best = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const wi = ci + di, wj = cj + dj, ii = (wi + cells) % cells, jj = (wj + cells) % cells, p = pts[jj * cells + ii];
        const d = Math.hypot(p[0] + (wi - ii) / cells * Nn - x, p[1] + (wj - jj) / cells * Nn - y);
        if (d < d1) { d2 = d1; d1 = d; best = jj * cells + ii; } else if (d < d2) d2 = d;
      }
      const k = y * Nn + x; a1[k] = d1; gap[k] = d2 - d1; id[k] = best;
    }
    const cell = Nn / cells;
    T.riprap = texFrom(Nn, (_x, _y, k) => {
      const p = pts[id[k]], mo = smooth(1.4, 3.4, gap[k]), v = (58 + p[2] * 40) * (0.93 + rnd() * 0.14) * (1 - 0.18 * smooth(0.2, 0.75, a1[k] / cell)), wm = 1 + (p[3] - 0.5) * 0.08;
      return [lerp(150, v * wm, mo), lerp(147, v, mo), lerp(138, v * (2 - wm) * 0.96, mo), 255];
    });
    T.riprapH = texFrom(Nn, (_x, _y, k) => { const h = smooth(1.2, 5, gap[k]) * (1 - 0.35 * Math.min(1, a1[k] / cell)) * 255; return [h, h, h, 255]; }, false);
  })();
  const n3 = tnoise(128, [[16, 0.6], [64, 0.4]]);
  T.asphalt = texFrom(128, (x, _y, k) => { let v = 82 + n3[k] * 30 + (rnd() - 0.5) * 18; if (x < 4 || x > 123) v = 200; return [v, v, v * 1.03, 255]; });
  T.lane = texFrom(128, (_x, _y, k) => { const v = 150 + n3[k] * 60 + (rnd() - 0.5) * 30; return [v, v * 0.97, v * 0.9, 255]; });
  T.cloud = drawTex(128, 64, g => { for (let i = 0; i < 30; i++) { const x = 22 + rnd() * 84, y = 24 + rnd() * 18, r = 8 + rnd() * 15; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); } });
  T.cloud.wrapS = T.cloud.wrapT = THREE.ClampToEdgeWrapping;
}
