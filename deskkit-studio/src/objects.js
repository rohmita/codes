// DeskKit Studio 3D — parametric desk-organizer recipes
import { MeshBuf, rrect, rpoly, circle, prism, extrude, triCap, clamp, manifoldCheck, orientShells, loopsCross, pointIn, sampleLoop, area2 } from './geom.js';

const DEG = Math.PI / 180;
export const DENSITY = { 'PLA': 1.24, 'PETG': 1.27, 'ABS / ASA': 1.04, 'Silk PLA': 1.24, 'Wood PLA': 1.15 };

// ---------------------------------------------------------------- helpers
function lv(y0, y1, breaks, step) {
  const a = [y0, y1, ...breaks.filter(v => v > y0 && v < y1)];
  const n = Math.max(1, Math.ceil((y1 - y0) / step));
  for (let i = 1; i < n; i++) a.push(y0 + (y1 - y0) * i / n);
  a.sort((p, q) => p - q);
  const out = [];
  for (const v of a) if (!out.length || v - out[out.length - 1] > 0.01) out.push(v);
  out[out.length - 1] = y1;
  if (out.length > 2 && out[out.length - 1] - out[out.length - 2] < 0.01) out.splice(out.length - 2, 1);
  return out;
}
const scoopIns = (y, floor, rs) => { if (rs <= 0) return 0; const q = floor + rs - y; return q <= 0 ? 0 : rs - Math.sqrt(Math.max(rs * rs - q * q, 0)); };
const scoopBreaks = (floor, rs) => { const b = []; if (rs > 0) for (let i = 1; i <= 8; i++) b.push(floor + rs * (1 - Math.cos(Math.PI / 2 * i / 8))); return b; };
const lipIns = (y, top, c) => -Math.max(0, c - (top - y));            // pocket mouth chamfer (expands upward)
const chamB = (y, y0, c) => Math.max(0, c - (y - y0));                  // bottom (elephant-foot) chamfer
const chamT = (y, top, c) => Math.max(0, c - (top - y));                // outer top chamfer
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function part(name, M, asm, print, extra = {}) {
  if (!M._vols) { M._vols = orientShells(M); M._man = manifoldCheck(M); M._area = surfaceArea(M); }
  return { name, mesh: M, asm, print, volume: M._vols.reduce((a, b) => a + b, 0), area: M._area, manifold: M._man, ...extra };
}
function surfaceArea(M) {
  const P = M.pos, I = M.idx; let a = 0;
  for (let i = 0; i < I.length; i += 3) {
    const p = 3 * I[i], q = 3 * I[i + 1], r = 3 * I[i + 2];
    const ux = P[q] - P[p], uy = P[q + 1] - P[p + 1], uz = P[q + 2] - P[p + 2], vx = P[r] - P[p], vy = P[r + 1] - P[p + 1], vz = P[r + 2] - P[p + 2];
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
}
// printed material: ~1.2 mm of solid skin (3 perimeters / top-bottom layers) + infill inside
export function printedVolume(parts, infill) {
  let v = 0;
  for (const p of parts) { const skin = Math.min(p.volume, p.area * 1.2 / 2 * 1.0); v += skin + Math.max(0, p.volume - skin) * infill / 100; }
  return v;
}

// pockets inside outer, disjoint and simple at a few heights
function checkPrism(outer, pockets, ys, warn, label) {
  for (const y of ys) {
    const O = sampleLoop(outer, y);
    if (loopsCross(O, O)) { warn.push(`${label}: outline self-intersects at ${y.toFixed(1)} mm`); return false; }
    const L = pockets.filter(p => y >= p.floor - 1e-6).map(p => sampleLoop(p, y));
    for (let i = 0; i < L.length; i++) {
      if (loopsCross(L[i], L[i]) || loopsCross(O, L[i]) || !pointIn(L[i][0], O)) { warn.push(`${label}: a pocket breaks through the wall at ${y.toFixed(1)} mm`); return false; }
      for (let j = i + 1; j < L.length; j++) if (loopsCross(L[i], L[j]) || pointIn(L[i][0], L[j]) || pointIn(L[j][0], L[i])) { warn.push(`${label}: pockets overlap at ${y.toFixed(1)} mm`); return false; }
    }
  }
  return true;
}

// does a closed loop keep at least `gap` mm of material to the outer loop (all points inside)?
function keepsWall(L, O, gap) {
  for (const p of L) {
    if (!pointIn(p, O)) return false;
    for (let i = 0; i < O.length; i++) {
      const a = O[i], b = O[(i + 1) % O.length], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1e-12;
      const t = clamp(((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2, 0, 1);
      if (Math.hypot(a[0] + t * ex - p[0], a[1] + t * ez - p[1]) < gap) return false;
    }
  }
  return true;
}
// exact: an inner corner (radius rIn, wall `wall` from both sides) keeps >= 1 mm to an outer corner of radius r
const maxCornerFor = (wall, rIn) => Math.max(0.5, (Math.SQRT2 * wall + (Math.SQRT2 - 1) * rIn - 1.0) / (Math.SQRT2 - 1));

// thin vertical plate following a cavity loop: chord along direction d through point c
function plateLoopsFn(cavity, c, d, half, ov, radial) {
  const px = -d[1], pz = d[0];
  return y => {
    const L = sampleLoop(cavity, y);
    let lo = -Infinity, hi = Infinity;
    for (const o of [-half, 0, half]) {
      const ox = c[0] + px * o, oz = c[1] + pz * o;
      let tmin = Infinity, tmax = -Infinity;
      for (let i = 0; i < L.length; i++) {
        const a = L[i], b = L[(i + 1) % L.length], ex = b[0] - a[0], ez = b[1] - a[1], den = d[0] * ez - d[1] * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((a[0] - ox) * ez - (a[1] - oz) * ex) / den, s = ((a[0] - ox) * d[1] - (a[1] - oz) * d[0]) / den;
        if (s >= 0 && s <= 1) { tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
      }
      lo = Math.max(lo, radial ? -half * 1.5 : tmin); hi = Math.min(hi, tmax);
    }
    lo = radial ? lo : lo - ov; hi += ov;
    const P = (s, o) => [c[0] + d[0] * s + px * o, c[1] + d[1] * s + pz * o];
    return [P(lo, -half), P(hi, -half), P(hi, half), P(lo, half)];
  };
}
function plateShell(M, name, fn, ys) {
  const shape = { n: 4, at: (i, y) => fn(y)[i] };
  prism(M, { name, y0: ys[0], levels: ys, outer: shape, pockets: [], tagOuter: 0 });
}

// ======================================================================= 1. PEN CUP
function penCup(P, W) {
  const R = P.cupDiameter / 2, H = P.cupHeight;
  const wall = clamp(P.cupWall, 1.2, R * 0.3), floor = clamp(P.cupFloor, 1.2, H * 0.25);
  const segs = clamp(Math.round(P.curveSegs / 8), 3, 16);
  const shapeKind = P.cupShape;
  const N = { hexagon: 6, square: 4, octagon: 8 }[shapeKind];
  const flower = shapeKind === 'flower';
  const lobeD = flower ? clamp(P.fluteDepth, 0.5, R * 0.15) : 0;
  const base = N ? rpoly(N, R, clamp(P.cupCorner, 0.6, R * 0.6), segs, Math.PI / 2, Math.max(2, Math.round(P.curveSegs / N / 2)))
    : circle(0, 0, R, clamp(P.curveSegs * 2, 48, 256), flower ? Math.round(P.flutes) || 8 : 0, lobeD);
  const pocketBase = flower ? circle(0, 0, R - lobeD, base.n) : base;
  const taper = clamp(P.taper, 0.7, 1.3), twist = P.twist * DEG;
  const flutes = flower ? 0 : Math.round(P.flutes), fd = flower ? 0 : P.fluteDepth;
  const slant = clamp(P.slant, 0, 40) * DEG;
  let topFn = null, minTop = H;
  if (slant > 0) {
    const reach = R * Math.max(1, taper);
    let drop = Math.tan(slant) * 2 * reach;
    const maxDrop = H - floor - 20;
    if (drop > maxDrop) { drop = Math.max(0, maxDrop); W.push('Slanted rim limited so the front stays at least 20 mm above the floor.'); }
    const k = drop / (2 * reach);
    topFn = (x, z) => H - k * (z + reach);
    minTop = H - drop;
  }
  const cb = clamp(P.bottomChamfer, 0, 2), tc = topFn ? 0 : clamp(P.topChamfer, 0, wall * 0.4), lc = topFn ? 0 : Math.min(0.6, wall * 0.3);
  const yS = topFn ? minTop - 1 : H;
  const sc = y => 1 + (taper - 1) * y / H, rot = y => twist * Math.min(y, yS) / H;
  const xf = (p, y) => { const s = sc(y), a = rot(y), x = p[0] * s, z = p[1] * s; return [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)]; };
  const outer = {
    n: base.n,
    at(i, y) {
      const s = sc(y);
      let p = base.pt(i, (chamB(y, 0, cb) + chamT(y, H, tc)) / s);
      if (flutes && fd > 0) { const th = Math.atan2(p[1], p[0]), r = Math.hypot(p[0], p[1]), r2 = r + fd * (1 + Math.cos(flutes * th)) / 2 * Math.min(1, (y + 0.001) / Math.max(cb, 0.001)); p = [p[0] * r2 / r, p[1] * r2 / r]; }
      return xf(p, y);
    },
  };
  const rs = clamp(P.cupScoop, 0, R * 0.5);
  const pocket = {
    n: pocketBase.n, floor, tag: 1,
    at(i, y) { const s = sc(y); return xf(pocketBase.pt(i, (wall + scoopIns(y, floor, rs) + lipIns(y, H, lc)) / s), y); },
  };
  const step = Math.min(H / clamp(P.heightSegs, 8, 200), twist ? 1.5 : 50);
  const L = lv(0, yS, [cb, floor, H - tc, H - lc, ...scoopBreaks(floor, rs)], step);
  pocket.levels = lv(floor, yS, [...scoopBreaks(floor, rs), H - lc], step);
  checkPrism(outer, [pocket], [floor + 0.2, (floor + yS) / 2, yS], W, 'Cup');
  const M = new MeshBuf();
  prism(M, { name: 'cup', y0: 0, levels: L, top: topFn, band: 8, outer, pockets: [pocket] });
  // dividers
  const div = P.cupDivider;
  const divTop = minTop - 12;
  if (div !== 'none' && divTop > floor + 10) {
    const ys = lv(floor - 0.3, divTop, [floor, ...scoopBreaks(floor, rs)], 4);
    const cav = { n: pocket.n, at: (i, y) => pocket.at(i, Math.max(y, floor)) };
    const half = 0.8, ov = Math.min(0.6, wall * 0.4);
    const dirs = div === 'half' ? [[[0, 0], [1, 0], false]] : div === 'cross' ? [[[0, 0], [1, 0], false], [[0, 0], [0, 1], false]]
      : [0, 1, 2].map(k => [[0, 0], [Math.cos(Math.PI / 2 + k * 2 * Math.PI / 3), Math.sin(Math.PI / 2 + k * 2 * Math.PI / 3)], true]);
    for (const [c, d, radial] of dirs) plateShell(M, 'divider', plateLoopsFn(cav, c, d, half, ov, radial), ys);
  }
  // capacity
  let cap = 0, prevA = null, prevY = 0;
  for (const y of pocket.levels) { if (y > minTop) break; const A = Math.abs(area2(sampleLoop(pocket, y))); if (prevA !== null) cap += (A + prevA) / 2 * (y - prevY); prevA = A; prevY = y; }
  // reference pens
  const refs = [];
  const rIn = (R - wall) * Math.min(1, taper) - 6;
  const nPens = clamp(Math.round(rIn / 4), 1, 9);
  for (let k = 0; k < nPens; k++) {
    const a = k * 2.399, r = k ? rIn * Math.sqrt(k / nPens) : 0;
    refs.push({ kind: 'cyl', r: 4.5, h: 145, pos: [r * Math.cos(a), floor + 72.5, r * Math.sin(a)], rot: [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12] });
  }
  return { parts: [part('Pen cup', M, { p: [0, 0, 0] }, { r: [0, 0, 0] })], refs, capacity: cap / 1000 };
}

// ======================================================================= 2. COMPARTMENT TRAY
function trayCells(layout, cols, rows, Wi, Di, t) {
  const cells = [];
  const grid = (x0, x1, z0, z1, c, r) => {
    const cw = (x1 - x0 - (c - 1) * t) / c, rd = (z1 - z0 - (r - 1) * t) / r;
    for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) cells.push({ x0: x0 + i * (cw + t), x1: x0 + i * (cw + t) + cw, z0: z0 + j * (rd + t), z1: z0 + j * (rd + t) + rd });
  };
  const X0 = -Wi / 2, X1 = Wi / 2, Z0 = -Di / 2, Z1 = Di / 2;
  if (layout === 'wide-left' && cols >= 2) { const wl = (Wi - t) * 0.38; cells.push({ x0: X0, x1: X0 + wl, z0: Z0, z1: Z1 }); grid(X0 + wl + t, X1, Z0, Z1, cols - 1, rows); }
  else if (layout === 'wide-back' && rows >= 2) { const db = (Di - t) * 0.4; cells.push({ x0: X0, x1: X1, z0: Z0, z1: Z0 + db }); grid(X0, X1, Z0 + db + t, Z1, cols, rows - 1); }
  else if (layout === 'trough-front') { const df = Math.min(30, (Di - t) * 0.3); cells.push({ x0: X0, x1: X1, z0: Z1 - df, z1: Z1 }); grid(X0, X1, Z0, Z1 - df - t, cols, Math.max(1, rows - 1)); }
  else grid(X0, X1, Z0, Z1, cols, rows);
  return cells;
}
function rrExtent(w, d, r, u) { // half-extent along z of a centred rounded rect at x = u
  const ax = Math.abs(u); if (ax >= w / 2) return 0;
  if (ax <= w / 2 - r) return d / 2;
  const q = ax - (w / 2 - r); return d / 2 - r + Math.sqrt(Math.max(r * r - q * q, 0));
}
function tray(P, W) {
  const Wd = P.trayWidth, D = P.trayDepth, H = P.trayHeight;
  const wall = clamp(P.trayWall, 1.2, Math.min(Wd, D) * 0.15), floor = clamp(P.trayFloor, 1.2, H * 0.4);
  const rc = clamp(P.trayCorner, 0.5, Math.min(Wd, D) * 0.4), segs = clamp(Math.round(P.curveSegs / 8), 3, 16);
  const cb = clamp(P.bottomChamfer, 0, 2), tc = clamp(P.topChamfer, 0, wall * 0.4), lc = Math.min(0.6, wall * 0.3);
  const t = clamp(P.trayDivider, 1.0, 6);
  const lcT = Math.min(lc, t * 0.3);
  const Wi = Wd - 2 * wall, Di = D - 2 * wall;
  let cols = clamp(Math.round(P.trayCols), 1, 8), rows = clamp(Math.round(P.trayRows), 1, 8);
  while (cols > 1 && (Wi - (cols - 1) * t) / cols < 12) cols--;
  while (rows > 1 && (Di - (rows - 1) * t) / rows < 12) rows--;
  if (cols < P.trayCols || rows < P.trayRows) W.push(`Compartments reduced to ${cols} × ${rows} (minimum 12 mm per cell).`);
  const cells = trayCells(P.trayLayout, cols, rows, Wi, Di, t);
  const slab0 = P.trayDividerHeight < 0.999;
  let rcEff = rc;
  if (!slab0) {
    const near = (v, w) => Math.abs(v - w) < 1e-6;
    for (const c of cells) {
      const corner = (near(c.x0, -Wi / 2) || near(c.x1, Wi / 2)) && (near(c.z0, -Di / 2) || near(c.z1, Di / 2));
      if (corner) rcEff = Math.min(rcEff, wall + Math.min(c.x1 - c.x0, c.z1 - c.z0) / 2 - 0.6);
    }
    rcEff = Math.max(0.5, rcEff);
    if (rcEff < rc - 0.05) W.push(`Outer corner radius limited to ${rcEff.toFixed(1)} mm by the corner compartments.`);
  }
  const body = rrect(0, 0, Wd, D, rcEff, segs);
  const outer = { n: body.n, at: (i, y) => body.pt(i, chamB(y, 0, cb) + chamT(y, H, tc)) };
  const rs = clamp(P.trayScoop, 0, (H - floor) * 0.6);
  const slab = P.trayDividerHeight < 0.999;
  const pockets = [];
  const mkPocket = (cx, cz, w, d, r) => {
    const sh = rrect(cx, cz, w, d, r, segs);
    const rsc = Math.max(0, Math.min(rs, Math.min(w, d) / 2 - 0.6));
    const pk = { n: sh.n, floor, tag: 1, at: (i, y) => sh.pt(i, scoopIns(y, floor, rsc) + lipIns(y, H, lcT)) };
    pk.levels = lv(floor, H, [...scoopBreaks(floor, rsc), H - lcT], 50);
    return pk;
  };
  let cap = 0;
  if (slab) {
    const ri = Math.max(rc - wall, 0.8);
    pockets.push(mkPocket(0, 0, Wi, Di, ri));
    cap = Wi * Di * (H - floor);
  } else {
    const near = (v, w) => Math.abs(v - w) < 1e-6;
    for (const c of cells) {
      const w = c.x1 - c.x0, d = c.z1 - c.z0, lim = Math.min(w, d) / 2 - 0.4, pr = clamp(P.trayPocketRadius, 0.6, lim);
      const cc = Math.min(lim, Math.max(pr, rcEff - wall));   // concentric with the outer corner
      const radii = [near(c.x1, Wi / 2) && near(c.z1, Di / 2) ? cc : pr, near(c.x0, -Wi / 2) && near(c.z1, Di / 2) ? cc : pr,
        near(c.x0, -Wi / 2) && near(c.z0, -Di / 2) ? cc : pr, near(c.x1, Wi / 2) && near(c.z0, -Di / 2) ? cc : pr];
      pockets.push(mkPocket((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, w, d, radii));
      cap += w * d * (H - floor);
    }
  }
  // under-floor recesses (rubber feet / magnets)
  const under = [];
  if (P.trayFeet !== 'none') {
    const [dia, dep] = P.trayFeet === 'magnets 6x2' ? [6.3, 2.2] : [10.4, 1.2];
    if (floor - dep < 0.8) W.push(`Floor too thin for ${P.trayFeet} recesses (needs ≥ ${(dep + 0.8).toFixed(1)} mm) — recesses omitted.`);
    else {
      const m = Math.max(dia / 2 + 3, rc * 0.45 + dia / 2 + 1.5);
      for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const ci = circle(sx * (Wd / 2 - m), sz * (D / 2 - m), dia / 2, 32);
        under.push({ n: ci.n, depth: dep, at: (i, y) => ci.pt(i, 0) });
      }
    }
  }
  const L = lv(0, H, [cb, floor, H - tc], 50);
  checkPrism(outer, pockets, [floor + 0.2, (floor + H) / 2, H - 0.05], W, 'Tray');
  const M = new MeshBuf();
  prism(M, { name: 'tray', y0: 0, levels: L, outer, pockets, under });
  if (slab) {
    const top = floor + (H - floor) * clamp(P.trayDividerHeight, 0.2, 1);
    const ri = Math.max(rc - wall, 0.8);
    const done = new Set();
    for (const a of cells) for (const b of cells) {
      if (a === b) continue;
      let rect = null;
      if (Math.abs(a.x1 + t - b.x0) < 1e-6) { const z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1); if (z1 > z0 + 1) rect = { x0: a.x1, x1: b.x0, z0, z1, axis: 'z' }; }
      if (Math.abs(a.z1 + t - b.z0) < 1e-6) { const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1); if (x1 > x0 + 1) rect = { x0, x1, z0: a.z1, z1: b.z0, axis: 'x' }; }
      if (!rect) continue;
      const key = [rect.x0, rect.x1, rect.z0, rect.z1].map(v => v.toFixed(3)).join();
      if (done.has(key)) continue; done.add(key);
      // extend through junctions; into the outer wall where the plate meets it
      if (rect.axis === 'z') {
        const xm = (rect.x0 + rect.x1) / 2, ext = rrExtent(Wi, Di, ri, xm), extO = rrExtent(Wd, D, rcEff, xm);
        const into = Math.min(0.6, extO - ext - 0.5);
        rect.z0 = rect.z0 <= -Di / 2 + 1e-6 ? -ext - into : rect.z0 - t; rect.z1 = rect.z1 >= Di / 2 - 1e-6 ? ext + into : rect.z1 + t;
      } else {
        const zm = (rect.z0 + rect.z1) / 2, ext = rrExtent(Di, Wi, ri, zm), extO = rrExtent(D, Wd, rcEff, zm);
        const into = Math.min(0.6, extO - ext - 0.5);
        rect.x0 = rect.x0 <= -Wi / 2 + 1e-6 ? -ext - into : rect.x0 - t; rect.x1 = rect.x1 >= Wi / 2 - 1e-6 ? ext + into : rect.x1 + t;
      }
      const pl = rrect((rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2, rect.x1 - rect.x0, rect.z1 - rect.z0, 0.2, 1);
      prism(M, { name: 'divider', y0: floor - 0.3, levels: [floor - 0.3, top], outer: { n: pl.n, at: i => pl.pt(i, 0) }, pockets: [] });
      cap -= (rect.x1 - rect.x0) * (rect.z1 - rect.z0) * (top - floor) * 0.9;
    }
  }
  return { parts: [part('Tray', M, { p: [0, 0, 0] }, { r: [0, 0, 0] })], refs: [], capacity: cap / 1000 };
}

// ======================================================================= 3. STEPPED PEN BLOCK
function penBlock(P, W) {
  const n = clamp(Math.round(P.blockTiers), 1, 4), Wd = P.blockWidth, td = P.tierDepth;
  const h0 = P.blockBaseHeight, step = P.blockStep, floor = 2.4, wallMin = 1.6;
  const rc = clamp(P.blockCorner, 0.5, Math.min(Wd, td) * 0.45), segs = clamp(Math.round(P.curveSegs / 8), 3, 16);
  const cb = clamp(P.bottomChamfer, 0, 2), tc = clamp(P.topChamfer, 0, 1.5);
  const Dt = n * td;
  const parts = [], refs = [];
  let cap = 0;
  const M = new MeshBuf();
  for (let i = 0; i < n; i++) {
    const h = h0 + i * step;
    const zf = Dt / 2 - i * td, zb = zf - td - (i < n - 1 ? 0.3 : 0);
    const radii = [i === 0 ? rc : 0.15, i === 0 ? rc : 0.15, i === n - 1 ? rc : 0.15, i === n - 1 ? rc : 0.15];
    const sh = rrect(0, (zf + zb) / 2, Wd, zf - zb, radii, segs);
    const outer = { n: sh.n, at: (k, y) => { const b = chamB(y, 0, cb), t = chamT(y, h, tc); return sh.pt(k, { r: b + t, l: b + t, f: b + t, b: i === n - 1 ? b + t : 0 }); } };
    const zc = Dt / 2 - i * td - td / 2;
    const pockets = [];
    const type = i === 0 && n > 1 ? P.frontTier : (i === 0 && n === 1 ? P.frontTier : 'holes');
    if (type === 'tray') {
      const w = Wd - 2 * 2.4, d = td - 2 * 2.4, lim = Math.min(w, d) / 2 - 0.5, r = Math.min(4, lim);
      const rf = i === 0 ? Math.min(lim, Math.max(r, rc - 2.4)) : r, rb = i === n - 1 ? Math.min(lim, Math.max(r, rc - 2.4)) : r;
      const ps = rrect(0, zc, w, d, [rf, rf, rb, rb], segs), rs = Math.max(0, Math.min(5, d / 2 - 1, h - floor - 2));
      const pk = { n: ps.n, floor, tag: 1, at: (k, y) => ps.pt(k, scoopIns(y, floor, rs) + lipIns(y, h, 0.6)) };
      pk.levels = lv(floor, h, [...scoopBreaks(floor, rs), h - 0.6], 50);
      pockets.push(pk); cap += w * d * (h - floor);
    } else if (type === 'phone-slot') {
      const sw = Math.min(Wd - 2 * 3, 92), sT = 13;
      let tilt = 14 * DEG;
      const room = td - sT - 2 * 3;
      if (Math.tan(tilt) * (h - floor) > room) tilt = Math.atan(Math.max(0, room) / (h - floor));
      const z0 = zc + (Math.tan(tilt) * (h - floor)) / 2;
      let swf = sw;
      const slotAt = (w, y) => { const r = rrect(0, 0, w, sT, 2, segs), out = []; for (let k = 0; k < r.n; k++) { const p = r.pt(k, -0.6); out.push([p[0], p[1] + z0 - Math.tan(tilt) * (y - floor)]); } return out; };
      while (swf > 20 && !(keepsWall(slotAt(swf, floor), sampleLoop(outer, floor), 1.6) && keepsWall(slotAt(swf, h), sampleLoop(outer, h), 1.6))) swf -= 4;
      if (swf < sw) W.push(`Phone slot narrowed to ${swf.toFixed(0)} mm to keep its walls.`);
      const ps = rrect(0, 0, swf, sT, 2, segs);
      const pk = { n: ps.n, floor, tag: 1, at: (k, y) => { const p = ps.pt(k, lipIns(y, h, 0.6)); return [p[0], p[1] + z0 - Math.tan(tilt) * (y - floor)]; } };
      pk.levels = lv(floor, h, [h - 0.6], 4);
      pockets.push(pk); cap += sw * sT * (h - floor);
      refs.push({ kind: 'box', size: [75, 150, 9], pos: [0, floor + 75 * Math.cos(tilt), z0 - Math.tan(tilt) * 75 * Math.cos(tilt)], rot: [-tilt, 0, 0] });
    } else {
      let dia = clamp(P.holeDia, 6, 40);
      const cnt = clamp(Math.round(P.holesPerTier), 1, 12);
      let rowsN = P.holeRows === 'staggered' && td >= 2 * dia + 3 * wallMin ? 2 : 1;
      if (P.holeRows === 'staggered' && rowsN === 1) W.push('Tier too shallow for staggered holes — single row used.');
      const pitch = (Wd - 2 * wallMin) / cnt;
      if (dia > pitch - wallMin) { dia = pitch - wallMin; W.push(`Hole Ø reduced to ${dia.toFixed(1)} mm to fit ${cnt} per tier.`); }
      if (dia > td - 2 * wallMin) { dia = td - 2 * wallMin; W.push(`Hole Ø reduced to ${dia.toFixed(1)} mm to fit the tier depth.`); }
      const depth = clamp(P.holeDepth, 8, h - floor);
      const pf = h - depth;
      const rs = Math.min(dia / 2 - 0.4, 3);
      const centers = [];
      if (rowsN === 1) for (let k = 0; k < cnt; k++) centers.push([-Wd / 2 + wallMin + pitch * (k + 0.5), zc]);
      else {
        for (let k = 0; k < cnt; k++) centers.push([-Wd / 2 + wallMin + pitch * (k + 0.5), zc + td / 4 - 0.2]);
        for (let k = 0; k < cnt - 1; k++) centers.push([-Wd / 2 + wallMin + pitch * (k + 1), zc - td / 4 + 0.2]);
      }
      const Otop = sampleLoop(outer, h), Obot = sampleLoop(outer, Math.min(h, cb + 0.01));
      let dropped = 0; const placed = [];
      for (const [cx, cz] of centers) {
        const ci = circle(cx, cz, dia / 2, clamp(P.curveSegs, 24, 96));
        const ring = []; for (let k = 0; k < ci.n; k += 2) ring.push(ci.pt(k, -0.8));
        if (!keepsWall(ring, Otop, 1.2) || !keepsWall(ring, Obot, 1.2) || placed.some(([x, z]) => Math.hypot(x - cx, z - cz) < dia + 2 * 0.8 + 1.2)) { dropped++; continue; }
        placed.push([cx, cz]);
        const pk = { n: ci.n, floor: pf, tag: 1, at: (k, y) => ci.pt(k, scoopIns(y, pf, rs) + lipIns(y, h, 0.8)) };
        pk.levels = lv(pf, h, [...scoopBreaks(pf, rs), h - 0.8], 50);
        pockets.push(pk); cap += Math.PI * dia * dia / 4 * depth;
        refs.push({ kind: 'cyl', r: Math.min(4.2, dia / 2 - 0.6), h: 140, pos: [cx, pf + 70, cz], rot: [0, 0, 0] });
      }
      if (dropped) W.push(`${dropped} hole(s) omitted on tier ${i + 1}: too close to the rounded corners.`);
    }
    // hollow underside with a 45° self-supporting roof (saves material, no supports)
    const under = [];
    const minFloor = Math.min(...pockets.map(p => p.floor), h);
    const hf = minFloor - 2.4;
    if (P.blockHollow && hf >= 8) {
      const m = 3.2, wu = Wd - 2 * m, du = td - 2 * m;
      if (wu > 12 && du > 12) {
        const R = Math.min(hf - 1.5, Math.min(wu, du) / 2 - 3);
        const us = rrect(0, zc, wu, du, Math.max(1, rc - m), segs);
        under.push({ n: us.n, depth: hf, tag: 0, at: (k, y) => us.pt(k, Math.max(0, y - (hf - R))), levels: lv(0, hf, [hf - R], 2) });
      }
    }
    checkPrism(outer, pockets, [floor + 0.2, h / 2, h - 0.05], W, `Tier ${i + 1}`);
    prism(M, { name: `tier${i + 1}`, y0: 0, levels: lv(0, h, [cb, floor, h - tc, hf, ...pockets.map(p => p.floor)], 50), outer, pockets, under });
  }
  parts.push(part('Pen block', M, { p: [0, 0, 0] }, { r: [0, 0, 0] }));
  return { parts, refs, capacity: cap / 1000 };
}

// ======================================================================= 4. PHONE / TABLET STAND
export const DEVICES = { phone: { t: 9.5, h: 160, w: 76 }, 'phone + case': { t: 12.5, h: 165, w: 80 }, tablet: { t: 8, h: 250, w: 175 }, 'tablet + case': { t: 14, h: 255, w: 182 } };
function phoneStand(P, W) {
  const dev = DEVICES[P.device] || DEVICES.phone;
  const T = P.deviceThick, a = clamp(P.standAngle, 50, 80) * DEG, t = clamp(P.standPlate, 3, 10);
  const Wd = P.standWidth, lipH = clamp(P.standLip, 2, 30), L = clamp(P.standBackHeight, 30, 200);
  const ca = Math.cos(a), sa = Math.sin(a);
  const tl = t, ub = tl + T * sa + 1.0;
  const F0 = [ub, t], F1 = [ub + L * ca, t + L * sa];
  const nb = [sa, -ca];
  const K1 = [F1[0] + t * nb[0], F1[1] + t * nb[1]];
  // stability: centre of the leaning device should sit over the base
  const ucm = ub + (dev.h / 2) * ca + 4;
  let Bd = Math.max(P.standBaseDepth, K1[0] + 4);
  if (ucm > Bd) { Bd = ucm; W.push(`Base lengthened to ${Bd.toFixed(0)} mm so the device cannot tip backwards.`); }
  const P0 = [0, 0], P1 = [Bd, 0], P2 = [Bd, t], S = [tl, t], Lt = [tl, t + lipH], Lf = [0, t + lipH];
  const full = [P0, P1, P2, K1, F1, F0, S, Lt, Lf];
  const noLip = [P0, P1, P2, K1, F1, F0, [0, t]];
  const holes = [];
  if (P.brace === 'truss') {
    const K0 = [F0[0] + t * nb[0], F0[1] + t * nb[1]];
    const s = (t - K0[1]) / sa, Kb = [K0[0] + s * ca, t];
    const A = Kb, B = P2, C = K1;
    const la = Math.hypot(B[0] - C[0], B[1] - C[1]), lb = Math.hypot(A[0] - C[0], A[1] - C[1]), lc = Math.hypot(A[0] - B[0], A[1] - B[1]);
    const per = la + lb + lc, I = [(la * A[0] + lb * B[0] + lc * C[0]) / per, (la * A[1] + lb * B[1] + lc * C[1]) / per];
    const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2, rho = 2 * area / per;
    const m = t * 0.9;
    if (rho > m + 3) { const k = 1 - m / rho; const tri = [A, B, C].map(V => [I[0] + (V[0] - I[0]) * k, I[1] + (V[1] - I[1]) * k]); if (area2(tri) < 0) tri.reverse(); holes.push(tri); }
    else W.push('Brace too small for a truss window — solid brace used.');
  }
  const D = Bd;
  const frame = { O: [0, 0, D / 2], U: [0, 0, -1], V: [0, 1, 0], W: [1, 0, 0] };
  const fix = loop => (area2(loop) > 0 ? loop : loop.slice().reverse());
  const M = new MeshBuf();
  const notch = clamp(P.cableNotch, 0, Wd - 30);
  if (notch >= 6) {
    extrude(M, { ...frame, name: 'left', loops: [fix(full), ...holes], w0: -Wd / 2, w1: -notch / 2 + 0.2 });
    extrude(M, { ...frame, name: 'centre', loops: [fix(noLip), ...holes], w0: -notch / 2, w1: notch / 2 });
    extrude(M, { ...frame, name: 'right', loops: [fix(full), ...holes], w0: notch / 2 - 0.2, w1: Wd / 2 });
  } else extrude(M, { ...frame, name: 'stand', loops: [fix(full), ...holes], w0: -Wd / 2, w1: Wd / 2 });
  // device ghost: back face on the backrest, back-bottom corner at F0
  const nf = [-sa, ca];
  const c = [F0[0] + (dev.h / 2) * ca + (T / 2) * nf[0], F0[1] + (dev.h / 2) * sa + (T / 2) * nf[1]];
  const refs = [{ kind: 'box', size: [dev.w, dev.h, T], pos: [0, c[1], D / 2 - c[0]], rot: [-(Math.PI / 2 - a), 0, 0], screen: true }];
  return { parts: [part('Stand', M, { p: [0, 0, 0] }, { r: [0, 0, Math.PI / 2] }, { printNote: 'printed on its side — no supports, layer lines run along the backrest' })], refs, capacity: 0 };
}

// ======================================================================= 5. CARD / NOTE HOLDER
export const CARDS = { 'business card': [90, 55], 'sticky note 76': [76, 76], 'index card': [127, 76], 'credit card': [86, 54] };
function cardHolder(P, W) {
  const [cw, ch] = P.cardType === 'custom' ? [P.cardW, P.cardH] : CARDS[P.cardType] || CARDS['business card'];
  const n = clamp(Math.round(P.cardSlots), 1, 5), T = clamp(P.cardStack, 3, 30), tilt = clamp(P.cardTilt, 0, 30) * DEG;
  const wall = 3, side = 3.2, floor = 2.4, clr = 1.0;
  const H = Math.max(16, P.cardHeightFrac * ch);
  const s = Math.tan(tilt) * (H - floor);
  const trough = P.cardTrough ? 16 : 0;
  const Wd = cw + clr + 2 * side;
  const D = wall + (trough ? trough + wall : 0) + n * T + (n - 1) * wall + s + wall;
  let rc = clamp(P.cardCorner, 0.5, 12);
  const rcMax = maxCornerFor(Math.min(side, wall) - clamp(P.topChamfer, 0, 1.2) - 0.5, 0.8);
  if (rc > rcMax) { rc = rcMax; W.push(`Corner radius limited to ${rc.toFixed(1)} mm so the slots keep their walls.`); }
  const segs = clamp(Math.round(P.curveSegs / 8), 3, 16);
  const cb = clamp(P.bottomChamfer, 0, 2);
  const dip = clamp(P.fingerDip, 0, H - floor - 8);
  let topFn = null;
  const zFirstBack = D / 2 - wall - (trough ? trough + wall : 0) - T - s;
  if (dip > 0.5) {
    const half = Math.min(cw * 0.32, 26);
    topFn = (x, z) => H - dip * smooth(1 - Math.abs(x) / half) * smooth((z - zFirstBack + 2) / (D / 2 - zFirstBack + 2));
  }
  const tc = topFn ? 0 : clamp(P.topChamfer, 0, 1.2);
  const yS = topFn ? H - dip - 1 : H;
  const body = rrect(0, 0, Wd, D, rc, segs);
  const outer = { n: body.n, at: (i, y) => body.pt(i, chamB(y, 0, cb) + chamT(y, H, tc)) };
  const pockets = [];
  let cap = 0;
  let zf = D / 2 - wall;
  if (trough) {
    const ps = rrect(0, zf - trough / 2, cw + clr, trough, 3, segs), pf = Math.max(floor, H * 0.35), rs = Math.min(7, trough / 2 - 0.6);
    const pk = { n: ps.n, floor: pf, tag: 1, at: (i, y) => ps.pt(i, scoopIns(y, pf, rs) + (topFn ? 0 : lipIns(y, H, 0.6))) };
    pk.levels = lv(pf, yS, [...scoopBreaks(pf, rs), H - 0.6], 50);
    pockets.push(pk); zf -= trough + wall;
  }
  for (let k = 0; k < n; k++) {
    const ps = rrect(0, 0, cw + clr, T, 0.8, 3), zc = zf - T / 2;
    const pk = { n: ps.n, floor, tag: 1, at: (i, y) => { const p = ps.pt(i, topFn ? 0 : lipIns(y, H, 0.5)); return [p[0], p[1] + zc - Math.tan(tilt) * (y - floor)]; } };
    pk.levels = lv(floor, yS, [H - 0.5], 3);
    pockets.push(pk); cap += (cw + clr) * T * (H - floor);
    const hc = ch, ry = floor + (hc / 2) * Math.cos(tilt);
    pk.ref = { kind: 'box', size: [cw, hc, Math.min(T - 0.6, 6)], pos: [0, ry, zc - Math.tan(tilt) * (ry - floor)], rot: [-tilt, 0, 0], paper: true };
    zf -= T + wall;
  }
  checkPrism(outer, pockets, [floor + 0.2, H / 2, yS - 0.05], W, 'Holder');
  const M = new MeshBuf();
  prism(M, { name: 'holder', y0: 0, levels: lv(0, yS, [cb, floor, H - tc, ...pockets.map(p => p.floor)], 4), top: topFn, band: 6, outer, pockets });
  return { parts: [part('Card holder', M, { p: [0, 0, 0] }, { r: [0, 0, 0] })], refs: pockets.filter(p => p.ref).map(p => p.ref), capacity: cap / 1000 };
}

// ======================================================================= 6. CABLE ORGANIZER
function cableOrganizer(P, W) {
  const n = clamp(Math.round(P.cableChannels), 1, 10), d = clamp(P.cableDia, 2, 14), Lz = clamp(P.cableLength, 12, 120);
  const rc = d / 2 + 0.3, neck = clamp(P.cableNeck * d, 1.0, 2 * rc - 0.6), gap = clamp(P.cablePitch, 2.5, 30);
  const base = clamp(P.cableBase, 2.4, 30), neckLen = Math.max(1.8, rc * 0.45), side = Math.max(4, gap);
  const Hc = base + 2 * rc + neckLen, Wc = n * 2 * rc + (n - 1) * gap + 2 * side;
  const cr = clamp(P.cableRound, 0, Math.min(side - 1, Hc / 2 - 1)), lead = Math.min(neckLen - 0.5, 1.2);
  const vc = Hc - neckLen - rc, segs = clamp(Math.round(P.curveSegs / 2), 12, 64);
  const pts = [[-Wc / 2, 0], [Wc / 2, 0]];
  const arc = (cx, cy, r, a0, a1, m) => { for (let i = 0; i <= m; i++) { const t = a0 + (a1 - a0) * i / m; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } };
  if (cr > 0.3) arc(Wc / 2 - cr, Hc - cr, cr, 0, Math.PI / 2, 8); else pts.push([Wc / 2, Hc]);
  for (let k = n - 1; k >= 0; k--) {
    const xc = -Wc / 2 + side + rc + k * (2 * rc + gap);
    const hx = neck / 2, vj = vc + Math.sqrt(rc * rc - hx * hx), thR = Math.atan2(vj - vc, hx);
    pts.push([xc + hx + lead, Hc], [xc + hx, Hc - lead], [xc + hx, vj]);
    const m = segs;
    for (let i = 1; i < m; i++) { const t = thR - (Math.PI + 2 * thR) * i / m; pts.push([xc + rc * Math.cos(t), vc + rc * Math.sin(t)]); }
    pts.push([xc - hx, vj], [xc - hx, Hc - lead], [xc - hx - lead, Hc]);
  }
  if (cr > 0.3) arc(-Wc / 2 + cr, Hc - cr, cr, Math.PI / 2, Math.PI, 8); else pts.push([-Wc / 2, Hc]);
  const loop = area2(pts) > 0 ? pts : pts.reverse();
  if (loopsCross(loop, loop)) W.push('Cable profile self-intersects — increase spacing.');
  const M = new MeshBuf();
  extrude(M, { name: 'dock', O: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1], loops: [loop], w0: -Lz / 2, w1: Lz / 2 });
  const refs = [];
  for (let k = 0; k < n; k++) refs.push({ kind: 'cyl', r: d / 2, h: Lz + 70, pos: [-Wc / 2 + side + rc + k * (2 * rc + gap), vc, 0], rot: [Math.PI / 2, 0, 0], cable: true });
  return { parts: [part('Cable dock', M, { p: [0, 0, 0] }, { r: [-Math.PI / 2, 0, 0] }, { printNote: 'printed on its back — channels stand vertical, no overhangs' })], refs, capacity: 0 };
}

// ======================================================================= 7. MINI DRAWER UNIT
function miniDrawer(P, W) {
  const n = clamp(Math.round(P.drawerCount), 1, 5);
  const iw = P.drawerW, id = P.drawerD, ih = P.drawerH, dw = clamp(P.drawerWall, 1.2, 4), cw = clamp(P.caseWall, 1.6, 6), clr = clamp(P.drawerClear, 0.15, 1);
  const ow = iw + 2 * dw, od = id + 2 * dw, oh = ih + dw;
  const bw = ow + 2 * clr, bh = oh + 2 * clr;
  const Wc = bw + 2 * cw, Hc = n * bh + (n + 1) * cw, Dc = od + clr + cw;
  const segs = clamp(Math.round(P.curveSegs / 8), 3, 16);
  let rcase = clamp(P.caseCorner, 0.5, Math.min(Wc, Hc) * 0.3);
  if (rcase > maxCornerFor(cw, 0.6)) { rcase = maxCornerFor(cw, 0.6); W.push(`Case corner radius limited to ${rcase.toFixed(1)} mm by the wall thickness.`); }
  const rr2d = (cx, cy, w, h, r, sg) => { const s = rrect(cx, cy, w, h, r, sg); const out = []; for (let i = 0; i < s.n; i++) out.push(s.pt(i, 0)); return out; };
  const outerL = rr2d(0, Hc / 2, Wc, Hc, rcase, segs);
  const bays = []; for (let k = 0; k < n; k++) bays.push(rr2d(0, cw + k * (bh + cw) + bh / 2, bw, bh, 0.6, 2));
  const C = new MeshBuf();
  extrude(C, { name: 'case', O: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1], loops: [outerL, ...bays], w0: -Dc / 2 + cw - 0.2, w1: Dc / 2 });
  extrude(C, { name: 'back', O: [0, 0, 0], U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1], loops: [outerL], w0: -Dc / 2, w1: -Dc / 2 + cw });
  const parts = [part('Case', C, { p: [0, 0, 0] }, { r: [-Math.PI / 2, 0, 0] }, { printNote: 'printed standing on its back panel — bays are vertical, no supports' })];
  // drawer (one geometry, n instances)
  const cb = clamp(P.bottomChamfer, 0, 1.2);
  const body = rrect(0, 0, ow, od, 1.2, segs);
  let topFn = null;
  const dip = P.drawerHandle === 'dip' ? Math.min(oh * 0.45, 14) : 0;
  if (dip) { const half = Math.min(ow * 0.25, 18); topFn = (x, z) => oh - dip * smooth(1 - Math.abs(x) / half) * smooth((z - od / 2 + dw + 6) / (dw + 6)); }
  const yS = topFn ? oh - dip - 1 : oh;
  const outer = { n: body.n, at: (i, y) => body.pt(i, chamB(y, 0, cb)) };
  const ps = rrect(0, 0, iw, id, 1.0, segs), rs = Math.min(4, ih * 0.3);
  const pk = { n: ps.n, floor: dw, tag: 1, at: (i, y) => ps.pt(i, scoopIns(y, dw, rs)) };
  pk.levels = lv(dw, yS, scoopBreaks(dw, rs), 50);
  checkPrism(outer, [pk], [dw + 0.2, yS - 0.05], W, 'Drawer');
  const D = new MeshBuf();
  prism(D, { name: 'drawer', y0: 0, levels: lv(0, yS, [cb, dw, ...scoopBreaks(dw, rs)], 50), top: topFn, band: 6, outer, pockets: [pk] });
  if (P.drawerHandle === 'tab') {
    const tw = Math.min(ow * 0.4, 30), tD = 7, yb = oh * 0.35, yt = Math.min(oh - 1, yb + tD + 4);
    extrude(D, { name: 'tab', O: [0, 0, od / 2], U: [0, 0, 1], V: [0, 1, 0], W: [1, 0, 0], loops: [[[-0.4, yb - 0.4], [tD, yb + tD], [tD, yt], [-0.4, yt]].reverse()], w0: -tw / 2, w1: tw / 2 });
  }
  for (let k = 0; k < n; k++) {
    const y = cw + k * (bh + cw);
    parts.push(part(`Drawer ${k + 1}`, k ? D : D, { p: [0, y, Dc / 2 - od / 2], drawer: true, depth: od }, { r: [0, 0, 0] }, { shared: k > 0 }));
  }
  return { parts, refs: [], capacity: n * iw * id * ih / 1000 };
}

// ======================================================================= dispatcher
const RECIPES = { 'pen-cup': penCup, tray, 'pen-block': penBlock, 'phone-stand': phoneStand, 'card-holder': cardHolder, 'cable-organizer': cableOrganizer, 'mini-drawer': miniDrawer };

export function buildObject(P) {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const warnings = [];
  const fn = RECIPES[P.objectType] || tray;
  const res = fn(P, warnings);
  const dens = DENSITY[P.filament] || 1.24;
  const uniq = res.parts.filter(p => !p.shared);
  const volume = res.parts.reduce((a, p) => a + p.volume, 0);
  const ok = uniq.every(p => p.manifold.ok);
  const tris = res.parts.reduce((a, p) => a + p.mesh.idx.length / 3, 0);
  return {
    ...res, warnings: [...new Set(warnings)],
    stats: { volume, mass: volume / 1000 * dens, density: dens, tris, watertight: ok, shells: res.parts.reduce((a, p) => a + p.mesh.shells.length, 0), ms: (typeof performance !== 'undefined' ? performance : Date).now() - t0, printMin: printMinutes(volume, res.parts) },
  };
}

// rough FDM time estimate (0.2 mm layers, ~9 mm³/s effective) — shown as an estimate only
function printMinutes(volume, parts) {
  let h = 0; for (const p of parts) { const P = p.mesh.pos; let mn = Infinity, mx = -Infinity; for (let i = 1; i < P.length; i += 3) { mn = Math.min(mn, P[i]); mx = Math.max(mx, P[i]); } h = Math.max(h, mx - mn); }
  return volume / 9 / 60 + (h / 0.2) * 2.5 / 60;
}
