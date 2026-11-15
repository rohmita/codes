// Randomised sweep over the whole SCHEMA range: manifold, simple loops, clearance, stacking fit.
import { buildModelSafe as buildModel, neighbours, clearanceAt, outerLoop, innerLoop, levels, stackOffset } from '../src/engine.js';
import { SCHEMA, DEFAULTS } from '../src/params.js';

let seed = +(process.argv[2] || 1);
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const count = +(process.argv[3] || 200);

function segInter(ax, az, bx, bz, cx, cz, dx, dz) {
  const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = o(cx, cz, dx, dz, ax, az), d2 = o(cx, cz, dx, dz, bx, bz), d3 = o(ax, az, bx, bz, cx, cz), d4 = o(ax, az, bx, bz, dx, dz);
  const e = 1e-9;
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}
function crossings(a, b) { // a,b flat xz arrays (b may equal a)
  const n = a.length / 2, m = b.length / 2; let c = 0;
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    for (let j = a === b ? i + 2 : 0; j < m; j++) {
      const j1 = (j + 1) % m; if (a === b && j1 === i) continue;
      if (segInter(a[2 * i], a[2 * i + 1], a[2 * i1], a[2 * i1 + 1], b[2 * j], b[2 * j + 1], b[2 * j1], b[2 * j1 + 1])) c++;
    }
  }
  return c;
}
const inside = (px, pz, xz) => { let c = false; const n = xz.length / 2; for (let i = 0, j = n - 1; i < n; j = i++) { const xi = xz[2 * i], zi = xz[2 * i + 1], xj = xz[2 * j], zj = xz[2 * j + 1]; if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) c = !c; } return c; };

const params = SCHEMA.flatMap(g => g.params);
let fails = 0, worst = 0;
for (let it = 0; it < count; it++) {
  const P = { ...DEFAULTS };
  for (const p of params) {
    if (p.type === 'range') { const v = p.min + rnd() * (p.max - p.min); P[p.key] = Math.round(v / p.step) * p.step; }
    else if (p.type === 'select') P[p.key] = p.options[Math.floor(rnd() * p.options.length)];
    else if (p.type === 'check') P[p.key] = rnd() < 0.5;
  }
  P.curveSegs = Math.min(P.curveSegs, 64); P.heightSegs = Math.min(P.heightSegs, 48);
  const tag = JSON.stringify(P);
  try {
    const m = buildModel(P); const C = m.C;
    worst = Math.max(worst, m.stats.ms);
    const errs = [];
    if (!m.stats.manifold.ok) errs.push('manifold ' + JSON.stringify(m.stats.manifold));
    if (m.clip && !m.clip.manifold.ok) errs.push('clip manifold');
    const Lo = levels(C, 0);
    for (const j of [0, 1, Math.floor(Lo.length * 0.15), Math.floor(Lo.length * 0.5), Lo.length - 2, Lo.length - 1]) {
      const y = Lo[Math.max(0, Math.min(Lo.length - 1, j))];
      const O = outerLoop(C, y).xz;
      if (crossings(O, O)) errs.push(`outer self-x @${y.toFixed(2)}`);
      if (y >= C.bt) {
        const I = innerLoop(C, y).xz;
        if (crossings(I, I)) errs.push(`inner self-x @${y.toFixed(2)}`);
        if (crossings(O, I)) errs.push(`outer/inner cross @${y.toFixed(2)}`);
        if (!inside(I[0], I[1], O)) errs.push(`inner outside outer @${y.toFixed(2)}`);
      }
    }
    if (P.jointType !== 'none' && P.jointType !== 'magnetic') {
      const nbs = neighbours(m, 'pair-1x2');
      for (const y of [(C.yJ0 + C.yJ1) / 2, C.yJ0 + 0.5 * (C.DM || 1) * C.tanT, C.yJ1 - 0.3, C.H - 0.2]) {
        const g = clearanceAt(m, nbs, y);
        if (g && g.interf) errs.push(`interference @${y.toFixed(2)} (${g.interf})`);
      }
    }
    if (C.stack) { // upper unit's plug must sit inside the lower unit's top opening
      const off = stackOffset(C);
      for (const yl of [C.H - 0.05, C.H - C.hl * 0.5, off + 0.05]) {
        const yu = yl - off; if (yu < 0 || yu > C.H) continue;
        const up = outerLoop(C, yu).xz, low = innerLoop(C, yl).xz;
        if (crossings(up, low)) errs.push(`stack interference @${yl.toFixed(2)}`);
      }
    }
    if (errs.length) { fails++; console.log('FAIL', errs.slice(0, 4).join('; '), '\n   ', tag, '\n   ', m.warnings.join(' | ')); }
  } catch (e) { fails++; console.log('EXC', e.message, '\n   ', tag); }
}
console.log(`${count - fails}/${count} random configs passed, worst build ${worst.toFixed(0)} ms`);
process.exit(fails ? 1 : 0);
