// Extended catalogue, part 2: kitchen, bathroom, decor, electronics, outdoor.
import * as THREE from 'three';
import { boxUV, outline } from './geo.js';
import { legs, drawer, door, carcass, handle, HANDLE_LABELS, FRONT_LABELS, rad, clamp, rng } from './parts.js';
import {
  R, S, C, G, pick, SHAPES, SHADES, handleGroup,
  stoolSchema, buildStool, deskSchema, buildDesk, cabinetBody, mirrorShape, shade, BOOK_MATS, schemaDefaults,
} from './types.js';

const WOOD = { c: '#c49a6c', f: 'kayu' };
const BLACK = { c: '#2b2b2d', f: 'logam' };
const CHROME = { c: '#c7c9cc', f: 'logam' };
const BRASS = { c: '#b8925a', f: 'logam' };
const WHITE = { c: '#f4f3f0', f: 'glossy' };
const wall = (b, w, h, z) => b.boxY('dinding', 'Dinding', w, h, 2, 0, 0, z - 1);
/** Lathe with an exact segment count (polygonal canopies), unaffected by the quality setting. */
function latheN(b, slot, name, pts, x, y, z, seg, phiStart = 0) {
  const geo = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg, phiStart);
  geo.computeVertexNormals();
  return b.add(boxUV(geo), slot, name, x, y, z);
}
function doubleSided(geo) {
  const g = geo.index ? geo : geo;
  const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv, I = g.index.array, n = P.count;
  const pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = new Uint32Array(I.length * 2);
  pos.set(P.array); pos.set(P.array, n * 3);
  nor.set(Nn.array); for (let i = 0; i < n * 3; i++) nor[n * 3 + i] = -Nn.array[i];
  uv.set(U.array); uv.set(U.array, n * 2);
  idx.set(I); for (let i = 0; i < I.length; i += 3) { idx[I.length + i] = I[i] + n; idx[I.length + i + 1] = I[i + 2] + n; idx[I.length + i + 2] = I[i + 1] + n; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ---------------------------------------------------------------- lighting helper (also used by the island)
export function buildPendant(b, P) {
  const start = b.cur.children.length;
  buildPendantParts(b, P);
  // light fittings: no cast shadows (they would be lit from inside)
  for (const m of b.cur.children.slice(start)) m.traverse((o) => { o.userData.noShadow = true; });
}
function buildPendantParts(b, P) {
  const n = P.count | 0, ch = P.ceilH, r = rng(P.seed || 3);
  const pts = [];
  for (let i = 0; i < n; i++) {
    if (P.layout === 'baris') pts.push([(i - (n - 1) / 2) * P.spacing, 0]);
    else if (P.layout === 'lingkar') { const a = (i / n) * Math.PI * 2; pts.push([Math.cos(a) * P.spacing * 0.6, Math.sin(a) * P.spacing * 0.6]); }
    else { const a = i * 2.4; const rr = n === 1 ? 0 : P.spacing * 0.45 * Math.sqrt((i + 0.5) / n); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  }
  if (P.layout === 'baris' && n > 1) b.boxY('utama', 'Kanopi', (n - 1) * P.spacing + 16, 3, 9, 0, ch - 3, 0, { r: 1.2 });
  pts.forEach(([x, z], i) => {
    if (!(P.layout === 'baris' && n > 1)) b.cyl('utama', 'Kanopi', 6, 6, 2.5, x, ch - 2.5, z, 24);
    const drop = P.drop + (P.layout === 'cluster' ? (r() - 0.5) * P.drop * 0.6 : 0);
    const y = ch - drop;
    b.rod('gelap', 'Kabel', [x, ch - 2.5, z], [x, y, z], 0.25, 0.25, 6);
    b.cyl('aksen', 'Fiting', 1.6, 1.6, 4, x, y - 4, z, 14);
    if (P.shade === 'bohlam') b.sphere('lampu', 'Bohlam', 6, x, y - 10, z, 20, { scale: [1, 1.25, 1] });
    else shade(b, P.shade, P.shadeD, P.shadeH, x, y - P.shadeH + 1, z, 'kain');
  });
}
const pendantSchema = [
  G('Susunan', [R('count', 'Jumlah lampu', 1, 7, 1, 3, ''), S('layout', 'Susunan', { baris: 'Berjajar', cluster: 'Cluster', lingkar: 'Melingkar' }, 'baris'), R('spacing', 'Jarak', 20, 90, 0.5, 45), R('ceilH', 'Tinggi plafon', 200, 320, 1, 250), R('drop', 'Panjang kabel', 20, 180, 0.5, 80), R('seed', 'Variasi', 1, 99, 1, 3, '', (p) => p.layout === 'cluster')]),
  G('Kap lampu', [S('shade', 'Bentuk kap', { ...SHADES, bohlam: 'Bohlam saja' }, 'kubah'), R('shadeD', 'Diameter kap', 10, 60, 0.5, 28, 'cm', (p) => p.shade !== 'bohlam'), R('shadeH', 'Tinggi kap', 8, 45, 0.5, 18, 'cm', (p) => p.shade !== 'bohlam')]),
];

// ---------------------------------------------------------------- kitchen
function buildIsland(b, P) {
  const W = P.w, D = P.d, H = P.h, ct = P.counterT, ov = P.overhang, ph = 10;
  const wf = P.waterfall ? ct : 0;
  const bw = W - wf * 2 - 2, bd = D - ov - 1;
  const n = P.modules | 0;
  const cells = Array(n).fill(0).map((_, i) => (i === 0 ? 'laci' : i === n - 1 ? 'pintuK' : (i % 2 ? 'pintu' : 'laci')));
  b.boxY('gelap', 'Plint', bw - 4, ph, bd - 6, 0, 0, ov / 2 - 1);
  b.group('Kabinet', 0, 0, ov / 2, () => cabinetBody(b, { ...P, topOver: 0, topT: 1.8 }, bw, H - ct - ph, bd, ph, [{ cells }]));
  b.slab('sekunder', 'Meja pulau', 'persegi', W, D, ct, 0, H - ct, 0, { edge: 'bevel' });
  if (P.waterfall) for (const sx of [-1, 1]) b.boxY('sekunder', 'Sisi waterfall', ct, H - ct, D, sx * (W / 2 - ct / 2), 0, 0);
  if (P.sink) {
    b.box('aksen', 'Bak cuci', 48, 0.4, 36, -W * 0.22, H + 0.1, ov / 2 + 2, { r: 0.15 });
    b.box('gelap', 'Bak cuci (dalam)', 44, 0.3, 32, -W * 0.22, H + 0.3, ov / 2 + 2);
    b.tube('aksen', 'Kran', [[-W * 0.22, H, D / 2 - 5], [-W * 0.22, H + 32, D / 2 - 5], [-W * 0.22, H + 32, D / 2 - 22], [-W * 0.22, H + 25, D / 2 - 22]], 1.1, 6);
  }
  if (P.cooktop) {
    const cx = W * 0.22;
    b.box('layar', 'Kompor tanam', 56, 0.5, 46, cx, H + 0.25, ov / 2, { r: 0.3 });
    for (const [dx, dz, r] of [[-12, -10, 9], [12, -10, 7], [-12, 10, 7], [12, 10, 9]]) b.torus('aksen', 'Tungku', r * 0.55, 0.25, cx + dx, H + 0.6, ov / 2 + dz, [Math.PI / 2, 0, 0]);
  }
  const ns = P.stools | 0;
  if (ns) {
    const sp = { ...schemaDefaults(stoolSchema), seatH: clamp(H - 28, 45, 80), back: 'rendah', cushion: true };
    for (let i = 0; i < ns; i++) b.group('Stool', -W / 2 + W * ((i + 0.5) / ns), 0, -D / 2 - 6, () => buildStool(b, sp));
  }
  if (P.pendants) buildPendant(b, { count: Math.max(2, Math.round(W / 70)), layout: 'baris', spacing: W / Math.max(2, Math.round(W / 70)), ceilH: H + 160, drop: 70, shade: P.pendantShade, shadeD: 26, shadeH: 18 });
}
const islandSchema = [
  G('Dimensi', [R('w', 'Panjang', 100, 300, 0.5, 190), R('d', 'Dalam', 60, 130, 0.5, 95), R('h', 'Tinggi', 85, 110, 0.5, 92), R('counterT', 'Tebal top', 2, 10, 0.1, 4), R('overhang', 'Tonjolan duduk', 0, 40, 0.5, 28), R('modules', 'Modul kabinet', 2, 6, 1, 3, '')]),
  G('Perlengkapan', [C('sink', 'Bak cuci', true), C('cooktop', 'Kompor tanam', false), C('waterfall', 'Sisi waterfall', true), R('stools', 'Jumlah stool', 0, 5, 1, 3, ''), C('pendants', 'Lampu gantung', true), S('pendantShade', 'Kap lampu', SHADES, 'kubah', (p) => p.pendants)]),
  handleGroup({ fronts: ['polos', 'shaker', 'bilah', 'louvre', 'rotan'], frontStyle: 'bilah', handle: 'tab' }),
];

function buildRange(b, P) {
  const W = P.w, H = P.h, D = P.d, t = 2;
  const ovB = 9, ovT = H - 20; // oven cavity bounds
  b.boxY('gelap', 'Plint', W - 2, ovB, D - 4, 0, 0, -1);
  for (const sx of [-1, 1]) b.boxY('utama', 'Sisi', t, H - ovB, D, sx * (W / 2 - t / 2), ovB, 0);
  b.boxY('utama', 'Belakang', W - 2 * t, H - ovB, t, 0, ovB, -D / 2 + t / 2);
  b.boxY('utama', 'Dasar oven', W - 2 * t, 2, D, 0, ovB, 0);
  b.boxY('utama', 'Panel atas', W - 2 * t, H - ovT, D, 0, ovT, 0);
  b.boxY('gelap', 'Rongga oven', W - 2 * t - 0.2, ovT - ovB - 2, 0.4, 0, ovB + 2, -D / 2 + t + 0.2);
  for (let i = 1; i <= 2; i++) b.boxY('aksen', 'Rak oven', W - 2 * t - 1, 0.4, D - 8, 0, ovB + (ovT - ovB) * i / 3, 0);
  // cooktop
  const top = H;
  if (P.type === 'gas') {
    b.box('gelap', 'Permukaan kompor', W - 1, 0.6, D - 2, 0, top + 0.3, 0, { r: 0.2 });
    const n = P.burners | 0, cols = n <= 2 ? n : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = -W / 2 + W * ((c + 0.5) / cols), z = -D / 2 + (D - 4) * ((r + 0.5) / rows) + 2;
      b.cyl('aksen', 'Tungku', 4, 4.6, 1.6, x, top + 0.6, z, 20);
      b.cyl('gelap', 'Tutup tungku', 2.6, 2.6, 0.6, x, top + 2.2, z, 16);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; b.rod('gelap', 'Penyangga panci', [x + Math.cos(a) * 3.5, top + 3, z + Math.sin(a) * 3.5], [x + Math.cos(a) * 9, top + 3, z + Math.sin(a) * 9], 0.45, 0.45, 6); }
      b.torus('gelap', 'Cincin penyangga', 9.5, 0.45, x, top + 1.8, z, [Math.PI / 2, 0, 0]);
    }
  } else {
    b.box('layar', 'Kaca induksi', W - 1, 0.6, D - 2, 0, top + 0.3, 0, { r: 0.2 });
    const n = P.burners | 0, cols = n <= 2 ? n : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); b.torus('interior', 'Zona induksi', 8 + (i % 2) * 2, 0.18, -W / 2 + W * ((c + 0.5) / cols), top + 0.65, -D / 2 + (D - 4) * ((r + 0.5) / rows) + 2, [Math.PI / 2, 0, 0]); }
  }
  if (P.backguard) b.boxY('utama', 'Panel belakang', W, 12, 3, 0, top, -D / 2 + 1.5, { r: 0.6 });
  // control panel
  const kn = Math.max(2, P.burners | 0) + 1;
  for (let i = 0; i < kn; i++) b.cyl('aksen', 'Kenop', 1.8, 2, 2.2, -W / 2 + W * ((i + 0.5) / kn), H - 10, D / 2 + 1.1, 16, { rot: [Math.PI / 2, 0, 0] });
  // oven door
  b.group('Pintu oven', 0, ovB, D / 2, (g) => {
    g.rotation.x = rad(P.doorOpen * 0.85);
    const dh = ovT - ovB;
    b.boxY('utama', 'Pintu oven', W - 1, dh, 3, 0, 0, 1.5, { r: 0.8 });
    if (P.window) b.box('layar', 'Jendela oven', W - 16, dh * 0.5, 0.3, 0, dh * 0.48, 3.1);
    b.rod('aksen', 'Gagang oven', [-W / 2 + 6, dh - 5, 6], [W / 2 - 6, dh - 5, 6], 1, 1, 12);
    for (const sx of [-1, 1]) b.rod('aksen', 'Tiang gagang', [sx * (W / 2 - 7), dh - 5, 3], [sx * (W / 2 - 7), dh - 5, 6], 0.7, 0.7, 8);
  });
}
const rangeSchema = [
  G('Dimensi', [R('w', 'Lebar', 50, 100, 0.5, 60), R('h', 'Tinggi', 80, 95, 0.5, 90), R('d', 'Dalam', 50, 70, 0.5, 60)]),
  G('Kompor', [S('type', 'Tipe', { gas: 'Gas', induksi: 'Induksi' }, 'gas'), R('burners', 'Jumlah tungku', 2, 6, 1, 4, ''), C('backguard', 'Panel belakang', true)]),
  G('Oven', [C('window', 'Jendela oven', true), R('doorOpen', 'Buka pintu', 0, 100, 1, 0, '%')]),
];

function buildMicrowave(b, P) {
  const W = P.w, H = P.h, D = P.d, t = 1.4, pw = 12;
  const y0 = 1;
  for (const [x, z] of [[-W / 2 + 4, D / 2 - 4], [W / 2 - 4, D / 2 - 4], [-W / 2 + 4, -D / 2 + 4], [W / 2 - 4, -D / 2 + 4]]) b.cyl('gelap', 'Kaki', 1.2, 1.2, 1, x, 0, z, 10);
  b.boxY('utama', 'Atas', W, t, D, 0, y0 + H - t, 0, { r: 0.6 });
  b.boxY('utama', 'Bawah', W, t, D, 0, y0, 0, { r: 0.6 });
  b.boxY('utama', 'Sisi', t, H - 2 * t, D, -W / 2 + t / 2, y0 + t, 0);
  b.boxY('utama', 'Panel kontrol', pw, H - 2 * t, D, W / 2 - pw / 2, y0 + t, 0);
  b.boxY('utama', 'Belakang', W - pw - t, H - 2 * t, t, -pw / 2 + t / 2, y0 + t, -D / 2 + t / 2);
  b.boxY('interior', 'Rongga', W - pw - t - 0.4, H - 2 * t - 0.4, 0.3, -pw / 2 + t / 2, y0 + t + 0.2, -D / 2 + t + 0.2);
  b.cyl('kaca', 'Piring putar', (Math.min(W - pw, D) / 2) - 4, (Math.min(W - pw, D) / 2) - 4, 0.6, -pw / 2, y0 + t + 1, 0, 32);
  b.box('layar', 'Panel tombol', pw - 2.4, H - 6, 0.3, W / 2 - pw / 2, y0 + H / 2, D / 2 + 0.15);
  b.box('layarBiru', 'Display', pw - 4, 2.4, 0.2, W / 2 - pw / 2, y0 + H - 6, D / 2 + 0.35, { uv01: true });
  for (let i = 0; i < 9; i++) b.box('aksen', 'Tombol', 2, 1.4, 0.3, W / 2 - pw / 2 + ((i % 3) - 1) * 2.6, y0 + H - 11 - Math.floor(i / 3) * 2.4, D / 2 + 0.4, { r: 0.2 });
  b.cyl('aksen', 'Kenop', 1.8, 1.8, 1, W / 2 - pw / 2, y0 + 7, D / 2 + 0.5, 16, { rot: [Math.PI / 2, 0, 0] });
  const dw = W - pw;
  b.group('Pintu', -W / 2, y0 + H / 2, D / 2, (g) => {
    g.rotation.y = -rad(P.doorOpen * 1.05);
    b.box('utama', 'Bingkai pintu', dw, H - 0.4, 1.4, dw / 2, 0, 0.7, { r: 0.4 });
    b.box('layar', 'Jendela', dw - 9, H - 9, 0.3, dw / 2 - 1.5, 0, 1.5);
    if (P.handleStyle === 'gagang') b.rod('aksen', 'Gagang', [dw - 3, -H * 0.3, 3.2], [dw - 3, H * 0.3, 3.2], 0.7, 0.7, 10);
    else b.box('gelap', 'Alur', 1, H * 0.6, 0.3, dw - 2, 0, 1.5);
  });
}
const microSchema = [
  G('Dimensi', [R('w', 'Lebar', 38, 65, 0.5, 50), R('h', 'Tinggi', 24, 40, 0.5, 30), R('d', 'Dalam', 30, 50, 0.5, 38)]),
  G('Pintu', [S('handleStyle', 'Pembuka', { gagang: 'Gagang', tombol: 'Tombol dorong' }, 'gagang'), R('doorOpen', 'Buka pintu', 0, 100, 1, 0, '%')]),
];

function buildDispenser(b, P) {
  const W = P.w, D = P.d, H = P.h;
  b.boxY('utama', 'Badan', W, H, D, 0, 0, 0, { r: 2 });
  const ry = H * (P.type === 'atas' ? 0.55 : 0.62);
  b.boxY('gelap', 'Ceruk gelas', W - 8, 24, 2, 0, ry - 22, D / 2 - 0.4, { r: 1 });
  b.boxY('aksen', 'Tatakan', W - 10, 1.2, 8, 0, ry - 22, D / 2 + 2, { r: 0.4 });
  const taps = P.taps | 0;
  const tapMats = ['merah', 'biru', 'interior'];
  for (let i = 0; i < taps; i++) {
    const x = (i - (taps - 1) / 2) * 8;
    b.box(tapMats[i], 'Kran', 3.4, 4, 4, x, ry, D / 2 + 1.8, { r: 0.8 });
    b.box('aksen', 'Mulut kran', 1.4, 2.4, 1.4, x, ry - 3, D / 2 + 2.4, { r: 0.4 });
  }
  b.box('layar', 'Panel', W - 12, 3, 0.3, 0, ry + 7, D / 2 + 0.15);
  const galon = [[0, 0], [13, 0], [13.5, 2], [13.5, 36], [11, 42], [3.2, 45], [3.2, 49], [0, 49]];
  if (P.galon) {
    if (P.type === 'atas') {
      b.cyl('utama', 'Leher', 6, 8, 3, 0, H, 0, 24);
      b.lathe('galon', 'Galon', galon.map(([r, y]) => [r, 49 - y]), 0, H + 2, 0, 32);
    } else {
      b.group('Pintu galon', -W / 2, H * 0.24, D / 2, (g) => { g.rotation.y = -rad(P.doorOpen); b.box('utama', 'Pintu bawah', W, H * 0.44, 1.2, W / 2, 0, 0.6, { r: 0.5 }); });
      if (P.doorOpen > 5) b.lathe('galon', 'Galon', galon, 0, 2, 0, 32);
    }
  }
}
const dispSchema = [
  G('Dimensi', [R('w', 'Lebar', 26, 40, 0.5, 31), R('d', 'Dalam', 26, 40, 0.5, 32), R('h', 'Tinggi', 80, 110, 0.5, 98)]),
  G('Model', [S('type', 'Pengisian galon', { atas: 'Galon atas', bawah: 'Galon bawah' }, 'atas'), R('taps', 'Jumlah kran', 1, 3, 1, 2, ''), C('galon', 'Tampilkan galon', true), R('doorOpen', 'Buka pintu bawah', 0, 100, 1, 50, '°', (p) => p.type === 'bawah')]),
];

function buildDishRack(b, P) {
  const W = P.w, D = P.d, tiers = P.tiers | 0;
  const r = 0.35, metal = 'aksen';
  if (P.tray) b.boxY('utama', 'Nampan air', W + 2, 1.4, D + 2, 0, 0, 0, { r: 0.6 });
  const y0 = P.tray ? 2.4 : 0.4;
  const th = 20;
  for (let k = 0; k < tiers; k++) {
    const y = y0 + k * th;
    b.tube(metal, 'Rangka', [[-W / 2, y, -D / 2], [W / 2, y, -D / 2], [W / 2, y, D / 2], [-W / 2, y, D / 2], [-W / 2, y, -D / 2 + 0.01]], r, 2, { caps: false });
    for (let i = 1; i < 8; i++) { const x = -W / 2 + W * (i / 8); b.rod(metal, 'Kawat', [x, y, -D / 2], [x, y, D / 2], r * 0.8, r * 0.8, 6); }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod(metal, 'Tiang', [sx * W / 2, y0, sz * D / 2], [sx * W / 2, y0 + (tiers - 1) * th + 8, sz * D / 2], r, r, 8);
  // plates on the top tier (or the only tier)
  const py = y0 + (tiers - 1) * th;
  const np = P.plates | 0, pr = Math.min(12, D * 0.42);
  const pz = -D * 0.12, span = W * 0.62;
  for (let i = 0; i < np; i++) {
    const x = -W / 2 + 3 + span * ((i + 0.5) / np);
    b.group('Piring', x, py + pr * 0.95, pz, (g) => { g.rotation.set(0, Math.PI / 2, 0.18); b.lathe('dekor', 'Piring', [[0, 0], [pr * 0.6, 0], [pr, 1.2], [pr, 1.6], [pr * 0.6, 0.8], [0, 0.7]], 0, 0, 0, 32, { rot: [Math.PI / 2, 0, 0] }); });
  }
  if (np) for (let i = 0; i <= np; i++) { const x = -W / 2 + 3 + span * (i / np); for (const z of [pz - pr * 0.6, pz + pr * 0.6]) b.rod(metal, 'Penyekat', [x, py, z], [x, py + 9, z], r * 0.8, r * 0.8, 6); }
  const nc = P.cups | 0;
  for (let i = 0; i < nc; i++) {
    const x = W / 2 - 6 - i * 7.5;
    b.lathe(i % 2 ? 'buku2' : 'dekor', 'Cangkir', [[0, 9], [3.2, 9], [3.6, 0.4], [3.2, 0], [2.9, 0], [3.3, 8.6], [0, 8.6]], x, py + 0.4, D / 2 - 6, 24);
  }
  if (P.cutlery) {
    b.cyl('utama', 'Wadah sendok', 4, 4, 12, W / 2 - 6, py, -D / 2 + 6, 20, { open: false });
    for (let i = 0; i < 5; i++) b.rod('aksen', 'Sendok', [W / 2 - 7 + (i % 3), py + 4, -D / 2 + 5 + (i % 2)], [W / 2 - 7.5 + (i % 3) * 1.4, py + 19, -D / 2 + 4 + (i % 2) * 2], 0.4, 0.4, 6);
  }
}
const dishSchema = [
  G('Dimensi', [R('w', 'Lebar', 30, 70, 0.5, 46), R('d', 'Dalam', 20, 40, 0.5, 30), R('tiers', 'Tingkat', 1, 2, 1, 2, '')]),
  G('Isi', [R('plates', 'Piring', 0, 10, 1, 6, ''), R('cups', 'Cangkir', 0, 4, 1, 3, ''), C('cutlery', 'Wadah sendok', true), C('tray', 'Nampan air', true)]),
];

// ---------------------------------------------------------------- bathroom
function buildBathVanity(b, P) {
  const W = P.w, D = P.d, H = P.h, ct = 3;
  let y0 = 0;
  if (P.mount === 'gantung') y0 = 22;
  else if (P.mount === 'kaki') { legs(b, { legStyle: 'logam', legT: 4, legInset: 2, stretch: 'rak', stretchH: 12 }, W, D, 20); y0 = 20; }
  else { b.boxY('utama', 'Plint', W - 4, 8, D - 6, 0, 0, -2); y0 = 8; }
  if (P.wall) wall(b, W + 80, 220, -D / 2);
  const cells = P.front === 'laci' ? [{ cells: ['laci'] }, { cells: ['laci'] }] : P.front === 'terbuka' ? [{ cells: ['terbuka'] }] : [{ cells: W > 70 ? ['pintu', 'pintuK'] : ['pintu'] }];
  cabinetBody(b, { ...P, topOver: 0, topT: 1.8, doorOpen: 0 }, W, H - ct - y0, D, y0, cells, {
    fill: (x0, x1, y, h) => { for (let i = 0; i < 3; i++) b.box('kain', 'Handuk gulung', 9, 9, D - 8, x0 + 7 + i * 10, y + 4.6, 0, { r: 4.4 }); },
  });
  const bx = 0, bz = 2, bw = Math.min(W - 16, 50), bd = Math.min(D - 14, 36);
  if (P.basin === 'tanam') {
    const fz = D / 2 + 1, z0 = bz - bd / 2, z1 = bz + bd / 2;
    b.boxY('sekunder', 'Top', (W + 2 - bw) / 2, ct, D + 2, -(W + 2) / 2 + (W + 2 - bw) / 4, H - ct, 0);
    b.boxY('sekunder', 'Top', (W + 2 - bw) / 2, ct, D + 2, (W + 2) / 2 - (W + 2 - bw) / 4, H - ct, 0);
    b.boxY('sekunder', 'Top', bw, ct, z0 + D / 2 + 1, 0, H - ct, (-D / 2 - 1 + z0) / 2);
    b.boxY('sekunder', 'Top', bw, ct, fz - z1, 0, H - ct, (z1 + fz) / 2);
    const dep = 14;
    b.boxY('keramik', 'Wastafel', bw, 1, bd, bx, H - ct - dep, bz);
    for (const s of [-1, 1]) { b.boxY('keramik', 'Dinding wastafel', bw, dep, 0.8, bx, H - ct - dep, bz + s * (bd / 2 - 0.4)); b.boxY('keramik', 'Dinding wastafel', 0.8, dep, bd, bx + s * (bw / 2 - 0.4), H - ct - dep, bz); }
    b.cyl('aksen', 'Saluran', 2, 2, 0.3, bx, H - ct - dep + 1, bz, 16);
  } else {
    b.slab('sekunder', 'Top', 'persegi', W + 2, D + 2, ct, 0, H - ct, 0, { edge: 'bevel' });
    if (P.basinShape === 'bulat') b.lathe('keramik', 'Wastafel', [[0, 0], [9, 0], [19, 12], [19.5, 14], [18.6, 14], [8, 1.4], [0, 1.4]], bx, H, bz, 40);
    else {
      const bh = 12;
      b.boxY('keramik', 'Wastafel', bw, 1.5, bd, bx, H, bz, { r: 0.6 });
      for (const s of [-1, 1]) { b.boxY('keramik', 'Dinding wastafel', bw, bh, 1.2, bx, H, bz + s * (bd / 2 - 0.6), { r: 0.5 }); b.boxY('keramik', 'Dinding wastafel', 1.2, bh, bd, bx + s * (bw / 2 - 0.6), H, bz, { r: 0.5 }); }
    }
  }
  const tall = P.basin !== 'tanam';
  const fzz = -D / 2 + 5;
  if (P.faucet === 'dinding') b.tube('aksen', 'Kran', [[0, H + (tall ? 30 : 18), -D / 2], [0, H + (tall ? 30 : 18), fzz + 12]], 1, 2);
  else {
    const fh = tall ? 32 : 18;
    b.cyl('aksen', 'Kran', 1.6, 2, fh, 0, H, fzz, 16);
    b.tube('aksen', 'Mulut kran', [[0, H + fh - 1.5, fzz], [0, H + fh - 1.5, fzz + 12], [0, H + fh - 5, fzz + 13]], 0.9, 2);
    b.rod('aksen', 'Tuas', [0, H + fh, fzz], [0, H + fh + 1, fzz - 7], 0.5, 0.5, 8);
  }
  if (P.mirror) {
    const mw = Math.min(W - 10, 70), mh = 75, my = H + 30;
    const shp = mirrorShape('tumpul', mw, mh); const inner = mirrorShape('tumpul', mw - 4, mh - 4);
    shp.holes.push(new THREE.Path(inner.getPoints(48).reverse()));
    b.panel('aksen', 'Bingkai cermin', shp, 2, 0, my + mh / 2, -D / 2 + 1.4, { round: true });
    b.panel('cermin', 'Cermin', mirrorShape('tumpul', mw - 3.4, mh - 3.4), 0.5, 0, my + mh / 2, -D / 2 + 1);
  }
}
const bathVanSchema = [
  G('Dimensi', [R('w', 'Lebar', 45, 160, 0.5, 80), R('h', 'Tinggi meja', 75, 95, 0.5, 86), R('d', 'Dalam', 35, 60, 0.5, 48)]),
  G('Kabinet', [S('mount', 'Pemasangan', { lantai: 'Berdiri (plint)', gantung: 'Gantung dinding', kaki: 'Kaki logam' }, 'gantung'), S('front', 'Isi', { pintu: 'Pintu', laci: 'Laci', terbuka: 'Rak terbuka' }, 'laci')]),
  G('Wastafel', [S('basin', 'Model', { atas: 'Di atas meja', tanam: 'Tanam' }, 'atas'), S('basinShape', 'Bentuk', { bulat: 'Bulat', kotak: 'Kotak' }, 'bulat', (p) => p.basin === 'atas'), S('faucet', 'Kran', { tinggi: 'Berdiri', dinding: 'Dinding' }, 'tinggi'), C('mirror', 'Cermin', true), C('wall', 'Tampilkan dinding', false)]),
  handleGroup({ fronts: ['polos', 'shaker', 'bilah', 'rotan'], frontStyle: 'bilah', handle: 'tab', handleLen: 16 }),
];

function buildToilet(b, P) {
  const st = P.style, open = P.lidOpen / 100;
  if (P.wall) wall(b, 120, 200, -36);
  if (st === 'jongkok') {
    b.boxY('utama', 'Kloset jongkok', 46, 4, 64, 0, 0, 0, { r: 1.5 });
    b.slab('keramik', 'Cekungan', 'oval', 28, 40, 0.5, 0, 3.8, 4);
    b.slab('gelap', 'Lubang', 'oval', 12, 16, 0.4, 0, 4, 14);
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) b.boxY('utama', 'Pijakan', 9, 0.8, 2, sx * 16, 4, -16 + i * 3.6, { r: 0.3 });
    if (P.bucket) {
      b.lathe('kain', 'Ember', [[0, 0], [14, 0], [16, 30], [15.2, 30], [13.2, 1.2], [0, 1.2]], 42, 0, -10, 32);
      b.torus('kain', 'Bibir ember', 15.6, 0.6, 42, 30, -10, [Math.PI / 2, 0, 0]);
      b.group('Gayung', 42, 31, -10, (g) => { g.rotation.z = -0.2; b.lathe('aksen', 'Gayung', [[0, 0], [6, 0], [7, 9], [6.4, 9], [5.4, 0.8], [0, 0.8]], 0, 0, 0, 24); b.rod('aksen', 'Gagang gayung', [6, 7, 0], [18, 10, 0], 1, 0.9, 8); });
    }
  } else {
    const hung = st === 'gantung';
    const y0 = hung ? 24 : 0;
    if (!hung) b.lathe('utama', 'Kaki kloset', [[0, 0], [12, 0], [11, 6], [9.5, 22], [0, 22]], 0, 0, 2, 32).scale.z = 1.35;
    const bowl = b.lathe('utama', 'Mangkuk', [[0, 18], [10, 18], [15, 26], [18, 34], [18.5, 38], [16.8, 38], [15, 32], [9, 24], [0, 22]], 0, y0 + (hung ? -16 : 0), 6, 40);
    bowl.scale.z = 1.3;
    if (hung) b.boxY('utama', 'Badan gantung', 30, 22, 30, 0, y0 + 2, -14, { r: 8 });
    const sy = y0 + 38 + (hung ? -16 : 0);
    const seat = b.lathe('sekunder', 'Dudukan', [[12.5, 0], [18.6, 0], [19, 1], [18.6, 2], [12.5, 2], [12.2, 1], [12.5, 0]], 0, sy, 6, 40); seat.scale.z = 1.3;
    b.group('Tutup', 0, sy + 2, 6 - 18.6 * 1.3 + 2, (g) => {
      g.rotation.x = -rad(open * 100);
      const lid = b.lathe('sekunder', 'Tutup', [[0, 0], [18.6, 0], [18.9, 1], [17, 2.2], [0, 2.4]], 0, 0, 18.6 * 1.3 - 2, 40); lid.scale.z = 1.3;
    });
    if (P.tank === 'tangki' && !hung) {
      b.boxY('utama', 'Tangki', 40, 36, 18, 0, 40, -24, { r: 3 });
      b.boxY('utama', 'Tutup tangki', 42, 2.5, 20, 0, 76, -24, { r: 1 });
      b.cyl('aksen', 'Tombol flush', 2.4, 2.4, 1, 0, 78.5, -24, 16);
    } else {
      b.boxY('dinding', 'Panel tersembunyi', 60, 115, 16, 0, 0, -28);
      b.box('aksen', 'Plat flush', 22, 14, 0.8, 0, 100, -19.6, { r: 1 });
      b.box('interior', 'Tombol flush', 8, 10, 0.4, -4.6, 100, -19.1, { r: 0.6 });
      b.box('interior', 'Tombol flush', 8, 10, 0.4, 4.6, 100, -19.1, { r: 0.6 });
    }
    if (P.bidet) {
      const hx = 22.5, hzz = hung ? -19 : -24;
      b.box('aksen', 'Dudukan semprotan', 1.4, 5, 4, hx - 0.6, 58, hzz, { r: 0.4 });
      b.box('aksen', 'Semprotan', 3, 11, 3, hx + 1.4, 60, hzz + 1, { r: 1.2 });
      b.tube('aksen', 'Selang bidet', [[hx + 1.4, 54.5, hzz + 1], [hx + 4, 12, hzz + 6], [hx + 1, 6, hzz - 2], [hx - 1, 40, hzz - 5]], 0.45, 6);
    }
  }
  if (P.roll) {
    b.rod('aksen', 'Tempat tisu', [-34, 70, -35], [-34, 70, -28], 0.6, 0.6, 10);
    b.rod('aksen', 'Tempat tisu', [-34, 70, -28], [-22, 70, -28], 0.5, 0.5, 10);
    b.cyl('kasur', 'Tisu', 5.5, 5.5, 10, -28, 70, -28, 24, { rot: [0, 0, Math.PI / 2] }).position.set(-28, 70, -28);
  }
}
const toiletSchema = [
  G('Model', [S('style', 'Jenis kloset', { duduk: 'Duduk', gantung: 'Duduk gantung', jongkok: 'Jongkok' }, 'duduk'), S('tank', 'Tangki', { tangki: 'Tangki terlihat', tersembunyi: 'Tersembunyi' }, 'tangki', (p) => p.style === 'duduk'), R('lidOpen', 'Buka tutup', 0, 100, 1, 0, '%', (p) => p.style !== 'jongkok')]),
  G('Aksesori', [C('bidet', 'Bidet / jet washer', true, (p) => p.style !== 'jongkok'), C('bucket', 'Ember & gayung', true, (p) => p.style === 'jongkok'), C('roll', 'Tempat tisu', true), C('wall', 'Tampilkan dinding', false)]),
];

function buildBathtub(b, P) {
  const L = P.l, W = P.w, H = P.h, st = P.style;
  if (P.wall) wall(b, L + 60, 200, -W / 2 - (st === 'tanam' ? 0 : 10));
  let waterY = 0;
  if (st === 'tanam') {
    const t = 8, dep = H - 5;
    b.boxY('sekunder', 'Apron', L, H - 3, W, 0, 0, 0);
    for (const s of [-1, 1]) {
      b.boxY('keramik', 'Bibir', L, 3, t, 0, H - 3, s * (W / 2 - t / 2));
      b.boxY('keramik', 'Bibir', t, 3, W - 2 * t, s * (L / 2 - t / 2), H - 3, 0);
    }
    b.boxY('keramik', 'Dasar bak', L - 2 * t, 1, W - 2 * t, 0, H - dep, 0);
    for (const s of [-1, 1]) { b.boxY('keramik', 'Dinding bak', L - 2 * t, dep, 1, 0, H - dep, s * (W / 2 - t - 0.5)); b.boxY('keramik', 'Dinding bak', 1, dep, W - 2 * t, s * (L / 2 - t - 0.5), H - dep, 0); }
    waterY = H - dep + dep * 0.6;
    if (P.water) b.boxY('air', 'Air', L - 2 * t - 2, 0.6, W - 2 * t - 2, 0, waterY, 0);
  } else {
    const lift = st === 'kaki' ? 13 : 0, th = 4 / (W / 2);
    const prof = [[0, 0], [0.8, 0], [0.9, 3], [0.97, H * 0.55], [1, H], [1 - th, H], [0.96 - th, H * 0.55], [0.84 - th, 6], [0, 6]];
    const tub = b.lathe('keramik', 'Bak mandi', prof, 0, lift, 0, 56);
    tub.scale.set(L / 2, 1, W / 2);
    if (st === 'kaki') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * L * 0.32, z = sz * W * 0.3;
        b.lathe('aksen', 'Kaki cakar', [[0, 0], [4, 0], [4.4, 2], [2.2, 8], [3, 13], [0, 14]], x, 0, z, 18);
        b.sphere('aksen', 'Cakar', 2.6, x + sx * 1.5, 1.6, z + sz * 1.5, 10);
      }
    }
    waterY = lift + H * 0.62;
    if (P.water) { const w = b.slab('air', 'Air', 'oval', L * 0.94, W * 0.9, 0.6, 0, waterY, 0); void w; }
  }
  // faucet
  if (P.faucet === 'lantai' && st !== 'tanam') {
    const x = -L / 2 - 14;
    b.cyl('aksen', 'Kran lantai', 2, 3, H + 25, x, 0, 0, 16);
    b.tube('aksen', 'Mulut kran', [[x, H + 24, 0], [x + 18, H + 24, 0], [x + 20, H + 18, 0]], 1.2, 4);
    b.rod('aksen', 'Tuas', [x, H + 15, 0], [x, H + 15, 7], 0.6, 0.6, 8);
  } else {
    const zW = -W / 2 + (st === 'tanam' ? 4 : -8);
    b.tube('aksen', 'Kran', [[0, H + 22, zW - 6], [0, H + 22, zW + 8], [0, H + 18, zW + 10]], 1.4, 3);
    b.box('aksen', 'Pelat kran', 6, 14, 1, 0, H + 22, zW - 6.5, { r: 0.6 });
  }
  if (P.bathMat) b.boxY('kain', 'Keset', 60, 1.2, 40, 0, 0, W / 2 + 32, { r: 0.6 });
}
const tubSchema = [
  G('Dimensi', [R('l', 'Panjang', 120, 200, 0.5, 170), R('w', 'Lebar', 60, 100, 0.5, 78), R('h', 'Tinggi', 40, 70, 0.5, 58)]),
  G('Model', [S('style', 'Jenis', { berdiri: 'Berdiri bebas', kaki: 'Kaki cakar (clawfoot)', tanam: 'Tanam / built-in' }, 'berdiri'), S('faucet', 'Kran', { lantai: 'Kran lantai', dinding: 'Kran dinding' }, 'lantai'), C('water', 'Isi air', true), C('bathMat', 'Keset', true), C('wall', 'Tampilkan dinding', false)]),
];

function towel(b, x, y, z, w, len) {
  b.cyl('kain', 'Handuk', 1.7, 1.7, w, x, y - w / 2, z, 16, { rot: [0, 0, Math.PI / 2] }).position.set(x, y, z);
  b.box('kain', 'Handuk', w, len, 0.9, x, y - len / 2, z + 1.25, { r: 0.4 });
  b.box('kain', 'Handuk', w, len * 0.75, 0.9, x, y - len * 0.375, z - 1.25, { r: 0.4 });
}
function buildTowelRack(b, P) {
  const W = P.w, H = P.h, n = P.bars | 0;
  const r = rng(P.seed);
  const slot = P.style === 'dinding' ? 'aksen' : 'sekunder';
  if (P.style === 'tangga') {
    const lean = rad(10), base = H * Math.sin(lean);
    for (const sx of [-1, 1]) b.rod(slot, 'Tiang', [sx * W / 2, 0, base], [sx * W / 2, H * Math.cos(lean), 0], 1.8, 1.6, 4);
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 0.6), y = H * Math.cos(lean) * f, z = base * (1 - f);
      b.rod(slot, 'Anak tangga', [-W / 2, y, z], [W / 2, y, z], 1.2, 1.2, 14);
      if (i < P.towels) towel(b, (r() - 0.5) * 4, y, z, W * (0.6 + r() * 0.2), 30 + r() * 25);
    }
  } else if (P.style === 'berdiri') {
    b.slab(slot, 'Alas', 'tumpul', W + 8, 28, 2.5, 0, 0, 0, { r: 6, edge: 'bulat' });
    for (const sx of [-1, 1]) b.rod(slot, 'Tiang', [sx * W / 2, 2.5, 0], [sx * W / 2, H, 0], 1.6, 1.6, 14);
    for (let i = 0; i < n; i++) {
      const y = H - 4 - i * (H * 0.55 / Math.max(1, n - 1)), z = (i % 2 ? -1 : 1) * 4;
      b.rod('aksen', 'Batang', [-W / 2, y, z], [W / 2, y, z], 1, 1, 14);
      if (i < P.towels) towel(b, 0, y, z, W * 0.7, 35 + r() * 20);
    }
  } else {
    if (P.wall) wall(b, W + 60, H + 40, -6);
    for (let i = 0; i < n; i++) {
      const y = H - i * 22;
      for (const sx of [-1, 1]) b.cyl(slot, 'Braket', 1.6, 1.6, 6, sx * W / 2, y, -6 + 3, 14, { rot: [Math.PI / 2, 0, 0] }).position.set(sx * W / 2, y, -3);
      b.rod('aksen', 'Batang', [-W / 2, y, 0], [W / 2, y, 0], 1, 1, 14);
      if (i < P.towels) towel(b, 0, y, 0, W * 0.75, 40 + r() * 15);
    }
  }
}
const towelSchema = [
  G('Dimensi', [R('w', 'Lebar', 30, 90, 0.5, 50), R('h', 'Tinggi', 60, 180, 0.5, 150), R('bars', 'Jumlah batang', 1, 7, 1, 4, '')]),
  G('Model', [S('style', 'Gaya', { tangga: 'Tangga bersandar', berdiri: 'Berdiri', dinding: 'Dinding' }, 'tangga'), R('towels', 'Jumlah handuk', 0, 7, 1, 2, ''), R('seed', 'Variasi', 1, 99, 1, 2, ''), C('wall', 'Tampilkan dinding', false, (p) => p.style === 'dinding')]),
];

function buildMedCab(b, P) {
  const W = P.w, H = P.h, D = P.d, t = 1.6, y0 = P.elev;
  if (P.wall) wall(b, W + 60, y0 + H + 40, -D / 2);
  carcass(b, W, H, D, y0, t, { over: 0, topT: t });
  const ns = P.shelves | 0;
  for (let i = 1; i <= ns; i++) b.boxY('kaca', 'Rak kaca', W - 2 * t - 0.4, 0.6, D - 3, 0, y0 + H * i / (ns + 1), -0.5);
  if (P.items) {
    const r = rng(7);
    for (let i = 0; i <= ns; i++) {
      const y = i === 0 ? y0 + t : y0 + H * i / (ns + 1) + 0.6, hh = H / (ns + 1) - 4;
      let x = -W / 2 + t + 3;
      while (x < W / 2 - t - 6) { const br = 1.8 + r() * 2, bh = Math.min(hh, 8 + r() * 10); b.lathe(['dekor', 'kaca', 'buku4', 'buku5', 'interior'][Math.floor(r() * 5)], 'Botol', [[0, 0], [br, 0], [br, bh * 0.75], [br * 0.5, bh * 0.85], [br * 0.5, bh], [0, bh]], x + br, y, -1, 16); x += br * 2 + 1.5 + r() * 3; }
    }
  }
  const nd = P.doors | 0, dw = W / nd;
  for (let i = 0; i < nd; i++) {
    const left = i < nd / 2 || nd === 1;
    b.group('Pintu cermin', left ? -W / 2 + dw * i : -W / 2 + dw * (i + 1), y0 + H / 2, D / 2, (g) => {
      g.rotation.y = -(left ? 1 : -1) * rad(P.doorOpen * 1.05 * (i === 0 || i === nd - 1 ? 1 : 0.7));
      const dir = left ? 1 : -1;
      b.box('utama', 'Pintu', dw - 0.3, H - 0.3, 1.2, dir * dw / 2, 0, 0.6, { r: 0.3 });
      b.box('cermin', 'Cermin', dw - 1.4, H - 1.4, 0.3, dir * dw / 2, 0, 1.3);
    });
  }
  if (P.light) { b.boxY('aksen', 'Lampu', W * 0.8, 3, 6, 0, y0 + H + 2, D / 2 - 4, { r: 1 }); b.box('lampu', 'Lampu', W * 0.78, 0.4, 4, 0, y0 + H + 1.9, D / 2 - 3.5); }
}
const medSchema = [
  G('Dimensi', [R('w', 'Lebar', 30, 120, 0.5, 60), R('h', 'Tinggi', 40, 100, 0.5, 70), R('d', 'Dalam', 10, 25, 0.5, 15), R('elev', 'Tinggi dari lantai', 0, 160, 0.5, 110)]),
  G('Detail', [R('doors', 'Jumlah pintu', 1, 3, 1, 2, ''), R('doorOpen', 'Buka pintu', 0, 100, 1, 30, '%'), R('shelves', 'Rak kaca', 0, 4, 1, 2, ''), C('items', 'Isi botol', true), C('light', 'Lampu atas', true), C('wall', 'Tampilkan dinding', false)]),
];

// ---------------------------------------------------------------- decor
function buildClock(b, P) {
  const Dm = P.d, R0 = Dm / 2, cy = P.elev + (P.style === 'pendulum' ? 0 : R0);
  if (P.wall) wall(b, Dm + 60, cy + R0 + 40, -2);
  let fy = cy;
  if (P.style === 'pendulum') {
    const ch = Dm * 2.6, cw = Dm * 0.95;
    b.boxY('utama', 'Badan jam', cw, ch, 9, 0, P.elev, 0, { r: 1 });
    b.box('kaca', 'Kaca jendela', cw * 0.62, ch * 0.42, 0.4, 0, P.elev + ch * 0.3, 4.6);
    b.box('gelap', 'Dalam', cw * 0.6, ch * 0.4, 0.2, 0, P.elev + ch * 0.3, 3.5);
    b.group('Bandul', 0, P.elev + ch * 0.5, 3.8, (g) => { g.rotation.z = rad(P.swing); b.rod('aksen', 'Tangkai bandul', [0, 0, 0], [0, -ch * 0.32, 0], 0.4, 0.4, 6); b.cyl('aksen', 'Bandul', R0 * 0.32, R0 * 0.32, 0.8, 0, -ch * 0.36, 0, 24, { rot: [Math.PI / 2, 0, 0] }); });
    fy = P.elev + ch - R0 - 3;
  }
  const fz = P.style === 'pendulum' ? 4.6 : 0;
  b.group('Muka jam', 0, fy, fz, () => {
    const face = (r, th, slot, z = 0) => b.cyl(slot, 'Muka', r, r, th, 0, 0, z, 64, { rot: [Math.PI / 2, 0, 0] }).position.set(0, 0, z);
    if (P.style === 'sinar') {
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, L2 = R0 * (i % 2 ? 0.85 : 1); b.rod('aksen', 'Sinar', [Math.cos(a) * R0 * 0.38, Math.sin(a) * R0 * 0.38, 0], [Math.cos(a) * L2, Math.sin(a) * L2, 0], 0.5, 0.3, 6); if (!(i % 2)) b.sphere('aksen', 'Ujung sinar', 0.9, Math.cos(a) * L2, Math.sin(a) * L2, 0, 8); }
      face(R0 * 0.36, 2, 'kain');
      b.torus('aksen', 'Bingkai', R0 * 0.36, 0.7, 0, 0, 1, [0, 0, 0]);
    } else {
      face(R0 - (P.style === 'klasik' ? 1.5 : 0), P.style === 'minimalis' ? 1 : 2.4, 'kain');
      if (P.style === 'klasik' || P.style === 'pendulum') b.torus('utama', 'Bingkai', R0 - 0.5, P.style === 'pendulum' ? 1.2 : 2, 0, 0, 0.6, [0, 0, 0]);
      if (P.style === 'klasik') b.cyl('kaca', 'Kaca', R0 - 2, R0 - 2, 0.3, 0, 0, 1.6, 48, { rot: [Math.PI / 2, 0, 0] }).position.set(0, 0, 1.6);
    }
    const rr = P.style === 'sinar' ? R0 * 0.3 : R0 * 0.82;
    const z = P.style === 'minimalis' ? 0.6 : 1.3;
    for (let i = 0; i < 12; i++) {
      if (P.style === 'minimalis' && i % 3) continue;
      const a = (i / 12) * Math.PI * 2, big = i % 3 === 0;
      if (P.marks === 'titik') b.sphere('aksen', 'Penanda', big ? 0.9 : 0.55, Math.sin(a) * rr, Math.cos(a) * rr, z, 8);
      else b.box('aksen', 'Penanda', big ? 0.9 : 0.5, big ? R0 * 0.12 : R0 * 0.07, 0.3, Math.sin(a) * rr, Math.cos(a) * rr, z, { rot: [0, 0, -a] });
    }
    const hand = (len, w, ang, zz, slot) => b.group('Jarum', 0, 0, zz, (g) => { g.rotation.z = -ang; b.box(slot, 'Jarum', w, len, 0.25, 0, len / 2 - len * 0.12, 0); });
    const hA = ((P.hour % 12) + P.minute / 60) / 12 * Math.PI * 2, mA = P.minute / 60 * Math.PI * 2;
    hand(R0 * (P.style === 'sinar' ? 0.22 : 0.5), 1.1, hA, z + 0.3, 'gelap');
    hand(R0 * (P.style === 'sinar' ? 0.32 : 0.72), 0.7, mA, z + 0.6, 'gelap');
    if (P.second) hand(R0 * 0.78, 0.25, (P.minute * 7 % 60) / 60 * Math.PI * 2, z + 0.9, 'merah');
    b.cyl('aksen', 'Poros', 0.8, 0.8, 0.9, 0, 0, z + 1, 12, { rot: [Math.PI / 2, 0, 0] }).position.set(0, 0, z + 1);
  });
}
const clockSchema = [
  G('Ukuran', [R('d', 'Diameter', 20, 80, 0.5, 36), R('elev', 'Tinggi dari lantai', 0, 200, 0.5, 0)]),
  G('Model', [S('style', 'Gaya', { klasik: 'Klasik', minimalis: 'Minimalis', sinar: 'Sunburst', pendulum: 'Pendulum' }, 'klasik'), S('marks', 'Penanda', { garis: 'Garis', titik: 'Titik' }, 'garis'), C('second', 'Jarum detik', true), R('swing', 'Ayunan bandul', -15, 15, 0.5, 6, '°', (p) => p.style === 'pendulum'), C('wall', 'Tampilkan dinding', false)]),
  G('Waktu', [R('hour', 'Jam', 0, 23, 1, 10, ''), R('minute', 'Menit', 0, 59, 1, 10, '')]),
];

function coat(b, x, y, z, ry, mat, len = 70) {
  b.group('Mantel', x, y, z, (g) => {
    g.rotation.set(0.05, ry, 0);
    b.box(mat, 'Mantel', 34, len, 12, 0, -len / 2 - 4, 7, { r: 5, rot: [0.06, 0, 0] });
    b.box(mat, 'Lengan mantel', 7, len * 0.75, 8, -15, -len * 0.42 - 4, 9, { r: 3.4, rot: [0.06, 0, 0.05] });
    b.box(mat, 'Lengan mantel', 7, len * 0.75, 8, 15, -len * 0.42 - 4, 9, { r: 3.4, rot: [0.06, 0, -0.05] });
    b.box(mat, 'Kerah', 16, 7, 9, 0, -3, 5, { r: 3.4 });
  });
}
function buildCoatRack(b, P) {
  const H = P.h, n = P.hooks | 0, r = rng(P.seed);
  const items = P.items;
  if (P.style === 'tiang' || P.style === 'pohon') {
    if (P.base === 'tripod') for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.rod('sekunder', 'Kaki', [0, 30, 0], [Math.cos(a) * 32, 0, Math.sin(a) * 32], 1.8, 1.2, 14); }
    else b.lathe('utama', 'Alas', [[0, 0], [20, 0], [20, 1.5], [17, 3], [3, 3.6], [0, 3.6]], 0, 0, 0, 40);
    b.cyl('sekunder', 'Tiang', 2, 2.3, H, 0, 0, 0, 20);
    if (P.style === 'pohon') {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (i % 2) * 0.4, y0 = H - 50 + (i % 2) * 18, len = 26 + (i % 3) * 4;
        const ex = Math.cos(a) * len, ez = Math.sin(a) * len;
        b.rod('sekunder', 'Cabang', [0, y0, 0], [ex, y0 + 28, ez], 1.4, 1, 12);
        b.sphere('sekunder', 'Ujung cabang', 1.6, ex, y0 + 28, ez, 12);
        if (items && i % 2 === 0) coat(b, ex * 0.95, y0 + 26, ez * 0.95, -a + Math.PI / 2, BOOK_MATS[Math.floor(r() * 6)], 60 + r() * 30);
      }
    } else {
      b.sphere('sekunder', 'Ujung', 3, 0, H + 1, 0, 16);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, y = H - 8 - (i % 2) * 14;
        const c = Math.cos(a), s = Math.sin(a);
        b.tube('aksen', 'Kait', [[c * 2, y, s * 2], [c * 10, y - 1, s * 10], [c * 13, y + 6, s * 13]], 0.6, 3);
        b.sphere('aksen', 'Ujung kait', 1, c * 13, y + 6, s * 13, 8);
        if (items && i % 2 === 0) coat(b, c * 12, y + 2, s * 12, -a + Math.PI / 2, BOOK_MATS[Math.floor(r() * 6)], 60 + r() * 35);
      }
      if (items) b.sphere('kain', 'Topi', 9, Math.cos(1) * 15, H - 5, Math.sin(1) * 15, 16, { scale: [1, 0.55, 1] });
    }
  } else if (P.style === 'rel') {
    const W = P.w;
    for (const sx of [-1, 1]) {
      b.tube('aksen', 'Rangka rel', [[sx * W / 2, 6, -22], [sx * W / 2, 6, 22]], 1.3, 2);
      b.rod('aksen', 'Tiang rel', [sx * W / 2, 6, 0], [sx * W / 2, H, 0], 1.3, 1.3, 12);
      for (const z of [-22, 22]) b.cyl('gelap', 'Roda', 2.6, 2.6, 2, sx * W / 2, 2.6, z, 14, { rot: [Math.PI / 2, 0, 0] });
    }
    b.rod('aksen', 'Rel', [-W / 2, H, 0], [W / 2, H, 0], 1.3, 1.3, 12);
    b.rod('aksen', 'Rak bawah', [-W / 2, 12, 0], [W / 2, 12, 0], 1, 1, 12);
    if (P.shelf) b.boxY('utama', 'Rak bawah', W - 4, 1.8, 36, 0, 12, 0);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 8 + (W - 16) * (i / Math.max(1, n - 1));
      b.tube('utama', 'Hanger', [[x, H - 1, 0], [x, H - 5, 0], [x, H - 8, -20], [x, H - 8, 20], [x, H - 5, 0.01]], 0.4, 1.5, { caps: false });
      if (items) { const len = 55 + r() * 50; b.box(BOOK_MATS[Math.floor(r() * 6)], 'Baju', 2 + r() * 2, len, 40, x, H - 8 - len / 2, 0, { r: 0.6 }); }
    }
    if (items) for (let i = 0; i < 3; i++) b.boxY(BOOK_MATS[i + 2], 'Kotak', 18, 14, 26, -W / 2 + 18 + i * 22, P.shelf ? 13.8 : 12, 0, { r: 1 });
  } else {
    const W = P.w;
    if (P.wall) wall(b, W + 60, H + 30, -1.5);
    b.boxY('utama', 'Papan', W, 14, 2.4, 0, H - 14, 0, { r: 0.6 });
    if (P.shelf) { b.boxY('utama', 'Rak', W, 2.4, 22, 0, H, 9.5, { r: 0.4 }); for (const sx of [-1, 1]) b.boxY('utama', 'Penyangga', 2, 12, 18, sx * (W / 2 - 10), H - 12, 8); }
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + W * ((i + 0.5) / n), y = H - 7;
      b.tube('aksen', 'Kait', [[x, y, 1.2], [x, y - 2, 7], [x, y + 3, 9]], 0.55, 2);
      if (items && r() < 0.55) coat(b, x, y + 1, 7, 0, BOOK_MATS[Math.floor(r() * 6)], 55 + r() * 30);
    }
  }
}
const coatSchema = [
  G('Dimensi', [R('h', 'Tinggi', 120, 200, 0.5, 178), R('w', 'Lebar', 50, 180, 0.5, 110, 'cm', (p) => p.style === 'rel' || p.style === 'dinding'), R('hooks', 'Jumlah kait/hanger', 3, 14, 1, 6, '')]),
  G('Model', [S('style', 'Gaya', { tiang: 'Tiang', pohon: 'Pohon', rel: 'Rel beroda', dinding: 'Papan dinding' }, 'tiang'), S('base', 'Alas', { piringan: 'Piringan', tripod: 'Tripod' }, 'piringan', (p) => p.style === 'tiang' || p.style === 'pohon'),
    C('shelf', 'Rak', true, (p) => p.style === 'rel' || p.style === 'dinding'), C('items', 'Mantel & baju', true), R('seed', 'Variasi', 1, 99, 1, 4, '', (p) => p.items), C('wall', 'Tampilkan dinding', false, (p) => p.style === 'dinding')]),
];

function buildRug(b, P) {
  const W = P.w, L = P.shape === 'bulat' ? P.w : P.l, t = P.t, shape = P.shape;
  b.slab('kain', 'Karpet', shape, W, L, t, 0, 0, 0, { r: 8, edge: 'bulat' });
  const y = t;
  const lay = (slot, name, w, l, k) => b.slab(slot, name, shape, w, l, 0.12, 0, y + k * 0.06, 0, { r: Math.max(1, 8 - (W - w) / 4) });
  if (P.pattern === 'bingkai') { lay('aksen', 'Bingkai', W - 10, L - 10, 0); lay('kain', 'Tengah', W - 18, L - 18, 1); lay('sekunder', 'Medali', W * 0.35, L * 0.35, 2); }
  else if (P.pattern === 'lingkaran') { const n = P.stripes | 0; for (let i = 0; i < n; i++) { const k = 1 - (i + 1) / (n + 1); lay(i % 2 ? 'aksen' : 'sekunder', 'Cincin', W * k, L * k, i); } }
  else if (P.pattern === 'garis' || P.pattern === 'kotak') {
    const inset = shape === 'persegi' || shape === 'tumpul' ? 6 : Math.min(W, L) * 0.2;
    const iw = W - inset * 2, il = L - inset * 2, n = P.stripes | 0;
    if (P.pattern === 'garis') for (let i = 0; i < n; i++) b.boxY(i % 2 ? 'aksen' : 'sekunder', 'Garis', iw / (n * 2), 0.12, il, -iw / 2 + iw * ((i + 0.5) / n), y, 0);
    else for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i + j) % 2) b.boxY((i + j) % 4 === 1 ? 'aksen' : 'sekunder', 'Kotak motif', iw / n - 1, 0.12, il / n - 1, -iw / 2 + iw * ((i + 0.5) / n), y, -il / 2 + il * ((j + 0.5) / n));
  }
  if (P.fringe && (shape === 'persegi' || shape === 'tumpul')) {
    const n = Math.round(W / 2.5);
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) { const x = -W / 2 + 3 + (W - 6) * (i / (n - 1)); b.rod('sekunder', 'Rumbai', [x, 0.4, s * L / 2], [x + Math.sin(i * 1.7) * 0.6, 0.3, s * (L / 2 + 6)], 0.3, 0.3, 4); }
  }
}
const rugSchema = [
  G('Ukuran', [R('w', 'Lebar / diameter', 60, 400, 1, 200), R('l', 'Panjang', 60, 400, 1, 140, 'cm', (p) => p.shape !== 'bulat'), R('t', 'Tebal', 0.4, 4, 0.1, 1.4)]),
  G('Motif', [S('shape', 'Bentuk', pick(SHAPES, ['persegi', 'tumpul', 'oval', 'bulat', 'kapsul']), 'persegi'), S('pattern', 'Motif', { polos: 'Polos', bingkai: 'Bingkai + medali', garis: 'Garis', kotak: 'Kotak-kotak', lingkaran: 'Cincin' }, 'bingkai'), R('stripes', 'Jumlah motif', 2, 12, 1, 6, '', (p) => ['garis', 'kotak', 'lingkaran'].includes(p.pattern)), C('fringe', 'Rumbai', true, (p) => ['persegi', 'tumpul'].includes(p.shape))]),
];

function buildArt(b, P) {
  const W = P.w, H = P.h, r = rng(P.seed), fw = P.frame === 'tanpa' ? 0 : P.frameW;
  const ct = P.frame === 'tanpa' ? 3.5 : 1.2;
  let cy, tilt = 0, y0 = 0;
  if (P.mount === 'dinding') { cy = P.elev; if (P.wall) wall(b, W + 80, cy + H / 2 + 50, -2.5); }
  else if (P.mount === 'easel') {
    const top = H + 70;
    for (const sx of [-1, 1]) b.rod('sekunder', 'Kaki easel', [sx * 5, top, -2], [sx * (W * 0.35 + 12), 0, 12], 1.3, 1.3, 4);
    b.rod('sekunder', 'Kaki easel', [0, top - 4, -3], [0, 0, -50], 1.3, 1.3, 4);
    b.boxY('sekunder', 'Penyangga', W * 0.7, 2.5, 6, 0, 52, 4);
    cy = 55 + H / 2; tilt = 0.1; y0 = 0;
  } else { cy = H / 2 + fw; tilt = 0.12; }
  void y0;
  b.group('Lukisan', 0, cy, P.mount === 'easel' ? 5 : 0, (g) => {
    g.rotation.x = -tilt;
    if (fw > 0) {
      const o = outline('persegi', W + fw * 2, H + fw * 2), hole = outline('persegi', W, H);
      o.holes.push(new THREE.Path(hole.getPoints(8).reverse()));
      b.panel('sekunder', 'Bingkai', o, 3, 0, 0, 0, { round: P.frame === 'tebal' });
    }
    const mat = P.mat && fw > 0 ? Math.min(W, H) * 0.08 : 0;
    if (mat) b.box('interior', 'Passe-partout', W, H, 0.4, 0, 0, 0.4);
    b.box('utama', 'Kanvas', W - mat * 2, H - mat * 2, ct, 0, 0, mat ? 0.6 : -ct / 2 + 1.2);
    const aw = W - mat * 2 - 4, ah = H - mat * 2 - 4, z = 1.4;
    const cols = ['kain', 'aksen', 'gelap', 'buku3'];
    const add = (shape, k, x, y, zz = 0) => b.panel(cols[k % 4], 'Bentuk', shape, 0.25, x, y, z + zz * 0.15);
    if (P.art === 'lanskap') {
      add(outline('bulat', aw * 0.22, aw * 0.22), 1, aw * (r() * 0.4 - 0.2), ah * 0.18, 0);
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Shape(); const base = -ah / 2, peak = -ah * 0.05 - i * ah * 0.14;
        s.moveTo(-aw / 2, base); s.lineTo(-aw / 2, peak + r() * 6); s.quadraticCurveTo(-aw * 0.1 + r() * aw * 0.3, peak + ah * 0.25, aw / 2, peak - r() * 8); s.lineTo(aw / 2, base); s.lineTo(-aw / 2, base);
        add(s, [0, 2, 3][i], 0, 0, i + 1);
      }
    } else if (P.art === 'garis') {
      const n = 3 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) { const vert = r() < 0.5, th = 1 + r() * 4; add(outline('persegi', vert ? th : aw * (0.4 + r() * 0.6), vert ? ah * (0.4 + r() * 0.6) : th), i, (r() - 0.5) * aw * 0.6, (r() - 0.5) * ah * 0.6, i); }
    } else if (P.art === 'geometris') {
      for (let i = 0; i < 5; i++) {
        const k = r(), sz = Math.min(aw, ah) * (0.2 + r() * 0.3), x = (r() - 0.5) * (aw - sz), y = (r() - 0.5) * (ah - sz);
        let s;
        if (k < 0.4) s = outline('persegi', sz, sz * (0.5 + r()));
        else if (k < 0.7) s = outline('bulat', sz, sz);
        else { s = new THREE.Shape(); s.moveTo(-sz / 2, 0); s.absarc(0, 0, sz / 2, Math.PI, 0, true); s.lineTo(-sz / 2, 0); }
        add(s, i, x, y, i);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        const sw = aw * (0.2 + r() * 0.35), sh = ah * (0.15 + r() * 0.3);
        add(outline(r() < 0.6 ? 'oval' : 'lunak', sw, sh), i, (r() - 0.5) * (aw - sw), (r() - 0.5) * (ah - sh), i);
      }
    }
  });
}
const artSchema = [
  G('Ukuran', [R('w', 'Lebar', 20, 160, 0.5, 60), R('h', 'Tinggi', 20, 160, 0.5, 80)]),
  G('Bingkai', [S('frame', 'Bingkai', { tipis: 'Tipis', tebal: 'Tebal', tanpa: 'Kanvas tanpa bingkai' }, 'tipis'), R('frameW', 'Lebar bingkai', 1, 10, 0.5, 2.5, 'cm', (p) => p.frame !== 'tanpa'), C('mat', 'Passe-partout', true, (p) => p.frame !== 'tanpa')]),
  G('Karya', [S('art', 'Gaya', { abstrak: 'Abstrak organik', geometris: 'Geometris', garis: 'Garis', lanskap: 'Lanskap' }, 'abstrak'), R('seed', 'Variasi komposisi', 1, 99, 1, 11, '')]),
  G('Pemasangan', [S('mount', 'Posisi', { dinding: 'Dinding', easel: 'Easel', bersandar: 'Bersandar di lantai' }, 'dinding'), R('elev', 'Tinggi tengah', 40, 200, 0.5, 60, 'cm', (p) => p.mount === 'dinding'), C('wall', 'Tampilkan dinding', false, (p) => p.mount === 'dinding')]),
];

// ---------------------------------------------------------------- electronics
function buildAC(b, P) {
  const W = P.w, H = P.h, D = P.d, y0 = P.elev;
  if (P.wall) wall(b, W + 80 + (P.outdoor ? 140 : 0), y0 + H + 40, -D / 2);
  b.boxY('utama', 'Unit dalam', W, H, D, 0, y0, 0, { r: Math.min(5, H * 0.2) });
  b.box('utama', 'Panel depan', W - 2, H * 0.6, 0.6, 0, y0 + H * 0.62, D / 2 + 0.1, { r: 0.25 });
  b.box('gelap', 'Saluran udara', W - 10, 4, 0.4, 0, y0 + 4.5, D / 2 - 2.5, { r: 1 });
  b.group('Louver', 0, y0 + 5, D / 2 - 1, (g) => { g.rotation.x = rad(P.louver); b.box('utama', 'Louver', W - 12, 0.6, 7, 0, 0, 3.4, { r: 0.25 }); });
  b.box(P.on ? 'layarBiru' : 'layar', 'Display', 6, 1.6, 0.3, W * 0.3, y0 + H * 0.45, D / 2 + 0.2, { uv01: true });
  if (P.outdoor) {
    const ox = W / 2 + 60, ow = 75, oh = 55, od = 28;
    b.boxY('utama', 'Unit luar', ow, oh, od, ox, 0, 0, { r: 1.2 });
    const fx = ox - ow * 0.12, fy = oh / 2, rr = oh * 0.38, fz = od / 2;
    b.cyl('gelap', 'Lubang kipas', rr, rr, 0.3, fx, fy, fz + 0.1, 40, { rot: [Math.PI / 2, 0, 0] }).position.set(fx, fy, fz + 0.1);
    for (let k = 1; k <= 4; k++) b.torus('aksen', 'Kisi', rr * k / 4, 0.25, fx, fy, fz + 1.5, [0, 0, 0]);
    for (let s = 0; s < 8; s++) { const a = (s / 8) * Math.PI * 2; b.rod('aksen', 'Jari kisi', [fx, fy, fz + 1.5], [fx + Math.cos(a) * rr, fy + Math.sin(a) * rr, fz + 1.5], 0.2, 0.2, 4); }
    for (let i = 0; i < 3; i++) b.group('Baling', fx, fy, fz - 1, (g) => { g.rotation.z = (i / 3) * Math.PI * 2; b.sphere('gelap', 'Baling', rr * 0.4, 0, rr * 0.45, 0, 12, { scale: [0.7, 1, 0.08], rot: [0, 0.4, 0] }); });
    for (let i = 0; i < 10; i++) b.box('gelap', 'Kisi samping', 0.4, oh * 0.8, 0.3, ox + ow * 0.3 + i * 1.4 - 6, oh / 2, od / 2 + 0.1);
    for (const sx of [-1, 1]) b.boxY('aksen', 'Kaki unit', 4, 4, od + 6, ox + sx * ow * 0.35, -4, 0).position.y = 0;
    b.tube('gelap', 'Pipa', [[W / 2 - 8, y0 + 4, -D / 2 + 3], [W / 2 + 10, y0 + 2, -D / 2 + 3], [W / 2 + 22, y0 - 20, -D / 2 + 3], [ox - ow / 2 + 6, oh * 0.7, -od / 2 + 3], [ox - ow / 2 + 6, oh * 0.55, -od / 2 + 3]], 1.2, 8);
  }
}
const acSchema = [
  G('Unit dalam', [R('w', 'Lebar', 60, 120, 0.5, 82), R('h', 'Tinggi', 22, 35, 0.5, 29), R('d', 'Dalam', 16, 30, 0.5, 21), R('elev', 'Tinggi pasang', 0, 260, 1, 200), R('louver', 'Sudut louver', 0, 70, 1, 30, '°'), C('on', 'Menyala', true)]),
  G('Lainnya', [C('outdoor', 'Unit luar (outdoor)', true), C('wall', 'Tampilkan dinding', false)]),
];

function driver(b, r, x, y, z) {
  b.lathe('gelap', 'Kerucut speaker', [[0, -3.6], [r * 0.25, -3.4], [r * 0.85, -0.6], [r * 0.92, 0], [0, -3.7]], x, y, z, 32, { rot: [Math.PI / 2, 0, 0] }).position.set(x, y, z);
  b.torus('gelap', 'Surround', r * 0.92, r * 0.07, x, y, z, [0, 0, 0]);
  b.torus('aksen', 'Ring', r, r * 0.05, x, y, z + 0.2, [0, 0, 0]);
  b.sphere('aksen', 'Dust cap', r * 0.22, x, y, z - 2.6, 16, { scale: [1, 1, 0.6] });
}
function buildSpeaker(b, P) {
  const W = P.w, D = P.d, pair = P.pair;
  const xs = pair ? [-P.spread / 2, P.spread / 2] : [0];
  const tower = P.style === 'tower', sub = P.style === 'subwoofer';
  const H = tower ? P.h : sub ? W : P.h * 0.35;
  const y0 = P.style === 'rak' && P.stands ? 60 : 0;
  for (const x of xs) {
    if (y0) { b.slab('aksen', 'Alas stand', 'persegi', W + 6, D + 4, 2, x, 0, 0); for (const sx of [-1, 1]) b.rod('aksen', 'Tiang stand', [x + sx * W * 0.25, 2, 0], [x + sx * W * 0.25, y0 - 1.5, 0], 1.6, 1.6, 4); b.slab('aksen', 'Pelat stand', 'persegi', W - 2, D - 4, 1.5, x, y0 - 1.5, 0); }
    if (tower) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl('aksen', 'Spike', 1.2, 0.2, 3, x + sx * (W / 2 - 3), 0, sz * (D / 2 - 4), 10);
    const by = y0 + (tower ? 3 : 0);
    b.boxY('utama', 'Kabinet', W, H, D, x, by, 0, { r: 1 });
    b.box('sekunder', 'Baffle', W - 0.6, H - 0.6, 0.6, x, by + H / 2, D / 2, { r: 0.4 });
    const nw = sub ? 1 : P.woofers | 0;
    const wr = sub ? W * 0.38 : Math.min(W * 0.4, 9.5);
    let y = by + H - (sub ? H / 2 : 8);
    if (!sub) { b.sphere('aksen', 'Tweeter', 1.6, x, y, D / 2 + 0.5, 14, { scale: [1, 1, 0.6] }); b.torus('gelap', 'Ring tweeter', 2.6, 0.5, x, y, D / 2 + 0.3, [0, 0, 0]); y -= 7 + wr; }
    for (let i = 0; i < nw; i++) { driver(b, wr, x, y, D / 2 + 0.7); y -= wr * 2 + 3; }
    b.cyl('gelap', 'Port', 2.2, 2.2, 1, x, by + 8, D / 2 + 0.1, 20, { rot: [Math.PI / 2, 0, 0] }).position.set(x, by + 8, D / 2 + 0.1);
    if (P.grille) b.box('kain', 'Grill', W - 1.6, H - 1.6, 0.8, x, by + H / 2, D / 2 + 3.2, { r: 0.6 });
  }
}
const speakerSchema = [
  G('Dimensi', [R('h', 'Tinggi tower', 60, 130, 0.5, 100), R('w', 'Lebar', 15, 40, 0.5, 22), R('d', 'Dalam', 18, 45, 0.5, 30)]),
  G('Model', [S('style', 'Jenis', { tower: 'Tower', rak: 'Bookshelf', subwoofer: 'Subwoofer' }, 'tower'), R('woofers', 'Jumlah woofer', 1, 4, 1, 2, '', (p) => p.style !== 'subwoofer'), C('grille', 'Penutup grill', false), C('pair', 'Sepasang', true), R('spread', 'Jarak pasangan', 60, 250, 1, 120, 'cm', (p) => p.pair), C('stands', 'Stand', true, (p) => p.style === 'rak')]),
];

function monitor(b, inch, curved, x, y, z, slot = 'layarBiru') {
  const diag = inch * 2.54, k = Math.hypot(16, 9);
  const sw = diag * 16 / k, sh = diag * 9 / k;
  b.boxY('aksen', 'Alas monitor', 24, 1, 18, x, y, z - 2, { r: 1 });
  b.boxY('aksen', 'Leher monitor', 5, 14 + sh * 0.2, 2.4, x, y + 1, z - 4);
  const cy = y + 13 + sh / 2;
  if (curved) {
    b.curvedBoard('utama', 'Monitor', sw + 1.4, sh + 1.4, 2, -sw * 0.06, x, cy, z - 1, { r: 0.4 });
    b.curvedBoard('layarMenyala', 'Layar', sw, sh, 0.2, -sw * 0.06, x, cy, z + 0.05);
  } else {
    b.box('utama', 'Monitor', sw + 1.4, sh + 1.4, 1.8, x, cy, z - 1, { r: 0.4 });
    b.box(slot, 'Layar', sw, sh, 0.1, x, cy, z - 0.05, { uv01: true });
  }
}
function buildComputer(b, P) {
  let y = 0;
  if (P.desk) {
    const dp = { ...schemaDefaults(deskSchema), pedestal: 'tanpa', monitor: false, hutch: false, cable: true, legStyle: 'logam', legT: 4, w: 150, d: 70, center: false, modesty: false };
    b.group('Meja', 0, 0, 0, () => buildDesk(b, dp));
    y = dp.h;
  }
  const mz = -12;
  if (P.style === 'laptop') {
    b.box('utama', 'Laptop', 34, 1.6, 23, 0, y + 0.8, 4, { r: 0.6 });
    b.box('gelap', 'Keyboard laptop', 29, 0.2, 10, 0, y + 1.65, 1.5);
    b.box('gelap', 'Touchpad', 10, 0.1, 6, 0, y + 1.62, 10);
    b.group('Layar laptop', 0, y + 1.6, -7.5, (g) => { g.rotation.x = -rad(105 - 90); b.box('utama', 'Tutup laptop', 34, 22.5, 0.8, 0, 11.25, 0, { r: 0.5 }); b.box('layarBiru', 'Layar', 31, 19.5, 0.1, 0, 11.4, 0.45, { uv01: true }); });
  } else {
    const n = P.style === 'ganda' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const diag = P.inch * 2.54 * 16 / Math.hypot(16, 9);
      const x = n === 1 ? 0 : (i - 0.5) * (diag + 3);
      b.group('Monitor', x, 0, 0, (g) => { if (n > 1) g.rotation.y = (i ? -1 : 1) * 0.18; monitor(b, P.inch, P.curved, 0, y, mz); });
    }
  }
  if (P.keyboard) {
    b.box('gelap', 'Keyboard', 44, 1.6, 14, -4, y + 0.8, 18, { r: 0.6 });
    b.box('utama', 'Tombol', 42, 0.6, 12, -4, y + 1.8, 18, { r: 0.2 });
    b.sphere('gelap', 'Mouse', 3.2, 26, y + 1.4, 20, 16, { scale: [0.8, 0.5, 1.3] });
    b.box('kain', 'Mousepad', 26, 0.3, 22, 26, y + 0.15, 20, { r: 1.5 });
  }
  if (P.tower && P.style !== 'laptop') {
    const tx = P.desk ? 55 : 50, ty = P.desk ? 0 : y;
    b.boxY('utama', 'Casing PC', 21, 46, 44, tx, ty, -5, { r: 0.6 });
    if (P.glass) { b.box('kaca', 'Panel kaca', 0.4, 40, 38, tx - 10.7, ty + 23, -5); for (let i = 0; i < 3; i++) { b.torus('lampu', 'Kipas RGB', 5.4, 0.45, tx - 6, ty + 10 + i * 12.5, 9, [0, Math.PI / 2, 0]); b.cyl('gelap', 'Kipas', 5, 5, 1, tx - 6, 0, 9, 20, { rot: [0, 0, Math.PI / 2] }).position.set(tx - 6, ty + 10 + i * 12.5, 9); } }
    b.cyl('lampu', 'Tombol power', 0.8, 0.8, 0.4, tx, ty + 43, 17.2, 12, { rot: [Math.PI / 2, 0, 0] }).position.set(tx, ty + 43, 17.2);
  }
  if (P.speakers) for (const sx of [-1, 1]) { b.boxY('utama', 'Speaker', 10, 17, 12, sx * (P.style === 'ganda' ? 75 : 45), y, -10, { r: 0.6 }); driver(b, 3.6, sx * (P.style === 'ganda' ? 75 : 45), y + 7, -3.4); }
}
const pcSchema = [
  G('Model', [S('style', 'Perangkat', { desktop: 'PC + 1 monitor', ganda: 'PC + 2 monitor', laptop: 'Laptop' }, 'desktop'), R('inch', 'Ukuran monitor', 19, 49, 1, 27, 'inci', (p) => p.style !== 'laptop'), C('curved', 'Monitor lengkung', false, (p) => p.style !== 'laptop')]),
  G('Kelengkapan', [C('tower', 'Casing PC', true, (p) => p.style !== 'laptop'), C('glass', 'Panel kaca RGB', true, (p) => p.tower && p.style !== 'laptop'), C('keyboard', 'Keyboard & mouse', true), C('speakers', 'Speaker kecil', false), C('desk', 'Dengan meja', true)]),
];

// ---------------------------------------------------------------- outdoor
function buildLounger(b, P) {
  const L = P.l, W = P.w, H = P.h, back = L * 0.38;
  const metal = P.style === 'logam';
  const slot = metal ? 'aksen' : 'sekunder';
  const hz = L / 2 - 6, hx = W / 2 - 2;
  for (const sx of [-1, 1]) {
    if (metal) b.tube(slot, 'Rangka', [[sx * hx, H, -L / 2], [sx * hx, H, L / 2 - 4], [sx * hx, 1, L / 2 - 4]], 1.4, 3);
    else b.boxY(slot, 'Rel samping', 3.5, 8, L, sx * hx, H - 8, 0, { r: 0.5 });
    for (const sz of [-1, 1]) {
      if (metal && sz > 0) continue;
      const z = sz * hz;
      if (P.wheels && sz < 0) { b.cyl('gelap', 'Roda', 6, 6, 3, sx * (hx + 2), 6, z, 20, { rot: [0, 0, Math.PI / 2] }).position.set(sx * (hx + 2.5), 6, z); b.rod(slot, 'Kaki', [sx * hx, H - 8, z], [sx * hx, 6, z], 1.6, 1.6, metal ? 12 : 4); }
      else b.rod(slot, 'Kaki', [sx * hx, H - 4, z], [sx * hx, 0, z], 1.8, 1.8, metal ? 12 : 4);
    }
  }
  const surf = (z0, len, name) => {
    if (P.style === 'bilah') { const n = Math.max(3, Math.round(len / 8)); for (let i = 0; i < n; i++) b.boxY('utama', name, W - 6, 1.6, len / n - 1.2, 0, 0, z0 + len * ((i + 0.5) / n), { r: 0.4 }); }
    else if (P.style === 'rotan') b.boxY('utama', name, W - 5, 1.6, len, 0, 0, z0 + len / 2, { r: 0.6 });
    else b.boxY('kain', name, W - 4, 0.6, len, 0, 0.5, z0 + len / 2, { r: 0.2 });
  };
  b.group('Alas', 0, H - 1, 0, () => surf(-L / 2 + back, L - back, 'Alas'));
  b.group('Sandaran', 0, H - 1, -L / 2 + back, (g) => { g.rotation.x = rad(P.angle); surf(-back, back, 'Sandaran'); if (P.cushion) b.boxY('kain', 'Bantal sandaran', W - 6, 6, back - 2, 0, 1.6, -back / 2, { r: 2.5 }); });
  if (P.cushion) b.boxY('kain', 'Bantal', W - 6, 6, L - back - 2, 0, H + 0.6, (back) / 2 + 1, { r: 2.5 });
  if (P.cushion && P.pillow) b.group('Bantal kepala', 0, H, -L / 2 + back, (g) => { g.rotation.x = rad(P.angle); b.box('aksen', 'Bantal kepala', W * 0.6, 10, 22, 0, 13, -back + 14, { r: 4.5 }); });
}
const loungerSchema = [
  G('Dimensi', [R('l', 'Panjang', 150, 220, 0.5, 195), R('w', 'Lebar', 50, 90, 0.5, 66), R('h', 'Tinggi alas', 20, 45, 0.5, 32), R('angle', 'Sudut sandaran', 0, 75, 1, 42, '°')]),
  G('Model', [S('style', 'Gaya', { bilah: 'Bilah kayu', rotan: 'Anyaman rotan', logam: 'Logam + kain' }, 'bilah'), C('wheels', 'Roda', true, (p) => p.style !== 'logam'), C('cushion', 'Bantalan', true), C('pillow', 'Bantal kepala', true, (p) => p.cushion)]),
];

export function buildUmbrella(b, P) {
  const R0 = P.d / 2, H = P.h, n = P.ribs | 0, rise = R0 * 0.28;
  const cantilever = P.style === 'gantung';
  const cx = 0;
  let poleX = 0;
  if (cantilever) poleX = -R0 - 10;
  // base
  if (P.base === 'silang') for (const a of [0, Math.PI / 2]) b.box('utama', 'Kaki alas', 70, 6, 10, poleX, 3, 0, { r: 1.2, rot: [0, a, 0] });
  else b.lathe('utama', 'Alas', [[0, 0], [24, 0], [24, 5], [20, 9], [5, 11], [0, 11]], poleX, 0, 0, 40);
  const top = H;
  if (cantilever) {
    b.cyl('sekunder', 'Tiang', 2.6, 2.6, top + 15, poleX, 0, 0, 20);
    b.tube('sekunder', 'Lengan', [[poleX, top + 12, 0], [poleX + R0 * 0.45, top + rise + 18, 0], [cx, top + rise + 14, 0]], 2, 18);
    b.rod('sekunder', 'Penggantung', [cx, top + rise + 14, 0], [cx, top + rise, 0], 1.4, 1.4, 12);
  } else b.cyl('sekunder', 'Tiang', 2, 2, top + rise + 4, 0, 0, 0, 20);
  b.group('Kanopi', cx, top, 0, (g) => {
    g.rotation.z = cantilever ? 0 : rad(P.tilt);
    const ph = P.shape === 'persegi' ? Math.PI / 4 : 0, seg = P.shape === 'persegi' ? 4 : n;
    const Rr = P.shape === 'persegi' ? R0 * Math.SQRT2 : R0;
    latheN(b, 'kain', 'Kanopi', [[0, rise], [Rr * 0.5, rise * 0.62], [Rr, 0], [Rr - 0.5, -0.4], [Rr * 0.5, rise * 0.62 - 0.4], [0, rise - 0.4]], 0, 0, 0, seg, ph);
    if (P.valance) latheN(b, 'kain', 'Rumbai kanopi', [[Rr, 0], [Rr, -14], [Rr - 0.3, -14], [Rr - 0.3, 0]], 0, 0, 0, seg, ph);
    for (let i = 0; i < seg; i++) {
      const a = ph + (i / seg) * Math.PI * 2;
      const ex = Math.sin(a) * Rr * 0.97, ez = Math.cos(a) * Rr * 0.97;
      b.rod('aksen', 'Jari payung', [0, rise - 1, 0], [ex, -0.6, ez], 0.4, 0.4, 6);
      b.rod('aksen', 'Penyangga jari', [0, rise * 0.15 - 6, 0], [ex * 0.45, rise * 0.6 - 1, ez * 0.45], 0.3, 0.3, 6);
    }
    b.sphere('sekunder', 'Puncak', 2.4, 0, rise + 2, 0, 12);
  });
}
const umbrellaSchema = [
  G('Ukuran', [R('d', 'Diameter', 150, 400, 1, 270), R('h', 'Tinggi tepi', 180, 260, 0.5, 215), R('ribs', 'Jumlah jari', 6, 12, 1, 8, '')]),
  G('Model', [S('style', 'Tiang', { tengah: 'Tiang tengah', gantung: 'Cantilever (samping)' }, 'tengah'), S('shape', 'Kanopi', { payung: 'Bulat / segi banyak', persegi: 'Persegi' }, 'payung'), C('valance', 'Rumbai tepi', true), R('tilt', 'Kemiringan', -25, 25, 0.5, 0, '°', (p) => p.style === 'tengah'), S('base', 'Alas', { piringan: 'Piringan beton', silang: 'Silang' }, 'piringan')]),
];

function buildPicnic(b, P) {
  const L = P.l, W = P.w, H = P.h, pw = P.plank;
  const planks = (cx, cy, cz, len, wid, t, name) => { const n = Math.max(2, Math.round(wid / pw)), w = wid / n; for (let i = 0; i < n; i++) b.boxY('utama', name, len, t, w - 1, cx, cy, cz - wid / 2 + w * (i + 0.5), { r: 0.5 }); };
  planks(0, H - 4, 0, L, W, 4, 'Papan meja');
  const bz = W / 2 + 25, bh = 45, bw = 28;
  const lx = L / 2 - 28;
  if (P.style === 'menyatu') {
    for (const sx of [-1, 1]) {
      const x = sx * lx;
      b.boxY('sekunder', 'Palang atas', 6, 8, W - 8, x, H - 12, 0);
      b.boxY('sekunder', 'Palang dudukan', 6, 8, bz * 2 + bw, x, bh - 12, 0);
      for (const sz of [-1, 1]) b.rod('sekunder', 'Kaki A', [x, H - 8, sz * W * 0.3], [x, 0, sz * (bz + bw * 0.3)], 3, 3, 4);
    }
    b.rod('sekunder', 'Penguat', [-lx, bh - 8, 0], [lx, bh - 8, 0], 2.4, 2.4, 4);
    for (const sz of [-1, 1]) planks(0, bh - 4, sz * bz, L, bw, 4, 'Papan bangku');
  } else {
    for (const sx of [-1, 1]) { const x = sx * lx; b.boxY('sekunder', 'Kaki meja', 6, H - 4, 6, x, 0, -W / 2 + 10); b.boxY('sekunder', 'Kaki meja', 6, H - 4, 6, x, 0, W / 2 - 10); b.boxY('sekunder', 'Palang', 6, 6, W - 6, x, H - 10, 0); b.boxY('sekunder', 'Palang bawah', 5, 5, W - 20, x, 15, 0); }
    for (const sz of [-1, 1]) {
      planks(0, bh - 4, sz * (bz + 6), L * 0.95, bw, 4, 'Papan bangku');
      for (const sx of [-1, 1]) { b.boxY('sekunder', 'Kaki bangku', 5, bh - 4, 5, sx * lx, 0, sz * (bz + 6) - bw / 2 + 5); b.boxY('sekunder', 'Kaki bangku', 5, bh - 4, 5, sx * lx, 0, sz * (bz + 6) + bw / 2 - 5); }
    }
  }
  if (P.umbrella) b.group('Payung', 0, 0, 0, () => buildUmbrella(b, { d: Math.max(180, L * 1.1), h: H + 120, ribs: 8, style: 'tengah', shape: 'payung', valance: true, tilt: 0, base: 'silang' }));
}
const picnicSchema = [
  G('Dimensi', [R('l', 'Panjang', 120, 260, 0.5, 180), R('w', 'Lebar meja', 60, 100, 0.5, 76), R('h', 'Tinggi', 65, 80, 0.5, 75), R('plank', 'Lebar papan', 8, 25, 0.5, 14)]),
  G('Model', [S('style', 'Gaya', { menyatu: 'Menyatu (A-frame)', terpisah: 'Meja + 2 bangku' }, 'menyatu'), C('umbrella', 'Payung', false)]),
];

function buildSwing(b, P) {
  const st = P.style;
  if (st === 'telur') {
    const H = 195, er = P.w / 2, eh = er * 2.3, ey = 25;
    b.slab('sekunder', 'Alas', 'bulat', 80, 80, 3, 0, 0, -10, { edge: 'bulat' });
    b.tube('sekunder', 'Rangka C', [[0, 3, -48], [0, 130, -62], [0, H + 8, -42], [0, H + 6, -4]], 2.6, 30);
    b.rod('aksen', 'Rantai', [0, H + 5, -4], [0, ey + eh + 2, -4], 0.6, 0.6, 8);
    const open = rad(P.opening), prof = [];
    for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + (i / 16) * Math.PI; prof.push([Math.max(0.01, er * Math.cos(a) * (1 - 0.15 * Math.max(0, Math.sin(a)))), eh / 2 + eh / 2 * Math.sin(a)]); }
    const inner = prof.slice().reverse().map(([r, y]) => [Math.max(0.01, r - 2.4), y]);
    b.group('Kursi telur', 0, ey, -4, (g) => {
      g.rotation.x = rad(P.swing);
      b.lathe('utama', 'Cangkang telur', [...prof, ...inner], 0, 0, 0, 48, { phiStart: open / 2, phiLength: Math.PI * 2 - open });
      b.lathe('kain', 'Bantal', [[0, 0], [er * 0.75, 0], [er * 0.8, 6], [er * 0.7, 10], [0, 10]], 0, eh * 0.2, 0, 32);
      b.box('kain', 'Bantal sandaran', er * 1.1, eh * 0.4, 9, 0, eh * 0.5, -er * 0.55, { r: 4, rot: [0.2, 0, 0] });
    });
  } else if (st === 'bangku') {
    const W = P.w + 40, H = 200;
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 10);
      b.rod('sekunder', 'Kaki A', [x, H, 0], [x, 0, -60], 3, 3, 4); b.rod('sekunder', 'Kaki A', [x, H, 0], [x, 0, 60], 3, 3, 4);
      b.boxY('sekunder', 'Palang kaki', 6, 6, 100, x, 40, 0);
    }
    b.boxY('sekunder', 'Balok atas', W + 30, 10, 10, 0, H, 0);
    b.group('Ayunan', 0, H, 0, (g) => {
      g.rotation.x = rad(P.swing);
      const sy = -H + 50, sw = P.w;
      for (const sx of [-1, 1]) { b.rod('aksen', 'Rantai', [sx * (sw / 2 - 4), 0, 0], [sx * (sw / 2 - 4), sy + 4, 18], 0.5, 0.5, 6); b.rod('aksen', 'Rantai', [sx * (sw / 2 - 4), 0, 0], [sx * (sw / 2 - 4), sy + 40, -22], 0.5, 0.5, 6); }
      for (let i = 0; i < 5; i++) b.boxY('utama', 'Bilah dudukan', sw, 2, 7, 0, sy, -18 + i * 8.4, { r: 0.4 });
      b.group('Sandaran ayunan', 0, sy, -20, (gg) => { gg.rotation.x = -0.25; for (let i = 0; i < 4; i++) b.boxY('utama', 'Bilah sandaran', sw, 7, 2, 0, 6 + i * 9.5, 0, { r: 0.4 }); });
      for (const sx of [-1, 1]) { b.boxY('utama', 'Lengan', 4, 2.4, 44, sx * (sw / 2 - 2), sy + 22, -1, { r: 0.6 }); b.boxY('utama', 'Tiang lengan', 3.5, 22, 3.5, sx * (sw / 2 - 2), sy, 18); }
      if (P.cushion) b.boxY('kain', 'Bantal', sw - 6, 6, 38, 0, sy + 2, -2, { r: 2.5 });
    });
  } else {
    const L = P.w * 2.2 + 80, hY = 110;
    for (const sx of [-1, 1]) b.tube('sekunder', 'Rangka hammock', [[sx * (L / 2 - 30), 2, 0], [sx * (L / 2), 2, 0], [sx * (L / 2 + 5), hY + 20, 0]], 2.4, 20);
    b.rod('sekunder', 'Rangka bawah', [-(L / 2 - 30), 2, 0], [L / 2 - 30, 2, 0], 2.4, 2.4, 12);
    for (const sx of [-1, 1]) for (const z of [-40, 40]) b.rod('sekunder', 'Kaki', [sx * (L / 2 - 30), 2, 0], [sx * (L / 2 - 30), 2, z], 2, 2, 12);
    const hl = L - 90, hw = P.w;
    const geo = new THREE.PlaneGeometry(hl, hw, Math.round(30 * b.q), Math.round(10 * b.q));
    geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const u = pa.getX(i) / (hl / 2), v = pa.getZ(i) / (hw / 2);
      const sag = 42 * (1 - u * u), curl = 9 * v * v * (1 - 0.6 * u * u);
      pa.setY(i, hY - sag + curl + 12);
      pa.setZ(i, pa.getZ(i) * (1 - 0.65 * u * u));
    }
    geo.computeVertexNormals();
    b.add(doubleSided(boxUV(geo)), 'kain', 'Kain hammock');
    for (const sx of [-1, 1]) for (const z of [-hw / 2 * 0.35, 0, hw / 2 * 0.35]) b.rod('aksen', 'Tali', [sx * hl / 2, hY + 12, z * 0.35], [sx * (L / 2 + 5), hY + 20, 0], 0.25, 0.25, 4);
    if (P.cushion) b.box('kain', 'Bantal', 30, 10, 40, -hl * 0.36, hY - 4, 0, { r: 4.5, rot: [0, 0, -0.5] });
  }
}
const swingSchema = [
  G('Model', [S('style', 'Jenis', { telur: 'Kursi telur gantung', bangku: 'Ayunan bangku', hammock: 'Hammock' }, 'telur'), R('w', 'Lebar', 60, 160, 0.5, 90), R('opening', 'Bukaan depan', 60, 200, 1, 120, '°', (p) => p.style === 'telur'), R('swing', 'Ayunan', -20, 20, 0.5, 0, '°', (p) => p.style !== 'hammock'), C('cushion', 'Bantal', true)]),
];

// ---------------------------------------------------------------- registry
export const TYPES3 = {
  pulauDapur: { cat: 'dapur', label: 'Pulau dapur', schema: islandSchema, build: buildIsland,
    slots: { utama: 'Kabinet', sekunder: 'Top marmer', aksen: 'Logam & kran', kain: 'Bantalan stool & kap' },
    mats: { utama: { c: '#2f4a66', f: 'satin' }, sekunder: { c: '#ece9e4', f: 'marmer' }, aksen: BRASS, kain: { c: '#e8e0cf', f: 'kulit' } },
    styles: { 'Waterfall': { waterfall: true }, 'Dengan kompor': { cooktop: true, sink: false }, 'Kayu rustik': { waterfall: false, frontStyle: 'shaker', stools: 2 } } },
  kompor: { cat: 'dapur', label: 'Kompor + oven', schema: rangeSchema, build: buildRange,
    slots: { utama: 'Badan', aksen: 'Kenop & gagang' },
    mats: { utama: { c: '#c7c9cc', f: 'logam' }, aksen: { c: '#2b2b2d', f: 'satin' } },
    styles: { 'Gas 4 tungku': { type: 'gas', burners: 4 }, 'Induksi': { type: 'induksi', backguard: false }, 'Lebar 6 tungku': { burners: 6, w: 90 } } },
  microwave: { cat: 'dapur', label: 'Microwave', schema: microSchema, build: buildMicrowave,
    slots: { utama: 'Badan', aksen: 'Tombol & gagang' },
    mats: { utama: { c: '#2a2a2c', f: 'satin' }, aksen: CHROME, kaca: { c: '#e8f0f0', f: 'kaca' } },
    styles: { 'Hitam': {}, 'Retro': { handleStyle: 'gagang' }, 'Terbuka': { doorOpen: 80 } } },
  dispenser: { cat: 'dapur', label: 'Dispenser air', schema: dispSchema, build: buildDispenser,
    slots: { utama: 'Badan', aksen: 'Tatakan' },
    mats: { utama: WHITE, aksen: { c: '#9aa0a6', f: 'satin' } },
    styles: { 'Galon atas': { type: 'atas' }, 'Galon bawah': { type: 'bawah', doorOpen: 60 } } },
  rakPiring: { cat: 'dapur', label: 'Rak piring', schema: dishSchema, build: buildDishRack,
    slots: { aksen: 'Kawat', utama: 'Nampan & wadah' },
    mats: { aksen: CHROME, utama: { c: '#f2f0ec', f: 'satin' } },
    styles: { '2 tingkat': { tiers: 2 }, '1 tingkat': { tiers: 1, plates: 8 } } },

  wastafel: { cat: 'mandi', label: 'Wastafel kabinet', schema: bathVanSchema, build: buildBathVanity,
    slots: { utama: 'Kabinet', sekunder: 'Top', aksen: 'Kran & logam', kain: 'Handuk' },
    mats: { utama: WOOD, sekunder: { c: '#ece9e4', f: 'marmer' }, aksen: BLACK, kain: { c: '#e9e4da', f: 'kain' } },
    styles: { 'Gantung': { mount: 'gantung', basin: 'atas' }, 'Tanam': { basin: 'tanam', mount: 'lantai', front: 'pintu', frontStyle: 'shaker', handle: 'knob' }, 'Kaki logam': { mount: 'kaki', front: 'terbuka', basinShape: 'kotak' } } },
  toilet: { cat: 'mandi', label: 'Kloset', schema: toiletSchema, build: buildToilet,
    slots: { utama: 'Keramik', sekunder: 'Dudukan', aksen: 'Logam', kain: 'Ember' },
    mats: { utama: WHITE, sekunder: WHITE, aksen: CHROME, kain: { c: '#6f8fa3', f: 'glossy' } },
    styles: { 'Duduk': { style: 'duduk' }, 'Gantung': { style: 'gantung' }, 'Jongkok': { style: 'jongkok' } } },
  bathtub: { cat: 'mandi', label: 'Bathtub', schema: tubSchema, build: buildBathtub,
    slots: { sekunder: 'Apron', aksen: 'Kran & kaki', kain: 'Keset' },
    mats: { sekunder: { c: '#e9e6e0', f: 'satin' }, aksen: BRASS, kain: { c: '#c8b48a', f: 'kain' }, utama: WHITE },
    styles: { 'Berdiri': { style: 'berdiri' }, 'Clawfoot': { style: 'kaki', faucet: 'dinding' }, 'Built-in': { style: 'tanam', faucet: 'dinding' } } },
  rakHanduk: { cat: 'mandi', label: 'Rak handuk', schema: towelSchema, build: buildTowelRack,
    slots: { sekunder: 'Rangka', aksen: 'Batang logam', kain: 'Handuk' },
    mats: { sekunder: WOOD, aksen: BLACK, kain: { c: '#e9e4da', f: 'kain' } },
    styles: { 'Tangga': { style: 'tangga' }, 'Berdiri': { style: 'berdiri', h: 90, bars: 2 }, 'Dinding': { style: 'dinding', h: 110, bars: 3 } } },
  lemariCermin: { cat: 'mandi', label: 'Lemari cermin', schema: medSchema, build: buildMedCab,
    slots: { utama: 'Badan', aksen: 'Lampu' },
    mats: { utama: { c: '#f2f0ec', f: 'satin' }, aksen: CHROME },
    styles: { '2 pintu': { doors: 2 }, '3 pintu': { doors: 3, w: 90 }, 'Satu pintu': { doors: 1, w: 45, light: false } } },

  lampuGantung: { cat: 'dekor', label: 'Lampu gantung', schema: pendantSchema, build: buildPendant,
    slots: { kain: 'Kap lampu', utama: 'Kanopi', aksen: 'Fiting' },
    mats: { kain: { c: '#1f3b37', f: 'satin' }, utama: { c: '#2b2b2d', f: 'satin' }, aksen: BRASS },
    styles: { 'Berjajar': { layout: 'baris', count: 3 }, 'Cluster bola': { layout: 'cluster', count: 6, shade: 'bola', shadeD: 18 }, 'Tunggal besar': { count: 1, shade: 'kerucut', shadeD: 50, shadeH: 30 }, 'Bohlam': { shade: 'bohlam', count: 5, layout: 'cluster' } } },
  jamDinding: { cat: 'dekor', label: 'Jam dinding', schema: clockSchema, build: buildClock,
    slots: { utama: 'Bingkai / badan', kain: 'Muka jam', aksen: 'Penanda & poros' },
    mats: { utama: { c: '#2b2b2d', f: 'satin' }, kain: { c: '#f4f1ea', f: 'matte' }, aksen: { c: '#2b2b2d', f: 'satin' } },
    styles: { 'Klasik': { style: 'klasik' }, 'Minimalis': { style: 'minimalis', second: false }, 'Sunburst': { style: 'sinar' }, 'Pendulum': { style: 'pendulum', d: 26 } } },
  gantunganBaju: { cat: 'dekor', label: 'Gantungan baju', schema: coatSchema, build: buildCoatRack,
    slots: { sekunder: 'Tiang', utama: 'Alas & papan', aksen: 'Kait', kain: 'Topi' },
    mats: { sekunder: WOOD, utama: { c: '#2b2b2d', f: 'satin' }, aksen: BLACK, kain: { c: '#c8b48a', f: 'kain' } },
    styles: { 'Tiang': { style: 'tiang' }, 'Pohon': { style: 'pohon' }, 'Rel beroda': { style: 'rel', h: 160, hooks: 9 }, 'Dinding': { style: 'dinding', h: 170, hooks: 5 } } },
  karpet: { cat: 'dekor', label: 'Karpet', schema: rugSchema, build: buildRug,
    slots: { kain: 'Dasar', aksen: 'Motif 1', sekunder: 'Motif 2 / rumbai' },
    mats: { kain: { c: '#e9e1cc', f: 'kain' }, aksen: { c: '#8a3b2e', f: 'kain' }, sekunder: { c: '#2f4a66', f: 'kain' } },
    styles: { 'Klasik': { pattern: 'bingkai' }, 'Garis': { pattern: 'garis', stripes: 7, fringe: true }, 'Bulat': { shape: 'bulat', pattern: 'lingkaran', w: 160 }, 'Kotak-kotak': { pattern: 'kotak', stripes: 6, fringe: false } } },
  lukisan: { cat: 'dekor', label: 'Lukisan', schema: artSchema, build: buildArt,
    slots: { utama: 'Kanvas', sekunder: 'Bingkai', kain: 'Warna 1', aksen: 'Warna 2' },
    mats: { utama: { c: '#f1ebe0', f: 'matte' }, sekunder: { c: '#2b2b2d', f: 'satin' }, kain: { c: '#c56d4b', f: 'matte' }, aksen: { c: '#2f4a66', f: 'matte' } },
    styles: { 'Abstrak': { art: 'abstrak' }, 'Bauhaus': { art: 'geometris', frame: 'tanpa' }, 'Lanskap': { art: 'lanskap', w: 90, h: 60 }, 'Di easel': { mount: 'easel', art: 'lanskap', frame: 'tanpa' } } },

  ac: { cat: 'alat', label: 'AC split', schema: acSchema, build: buildAC,
    slots: { utama: 'Badan', aksen: 'Kisi' },
    mats: { utama: WHITE, aksen: { c: '#9aa0a6', f: 'satin' } },
    styles: { 'Set lengkap': { outdoor: true }, 'Unit dalam': { outdoor: false, elev: 0 } } },
  speaker: { cat: 'alat', label: 'Speaker', schema: speakerSchema, build: buildSpeaker,
    slots: { utama: 'Kabinet', sekunder: 'Baffle', aksen: 'Ring & stand', kain: 'Grill' },
    mats: { utama: { c: '#6b4a33', f: 'kayu' }, sekunder: { c: '#1f1f21', f: 'satin' }, aksen: { c: '#9aa0a6', f: 'logam' }, kain: { c: '#3a3d42', f: 'kain' } },
    styles: { 'Tower': { style: 'tower' }, 'Bookshelf': { style: 'rak' }, 'Subwoofer': { style: 'subwoofer', w: 35, d: 38, pair: false }, 'Dengan grill': { grille: true } } },
  komputer: { cat: 'alat', label: 'Komputer', schema: pcSchema, build: buildComputer,
    slots: { utama: 'Bodi', aksen: 'Stand', kain: 'Mousepad', sekunder: 'Kaki meja' },
    mats: { utama: { c: '#1d1d1f', f: 'satin' }, aksen: { c: '#9aa0a6', f: 'logam' }, kain: { c: '#3a3d42', f: 'kain' }, sekunder: WOOD, kaca: { c: '#dfe8ea', f: 'kaca' } },
    styles: { 'Workstation': { style: 'desktop' }, 'Dua monitor': { style: 'ganda', inch: 24 }, 'Gaming': { curved: true, inch: 34, glass: true }, 'Laptop': { style: 'laptop' } } },

  kursiJemur: { cat: 'luar', label: 'Kursi berjemur', schema: loungerSchema, build: buildLounger,
    slots: { utama: 'Alas', sekunder: 'Rangka kayu', aksen: 'Bantal kepala', kain: 'Bantalan' },
    mats: { utama: { c: '#a87b55', f: 'kayu' }, sekunder: { c: '#a87b55', f: 'kayu' }, aksen: { c: '#e3b8b0', f: 'kain' }, kain: { c: '#efe9dd', f: 'kain' } }, softAksen: true,
    styles: { 'Kayu jati': { style: 'bilah' }, 'Rotan': { style: 'rotan' }, 'Logam + kain': { style: 'logam', cushion: false } } },
  payung: { cat: 'luar', label: 'Payung taman', schema: umbrellaSchema, build: buildUmbrella,
    slots: { kain: 'Kanopi', sekunder: 'Tiang', aksen: 'Jari-jari', utama: 'Alas' },
    mats: { kain: { c: '#e9e1cc', f: 'kain' }, sekunder: WOOD, aksen: { c: '#d9d3c9', f: 'satin' }, utama: { c: '#5a5a5c', f: 'matte' } },
    styles: { 'Klasik': { style: 'tengah' }, 'Cantilever': { style: 'gantung', base: 'silang', d: 300 }, 'Persegi': { shape: 'persegi', valance: false } } },
  mejaPiknik: { cat: 'luar', label: 'Meja piknik', schema: picnicSchema, build: buildPicnic,
    slots: { utama: 'Papan', sekunder: 'Rangka', kain: 'Kanopi payung', aksen: 'Jari payung' },
    mats: { utama: { c: '#a87b55', f: 'kayu' }, sekunder: { c: '#8a6a4f', f: 'kayu' }, kain: { c: '#c56d4b', f: 'kain' }, aksen: { c: '#d9d3c9', f: 'satin' } },
    styles: { 'A-frame': { style: 'menyatu' }, 'Meja + bangku': { style: 'terpisah' }, 'Dengan payung': { umbrella: true } } },
  ayunan: { cat: 'luar', label: 'Ayunan', schema: swingSchema, build: buildSwing,
    slots: { utama: 'Dudukan / anyaman', sekunder: 'Rangka', kain: 'Bantal / kain', aksen: 'Rantai & bantal' },
    mats: { utama: { c: '#d0ab73', f: 'anyaman' }, sekunder: { c: '#2b2b2d', f: 'satin' }, kain: { c: '#efe9dd', f: 'kain' }, aksen: { c: '#8a8d91', f: 'logam' } },
    styles: { 'Kursi telur': { style: 'telur' }, 'Ayunan teras': { style: 'bangku', w: 120 }, 'Hammock': { style: 'hammock', w: 90 } } },
};
