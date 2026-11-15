// DeskKit engine sweep: every object type, presets + random parameters across the full SCHEMA range.
// Checks: every part watertight (closed, consistently oriented), no pocket/wall conflicts, finite stats.
import { buildObject } from '../src/objects.js';
import { SCHEMA, DEFAULTS, PRESETS, OBJECT_TYPES } from '../src/params.js';

let seed = +(process.argv[2] || 1), count = +(process.argv[3] || 150);
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const BAD = /self-intersects|breaks through|overlap|Profile self/;
let runs = 0, fails = 0, worst = 0;
function check(P, tag) {
  runs++;
  try {
    const r = buildObject(P);
    worst = Math.max(worst, r.stats.ms);
    const errs = [];
    for (const p of r.parts) if (!p.manifold.ok) errs.push(`${p.name} ${JSON.stringify(p.manifold)}`);
    for (const w of r.warnings) if (BAD.test(w)) errs.push(w);
    if (!(r.stats.volume > 0) || !isFinite(r.stats.volume)) errs.push('volume ' + r.stats.volume);
    if (errs.length) { fails++; console.log('FAIL', tag, errs.slice(0, 3).join('; '), '\n   ', JSON.stringify(P)); }
  } catch (e) { fails++; console.log('EXC', tag, e.stack.split('\n').slice(0, 3).join(' '), '\n   ', JSON.stringify(P)); }
}
for (const [n, P] of Object.entries(PRESETS)) check(P, 'preset ' + n);
const params = SCHEMA.flatMap(g => g.params);
for (const [type] of OBJECT_TYPES) for (let it = 0; it < count; it++) {
  const P = { ...DEFAULTS, objectType: type };
  for (const p of params) {
    if (p.type === 'range') P[p.key] = Math.round((p.min + rnd() * (p.max - p.min)) / p.step) * p.step;
    else if (p.type === 'select') P[p.key] = p.options[Math.floor(rnd() * p.options.length)];
    else if (p.type === 'check') P[p.key] = rnd() < 0.5;
  }
  P.curveSegs = Math.min(P.curveSegs, 64); P.heightSegs = Math.min(P.heightSegs, 40);
  check(P, type);
}
console.log(`${runs - fails}/${runs} passed, worst build ${worst.toFixed(0)} ms`);
process.exit(fails ? 1 : 0);
