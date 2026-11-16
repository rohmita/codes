// Extended catalogue, part 1: seating, tables, bedroom, storage.
import * as THREE from 'three';
import { boxUV, outline } from './geo.js';
import { legs, radialLegs, pedestal, handle, front, drawer, door, carcass, LEG_LABELS, HANDLE_LABELS, FRONT_LABELS, rad, clamp, rng } from './parts.js';
import {
  R, S, C, G, pick, SHAPES, EDGES, legGroup, handleGroup,
  chairSchema, buildChair, stoolSchema, buildStool, sideSchema, buildSide, coffeeSchema, buildCoffee,
  cabinetBody, fillBooks, mirrorShape, BOOK_MATS, baseFor, withDefaults, schemaDefaults,
} from './types.js';

const WOOD = { c: '#c49a6c', f: 'kayu' };
const BLACK = { c: '#2b2b2d', f: 'logam' };
const BRASS = { c: '#b8925a', f: 'logam' };
const wall = (b, w, h, z) => b.boxY('dinding', 'Dinding', w, h, 2, 0, 0, z - 1);

// ---------------------------------------------------------------- seating
function buildOffice(b, P) {
  const H = P.seatH, W = P.seatW, D = P.seatD;
  pedestal(b, { legT: 4, pedBase: P.base }, P.baseR / 0.36, H - 12, 'aksen');
  b.boxY('gelap', 'Mekanisme', 22, 4, 20, 0, H - 12, 0, { r: 1 });
  b.boxY('utama', 'Cangkang dudukan', W - 2, 2, D - 2, 0, H - 9, 0, { r: 0.9 });
  b.boxY('kain', 'Dudukan', W, 7.5, D, 0, H - 7.5, 0, { r: 3.4 });
  b.tube('utama', 'Penyangga sandaran', [[0, H - 9, -D / 2 + 8], [0, H - 9, -D / 2 - 3], [0, H + 14, -D / 2 - 4]], 1.8, 4);
  b.group('Sandaran', 0, H + 4, -D / 2 - 2, (g) => {
    g.rotation.x = -rad(P.backTilt);
    const bw = W * 0.94, bh = P.backH;
    if (P.backStyle === 'mesh') {
      const o = outline('lunak', bw, bh), hole = outline('lunak', bw - 6, bh - 6);
      o.holes.push(new THREE.Path(hole.getPoints(48).reverse()));
      b.panel('utama', 'Rangka sandaran', o, 2.4, 0, bh / 2 + 2, 0, { round: true });
      b.panel('kain', 'Mesh sandaran', outline('lunak', bw - 5, bh - 5), 0.4, 0, bh / 2 + 2, 0);
    } else {
      b.curvedBoard('kain', 'Jok sandaran', bw, bh, P.backStyle === 'eksekutif' ? 9 : 6, 2.5, 0, bh / 2 + 2, 0, { r: 2.5 });
      if (P.backStyle === 'eksekutif') for (let i = 1; i < 4; i++) b.box('kain', 'Jahitan', bw - 8, 1.2, 1, 0, 2 + bh * (i / 4), 4.6 + 2.5 * 0.2, { r: 0.5 });
    }
    if (P.lumbar) b.curvedBoard('kain', 'Penopang lumbar', bw * 0.7, 9, 4, 3, 0, bh * 0.25, 3.5, { r: 2 });
    if (P.headrest) {
      b.rod('utama', 'Tiang headrest', [0, bh, -1.5], [0, bh + 9, -1.5], 1.2, 1.2, 10);
      b.curvedBoard('kain', 'Headrest', W * 0.55, 13, 6, 2, 0, bh + 13, 0, { r: 2.5 });
    }
  });
  if (P.arms) for (const sx of [-1, 1]) {
    b.rod('gelap', 'Tiang lengan', [sx * (W / 2 - 3), H - 9, -2], [sx * (W / 2 + 1.5), H + P.armH, -2], 1.6, 1.6, 4);
    b.boxY('gelap', 'Bantalan lengan', 7, 2.6, 26, sx * (W / 2 + 1.5), H + P.armH, 0, { r: 1.2 });
  }
}
const officeSchema = [
  G('Dimensi', [R('seatW', 'Lebar dudukan', 42, 62, 0.5, 50), R('seatD', 'Dalam dudukan', 40, 56, 0.5, 48), R('seatH', 'Tinggi dudukan', 38, 60, 0.5, 47)]),
  G('Sandaran', [
    S('backStyle', 'Model', { mesh: 'Mesh', jok: 'Berjok', eksekutif: 'Eksekutif' }, 'mesh'),
    R('backH', 'Tinggi sandaran', 30, 85, 0.5, 56), R('backTilt', 'Kemiringan', 0, 25, 0.5, 9, '°'),
    C('lumbar', 'Penopang lumbar', true), C('headrest', 'Sandaran kepala', false),
  ]),
  G('Lengan & alas', [
    C('arms', 'Sandaran tangan', true), R('armH', 'Tinggi lengan', 14, 32, 0.5, 22, 'cm', (p) => p.arms),
    S('base', 'Alas', { bintang: 'Bintang + roda', silang: 'Silang', piringan: 'Piringan' }, 'bintang'), R('baseR', 'Jari-jari alas', 22, 40, 0.5, 31),
  ]),
];

function buildRocker(b, P) {
  const t = 3.5, inset = 2;
  const hx = P.seatW / 2 - inset - t / 2, hz = P.seatD / 2 - inset - t / 2;
  const R0 = P.rockR, rr = 1.8;
  const yA = (z) => rr + (z * z) / (2 * R0);
  const lift = yA(hz) + rr - 0.6;
  const cp = { ...schemaDefaults(chairSchema), seatW: P.seatW, seatD: P.seatD, seatH: P.seatH - lift, backStyle: P.backStyle, backH: P.backH, backTilt: P.backTilt, slats: P.slats, backCurve: 4, legStyle: 'bulat', legT: t, legTaper: 0, legSplay: 0, legInset: inset, arms: P.arms, armH: 20, apron: true, stretch: 'none', cushion: P.cushion, seatShape: 'lunak' };
  b.group('Kursi', 0, lift, 0, () => buildChair(b, cp));
  for (const sx of [-1, 1]) {
    const pts = []; const L = P.rockL / 2;
    for (let i = 0; i <= 14; i++) { const z = -L + (2 * L * i) / 14; pts.push([sx * hx, yA(z), z]); }
    b.tube('sekunder', 'Penggoyang', pts, rr, 2);
  }
}
const rockerSchema = [
  G('Dimensi', [R('seatW', 'Lebar dudukan', 40, 65, 0.5, 52), R('seatD', 'Dalam dudukan', 38, 60, 0.5, 48), R('seatH', 'Tinggi dudukan', 35, 55, 0.5, 44)]),
  G('Sandaran', [
    S('backStyle', 'Model', { spindle: 'Spindle', bilah_v: 'Bilah vertikal', tangga: 'Tangga', jok: 'Berjok', lengkung: 'Papan lengkung' }, 'spindle'),
    R('backH', 'Tinggi sandaran', 30, 80, 0.5, 60), R('backTilt', 'Kemiringan', 0, 25, 0.5, 14, '°'),
    R('slats', 'Jumlah bilah', 2, 12, 1, 7, '', (p) => ['spindle', 'bilah_v'].includes(p.backStyle)),
    C('arms', 'Sandaran tangan', true), C('cushion', 'Bantalan duduk', false),
  ]),
  G('Penggoyang', [R('rockL', 'Panjang penggoyang', 70, 130, 0.5, 100), R('rockR', 'Jari-jari lengkung', 70, 250, 1, 130)]),
];

function buildOttoman(b, P) {
  const W = P.w, D = P.shape === 'bulat' ? P.w : P.d, H = P.h;
  const round = P.shape === 'bulat';
  let y0 = 0;
  if (P.style !== 'pouf' && P.legStyle !== 'tanpa') {
    if (round) radialLegs(b, { ...P, legTaper: 0.3, legSplay: 6 }, 4, W / 2 - 6, P.legH);
    else legs(b, { ...P, legTaper: 0.3, legSplay: 4, legInset: 4, stretch: 'none' }, W, D, P.legH);
    y0 = P.legH;
  }
  const bh = H - y0;
  if (P.style === 'pouf') {
    const r = W / 2;
    if (round) b.lathe('kain', 'Pouf', [[0, 0], [r * 0.82, 0], [r * 0.97, bh * 0.16], [r, bh * 0.5], [r * 0.97, bh * 0.84], [r * 0.82, bh], [0, bh * 0.97]], 0, 0, 0, 40);
    else b.boxY('kain', 'Pouf', W, bh, D, 0, 0, 0, { r: Math.min(bh, W) * 0.3 });
    b.sphere('kain', 'Kancing', 1.4, 0, bh - 0.4, 0, 10);
  } else if (P.style === 'anyaman') {
    if (round) b.cyl('utama', 'Badan anyaman', W / 2, W / 2 - 1, bh - 6, 0, y0, 0, 40);
    else b.boxY('utama', 'Badan anyaman', W, bh - 6, D, 0, y0, 0, { r: 1.2 });
    b.slab('kain', 'Bantalan', round ? 'bulat' : 'tumpul', W - 1, D - 1, 7, 0, H - 7, 0, { edge: 'bulat', r: 6 });
  } else {
    if (round) b.cyl('kain', 'Badan', W / 2, W / 2, bh - 2, 0, y0, 0, 40);
    else b.boxY('kain', 'Badan', W, bh - 2, D, 0, y0, 0, { r: 2.5 });
    b.slab('kain', 'Bantalan', round ? 'bulat' : 'tumpul', W, D, 6, 0, H - 6, 0, { edge: 'bulat', r: 4 });
    if (P.style === 'tufted') {
      const n = Math.max(2, Math.round(W / 18)), m = Math.max(2, Math.round(D / 18));
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
        const x = -W / 2 + W * ((i + 0.5) / n), z = -D / 2 + D * ((j + 0.5) / m);
        if (!round || Math.hypot(x, z) < W / 2 - 6) b.sphere('kain', 'Kancing', 1, x, H - 0.2, z, 8);
      }
    }
  }
  if (P.piping && P.style !== 'pouf') {
    if (round) { b.torus('kain', 'Piping', W / 2, 0.6, 0, H - 0.6, 0, [Math.PI / 2, 0, 0]); }
    else b.tube('kain', 'Piping', [[-W / 2, H - 0.8, -D / 2], [W / 2, H - 0.8, -D / 2], [W / 2, H - 0.8, D / 2], [-W / 2, H - 0.8, D / 2], [-W / 2, H - 0.8, -D / 2 + 0.01]], 0.6, 4, { caps: false });
  }
  if (P.tray) {
    b.slab('sekunder', 'Nampan', round ? 'bulat' : 'tumpul', W * 0.62, D * 0.5, 2, 0, H, 0, { r: 3, edge: 'bulat' });
  }
}
const ottomanSchema = [
  G('Dimensi', [R('w', 'Lebar / diameter', 35, 120, 0.5, 60), R('d', 'Dalam', 35, 90, 0.5, 50, 'cm', (p) => p.shape !== 'bulat'), R('h', 'Tinggi', 25, 55, 0.5, 42)]),
  G('Model', [
    S('shape', 'Bentuk', { bulat: 'Bulat', persegi: 'Kotak', tumpul: 'Tumpul' }, 'bulat'),
    S('style', 'Gaya', { pouf: 'Pouf empuk', ottoman: 'Ottoman', tufted: 'Tufted', anyaman: 'Rotan + bantal' }, 'pouf'),
    C('piping', 'Piping tepi', true, (p) => p.style !== 'pouf'), C('tray', 'Nampan di atas', false),
  ]),
  G('Kaki', [
    S('legStyle', 'Model kaki', [['tanpa', 'Tanpa'], ...pick(LEG_LABELS, ['runcing', 'mid', 'bulat', 'logam', 'bubut'])], 'mid', (p) => p.style !== 'pouf'),
    R('legT', 'Tebal kaki', 1.5, 6, 0.5, 3.5, 'cm', (p) => p.style !== 'pouf' && p.legStyle !== 'tanpa'),
    R('legH', 'Tinggi kaki', 4, 25, 0.5, 12, 'cm', (p) => p.style !== 'pouf' && p.legStyle !== 'tanpa'),
  ]),
];

function buildFolding(b, P) {
  const W = P.seatW, D = P.seatD, H = P.seatH, hx = W / 2;
  if (P.style === 'sutradara') {
    const top = H + P.backH, armY = H + 22;
    for (const sx of [-1, 1]) {
      const x = sx * hx;
      b.rod('sekunder', 'Kaki depan', [x, 0, D / 2], [x, armY, D / 2], 1.7, 1.7, 4);
      b.rod('sekunder', 'Kaki belakang', [x, 0, -D / 2], [x, top, -D / 2], 1.7, 1.7, 4);
      b.boxY('sekunder', 'Lengan', 5, 2.4, D + 6, x, armY, 1, { r: 0.8 });
      b.rod('sekunder', 'Rel dudukan', [x, H - 2, -D / 2], [x, H - 2, D / 2], 1.3, 1.3, 4);
      b.rod('sekunder', 'Palang bawah', [x, 8, -D / 2], [x, 8, D / 2], 1.2, 1.2, 4);
    }
    for (const z of [-D / 2, D / 2]) {
      b.rod('sekunder', 'Silang', [-hx, 4, z], [hx, H - 3, z], 1.2, 1.2, 4);
      b.rod('sekunder', 'Silang', [hx, 4, z], [-hx, H - 3, z], 1.2, 1.2, 4);
    }
    b.box('kain', 'Kain dudukan', W - 2, 0.6, D - 2, 0, H - 1.6, 0);
    b.box('kain', 'Kain sandaran', W + 1, P.backH * 0.45, 0.6, 0, top - P.backH * 0.27, -D / 2 - 1.8);
    return;
  }
  const metal = P.style === 'logam';
  const slot = metal ? 'aksen' : 'sekunder', r = metal ? 1.1 : 1.6, seg = metal ? 12 : 4;
  for (const sx of [-1, 1]) {
    const x = sx * (hx - 1);
    if (metal) b.tube(slot, 'Kaki & tiang', [[x, 0.5, D / 2 - 2], [x, H - 1, -D / 2 + 4], [x, H + P.backH, -D / 2 - 2]], r, 3);
    else { b.rod(slot, 'Kaki & tiang', [x, 0, D / 2 - 2], [x, H - 1, -D / 2 + 4], r, r, seg); b.rod(slot, 'Tiang', [x, H - 1, -D / 2 + 4], [x, H + P.backH, -D / 2 - 2], r, r, seg); }
    b.rod(slot, 'Kaki belakang', [x * 0.92, 0, -D / 2], [x * 0.92, H - 3, D / 2 - 7], r, r, seg);
    b.cyl('gelap', 'Sepatu', r + 0.2, r + 0.2, 1.2, x, 0, D / 2 - 2, 10);
  }
  b.rod(slot, 'Palang', [-hx + 1, 10, D / 2 - 5], [hx - 1, 10, D / 2 - 5], r * 0.8, r * 0.8, seg);
  if (P.style === 'kayu') {
    const n = 5, sw = (D - 4) / n;
    for (let i = 0; i < n; i++) b.boxY('utama', 'Bilah dudukan', W - 1, 1.8, sw - 0.8, 0, H - 1.8, -D / 2 + 2 + sw * (i + 0.5), { r: 0.4 });
  } else b.boxY('utama', 'Dudukan', W - 3, 2, D - 4, 0, H - 2, 0, { r: 0.8 });
  b.group('Sandaran', 0, H + P.backH * 0.7, -D / 2 - 0.5, (g) => { g.rotation.x = -0.18; b.curvedBoard('utama', 'Sandaran', W - 3, P.backH * 0.42, 1.6, 2, 0, 0, 0, { r: 0.6 }); });
}
const foldingSchema = [
  G('Dimensi', [R('seatW', 'Lebar', 36, 60, 0.5, 44), R('seatD', 'Dalam', 34, 55, 0.5, 42), R('seatH', 'Tinggi dudukan', 35, 60, 0.5, 45), R('backH', 'Tinggi sandaran', 25, 55, 0.5, 38)]),
  G('Model', [S('style', 'Gaya', { logam: 'Lipat logam', kayu: 'Lipat kayu', sutradara: 'Kursi sutradara' }, 'logam')]),
];

function buildBeanbag(b, P) {
  const W = P.w, H = P.h, st = P.style;
  const geo = new THREE.SphereGeometry(1, Math.round(56 * b.q), Math.round(36 * b.q));
  const pos = geo.attributes.position, v = new THREE.Vector3();
  const rr = rng(P.seed);
  const wob = [rr(), rr(), rr()].map((x) => x * 6.28);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const lump = 1 + 0.04 * Math.sin(a * 3 + wob[0]) * (1 - Math.abs(v.y)) + 0.03 * Math.sin(a * 5 + wob[1]);
    let sx = W / 2 * lump, sz = W / 2 * lump, y = (v.y + 1) / 2 * H;
    if (st === 'tetes') { const k = 1 - 0.62 * Math.max(0, v.y) ** 1.4; sx *= k; sz *= k; }
    if (st === 'kursi') { if (v.z < 0) y *= 1 + 0.35 * (-v.z) * Math.max(0, v.y + 0.3); else y *= 1 - 0.35 * v.z * Math.max(0, v.y + 0.2); }
    let x = v.x * sx, z = v.z * sz;
    // seat dent on the front/top
    if (st !== 'bulat') { const dz = Math.max(0, v.z) * Math.exp(-(((v.y - 0.35) / 0.4) ** 2)); z -= dz * W * 0.18; y -= dz * H * 0.12; }
    y = Math.max(y, 0) + (v.y < -0.75 ? 0 : 0);
    if (v.y < -0.82) y = 0;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  b.add(boxUV(geo), 'kain', 'Beanbag');
  if (P.handle) b.tube('aksen', 'Tali pegangan', [[-5, H * 0.92, -W * 0.08], [-4, H * 0.98 + 2, -W * 0.08], [4, H * 0.98 + 2, -W * 0.08], [5, H * 0.92, -W * 0.08]], 0.8, 1.5);
}
const beanSchema = [
  G('Dimensi', [R('w', 'Diameter', 50, 140, 0.5, 90), R('h', 'Tinggi', 40, 110, 0.5, 80)]),
  G('Model', [S('style', 'Bentuk', { tetes: 'Tetes air', kursi: 'Kursi', bulat: 'Bulat' }, 'tetes'), C('handle', 'Tali pegangan', true), R('seed', 'Variasi lekukan', 1, 99, 1, 3, '')]),
];

// ---------------------------------------------------------------- tables
const consoleSchema = withDefaults(coffeeSchema,
  { w: 120, d: 35, h: 78, topShape: 'persegi', topT: 3, edge: 'bevel', shelf: true, shelfH: 16, drawers: 2, legStyle: 'runcing', legT: 4, legSplay: 0, legInset: 3, handle: 'knob' },
  { w: [60, 200], d: [25, 50], h: [65, 95] });

function buildBarTable(b, P) {
  buildSide(b, P);
  if (P.stools) {
    const sp = { ...schemaDefaults(stoolSchema), seatH: clamp(P.h - 30, 45, 85), cushion: true, back: 'rendah' };
    const n = P.stoolN | 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4, r = P.w / 2 + 16;
      b.group('Stool', Math.sin(a) * r, 0, Math.cos(a) * r, (g) => { g.rotation.y = a + Math.PI; buildStool(b, sp); });
    }
  }
}
const barSchema = [
  ...withDefaults(sideSchema, { w: 70, d: 70, h: 105, topShape: 'bulat', topT: 3, legStyle: 'pedestal', shelf: false, pedBase: 'piringan', legT: 5 }, { w: [45, 130], d: [45, 130], h: [85, 115], shelfH: [10, 60] }),
  G('Set stool', [C('stools', 'Tampilkan stool', true), R('stoolN', 'Jumlah stool', 1, 4, 1, 2, '', (p) => p.stools)]),
];

function buildNesting(b, P) {
  const n = P.count | 0;
  for (let i = 0; i < n; i++) {
    const s = P.step ** i;
    const sp = { topShape: P.topShape, topR: 5, topT: P.topT, edge: P.edge, topMat: P.topMat, drawer: false, shelf: false, legStyle: P.legStyle, legCount: 3, legT: P.legT, legTaper: 0.3, legSplay: P.legStyle === 'logam' ? 0 : 5, legInset: 3, pedBase: 'piringan', w: P.w * s, d: P.w * s, h: P.h - i * P.drop };
    b.group('Meja ' + (i + 1), i * P.w * 0.42, 0, i * P.w * 0.22, () => buildSide(b, sp));
  }
}
const nestingSchema = [
  G('Dimensi', [R('count', 'Jumlah meja', 2, 3, 1, 3, ''), R('w', 'Diameter terbesar', 35, 90, 0.5, 55), R('h', 'Tinggi terbesar', 35, 65, 0.5, 52), R('step', 'Skala tiap meja', 0.6, 0.95, 0.01, 0.8, '×'), R('drop', 'Selisih tinggi', 0, 15, 0.5, 6)]),
  G('Daun meja', [S('topShape', 'Bentuk', pick(SHAPES, ['bulat', 'persegi', 'tumpul', 'lunak']), 'bulat'), R('topT', 'Tebal', 1, 5, 0.1, 2), S('edge', 'Profil tepi', EDGES, 'bulat'), S('topMat', 'Material', { utama: 'Utama', kaca: 'Kaca' }, 'utama')]),
  G('Kaki', [S('legStyle', 'Model kaki', pick(LEG_LABELS, ['logam', 'mid', 'runcing', 'bulat', 'lurus', 'pedestal']), 'logam'), R('legT', 'Tebal kaki', 1.5, 6, 0.5, 3)]),
];

// ---------------------------------------------------------------- bedroom
function buildBunk(b, P) {
  const MW = Number(P.size), ML = P.mattL, t = P.postT;
  const W = ML + t * 2, D = MW + t * 2; // long axis along X so the ladder faces the viewer
  const topH = P.topH, guard = 32, postH = topH + guard;
  const hx = W / 2 - t / 2, hz = D / 2 - t / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxY('sekunder', 'Tiang', t, postH, t, sx * hx, 0, sz * hz, { r: 0.5 });
  const level = (y, name) => {
    for (const sz of [-1, 1]) b.boxY('utama', 'Rel ' + name, W - t * 2, 12, 3, 0, y - 12, sz * (hz - t / 2 + 1.5));
    for (const sx of [-1, 1]) b.boxY('utama', 'Rel ujung ' + name, 3, 12, D - t * 2, sx * (hx - t / 2 + 1.5), y - 12, 0);
    b.boxY('utama', 'Dasar ' + name, W - t * 2, 1.5, D - t * 2, 0, y - 9, 0);
    b.boxY('kasur', 'Kasur ' + name, ML - 1, P.mattT, MW - 1, 0, y - 7.5, 0, { r: 3 });
    if (P.pillows) b.box('kasur', 'Bantal', 40, 10, MW * 0.65, -ML / 2 + 26, y - 7.5 + P.mattT + 4, 0, { r: 4.5 });
    if (P.blanket) b.boxY('aksen', 'Selimut', ML * 0.6, 2.4, MW + 2, ML * 0.2, y - 7.5 + P.mattT - 0.6, 0, { r: 1 });
  };
  if (P.lower) level(P.lowerH + 12, 'bawah');
  else if (P.desk) {
    b.boxY('utama', 'Meja bawah', W - t * 2, 2.5, D * 0.7, 0, 73, -D * 0.15);
    b.boxY('utama', 'Panel meja', 2, 73, D * 0.7, -hx + t, 0, -D * 0.15);
  }
  level(topH, 'atas');
  // end boards
  const gx = (sx) => sx * hx;
  for (const sx of [-1, 1]) for (const [y0, y1] of [[topH, postH - 3], ...(P.lower ? [[P.lowerH + 12, P.lowerH + 40]] : [])]) {
    if (P.guard === 'panel') b.boxY('utama', 'Papan ujung', 2, y1 - y0, D - t * 2, gx(sx), y0, 0);
    else { b.boxY('utama', 'Palang ujung', 2.5, 6, D - t * 2, gx(sx), y1 - 6, 0); const n = Math.round((D - t * 2) / 12); for (let i = 1; i < n; i++) b.boxY('utama', 'Bilah ujung', 2, y1 - y0 - 6, 3, gx(sx), y0, -D / 2 + t + (D - t * 2) * (i / n)); }
  }
  // guard rails at the top (back full, front with ladder gap)
  const lad = P.ladder === 'kanan' ? 1 : -1, lw = 40;
  b.boxY('utama', 'Pagar belakang', W - t * 2, 6, 2.5, 0, postH - 6, -hz);
  b.boxY('utama', 'Pagar belakang', W - t * 2, 5, 2.5, 0, topH + 6, -hz);
  const fx0 = -W / 2 + t, fx1 = W / 2 - t - lw;
  const fl = fx1 - fx0, fc = lad > 0 ? (fx0 + fx1) / 2 : -(fx0 + fx1) / 2;
  b.boxY('utama', 'Pagar depan', fl, 6, 2.5, fc, postH - 6, hz);
  b.boxY('utama', 'Pagar depan', fl, 5, 2.5, fc, topH + 6, hz);
  b.boxY('sekunder', 'Tiang pagar', t * 0.8, postH - topH + 12, t * 0.8, lad * (W / 2 - t - lw), topH - 12, hz);
  // ladder
  const lx0 = lad * (W / 2 - t - lw + 4), lx1 = lad * (W / 2 - t - 4), zl = hz + 6;
  for (const x of [lx0, lx1]) b.rod('sekunder', 'Tangga', [x, 0, zl + 10], [x, postH - 4, zl], 2, 2, 4);
  const rungs = Math.round((topH) / 26);
  for (let i = 1; i <= rungs; i++) { const y = (topH) * (i / (rungs + 0.4)); const z = zl + 10 * (1 - y / (postH - 4)); b.rod('sekunder', 'Anak tangga', [lx0, y, z], [lx1, y, z], 1.5, 1.5, 12); }
}
const bunkSchema = [
  G('Ukuran', [S('size', 'Lebar kasur', [['90', '90'], ['100', '100'], ['120', '120']], '90'), R('mattL', 'Panjang kasur', 180, 210, 1, 200), R('mattT', 'Tebal kasur', 8, 25, 0.5, 15), R('postT', 'Tebal tiang', 4, 10, 0.5, 6.5)]),
  G('Tingkat', [R('topH', 'Tinggi tingkat atas', 110, 170, 0.5, 135), C('lower', 'Kasur bawah', true), R('lowerH', 'Tinggi kasur bawah', 8, 40, 0.5, 22, 'cm', (p) => p.lower), C('desk', 'Meja di bawah (loft)', true, (p) => !p.lower)]),
  G('Detail', [S('ladder', 'Posisi tangga', { kanan: 'Kanan', kiri: 'Kiri' }, 'kanan'), S('guard', 'Ujung', { bilah: 'Bilah', panel: 'Panel' }, 'bilah'), C('pillows', 'Bantal', true), C('blanket', 'Selimut', true)]),
];

function buildCrib(b, P) {
  const W = P.l, D = P.w, H = P.h, pr = 2.4;
  const hx = W / 2 - pr, hz = D / 2 - pr;
  const y0 = P.wheels ? 8 : 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.rod('sekunder', 'Tiang', [sx * hx, y0, sz * hz], [sx * hx, y0 + H, sz * hz], pr, pr, P.slat === 'kotak' ? 4 : 16);
    if (P.slat !== 'kotak') b.sphere('sekunder', 'Ujung tiang', pr * 1.15, sx * hx, y0 + H + 1, sz * hz, 14);
    if (P.wheels) { b.cyl('gelap', 'Roda', 3, 3, 2.6, sx * hx, 3, sz * hz, 16, { rot: [Math.PI / 2, 0, 0] }); b.rod('aksen', 'Garpu roda', [sx * hx, 3, sz * hz], [sx * hx, y0, sz * hz], 0.8, 0.8, 8); }
  }
  const mb = y0 + P.mattH;
  const lowFront = P.lowSide ? H * 0.72 : H;
  const side = (axis, s, top) => {
    const len = axis === 'x' ? W - pr * 2 : D - pr * 2;
    const at = (u, y) => (axis === 'x' ? [u, y, s * hz] : [s * hx, y, u]);
    const railBox = (y, h, name) => axis === 'x' ? b.boxY('utama', name, len, h, 3, 0, y, s * hz) : b.boxY('utama', name, 3, h, len, s * hx, y, 0);
    railBox(y0 + top - 4, 4, 'Rel atas'); railBox(mb - 6, 5, 'Rel bawah');
    const n = Math.max(3, Math.floor(len / P.gap));
    for (let i = 1; i < n; i++) { const u = -len / 2 + len * (i / n); b.rod('utama', 'Jeruji', at(u, mb - 1), at(u, y0 + top - 4), 1, 1, P.slat === 'kotak' ? 4 : 10); }
  };
  side('x', -1, H); side('x', 1, lowFront); side('z', -1, H); side('z', 1, H);
  b.boxY('utama', 'Alas kasur', W - pr * 2, 1.5, D - pr * 2, 0, mb - 2, 0);
  b.boxY('kasur', 'Kasur bayi', W - pr * 2 - 1, 10, D - pr * 2 - 1, 0, mb - 0.5, 0, { r: 3 });
  if (P.bumper) for (const s of [-1, 1]) b.boxY('kain', 'Bumper', W - pr * 2 - 2, 22, 2.5, 0, mb + 9, s * (hz - 3), { r: 1.2 });
  if (P.blanket) b.boxY('aksen', 'Selimut bayi', W * 0.45, 2, D - pr * 2 - 3, W * 0.15, mb + 9.4, 0, { r: 0.9 });
  if (P.mobile) {
    const top = y0 + H + 45;
    b.tube('aksen', 'Lengan mainan', [[-hx, y0 + H - 5, -hz], [-hx, top, -hz], [-hx + 8, top + 6, -hz + 8], [-W * 0.1, top + 6, 0]], 0.7, 6);
    b.cyl('aksen', 'Gantungan', 10, 10, 1, -W * 0.1, top - 1, 0, 24);
    const cols = ['buku3', 'buku4', 'buku1', 'buku2'];
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2, x = -W * 0.1 + Math.cos(a) * 9, z = Math.sin(a) * 9; b.rod('gelap', 'Benang', [x, top - 1, z], [x, top - 14, z], 0.1, 0.1, 4); b.sphere(cols[i], 'Mainan', 3, x, top - 17, z, 12); }
  }
}
const cribSchema = [
  G('Dimensi', [R('l', 'Panjang', 90, 140, 0.5, 126), R('w', 'Lebar', 50, 80, 0.5, 66), R('h', 'Tinggi', 70, 110, 0.5, 92), R('mattH', 'Tinggi alas kasur', 15, 60, 0.5, 32)]),
  G('Jeruji', [S('slat', 'Bentuk jeruji', { bulat: 'Bulat', kotak: 'Kotak' }, 'bulat'), R('gap', 'Jarak jeruji', 5, 12, 0.5, 7), C('lowSide', 'Sisi depan rendah', false)]),
  G('Aksesori', [C('wheels', 'Roda', false), C('bumper', 'Bumper kain', true), C('blanket', 'Selimut', true), C('mobile', 'Mainan gantung', true)]),
];

function buildVanity(b, P) {
  const W = P.w, D = P.d, H = P.h, tt = 2.5;
  b.slab('utama', 'Daun meja', 'tumpul', W, D, tt, 0, H - tt, 0, { r: 2, edge: 'bevel' });
  const yTop = H - tt;
  const bh = 13;
  const nd = P.drawers | 0;
  const bw = W - 2 * (P.legInset + P.legT) + 1, bd = D - 2 * P.legInset - 2;
  if (nd) {
    b.boxY('utama', 'Kotak laci', bw, 1.4, bd, 0, yTop - bh, 0);
    b.boxY('utama', 'Belakang', bw, bh, 1.4, 0, yTop - bh, -bd / 2 + 0.7);
    const dw = bw / nd;
    for (let i = 0; i < nd; i++) drawer(b, P, dw, bh - 1, bd - 4, -bw / 2 + dw * (i + 0.5), yTop - bh / 2 - 0.3, bd / 2 - 1.8, 0);
  }
  legs(b, P, W, D, yTop);
  // mirror
  const mw = P.mw, mh = P.mshape === 'bulat' ? P.mw : P.mh;
  const shp = mirrorShape(P.mshape, mw, mh), inner = mirrorShape(P.mshape, mw - 6, mh - 6);
  shp.holes.push(new THREE.Path(inner.getPoints(64).reverse()));
  const my = H + 2, mz = -D / 2 + 4;
  b.group('Cermin', 0, my, mz, (g) => {
    g.rotation.x = -0.06;
    b.panel('utama', 'Bingkai cermin', shp, 3, 0, mh / 2, 0, { round: true });
    b.panel('cermin', 'Kaca cermin', mirrorShape(P.mshape, mw - 5.4, mh - 5.4), 0.6, 0, mh / 2, -0.4);
    b.panel('utama', 'Papan belakang', mirrorShape(P.mshape, mw - 3, mh - 3), 0.6, 0, mh / 2, -1.6);
    if (P.bulbs) {
      const pts = mirrorShape(P.mshape, mw + 2, mh + 2).getSpacedPoints(Math.max(8, Math.round((mw + mh) / 9)));
      pts.slice(0, -1).forEach((p) => { if (p.y > -mh / 2 + 6) b.sphere('lampu', 'Bohlam', 2.2, p.x, p.y + mh / 2, 1.5, 12); });
    }
  });
  b.boxY('utama', 'Kaki cermin', 8, 2, 6, 0, H, mz);
  if (P.stool) {
    const sp = { ...schemaDefaults(stoolSchema), seatH: 46, seatW: 38, seatShape: 'bulat', saddle: false, cushion: true, legStyle: P.legStyle === 'logam' ? 'logam' : 'mid', footrest: 'tanpa', legCount: 4 };
    b.group('Stool', 0, 0, D / 2 + 26, () => buildStool(b, sp));
  }
}
const vanitySchema = [
  G('Dimensi', [R('w', 'Lebar', 60, 160, 0.5, 100), R('d', 'Dalam', 35, 60, 0.5, 45), R('h', 'Tinggi', 65, 85, 0.5, 76)]),
  G('Cermin', [S('mshape', 'Bentuk cermin', { lengkung: 'Lengkung', bulat: 'Bulat', oval: 'Oval', tumpul: 'Tumpul', persegi: 'Persegi' }, 'lengkung'), R('mw', 'Lebar cermin', 30, 140, 0.5, 60), R('mh', 'Tinggi cermin', 30, 110, 0.5, 75, 'cm', (p) => p.mshape !== 'bulat'), C('bulbs', 'Lampu Hollywood', true)]),
  G('Laci & stool', [R('drawers', 'Jumlah laci', 0, 4, 1, 2, ''), S('handle', 'Pegangan', HANDLE_LABELS, 'knob'), S('frontStyle', 'Model muka', pick(FRONT_LABELS, ['polos', 'shaker', 'bilah', 'rotan']), 'polos'), C('stool', 'Stool rias', true)]),
  legGroup(['runcing', 'mid', 'bulat', 'lurus', 'bubut', 'logam', 'hairpin'], { legStyle: 'runcing', legT: 4, legInset: 2, legSplay: 3 }),
];

// ---------------------------------------------------------------- storage
function buildWallShelf(b, P) {
  const n = P.count | 0, W = P.w, D = P.d, t = P.t, r = rng(P.seed);
  if (P.wall) wall(b, W + 70, P.elev + n * P.gap + 50, -D / 2);
  for (let i = 0; i < n; i++) {
    const y = P.elev + i * P.gap;
    let w = W, x = 0;
    if (P.style === 'tangga') { w = W * 0.62; x = (i % 2 ? 1 : -1) * W * 0.19; }
    if (P.style === 'kotak') {
      const h = P.gap * 0.78;
      b.boxY('utama', 'Kotak', w, t, D, x, y, 0); b.boxY('utama', 'Kotak', w, t, D, x, y + h - t, 0);
      b.boxY('utama', 'Kotak', t, h - 2 * t, D, x - w / 2 + t / 2, y + t, 0); b.boxY('utama', 'Kotak', t, h - 2 * t, D, x + w / 2 - t / 2, y + t, 0);
      if (P.decor) fillBooks(b, r, x - w / 2 + t, x + w / 2 - t, y + t, D - 2, -D / 2 + 1, h - 2 * t - 1, 0.65);
      continue;
    }
    b.boxY('utama', 'Rak', w, t, D, x, y, 0, { r: 0.3 });
    if (P.style === 'braket') for (const s of [-1, 1]) {
      const bx = x + s * (w / 2 - 10);
      b.boxY('aksen', 'Braket', 2, 0.5, D - 3, bx, y - 0.5, 0.5);
      b.boxY('aksen', 'Braket', 2, 12, 0.5, bx, y - 12, -D / 2 + 0.25);
      b.rod('aksen', 'Braket', [bx, y - 11, -D / 2 + 0.5], [bx, y - 0.5, D / 2 - 6], 0.4, 0.4, 6);
    }
    if (P.decor) fillBooks(b, r, x - w / 2 + 2, x + w / 2 - 2, y + t, D - 2, -D / 2 + 1, P.gap - t - 4, 0.55);
  }
}
const wallShelfSchema = [
  G('Dimensi', [R('count', 'Jumlah rak', 1, 6, 1, 3, ''), R('w', 'Lebar', 30, 180, 0.5, 80), R('d', 'Dalam', 12, 40, 0.5, 22), R('t', 'Tebal', 1.5, 6, 0.1, 3), R('gap', 'Jarak antar rak', 20, 60, 0.5, 34), R('elev', 'Tinggi rak bawah', 20, 160, 0.5, 90)]),
  G('Model', [S('style', 'Gaya', { melayang: 'Melayang', braket: 'Braket logam', tangga: 'Zig-zag', kotak: 'Kotak' }, 'melayang'), C('decor', 'Isi buku & dekor', true), R('seed', 'Variasi isi', 1, 99, 1, 4, '', (p) => p.decor), C('wall', 'Tampilkan dinding', false)]),
];

function shoe(b, x, y, z, ry, mat, len = 26, high = false) {
  b.group('Sepatu', x, y, z, (g) => {
    g.rotation.y = ry;
    b.boxY('gelap', 'Sol', 9, 1.6, len, 0, 0, 0, { r: 0.7 });
    b.boxY(mat, 'Badan sepatu', 8.6, high ? 15 : 8.5, len * 0.6, 0, 1.4, -len * 0.18, { r: 3.4 });
    b.boxY(mat, 'Ujung sepatu', 8.4, 5, len * 0.48, 0, 1.4, len * 0.24, { r: 2.4 });
    b.boxY('gelap', 'Lubang sepatu', 6, 0.4, len * 0.3, 0, 1.4 + (high ? 15 : 8.5) - 0.2, -len * 0.22, { r: 0.15 });
  });
}
function buildShoeRack(b, P) {
  const W = P.w, H = P.h, D = P.d, t = 1.8, n = P.rows | 0, r = rng(P.seed);
  const top = P.style === 'bangku' ? 4 : t;
  const y0 = 4;
  b.boxY('utama', 'Sisi', t, H - top, D, -W / 2 + t / 2, 0, 0);
  b.boxY('utama', 'Sisi', t, H - top, D, W / 2 - t / 2, 0, 0);
  b.boxY('utama', 'Atas', W, top, D, 0, H - top, 0, { r: P.style === 'bangku' ? 0.6 : 0.2 });
  if (P.style === 'bangku') b.boxY('kain', 'Bantalan', W - 2, 6, D - 2, 0, H, 0, { r: 2.5 });
  const rh = (H - top - y0) / n;
  for (let i = 0; i < n; i++) {
    const y = y0 + rh * i;
    if (P.style === 'kabinet') {
      b.boxY('utama', 'Rak', W - 2 * t, t, D - 2, 0, y, -1);
      b.group('Pintu lipat', 0, y + 1, D / 2, (g) => { g.rotation.x = rad(P.doorOpen * 0.4); front(b, 'polos', W, rh, 1.6, 0, rh / 2 - 1, 0); handle(b, { handle: P.handle, handleLen: 12 }, 0, rh - 6, 1.6, false); });
      continue;
    }
    b.group('Rak miring', 0, y + 3, 0, (g) => {
      g.rotation.x = rad(14);
      if (P.style === 'pipa') for (const z of [-D / 3, D / 3]) b.rod('aksen', 'Pipa', [-W / 2 + t, 0, z], [W / 2 - t, 0, z], 1, 1, 12);
      else b.boxY('utama', 'Rak', W - 2 * t, 1.6, D - 2, 0, 0, 0);
      if (P.shoes) {
        const ns = Math.floor((W - 6) / 22);
        for (let k = 0; k < ns; k++) if (r() < 0.82) shoe(b, -W / 2 + 12 + k * 22 + (r() - 0.5) * 3, 1.6, 0, (r() - 0.5) * 0.2, BOOK_MATS[Math.floor(r() * 6)], Math.min(D - 4, 26), r() < 0.15 && rh > 22);
      }
    });
  }
}
const shoeSchema = [
  G('Dimensi', [R('w', 'Lebar', 40, 140, 0.5, 80), R('h', 'Tinggi', 30, 140, 0.5, 52), R('d', 'Dalam', 25, 40, 0.5, 32), R('rows', 'Jumlah tingkat', 1, 6, 1, 3, '')]),
  G('Model', [S('style', 'Gaya', { terbuka: 'Rak terbuka', pipa: 'Rak pipa', bangku: 'Bangku + rak', kabinet: 'Kabinet pintu lipat' }, 'bangku'),
    R('doorOpen', 'Buka pintu', 0, 100, 1, 30, '%', (p) => p.style === 'kabinet'), S('handle', 'Pegangan', HANDLE_LABELS, 'tab', (p) => p.style === 'kabinet'),
    C('shoes', 'Tampilkan sepatu', true, (p) => p.style !== 'kabinet'), R('seed', 'Variasi isi', 1, 99, 1, 9, '', (p) => p.shoes && p.style !== 'kabinet')]),
];

function buildDisplayCab(b, P) {
  const W = P.w, D = P.d, t = 1.8, r = rng(P.seed);
  const y0 = baseFor(b, P, W - 2, D - 2);
  const H = P.h - y0;
  // body
  b.boxY('utama', 'Atas', W + 1, 2.4, D + 0.5, 0, y0 + H - 2.4, 0.25, { r: 0.4 });
  b.boxY('utama', 'Bawah', W, t, D, 0, y0, 0);
  b.boxY('sekunder', 'Panel belakang', W - 2 * t, H - t - 2.4, 0.8, 0, y0 + t, -D / 2 + 0.4);
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - t / 2);
    if (P.glassSides) {
      b.boxY('utama', 'Tiang', t, H - 2.4, 3, x, y0, D / 2 - 1.5); b.boxY('utama', 'Tiang', t, H - 2.4, 3, x, y0, -D / 2 + 1.5);
      b.boxY('kaca', 'Kaca samping', 0.5, H - 2.4 - P.lowerH, D - 6, x, y0 + P.lowerH, 0);
      if (P.lowerH > 0) b.boxY('utama', 'Panel bawah', t, P.lowerH, D - 6, x, y0, 0);
    } else b.boxY('utama', 'Sisi', t, H - 2.4, D, x, y0, 0);
  }
  const lower = P.lowerH > 0 ? P.lowerH : 0;
  if (lower) b.boxY('utama', 'Sekat', W - 2 * t, t, D - 1, 0, y0 + lower, -0.5);
  const upY = y0 + lower + t, upH = H - lower - t - 2.4;
  const ns = P.shelves | 0;
  for (let i = 1; i <= ns; i++) {
    const y = upY + upH * (i / (ns + 1));
    b.boxY('kaca', 'Rak kaca', W - 2 * t - 0.4, 0.8, D - 4, 0, y, -1);
  }
  if (P.light) b.boxY('lampu', 'Lampu', W - 2 * t - 4, 0.6, 2, 0, y0 + H - 3, 0);
  if (P.items) {
    for (let i = 0; i <= ns; i++) {
      const y = i === 0 ? upY : upY + upH * (i / (ns + 1)) + 0.8;
      const h = upH / (ns + 1) - 3;
      let x = -W / 2 + t + 4;
      while (x < W / 2 - t - 8) {
        const k = r();
        if (k < 0.4) { const pr = Math.min(h * 0.45, 12); if (x + pr * 2 > W / 2 - t - 1) break; b.group('Piring', x + pr, y + pr + 0.5, -D / 2 + 5, (g) => { g.rotation.x = Math.PI / 2 - 0.25; b.lathe('dekor', 'Piring', [[0, 0], [pr * 0.6, 0], [pr, 1.2], [pr, 1.6], [pr * 0.6, 0.8], [0, 0.7]], 0, 0, 0, 32); }); x += pr * 2 + 3; }
        else if (k < 0.75) { const vr = 3 + r() * 3; if (x + vr * 2 > W / 2 - t - 1) break; const vh = Math.min(h * 0.9, 8 + r() * 16); b.lathe(r() < 0.5 ? 'dekor' : 'kaca', 'Vas', [[0, 0], [vr * 0.7, 0], [vr, vh * 0.3], [vr * 0.85, vh * 0.7], [vr * 0.45, vh * 0.9], [vr * 0.55, vh], [0, vh]], x + vr, y, -1, 24); x += vr * 2 + 4; }
        else { const gr = 2.4; b.lathe('kaca', 'Gelas', [[0, 0], [gr, 0], [gr * 1.1, 9], [gr * 1.05, 9], [gr * 0.95, 0.5], [0, 0.5]], x + gr, y, 4, 20); x += gr * 2 + 3; }
      }
    }
  }
  // doors
  const nd = P.doors | 0, dw = W / nd;
  for (let i = 0; i < nd; i++) {
    const left = i < nd / 2 || nd === 1;
    const db = y0 + lower, dt = y0 + H - 2.4;
    door(b, { ...P, frontStyle: 'kaca', handle: P.handle }, left ? -W / 2 + dw * i : -W / 2 + dw * (i + 1), (db + dt) / 2, dw, dt - db, D / 2, left ? 1 : -1, P.doorOpen / 100);
    if (lower) {
      if (P.lowerType === 'laci') drawer(b, P, dw, lower, D - 6, -W / 2 + dw * (i + 0.5), y0 + lower / 2 + 0.5, D / 2, 0, P.frontStyle);
      else door(b, P, left ? -W / 2 + dw * i : -W / 2 + dw * (i + 1), y0 + lower / 2 + 0.9, dw, lower + 1.8, D / 2, left ? 1 : -1, 0);
    }
  }
}
const displaySchema = [
  G('Dimensi', [R('w', 'Lebar', 40, 180, 0.5, 90), R('h', 'Tinggi', 80, 220, 0.5, 185), R('d', 'Dalam', 28, 55, 0.5, 40)]),
  G('Kaca & rak', [R('doors', 'Pintu kaca', 1, 4, 1, 2, ''), R('shelves', 'Rak kaca', 1, 7, 1, 3, ''), C('glassSides', 'Sisi kaca', true), C('light', 'Lampu dalam', true), R('doorOpen', 'Buka pintu', 0, 100, 1, 0, '%'), C('items', 'Isi pajangan', true), R('seed', 'Variasi isi', 1, 99, 1, 5, '', (p) => p.items)]),
  G('Bagian bawah', [R('lowerH', 'Tinggi bagian tertutup', 0, 90, 0.5, 60), S('lowerType', 'Model', { pintu: 'Pintu', laci: 'Laci' }, 'pintu', (p) => p.lowerH > 0),
    S('frontStyle', 'Model muka', pick(FRONT_LABELS, ['polos', 'shaker', 'bilah', 'rotan']), 'shaker', (p) => p.lowerH > 0), S('handle', 'Pegangan', HANDLE_LABELS, 'knob')]),
  legGroup(['plinth', 'runcing', 'mid', 'lurus', 'bubut', 'logam'], { legStyle: 'runcing', legT: 4, legInset: 3 }, [R('legH', 'Tinggi kaki/alas', 0, 30, 0.5, 12)]),
];

function buildCubes(b, P) {
  const cols = P.cols | 0, rows = P.rows | 0, c = P.cell, t = P.t, D = P.d, r = rng(P.seed);
  const W = cols * c + (cols + 1) * t, Hh = rows * c + (rows + 1) * t;
  const y0 = baseFor(b, P, W - 2, D - 2);
  for (let i = 0; i <= cols; i++) b.boxY('utama', 'Sekat tegak', t, Hh, D, -W / 2 + t / 2 + i * (c + t), y0, 0);
  for (let j = 0; j <= rows; j++) b.boxY('utama', 'Rak', W - 2 * t, t, D, 0, y0 + j * (c + t), 0);
  if (P.back) b.boxY('sekunder', 'Panel belakang', W - 2 * t, Hh - 2 * t, 0.6, 0, y0 + t, -D / 2 + 0.3);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = -W / 2 + t + c / 2 + i * (c + t), y = y0 + t + j * (c + t);
    const k = r();
    if (P.bins && k < P.binRatio) {
      b.boxY('kain', 'Kotak kain', c - 1.6, c - 1.6, D - 2.5, x, y, 0.5, { r: 0.8 });
      b.box('gelap', 'Lubang pegangan', 9, 2.2, 0.3, x, y + c - 7, D / 2 - 0.65, { r: 0.6 });
    } else if (P.decor && k < P.binRatio + (1 - P.binRatio) * 0.75) fillBooks(b, r, x - c / 2, x + c / 2, y, D - 3, -D / 2 + 1, c - 2, 0.7);
  }
}
const cubeSchema = [
  G('Dimensi', [R('cols', 'Kolom', 1, 6, 1, 3, ''), R('rows', 'Baris', 1, 6, 1, 3, ''), R('cell', 'Ukuran kotak', 25, 45, 0.5, 33), R('d', 'Dalam', 25, 45, 0.5, 35), R('t', 'Tebal papan', 1.2, 4, 0.1, 1.6)]),
  G('Isi', [C('back', 'Panel belakang', true), C('bins', 'Kotak kain', true), R('binRatio', 'Porsi kotak kain', 0, 1, 0.05, 0.4, '×', (p) => p.bins), C('decor', 'Buku & dekor', true), R('seed', 'Variasi isi', 1, 99, 1, 21, '')]),
  legGroup(['plinth', 'runcing', 'mid', 'logam', 'hairpin'], { legStyle: 'mid', legT: 3.5, legInset: 3 }, [R('legH', 'Tinggi kaki/alas', 0, 25, 0.5, 0)]),
];

function buildFiling(b, P) {
  let y0 = 0;
  if (P.wheels) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl('gelap', 'Roda', 2.4, 2.4, 2, sx * (P.w / 2 - 5), 2.4, sz * (P.d / 2 - 6), 14, { rot: [Math.PI / 2, 0, 0] }); b.cyl('aksen', 'Dudukan roda', 1.6, 1.6, 2.2, sx * (P.w / 2 - 5), 4.4, sz * (P.d / 2 - 6), 10); }
    y0 = 6.5;
  }
  const n = P.drawers | 0;
  const rows = Array(n).fill(0).map(() => ({ cells: ['laci'] }));
  const Pp = { ...P, frontStyle: 'polos', topOver: 0, topT: 1.8, frontT: 1.6 };
  cabinetBody(b, Pp, P.w, P.h - y0, P.d, y0, rows);
  const ih = P.h - y0 - 3.6;
  for (let i = 0; i < n; i++) {
    const cy = y0 + 1.8 + ih * ((i + 0.5) / n) + (i === 0 ? -0.9 : 0) + (i === n - 1 ? 0.45 : 0);
    if (P.label) b.box('aksen', 'Tempat label', 9, 3.4, 0.4, 0, cy + 5, P.d / 2 + 1.8);
    if (P.label) b.box('interior', 'Label', 7.6, 2.4, 0.2, 0, cy + 5, P.d / 2 + 2);
  }
  if (P.lock) b.cyl('aksen', 'Kunci', 1.2, 1.2, 1, P.w / 2 - 5, P.h - 5, P.d / 2 + 0.5, 14, { rot: [Math.PI / 2, 0, 0] });
}
const filingSchema = [
  G('Dimensi', [R('w', 'Lebar', 35, 90, 0.5, 46), R('h', 'Tinggi', 45, 150, 0.5, 132), R('d', 'Dalam', 40, 75, 0.5, 62), R('drawers', 'Jumlah laci', 2, 6, 1, 4, '')]),
  G('Detail', [S('handle', 'Pegangan', { bar: 'Batang', tab: 'Tab', cekung: 'Alur cekung', knob: 'Kenop' }, 'bar'), R('handleLen', 'Panjang pegangan', 6, 30, 0.5, 14), C('label', 'Tempat label', true), C('lock', 'Kunci', true), C('wheels', 'Roda (mobile)', false), R('drawerOpen', 'Buka laci atas', 0, 100, 1, 0, '%')]),
];

// ---------------------------------------------------------------- registry
export const TYPES2 = {
  kursiKantor: { cat: 'duduk', label: 'Kursi kantor', schema: officeSchema, build: buildOffice,
    slots: { kain: 'Jok / mesh', utama: 'Rangka', aksen: 'Kaki & logam' },
    mats: { kain: { c: '#3a3d42', f: 'kain' }, utama: { c: '#2a2a2c', f: 'satin' }, aksen: { c: '#c7c9cc', f: 'logam' }, sekunder: WOOD },
    styles: { 'Ergonomis': { backStyle: 'mesh', headrest: true }, 'Eksekutif': { backStyle: 'eksekutif', backH: 74, lumbar: false }, 'Tugas': { backStyle: 'jok', arms: false, backH: 42, headrest: false }, 'Kursi tamu': { base: 'silang', backStyle: 'jok', arms: true } } },
  kursiGoyang: { cat: 'duduk', label: 'Kursi goyang', schema: rockerSchema, build: buildRocker,
    slots: { utama: 'Dudukan & sandaran', sekunder: 'Rangka', kain: 'Bantalan' },
    mats: { utama: WOOD, sekunder: WOOD, kain: { c: '#b8ae9f', f: 'kain' }, aksen: BLACK },
    styles: { 'Klasik': { backStyle: 'spindle' }, 'Modern': { backStyle: 'lengkung', cushion: true, arms: false }, 'Berjok': { backStyle: 'jok', cushion: true } } },
  kursiLipat: { cat: 'duduk', label: 'Kursi lipat', schema: foldingSchema, build: buildFolding,
    slots: { utama: 'Dudukan', sekunder: 'Rangka kayu', aksen: 'Rangka logam', kain: 'Kanvas' },
    mats: { utama: WOOD, sekunder: WOOD, aksen: BLACK, kain: { c: '#2f3a34', f: 'kain' } },
    styles: { 'Logam': { style: 'logam' }, 'Kayu': { style: 'kayu' }, 'Sutradara': { style: 'sutradara', backH: 32 } } },
  ottoman: { cat: 'duduk', label: 'Ottoman / pouf', schema: ottomanSchema, build: buildOttoman,
    slots: { kain: 'Jok', sekunder: 'Kaki & nampan', utama: 'Anyaman', aksen: 'Logam' },
    mats: { kain: { c: '#c7a27a', f: 'beludru' }, sekunder: WOOD, utama: { c: '#d0ab73', f: 'anyaman' }, aksen: BRASS },
    styles: { 'Pouf': { style: 'pouf' }, 'Tufted': { style: 'tufted', shape: 'persegi', w: 90, d: 60 }, 'Rotan': { style: 'anyaman' }, 'Coffee ottoman': { style: 'ottoman', shape: 'tumpul', w: 100, d: 70, tray: true } } },
  beanbag: { cat: 'duduk', label: 'Beanbag', schema: beanSchema, build: buildBeanbag,
    slots: { kain: 'Kain', aksen: 'Tali' }, mats: { kain: { c: '#c56d4b', f: 'kain' }, aksen: { c: '#3b2a1e', f: 'kulit' } },
    styles: { 'Tetes': { style: 'tetes' }, 'Kursi': { style: 'kursi' }, 'Bulat': { style: 'bulat', h: 60 } } },

  mejaKonsol: { cat: 'meja', label: 'Meja konsol', schema: consoleSchema, build: buildCoffee,
    slots: { utama: 'Daun meja', sekunder: 'Kaki', aksen: 'Logam & pegangan' },
    mats: { utama: WOOD, sekunder: WOOD, aksen: BRASS, kaca: { c: '#cfe3e0', f: 'kaca' } },
    styles: { 'Klasik': { legStyle: 'bubut', drawers: 2 }, 'Ramping': { drawers: 0, legStyle: 'logam', shelf: true, d: 30 }, 'Hairpin': { legStyle: 'hairpin', drawers: 1, shelf: false } } },
  mejaBar: { cat: 'meja', label: 'Meja bar', schema: barSchema, build: buildBarTable,
    slots: { utama: 'Daun meja', sekunder: 'Kaki', aksen: 'Logam', kain: 'Bantalan stool' },
    mats: { utama: WOOD, sekunder: { c: '#2b2b2d', f: 'satin' }, aksen: BLACK, kain: { c: '#3b3b3b', f: 'kulit' }, kaca: { c: '#cfe3e0', f: 'kaca' } },
    styles: { 'Bistro': { topShape: 'bulat', legStyle: 'pedestal' }, 'Industrial': { topShape: 'persegi', legStyle: 'logam', w: 70 }, 'Tripod kayu': { legStyle: 'mid', legCount: 3 } } },
  mejaNesting: { cat: 'meja', label: 'Meja set (nesting)', schema: nestingSchema, build: buildNesting,
    slots: { utama: 'Daun meja', sekunder: 'Kaki kayu', aksen: 'Kaki logam' },
    mats: { utama: WOOD, sekunder: WOOD, aksen: BLACK, kaca: { c: '#cfe3e0', f: 'kaca' } },
    styles: { 'Logam': { legStyle: 'logam' }, 'Kayu': { legStyle: 'mid' }, 'Kotak': { topShape: 'persegi', legStyle: 'lurus' } } },

  ranjangSusun: { cat: 'kamar', label: 'Ranjang susun', schema: bunkSchema, build: buildBunk,
    slots: { utama: 'Rel & pagar', sekunder: 'Tiang & tangga', aksen: 'Selimut' }, softAksen: true,
    mats: { utama: { c: '#f1efea', f: 'satin' }, sekunder: WOOD, aksen: { c: '#6f8fa3', f: 'kain' } },
    styles: { 'Susun': { lower: true }, 'Loft + meja': { lower: false, desk: true, topH: 160 }, 'Panel': { guard: 'panel' } } },
  boksBayi: { cat: 'kamar', label: 'Boks bayi', schema: cribSchema, build: buildCrib,
    slots: { utama: 'Rangka', sekunder: 'Tiang', kain: 'Bumper', aksen: 'Selimut & mainan' }, softAksen: true,
    mats: { utama: { c: '#f3f1ec', f: 'satin' }, sekunder: { c: '#f3f1ec', f: 'satin' }, kain: { c: '#e3b8b0', f: 'kain' }, aksen: { c: '#b7d3c8', f: 'kain' } },
    styles: { 'Klasik': {}, 'Kayu': { slat: 'kotak', mobile: false }, 'Beroda': { wheels: true, lowSide: true } } },
  mejaRias: { cat: 'kamar', label: 'Meja rias', schema: vanitySchema, build: buildVanity,
    slots: { utama: 'Badan & bingkai', sekunder: 'Kaki', kain: 'Bantalan stool', aksen: 'Pegangan' },
    mats: { utama: { c: '#f2eee8', f: 'satin' }, sekunder: { c: '#d8c09a', f: 'kayu' }, kain: { c: '#e3b8b0', f: 'beludru' }, aksen: BRASS },
    styles: { 'Hollywood': { bulbs: true, mshape: 'persegi', mw: 70, mh: 60 }, 'Arch': { mshape: 'lengkung', bulbs: false }, 'Bulat': { mshape: 'bulat', mw: 60, bulbs: false, legStyle: 'logam' } } },

  rakDinding: { cat: 'simpan', label: 'Rak dinding', schema: wallShelfSchema, build: buildWallShelf,
    slots: { utama: 'Papan rak', aksen: 'Braket' },
    mats: { utama: WOOD, aksen: BLACK, sekunder: WOOD },
    styles: { 'Melayang': { style: 'melayang' }, 'Braket': { style: 'braket' }, 'Zig-zag': { style: 'tangga', count: 4 }, 'Kotak': { style: 'kotak', count: 3, w: 50 } } },
  rakSepatu: { cat: 'simpan', label: 'Rak sepatu', schema: shoeSchema, build: buildShoeRack,
    slots: { utama: 'Badan', kain: 'Bantalan', aksen: 'Pipa & pegangan' },
    mats: { utama: WOOD, kain: { c: '#8b9aa7', f: 'kain' }, aksen: BLACK, sekunder: WOOD },
    styles: { 'Bangku': { style: 'bangku' }, 'Rak terbuka': { style: 'terbuka', h: 80, rows: 4 }, 'Pipa': { style: 'pipa', h: 70, rows: 3 }, 'Kabinet': { style: 'kabinet', h: 110, rows: 3, w: 70 } } },
  lemariKaca: { cat: 'simpan', label: 'Lemari pajangan', schema: displaySchema, build: buildDisplayCab,
    slots: { utama: 'Badan', sekunder: 'Panel belakang', aksen: 'Pegangan' },
    mats: { utama: { c: '#6b4a33', f: 'kayu' }, sekunder: { c: '#e9e4da', f: 'matte' }, aksen: BRASS, kaca: { c: '#dff0ee', f: 'kaca' } },
    styles: { 'Vitrin': { lowerH: 0, glassSides: true }, 'Bufet kaca': { lowerH: 70, h: 190 }, 'Rendah': { h: 110, lowerH: 0, shelves: 1, w: 120, doors: 2 } } },
  rakKubus: { cat: 'simpan', label: 'Rak kubus', schema: cubeSchema, build: buildCubes,
    slots: { utama: 'Papan', sekunder: 'Panel belakang', kain: 'Kotak kain' },
    mats: { utama: { c: '#f2f0ec', f: 'satin' }, sekunder: { c: '#f2f0ec', f: 'satin' }, kain: { c: '#9aa7a0', f: 'kain' }, aksen: BLACK },
    styles: { '3×3': { cols: 3, rows: 3 }, 'Memanjang': { cols: 4, rows: 2, legH: 15 }, 'Tinggi': { cols: 2, rows: 5 } } },
  lemariArsip: { cat: 'simpan', label: 'Lemari arsip', schema: filingSchema, build: buildFiling,
    slots: { utama: 'Badan', aksen: 'Pegangan & label' },
    mats: { utama: { c: '#8f959b', f: 'satin' }, aksen: { c: '#c7c9cc', f: 'logam' }, sekunder: WOOD },
    styles: { '4 laci': { drawers: 4 }, 'Mobile pedestal': { drawers: 3, h: 60, wheels: true, d: 50, w: 40 }, 'Lateral': { w: 80, h: 100, drawers: 3, d: 45 } } },
};
export { SHAPES };
