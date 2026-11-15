// Engine acceptance sweep: watertight shells, simple (non self-intersecting) contours, clearance & no interference.
import { buildModel, neighbours, clearanceAt, outerLoop, innerLoop, levels } from '../src/engine.js';
import { DEFAULTS, PRESETS } from '../src/params.js';

function segInter(ax, az, bx, bz, cx, cz, dx, dz) {
  const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = o(cx, cz, dx, dz, ax, az), d2 = o(cx, cz, dx, dz, bx, bz), d3 = o(ax, az, bx, bz, cx, cz), d4 = o(ax, az, bx, bz, dx, dz);
  const e = 1e-9;
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}
function selfIntersections(xz) {
  const n = xz.length / 2; let c = 0;
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      const j1 = (j + 1) % n; if (j1 === i) continue;
      if (segInter(xz[2 * i], xz[2 * i + 1], xz[2 * i1], xz[2 * i1 + 1], xz[2 * j], xz[2 * j + 1], xz[2 * j1], xz[2 * j1 + 1])) c++;
    }
  }
  return c;
}

const shapes = [['box'], ['hexagon'], ['octagon'], ['triangle'], ['circle-collar', 6], ['circle-collar', 4], ['multigon', 5], ['multigon', 7]];
const joints = [['dovetail'], ['snap-cantilever'], ['t-slot'], ['puzzle'], ['magnetic', 'top-drop-slot'], ['magnetic', 'press-fit-side'], ['magnetic', 'embedded-pause'], ['none']];
const pols = ['hermaphroditic', 'alternating', 'all-female-clip'];
let fails = 0, runs = 0, worstMs = 0;
const report = [];
for (const [shape, ps] of shapes) for (const [jt, ms] of joints) for (const pol of pols) for (const stack of [false, true]) {
  if (jt === 'none' && pol !== 'hermaphroditic') continue;
  const P = { ...DEFAULTS, baseShape: shape, polySides: ps || 6, jointType: jt, magInsertStyle: ms || 'top-drop-slot', polarityMode: pol, stackableLip: stack };
  if (shape === 'box') { P.dividersX = 1; P.dividersY = 1; P.labelLedge = true; }
  const name = `${shape}${ps ? ps : ''}/${jt}${ms ? ':' + ms : ''}/${pol}/${stack ? 'stack' : 'flat'}`;
  runs++;
  try {
    const m = buildModel(P);
    worstMs = Math.max(worstMs, m.stats.ms);
    const errs = [];
    if (!m.stats.manifold.ok) errs.push('manifold ' + JSON.stringify(m.stats.manifold));
    if (m.clip && !m.clip.manifold.ok) errs.push('clip manifold');
    const C = m.C;
    const Lo = levels(C, 0);
    const pick = [0, Math.floor(Lo.length * 0.1), Math.floor(Lo.length / 3), Math.floor(Lo.length / 2), Lo.length - 1];
    for (const j of pick) {
      const y = Lo[j];
      const so = selfIntersections(outerLoop(C, y).xz);
      if (so) errs.push(`outer self-x @${y.toFixed(2)}: ${so}`);
      if (y >= C.bt) { const si = selfIntersections(innerLoop(C, y).xz); if (si) errs.push(`inner self-x @${y.toFixed(2)}: ${si}`); }
    }
    if (jt !== 'none' && !jt.startsWith('magnetic')) {
      const nbs = neighbours(m, 'pair-1x2');
      const yMid = (C.yJ0 + C.yJ1) / 2;
      const g = clearanceAt(m, nbs, yMid);
      if (g) {
        if (g.interf) errs.push(`interference ${g.interf} @${yMid.toFixed(1)}`);
        if (pol !== 'all-female-clip' && (g.minGap < P.clearance * 0.6 || g.minGap > P.clearance * 1.6)) errs.push(`gap ${g.minGap.toFixed(3)}`);
        report.push(`${name}: gap ${g.minGap.toFixed(3)} interf ${g.interf}`);
      }
      // bottom-taper zone check too
      const g2 = clearanceAt(m, nbs, C.yJ0 + 0.3 * (C.DM || 1) * C.tanT);
      if (g2 && g2.interf) errs.push(`interference in taper zone ${g2.interf}`);
    }
    if (errs.length) { fails++; console.log('FAIL', name, errs.join('; '), m.warnings.join(' | ')); }
  } catch (e) { fails++; console.log('EXC', name, e.stack.split('\n').slice(0, 3).join(' ')); }
}
for (const [nm, P] of Object.entries(PRESETS)) {
  runs++;
  try {
    const m = buildModel(P);
    const ok = m.stats.manifold.ok;
    console.log(ok ? 'ok  ' : 'FAIL', 'preset', nm, `${m.stats.tris} tris ${m.stats.ms.toFixed(0)}ms vol ${(m.stats.volume / 1000).toFixed(1)}cm3 cap ${m.stats.capacity.toFixed(0)}ml`, m.warnings.join(' | '));
    if (!ok) fails++;
  } catch (e) { fails++; console.log('EXC preset', nm, e.stack.split('\n').slice(0, 3).join(' ')); }
}
console.log(report.slice(0, 12).join('\n'));
console.log(`\n${runs - fails}/${runs} passed, worst build ${worstMs.toFixed(0)} ms`);
process.exit(fails ? 1 : 0);
