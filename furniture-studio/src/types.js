// Furniture & household object catalogue: parameter schemas + generators.
import { outline } from './geo.js';
import {
  legs, radialLegs, apron, handle, front, drawer, door, carcass, pedestal,
  LEG_LABELS, HANDLE_LABELS, FRONT_LABELS, METAL_LEGS, rad, clamp, lerp, rng, V,
} from './parts.js';
import * as THREE from 'three';

// ---- schema helpers -----------------------------------------------------------
const R = (k, l, min, max, step, v, u = 'cm', when) => ({ t: 'r', k, l, min, max, step, v, u, when });
const S = (k, l, o, v, when) => ({ t: 's', k, l, o: Array.isArray(o) ? o : Object.entries(o), v, when });
const C = (k, l, v, when) => ({ t: 'c', k, l, v, when });
const G = (title, params) => ({ title, params });
const pick = (labels, keys) => keys.map((k) => [k, labels[k]]);

const SHAPES = { persegi: 'Persegi', tumpul: 'Sudut tumpul', lunak: 'Squircle', kapsul: 'Kapsul', oval: 'Oval', bulat: 'Bulat' };
const EDGES = { siku: 'Siku', bevel: 'Bevel', bulat: 'Membulat', tipis: 'Tipis (pisau)' };
const SHADES = { drum: 'Drum', kerucut: 'Kerucut', kubah: 'Kubah', bola: 'Bola', lonceng: 'Lonceng', plisket: 'Plisket' };

function legGroup(keys, d = {}, extra = []) {
  return G('Kaki', [
    S('legStyle', 'Model kaki', pick(LEG_LABELS, keys), d.legStyle ?? keys[0]),
    R('legT', 'Tebal kaki', 1.5, 12, 0.5, d.legT ?? 4),
    R('legTaper', 'Runcing ujung', 0, 0.7, 0.05, d.legTaper ?? 0.25, '×', (p) => ['runcing', 'bulat', 'mid', 'bubut'].includes(p.legStyle)),
    R('legSplay', 'Kemiringan', 0, 16, 0.5, d.legSplay ?? 0, '°', (p) => !['panel', 'plinth', 'pedestal', 'trestle', 'bubut'].includes(p.legStyle)),
    R('legInset', 'Jarak dari tepi', 0, 25, 0.5, d.legInset ?? 2, 'cm', (p) => p.legStyle !== 'pedestal'),
    S('pedBase', 'Alas pedestal', { piringan: 'Piringan', silang: 'Silang', bintang: 'Bintang + roda' }, d.pedBase ?? 'piringan', (p) => p.legStyle === 'pedestal'),
    S('stretch', 'Penguat', { none: 'Tanpa', h: 'Bentuk H', kotak: 'Keliling', rak: 'Rak bawah' }, d.stretch ?? 'none', (p) => ['lurus', 'runcing', 'bulat', 'mid', 'logam', 'panel'].includes(p.legStyle)),
    R('stretchH', 'Tinggi penguat', 3, 60, 0.5, d.stretchH ?? 15, 'cm', (p) => p.stretch !== 'none' && ['lurus', 'runcing', 'bulat', 'mid', 'logam'].includes(p.legStyle)),
    ...extra,
  ]);
}
const handleGroup = (d = {}, extra = []) => G('Pegangan & muka', [
  S('frontStyle', 'Model muka', pick(FRONT_LABELS, d.fronts || ['polos', 'shaker', 'bilah', 'louvre', 'kaca', 'rotan']), d.frontStyle ?? 'polos'),
  S('handle', 'Pegangan', HANDLE_LABELS, d.handle ?? 'bar'),
  R('handleLen', 'Panjang pegangan', 3, 60, 0.5, d.handleLen ?? 12, 'cm', (p) => ['bar', 'tab', 'cekung', 'kulit'].includes(p.handle)),
  ...extra,
]);

const isMetal = (p) => METAL_LEGS.has(p.legStyle);

// ---- seating ---------------------------------------------------------------------
function buildChair(b, P) {
  const W = P.seatW, D = P.seatD, H = P.seatH, T = P.seatT;
  const y0 = H - T;
  const lg = legs(b, P, W, D, y0);
  const hx = lg.hx, hz = lg.hz, t = P.legT;
  if (P.apron && ['lurus', 'runcing', 'bulat', 'mid', 'bubut'].includes(P.legStyle)) apron(b, hx, hz, y0, 6, t, 'sekunder');
  b.slab('utama', 'Dudukan', P.seatShape, W, D, T, 0, y0, 0, { r: P.seatR, edge: P.seatEdge });
  let top = H;
  if (P.cushion) {
    b.boxY('kain', 'Bantalan duduk', W - 3, P.cushionT, D - 3, 0, H, 0.5, { r: P.cushionT * 0.45 });
    top += P.cushionT;
  }
  // back, built inside a tilted group hinged at the rear of the seat
  const bs = P.backStyle;
  if (bs !== 'tanpa') {
    const bx = hx;
    b.group('Sandaran', 0, H, -hz, (g) => {
      g.rotation.x = -rad(P.backTilt);
      const bh = P.backH, bend = P.backCurve;
      const postR = t * 0.42;
      const sq = P.legStyle === 'lurus' || P.legStyle === 'runcing';
      const pslot = isMetal(P) || P.legStyle === 'logam' ? 'aksen' : 'sekunder';
      const post = (x) => b.rod(pslot, 'Tiang sandaran', [x, -T, 0], [x, bh, bend * 0.0], postR, postR * 0.9, sq ? 4 : 16);
      post(-bx); post(bx);
      const iw = Math.max(4, bx * 2 - t * 0.4);
      const zAt = (x) => bend * (x / (iw / 2)) ** 2;
      const rail = (y, h, th = 2, n = 'Palang sandaran') => b.curvedBoard('utama', n, iw, h, th, bend, 0, y, 0);
      if (bs === 'panel') rail(bh * 0.72, bh * 0.5, 2, 'Panel sandaran');
      else if (bs === 'lengkung') b.curvedBoard('utama', 'Papan lengkung', iw + t * 1.2, bh * 0.34, 2.2, bend * 1.4, 0, bh * 0.8, 0.5, { r: 1 });
      else if (bs === 'jok') {
        rail(bh * 0.62, bh * 0.72, 2.2, 'Rangka jok');
        b.box('kain', 'Jok sandaran', iw - 1, bh * 0.66, 4.5, 0, bh * 0.62, 2.6 + bend * 0.2, { r: 2 });
      } else if (bs === 'tangga') {
        for (let i = 0; i < 3; i++) rail(bh * (0.45 + i * 0.25), 5, 1.8);
      } else if (bs === 'bilah_h') {
        const n = Math.max(2, P.slats | 0);
        for (let i = 0; i < n; i++) rail(bh * 0.35 + (bh * 0.6) * (i / Math.max(1, n - 1)), clamp(bh * 0.5 / n, 2.5, 9), 1.8);
      } else if (bs === 'bilah_v' || bs === 'spindle') {
        rail(bh - 3, 6, 2.4, 'Palang atas');
        if (bs === 'bilah_v') rail(bh * 0.18, 4, 2, 'Palang bawah');
        const n = Math.max(2, P.slats | 0);
        const yA = bs === 'spindle' ? 0 : bh * 0.18, yB = bh - 3;
        for (let i = 0; i < n; i++) {
          const x = -iw / 2 + iw * ((i + 1) / (n + 1));
          if (bs === 'spindle') b.rod('sekunder', 'Spindle', [x, yA, zAt(x)], [x, yB, zAt(x)], 0.8, 0.65, 10);
          else b.box('utama', 'Bilah', clamp(iw / n * 0.45, 2, 7), yB - yA, 1.4, x, (yA + yB) / 2, zAt(x));
        }
      }
    });
  }
  if (P.arms) {
    const ay = top + P.armH;
    for (const sx of [-1, 1]) {
      const x = sx * (hx + 0.5);
      const slot = isMetal(P) || P.legStyle === 'logam' ? 'aksen' : 'sekunder';
      b.rod(slot, 'Tiang lengan', [x, y0, hz - 2], [x, ay - 1, hz - 3], t * 0.38, t * 0.34, P.legStyle === 'lurus' || P.legStyle === 'runcing' ? 4 : 14);
      b.box('utama', 'Lengan', 4.5, 2.4, D * 0.86, x, ay, -D * 0.02, { r: 1, rot: [-rad(P.backTilt) * 0.3, 0, 0] });
    }
  }
}
const chairSchema = [
  G('Dimensi', [
    R('seatW', 'Lebar dudukan', 32, 70, 0.5, 44), R('seatD', 'Dalam dudukan', 32, 65, 0.5, 44),
    R('seatH', 'Tinggi dudukan', 30, 80, 0.5, 46), R('seatT', 'Tebal dudukan', 1.2, 8, 0.1, 3.5),
  ]),
  G('Dudukan', [
    S('seatShape', 'Bentuk', pick(SHAPES, ['persegi', 'tumpul', 'lunak', 'bulat']), 'tumpul'),
    R('seatR', 'Radius sudut', 0.5, 20, 0.5, 5, 'cm', (p) => p.seatShape === 'tumpul'),
    S('seatEdge', 'Profil tepi', EDGES, 'bulat'),
    C('cushion', 'Bantalan jok', false), R('cushionT', 'Tebal bantalan', 2, 12, 0.5, 5, 'cm', (p) => p.cushion),
  ]),
  G('Sandaran', [
    S('backStyle', 'Model sandaran', { panel: 'Panel', bilah_v: 'Bilah vertikal', bilah_h: 'Bilah horizontal', spindle: 'Spindle (Windsor)', tangga: 'Tangga (ladder)', jok: 'Berjok', lengkung: 'Papan lengkung', tanpa: 'Tanpa sandaran' }, 'bilah_v'),
    R('backH', 'Tinggi sandaran', 15, 80, 0.5, 42, 'cm', (p) => p.backStyle !== 'tanpa'),
    R('backTilt', 'Kemiringan', -4, 25, 0.5, 8, '°', (p) => p.backStyle !== 'tanpa'),
    R('backCurve', 'Lengkung', 0, 10, 0.1, 3, 'cm', (p) => p.backStyle !== 'tanpa'),
    R('slats', 'Jumlah bilah', 2, 12, 1, 4, '', (p) => ['bilah_v', 'bilah_h', 'spindle'].includes(p.backStyle)),
    C('arms', 'Sandaran tangan', false), R('armH', 'Tinggi lengan', 12, 35, 0.5, 21, 'cm', (p) => p.arms),
  ]),
  legGroup(['runcing', 'lurus', 'bulat', 'mid', 'bubut', 'logam', 'sled', 'hairpin', 'pedestal'], { legT: 3.5, legSplay: 3, legInset: 1.5 }, [C('apron', 'Apron di bawah dudukan', true, (p) => ['lurus', 'runcing', 'bulat', 'mid', 'bubut'].includes(p.legStyle))]),
];

function upholsteredBase(b, P, W, D, legH, seats, opts = {}) {
  const arm = P.armStyle, aw = arm === 'tanpa' ? 0 : P.armW;
  const seatTop = P.seatH, ct = P.cushionT, baseTop = seatTop - ct;
  const backT = P.backT ?? 16;
  const puff = P.puff ?? 0.35;
  legs(b, P, W, D, legH);
  // base box
  b.boxY('kain', 'Rangka bawah', W - (arm === 'tanpa' ? 0 : 0.4), baseTop - legH, D, 0, legH, 0, { r: 2.5 });
  // back
  const bh = P.backH - legH;
  b.group('Sandaran', 0, legH, -D / 2 + backT / 2, (g) => {
    g.rotation.x = -rad(P.backTilt * 0.4);
    b.boxY('kain', 'Sandaran', W - aw * 2 + (opts.backFull ? aw * 2 : 0.2), bh, backT, 0, 0, 0, { r: Math.min(5, backT * 0.4) });
  });
  // arms
  if (arm !== 'tanpa') {
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - aw / 2);
      const ah = P.armH - legH;
      if (arm === 'kotak') b.boxY('kain', 'Lengan', aw, ah, D, x, legH, 0, { r: 3 });
      else if (arm === 'bulat') {
        b.boxY('kain', 'Lengan', aw * 0.8, ah - aw * 0.4, D, x - sx * aw * 0.1, legH, 0, { r: 2 });
        b.cyl('kain', 'Gulungan lengan', aw * 0.55, aw * 0.55, D, x + sx * aw * 0.05, 0, 0, 24, { rot: [Math.PI / 2, 0, 0] }).position.y = legH + ah - aw * 0.5;
      } else if (arm === 'miring') {
        const sh = new THREE.Shape();
        sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(D / 2, ah * 0.78); sh.quadraticCurveTo(D / 2, ah, D / 2 - 8, ah); sh.lineTo(-D / 2, ah); sh.lineTo(-D / 2, 0);
        b.panel('kain', 'Lengan miring', sh, aw, x, legH, 0, { rot: [0, Math.PI / 2, 0], round: true });
      } else if (arm === 'kayu') {
        b.boxY('sekunder', 'Tiang lengan', 4, ah, 4, x, legH, D / 2 - 5, { r: 1 });
        b.boxY('sekunder', 'Tiang lengan', 4, ah, 4, x, legH, -D / 2 + 5, { r: 1 });
        b.boxY('sekunder', 'Lengan kayu', aw, 3, D, x, P.armH - 3, 0, { r: 1.2 });
      }
    }
  }
  // seat cushions
  const iw = W - (arm === 'kayu' ? aw * 2 + 1 : aw * 2);
  const cd = D - backT - 1;
  const n = P.split === false ? 1 : seats;
  const cw = iw / n;
  for (let i = 0; i < n; i++) {
    b.boxY('kain', 'Bantal duduk', cw - 0.6, ct, cd, -iw / 2 + cw * (i + 0.5), baseTop, D / 2 - cd / 2, { r: ct * puff });
  }
  if (P.backCush) {
    const bct = Math.min(16, backT);
    for (let i = 0; i < n; i++) {
      b.group('Bantal sandaran', -iw / 2 + cw * (i + 0.5), seatTop, -D / 2 + backT + bct * 0.4, (g) => {
        g.rotation.x = -rad(P.backTilt);
        b.boxY('kain', 'Bantal sandaran', cw - 0.8, P.backH - seatTop - 3, bct, 0, 0, 0, { r: bct * puff });
      });
    }
  }
  if (P.tufted) {
    const bw = W - aw * 2, cols = Math.max(2, Math.round(bw / 18)), rows = 2;
    const zb = -D / 2 + backT + 0.2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      b.sphere('kain', 'Kancing', 0.9, -bw / 2 + bw * ((c + 0.5) / cols), seatTop + 8 + r * (P.backH - seatTop - 14) / rows + 6, zb, 8);
    }
  }
  return { iw, cd, baseTop };
}

function buildArmchair(b, P) {
  upholsteredBase(b, P, P.w, P.d, P.legH, 1);
  if (P.pillow) b.group('Bantal', 0, P.seatH + 14, -P.d / 2 + 26, (g) => { g.rotation.x = -0.35; b.box('aksen', 'Bantal hias', 38, 38, 12, 0, 0, 0, { r: 5.5 }); });
}
const loungeCommon = (d) => [
  G('Bantalan', [
    R('cushionT', 'Tebal bantal duduk', 6, 22, 0.5, d.cushionT ?? 12), R('puff', 'Kembung bantal', 0.05, 0.48, 0.01, 0.32, '×'),
    C('backCush', 'Bantal sandaran', d.backCush ?? true), C('tufted', 'Kancing (tufted)', false),
  ]),
  G('Lengan', [
    S('armStyle', 'Model lengan', { kotak: 'Kotak', bulat: 'Gulung (rolled)', miring: 'Miring', kayu: 'Lengan kayu', tanpa: 'Tanpa' }, d.armStyle ?? 'kotak'),
    R('armW', 'Lebar lengan', 4, 30, 0.5, d.armW ?? 14, 'cm', (p) => p.armStyle !== 'tanpa'),
    R('armH', 'Tinggi lengan', 40, 80, 0.5, d.armH ?? 60, 'cm', (p) => p.armStyle !== 'tanpa'),
  ]),
];
const armchairSchema = [
  G('Dimensi', [
    R('w', 'Lebar', 55, 110, 0.5, 80), R('d', 'Dalam', 60, 110, 0.5, 84), R('seatH', 'Tinggi duduk', 32, 55, 0.5, 43),
    R('backH', 'Tinggi total', 60, 115, 0.5, 82), R('backT', 'Tebal sandaran', 8, 26, 0.5, 16), R('backTilt', 'Kemiringan sandaran', 0, 25, 0.5, 10, '°'),
  ]),
  ...loungeCommon({}),
  legGroup(['runcing', 'mid', 'bulat', 'lurus', 'bubut', 'logam', 'plinth', 'sled'], { legStyle: 'mid', legT: 4, legSplay: 6, legInset: 5 }, [
    R('legH', 'Tinggi kaki', 2, 30, 0.5, 14), C('pillow', 'Bantal hias (warna aksen)', true),
  ]),
];

function buildSofa(b, P) {
  const aw = P.armStyle === 'tanpa' ? 0 : P.armW;
  const W = P.seats * P.seatW + aw * 2;
  const r = upholsteredBase(b, P, W, P.d, P.legH, P.seats);
  if (P.chaise !== 'tanpa') {
    const sx = P.chaise === 'kiri' ? -1 : 1;
    const cw = P.seatW + aw, len = P.chaiseD - P.d;
    const x = sx * (W / 2 - cw / 2), z0 = P.d / 2;
    if (len > 5) {
      b.group('Chaise', x, 0, z0 + len / 2, () => {
        legs(b, { ...P, stretch: 'none' }, cw, len, P.legH);
        b.boxY('kain', 'Rangka chaise', cw, P.seatH - P.cushionT - P.legH, len, 0, P.legH, -0.5, { r: 2.5 });
        if (aw) b.boxY('kain', 'Lengan chaise', aw, P.armH - P.legH, len + 1, sx * (cw / 2 - aw / 2), P.legH, -0.5, { r: 3 });
        b.boxY('kain', 'Bantal chaise', cw - aw - 0.6, P.cushionT, len + 2, -sx * aw / 2, P.seatH - P.cushionT, -1.5, { r: P.cushionT * P.puff });
      });
    }
  }
  const n = P.pillows | 0;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const x = side * (r.iw / 2 - 20 - k * 30);
    b.group('Bantal hias', x, P.seatH + 15, -P.d / 2 + P.backT + 12, (g) => { g.rotation.set(-0.3, -side * 0.25, side * 0.08); b.box('aksen', 'Bantal hias', 40, 40, 12, 0, 0, 0, { r: 5.5 }); });
  }
}
const sofaSchema = [
  G('Dimensi', [
    R('seats', 'Jumlah dudukan', 1, 5, 1, 3, ''), R('seatW', 'Lebar per dudukan', 45, 90, 0.5, 62), R('d', 'Dalam', 70, 120, 0.5, 92),
    R('seatH', 'Tinggi duduk', 32, 55, 0.5, 44), R('backH', 'Tinggi sandaran', 55, 110, 0.5, 80), R('backT', 'Tebal sandaran', 8, 30, 0.5, 18),
    R('backTilt', 'Kemiringan sandaran', 0, 25, 0.5, 10, '°'),
  ]),
  ...loungeCommon({ cushionT: 14, armW: 18, armH: 62 }),
  G('Konfigurasi', [
    C('split', 'Bantal duduk terpisah', true),
    S('chaise', 'Chaise (bentuk L)', { tanpa: 'Tanpa', kiri: 'Kiri', kanan: 'Kanan' }, 'tanpa'),
    R('chaiseD', 'Panjang chaise', 120, 190, 0.5, 155, 'cm', (p) => p.chaise !== 'tanpa'),
    R('pillows', 'Bantal hias', 0, 6, 1, 2, ''),
  ]),
  legGroup(['runcing', 'mid', 'bulat', 'lurus', 'logam', 'plinth', 'sled', 'bubut'], { legStyle: 'runcing', legT: 4, legInset: 6 }, [R('legH', 'Tinggi kaki', 2, 30, 0.5, 13)]),
];

function buildStool(b, P) {
  const H = P.seatH, T = P.seatT, Wd = P.seatW;
  const y0 = H - T;
  const rr = Wd / 2 - (P.legInset ?? 3) - P.legT / 2;
  radialLegs(b, P, P.legCount, Math.max(2, rr), y0);
  if (P.legStyle !== 'pedestal' && P.apron) {
    b.cyl('sekunder', 'Cincin dudukan', Wd / 2 - P.legInset * 0.5, Wd / 2 - P.legInset * 0.5, 4, 0, y0 - 4, 0, 32, { open: true });
  }
  const shape = P.seatShape;
  if (P.saddle && shape === 'bulat') {
    const r = Wd / 2;
    b.lathe('utama', 'Dudukan', [[0, T * 0.55], [r * 0.5, T * 0.7], [r * 0.92, T], [r, T * 0.75], [r * 0.98, 0], [0, 0]], 0, y0, 0, 48);
  } else b.slab('utama', 'Dudukan', shape, Wd, Wd, T, 0, y0, 0, { r: 6, edge: P.seatEdge });
  let top = H;
  if (P.cushion) { b.slab('kain', 'Bantalan', shape, Wd - 2, Wd - 2, 4, 0, H, 0, { r: 6, edge: 'bulat' }); top += 4; }
  if (P.back !== 'tanpa') {
    const bh = P.back === 'rendah' ? 18 : 30;
    const slot = METAL_LEGS.has(P.legStyle) || P.legStyle === 'logam' ? 'aksen' : 'sekunder';
    const rz = -Wd / 2 + 3;
    for (const sx of [-1, 1]) b.rod(slot, 'Tiang sandaran', [sx * Wd * 0.3, top - 2, rz], [sx * Wd * 0.34, top + bh, rz - 3], 1, 1, 12);
    if (P.back === 'bulat') b.torus('utama', 'Sandaran lingkar', Wd * 0.38, 1.6, 0, top + bh, -2, [Math.PI / 2, 0, 0], Math.PI);
    else b.curvedBoard('utama', 'Sandaran', Wd * 0.8, 9, 2, 3.5, 0, top + bh - 3, rz - 2.6, { r: 0.8 });
  }
}
const stoolSchema = [
  G('Dimensi', [
    R('seatH', 'Tinggi dudukan', 35, 85, 0.5, 66), R('seatW', 'Diameter / lebar', 26, 55, 0.5, 36), R('seatT', 'Tebal dudukan', 1.5, 8, 0.1, 3.5),
  ]),
  G('Dudukan', [
    S('seatShape', 'Bentuk', pick(SHAPES, ['bulat', 'persegi', 'tumpul', 'lunak']), 'bulat'),
    S('seatEdge', 'Profil tepi', EDGES, 'bulat'),
    C('saddle', 'Dudukan cekung (bulat)', true, (p) => p.seatShape === 'bulat'), C('cushion', 'Bantalan', false),
    S('back', 'Sandaran', { tanpa: 'Tanpa', rendah: 'Rendah', tinggi: 'Tinggi', bulat: 'Lingkar' }, 'tanpa'),
  ]),
  G('Kaki', [
    S('legStyle', 'Model kaki', pick(LEG_LABELS, ['bulat', 'mid', 'runcing', 'lurus', 'bubut', 'logam', 'pedestal']), 'mid'),
    R('legCount', 'Jumlah kaki', 3, 5, 1, 4, '', (p) => p.legStyle !== 'pedestal'),
    R('legT', 'Tebal kaki', 1.5, 8, 0.5, 3.5), R('legTaper', 'Runcing ujung', 0, 0.7, 0.05, 0.3, '×'),
    R('legSplay', 'Kemiringan', 0, 16, 0.5, 7, '°', (p) => p.legStyle !== 'pedestal' && p.legStyle !== 'bubut'),
    R('legInset', 'Jarak dari tepi', 0, 12, 0.5, 4),
    S('pedBase', 'Alas pedestal', { piringan: 'Piringan', silang: 'Silang', bintang: 'Bintang + roda' }, 'piringan', (p) => p.legStyle === 'pedestal'),
    S('footrest', 'Pijakan kaki', { tanpa: 'Tanpa', cincin: 'Cincin logam', palang: 'Palang' }, 'cincin', (p) => p.legStyle !== 'pedestal' && p.legStyle !== 'bubut'),
    R('footH', 'Tinggi pijakan', 10, 50, 0.5, 26, 'cm', (p) => p.footrest !== 'tanpa'),
    C('apron', 'Cincin bawah dudukan', false, (p) => p.legStyle !== 'pedestal'),
  ]),
];

function buildBench(b, P) {
  const W = P.w, D = P.d, H = P.h, T = P.seatT;
  const y0 = H - T;
  legs(b, P, W, D, y0);
  if (P.seatStyle === 'bilah') {
    const n = Math.max(2, P.slats | 0), gap = 1.2, sw = (D - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) b.boxY('utama', 'Bilah dudukan', W, T, sw, 0, y0, -D / 2 + sw / 2 + i * (sw + gap), { r: 0.6 });
    b.boxY('sekunder', 'Palang dudukan', T, 3, D - 2, -W / 2 + 12, y0 - 3, 0);
    b.boxY('sekunder', 'Palang dudukan', T, 3, D - 2, W / 2 - 12, y0 - 3, 0);
  } else b.slab('utama', 'Dudukan', P.shape, W, D, T, 0, y0, 0, { r: 4, edge: P.edge });
  if (P.cushion) b.boxY('kain', 'Bantalan', W - 4, 6, D - 4, 0, H, 0, { r: 2.6 });
  if (P.shelf) {
    const sy = Math.max(8, H * 0.28), n = 5, sw = (D - 12) / n;
    for (let i = 0; i < n; i++) b.boxY('utama', 'Bilah rak', W - 2 * (P.legInset + P.legT + 1), 1.8, sw - 1.2, 0, sy, -D / 2 + 6 + sw * (i + 0.5), { r: 0.4 });
    for (const sx of [-1, 1]) b.boxY('sekunder', 'Palang rak', 2.5, 3, D - P.legInset * 2, sx * (W / 2 - P.legInset - P.legT - 1.2), sy - 3, 0);
  }
  if (P.back) {
    const top = H + (P.cushion ? 6 : 0);
    b.group('Sandaran', 0, top, -D / 2 + 2, (g) => {
      g.rotation.x = -rad(10);
      const slot = METAL_LEGS.has(P.legStyle) ? 'aksen' : 'sekunder';
      for (const x of [-W / 2 + 6, W / 2 - 6, ...(W > 130 ? [0] : [])]) b.boxY(slot, 'Tiang sandaran', 3.5, P.backH, 3, x, -T - 2, -1.5, { r: 0.6 });
      for (let i = 0; i < 3; i++) b.boxY('utama', 'Bilah sandaran', W - 4, P.backH / 5, 2, 0, P.backH * (0.32 + i * 0.24), 0.5, { r: 0.6 });
    });
  }
}
const benchSchema = [
  G('Dimensi', [R('w', 'Panjang', 60, 240, 1, 140), R('d', 'Dalam', 28, 60, 0.5, 38), R('h', 'Tinggi', 30, 60, 0.5, 45), R('seatT', 'Tebal dudukan', 2, 8, 0.1, 4)]),
  G('Dudukan', [
    S('seatStyle', 'Model', { papan: 'Papan utuh', bilah: 'Bilah' }, 'papan'),
    R('slats', 'Jumlah bilah', 2, 8, 1, 4, '', (p) => p.seatStyle === 'bilah'),
    S('shape', 'Bentuk', pick(SHAPES, ['persegi', 'tumpul', 'kapsul', 'oval']), 'tumpul', (p) => p.seatStyle === 'papan'),
    S('edge', 'Profil tepi', EDGES, 'bulat', (p) => p.seatStyle === 'papan'),
    C('cushion', 'Bantalan', false), C('shelf', 'Rak bawah (bilah)', false),
    C('back', 'Sandaran', false), R('backH', 'Tinggi sandaran', 20, 60, 0.5, 38, 'cm', (p) => p.back),
  ]),
  legGroup(['lurus', 'runcing', 'bulat', 'mid', 'panel', 'hairpin', 'x', 'trestle', 'sled', 'logam'], { legStyle: 'runcing', legT: 4.5, legSplay: 4, legInset: 6 }),
];

// ---- tables ----------------------------------------------------------------------
function tableTop(b, P, W, D, H, o = {}) {
  const shape = P.topShape || 'persegi';
  const Dd = shape === 'bulat' ? W : D;
  const slot = P.topMat === 'kaca' ? 'kaca' : 'utama';
  b.slab(slot, 'Daun meja', shape, W, Dd, P.topT, 0, H - P.topT, 0, { r: P.topR ?? 6, edge: P.edge });
  return Dd;
}
function legFoot(P, W, D, shape) {
  // round/oval tops need the legs pulled in
  const k = shape === 'bulat' || shape === 'oval' ? 0.72 : 1;
  return [W * k, D * k];
}
function buildDining(b, P) {
  const W = P.w, H = P.h;
  const D = tableTop(b, P, W, P.d, H);
  const [lw, ld] = legFoot(P, W, D, P.topShape);
  const yTop = H - P.topT;
  const lg = legs(b, P, lw, ld, yTop);
  if (P.apron && ['lurus', 'runcing', 'bulat', 'mid', 'bubut', 'logam'].includes(P.legStyle)) apron(b, lg.hx, lg.hz, yTop, P.apronH, P.legT, P.legStyle === 'logam' ? 'aksen' : 'sekunder');
  if (P.chairs) {
    const C0 = Object.fromEntries(chairSchema.flatMap((g) => g.params).map((p) => [p.k, p.v]));
    const cp = { ...C0, legStyle: METAL_LEGS.has(P.legStyle) ? 'logam' : P.legStyle === 'bubut' ? 'bubut' : 'runcing', backStyle: P.chairBack, cushion: P.chairBack === 'jok' };
    const per = Math.max(1, Math.floor((W - 30) / 62));
    const round = P.topShape === 'bulat';
    const place = (x, z, ry) => b.group('Kursi', x, 0, z, (g) => { g.rotation.y = ry; buildChair(b, cp); });
    if (round) {
      const n = clamp(Math.round((Math.PI * W) / 62), 3, 8);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const r = W / 2 + 4; place(Math.sin(a) * r, Math.cos(a) * r, a + Math.PI); }
    } else {
      for (let i = 0; i < per; i++) {
        const x = -W / 2 + W * ((i + 0.5) / per);
        place(x, D / 2 + 6, Math.PI); place(x, -D / 2 - 6, 0);
      }
      if (P.chairEnds) { place(W / 2 + 6, 0, -Math.PI / 2); place(-W / 2 - 6, 0, Math.PI / 2); }
    }
  }
}
const topGroup = (d = {}) => G('Daun meja', [
  S('topShape', 'Bentuk', pick(SHAPES, ['persegi', 'tumpul', 'lunak', 'kapsul', 'oval', 'bulat']), d.topShape ?? 'tumpul'),
  R('topR', 'Radius sudut', 0.5, 40, 0.5, d.topR ?? 6, 'cm', (p) => p.topShape === 'tumpul'),
  R('topT', 'Tebal daun', 1, 10, 0.1, d.topT ?? 3.5),
  S('edge', 'Profil tepi', EDGES, d.edge ?? 'bevel'),
  S('topMat', 'Material daun', { utama: 'Material utama', kaca: 'Kaca' }, d.topMat ?? 'utama'),
]);
const diningSchema = [
  G('Dimensi', [R('w', 'Panjang', 60, 300, 1, 180), R('d', 'Lebar', 50, 130, 0.5, 90, 'cm', (p) => p.topShape !== 'bulat'), R('h', 'Tinggi', 55, 110, 0.5, 75)]),
  topGroup(),
  legGroup(['runcing', 'lurus', 'bulat', 'mid', 'bubut', 'logam', 'hairpin', 'sled', 'x', 'panel', 'pedestal', 'trestle'], { legT: 7, legTaper: 0.3, legInset: 8 }, [
    C('apron', 'Apron', true, (p) => ['lurus', 'runcing', 'bulat', 'mid', 'bubut', 'logam'].includes(p.legStyle)),
    R('apronH', 'Tinggi apron', 3, 16, 0.5, 8, 'cm', (p) => p.apron),
  ]),
  G('Set kursi', [
    C('chairs', 'Tampilkan kursi', false),
    S('chairBack', 'Model kursi', { bilah_v: 'Bilah vertikal', spindle: 'Spindle', jok: 'Berjok', lengkung: 'Papan lengkung', tangga: 'Tangga' }, 'bilah_v', (p) => p.chairs),
    C('chairEnds', 'Kursi di ujung meja', false, (p) => p.chairs && p.topShape !== 'bulat'),
  ]),
];

function buildCoffee(b, P) {
  const W = P.w, H = P.h;
  const D = tableTop(b, P, W, P.d, H);
  const yTop = H - P.topT;
  const [lw, ld] = legFoot(P, W, D, P.topShape);
  const nd = P.drawers | 0;
  if (nd > 0 && P.topShape !== 'bulat' && P.topShape !== 'oval') {
    const bh = 12, bw = lw - 2 * (P.legInset + P.legT) + 1, bd = ld - 2 * P.legInset - 2;
    b.boxY('utama', 'Kotak laci', bw, 1.4, bd, 0, yTop - bh, 0);
    b.boxY('utama', 'Belakang', bw, bh, 1.4, 0, yTop - bh, -bd / 2 + 0.7);
    const dw = bw / nd;
    for (let i = 0; i < nd; i++) drawer(b, P, dw, bh - 1, bd - 4, -bw / 2 + dw * (i + 0.5), yTop - bh / 2 - 0.3, bd / 2 - 1.8, P.drawerOpen / 100);
  }
  legs(b, P, lw, ld, yTop);
  if (P.shelf) {
    const sh = P.topShape;
    const k = P.legStyle === 'pedestal' ? 0.55 : 1;
    b.slab(P.shelfMat === 'kaca' ? 'kaca' : 'utama', 'Rak bawah', sh, (lw - P.legInset * 2) * k, ((sh === 'bulat' ? lw : ld) - P.legInset * 2) * k, 2, 0, P.shelfH, 0, { r: 4, edge: 'bevel' });
  }
}
const coffeeSchema = [
  G('Dimensi', [R('w', 'Panjang', 40, 180, 0.5, 110), R('d', 'Lebar', 35, 110, 0.5, 60, 'cm', (p) => p.topShape !== 'bulat'), R('h', 'Tinggi', 25, 60, 0.5, 42)]),
  topGroup({ topShape: 'kapsul', topT: 3, edge: 'bulat' }),
  G('Penyimpanan', [
    C('shelf', 'Rak bawah', true), R('shelfH', 'Tinggi rak', 4, 30, 0.5, 10, 'cm', (p) => p.shelf),
    S('shelfMat', 'Material rak', { utama: 'Material utama', kaca: 'Kaca' }, 'utama', (p) => p.shelf),
    R('drawers', 'Jumlah laci', 0, 3, 1, 0, '', (p) => !['bulat', 'oval'].includes(p.topShape)),
    R('drawerOpen', 'Buka laci', 0, 100, 1, 0, '%', (p) => p.drawers > 0),
  ]),
  legGroup(['mid', 'runcing', 'lurus', 'bulat', 'bubut', 'logam', 'hairpin', 'sled', 'x', 'panel', 'pedestal', 'plinth'], { legT: 4.5, legSplay: 6, legInset: 6 }),
  G('Pegangan laci', [S('handle', 'Pegangan', HANDLE_LABELS, 'knob'), S('frontStyle', 'Model muka', pick(FRONT_LABELS, ['polos', 'shaker', 'bilah', 'rotan']), 'polos'), R('handleLen', 'Panjang pegangan', 3, 30, 0.5, 10)]),
];

function buildSide(b, P) {
  const W = P.w, H = P.h;
  const D = tableTop(b, P, W, P.d, H);
  const yTop = H - P.topT;
  const round = P.topShape === 'bulat' || P.topShape === 'oval';
  if (P.legStyle === 'pedestal' || round || P.radial) {
    radialLegs(b, P, P.legCount, Math.min(W, D) / 2 - (P.legInset ?? 3) - P.legT / 2, yTop);
  } else legs(b, P, W, D, yTop);
  if (P.drawer && !round) {
    const bw = W - 2 * (P.legInset + P.legT), bd = D - 2 * P.legInset - 1, bh = 11;
    b.boxY('utama', 'Kotak laci', bw, bh, bd - 2, 0, yTop - bh, -1);
    drawer(b, P, bw - 1, bh - 1, bd - 6, 0, yTop - bh / 2, bd / 2 - 2, 0);
  }
  if (P.shelf) {
    const k = round ? 0.62 : 1;
    b.slab('utama', 'Rak bawah', P.topShape, (W - P.legInset * 2 - P.legT * 0.5) * k, (D - P.legInset * 2 - P.legT * 0.5) * k, 1.8, 0, P.shelfH, 0, { r: 3, edge: 'bevel' });
  }
}
const sideSchema = [
  G('Dimensi', [R('w', 'Lebar / diameter', 30, 80, 0.5, 46), R('d', 'Dalam', 30, 80, 0.5, 46, 'cm', (p) => p.topShape !== 'bulat'), R('h', 'Tinggi', 35, 80, 0.5, 55)]),
  topGroup({ topShape: 'bulat', topT: 2.5, edge: 'bulat' }),
  G('Penyimpanan', [C('drawer', 'Laci', false, (p) => !['bulat', 'oval'].includes(p.topShape)), C('shelf', 'Rak bawah', true), R('shelfH', 'Tinggi rak', 5, 40, 0.5, 16, 'cm', (p) => p.shelf), S('handle', 'Pegangan laci', HANDLE_LABELS, 'knob', (p) => p.drawer)]),
  G('Kaki', [
    S('legStyle', 'Model kaki', pick(LEG_LABELS, ['mid', 'bulat', 'runcing', 'lurus', 'bubut', 'logam', 'hairpin', 'panel', 'pedestal']), 'mid'),
    R('legCount', 'Jumlah kaki (bulat)', 3, 5, 1, 3, '', (p) => ['bulat', 'oval'].includes(p.topShape) && p.legStyle !== 'pedestal'),
    R('legT', 'Tebal kaki', 1.5, 8, 0.5, 3.5), R('legTaper', 'Runcing ujung', 0, 0.7, 0.05, 0.35, '×'),
    R('legSplay', 'Kemiringan', 0, 16, 0.5, 7, '°'), R('legInset', 'Jarak dari tepi', 0, 15, 0.5, 4),
    S('pedBase', 'Alas pedestal', { piringan: 'Piringan', silang: 'Silang' }, 'piringan', (p) => p.legStyle === 'pedestal'),
  ]),
];

function buildDesk(b, P) {
  const W = P.w, D = P.d, H = P.h;
  b.slab('utama', 'Daun meja', P.topShape, W, D, P.topT, 0, H - P.topT, 0, { r: 3, edge: P.edge });
  const yTop = H - P.topT;
  const pedW = P.pedW, ped = P.pedestal;
  const sides = ped === 'dua' ? [-1, 1] : ped === 'kiri' ? [-1] : ped === 'kanan' ? [1] : [];
  for (const sx of sides) {
    b.group('Kabinet laci', sx * (W / 2 - pedW / 2 - 1), 0, -1, () => {
      carcass(b, pedW, yTop, D - 4, 0, 1.8, { top: false, back: true });
      const n = P.drawers | 0, base = 6, dh = (yTop - base - 1) / n;
      b.boxY('sekunder', 'Plint', pedW - 3.6, base, D - 8, 0, 0, -1);
      for (let i = 0; i < n; i++) drawer(b, P, pedW, dh, D - 10, 0, base + dh * (i + 0.5), (D - 4) / 2, i === n - 1 ? P.drawerOpen / 100 : 0);
    });
  }
  // legs only on the free side(s)
  if (sides.length < 2) {
    const freeW = sides.length ? W - pedW - 2 : W;
    const cx = sides.length ? -sides[0] * (pedW + 2) / 2 : 0;
    const g = b.group('Kaki', cx, 0, 0, () => legs(b, P, freeW, D, yTop));
    if (sides.length) for (const m of g.children.slice()) if (Math.sign(Math.round(m.position.x)) === sides[0]) g.remove(m);
  }
  if (P.center) {
    const cw = W - sides.length * (pedW + 2) - 10;
    const cx = sides.length === 1 ? -sides[0] * (pedW + 2) / 2 : 0;
    if (cw > 25) {
      b.boxY('utama', 'Kotak laci tengah', cw, 1.4, D - 10, cx, yTop - 10, -2);
      drawer(b, P, cw - 2, 9, D - 14, cx, yTop - 5, D / 2 - 7, 0, 'polos');
    }
  }
  if (P.modesty) b.boxY('utama', 'Panel penutup', W - 2 * (P.legInset + P.legT) - (sides.length ? 0 : 0), yTop * 0.45, 1.6, 0, yTop * 0.55, -D / 2 + P.legInset + 2);
  if (P.hutch) {
    const hh = P.hutchH, hd = 26;
    const y = H;
    for (const sx of [-1, 1]) b.boxY('utama', 'Sisi rak atas', 1.8, hh, hd, sx * (W / 2 - 0.9), y, -D / 2 + hd / 2);
    b.boxY('utama', 'Atap rak atas', W, 1.8, hd, 0, y + hh - 1.8, -D / 2 + hd / 2);
    b.boxY('utama', 'Rak tengah', W - 3.6, 1.8, hd, 0, y + hh * 0.5, -D / 2 + hd / 2);
    b.boxY('utama', 'Belakang rak atas', W - 3.6, hh, 1, 0, y, -D / 2 + 0.5);
  }
  if (P.cable) b.cyl('gelap', 'Lubang kabel', 3, 3, 0.4, W * 0.32, H - 0.1, -D / 2 + 9, 24);
  if (P.monitor) {
    const mz = -D / 2 + 18;
    b.box('gelap', 'Monitor', 62, 36, 2, 0, H + 26, mz, { r: 0.6 });
    b.box('layar', 'Layar monitor', 60, 33.6, 0.2, 0, H + 26.4, mz + 1.05);
    b.boxY('aksen', 'Kaki monitor', 4, 14, 2, 0, H + 1, mz - 2.2);
    b.boxY('aksen', 'Alas monitor', 22, 1, 16, 0, H, mz - 2);
    b.box('gelap', 'Keyboard', 44, 1.4, 14, 0, H + 0.7, mz + 22, { r: 0.6 });
  }
}
const deskSchema = [
  G('Dimensi', [R('w', 'Lebar', 70, 220, 0.5, 140), R('d', 'Dalam', 40, 90, 0.5, 65), R('h', 'Tinggi', 60, 110, 0.5, 75)]),
  G('Daun meja', [S('topShape', 'Bentuk', pick(SHAPES, ['persegi', 'tumpul', 'lunak', 'kapsul']), 'tumpul'), R('topT', 'Tebal', 1.5, 8, 0.1, 3), S('edge', 'Profil tepi', EDGES, 'bevel')]),
  G('Laci & panel', [
    S('pedestal', 'Kabinet laci', { tanpa: 'Tanpa', kiri: 'Kiri', kanan: 'Kanan', dua: 'Kiri & kanan' }, 'kanan'),
    R('pedW', 'Lebar kabinet', 30, 60, 0.5, 42, 'cm', (p) => p.pedestal !== 'tanpa'),
    R('drawers', 'Jumlah laci', 1, 5, 1, 3, '', (p) => p.pedestal !== 'tanpa'),
    R('drawerOpen', 'Buka laci bawah', 0, 100, 1, 0, '%', (p) => p.pedestal !== 'tanpa'),
    C('center', 'Laci tengah', false), C('modesty', 'Panel penutup depan', false),
    C('hutch', 'Rak atas', false), R('hutchH', 'Tinggi rak atas', 20, 80, 0.5, 38, 'cm', (p) => p.hutch),
    C('cable', 'Lubang kabel', true), C('monitor', 'Tampilkan monitor', false),
  ]),
  handleGroup({ fronts: ['polos', 'shaker', 'bilah', 'rotan'], handle: 'tab', handleLen: 14 }),
  legGroup(['lurus', 'runcing', 'bulat', 'mid', 'logam', 'hairpin', 'sled', 'panel', 'trestle', 'x'], { legT: 4.5, legInset: 3 }),
];

// ---- storage -------------------------------------------------------------------
function baseFor(b, P, W, D) {
  // returns body bottom y; builds legs/plinth
  const lh = P.legH ?? 0;
  if (lh <= 0.01) return 0;
  legs(b, P, W, D, lh);
  return lh;
}
function buildWardrobe(b, P) {
  const W = P.w, H = P.h, D = P.d, t = 1.8;
  const y0 = baseFor(b, P, W, D);
  const bodyH = H - y0 - (P.cornice ? 4 : 0);
  const inn = carcass(b, W, bodyH, D, y0, t, { over: P.cornice ? 0 : 0 });
  if (P.cornice) {
    b.boxY('utama', 'Mahkota', W + 4, 1.8, D + 2, 0, y0 + bodyH, 1, { r: 0.4 });
    b.boxY('utama', 'Mahkota', W + 2, 2.2, D + 1, 0, y0 + bodyH + 1.8, 0.5, { r: 0.8 });
  }
  const nDr = P.drawers | 0, drH = 20;
  const doorsBottom = inn.y0 + nDr * drH;
  // interior
  if (nDr) b.boxY('utama', 'Sekat laci', W - 2 * t, t, D - 1, 0, doorsBottom - t / 2, 0);
  const nd = P.doors | 0;
  const iw = W - 2 * t;
  const divide = nd >= 2;
  if (divide) b.boxY('utama', 'Sekat tengah', t, inn.y1 - doorsBottom, D - 1, -iw / 2 + iw * 0.4, doorsBottom, 0);
  const lx0 = -iw / 2, lx1 = divide ? -iw / 2 + iw * 0.4 : iw / 2;
  const ns = P.shelves | 0;
  if (divide) for (let i = 1; i <= ns; i++) b.boxY('utama', 'Rak', lx1 - lx0 - t * 0.5, t, D - 3, (lx0 + lx1) / 2 - t / 4, doorsBottom + (inn.y1 - doorsBottom) * (i / (ns + 1)), -0.5);
  if (P.rod) {
    const rx0 = divide ? lx1 + t / 2 : -iw / 2, rx1 = iw / 2;
    const ry = inn.y1 - 7;
    b.boxY('utama', 'Rak atas', rx1 - rx0, t, D - 3, (rx0 + rx1) / 2, ry + 2.5, -0.5);
    b.rod('aksen', 'Gantungan baju', [rx0, ry, 0], [rx1, ry, 0], 1.2, 1.2, 14);
    if (P.clothes) {
      const r = rng(P.seed || 1); const n = Math.floor((rx1 - rx0) / 6);
      for (let i = 0; i < n; i++) {
        const x = rx0 + 4 + i * ((rx1 - rx0 - 8) / Math.max(1, n - 1)), len = 60 + r() * 45;
        b.box('kain', 'Baju', 1.2 + r() * 1.5, len, D * 0.7, x, ry - len / 2 - 3, 0, { r: 0.5 });
      }
    }
  }
  // doors
  const dw = W / nd, dh = inn.y1 + t - doorsBottom;
  const open = P.doorOpen / 100;
  const z0 = D / 2;
  if (P.sliding) {
    for (let i = 0; i < nd; i++) {
      const slide = i % 2 ? -open * dw * 0.9 : 0;
      front(b, P.frontStyle, dw + 1, dh, 1.8, -W / 2 + dw * (i + 0.5) + slide, doorsBottom + dh / 2, z0 + (i % 2) * 2.2);
      handle(b, { ...P, handle: P.handle === 'tanpa' ? 'tanpa' : 'cekung' }, -W / 2 + dw * (i + 0.5) + slide + (i % 2 ? -1 : 1) * (dw / 2 - 3), doorsBottom + dh / 2, z0 + (i % 2) * 2.2 + 1.8, true, 40);
    }
  } else {
    for (let i = 0; i < nd; i++) {
      const leftHinge = nd === 1 ? true : i < nd / 2;
      const dir = leftHinge ? 1 : -1;
      const hx = leftHinge ? -W / 2 + dw * i : -W / 2 + dw * (i + 1);
      door(b, P, hx, doorsBottom + dh / 2, dw, dh, z0, dir, open * (nd === 1 || i === 0 || i === nd - 1 ? 1 : 0.85));
    }
  }
  for (let r = 0; r < nDr; r++) {
    const cols = W > 90 ? 2 : 1, cw = W / cols;
    for (let c = 0; c < cols; c++) drawer(b, P, cw, drH, D - 6, -W / 2 + cw * (c + 0.5), inn.y0 + drH * (r + 0.5) - 0.5, z0, 0);
  }
}
const wardrobeSchema = [
  G('Dimensi', [R('w', 'Lebar', 50, 280, 0.5, 120), R('h', 'Tinggi', 120, 260, 0.5, 200), R('d', 'Dalam', 35, 70, 0.5, 58)]),
  G('Pintu', [
    R('doors', 'Jumlah pintu', 1, 5, 1, 2, ''), C('sliding', 'Pintu geser', false),
    R('doorOpen', 'Buka pintu', 0, 100, 1, 35, '%'),
  ]),
  G('Interior', [
    R('drawers', 'Baris laci bawah', 0, 3, 1, 1, ''), R('shelves', 'Jumlah rak', 0, 8, 1, 4, ''),
    C('rod', 'Gantungan baju', true), C('clothes', 'Tampilkan baju', true, (p) => p.rod), R('seed', 'Variasi isi', 1, 99, 1, 7, '', (p) => p.rod && p.clothes),
    C('cornice', 'Mahkota atas', false),
  ]),
  handleGroup({ fronts: ['polos', 'shaker', 'bilah', 'louvre', 'kaca', 'cermin', 'rotan'], handle: 'bar', handleLen: 30 }),
  legGroup(['plinth', 'runcing', 'lurus', 'bulat', 'mid', 'bubut', 'logam'], { legStyle: 'plinth', legT: 5, legInset: 3 }, [R('legH', 'Tinggi kaki/alas', 0, 30, 0.5, 8)]),
];

const BOOK_MATS = ['buku1', 'buku2', 'buku3', 'buku4', 'buku5', 'buku6'];
function fillBooks(b, r, x0, x1, y, depth, zBack, maxH, density) {
  let x = x0 + 0.5;
  while (x < x1 - 2) {
    if (r() > density) { x += 4 + r() * 10; continue; }
    const style = r();
    if (style < 0.12 && x1 - x > 18) { // lying stack
      const n = 2 + Math.floor(r() * 4); let yy = y;
      const bw = 16 + r() * 8;
      for (let i = 0; i < n; i++) { const th = 2 + r() * 2.5; b.boxY(BOOK_MATS[Math.floor(r() * 6)], 'Buku', bw - r() * 3, th, depth * (0.6 + r() * 0.3), x + bw / 2, yy, zBack + depth * 0.4, { r: 0.2 }); yy += th; }
      x += bw + 1;
    } else if (style < 0.18) { // vase / object
      const vr = 3 + r() * 3, vh = Math.min(maxH * 0.8, 8 + r() * 14);
      b.lathe('dekor', 'Vas', [[0, 0], [vr * 0.7, 0], [vr, vh * 0.3], [vr * 0.85, vh * 0.7], [vr * 0.45, vh * 0.9], [vr * 0.55, vh], [0, vh]], x + vr + 1, y, zBack + depth * 0.5, 24);
      x += vr * 2 + 3;
    } else {
      const n = 3 + Math.floor(r() * 9);
      const lean = r() < 0.15;
      for (let i = 0; i < n && x < x1 - 2; i++) {
        const th = 1.8 + r() * 3.2, h = Math.min(maxH - 1, maxH * (0.62 + r() * 0.33));
        const dep = depth * (0.62 + r() * 0.3);
        const m = b.boxY(BOOK_MATS[Math.floor(r() * 6)], 'Buku', th, h, dep, x + th / 2, y, zBack + dep / 2 + 0.5, { r: 0.25 });
        if (lean && i === n - 1 && m) { m.rotation.z = -0.28; m.position.x += h * 0.12; x += h * 0.25; }
        x += th + 0.05;
      }
      x += 1 + r() * 4;
    }
  }
}
function buildBookshelf(b, P) {
  const W = P.w, H = P.h, D = P.d, t = P.t;
  const r = rng(P.seed);
  const cols = P.cols | 0, rows = P.rows | 0;
  if (P.style === 'tangga') {
    // leaning ladder shelf
    const lean = rad(10), topD = D * 0.45;
    for (const sx of [-1, 1]) b.rod('sekunder', 'Tiang tangga', [sx * (W / 2 - 1.5), 0, D / 2], [sx * (W / 2 - 1.5), H, D / 2 - H * Math.tan(lean)], 2, 1.6, 4);
    for (let i = 0; i < rows; i++) {
      const y = 10 + (H - 18) * (i / Math.max(1, rows - 1));
      const fz = D / 2 - y * Math.tan(lean);
      const sd = lerp(D, topD, i / Math.max(1, rows - 1));
      b.boxY('utama', 'Rak', W - 6, t, sd, 0, y, fz - sd / 2);
      if (P.books && i < rows - 1) fillBooks(b, r, -W / 2 + 4, W / 2 - 4, y + t, sd * 0.95, fz - sd, (H - 18) / Math.max(1, rows - 1) - 3, P.density);
    }
    return;
  }
  const y0 = baseFor(b, P, W, D);
  const bodyH = H - y0;
  const frame = P.style === 'rangka';
  const shelfSlot = 'utama';
  if (frame) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxY('aksen', 'Tiang rangka', 2, bodyH, 2, sx * (W / 2 - 1), y0, sz * (D / 2 - 1));
    for (let c = 1; c < cols; c++) for (const sz of [-1, 1]) b.boxY('aksen', 'Tiang rangka', 2, bodyH, 2, -W / 2 + W * (c / cols), y0, sz * (D / 2 - 1));
  } else {
    b.boxY('utama', 'Sisi', t, bodyH, D, -W / 2 + t / 2, y0, 0);
    b.boxY('utama', 'Sisi', t, bodyH, D, W / 2 - t / 2, y0, 0);
    if (P.back) b.boxY('sekunder', 'Panel belakang', W - 2 * t, bodyH - t, 0.8, 0, y0, -D / 2 + 0.4);
  }
  const iw = W - (frame ? 0 : 2 * t), cw = iw / cols;
  // dividers
  if (!frame) for (let c = 1; c < cols; c++) b.boxY('utama', 'Sekat', t, bodyH - 2 * t, D - 1, -iw / 2 + cw * c, y0 + t, 0.5);
  const rh = (bodyH - t) / rows;
  for (let i = 0; i <= rows; i++) {
    const y = y0 + rh * i;
    const sy = i === rows ? y0 + bodyH - t : y;
    b.boxY(shelfSlot, i === 0 ? 'Dasar' : i === rows ? 'Atas' : 'Rak', frame ? W + 0.4 : iw, t, D - (i === rows || frame ? 0 : 1), 0, sy, i === rows || frame ? 0 : 0.5);
    if (i < rows && P.books) {
      for (let c = 0; c < cols; c++) {
        if (P.doorsLow && i === 0) continue;
        const xa = -iw / 2 + cw * c + (c ? t / 2 : 0), xb = -iw / 2 + cw * (c + 1) - (c < cols - 1 ? t / 2 : 0);
        fillBooks(b, r, xa, xb, sy + t, D - 3, -D / 2 + 1, rh - t - 1.5, P.density);
      }
    }
  }
  if (P.doorsLow) {
    for (let c = 0; c < cols; c++) door(b, { ...P, handle: 'knob', frontStyle: P.frontStyle }, -iw / 2 + cw * c, y0 + rh / 2 + t / 2, cw, rh, D / 2, 1, 0);
  }
}
const shelfSchema = [
  G('Dimensi', [R('w', 'Lebar', 40, 240, 0.5, 90), R('h', 'Tinggi', 60, 240, 0.5, 180), R('d', 'Dalam', 20, 50, 0.5, 32), R('t', 'Tebal papan', 1.2, 5, 0.1, 2)]),
  G('Struktur', [
    S('style', 'Model', { kotak: 'Kotak (kabinet)', rangka: 'Rangka logam', tangga: 'Tangga bersandar' }, 'kotak'),
    R('cols', 'Kolom', 1, 6, 1, 2, '', (p) => p.style !== 'tangga'), R('rows', 'Baris rak', 2, 9, 1, 5, ''),
    C('back', 'Panel belakang', true, (p) => p.style === 'kotak'),
    C('doorsLow', 'Pintu di baris bawah', false, (p) => p.style !== 'tangga'),
    S('frontStyle', 'Model pintu', pick(FRONT_LABELS, ['polos', 'shaker', 'bilah', 'kaca', 'rotan']), 'shaker', (p) => p.doorsLow),
  ]),
  G('Isi rak', [C('books', 'Isi buku & dekor', true), R('density', 'Kepadatan', 0.2, 1, 0.01, 0.75, '×', (p) => p.books), R('seed', 'Variasi isi', 1, 99, 1, 12, '', (p) => p.books)]),
  legGroup(['plinth', 'runcing', 'lurus', 'bulat', 'mid', 'logam'], { legStyle: 'plinth', legT: 4, legInset: 2 }, [R('legH', 'Tinggi kaki/alas', 0, 30, 0.5, 6)]),
];

/** Generic cabinet with a grid of drawers / doors / open niches. layout: array of rows (bottom → top) of cells. */
function cabinetBody(b, P, W, H, D, y0, rows, o = {}) {
  const t = 1.8;
  const inn = carcass(b, W, H, D, y0, t, { over: P.topOver ?? 0, topT: P.topT ?? t, topR: 0.4, topSlot: o.topSlot });
  const ih = inn.y1 - inn.y0;
  const tot = rows.reduce((s, r) => s + (r.h || 1), 0);
  let y = inn.y0;
  const z0 = D / 2;
  rows.forEach((row, ri) => {
    const rh = ih * ((row.h || 1) / tot);
    const cells = row.cells, cw = (W - 2 * t) / cells.length;
    if (ri > 0) b.boxY('utama', 'Sekat', W - 2 * t, t * 0.8, D - 1, 0, y - t * 0.4, 0);
    cells.forEach((cell, ci) => {
      const cx = -W / 2 + t + cw * (ci + 0.5);
      if (ci > 0) b.boxY('utama', 'Sekat tegak', t * 0.8, rh, D - 1, cx - cw / 2, y, 0);
      const fw = cw + (ci === 0 ? t : 0) + (ci === cells.length - 1 ? t : 0);
      const fx = cx + (ci === 0 ? -t / 2 : 0) + (ci === cells.length - 1 ? t / 2 : 0);
      const fh = rh + (ri === 0 ? t : 0) + (ri === rows.length - 1 ? t * 0.5 : 0);
      const fy = y + rh / 2 + (ri === 0 ? -t / 2 : 0) + (ri === rows.length - 1 ? t * 0.25 : 0);
      if (cell === 'laci') drawer(b, P, fw, fh, D - 4, fx, fy, z0, (P.drawerOpen ?? 0) / 100 * (ri === rows.length - 1 ? 1 : 0));
      else if (cell === 'pintu' || cell === 'pintuK') door(b, P, cell === 'pintuK' ? fx + fw / 2 : fx - fw / 2, fy, fw, fh, z0, cell === 'pintuK' ? -1 : 1, (P.doorOpen ?? 0) / 100);
      else if (cell === 'terbuka' && o.fill) o.fill(cx - cw / 2, cx + cw / 2, y, rh);
    });
    y += rh;
  });
  return inn;
}
function buildDresser(b, P) {
  const y0 = baseFor(b, P, P.w - 2, P.d - 2);
  const rows = [];
  const n = P.rows | 0;
  for (let i = 0; i < n; i++) {
    const cells = Array(Math.round(i === n - 1 && P.topSplit ? Math.max(2, P.cols) : P.cols)).fill('laci');
    rows.push({ cells, h: P.graded ? 1 + (n - 1 - i) * 0.18 : 1 });
  }
  cabinetBody(b, P, P.w, P.h - y0, P.d, y0, rows);
}
const dresserSchema = [
  G('Dimensi', [R('w', 'Lebar', 40, 220, 0.5, 100), R('h', 'Tinggi', 40, 160, 0.5, 86), R('d', 'Dalam', 30, 65, 0.5, 48), R('topOver', 'Tonjolan atas', 0, 5, 0.1, 1), R('topT', 'Tebal atas', 1.5, 6, 0.1, 2.5)]),
  G('Laci', [R('cols', 'Kolom laci', 1, 4, 1, 2, ''), R('rows', 'Baris laci', 1, 7, 1, 3, ''), C('graded', 'Laci bawah lebih tinggi', true), C('topSplit', 'Baris atas laci kecil', false), R('drawerOpen', 'Buka laci atas', 0, 100, 1, 0, '%')]),
  handleGroup({ fronts: ['polos', 'shaker', 'bilah', 'rotan'], handle: 'knob' }),
  legGroup(['runcing', 'mid', 'lurus', 'bulat', 'bubut', 'logam', 'hairpin', 'plinth'], { legStyle: 'mid', legT: 4, legSplay: 5, legInset: 3 }, [R('legH', 'Tinggi kaki/alas', 0, 40, 0.5, 16)]),
];

function buildNightstand(b, P) {
  const y0 = baseFor(b, P, P.w - 2, P.d - 2);
  const rows = [];
  if (P.niche === 'bawah') rows.push({ cells: ['terbuka'], h: 1.1 });
  for (let i = 0; i < (P.drawers | 0); i++) rows.push({ cells: ['laci'], h: 1 });
  if (P.niche === 'atas') rows.push({ cells: ['terbuka'], h: 1.1 });
  if (P.niche === 'pintu') rows.push({ cells: ['pintu'], h: 2 });
  if (!rows.length) rows.push({ cells: ['terbuka'] });
  cabinetBody(b, P, P.w, P.h - y0, P.d, y0, rows, {
    fill: (x0, x1, y, h) => { if (P.books) fillBooks(b, rng(P.w | 0), x0 + 1, x1 - 1, y, P.d - 6, -P.d / 2 + 2, h - 2, 0.6); },
  });
  if (P.lamp) {
    const lp = defaults('lampuMeja');
    b.group('Lampu meja', -P.w * 0.18, P.h, -2, () => buildTableLamp(b, { ...lp, h: 45, shadeD: 26, shadeH: 18 }));
  }
}
const nightSchema = [
  G('Dimensi', [R('w', 'Lebar', 30, 80, 0.5, 48), R('h', 'Tinggi', 30, 80, 0.5, 56), R('d', 'Dalam', 28, 55, 0.5, 40), R('topOver', 'Tonjolan atas', 0, 5, 0.1, 0.5), R('topT', 'Tebal atas', 1.5, 6, 0.1, 2)]),
  G('Isi', [
    R('drawers', 'Jumlah laci', 0, 4, 1, 1, ''),
    S('niche', 'Ruang tambahan', { bawah: 'Rak terbuka bawah', atas: 'Rak terbuka atas', pintu: 'Pintu', tanpa: 'Tanpa' }, 'bawah'),
    C('books', 'Buku di rak terbuka', true), C('lamp', 'Lampu meja di atas', false), R('drawerOpen', 'Buka laci atas', 0, 100, 1, 0, '%'),
  ]),
  handleGroup({ fronts: ['polos', 'shaker', 'bilah', 'rotan'], handle: 'tab', handleLen: 10 }),
  legGroup(['mid', 'runcing', 'lurus', 'bulat', 'bubut', 'logam', 'hairpin', 'plinth'], { legStyle: 'mid', legT: 3.5, legSplay: 5, legInset: 2.5 }, [R('legH', 'Tinggi kaki/alas', 0, 30, 0.5, 14)]),
];

function buildTVStand(b, P) {
  const y0 = baseFor(b, P, P.w - 2, P.d - 2);
  const n = P.sections | 0;
  let cells;
  if (P.mix === 'pintu') cells = Array(n).fill(0).map((_, i) => (i < n / 2 ? 'pintu' : 'pintuK'));
  else if (P.mix === 'laci') cells = Array(n).fill('laci');
  else if (P.mix === 'terbuka') cells = Array(n).fill('terbuka');
  else cells = Array(n).fill(0).map((_, i) => (i === 0 ? 'pintu' : i === n - 1 ? 'pintuK' : (i % 2 ? 'terbuka' : 'laci')));
  cabinetBody(b, P, P.w, P.h - y0, P.d, y0, [{ cells }], {
    fill: (x0, x1, y, h) => { if (P.books) fillBooks(b, rng(P.sections * 7 + 3), x0 + 1, x1 - 1, y, P.d - 6, -P.d / 2 + 2, h - 2, 0.55); },
  });
  if (P.tv) {
    const tp = defaults('tv');
    b.group('TV', 0, P.h, -P.d * 0.1, () => buildTV(b, { ...tp, inch: P.tvInch, stand: 'kaki' }));
  }
}
const tvStandSchema = [
  G('Dimensi', [R('w', 'Lebar', 80, 300, 0.5, 180), R('h', 'Tinggi', 30, 90, 0.5, 48), R('d', 'Dalam', 30, 60, 0.5, 42), R('topOver', 'Tonjolan atas', 0, 5, 0.1, 0), R('topT', 'Tebal atas', 1.5, 6, 0.1, 2.2)]),
  G('Kompartemen', [
    R('sections', 'Jumlah bagian', 2, 6, 1, 4, ''),
    S('mix', 'Susunan', { campur: 'Campuran', pintu: 'Semua pintu', laci: 'Semua laci', terbuka: 'Semua terbuka' }, 'campur'),
    R('doorOpen', 'Buka pintu', 0, 100, 1, 0, '%'), C('books', 'Isi rak terbuka', true),
    C('tv', 'Tampilkan TV', true), R('tvInch', 'Ukuran TV', 32, 85, 1, 55, 'inci', (p) => p.tv),
  ]),
  handleGroup({ fronts: ['polos', 'shaker', 'bilah', 'louvre', 'kaca', 'rotan'], frontStyle: 'bilah', handle: 'tanpa' }),
  legGroup(['mid', 'runcing', 'lurus', 'bulat', 'logam', 'hairpin', 'plinth'], { legStyle: 'runcing', legT: 4, legSplay: 3, legInset: 4 }, [R('legH', 'Tinggi kaki/alas', 0, 30, 0.5, 12)]),
];

function buildKitchen(b, P) {
  const n = P.modules | 0, mw = P.modW, W = n * mw, D = P.d;
  const ph = P.plinthH, bodyH = P.baseH - P.counterT - ph;
  b.boxY('gelap', 'Plint', W - 2, ph, D - 6, 0, 0, -3);
  const y0 = ph, z0 = D / 2;
  // base carcasses
  b.boxY('utama', 'Sisi', 1.8, bodyH, D, -W / 2 + 0.9, y0, 0);
  b.boxY('utama', 'Sisi', 1.8, bodyH, D, W / 2 - 0.9, y0, 0);
  b.boxY('utama', 'Dasar', W - 3.6, 1.8, D - 1, 0, y0, 0);
  b.boxY('utama', 'Belakang', W - 3.6, bodyH, 0.8, 0, y0, -D / 2 + 0.4);
  const sinkI = clamp((P.sinkPos | 0) - 1, 0, n - 1), stoveI = clamp((P.stovePos | 0) - 1, 0, n - 1);
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + mw * (i + 0.5);
    if (i > 0) b.boxY('utama', 'Sekat', 1.6, bodyH - 1.8, D - 1, x - mw / 2, y0 + 1.8, 0);
    const isDrawers = P.drawerMod && i === (P.stove ? stoveI : n - 1) && !(P.sink && i === sinkI);
    if (isDrawers) { const k = 3; for (let j = 0; j < k; j++) drawer(b, P, mw, bodyH / k, D - 6, x, y0 + bodyH * (j + 0.5) / k, z0, 0); }
    else if (P.sink && i === sinkI && mw >= 50) { door(b, P, x - mw / 2, y0 + bodyH / 2, mw / 2, bodyH, z0, 1, P.doorOpen / 100); door(b, P, x + mw / 2, y0 + bodyH / 2, mw / 2, bodyH, z0, -1, P.doorOpen / 100); }
    else door(b, P, x - mw / 2, y0 + bodyH / 2, mw, bodyH, z0, 1, P.doorOpen / 100);
  }
  // counter
  const cy = P.baseH - P.counterT;
  const ov = P.counterOver;
  if (P.sink) {
    const sx = -W / 2 + mw * (sinkI + 0.5), sw = Math.min(mw - 12, 50), sd = D - 20;
    // counter split around the sink cut-out
    const leftW = sx - sw / 2 - (-W / 2 - ov), rightW = W / 2 + ov - (sx + sw / 2);
    if (leftW > 0.5) b.boxY('sekunder', 'Meja dapur', leftW, P.counterT, D + ov, -W / 2 - ov + leftW / 2, cy, ov / 2);
    if (rightW > 0.5) b.boxY('sekunder', 'Meja dapur', rightW, P.counterT, D + ov, sx + sw / 2 + rightW / 2, cy, ov / 2);
    const fz = D / 2 + ov;
    const backD = (D - sd) / 2;
    b.boxY('sekunder', 'Meja dapur', sw, P.counterT, Math.max(0.5, fz - (-D / 2 + backD + sd)), sx, cy, (fz + (-D / 2 + backD + sd)) / 2);
    b.boxY('sekunder', 'Meja dapur', sw, P.counterT, backD, sx, cy, -D / 2 + backD / 2);
    // basin
    const bz0 = -D / 2 + backD + sd / 2, depth = 18;
    b.boxY('aksen', 'Bak cuci', sw, 0.6, sd, sx, P.baseH - depth, bz0);
    b.boxY('aksen', 'Dinding bak', sw, depth, 0.6, sx, P.baseH - depth, bz0 - sd / 2 + 0.3);
    b.boxY('aksen', 'Dinding bak', sw, depth, 0.6, sx, P.baseH - depth, bz0 + sd / 2 - 0.3);
    b.boxY('aksen', 'Dinding bak', 0.6, depth, sd, sx - sw / 2 + 0.3, P.baseH - depth, bz0);
    b.boxY('aksen', 'Dinding bak', 0.6, depth, sd, sx + sw / 2 - 0.3, P.baseH - depth, bz0);
    b.cyl('gelap', 'Saluran', 2, 2, 0.4, sx, P.baseH - depth + 0.4, bz0, 16);
    // faucet
    const fzz = -D / 2 + backD / 2;
    b.cyl('aksen', 'Kran', 2, 2.4, 3, sx, P.baseH, fzz, 16);
    b.tube('aksen', 'Kran', [[sx, P.baseH + 2, fzz], [sx, P.baseH + 34, fzz], [sx, P.baseH + 34, fzz + 20], [sx, P.baseH + 26, fzz + 20]], 1.1, 6);
    b.rod('aksen', 'Tuas kran', [sx + 2, P.baseH + 8, fzz], [sx + 9, P.baseH + 11, fzz], 0.6, 0.5, 8);
  } else b.boxY('sekunder', 'Meja dapur', W + ov * 2, P.counterT, D + ov, 0, cy, ov / 2);
  if (P.stove) {
    const sx = -W / 2 + mw * (stoveI + 0.5);
    b.box('layar', 'Kompor tanam', Math.min(mw - 6, 58), 0.6, D - 12, sx, P.baseH + 0.3, 0, { r: 0.25 });
    for (const [dx, dz, r] of [[-12, -10, 9], [12, -10, 7], [-12, 10, 7], [12, 10, 9]]) b.torus('aksen', 'Tungku', r * 0.55, 0.25, sx + dx * mw / 60, P.baseH + 0.7, dz, [Math.PI / 2, 0, 0]);
  }
  if (P.backsplash) b.boxY('sekunder', 'Backsplash', W + ov * 2, P.upperGap, 1, 0, P.baseH, -D / 2 - 0.5);
  if (P.upper) {
    const uy = P.baseH + P.upperGap, ud = 34, uh = P.upperH;
    const uz = -D / 2 + ud / 2;
    b.boxY('utama', 'Kabinet atas', W, 1.8, ud, 0, uy, uz);
    b.boxY('utama', 'Kabinet atas', W, 1.8, ud, 0, uy + uh - 1.8, uz);
    b.boxY('utama', 'Kabinet atas', W - 3.6, uh, 0.8, 0, uy, -D / 2 + 0.4);
    for (let i = 0; i <= n; i++) {
      const x = clamp(-W / 2 + mw * i, -W / 2 + 0.9, W / 2 - 0.9);
      b.boxY('utama', 'Sisi atas', 1.8, uh - 3.6, ud, x, uy + 1.8, uz);
    }
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + mw * (i + 0.5);
      if (P.hood && P.stove && i === stoveI) {
        b.lathe('aksen', 'Penghisap asap', [[0, 0], [mw * 0.46, 0], [mw * 0.46, 4], [12, 26], [12, uh], [0, uh]], x, uy, uz - 2, 4, { phiStart: Math.PI / 4 });
        continue;
      }
      const st = P.upperGlass ? 'kaca' : P.frontStyle;
      door(b, { ...P, frontStyle: st }, x - mw / 2, uy + uh / 2, mw, uh, uz + ud / 2, 1, P.doorOpen / 100);
    }
  }
}
const kitchenSchema = [
  G('Dimensi', [
    R('modules', 'Jumlah modul', 2, 8, 1, 4, ''), R('modW', 'Lebar modul', 40, 90, 0.5, 60), R('d', 'Dalam', 45, 70, 0.5, 60),
    R('baseH', 'Tinggi meja', 75, 100, 0.5, 88), R('plinthH', 'Tinggi plint', 5, 18, 0.5, 10),
    R('counterT', 'Tebal meja (top)', 1.5, 8, 0.1, 3), R('counterOver', 'Tonjolan top', 0, 5, 0.1, 2),
  ]),
  G('Perlengkapan', [
    C('sink', 'Bak cuci + kran', true), R('sinkPos', 'Posisi bak (modul)', 1, 8, 1, 2, '', (p) => p.sink),
    C('stove', 'Kompor tanam', true), R('stovePos', 'Posisi kompor (modul)', 1, 8, 1, 4, '', (p) => p.stove),
    C('drawerMod', 'Modul laci di bawah kompor', true), C('backsplash', 'Backsplash', true),
  ]),
  G('Kabinet atas', [
    C('upper', 'Kabinet gantung', true), R('upperH', 'Tinggi kabinet atas', 35, 100, 0.5, 70, 'cm', (p) => p.upper),
    R('upperGap', 'Jarak dari meja', 40, 80, 0.5, 60, 'cm', (p) => p.upper || p.backsplash),
    C('upperGlass', 'Pintu atas kaca', false, (p) => p.upper), C('hood', 'Penghisap asap', true, (p) => p.upper && p.stove),
    R('doorOpen', 'Buka pintu', 0, 100, 1, 0, '%'),
  ]),
  handleGroup({ fronts: ['polos', 'shaker', 'bilah', 'louvre', 'rotan'], frontStyle: 'shaker', handle: 'bar', handleLen: 14 }),
];

// ---- bedroom -------------------------------------------------------------------
function buildBed(b, P) {
  const MW = Number(P.size), ML = P.mattL, MT = P.mattT;
  const fw = P.frameW;
  const W = MW + fw * 2, L = ML + fw * 2 + P.headT;
  const zc = -L / 2 + P.headT;
  const legH = P.legH, railTop = P.frameH;
  const frameSlot = P.frameMat === 'kain' ? 'kain' : 'utama';
  legs(b, P, W, L, legH);
  // rails
  const rh = railTop - legH;
  b.boxY(frameSlot, 'Rangka samping', fw, rh, L - P.headT, -W / 2 + fw / 2, legH, P.headT / 2, { r: frameSlot === 'kain' ? 2 : 0.4 });
  b.boxY(frameSlot, 'Rangka samping', fw, rh, L - P.headT, W / 2 - fw / 2, legH, P.headT / 2, { r: frameSlot === 'kain' ? 2 : 0.4 });
  b.boxY(frameSlot, 'Rangka kaki', W - fw * 2, rh, fw, 0, legH, L / 2 - fw / 2, { r: frameSlot === 'kain' ? 2 : 0.4 });
  b.boxY('utama', 'Dasar kasur', MW, 2, ML, 0, railTop - 6, zc + ML / 2 + fw);
  // mattress
  const my = railTop - 4;
  b.boxY('kasur', 'Kasur', MW - 1, MT, ML - 1, 0, my, zc + fw + ML / 2, { r: 4 });
  // headboard
  const hs = P.headStyle;
  const hbH = P.headH, hz = -L / 2 + P.headT / 2;
  if (hs !== 'tanpa') {
    if (hs === 'panel') b.boxY('utama', 'Headboard', W, hbH, P.headT, 0, 0, hz, { r: 0.6 });
    else if (hs === 'lengkung') {
      const sh = new THREE.Shape(); const hw = W / 2, arc = Math.min(W * 0.18, hbH * 0.3);
      sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, hbH - arc); sh.quadraticCurveTo(hw, hbH, 0, hbH); sh.quadraticCurveTo(-hw, hbH, -hw, hbH - arc); sh.lineTo(-hw, 0);
      b.panel(frameSlot === 'kain' ? 'kain' : 'utama', 'Headboard', sh, P.headT, 0, 0, hz, { round: true });
    } else if (hs === 'bilah') {
      for (const sx of [-1, 1]) b.boxY('utama', 'Tiang headboard', 5, hbH, P.headT, sx * (W / 2 - 2.5), 0, hz, { r: 0.6 });
      b.boxY('utama', 'Palang headboard', W - 10, 7, P.headT * 0.8, 0, hbH - 7, hz);
      b.boxY('utama', 'Palang headboard', W - 10, 6, P.headT * 0.8, 0, railTop + 4, hz);
      const n = Math.round((W - 10) / 9);
      for (let i = 0; i < n; i++) b.boxY('utama', 'Bilah headboard', 4.5, hbH - railTop - 17, 2, -W / 2 + 5 + (W - 10) * ((i + 0.5) / n), railTop + 10, hz, { r: 0.4 });
    } else {
      // upholstered: jok / kancing / kanal
      b.boxY(frameSlot, 'Rangka headboard', W, hbH, P.headT * 0.6, 0, 0, hz - P.headT * 0.2, { r: 1 });
      const py = railTop + 2, ph = hbH - py - 3;
      if (hs === 'kanal') {
        const n = Math.max(4, Math.round(W / 16)), cw = (W - 4) / n;
        for (let i = 0; i < n; i++) b.boxY('kain', 'Kanal headboard', cw - 0.4, ph, P.headT * 0.5, -W / 2 + 2 + cw * (i + 0.5), py, hz + P.headT * 0.2, { r: cw * 0.45 });
      } else {
        b.boxY('kain', 'Jok headboard', W - 4, ph, P.headT * 0.5, 0, py, hz + P.headT * 0.2, { r: 3 });
        if (hs === 'kancing') {
          const cols = Math.max(3, Math.round(W / 22)), rows = Math.max(2, Math.round(ph / 22));
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols - (r % 2); c++) {
            const x = -W / 2 + 2 + (W - 4) * ((c + 0.5 + (r % 2) * 0.5) / cols);
            b.sphere('kain', 'Kancing', 0.9, x, py + ph * ((r + 0.5) / rows), hz + P.headT * 0.45, 8);
          }
        }
      }
    }
  }
  if (P.foot) b.boxY(frameSlot, 'Footboard', W, P.footH, 4, 0, 0, L / 2 - 2, { r: frameSlot === 'kain' ? 2 : 0.6 });
  // bedding
  const top = my + MT;
  const np = P.pillows | 0;
  for (let i = 0; i < np; i++) {
    const pw = Math.min(65, (MW - 8) / Math.max(1, np)), x = -MW / 2 + 4 + (MW - 8) * ((i + 0.5) / np);
    b.group('Bantal', x, top + 6, zc + fw + 22, (g) => { g.rotation.x = -0.25; b.box('kasur', 'Bantal', pw - 3, 12, 44, 0, 0, 0, { r: 5.5 }); });
  }
  if (P.blanket) {
    const cover = P.cover / 100, bl = ML * cover;
    const bz1 = zc + fw + ML + 2, bz0 = bz1 - bl;
    b.boxY('aksen', 'Selimut', MW + 4, 3, bl, 0, top - 0.5, (bz0 + bz1) / 2, { r: 1.4 });
    b.boxY('aksen', 'Selimut (jatuh)', MW + 4, MT * 0.75, 1.6, 0, top - MT * 0.75 + 2, bz1 + 0.6, { r: 0.7 });
    for (const sx of [-1, 1]) b.boxY('aksen', 'Selimut (sisi)', 1.6, MT * 0.75, bl, sx * (MW / 2 + 2.2), top - MT * 0.75 + 2, (bz0 + bz1) / 2, { r: 0.7 });
    b.boxY('kasur', 'Lipatan', MW + 4.4, 3.4, 12, 0, top - 0.3, bz0 + 6, { r: 1.6 });
  }
  if (P.nightstands) {
    const np2 = defaults('nakas');
    for (const sx of [-1, 1]) b.group('Nakas', sx * (W / 2 + 30), 0, -L / 2 + 22, () => buildNightstand(b, { ...np2, lamp: true }));
  }
}
const bedSchema = [
  G('Ukuran', [
    S('size', 'Ukuran kasur', [['90', 'Single 90'], ['120', 'Super single 120'], ['140', 'Double 140'], ['160', 'Queen 160'], ['180', 'King 180'], ['200', 'Super king 200']], '160'),
    R('mattL', 'Panjang kasur', 180, 220, 1, 200), R('mattT', 'Tebal kasur', 10, 40, 0.5, 24),
    R('frameH', 'Tinggi rangka', 15, 55, 0.5, 32), R('frameW', 'Tebal rangka', 2, 15, 0.5, 5),
    S('frameMat', 'Material rangka', { utama: 'Kayu (utama)', kain: 'Berjok (kain)' }, 'utama'),
  ]),
  G('Headboard', [
    S('headStyle', 'Model', { panel: 'Panel', lengkung: 'Lengkung', bilah: 'Bilah', jok: 'Berjok', kancing: 'Kancing (tufted)', kanal: 'Kanal vertikal', tanpa: 'Tanpa' }, 'kanal'),
    R('headH', 'Tinggi', 60, 160, 0.5, 110, 'cm', (p) => p.headStyle !== 'tanpa'), R('headT', 'Tebal', 3, 15, 0.5, 8),
    C('foot', 'Footboard', false), R('footH', 'Tinggi footboard', 30, 80, 0.5, 45, 'cm', (p) => p.foot),
  ]),
  G('Tempat tidur', [
    R('pillows', 'Bantal', 0, 4, 1, 2, ''), C('blanket', 'Selimut (warna aksen)', true), R('cover', 'Panjang selimut', 30, 90, 1, 62, '%', (p) => p.blanket),
    C('nightstands', 'Nakas kiri-kanan', false),
  ]),
  legGroup(['runcing', 'mid', 'bulat', 'lurus', 'bubut', 'plinth'], { legStyle: 'runcing', legT: 5, legInset: 2 }, [R('legH', 'Tinggi kaki', 2, 35, 0.5, 14)]),
];

// ---- lighting & decor ---------------------------------------------------------
function shadeProfile(type, D, H) {
  const r = D / 2;
  switch (type) {
    case 'kerucut': return [[r, 0], [r * 0.45, H]];
    case 'kubah': { const pts = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; pts.push([r * Math.cos(a) + 1.2 * (1 - i / 10), H * Math.sin(a)]); } pts[pts.length - 1][0] = 2; return pts; }
    case 'lonceng': return [[r, 0], [r * 0.92, H * 0.12], [r * 0.6, H * 0.45], [r * 0.45, H * 0.8], [r * 0.25, H]];
    case 'plisket': return [[r, 0], [r * 0.6, H]];
    default: return [[r, 0], [r, H]];
  }
}
function shade(b, type, D, H, x, y, z, slot = 'kain') {
  if (type === 'bola') {
    b.sphere('lampu', 'Kap bola', D / 2, x, y + D / 2, z, 32);
    return y + D;
  }
  const prof = shadeProfile(type, D, H), th = 0.35;
  if (type === 'plisket') {
    const n = 28;
    const pts = [];
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2, k = i % 2 ? 0.94 : 1;
      pts.push(new THREE.Vector2(Math.cos(a) * k, Math.sin(a) * k));
    }
    const sh = new THREE.Shape(pts.map((p) => p.multiplyScalar(D / 2)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: false, steps: 1 });
    // taper toward the top
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) { const s = 1 - 0.4 * (P.getZ(i) / H); P.setX(i, P.getX(i) * s); P.setY(i, P.getY(i) * s); }
    geo.rotateX(-Math.PI / 2); geo.computeVertexNormals();
    b.add(geo, slot, 'Kap plisket', x, y, z);
  } else {
    const outer = prof.map(([r, h]) => [r, h]);
    const inner = prof.slice().reverse().map(([r, h]) => [Math.max(0.1, r - th), h]);
    b.lathe(slot, 'Kap lampu', [...outer, ...inner, outer[0]], x, y, z, 48);
  }
  b.sphere('lampu', 'Bohlam', Math.min(4, D * 0.12), x, y + H * 0.35, z, 16);
  return y + H;
}
function buildFloorLamp(b, P) {
  const H = P.h, br = P.baseR;
  // base
  if (P.base === 'tripod') {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; b.rod('sekunder', 'Kaki tripod', [0, H * 0.42, 0], [Math.cos(a) * br * 1.6, 0, Math.sin(a) * br * 1.6], 1.4, 1, 12); }
    b.cyl('aksen', 'Sambungan', 2.2, 2.2, 5, 0, H * 0.42 - 2, 0, 16);
  } else if (P.base === 'kotak') b.boxY('sekunder', 'Alas', br * 1.8, 3, br * 1.8, 0, 0, 0, { r: 0.8 });
  else b.lathe('sekunder', 'Alas', [[0, 0], [br, 0], [br, 1.5], [br * 0.9, 3], [2, 3.4], [0, 3.4]], 0, 0, 0, 48);
  const pr = P.poleT / 2;
  const top = H - P.shadeH;
  if (P.pole === 'lengkung') {
    const reach = P.reach;
    const curve = new THREE.CatmullRomCurve3([V(0, 3, 0), V(0, H * 0.55, 0), V(reach * 0.25, H * 0.95, 0), V(reach * 0.7, H + 6, 0), V(reach, H - 2, 0)]);
    const geo = new THREE.TubeGeometry(curve, 60, pr, 12, false);
    b.add(geo, 'utama', 'Tiang lengkung', 0, 0, 0);
    shade(b, P.shade, P.shadeD, P.shadeH, reach, H - 2 - P.shadeH - 2, 0);
    b.rod('utama', 'Penggantung', [reach, H - 2, 0], [reach, H - 4 - 2, 0], pr * 0.7, pr * 0.7, 8);
  } else if (P.pole === 'lengan') {
    const jy = H * 0.62;
    b.rod('utama', 'Tiang', [0, 3, 0], [0, jy, 0], pr, pr, 14);
    b.sphere('aksen', 'Sendi', pr * 2, 0, jy, 0, 16);
    const a = rad(P.armAngle), len = P.reach * 0.7;
    const ex = Math.sin(a) * len, ey = jy + Math.cos(a) * len;
    b.rod('utama', 'Lengan', [0, jy, 0], [ex, ey, 0], pr, pr, 14);
    b.sphere('aksen', 'Sendi', pr * 1.8, ex, ey, 0, 16);
    b.group('Kepala lampu', ex, ey, 0, (g) => { g.rotation.z = -rad(P.armAngle + 60); shade(b, P.shade, P.shadeD * 0.6, P.shadeH * 0.7, 0, -P.shadeH * 0.7, 0, 'utama'); });
  } else {
    b.rod('utama', 'Tiang', [0, 3, 0], [0, top + P.shadeH * 0.4, 0], pr, pr, 14);
    if (P.shelfLamp) b.slab('sekunder', 'Meja kecil', 'bulat', 34, 34, 2, 0, H * 0.4, 0, { edge: 'bulat' });
    shade(b, P.shade, P.shadeD, P.shadeH, 0, top, 0);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.rod('aksen', 'Jari kap', [0, top + P.shadeH * 0.4, 0], [Math.cos(a) * P.shadeD * 0.4, top + P.shadeH * 0.95, Math.sin(a) * P.shadeD * 0.4], 0.2, 0.2, 6); }
  }
}
const floorLampSchema = [
  G('Dimensi', [R('h', 'Tinggi', 100, 210, 0.5, 160), R('poleT', 'Diameter tiang', 1, 5, 0.1, 2)]),
  G('Struktur', [
    S('base', 'Alas', { bulat: 'Piringan', kotak: 'Kotak', tripod: 'Tripod' }, 'bulat'), R('baseR', 'Ukuran alas', 10, 30, 0.5, 15),
    S('pole', 'Tiang', { lurus: 'Lurus', lengkung: 'Lengkung (arc)', lengan: 'Lengan bersendi' }, 'lurus'),
    R('reach', 'Jangkauan', 30, 140, 0.5, 90, 'cm', (p) => p.pole !== 'lurus'), R('armAngle', 'Sudut lengan', 10, 80, 1, 40, '°', (p) => p.pole === 'lengan'),
    C('shelfLamp', 'Meja kecil di tiang', false, (p) => p.pole === 'lurus'),
  ]),
  G('Kap lampu', [S('shade', 'Bentuk kap', SHADES, 'drum'), R('shadeD', 'Diameter kap', 15, 70, 0.5, 42), R('shadeH', 'Tinggi kap', 10, 50, 0.5, 30)]),
];
function buildTableLamp(b, P) {
  const H = P.h, bw = P.baseW;
  const sh = Math.min(P.shadeH, H * 0.6);
  const bodyH = H - sh * 0.7;
  const r = bw / 2;
  let prof;
  switch (P.body) {
    case 'silinder': prof = [[0, 0], [r, 0], [r, bodyH * 0.7], [r * 0.3, bodyH * 0.72], [0, bodyH * 0.72]]; break;
    case 'bola': { prof = [[0, 0], [r * 0.4, 0]]; for (let i = 1; i < 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI; prof.push([r * Math.cos(a), r + r * Math.sin(a)]); } prof.push([r * 0.3, r * 2], [0, r * 2]); break; }
    case 'kerucut': prof = [[0, 0], [r, 0], [r * 0.3, bodyH * 0.7], [0, bodyH * 0.7]]; break;
    case 'tiang': prof = null; break;
    case 'labu': prof = [[0, 0], [r * 0.6, 0], [r, bodyH * 0.2], [r * 0.95, bodyH * 0.35], [r * 0.55, bodyH * 0.45], [r * 0.8, bodyH * 0.58], [r * 0.4, bodyH * 0.7], [0, bodyH * 0.72]]; break;
    default: prof = [[0, 0], [r * 0.55, 0], [r * 0.9, bodyH * 0.18], [r, bodyH * 0.35], [r * 0.7, bodyH * 0.6], [r * 0.35, bodyH * 0.68], [r * 0.4, bodyH * 0.72], [0, bodyH * 0.72]];
  }
  let yTop;
  if (prof) { b.lathe('utama', 'Badan lampu', prof, 0, 0, 0, 40); yTop = Math.max(...prof.map((p) => p[1])); }
  else { b.lathe('utama', 'Alas', [[0, 0], [r, 0], [r, 1.5], [0, 1.6]], 0, 0, 0, 40); yTop = 1.5; }
  const sy = H - sh;
  b.rod('aksen', 'Tiang lampu', [0, yTop, 0], [0, sy + sh * 0.4, 0], 0.6, 0.6, 10);
  shade(b, P.shade, P.shadeD, sh, 0, sy, 0);
}
const tableLampSchema = [
  G('Dimensi', [R('h', 'Tinggi', 25, 90, 0.5, 55), R('baseW', 'Lebar badan', 8, 35, 0.5, 18)]),
  G('Badan', [S('body', 'Bentuk badan', { vas: 'Vas', labu: 'Labu', silinder: 'Silinder', bola: 'Bola', kerucut: 'Kerucut', tiang: 'Tiang ramping' }, 'vas')]),
  G('Kap lampu', [S('shade', 'Bentuk kap', SHADES, 'kerucut'), R('shadeD', 'Diameter kap', 12, 55, 0.5, 34), R('shadeH', 'Tinggi kap', 8, 40, 0.5, 22)]),
];

function mirrorShape(type, w, h) {
  if (type === 'lengkung') {
    const s = new THREE.Shape(), hw = w / 2;
    s.moveTo(-hw, -h / 2); s.lineTo(hw, -h / 2); s.lineTo(hw, h / 2 - hw); s.absarc(0, h / 2 - hw, hw, 0, Math.PI, false); s.lineTo(-hw, -h / 2);
    return s;
  }
  return outline(type, w, h, Math.min(w, h) * 0.12);
}
function buildMirror(b, P) {
  const W = P.w, H = P.shape === 'bulat' ? P.w : P.h, f = P.frameW;
  const outer = mirrorShape(P.shape, W, H), innerS = mirrorShape(P.shape, W - f * 2, H - f * 2);
  const ring = outer;
  ring.holes.push(new THREE.Path(innerS.getPoints(64).reverse()));
  const mount = P.mount;
  const tilt = mount === 'bersandar' ? rad(8) : 0;
  const y0 = mount === 'dinding' ? P.elev : 0;
  b.group('Cermin', 0, y0, 0, (g) => {
    g.rotation.x = -tilt;
    if (f > 0.2) b.panel('utama', 'Bingkai', ring, P.frameT, 0, H / 2, 0, { round: P.frameT > 1.5 });
    const mirrorS = mirrorShape(P.shape, W - f * 2 + 0.6, H - f * 2 + 0.6);
    b.panel('cermin', 'Kaca cermin', mirrorS, 0.6, 0, H / 2, -P.frameT * 0.1);
    b.panel('utama', 'Papan belakang', mirrorShape(P.shape, W - f, H - f), 0.6, 0, H / 2, -P.frameT / 2 - 0.3);
  });
  if (mount === 'berdiri') {
    for (const sx of [-1, 1]) b.boxY('sekunder', 'Kaki cermin', 4, 3, 36, sx * (W / 2 - 6), 0, -6, { r: 1 });
    b.rod('sekunder', 'Penyangga', [0, H * 0.55, -P.frameT], [0, 0, -H * 0.32], 1.4, 1.4, 4);
  }
}
const mirrorSchema = [
  G('Dimensi', [R('w', 'Lebar', 20, 160, 0.5, 60), R('h', 'Tinggi', 30, 210, 0.5, 160, 'cm', (p) => p.shape !== 'bulat')]),
  G('Bentuk', [S('shape', 'Bentuk', { persegi: 'Persegi', tumpul: 'Sudut tumpul', lengkung: 'Lengkung (arch)', kapsul: 'Kapsul', oval: 'Oval', bulat: 'Bulat', lunak: 'Squircle' }, 'lengkung'), R('frameW', 'Lebar bingkai', 0, 15, 0.1, 3.5), R('frameT', 'Tebal bingkai', 1, 8, 0.1, 3)]),
  G('Pemasangan', [S('mount', 'Posisi', { bersandar: 'Bersandar ke dinding', berdiri: 'Berdiri (penyangga)', dinding: 'Gantung dinding' }, 'bersandar'), R('elev', 'Tinggi dari lantai', 0, 150, 0.5, 90, 'cm', (p) => p.mount === 'dinding')]),
];

function buildPlant(b, P) {
  const D = P.potD, H = P.potH, r = D / 2;
  let prof;
  switch (P.pot) {
    case 'kerucut': prof = [[0, 0], [r * 0.65, 0], [r, H], [r - 1.2, H], [r * 0.65 - 1.2, 1.5], [0, 1.5]]; break;
    case 'bulat': { prof = [[0, 0], [r * 0.5, 0]]; for (let i = 1; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 0.85; prof.push([r * Math.cos(a), H * 0.5 + H * 0.5 * Math.sin(a)]); } prof.push([r * 0.5, H], [r * 0.5 - 1.2, H - 2]); prof.push([0, H - 2]); break; }
    case 'mangkuk': prof = [[0, 0], [r * 0.4, 0], [r * 0.85, H * 0.45], [r, H], [r - 1.2, H], [r * 0.4, 2], [0, 2]]; break;
    case 'vas': prof = [[0, 0], [r * 0.7, 0], [r, H * 0.3], [r * 0.85, H * 0.75], [r * 0.6, H * 0.92], [r * 0.7, H], [r * 0.6, H], [0, H * 0.8]]; break;
    default: prof = [[0, 0], [r, 0], [r, H], [r - 1.2, H], [r - 1.2, 1.5], [0, 1.5]];
  }
  let y0 = 0;
  if (P.stand) {
    const sh = P.standH;
    radialLegs(b, { legStyle: 'mid', legT: 2.5, legTaper: 0.4, legSplay: 8 }, 3, r * 0.6, sh);
    b.torus('sekunder', 'Cincin penyangga', r * 0.75, 1, 0, sh, 0, [Math.PI / 2, 0, 0]);
    y0 = sh - 1;
  }
  b.lathe('utama', 'Pot', prof, 0, y0, 0, 40);
  const soilY = y0 + (P.pot === 'bulat' || P.pot === 'vas' ? H * 0.82 : H - 3);
  const soilR = P.pot === 'bulat' ? r * 0.55 : P.pot === 'vas' ? r * 0.62 : r - 1.4;
  b.cyl('aksen', 'Tanah', soilR, soilR, 1, 0, soilY - 1, 0, 32);
  const rnd = rng(P.seed);
  const ph = P.plantH;
  const plant = P.plant;
  if (plant === 'semak') {
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, d = rnd() * r * 0.6, s = r * (0.55 + rnd() * 0.4); b.sphere('kain', 'Daun', s, Math.cos(a) * d, soilY + ph * (0.3 + rnd() * 0.5), Math.sin(a) * d, 14, { scale: [1, 0.85, 1] }); }
  } else if (plant === 'kaktus') {
    const cr = Math.min(r * 0.4, 7);
    b.lathe('kain', 'Kaktus', [[0, 0], [cr, 0], [cr, ph - cr], [cr * 0.6, ph - cr * 0.2], [0, ph]], 0, soilY, 0, 16);
    for (let i = 0; i < 2; i++) {
      const sx = i ? 1 : -1, ay = soilY + ph * (0.35 + rnd() * 0.2), ah = ph * (0.25 + rnd() * 0.2);
      b.tube('kain', 'Cabang kaktus', [[0, ay, 0], [sx * cr * 2.2, ay, 0], [sx * cr * 2.2, ay + ah, 0]], cr * 0.6, cr * 0.8);
    }
  } else if (plant === 'daun') {
    const n = 7 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5, tilt = 0.25 + rnd() * 0.55, len = ph * (0.6 + rnd() * 0.4);
      const ex = Math.cos(a) * Math.sin(tilt) * len, ez = Math.sin(a) * Math.sin(tilt) * len, ey = Math.cos(tilt) * len;
      b.rod('aksen', 'Tangkai', [0, soilY, 0], [ex * 0.75, soilY + ey * 0.75, ez * 0.75], 0.35, 0.25, 6);
      b.group('Daun', ex * 0.85, soilY + ey * 0.85, ez * 0.85, (g) => { g.rotation.set(0, -a, -tilt - 0.5); b.sphere('kain', 'Daun', len * 0.2, 0, 0, 0, 14, { scale: [1.6, 0.08, 0.8] }); });
    }
  } else if (plant === 'pohon') {
    const th = ph * 0.55;
    b.rod('aksen', 'Batang', [0, soilY, 0], [rnd() * 4 - 2, soilY + th, rnd() * 4 - 2], 1.6, 1, 10);
    for (let i = 0; i < 7; i++) { const a = rnd() * 6.28, d = rnd() * ph * 0.16; b.sphere('kain', 'Daun', ph * (0.13 + rnd() * 0.1), Math.cos(a) * d, soilY + th + rnd() * ph * 0.3, Math.sin(a) * d, 14); }
  } else if (plant === 'sansevieria') {
    const n = 8 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, d = rnd() * soilR * 0.6, len = ph * (0.55 + rnd() * 0.45);
      b.group('Daun', Math.cos(a) * d, soilY, Math.sin(a) * d, (g) => { g.rotation.set((rnd() - 0.5) * 0.3, a, (rnd() - 0.5) * 0.3); b.lathe('kain', 'Daun', [[0, 0], [2.2, len * 0.1], [2.6, len * 0.6], [0, len]], 0, 0, 0, 6, { rot: [0, 0, 0] }).scale.set(1, 1, 0.18); });
    }
  }
}
const plantSchema = [
  G('Pot', [S('pot', 'Bentuk pot', { silinder: 'Silinder', kerucut: 'Kerucut', bulat: 'Bulat', mangkuk: 'Mangkuk', vas: 'Vas' }, 'kerucut'), R('potD', 'Diameter', 10, 60, 0.5, 30), R('potH', 'Tinggi pot', 8, 70, 0.5, 30)]),
  G('Tanaman', [S('plant', 'Jenis', { daun: 'Daun lebar', sansevieria: 'Lidah mertua', semak: 'Semak', pohon: 'Pohon kecil', kaktus: 'Kaktus', tanpa: 'Tanpa tanaman' }, 'daun'), R('plantH', 'Tinggi tanaman', 15, 150, 0.5, 60, 'cm', (p) => p.plant !== 'tanpa'), R('seed', 'Variasi', 1, 99, 1, 5, '', (p) => p.plant !== 'tanpa')]),
  G('Penyangga', [C('stand', 'Kaki penyangga', false), R('standH', 'Tinggi penyangga', 15, 70, 0.5, 35, 'cm', (p) => p.stand)]),
];

// ---- appliances -----------------------------------------------------------------
function buildFridge(b, P) {
  const W = P.w, H = P.h, D = P.d, t = 3, r = P.cornerR;
  const y0 = 2;
  for (const [x, z] of [[-W / 2 + 4, D / 2 - 6], [W / 2 - 4, D / 2 - 6], [-W / 2 + 4, -D / 2 + 6], [W / 2 - 4, -D / 2 + 6]]) b.cyl('gelap', 'Kaki', 1.8, 1.8, 2, x, 0, z, 12);
  const bodyD = D - 6;
  // hollow body
  b.boxY('utama', 'Sisi', t, H - y0, bodyD, -W / 2 + t / 2, y0, -3, { r: Math.min(r, 1.4) });
  b.boxY('utama', 'Sisi', t, H - y0, bodyD, W / 2 - t / 2, y0, -3, { r: Math.min(r, 1.4) });
  b.boxY('utama', 'Atas', W, t, bodyD, 0, H - t, -3, { r: Math.min(r, 1.4) });
  b.boxY('utama', 'Bawah', W, t + 6, bodyD, 0, y0, -3);
  b.boxY('utama', 'Belakang', W, H - y0, t, 0, y0, -D / 2 + t / 2);
  b.boxY('interior', 'Lapisan dalam', W - 2 * t - 0.2, H - y0 - t * 2 - 6, 0.3, 0, y0 + t + 6, -D / 2 + t + 0.2);
  const lay = P.layout, split = P.split;
  const zf = D / 2 - 6, dT = 6;
  const open = P.doorOpen / 100;
  const doorH = H - y0;
  const doorSet = [];
  const fz = y0 + doorH * split;
  if (lay === 'satu') doorSet.push({ x: -W / 2, w: W, y: y0, h: doorH, dir: 1 });
  else if (lay === 'atas') { doorSet.push({ x: -W / 2, w: W, y: y0, h: doorH * (1 - split), dir: 1 }, { x: -W / 2, w: W, y: y0 + doorH * (1 - split), h: doorH * split, dir: 1 }); }
  else if (lay === 'bawah') { doorSet.push({ x: -W / 2, w: W, y: y0 + doorH * split, h: doorH * (1 - split), dir: 1 }, { drawer: true, y: y0, h: doorH * split }); }
  else if (lay === 'sbs') { doorSet.push({ x: -W / 2, w: W * 0.4, y: y0, h: doorH, dir: 1 }, { x: W / 2, w: W * 0.6, y: y0, h: doorH, dir: -1 }); }
  else { doorSet.push({ x: -W / 2, w: W / 2, y: y0 + doorH * split, h: doorH * (1 - split), dir: 1 }, { x: W / 2, w: W / 2, y: y0 + doorH * split, h: doorH * (1 - split), dir: -1 }, { drawer: true, y: y0, h: doorH * split }); }
  void fz;
  // shelves inside
  for (let i = 1; i <= 4; i++) b.boxY('kaca', 'Rak kulkas', W - 2 * t - 0.6, 0.5, bodyD - 6, 0, y0 + t + 6 + (H - y0 - 12) * (i / 5), -1);
  if (lay === 'sbs') b.boxY('interior', 'Sekat', 1.5, H - y0 - t - 6, bodyD - 2, -W / 2 + W * 0.4, y0 + 6, -2);
  if (lay !== 'satu' && lay !== 'sbs') {
    const yy = lay === 'atas' ? y0 + doorH * (1 - split) : y0 + doorH * split;
    b.boxY('interior', 'Sekat freezer', W - 2 * t, 3, bodyD - 2, 0, yy - 1.5, -2);
  }
  const hstyle = P.handle;
  doorSet.forEach((d, i) => {
    if (d.drawer) {
      b.group('Laci freezer', 0, d.y + d.h / 2, zf + open * 30, () => {
        b.box('utama', 'Muka laci', W - 0.4, d.h - 0.4, dT, 0, 0, dT / 2, { r: Math.min(r, dT / 2 - 0.1) });
        b.boxY('interior', 'Keranjang', W - 8, d.h - 8, bodyD - 10, 0, -d.h / 2 + 3, -(bodyD - 10) / 2);
        if (hstyle === 'garis') b.rod('aksen', 'Gagang', [-W * 0.3, d.h / 2 - 5, dT + 2.5], [W * 0.3, d.h / 2 - 5, dT + 2.5], 1, 1, 12);
        else if (hstyle === 'cekung') b.box('gelap', 'Alur gagang', W * 0.6, 1.4, 0.3, 0, d.h / 2 - 3, dT + 0.1);
      });
      return;
    }
    b.group('Pintu kulkas', d.x, d.y + d.h / 2, zf, (g) => {
      g.rotation.y = -d.dir * rad(open * 100 * (i === 0 ? 1 : 0.9));
      b.box('utama', 'Pintu', d.w - 0.4, d.h - 0.4, dT, d.dir * d.w / 2, 0, dT / 2, { r: Math.min(r, dT / 2 - 0.1) });
      b.box('interior', 'Lapisan pintu', d.w - 6, d.h - 6, 1, d.dir * d.w / 2, 0, -0.4);
      for (let k = 1; k < 4; k++) b.boxY('interior', 'Rak pintu', d.w - 10, 6, 6, d.dir * d.w / 2, -d.h / 2 + d.h * (k / 4) - 6, -4);
      const hx = d.dir * (d.w - 4);
      const hl = Math.min(d.h * 0.5, 60);
      const hy = lay === 'atas' && i === 1 ? -d.h / 2 + hl / 2 + 5 : lay === 'atas' && i === 0 ? d.h / 2 - hl / 2 - 5 : 0;
      if (hstyle === 'garis') {
        b.rod('aksen', 'Gagang', [hx, hy - hl / 2, dT + 3], [hx, hy + hl / 2, dT + 3], 1, 1, 12);
        b.rod('aksen', 'Tiang gagang', [hx, hy - hl / 2 + 1, dT], [hx, hy - hl / 2 + 1, dT + 3], 0.8, 0.8, 8);
        b.rod('aksen', 'Tiang gagang', [hx, hy + hl / 2 - 1, dT], [hx, hy + hl / 2 - 1, dT + 3], 0.8, 0.8, 8);
      } else if (hstyle === 'cekung') b.box('gelap', 'Alur gagang', 1.4, hl, 0.3, d.dir * (d.w - 1.5), hy, dT + 0.1);
      if (P.dispenser && ((lay === 'sbs' && i === 0) || (lay === 'french' && i === 0) || (lay === 'satu'))) {
        const dx = d.dir * d.w / 2;
        b.box('layar', 'Dispenser', Math.min(22, d.w * 0.5), 30, 0.6, dx, d.h * 0.1, dT + 0.3, { r: 0.25 });
        b.box('kaca', 'Panel kontrol', Math.min(16, d.w * 0.4), 5, 0.4, dx, d.h * 0.1 + 20, dT + 0.2);
      }
    });
  });
}
const fridgeSchema = [
  G('Dimensi', [R('w', 'Lebar', 45, 120, 0.5, 70), R('h', 'Tinggi', 80, 210, 0.5, 180), R('d', 'Dalam', 50, 80, 0.5, 68), R('cornerR', 'Radius sudut', 0.2, 3, 0.1, 1.5)]),
  G('Pintu', [
    S('layout', 'Tata letak', { satu: 'Satu pintu', atas: 'Freezer atas', bawah: 'Freezer bawah', sbs: 'Side-by-side', french: 'French door' }, 'bawah'),
    R('split', 'Porsi freezer', 0.2, 0.5, 0.01, 0.32, '×', (p) => !['satu', 'sbs'].includes(p.layout)),
    S('handle', 'Gagang', { garis: 'Batang panjang', cekung: 'Alur cekung', tanpa: 'Tanpa' }, 'garis'),
    C('dispenser', 'Dispenser air', false, (p) => ['sbs', 'french', 'satu'].includes(p.layout)),
    R('doorOpen', 'Buka pintu', 0, 100, 1, 0, '%'),
  ]),
];

function buildWasher(b, P) {
  const W = P.w, H = P.h, D = P.d, r = P.cornerR;
  b.boxY('utama', 'Badan', W, H - 2, D, 0, 2, 0, { r });
  for (const [x, z] of [[-W / 2 + 5, D / 2 - 5], [W / 2 - 5, D / 2 - 5], [-W / 2 + 5, -D / 2 + 5], [W / 2 - 5, -D / 2 + 5]]) b.cyl('gelap', 'Kaki', 2, 2, 2.2, x, 0, z, 12);
  const zf = D / 2;
  if (P.type === 'depan') {
    // control strip
    b.box('sekunder', 'Panel kontrol', W - 2, 12, 0.6, 0, H - 9, zf + 0.2, { r: 0.25 });
    b.box('layar', 'Layar', 12, 4, 0.3, W * 0.1, H - 9, zf + 0.6);
    b.cyl('aksen', 'Kenop', 3.2, 3.4, 2.4, W * 0.32, H - 9, zf + 1.4, 32, { rot: [Math.PI / 2, 0, 0] });
    b.box('sekunder', 'Laci deterjen', W * 0.32, 9, 0.8, -W * 0.28, H - 9, zf + 0.6, { r: 0.3 });
    for (let i = 0; i < 4; i++) b.cyl('aksen', 'Tombol', 0.8, 0.8, 0.6, W * 0.01 - 8 + i * 4.5, H - 13, zf + 0.6, 12, { rot: [Math.PI / 2, 0, 0] });
    const dr = P.doorD / 2, cy = (H - 15) / 2 + 4;
    b.torus('aksen', 'Cincin pintu', dr, 2.4, 0, cy, zf + 1.4, [0, 0, 0]);
    b.cyl('kaca', 'Kaca pintu', dr - 1, dr - 2.5, 3, 0, cy, zf + 1, 40, { rot: [Math.PI / 2, 0, 0] });
    b.cyl('gelap', 'Karet pintu', dr - 1.2, dr - 1.2, 1, 0, cy, zf - 0.2, 40, { rot: [Math.PI / 2, 0, 0] });
    b.cyl('logamGelap', 'Drum', dr - 3, dr - 3, 1, 0, cy, zf - 2, 40, { rot: [Math.PI / 2, 0, 0] });
    b.box('aksen', 'Gagang pintu', 2, 8, 1.6, dr + 1.2, cy, zf + 2.4, { r: 0.6 });
  } else {
    b.boxY('sekunder', 'Panel kontrol', W, 10, 10, 0, H, -D / 2 + 5, { r: 1.2 });
    b.box('layar', 'Layar', 12, 4, 0.3, 0, H + 6, -D / 2 + 10.2);
    b.cyl('aksen', 'Kenop', 2.6, 2.8, 2, W * 0.3, H + 5, -D / 2 + 10.5, 24, { rot: [Math.PI / 2, 0, 0] });
    b.group('Tutup', 0, H, -D / 2 + 11, (g) => {
      g.rotation.x = -rad(P.lidOpen * 0.9);
      b.box('utama', 'Tutup', W - 4, 1.6, D - 15, 0, 0.8, (D - 15) / 2, { r: 0.7 });
      b.box('kaca', 'Kaca tutup', W - 18, 0.4, D - 30, 0, 1.7, (D - 15) / 2);
    });
    b.cyl('logamGelap', 'Tabung', W * 0.38, W * 0.38, 1, 0, H - 30, 3, 40);
    b.cyl('gelap', 'Bukaan', W * 0.4, W * 0.4, 0.3, 0, H - 0.25, 3, 40);
  }
}
const washerSchema = [
  G('Dimensi', [R('w', 'Lebar', 50, 75, 0.5, 60), R('h', 'Tinggi', 75, 110, 0.5, 85), R('d', 'Dalam', 45, 75, 0.5, 58), R('cornerR', 'Radius sudut', 0.2, 4, 0.1, 1.6)]),
  G('Model', [
    S('type', 'Tipe', { depan: 'Bukaan depan', atas: 'Bukaan atas' }, 'depan'),
    R('doorD', 'Diameter pintu', 25, 50, 0.5, 36, 'cm', (p) => p.type === 'depan'), R('lidOpen', 'Buka tutup', 0, 100, 1, 0, '%', (p) => p.type === 'atas'),
  ]),
];

function buildTV(b, P) {
  const diag = P.inch * 2.54, k = Math.sqrt(16 * 16 + 9 * 9);
  const sw = diag * 16 / k, sh = diag * 9 / k, bz = P.bezel, T = P.thick;
  const W = sw + bz * 2, H = sh + bz * 2;
  let y = 0;
  if (P.stand === 'kaki') { for (const sx of [-1, 1]) { b.tube('aksen', 'Kaki TV', [[sx * W * 0.38, 7, 0], [sx * W * 0.42, 0.6, 8], [sx * W * 0.42, 0.6, -8]], 0.8, 2); } y = 7; }
  else if (P.stand === 'tengah') { b.box('aksen', 'Alas TV', W * 0.32, 1.2, 22, 0, 0.6, 0, { r: 0.5 }); b.boxY('aksen', 'Leher TV', 6, 9, 2, 0, 1.2, -1.5); y = 8; }
  else if (P.stand === 'easel') {
    const top = 125;
    for (const sx of [-1, 1]) b.rod('aksen', 'Kaki easel', [sx * 6, top, 0], [sx * 30, 0, 14], 1.2, 1.2, 10);
    b.rod('aksen', 'Kaki easel', [0, top, -1], [0, 0, -35], 1.2, 1.2, 10);
    y = top - H * 0.62;
  } else y = P.elev;
  b.box('utama', 'Bodi TV', W, H, T, 0, y + H / 2, 0, { r: Math.min(0.6, T / 2 - 0.05) });
  b.box(P.screen === 'biru' ? 'layarBiru' : P.screen === 'senja' ? 'layarSenja' : 'layar', 'Layar', sw, sh, 0.1, 0, y + H / 2, T / 2 + 0.03, { uv01: true });
  if (P.stand === 'dinding') b.boxY('aksen', 'Braket dinding', 30, 30, 4, 0, y + H / 2 - 15, -T / 2 - 2);
  if (P.soundbar) b.box('utama', 'Soundbar', W * 0.75, 6, 9, 0, (P.stand === 'dinding' ? y - 8 : 3), P.stand === 'dinding' ? 0 : 12, { r: 1.5 });
}
const tvSchema = [
  G('Ukuran', [R('inch', 'Ukuran layar', 24, 100, 1, 55, 'inci'), R('thick', 'Tebal', 1, 10, 0.1, 3), R('bezel', 'Bezel', 0.2, 4, 0.1, 0.8)]),
  G('Dudukan', [S('stand', 'Model', { kaki: 'Kaki samping', tengah: 'Pedestal tengah', easel: 'Easel lantai', dinding: 'Gantung dinding' }, 'kaki'), R('elev', 'Tinggi dari lantai', 0, 160, 0.5, 100, 'cm', (p) => p.stand === 'dinding'), C('soundbar', 'Soundbar', false)]),
  G('Layar', [S('screen', 'Tampilan layar', { mati: 'Mati', biru: 'Menyala — biru', senja: 'Menyala — senja' }, 'senja')]),
];

function buildFan(b, P) {
  const H = P.h, R0 = P.bladeD / 2;
  if (P.base === 'silang') {
    for (const a of [0, Math.PI / 2]) b.box('utama', 'Kaki kipas', 50, 3, 5, 0, 1.5, 0, { r: 1.2, rot: [0, a, 0] });
  } else b.lathe('utama', 'Alas kipas', [[0, 0], [18, 0], [18, 1.5], [14, 4], [3, 5], [0, 5]], 0, 0, 0, 40);
  const neck = H - R0 - 4;
  b.rod('aksen', 'Tiang kipas', [0, 4, 0], [0, neck * 0.6, 0], 1.6, 1.6, 14);
  b.rod('utama', 'Tiang atas', [0, neck * 0.6, 0], [0, neck, 0], 1.2, 1.2, 14);
  b.cyl('utama', 'Pengatur', 2.4, 2.4, 5, 0, neck * 0.6 - 2.5, 0, 16);
  b.group('Kepala kipas', 0, neck + 3, 0, (g) => {
    g.rotation.x = -rad(P.tilt);
    b.box('utama', 'Penyangga kepala', 4, 6, 6, 0, -1, -2, { r: 1.5 });
    b.cyl('utama', 'Motor', 6.5, 7.5, 14, 0, 0, 0, 24, { rot: [Math.PI / 2, 0, 0] }).position.set(0, 3, -9);
    const cz = 3;
    const hubY = 3;
    b.sphere('sekunder', 'Hub', 4, 0, hubY, cz, 18, { scale: [1, 1, 0.6] });
    const n = P.blades | 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rad(P.spin);
      b.group('Baling', 0, hubY, cz, (gg) => {
        gg.rotation.z = a;
        b.sphere('sekunder', 'Baling-baling', R0 * 0.42, 0, R0 * 0.5, 0, 16, { scale: [0.78, 1.05, 0.06], rot: [0, 0.35, 0] });
      });
    }
    if (P.guard) {
      const gr = R0 + 2.5, rings = P.rings | 0, dome = 6;
      for (const side of [-1, 1]) {
        const zc = cz + side * dome;
        for (let k = 1; k <= rings; k++) b.torus('aksen', 'Kisi', gr * (k / rings), 0.2, 0, hubY, cz + side * dome * (1 - k / rings), [0, 0, 0]);
        for (let s = 0; s < 16; s++) {
          const a = (s / 16) * Math.PI * 2;
          b.rod('aksen', 'Jari kisi', [0, hubY, zc], [Math.cos(a) * gr, hubY + Math.sin(a) * gr, cz], 0.15, 0.15, 4);
        }
      }
      b.torus('aksen', 'Bingkai kisi', gr, 0.6, 0, hubY, cz, [0, 0, 0]);
      b.cyl('utama', 'Logo', 3, 3, 0.8, 0, hubY, cz + 6.2, 20, { rot: [Math.PI / 2, 0, 0] });
    }
  });
}
const fanSchema = [
  G('Dimensi', [R('h', 'Tinggi', 60, 150, 0.5, 115), R('bladeD', 'Diameter baling', 20, 60, 0.5, 40), R('tilt', 'Sudut kepala', -10, 30, 0.5, 8, '°')]),
  G('Kipas', [R('blades', 'Jumlah baling', 3, 7, 1, 3, ''), R('spin', 'Rotasi baling', 0, 120, 1, 15, '°'), C('guard', 'Kisi pelindung', true), R('rings', 'Cincin kisi', 2, 6, 1, 4, '', (p) => p.guard), S('base', 'Alas', { bulat: 'Bulat', silang: 'Silang' }, 'bulat')]),
];

// ---- registry -------------------------------------------------------------------
export const CATEGORIES = [
  { id: 'duduk', label: 'Kursi & Sofa' },
  { id: 'meja', label: 'Meja' },
  { id: 'kamar', label: 'Kamar' },
  { id: 'simpan', label: 'Rak & Kabinet' },
  { id: 'dekor', label: 'Lampu & Dekor' },
  { id: 'alat', label: 'Elektronik' },
];

const WOOD = { c: '#c49a6c', f: 'kayu' };
const M = (o) => o;
export const TYPES = {
  kursi: { cat: 'duduk', label: 'Kursi makan', schema: chairSchema, build: buildChair,
    slots: { utama: 'Dudukan & sandaran', sekunder: 'Kaki & tiang', kain: 'Bantalan', aksen: 'Logam' },
    mats: M({ utama: WOOD, sekunder: WOOD, kain: { c: '#b8ae9f', f: 'kain' }, aksen: { c: '#2b2b2d', f: 'logam' } }),
    styles: {
      'Skandinavia': { backStyle: 'bilah_v', slats: 4, legStyle: 'runcing', seatShape: 'tumpul' },
      'Windsor': { backStyle: 'spindle', slats: 7, legStyle: 'bubut', stretch: 'h', seatShape: 'lunak', backCurve: 5, apron: false },
      'Mid-century': { backStyle: 'lengkung', legStyle: 'mid', legSplay: 8, backCurve: 4, apron: false, seatShape: 'lunak' },
      'Industrial': { backStyle: 'bilah_h', slats: 3, legStyle: 'logam', stretch: 'kotak', stretchH: 18, apron: false, seatShape: 'persegi' },
      'Berjok': { backStyle: 'jok', cushion: true, legStyle: 'runcing', arms: false, backH: 48 },
      'Kursi kantor': { backStyle: 'jok', cushion: true, legStyle: 'pedestal', pedBase: 'bintang', arms: true, backH: 50, seatH: 48 },
    } },
  kursiSantai: { cat: 'duduk', label: 'Kursi santai', schema: armchairSchema, build: buildArmchair,
    slots: { kain: 'Jok', sekunder: 'Kaki / lengan kayu', aksen: 'Bantal hias' }, softAksen: true,
    mats: M({ utama: WOOD, sekunder: { c: '#7a5236', f: 'kayu' }, kain: { c: '#6f7f6a', f: 'beludru' }, aksen: { c: '#d9b16a', f: 'kain' } }),
    styles: {
      'Mid-century': { armStyle: 'kayu', armW: 6, legStyle: 'mid', backCush: true },
      'Club': { armStyle: 'bulat', armW: 18, legStyle: 'bubut', legH: 8, tufted: true, backCush: false },
      'Modern kotak': { armStyle: 'kotak', armW: 16, legStyle: 'plinth', legH: 4, backCush: true },
      'Lounge rendah': { armStyle: 'miring', seatH: 38, backH: 70, legStyle: 'sled', legH: 10 },
    } },
  sofa: { cat: 'duduk', label: 'Sofa', schema: sofaSchema, build: buildSofa,
    slots: { kain: 'Jok', sekunder: 'Kaki', aksen: 'Bantal hias' }, softAksen: true,
    mats: M({ utama: WOOD, sekunder: { c: '#5b3d29', f: 'kayu' }, kain: { c: '#9aa1a6', f: 'kain' }, aksen: { c: '#c98b5a', f: 'beludru' } }),
    styles: {
      'Modern': { armStyle: 'kotak', armW: 18, legStyle: 'runcing', seats: 3 },
      'Chesterfield': { armStyle: 'bulat', armW: 22, legStyle: 'bubut', legH: 8, tufted: true, backCush: false, split: false, armH: 70, backH: 74 },
      'Sectional L': { chaise: 'kanan', seats: 3, armStyle: 'kotak', armW: 14, legStyle: 'plinth', legH: 4 },
      'Loveseat': { seats: 2, armStyle: 'miring', legStyle: 'mid', legH: 16 },
    } },
  bangku: { cat: 'duduk', label: 'Stool / bar', schema: stoolSchema, build: buildStool,
    slots: { utama: 'Dudukan', sekunder: 'Kaki', kain: 'Bantalan', aksen: 'Logam' },
    mats: M({ utama: WOOD, sekunder: WOOD, kain: { c: '#3b3b3b', f: 'kulit' }, aksen: { c: '#2b2b2d', f: 'logam' } }),
    styles: {
      'Bar stool': { seatH: 66, footrest: 'cincin' },
      'Stool pendek': { seatH: 45, footrest: 'tanpa', legCount: 3 },
      'Industrial': { legStyle: 'logam', seatShape: 'bulat', saddle: false, footrest: 'palang', legCount: 4 },
      'Pedestal': { legStyle: 'pedestal', pedBase: 'piringan', cushion: true, back: 'bulat' },
    } },
  bangkuPanjang: { cat: 'duduk', label: 'Bangku panjang', schema: benchSchema, build: buildBench,
    slots: { utama: 'Dudukan', sekunder: 'Kaki', kain: 'Bantalan', aksen: 'Logam' },
    mats: M({ utama: WOOD, sekunder: WOOD, kain: { c: '#c7bba8', f: 'kain' }, aksen: { c: '#2b2b2d', f: 'logam' } }),
    styles: {
      'Papan + hairpin': { legStyle: 'hairpin', seatStyle: 'papan' },
      'Taman': { seatStyle: 'bilah', back: true, legStyle: 'panel' },
      'Entryway': { shelf: true, cushion: true, legStyle: 'lurus', legSplay: 0 },
      'Trestle': { legStyle: 'trestle', w: 180 },
    } },

  mejaMakan: { cat: 'meja', label: 'Meja makan', schema: diningSchema, build: buildDining,
    slots: { utama: 'Daun meja', sekunder: 'Kaki', kain: 'Bantalan kursi', aksen: 'Logam' },
    mats: M({ utama: WOOD, sekunder: WOOD, kain: { c: '#b8ae9f', f: 'kain' }, aksen: { c: '#2b2b2d', f: 'logam' }, kaca: { c: '#cfe3e0', f: 'kaca' } }),
    styles: {
      'Klasik': { legStyle: 'bubut', topShape: 'persegi', apron: true },
      'Bulat pedestal': { topShape: 'bulat', w: 120, legStyle: 'pedestal', pedBase: 'piringan' },
      'Industrial': { legStyle: 'sled', topShape: 'persegi', edge: 'siku', topT: 5 },
      'Farmhouse': { legStyle: 'trestle', topT: 5, edge: 'siku', w: 200 },
      'Kaca modern': { topMat: 'kaca', topT: 1.2, legStyle: 'x', apron: false, topShape: 'tumpul' },
    } },
  mejaKopi: { cat: 'meja', label: 'Meja kopi', schema: coffeeSchema, build: buildCoffee,
    slots: { utama: 'Daun meja', sekunder: 'Kaki', aksen: 'Logam & pegangan' },
    mats: M({ utama: WOOD, sekunder: WOOD, aksen: { c: '#b8925a', f: 'logam' }, kaca: { c: '#cfe3e0', f: 'kaca' } }),
    styles: {
      'Kapsul': { topShape: 'kapsul', legStyle: 'mid', shelf: true },
      'Bulat marmer': { topShape: 'bulat', w: 80, legStyle: 'pedestal', shelf: false },
      'Dengan laci': { topShape: 'persegi', drawers: 2, legStyle: 'runcing', shelf: true },
      'Kaca & hairpin': { topMat: 'kaca', topT: 1.2, legStyle: 'hairpin', shelf: true },
    } },
  mejaSamping: { cat: 'meja', label: 'Meja samping', schema: sideSchema, build: buildSide,
    slots: { utama: 'Daun meja', sekunder: 'Kaki', aksen: 'Logam' },
    mats: M({ utama: WOOD, sekunder: WOOD, aksen: { c: '#b8925a', f: 'logam' }, kaca: { c: '#cfe3e0', f: 'kaca' } }),
    styles: {
      'Tripod': { topShape: 'bulat', legStyle: 'mid', legCount: 3 },
      'Kotak + laci': { topShape: 'tumpul', drawer: true, legStyle: 'runcing' },
      'Pedestal': { topShape: 'bulat', legStyle: 'pedestal', shelf: false },
    } },
  mejaKerja: { cat: 'meja', label: 'Meja kerja', schema: deskSchema, build: buildDesk,
    slots: { utama: 'Badan', sekunder: 'Kaki', aksen: 'Logam & pegangan' },
    mats: M({ utama: WOOD, sekunder: WOOD, aksen: { c: '#2b2b2d', f: 'logam' } }),
    styles: {
      'Minimalis': { pedestal: 'tanpa', legStyle: 'logam', center: true },
      'Eksekutif': { pedestal: 'dua', modesty: true, legStyle: 'panel', w: 170, frontStyle: 'shaker', handle: 'bar' },
      'Studio': { pedestal: 'kanan', hutch: true, legStyle: 'hairpin', monitor: true },
    } },

  tempatTidur: { cat: 'kamar', label: 'Tempat tidur', schema: bedSchema, build: buildBed,
    slots: { utama: 'Rangka', kain: 'Headboard', sekunder: 'Kaki', aksen: 'Selimut' }, softAksen: true,
    mats: M({ utama: WOOD, sekunder: WOOD, kain: { c: '#a9a196', f: 'beludru' }, aksen: { c: '#7d8b84', f: 'kain' } }),
    styles: {
      'Kanal': { headStyle: 'kanal', frameMat: 'kain' },
      'Kayu bilah': { headStyle: 'bilah', frameMat: 'utama', legStyle: 'mid' },
      'Tufted': { headStyle: 'kancing', frameMat: 'kain', headH: 130, legStyle: 'bulat', legH: 8 },
      'Platform rendah': { headStyle: 'panel', legStyle: 'plinth', legH: 6, frameH: 22, headH: 85 },
    } },
  lemari: { cat: 'kamar', label: 'Lemari pakaian', schema: wardrobeSchema, build: buildWardrobe,
    slots: { utama: 'Badan & pintu', sekunder: 'Kaki', kain: 'Isi (baju)', aksen: 'Pegangan & gantungan' },
    mats: M({ utama: WOOD, sekunder: WOOD, kain: { c: '#8b9aa7', f: 'kain' }, aksen: { c: '#2b2b2d', f: 'logam' }, kaca: { c: '#cfe3e0', f: 'kaca' } }),
    styles: {
      'Dua pintu': { doors: 2, frontStyle: 'polos', handle: 'bar' },
      'Tiga pintu cermin': { doors: 3, w: 160, frontStyle: 'cermin', handle: 'knob' },
      'Pintu geser': { doors: 2, sliding: true, w: 180, frontStyle: 'bilah', doorOpen: 50 },
      'Klasik': { doors: 2, frontStyle: 'shaker', cornice: true, legStyle: 'bubut', legH: 12, handle: 'knob' },
    } },
  lemariLaci: { cat: 'kamar', label: 'Lemari laci', schema: dresserSchema, build: buildDresser,
    slots: { utama: 'Badan', sekunder: 'Kaki', aksen: 'Pegangan' },
    mats: M({ utama: WOOD, sekunder: WOOD, aksen: { c: '#b8925a', f: 'logam' } }),
    styles: {
      'Mid-century': { cols: 2, rows: 3, legStyle: 'mid', handle: 'tab' },
      'Tinggi': { cols: 1, rows: 6, w: 60, h: 130, legStyle: 'plinth', legH: 5, graded: false },
      'Klasik': { cols: 2, rows: 4, topSplit: true, frontStyle: 'shaker', handle: 'knob', legStyle: 'bubut', legH: 10 },
    } },
  nakas: { cat: 'kamar', label: 'Nakas', schema: nightSchema, build: buildNightstand,
    slots: { utama: 'Badan', sekunder: 'Kaki', aksen: 'Pegangan' },
    mats: M({ utama: WOOD, sekunder: WOOD, aksen: { c: '#b8925a', f: 'logam' }, kain: { c: '#e8e1d6', f: 'kain' } }),
    styles: { 'Mid-century': { legStyle: 'mid', niche: 'bawah' }, 'Dua laci': { drawers: 2, niche: 'tanpa', legStyle: 'plinth', legH: 4 }, 'Rotan': { niche: 'pintu', drawers: 1, frontStyle: 'rotan', handle: 'kulit' } } },

  rakBuku: { cat: 'simpan', label: 'Rak buku', schema: shelfSchema, build: buildBookshelf,
    slots: { utama: 'Papan rak', sekunder: 'Panel belakang', aksen: 'Rangka logam' },
    mats: M({ utama: WOOD, sekunder: { c: '#e9e4da', f: 'matte' }, aksen: { c: '#2b2b2d', f: 'logam' }, kain: { c: '#e9e4da', f: 'kain' } }),
    styles: { 'Kabinet': { style: 'kotak', cols: 2, rows: 5 }, 'Industrial': { style: 'rangka', cols: 2, rows: 5, legH: 0 }, 'Tangga': { style: 'tangga', rows: 5, w: 70 }, 'Perpustakaan': { cols: 4, w: 200, h: 220, doorsLow: true } } },
  mejaTV: { cat: 'simpan', label: 'Meja TV / buffet', schema: tvStandSchema, build: buildTVStand,
    slots: { utama: 'Badan', sekunder: 'Kaki', aksen: 'Logam', kain: 'Anyaman' },
    mats: M({ utama: WOOD, sekunder: WOOD, aksen: { c: '#2b2b2d', f: 'logam' }, kain: { c: '#d8c29a', f: 'anyaman' }, kaca: { c: '#cfe3e0', f: 'kaca' } }),
    styles: { 'Fluted': { frontStyle: 'bilah', mix: 'campur' }, 'Buffet rotan': { frontStyle: 'rotan', mix: 'pintu', sections: 3, tv: false, h: 75, handle: 'knob' }, 'Rendah': { legStyle: 'plinth', legH: 3, h: 40, frontStyle: 'polos', handle: 'cekung' } } },
  dapur: { cat: 'simpan', label: 'Kabinet dapur', schema: kitchenSchema, build: buildKitchen,
    slots: { utama: 'Pintu & badan', sekunder: 'Meja (countertop)', aksen: 'Logam & sink' },
    mats: M({ utama: { c: '#5f7466', f: 'satin' }, sekunder: { c: '#ece9e4', f: 'marmer' }, aksen: { c: '#c7c9cc', f: 'logam' }, kaca: { c: '#cfe3e0', f: 'kaca' }, kain: { c: '#d8c29a', f: 'anyaman' } }),
    styles: { 'Shaker hijau': { frontStyle: 'shaker' }, 'Modern putih': { frontStyle: 'polos', handle: 'cekung' }, 'Kayu fluted': { frontStyle: 'bilah', handle: 'tab' } } },

  lampuLantai: { cat: 'dekor', label: 'Lampu lantai', schema: floorLampSchema, build: buildFloorLamp,
    slots: { utama: 'Tiang', kain: 'Kap lampu', sekunder: 'Alas', aksen: 'Detail logam' },
    mats: M({ utama: { c: '#2b2b2d', f: 'logam' }, sekunder: { c: '#e7e3dc', f: 'marmer' }, kain: { c: '#efe7d8', f: 'kain' }, aksen: { c: '#b8925a', f: 'logam' } }),
    styles: { 'Klasik': { pole: 'lurus', shade: 'drum' }, 'Arc lamp': { pole: 'lengkung', shade: 'kubah', h: 190, reach: 110 }, 'Tripod': { base: 'tripod', shade: 'kerucut' }, 'Baca': { pole: 'lengan', shade: 'kubah', shadeD: 30 } } },
  lampuMeja: { cat: 'dekor', label: 'Lampu meja', schema: tableLampSchema, build: buildTableLamp,
    slots: { utama: 'Badan', kain: 'Kap lampu', aksen: 'Logam' },
    mats: M({ utama: { c: '#c8b49a', f: 'glossy' }, kain: { c: '#efe7d8', f: 'kain' }, aksen: { c: '#b8925a', f: 'logam' } }),
    styles: { 'Vas keramik': { body: 'vas', shade: 'kerucut' }, 'Jamur': { body: 'tiang', shade: 'kubah', shadeD: 30, h: 40 }, 'Bola': { body: 'bola', shade: 'plisket' } } },
  cermin: { cat: 'dekor', label: 'Cermin', schema: mirrorSchema, build: buildMirror,
    slots: { utama: 'Bingkai', sekunder: 'Penyangga' },
    mats: M({ utama: { c: '#b8925a', f: 'logam' }, sekunder: WOOD }),
    styles: { 'Arch': { shape: 'lengkung', mount: 'bersandar' }, 'Bulat dinding': { shape: 'bulat', w: 70, mount: 'dinding', frameW: 2 }, 'Berdiri': { shape: 'persegi', mount: 'berdiri', w: 50, frameW: 5 } } },
  pot: { cat: 'dekor', label: 'Pot tanaman', schema: plantSchema, build: buildPlant,
    slots: { utama: 'Pot', kain: 'Daun', aksen: 'Tanah & batang', sekunder: 'Penyangga' },
    mats: M({ utama: { c: '#c56d4b', f: 'matte' }, kain: { c: '#4f7a45', f: 'satin' }, aksen: { c: '#4a3426', f: 'matte' }, sekunder: WOOD }),
    styles: { 'Monstera': { plant: 'daun', pot: 'kerucut' }, 'Lidah mertua': { plant: 'sansevieria', pot: 'silinder', potD: 24, plantH: 70 }, 'Kaktus': { plant: 'kaktus', pot: 'mangkuk', potD: 18, potH: 14, plantH: 30 }, 'Pohon': { plant: 'pohon', pot: 'bulat', potD: 40, potH: 40, plantH: 130 } } },

  kulkas: { cat: 'alat', label: 'Kulkas', schema: fridgeSchema, build: buildFridge,
    slots: { utama: 'Badan', aksen: 'Gagang' },
    mats: M({ utama: { c: '#eceae6', f: 'glossy' }, aksen: { c: '#c7c9cc', f: 'logam' }, kaca: { c: '#cfe3e0', f: 'kaca' } }),
    styles: { '2 pintu': { layout: 'bawah' }, 'Side-by-side': { layout: 'sbs', w: 92, dispenser: true }, 'French door': { layout: 'french', w: 84, handle: 'garis' }, 'Retro': { layout: 'atas', cornerR: 3, w: 60, h: 155, handle: 'garis' } } },
  mesinCuci: { cat: 'alat', label: 'Mesin cuci', schema: washerSchema, build: buildWasher,
    slots: { utama: 'Badan', sekunder: 'Panel', aksen: 'Kenop & ring' },
    mats: M({ utama: { c: '#f1f0ed', f: 'glossy' }, sekunder: { c: '#d9d9d6', f: 'satin' }, aksen: { c: '#a7aaae', f: 'logam' }, kaca: { c: '#a9c2c9', f: 'kaca' } }),
    styles: { 'Front load': { type: 'depan' }, 'Top load': { type: 'atas', lidOpen: 40 } } },
  tv: { cat: 'alat', label: 'Televisi', schema: tvSchema, build: buildTV,
    slots: { utama: 'Bodi', aksen: 'Stand' },
    mats: M({ utama: { c: '#1d1d1f', f: 'satin' }, aksen: { c: '#3a3a3c', f: 'logam' } }),
    styles: { 'Kaki samping': { stand: 'kaki' }, 'Easel': { stand: 'easel', screen: 'senja' }, 'Dinding': { stand: 'dinding', soundbar: true } } },
  kipas: { cat: 'alat', label: 'Kipas berdiri', schema: fanSchema, build: buildFan,
    slots: { utama: 'Badan', sekunder: 'Baling-baling', aksen: 'Kisi & tiang' },
    mats: M({ utama: { c: '#f1f0ed', f: 'glossy' }, sekunder: { c: '#9fc3d4', f: 'kaca' }, aksen: { c: '#c7c9cc', f: 'logam' } }),
    styles: { 'Klasik': { blades: 3, guard: true }, 'Retro': { blades: 4, base: 'bulat', rings: 3 }, 'Tanpa kisi': { guard: false, blades: 5 } } },
};

export function defaults(type) {
  const o = {};
  for (const g of TYPES[type].schema) for (const p of g.params) o[p.k] = p.v;
  return o;
}
export function allParams(type) { return TYPES[type].schema.flatMap((g) => g.params); }
