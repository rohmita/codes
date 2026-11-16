// Shared furniture sub-assemblies: legs, stretchers, aprons, handles, fronts, drawers, doors.
import { V } from './geo.js';

export const rad = (d) => (d * Math.PI) / 180;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Small deterministic RNG (mulberry32) so "random" contents are stable per seed. */
export function rng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LEG_LABELS = {
  lurus: 'Kotak lurus', runcing: 'Kotak runcing', bulat: 'Silinder', mid: 'Mid-century', bubut: 'Bubut klasik',
  logam: 'Logam ramping', hairpin: 'Hairpin', sled: 'Sled (rangka U)', x: 'Rangka X', panel: 'Panel samping',
  pedestal: 'Pedestal', trestle: 'Trestle', plinth: 'Alas plinth',
};
export const METAL_LEGS = new Set(['logam', 'hairpin', 'sled']);
const CORNER = new Set(['lurus', 'runcing', 'bulat', 'mid', 'bubut', 'logam']);

/** Turned-leg profile (radius factor, height fraction). */
const TURNED = [[0, 0], [0.7, 0], [0.82, 0.02], [0.6, 0.05], [0.5, 0.28], [0.72, 0.34], [0.52, 0.4], [0.62, 0.52], [0.9, 0.58], [0.9, 0.62], [0.8, 0.64], [0.92, 0.7], [0.92, 1], [0, 1]];

/**
 * Leg set for a rectangular footprint. Top of legs at y = h.
 * P: legStyle, legT, legTaper, legSplay, legInset, stretch, stretchH, pedBase
 */
export function legs(b, P, w, d, h, o = {}) {
  const st = P.legStyle || 'lurus';
  const t = P.legT ?? 4, inset = P.legInset ?? 2, taper = P.legTaper ?? 0;
  const splay = rad(P.legSplay ?? 0);
  const wood = o.slot || 'sekunder', metal = 'aksen';
  const hx = Math.max(1, w / 2 - inset - t / 2), hz = Math.max(1, d / 2 - inset - t / 2);
  const off = h * Math.tan(splay);
  const corners = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  const legAt = (x, z, y) => { const f = 1 - y / h; return [x + Math.sign(x) * off * 0.8 * f, y, z + Math.sign(z) * off * 0.8 * f]; };

  if (CORNER.has(st)) {
    const slot = st === 'logam' ? metal : wood;
    for (const [x, z] of corners) {
      const top = [x, h, z], bot = legAt(x, z, 0);
      if (st === 'lurus' && !off) b.boxY(slot, 'Kaki', t, h, t, x, 0, z);
      else if (st === 'lurus') b.rod(slot, 'Kaki', top, bot, t / 2, t / 2, 4);
      else if (st === 'runcing') b.rod(slot, 'Kaki', top, bot, t / 2, (t / 2) * (1 - Math.max(taper, 0.15)), 4);
      else if (st === 'bulat') b.rod(slot, 'Kaki', top, bot, t / 2, (t / 2) * (1 - taper), 20);
      else if (st === 'mid') {
        b.rod(slot, 'Kaki', top, bot, t / 2, (t / 2) * (1 - Math.max(taper, 0.4)), 20);
        b.rod(metal, 'Sepatu kaki', legAt(x, z, 2.4), bot, (t / 2) * (1 - Math.max(taper, 0.4)) * 1.05, (t / 2) * (1 - Math.max(taper, 0.4)) * 1.02, 20);
      } else if (st === 'logam') b.rod(slot, 'Kaki', top, bot, Math.max(0.6, t * 0.22), Math.max(0.6, t * 0.22), 14);
      else if (st === 'bubut') b.lathe(slot, 'Kaki bubut', TURNED.map(([r, y]) => [r * t / 2 * (1 - taper * (1 - y) * 0.6), y * h]), x, 0, z, 18);
    }
    stretchers(b, P, hx, hz, h, legAt, st === 'logam' ? metal : wood, st);
    return { hx, hz };
  }

  if (st === 'hairpin') {
    const s = clamp(Math.min(w, d) * 0.18, 6, 16), r = 0.55;
    for (const [x, z] of corners) {
      const sx = Math.sign(x), sz = Math.sign(z);
      const xi = x + sx * t / 2 - sx * 1.5, zi = z + sz * t / 2 - sz * 1.5;
      const bot = [xi - sx * s * 0.25 + sx * off * 0.6, 0.6, zi - sz * s * 0.25 + sz * off * 0.6];
      b.tube(metal, 'Kaki hairpin', [[xi - sx * s * 0.7, h, zi], bot, [xi, h, zi - sz * s * 0.7]], r, 2.5);
      b.tube(metal, 'Kaki hairpin', [[xi - sx * s * 0.35, h, zi - sz * s * 0.1], bot, [xi - sx * s * 0.1, h, zi - sz * s * 0.35]], r, 2.5, { caps: false });
      b.boxY(metal, 'Pelat kaki', s * 0.75, 0.4, s * 0.75, xi - sx * s * 0.35, h - 0.4, zi - sz * s * 0.35);
    }
    return { hx, hz };
  }
  if (st === 'sled') {
    const r = clamp(t * 0.28, 0.8, 2.2);
    for (const sx of [-1, 1]) {
      const x = sx * hx;
      b.tube(metal, 'Rangka sled', [[x, h - r, -hz], [x, r, -hz - off], [x, r, hz + off], [x, h - r, hz]], r, 5);
      b.rod(metal, 'Palang sled', [x, h - r, -hz], [x, h - r, hz], r * 0.8, r * 0.8, 12);
    }
    b.rod(metal, 'Palang sled', [-hx, h - r, -hz], [hx, h - r, -hz], r * 0.8, r * 0.8, 12);
    b.rod(metal, 'Palang sled', [-hx, h - r, hz], [hx, h - r, hz], r * 0.8, r * 0.8, 12);
    return { hx, hz };
  }
  if (st === 'x') {
    const xs = d > w * 1.4 ? null : 1; // X on the short ends
    for (const sx of [-1, 1]) {
      const x = sx * hx;
      b.rod(wood, 'Kaki X', [x, h, -hz], [x + sx * off, 0, hz + off], t / 2, t / 2, 4);
      b.rod(wood, 'Kaki X', [x, h, hz], [x + sx * off, 0, -hz - off], t / 2, t / 2, 4);
      b.boxY(wood, 'Palang atas', t, t * 0.8, hz * 2 + t, x, h - t * 0.8, 0);
    }
    if (xs) b.rod(wood, 'Penguat tengah', [-hx, h * 0.45, 0], [hx, h * 0.45, 0], t * 0.32, t * 0.32, 4);
    return { hx, hz };
  }
  if (st === 'panel') {
    const pt = Math.max(1.6, t * 0.6);
    for (const sx of [-1, 1]) b.boxY(wood, 'Panel kaki', pt, h, d - inset * 2, sx * (w / 2 - inset - pt / 2), 0, 0);
    if (P.stretch && P.stretch !== 'none') b.boxY(wood, 'Panel belakang', w - inset * 2 - pt * 2, Math.min(h * 0.4, 30), 1.6, 0, h - Math.min(h * 0.4, 30), -hz);
    return { hx: w / 2 - inset - pt / 2, hz };
  }
  if (st === 'plinth') {
    const rec = Math.max(1, inset + 2);
    b.boxY(wood, 'Alas plinth', Math.max(4, w - rec * 2), h, Math.max(4, d - rec * 2), 0, 0, -0.01);
    return { hx, hz };
  }
  if (st === 'trestle') {
    const pw = t * 1.6;
    for (const sx of [-1, 1]) {
      const x = sx * hx;
      b.boxY(wood, 'Kaki trestle', pw * 0.9, 4, d - inset * 2, x, 0, 0, { r: 1 });
      b.boxY(wood, 'Tiang trestle', pw * 0.9, h - 7, pw, x, 4, 0);
      b.boxY(wood, 'Palang trestle', pw * 0.9, 3, d - inset * 2 - 6, x, h - 3, 0, { r: 0.5 });
    }
    b.boxY(wood, 'Penguat trestle', hx * 2, t * 1.2, t * 0.7, 0, h * 0.32, 0);
    return { hx, hz };
  }
  if (st === 'pedestal') { pedestal(b, P, Math.min(w, d), h, wood); return { hx, hz }; }
  return { hx, hz };
}

export function pedestal(b, P, span, h, wood = 'sekunder') {
  const t = P.legT ?? 4;
  const cr = clamp(t * 1.1, 2.5, 9);
  const br = clamp(span * 0.36, 16, 45);
  const base = P.pedBase || 'piringan';
  const metal = 'aksen';
  let y0 = 0;
  if (base === 'piringan') {
    b.lathe(wood, 'Alas pedestal', [[0, 0], [br, 0], [br, 1.2], [br * 0.92, 2.4], [cr * 1.5, 3.6], [0, 3.6]], 0, 0, 0, 48);
    y0 = 3.4;
  } else if (base === 'silang') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.rod(wood, 'Kaki silang', [0, 4, 0], [Math.cos(a) * br, 0.8, Math.sin(a) * br], t * 0.45, t * 0.35, 4);
    }
    y0 = 3;
  } else {
    // 5-star base with casters (office style)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const ex = Math.cos(a) * br, ez = Math.sin(a) * br;
      b.rod(metal, 'Lengan bintang', [0, 9, 0], [ex, 7, ez], 2, 1.4, 10);
      b.cyl('gelap', 'Roda', 2.2, 2.2, 3, ex, 1.4, ez, 16, { rot: [Math.PI / 2, 0, a] });
      b.cyl(metal, 'Dudukan roda', 0.8, 0.8, 3, ex, 4.4, ez, 8);
    }
    b.cyl(metal, 'Hub', 3.4, 4.2, 4, 0, 6, 0, 24);
    y0 = 9;
  }
  const colR = base === 'bintang' ? 1.6 : cr;
  b.cyl(base === 'bintang' ? metal : wood, 'Tiang pedestal', colR, colR * (base === 'bintang' ? 1 : 1.25), Math.max(1, h - y0 - 1.5), 0, y0, 0, 24);
  b.cyl(base === 'bintang' ? 'gelap' : wood, 'Pelat atas', cr * 2.2, cr * 2.4, 1.5, 0, h - 1.5, 0, 24);
}

export function stretchers(b, P, hx, hz, h, legAt, slot, st) {
  const kind = P.stretch || 'none'; if (kind === 'none') return;
  const y = clamp(P.stretchH ?? 15, 3, h - 4);
  const t = P.legT ?? 4;
  const sq = st === 'lurus' || st === 'runcing';
  const r = st === 'logam' ? Math.max(0.5, t * 0.16) : t * 0.28;
  const at = (x, z) => legAt(x, z, y);
  const rail = (a, c, n) => b.rod(slot, n, a, c, r, r, sq ? 4 : 14);
  if (kind === 'rak') {
    const p = at(hx, hz);
    b.boxY('utama', 'Rak bawah', Math.abs(p[0]) * 2 + t * 0.4, 2, Math.abs(p[2]) * 2 + t * 0.4, 0, y, 0, { r: 0.3 });
    return;
  }
  // side rails
  rail(at(-hx, -hz), at(-hx, hz), 'Penguat samping');
  rail(at(hx, -hz), at(hx, hz), 'Penguat samping');
  if (kind === 'h') rail([at(-hx, 0)[0], y, 0], [at(hx, 0)[0], y, 0], 'Penguat tengah');
  if (kind === 'kotak') {
    rail(at(-hx, -hz), at(hx, -hz), 'Penguat belakang');
    rail(at(-hx, hz), at(hx, hz), 'Penguat depan');
  }
}

/** Radial legs (stools, round side tables). Top ring radius rr at y = h. */
export function radialLegs(b, P, n, rr, h) {
  n = Math.max(3, Math.round(n));
  const st = P.legStyle || 'bulat', t = P.legT ?? 3.5, taper = P.legTaper ?? 0.2;
  const splay = rad(P.legSplay ?? 6), off = h * Math.tan(splay);
  if (st === 'pedestal') { pedestal(b, P, rr * 2.6, h); return; }
  const slot = METAL_LEGS.has(st) || st === 'logam' ? 'aksen' : 'sekunder';
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (n === 4 ? Math.PI / 4 : Math.PI / 2);
    const c = Math.cos(a), s = Math.sin(a);
    const top = [c * rr, h, s * rr], bot = [c * (rr + off), 0, s * (rr + off)];
    pts.push([c, s]);
    if (st === 'logam') b.rod(slot, 'Kaki', top, bot, Math.max(0.6, t * 0.22), Math.max(0.6, t * 0.22), 14);
    else if (st === 'lurus' || st === 'runcing') b.rod(slot, 'Kaki', top, bot, t / 2, (t / 2) * (st === 'runcing' ? 1 - Math.max(0.2, taper) : 1), 4);
    else if (st === 'bubut') b.lathe(slot, 'Kaki bubut', TURNED.map(([r, y]) => [r * t / 2, y * h]), top[0], 0, top[2], 18);
    else b.rod(slot, 'Kaki', top, bot, t / 2, (t / 2) * (1 - (st === 'mid' ? Math.max(0.4, taper) : taper)), 20);
  }
  const fr = P.footrest || 'tanpa';
  if (fr !== 'tanpa' && st !== 'bubut') {
    const y = clamp(P.footH ?? 25, 5, h - 6);
    const R = rr + off * (1 - y / h);
    const ms = fr === 'cincin' ? 'aksen' : slot;
    if (fr === 'cincin') b.torus(ms, 'Cincin pijakan', R, 0.8, 0, y, 0, [Math.PI / 2, 0, 0]);
    else for (let i = 0; i < n; i++) {
      const [c1, s1] = pts[i], [c2, s2] = pts[(i + 1) % n];
      b.rod(ms, 'Palang pijakan', [c1 * R, y, s1 * R], [c2 * R, y, s2 * R], t * 0.25, t * 0.25, st === 'lurus' || st === 'runcing' ? 4 : 12);
    }
  }
}

/** Aprons (rails under a top) between legs. */
export function apron(b, hx, hz, yTop, ah, t, slot = 'utama', inset = 0.6) {
  const at = 2;
  b.boxY(slot, 'Apron depan', hx * 2 - t, ah, at, 0, yTop - ah, hz + t / 2 - at / 2 - inset);
  b.boxY(slot, 'Apron belakang', hx * 2 - t, ah, at, 0, yTop - ah, -hz - t / 2 + at / 2 + inset);
  b.boxY(slot, 'Apron samping', at, ah, hz * 2 - t, -hx - t / 2 + at / 2 + inset, yTop - ah, 0);
  b.boxY(slot, 'Apron samping', at, ah, hz * 2 - t, hx + t / 2 - at / 2 - inset, yTop - ah, 0);
}

export const HANDLE_LABELS = { bar: 'Batang', knob: 'Kenop', tab: 'Tab tipis', cekung: 'Alur cekung', ring: 'Cincin', kulit: 'Tali kulit', tanpa: 'Tanpa (push)' };

/** Handle on a front surface at z = zf. vertical = orientation for doors. */
export function handle(b, P, cx, cy, zf, vertical = false, maxLen = 30) {
  const st = P.handle || 'bar';
  const len = Math.min(P.handleLen ?? 12, maxLen);
  const s = 'aksen';
  if (st === 'tanpa') return;
  if (st === 'knob') {
    b.cyl(s, 'Kenop', 0.5, 0.6, 1.6, cx, cy, zf + 0.8, 10, { rot: [Math.PI / 2, 0, 0] });
    b.sphere(s, 'Kenop', 1.5, cx, cy, zf + 2.2, 16, { scale: [1, 1, 0.7] });
    return;
  }
  if (st === 'ring') {
    b.cyl(s, 'Dudukan cincin', 1.2, 1.2, 0.5, cx, cy, zf + 0.25, 16, { rot: [Math.PI / 2, 0, 0] });
    b.torus(s, 'Cincin', 2, 0.25, cx, cy - 2, zf + 0.75, [0, 0, 0]);
    return;
  }
  const dx = vertical ? 0 : len / 2, dy = vertical ? len / 2 : 0;
  if (st === 'bar') {
    const off = 2.8;
    b.rod(s, 'Gagang', [cx - dx, cy - dy, zf + off], [cx + dx, cy + dy, zf + off], 0.55, 0.55, 12);
    const px = vertical ? 0 : len / 2 - 1.2, py = vertical ? len / 2 - 1.2 : 0;
    b.rod(s, 'Tiang gagang', [cx - px, cy - py, zf], [cx - px, cy - py, zf + off], 0.45, 0.45, 10);
    b.rod(s, 'Tiang gagang', [cx + px, cy + py, zf], [cx + px, cy + py, zf + off], 0.45, 0.45, 10);
  } else if (st === 'tab') {
    if (vertical) b.box(s, 'Tab', 0.35, len, 3, cx, cy, zf + 1.5);
    else b.box(s, 'Tab', len, 0.35, 3, cx, cy, zf + 1.5);
  } else if (st === 'cekung') {
    if (vertical) b.box('gelap', 'Alur', 1.6, len, 0.2, cx, cy, zf + 0.1, { r: 0.09 });
    else b.box('gelap', 'Alur', len, 1.6, 0.2, cx, cy, zf + 0.1, { r: 0.09 });
  } else if (st === 'kulit') {
    if (vertical) b.tube('kain', 'Tali kulit', [[cx, cy - len / 2, zf], [cx, cy - len / 2 + 0.5, zf + 2.5], [cx, cy + len / 2 - 0.5, zf + 2.5], [cx, cy + len / 2, zf]], 0.5, 1.5);
    else b.tube('kain', 'Tali kulit', [[cx - len / 2, cy, zf], [cx - len / 2 + 0.5, cy, zf + 2.5], [cx + len / 2 - 0.5, cy, zf + 2.5], [cx + len / 2, cy, zf]], 0.5, 1.5);
    b.sphere(s, 'Paku', 0.6, cx + (vertical ? 0 : -len / 2), cy + (vertical ? -len / 2 : 0), zf + 0.3, 8);
    b.sphere(s, 'Paku', 0.6, cx + (vertical ? 0 : len / 2), cy + (vertical ? len / 2 : 0), zf + 0.3, 8);
  }
}

export const FRONT_LABELS = { polos: 'Polos', shaker: 'Shaker (bingkai)', bilah: 'Bilah / fluted', louvre: 'Kisi (louvre)', kaca: 'Kaca', cermin: 'Cermin', rotan: 'Anyaman rotan' };

/** Door / drawer front with its back face at z0, centred on cx, cy. */
export function front(b, style, w, h, t, cx, cy, z0, slot = 'utama') {
  const gap = 0.3; w -= gap; h -= gap;
  if (w < 1 || h < 1) return;
  const zc = z0 + t / 2;
  if (style === 'polos' || !style) { b.box(slot, 'Muka', w, h, t, cx, cy, zc, { r: 0.25 }); return; }
  if (style === 'bilah') {
    b.box(slot, 'Muka dasar', w, h, t * 0.5, cx, cy, z0 + t * 0.25);
    const n = Math.max(2, Math.round(w / 3.2)), sw = w / n;
    for (let i = 0; i < n; i++) b.box(slot, 'Bilah', sw - 0.25, h, t * 0.5, cx - w / 2 + sw * (i + 0.5), cy, z0 + t * 0.75, { r: Math.min(sw * 0.45, t * 0.24) });
    return;
  }
  const f = clamp(Math.min(w, h) * 0.16, 2.5, 7);
  // frame
  b.box(slot, 'Rangka muka', f, h, t, cx - w / 2 + f / 2, cy, zc, { r: 0.2 });
  b.box(slot, 'Rangka muka', f, h, t, cx + w / 2 - f / 2, cy, zc, { r: 0.2 });
  b.box(slot, 'Rangka muka', w - 2 * f, f, t, cx, cy + h / 2 - f / 2, zc);
  b.box(slot, 'Rangka muka', w - 2 * f, f, t, cx, cy - h / 2 + f / 2, zc);
  const iw = w - 2 * f, ih = h - 2 * f;
  if (style === 'shaker') b.box(slot, 'Panel tengah', iw, ih, t * 0.45, cx, cy, z0 + t * 0.3);
  else if (style === 'kaca') b.box('kaca', 'Panel kaca', iw, ih, 0.5, cx, cy, z0 + t * 0.5);
  else if (style === 'cermin') b.box('cermin', 'Cermin', iw, ih, 0.5, cx, cy, z0 + t * 0.55);
  else if (style === 'rotan') b.box('kain', 'Anyaman', iw, ih, 0.4, cx, cy, z0 + t * 0.5);
  else if (style === 'louvre') {
    const n = Math.max(3, Math.round(ih / 3.4)), sh = ih / n;
    for (let i = 0; i < n; i++) b.box(slot, 'Kisi', iw, sh * 1.05, 0.6, cx, cy - ih / 2 + sh * (i + 0.5), z0 + t * 0.5, { rot: [-0.6, 0, 0] });
  }
}

/** Drawer: front + box, slid out by `open` (0..1) of its depth. */
export function drawer(b, P, w, h, depth, cx, cy, z0, open = 0, style) {
  const ft = P.frontT ?? 1.8;
  const out = open * depth * 0.75;
  b.group('Laci', cx, cy, z0 + out, () => {
    front(b, style ?? P.frontStyle, w, h, ft, 0, 0, 0);
    const bw = w - 3.5, bh = Math.max(3, h - 5), bd = depth - 3;
    b.boxY('utama', 'Sisi laci', 1.2, bh, bd, -bw / 2 + 0.6, -h / 2 + 1.5, -bd / 2);
    b.boxY('utama', 'Sisi laci', 1.2, bh, bd, bw / 2 - 0.6, -h / 2 + 1.5, -bd / 2);
    b.boxY('utama', 'Belakang laci', bw - 2.4, bh, 1.2, 0, -h / 2 + 1.5, -bd + 0.6);
    b.boxY('utama', 'Dasar laci', bw - 2.4, 0.6, bd - 0.2, 0, -h / 2 + 1.5, -bd / 2);
    handle(b, P, 0, (P.handle === 'tab' ? h / 2 - 0.3 : 0), ft, false, w * 0.6);
  });
}

/** Hinged door. hingeX is the hinge edge; dir = +1 door extends to +x, -1 to -x. */
export function door(b, P, hingeX, cy, w, h, z0, dir, open = 0, style) {
  const ft = P.frontT ?? 1.8;
  b.group('Pintu', hingeX, cy, z0, (g) => {
    g.rotation.y = -dir * rad(open * 105);
    front(b, style ?? P.frontStyle, w, h, ft, dir * w / 2, 0, 0);
    handle(b, P, dir * (w - 3.5), 0, ft, true, Math.min(h * 0.6, 60));
  });
}

/** Open-front carcass. Returns inner extents. Body sits from y0 to y0 + h, centred on x, z. */
export function carcass(b, w, h, d, y0, t, o = {}) {
  const ov = o.over ?? 0, slot = o.slot || 'utama';
  b.boxY(slot, 'Sisi kiri', t, h - (o.topOn ? 0 : t), d, -w / 2 + t / 2, y0, 0);
  b.boxY(slot, 'Sisi kanan', t, h - (o.topOn ? 0 : t), d, w / 2 - t / 2, y0, 0);
  if (o.top !== false) b.boxY(o.topSlot || slot, 'Atas', w + ov * 2, o.topT ?? t, d + ov, 0, y0 + h - (o.topOn ? 0 : t), ov / 2, { r: o.topR ?? 0.2 });
  b.boxY(slot, 'Bawah', w - t * 2, t, d - 0.8, 0, y0, 0.4);
  if (o.back !== false) b.boxY(slot, 'Panel belakang', w - t * 2, h - t * 2, 0.8, 0, y0 + t, -d / 2 + 0.4);
  return { x0: -w / 2 + t, x1: w / 2 - t, y0: y0 + t, y1: y0 + h - t, z0: -d / 2 + 0.8, z1: d / 2 };
}

export { V };
