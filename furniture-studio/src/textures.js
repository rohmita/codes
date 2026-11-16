// Procedural, tileable greyscale textures (multiplied by the material colour) drawn on canvases.
import * as THREE from 'three';

function noise2(seed = 1) {
  // tileable value noise on a period-P lattice
  const P = 256, perm = new Uint8Array(P * 2), vals = new Float32Array(P);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < P; i++) { perm[i] = i; vals[i] = rnd(); }
  for (let i = P - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < P; i++) perm[i + P] = perm[i];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const w = (a) => ((a % period) + period) % period;
    const v = (a, b) => vals[perm[(perm[w(a) & 255] + w(b)) & 255]];
    const u = sm(xf), t = sm(yf);
    return (v(xi, yi) * (1 - u) + v(xi + 1, yi) * u) * (1 - t) + (v(xi, yi + 1) * (1 - u) + v(xi + 1, yi + 1) * u) * t;
  };
}
function fbm(n, x, y, period, oct = 4) {
  let a = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { a += amp * n(x * f, y * f, period * f); norm += amp; amp *= 0.5; f *= 2; }
  return a / norm;
}
function canvasTex(size, fn, { repeat = true, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.max(0, Math.min(1, fn(x / size, y / size)));
    const i = (y * size + x) * 4; const b = Math.round(v * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeTextures() {
  const n = noise2(7), n2 = noise2(31);
  // wood: grain runs along U (horizontal stripes in V)
  const woodF = (u, v) => {
    const warp = fbm(n, u * 2, v * 1.5, 2) * 1.6 + fbm(n2, u * 6, v * 3, 6, 2) * 0.25;
    const rings = v * 30 + warp * 2.4;
    const r = rings - Math.floor(rings);
    const ring = Math.pow(r, 2.2) * (1 - Math.pow(r, 12));
    const fib = fbm(n2, u * 6, v * 220, 6, 2);
    const blot = fbm(n, u * 3, v * 3, 3, 3);
    return 0.8 + ring * 0.13 + (fib - 0.5) * 0.12 + (blot - 0.5) * 0.08;
  };
  const wood = { map: canvasTex(512, woodF), bump: canvasTex(512, (u, v) => woodF(u, v) * 0.6 + fbm(n2, u * 64, v * 256, 64, 1) * 0.4, { srgb: false }) };

  const fabricF = (u, v) => {
    const wx = Math.sin(u * Math.PI * 2 * 128) * 0.5 + 0.5, wy = Math.sin(v * Math.PI * 2 * 128) * 0.5 + 0.5;
    const weave = ((Math.floor(u * 128) + Math.floor(v * 128)) % 2 ? wx : wy);
    return 0.82 + weave * 0.1 + (fbm(n, u * 16, v * 16, 16, 3) - 0.5) * 0.16;
  };
  const fabric = { map: canvasTex(512, fabricF), bump: canvasTex(512, fabricF, { srgb: false }) };
  const velvetF = (u, v) => 0.84 + (fbm(n2, u * 8, v * 8, 8, 4) - 0.5) * 0.3;
  const velvet = { map: canvasTex(256, velvetF), bump: null };
  const leatherF = (u, v) => {
    const c = fbm(n, u * 48, v * 48, 48, 3);
    return 0.82 + (c - 0.5) * 0.25 + (fbm(n2, u * 6, v * 6, 6, 2) - 0.5) * 0.18;
  };
  const leather = { map: canvasTex(512, leatherF), bump: canvasTex(512, (u, v) => fbm(n, u * 48, v * 48, 48, 3), { srgb: false }) };
  // rattan cane weave: diagonal strands with octagonal holes
  const weaveF = (u, v) => {
    const k = 24;
    const a = (u + v) * k, b = (u - v) * k, h = u * k * 1.414, vv = v * k * 1.414;
    const s1 = Math.abs(Math.sin(a * Math.PI)), s2 = Math.abs(Math.sin(b * Math.PI));
    const s3 = Math.abs(Math.sin(h * Math.PI)), s4 = Math.abs(Math.sin(vv * Math.PI));
    const strand = Math.max(Math.pow(1 - s1, 3) * 0.9, Math.pow(1 - s2, 3) * 0.9, Math.pow(1 - s3, 4), Math.pow(1 - s4, 4));
    const hole = Math.min(s1, s2) > 0.55 && Math.min(s3, s4) > 0.5 ? 1 : 0;
    return hole ? 0.28 : 0.72 + strand * 0.26 + (fbm(n, u * 60, v * 60, 60, 1) - 0.5) * 0.08;
  };
  const weave = { map: canvasTex(512, weaveF), bump: canvasTex(512, weaveF, { srgb: false }) };
  const marbleF = (u, v) => {
    const t = fbm(n, u * 4, v * 4, 4, 5);
    const vein = Math.abs(Math.sin((u * 3 + v * 5 + t * 6) * Math.PI));
    const fine = Math.abs(Math.sin((u * 9 - v * 4 + fbm(n2, u * 8, v * 8, 8, 4) * 9) * Math.PI));
    return 1 - Math.pow(1 - vein, 14) * 0.45 - Math.pow(1 - fine, 22) * 0.25 - (1 - t) * 0.06;
  };
  const marble = { map: canvasTex(512, marbleF), bump: null };

  const screen = (top, bottom, sunCol) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 288;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 288); gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, 512, 288);
    if (sunCol) { g.fillStyle = sunCol; g.beginPath(); g.arc(330, 170, 46, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.moveTo(0, 288); g.lineTo(0, 200); g.bezierCurveTo(120, 160, 220, 230, 330, 196); g.bezierCurveTo(420, 170, 470, 200, 512, 186); g.lineTo(512, 288); g.fill();
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.beginPath(); g.moveTo(0, 288); g.lineTo(0, 240); g.bezierCurveTo(150, 215, 300, 260, 512, 228); g.lineTo(512, 288); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  return {
    wood, fabric, velvet, leather, weave, marble,
    screenBlue: screen('#1d4e89', '#7fb8d8', null),
    screenDusk: screen('#3b2a5c', '#f08a5d', '#ffd59a'),
  };
}
