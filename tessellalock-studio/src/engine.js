// TessellaLock Studio 3D — procedural geometry engine
// 2.5D parametric contour extrusion with Z-modulated joint profiles.
// Every loop keeps a constant point count across levels, so walls stitch into a closed (watertight) shell.
// Units: millimetres. Plan coordinates are (x, z); Y is up.
import * as THREE from 'three';

export const TAU = 0.004;            // minimum point separation used to keep collapsed features non-degenerate
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const DENSITY = { 'PLA (Stiff)': 1.24, 'PETG (Recommended for Snap)': 1.27, 'ABS / ASA': 1.04, 'TPU (Flex)': 1.21 };
export const STRAIN_LIMIT = { 'PLA (Stiff)': 2.2, 'PETG (Recommended for Snap)': 4.0, 'ABS / ASA': 3.5, 'TPU (Flex)': 25 };

// ---------------------------------------------------------------------------------------------
// Half-profiles: a joint cross-section is described by its half-width U as a function of depth c
// (depth-monotone shapes). Points are [U, c] with c increasing from the wall (c = 0) to the bottom.
// ---------------------------------------------------------------------------------------------
function offsetProf(prof, rho) {
  const n = prof.length;
  if (Math.abs(rho) < 1e-9) return prof.map(p => p.slice());
  const nr = [];
  for (let i = 0; i < n - 1; i++) {
    const dU = prof[i + 1][0] - prof[i][0], dc = prof[i + 1][1] - prof[i][1];
    const L = Math.hypot(dU, dc) || 1;
    nr.push([dc / L, -dU / L]);
  }
  const out = [];
  {
    const [U0, c0] = prof[0], [nu, nc] = nr[0];
    const dU = prof[1][0] - U0, dc = prof[1][1] - c0;
    const t = Math.abs(dc) > 1e-9 ? -(c0 + rho * nc) / dc : 0;
    out.push([U0 + rho * nu + t * dU, 0]);
  }
  const miter = (p, a, b) => {
    const d = Math.max(1 + a[0] * b[0] + a[1] * b[1], 0.04);
    return [p[0] + rho * (a[0] + b[0]) / d, p[1] + rho * (a[1] + b[1]) / d];
  };
  for (let i = 1; i < n - 1; i++) out.push(miter(prof[i], nr[i - 1], nr[i]));
  out.push(miter(prof[n - 1], nr[n - 2], [0, 1]));
  for (let i = 0; i < n; i++) {
    out[i][0] = Math.max(out[i][0], 0.15);
    if (i) out[i][1] = Math.max(out[i][1], out[i - 1][1] + 1e-4);
  }
  return out;
}

function profU(prof, c) {
  if (c <= prof[0][1]) return prof[0][0];
  for (let i = 1; i < prof.length; i++) {
    if (c <= prof[i][1]) {
      const a = prof[i - 1], b = prof[i];
      return a[0] + (b[0] - a[0]) * (c - a[1]) / ((b[1] - a[1]) || 1e-9);
    }
  }
  return prof[prof.length - 1][0];
}
const profMaxU = prof => prof.reduce((m, p) => Math.max(m, p[0]), 0);
const profDepth = prof => prof[prof.length - 1][1];
// deepen the bottom by e while keeping the last flank direction (inside-corner relief)
function deepen(prof, e) {
  const n = prof.length, a = prof[n - 2], b = prof[n - 1];
  const k = (b[0] - a[0]) / ((b[1] - a[1]) || 1e-9);
  b[0] = Math.max(0.15, b[0] + k * e); b[1] += e;
}

// Nominal half-profiles for each mechanism (before clearance offsets)
function nominalProfile(P, type) {
  const jw = P.jointWidth, jd = P.jointDepth;
  if (type === 'dovetail') {
    const a = clamp(P.dovetailAngle, 15, 60) * DEG;
    return [[jw / 2, 0], [jw / 2 + jd / Math.tan(a), jd]];
  }
  if (type === 't-slot') {
    const nh = 0.25 * jw;
    const d1 = 0.3 * jd;
    const ch = Math.min(0.25 * jw, 0.45 * jd);   // 45° neck transition
    return [[nh, 0], [nh, d1], [nh + ch, d1 + ch], [nh + ch, jd]];
  }
  if (type === 'puzzle') {
    const R = 0.425 * jw, nh = Math.min(0.25 * jw, 0.8 * R);
    const ls = Math.max(0.6, 0.35 * jd);
    const cc = ls + Math.sqrt(R * R - nh * nh);
    const t0 = Math.asin(nh / R), t1 = Math.acos(-0.93);
    const pr = [[nh, 0]];
    const m = 14;
    for (let i = 0; i <= m; i++) {
      const t = t0 + (t1 - t0) * i / m;
      pr.push([R * Math.sin(t), cc - R * Math.cos(t)]);
    }
    return pr;
  }
  return null;
}

// Snap-fit envelope (outer edge of the twin cantilever beams incl. hook)
function snapEnvelope(P, warn) {
  const g = P.snapSlotGap, t = P.snapBeamThick, L = P.jointDepth;
  let h = P.snapHookLip;
  const hookLen = h * (1 + 1 / Math.tan(30 * DEG));
  if (hookLen > 0.75 * L) { h = 0.75 * L / (1 + 1 / Math.tan(30 * DEG)); warn.push(`Hook lip limited to ${h.toFixed(2)} mm by protrusion depth.`); }
  const c1 = L - h * (1 + 1 / Math.tan(30 * DEG));
  const U0 = g / 2 + t;
  return { prof: [[U0, 0], [U0, c1], [U0 + h, c1 + h], [U0, L]], h, g, t, L };
}

// ---------------------------------------------------------------------------------------------
// Slot point generators. Local coords: u along the wall tangent, n along the outward normal,
// measured from the ORIGINAL (un-inset) wall line. r = current wall inset at this level.
// ---------------------------------------------------------------------------------------------
function monoPts(sl, y, r, out) {
  const prof = sl.prof, n = prof.length, sig = sl.sigma;
  const ex = sl.ex ? sl.ex(y) : 0;
  const Dorig = profDepth(prof), Dfull = Dorig + ex;
  let zt = Math.min(sl.z(y), Dfull);
  const clip = sl.through && sig < 0;
  const cMin = clip ? r : 0;
  const need = cMin + (sig < 0 ? 2 * n + 8 : n + 1) * TAU;   // female stubs deeper than any male stub
  const fade = clip ? clamp((Dfull - r) / 0.25 + 0.3, 0.3, 1) : 1;
  if (zt < need) zt = need;
  const cs = new Array(n);
  for (let i = 0; i < n; i++) {
    let c = i === n - 1 ? Dfull : prof[i][1];
    c = clamp(c, cMin + i * TAU, zt - (n - 1 - i) * TAU);
    if (i) c = Math.max(c, cs[i - 1] + TAU * 0.5);
    cs[i] = c;
  }
  const shift = clip ? 0 : -r;
  const start = out.length;
  for (let i = 0; i < n; i++) {
    const u = (profU(prof, Math.min(cs[i], Dorig)) + ex) * fade;
    out.push([-u, sig * cs[i] + shift]);
  }
  for (let i = n - 1; i >= 0; i--) out.push([-out[start + i][0], out[start + i][1]]);
  return cs[n - 1] + (clip ? 0 : r);
}

function snapMalePts(sl, y, r, out) {
  const prof = sl.prof, n = prof.length, L = profDepth(prof);
  const zt = clamp(sl.z(y), (n + 3) * TAU, L);
  const cs = new Array(n);
  for (let i = 0; i < n; i++) {
    let c = clamp(prof[i][1], i * TAU, zt - (n - 1 - i) * TAU);
    if (i) c = Math.max(c, cs[i - 1] + TAU * 0.5);
    cs[i] = c;
  }
  const g2 = sl.g / 2;
  let nSlot;
  if (sl.nSlot < 0) nSlot = Math.min(-TAU, sl.nSlot * Math.min(1, zt / L));
  else nSlot = Math.min(zt - 2 * TAU, Math.max(TAU, sl.nSlot * Math.min(1, zt / L)));
  for (let i = 0; i < n; i++) out.push([-profU(prof, cs[i]), cs[i] - r]);
  out.push([-g2, cs[n - 1] - r]);
  out.push([-g2, nSlot - r]);
  out.push([g2, nSlot - r]);
  out.push([g2, cs[n - 1] - r]);
  for (let i = n - 1; i >= 0; i--) out.push([profU(prof, cs[i]), cs[i] - r]);
  return { depth: Math.max(0, -nSlot) + r };
}

function slotPoints(sl, y, r, out) {
  if (sl.kind === 'mono') return monoPts(sl, y, r, out);
  if (sl.kind === 'snapM') return snapMalePts(sl, y, r, out);
  return 0;
}

// Material that must remain behind a slot (used to grow internal bosses on the cavity side)
function slotReq(sl, y, r) {
  if (sl.kind === 'mono') {
    if (sl.sigma > 0) return null;
    const tmp = [];
    const depth = monoPts(sl, y, r, tmp);
    let half = 0; for (const p of tmp) half = Math.max(half, Math.abs(p[0]));
    return { depth, half, skin: sl.skin };
  }
  if (sl.kind === 'snapM') {
    const tmp = []; const d = snapMalePts(sl, y, r, tmp);
    return { depth: d.depth, half: sl.g / 2 + 0.2, skin: sl.skin };
  }
  if (sl.kind === 'void') return { depth: sl.voidDepth, half: sl.voidHalf, skin: sl.skin, fixed: true };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Context: derived dimensions, sides, slots, vertical schedule
// ---------------------------------------------------------------------------------------------
function makeCtx(P, warn) {
  const C = { P, warn };
  const H = C.H = P.height;
  C.d = P.clearance; C.zc = P.zClearance;
  C.tanT = Math.tan(clamp(P.overhangAngle, 35, 60) * DEG);
  const shape = C.shape = P.baseShape;
  const Wd = P.outerWidth, Dp = P.outerDepth;
  let N, apo = null, psi0 = 0, collar = false;
  if (shape === 'box') { N = 4; apo = [Wd / 2, Dp / 2, Wd / 2, Dp / 2]; }
  else if (shape === 'hexagon') N = 6;
  else if (shape === 'octagon') N = 8;
  else if (shape === 'triangle') { N = 3; psi0 = -Math.PI / 2; }
  else if (shape === 'multigon') { N = clamp(Math.round(P.polySides), 3, 12); psi0 = N % 2 ? -Math.PI / 2 : 0; }
  else { collar = true; N = Math.round(P.polySides) === 4 ? 4 : 6; }
  if (!apo) apo = new Array(N).fill(Wd / 2);
  C.N = N; C.apo = apo; C.collar = collar;
  C.nrm = []; C.tan = [];
  for (let k = 0; k < N; k++) {
    const a = psi0 + k * 2 * Math.PI / N;
    const n = [Math.cos(a), Math.sin(a)];
    C.nrm.push(n); C.tan.push([-n[1], n[0]]);
  }
  let front = 0; for (let k = 1; k < N; k++) if (C.nrm[k][1] > C.nrm[front][1] + 1e-9) front = k;
  C.front = front;
  const minApo = Math.min(...apo);
  C.w = Math.min(P.wallThickness, 0.22 * minApo);
  if (C.w < P.wallThickness - 1e-6) warn.push(`Wall thickness limited to ${C.w.toFixed(2)} mm for this footprint.`);
  C.bt = Math.min(P.baseThickness, 0.4 * H);
  C.rc = collar ? 0 : clamp(P.cornerRadius, 0.5, 0.42 * minApo);
  C.rIn = Math.max(C.rc - C.w, 0.6);
  C.cs = collar ? clamp(Math.round(P.curveSegs / N), 4, 40) : clamp(Math.round(P.curveSegs / N), 3, 24);
  C.cel = clamp(P.elephantChamfer, 0, Math.min(3, 0.2 * H));
  return C;
}

// Flat interval [s0, s1] of each side + corner arcs, for a set of per-side insets
function frameLevel(C, ins, inner) {
  const N = C.N, F = { a: [], foot: [], s0: new Array(N), s1: new Array(N), corner: [] };
  for (let k = 0; k < N; k++) {
    const a = C.apo[k] - ins[k];
    F.a.push(a); F.foot.push([a * C.nrm[k][0], a * C.nrm[k][1]]);
  }
  for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N, n0 = C.nrm[k], n1 = C.nrm[k1], t0 = C.tan[k], t1 = C.tan[k1];
    const pts = [];
    let T1, T2;
    if (!C.collar) {
      // inner fillets stay concentric with the outer fillet (sharp corners would otherwise poke through)
      const rho = Math.max(C.rc - Math.min(ins[k], ins[k1]), 0.6);
      const det = n0[0] * n1[1] - n0[1] * n1[0];
      const b0 = F.a[k] - rho, b1 = F.a[k1] - rho;
      const cx = (b0 * n1[1] - b1 * n0[1]) / det, cz = (n0[0] * b1 - n1[0] * b0) / det;
      let th1 = Math.atan2(n0[1], n0[0]), th2 = Math.atan2(n1[1], n1[0]);
      while (th2 <= th1) th2 += 2 * Math.PI;
      for (let i = 0; i <= C.cs; i++) {
        const th = th1 + (th2 - th1) * i / C.cs;
        pts.push([cx + rho * Math.cos(th), cz + rho * Math.sin(th)]);
      }
    } else {
      const rk = C.Rarc - ins[k], rk1 = C.Rarc - ins[k1], rr = Math.max(rk, rk1);
      // offsetting a circle-with-flats inward lengthens the flats; never let them pass the polygon vertex
      const tp = Math.tan(Math.PI / N);
      const hk = Math.min(Math.sqrt(Math.max(rk * rk - F.a[k] * F.a[k], 0.01)), F.a[k] * tp - 0.06);
      const hk1 = Math.min(Math.sqrt(Math.max(rk1 * rk1 - F.a[k1] * F.a[k1], 0.01)), F.a[k1] * tp - 0.06);
      T1 = [F.foot[k][0] + hk * t0[0], F.foot[k][1] + hk * t0[1]];
      T2 = [F.foot[k1][0] - hk1 * t1[0], F.foot[k1][1] - hk1 * t1[1]];
      let th1 = Math.atan2(T1[1], T1[0]), th2 = Math.atan2(T2[1], T2[0]);
      while (th2 <= th1) th2 += 2 * Math.PI;
      const r1 = Math.hypot(T1[0], T1[1]), r2 = Math.hypot(T2[0], T2[1]);
      for (let i = 0; i <= C.cs; i++) {
        const f = i / C.cs, th = th1 + (th2 - th1) * f, rad = r1 + (r2 - r1) * f;
        pts.push([rad * Math.cos(th), rad * Math.sin(th)]);
      }
      pts[0] = T1; pts[C.cs] = T2;
    }
    const p0 = pts[0], p1 = pts[pts.length - 1];
    F.s1[k] = (p0[0] - F.foot[k][0]) * t0[0] + (p0[1] - F.foot[k][1]) * t0[1];
    F.s0[k1] = (p1[0] - F.foot[k1][0]) * t1[0] + (p1[1] - F.foot[k1][1]) * t1[1];
    F.corner.push(pts);
  }
  return F;
}

function buildSlots(C) {
  const P = C.P, warn = C.warn, N = C.N, d = C.d, tanT = C.tanT, H = C.H;
  const jt = P.jointType;
  C.sides = Array.from({ length: N }, () => []);
  C.voids = [];
  C.polarity = P.polarityMode;
  C.magnetic = jt === 'magnetic';
  C.cut = P.frontCutout > 0.001;
  if (C.collar) { // default pad (PRD: w_pad = hermSpacing + 2·jointWidth), refined below once joints are known
    const R = C.apo[0], hwMax = R * Math.tan(Math.PI / N) * 0.9;
    C.hw = Math.min((P.hermSpacing + 2 * P.jointWidth) / 2, hwMax); C.Rarc = Math.sqrt(R * R + C.hw * C.hw);
  }
  C.active = new Array(N).fill(false);
  if (jt === 'none') return;

  // which sides carry joints
  const act = new Array(N).fill(false);
  const m = P.activeSides;
  for (let k = 0; k < N; k++) {
    if (m === 'all') act[k] = true;
    else if (m === 'opposite-2') act[k] = k === 0 || k === Math.floor(N / 2);
    else if (m === 'adjacent-2') act[k] = k === 0 || k === 1;
    else if (m === 'front-only') act[k] = k === C.front;
    else if (m === 'custom-step') act[k] = k % 2 === 0;
  }
  if (C.cut && act[C.front]) { act[C.front] = false; warn.push('Front scoop cutout active: joints on the front wall are omitted.'); }
  C.active = act;

  let pol = P.polarityMode;
  if (pol === 'alternating' && N % 2) { pol = 'hermaphroditic'; warn.push('Alternating polarity needs an even side count — using hermaphroditic.'); }
  if (pol === 'all-female-clip' && jt === 'magnetic') { pol = 'hermaphroditic'; warn.push('Magnetic joints need no clip — using hermaphroditic magnet polarity.'); }
  C.polarity = pol;
  if (pol === 'alternating') { // a male wall needs an active female wall opposite it (translated neighbour)
    let added = false;
    for (let k = 0; k < N / 2; k++) if (act[k] !== act[k + N / 2]) { act[k] = act[k + N / 2] = true; added = true; }
    if (C.cut && act[C.front]) { const o = (C.front + N / 2) % N; act[C.front] = false; act[o] = false; }
    if (added) warn.push('Alternating polarity: opposite walls activated in pairs so male meets female.');
  }
  const sliding = jt === 'dovetail' || jt === 't-slot' || jt === 'puzzle';
  C.sliding = sliding;

  // vertical joint span
  const span = clamp(P.jointHeightFrac, 0.2, 1) * H;
  C.yJ0 = Math.min(Math.max(P.jointZOffset, C.yB + 0.4), H - 6);
  if (C.yJ0 < C.yB + 0.4) { warn.push('Unit too short for joints above the base chamfer/stacking zone — joints omitted.'); C.yJ0 = undefined; return; }
  if (P.jointZOffset > C.yJ0 + 1e-6) warn.push(`Joint start lowered to ${C.yJ0.toFixed(1)} mm to fit the height.`);
  C.yJ1 = Math.min(C.yJ0 + span, H);
  if (jt === 'snap-cantilever') C.yJ1 = Math.min(C.yJ1, H - 1.2 - C.zc - P.jointDepth * tanT);
  if (C.yJ1 - C.yJ0 < 4) { C.yJ1 = Math.min(H, C.yJ0 + 4); warn.push('Joint span very short — increase height or joint span.'); }
  const yJ0 = C.yJ0, yJ1 = C.yJ1;

  // feasibility: the female recess + its internal boss must leave a usable cavity
  let Pj = P;
  {
    const jw = P.jointWidth, jd = P.jointDepth;
    let est = 0;
    if (jt === 'puzzle') { const R = 0.425 * jw, nh = Math.min(0.25 * jw, 0.8 * R); est = Math.max(0.6, 0.35 * jd) + Math.sqrt(R * R - nh * nh) + 0.93 * R; }
    else if (jt !== 'magnetic') est = jd;
    const lead = sliding ? P.leadInChamfer / tanT : 0;
    const room = 0.3 * Math.min(...C.apo) - C.w - lead - C.d;
    if (est > 0 && est > room) {
      const f = Math.max(0.15, room / est);
      Pj = { ...P, jointDepth: jd * f, jointWidth: Math.max(3, jw * f), snapHookLip: P.snapHookLip * f, snapBeamThick: Math.max(0.6, P.snapBeamThick * Math.sqrt(f)), snapSlotGap: Math.max(0.6, P.snapSlotGap * Math.sqrt(f)) };
      warn.push(`Joint scaled to ${(f * 100).toFixed(0)}% so its socket and internal boss fit this footprint.`);
    }
    if (jt === 'magnetic') {
      const tl = P.magThickness + 2 * P.magWallSkin + C.d;
      if (tl > 0.3 * Math.min(...C.apo)) { warn.push('Magnet too thick for this footprint — magnets omitted.'); return; }
    }
  }
  C.Pj = Pj;
  let male = null, female = null, footM = 0, footF = 0, magCfg = null;
  const leadIn = P.leadInChamfer;
  const relief = P.cornerRelief ? 0.15 : 0;
  if (sliding) {
    const nom = nominalProfile(Pj, jt);
    const pm = offsetProf(nom, -d / 2), pf = offsetProf(nom, d / 2);
    if (relief) deepen(pf, relief);
    const DM = profDepth(pm), DF = profDepth(pf);
    male = { kind: 'mono', sigma: 1, prof: pm, tag: 1, z: y => Math.min(DM, (y - yJ0) / tanT, (yJ1 - y) / tanT) };
    const throughF = pol === 'hermaphroditic' || !P.stopLedge;
    const lead = y => (leadIn > 0 && y > H - leadIn ? (y - (H - leadIn)) / tanT * 0.999 : 0);
    female = {
      kind: 'mono', sigma: -1, prof: pf, tag: 2, through: throughF, skin: C.w, ex: lead,
      z: throughF ? () => DF + 10 : y => (y - (yJ0 - C.zc)) / tanT,
    };
    footM = profMaxU(pm); footF = profMaxU(pf) + leadIn / tanT;
    C.DM = DM; C.DF = DF;
  } else if (jt === 'snap-cantilever') {
    const env = snapEnvelope(Pj, warn);
    const pm = offsetProf(env.prof, -d / 2), pf = offsetProf(env.prof, d / 2);
    if (relief) deepen(pf, relief);
    const DM = profDepth(pm), DF = profDepth(pf);
    const nSlot = -Math.min(0.6 * C.w, 1.6);
    male = { kind: 'snapM', prof: pm, g: env.g, nSlot, tag: 1, skin: C.w,
      z: y => Math.min(DM, (y - yJ0) / tanT, (yJ1 - y) / tanT) };
    female = { kind: 'mono', sigma: -1, prof: pf, tag: 2, through: false, skin: C.w,
      z: y => Math.min(DF, (y - (yJ0 - C.zc)) / tanT, (yJ1 + C.zc - y) / tanT) };
    footM = profMaxU(pm); footF = profMaxU(pf);
    C.DM = DM; C.DF = DF;
    C.snap = { ...env, Lbeam: env.L + Math.abs(nSlot) };
    if (env.g < 2 * env.h - 0.05) warn.push(`Flex relief slot (${env.g.toFixed(1)} mm) is narrower than 2× hook lip — beams cannot fully deflect.`);
  } else if (jt === 'magnetic') {
    const Dm = P.magDiameter + d, Tm = P.magThickness + d, skin = P.magWallSkin;
    const rows = clamp(Math.round(P.magRows), 1, 3);
    const style = P.magInsertStyle;
    const ph = Dm; // pocket height (disc stands on edge, face toward the neighbour)
    const yRows = [];
    if (style === 'top-drop-slot') {
      const y0 = Math.max(yJ0, C.yB + 1.5);
      for (let r = 0; r < rows; r++) yRows.push([y0 + r * ph, y0 + (r + 1) * ph]);
      if (yRows[rows - 1][1] + 1.5 > H) warn.push('Magnet stack taller than the wall.');
    } else {
      const lo = yJ0, hi = yJ1 - (style === 'press-fit-side' ? Tm * tanT : Dm / 2 * tanT) - 0.5;
      const pitch = (hi - lo) / rows;
      for (let r = 0; r < rows; r++) {
        const c = lo + pitch * (r + 0.5);
        yRows.push([c - ph / 2, c + ph / 2]);
      }
      if (pitch < ph + 1) warn.push('Magnet rows overlap — reduce rows or magnet diameter.');
    }
    magCfg = { Dm, Tm, skin, rows, style, yRows };
    C.mag = magCfg;
    if (style === 'press-fit-side') {
      const prof = [[Dm / 2, 0], [Dm / 2, Tm]];
      const z = y => {
        let z = 0;
        for (const [a, b] of yRows) {
          if (y < a || y > b + Tm * tanT) continue;
          let v = Tm;
          if (y < a + 0.05) v = Tm * (y - a) / 0.05;
          if (y > b) v = Math.min(v, Tm - (y - b) / tanT);
          z = Math.max(z, v);
        }
        return z;
      };
      male = { kind: 'mono', sigma: -1, prof, tag: 3, through: false, skin, z };
      female = { kind: 'mono', sigma: -1, prof, tag: 4, through: false, skin, z };
    } else {
      male = { kind: 'void', tag: 3, skin, voidDepth: skin + Tm, voidHalf: Dm / 2 };
      female = { kind: 'void', tag: 4, skin, voidDepth: skin + Tm, voidHalf: Dm / 2 };
    }
    footM = footF = Dm / 2 + 0.6;
  }
  C.footM = footM; C.footF = footF;

  // slot positions per side, with automatic fitting
  const hsUser = P.hermSpacing;
  const nUser = clamp(Math.round(P.jointsPerSide), 1, 4);
  const layout = (k, n) => {
    const list = [];
    if (pol === 'hermaphroditic') {
      const hs = Math.max(hsUser, footM + footF + 0.6);
      for (let i = 0; i < 2 * n; i++) list.push({ s: (i - (2 * n - 1) / 2) * hs, male: i % 2 === 0, idx: i });
    } else {
      const isMale = pol === 'alternating' ? k < N / 2 : false;
      // male and female walls share one pitch so translated neighbours line up
      const f = pol === 'alternating' ? Math.max(footM, footF) : footF;
      const hs = Math.max(hsUser, 2 * f + 0.6);
      for (let i = 0; i < n; i++) list.push({ s: (i - (n - 1) / 2) * hs, male: isMale, idx: i });
    }
    return list;
  };
  // collar pad width (flat contact boss) follows PRD w_pad = hermSpacing + 2·jointWidth, widened to fit the joints
  if (C.collar) {
    const R = C.apo[0];
    const lay = layout(0, nUser);
    let need = 0; for (const it of lay) need = Math.max(need, Math.abs(it.s) + (it.male ? footM : footF) + 1.2);
    const hwMax = R * Math.tan(Math.PI / N) * 0.9;
    let hw = Math.max((P.hermSpacing + 2 * P.jointWidth) / 2, need);
    if (hw > hwMax) hw = hwMax;
    C.hw = hw; C.Rarc = Math.sqrt(R * R + hw * hw);
  }
  const F0 = frameLevel(C, new Array(N).fill(0), false);
  let reduced = false, dropped = 0;
  for (let k = 0; k < N; k++) {
    if (!act[k]) continue;
    let placed = null;
    for (let n = nUser; n >= 1 && !placed; n--) {
      const lay = layout(k, n);
      const lo = F0.s0[k] + 0.6, hi = F0.s1[k] - 0.6;
      let ok = true, prevHi = -Infinity;
      for (const it of lay) {
        const f = pol === 'alternating' ? Math.max(footM, footF) : it.male ? footM : footF;
        if (it.s - f < lo || it.s + f > hi || it.s - f < prevHi + 0.4) { ok = false; break; }
        prevHi = it.s + f;
      }
      if (ok) { placed = lay; if (n < nUser) reduced = true; }
    }
    if (!placed) { dropped++; continue; }
    for (const it of placed) {
      let def = it.male ? male : female;
      const slot = { ...def, s: it.s, isMale: it.male, side: k, idx: it.idx };
      if (jt === 'magnetic') {
        let north = it.male;
        if (pol === 'hermaphroditic' && P.hermSplit === 'top-bottom') slot.checker = true;
        slot.north = north;
        slot.tag = north ? 3 : 4;
      }
      C.sides[k].push(slot);
    }
  }
  if (reduced) warn.push('Connectors per wall reduced to fit the flat wall length.');
  if (dropped) warn.push(`${dropped} wall(s) too short for the selected connector — joints omitted there.`);
  if (pol === 'hermaphroditic' && P.hermSplit === 'top-bottom' && jt !== 'magnetic')
    warn.push('Top-bottom split cannot self-mate for sliding/snap joints — side-by-side layout used.');
  if (pol === 'all-female-clip' && jt !== 'magnetic') C.clipDef = { male, jt };
  if (hsUser < footM + footF + 0.6 && pol === 'hermaphroditic') warn.push(`Pair offset widened to ${(footM + footF + 0.6).toFixed(1)} mm so male and female do not overlap.`);

  // magnet void tubes (top-drop slot / embedded pause)
  if (magCfg && magCfg.style !== 'press-fit-side') {
    for (let k = 0; k < N; k++) for (const sl of C.sides[k]) {
      const base = { side: k, s: sl.s, d0: magCfg.skin, d1: magCfg.skin + magCfg.Tm, north: sl.north };
      if (magCfg.style === 'top-drop-slot') {
        const y0 = magCfg.yRows[0][0], ys = magCfg.yRows[magCfg.yRows.length - 1][1];
        C.voids.push({ ...base, y0, y1: H, open: true, half: y => {
          const h = magCfg.Dm / 2;
          if (y < ys) return h;
          const q = y - ys;
          if (q < 0.25) return h - q; if (q < 0.55) return h - 0.25; if (q < 0.8) return h - 0.25 + (q - 0.55);
          return h;
        }, halfN: () => magCfg.Tm / 2, breaks: [ys, ys + 0.25, ys + 0.55, ys + 0.8] });
      } else {
        for (const [a, b] of magCfg.yRows) {
          const hu = magCfg.Dm / 2, hn = magCfg.Tm / 2;
          const roof = (hu - 0.25) * tanT;
          C.voids.push({ ...base, y0: a, y1: b + roof, open: false,
            half: y => (y <= b ? hu : Math.max(0.25, hu - (y - b) / tanT)),
            halfN: y => (y <= b ? hn : Math.max(0.15, hn - (y - b) / tanT)),
            breaks: [b, b + (hn - 0.15) * tanT] });
        }
      }
    }
  }
}

// Vertical schedule: base-zone insets (elephant foot + stacking plug), top widening, scoop
function setupVertical(C) {
  const P = C.P, H = C.H, N = C.N, tanT = C.tanT, w = C.w, d = C.d;
  C.stack = !!P.stackableLip;
  C.hl = clamp(P.stackLipHeight, 1.5, Math.min(8, 0.2 * H));
  C.yB = C.cel;
  C.I = new Array(N).fill(0);
  C.Tst = 0;
  C.bossSide = new Array(N).fill(false);
  // provisional (joint span needs yB first; plug inset needs joints) -> two-pass
}

function finishVertical(C) {
  const P = C.P, H = C.H, N = C.N, tanT = C.tanT, w = C.w, d = C.d, warn = C.warn;
  C.ww = w / 2 + d / 2;                              // inner widening -> top tongue = w/2 - δ/2
  if (C.stack) {
    const ys = []; for (let i = 0; i <= 8; i++) ys.push(H - (C.hl + 1.5) * i / 8);
    for (let k = 0; k < N; k++) {
      let face = 0;
      for (const sl of C.sides[k]) for (const y of ys) {
        const q = slotReq(sl, y, 0);
        if (q && q.depth > 0.02) face = Math.max(face, q.depth + q.skin * clamp(q.depth / 0.3, 0, 1));
      }
      if (C.cut && k === C.front) face = Math.max(face, w);
      C.bossSide[k] = face > 0;
      // boss sides: plug clears the bosses by δ; plain sides: PRD recess w/2 + δ/2 against a w/2 − δ/2 tongue
      C.I[k] = face > 0 ? Math.max(face, w) + d : w / 2 + d / 2;
    }
    const Imax = Math.max(...C.I);
    if (Imax + w > 0.55 * Math.min(...C.apo)) {
      C.stack = false; warn.push('Footprint too small for the stacking plug with these joints — stacking rim disabled.');
    } else {
      C.Tst = Imax * tanT;
      C.yW0 = H - C.hl - C.zc - C.ww * tanT;      // start of inner widening ramp
      if (C.yW0 < C.hl + C.Tst + C.bt + 2) { C.stack = false; warn.push('Height too small for stacking rim — disabled.'); }
    }
  }
  if (!C.stack) { C.I.fill(0); C.Tst = 0; C.bossSide.fill(true); }
  C.rf = clamp(P.innerFillet, 0, Math.min(0.35 * (H - C.bt), 0.25 * Math.min(...C.apo)));
  // front cutout
  if (C.cut) {
    const minYc = Math.max(C.bt + C.rf, C.stack ? C.hl + C.Tst : C.cel) + 2;
    C.yc = Math.max(H - P.frontCutout * H, minYc);
    if (C.yc > H - 1) C.cut = false;
  }
}

function outerIns(C, y, out) {
  const el = Math.max(0, C.cel - y);
  for (let k = 0; k < C.N; k++) {
    let st = 0;
    if (C.stack) st = y <= C.hl ? C.I[k] : C.I[k] * Math.max(0, 1 - (y - C.hl) / C.Tst);
    out[k] = Math.max(el, st);
  }
  return out;
}
function widen(C, k, y) {
  if (!C.stack || C.bossSide[k]) return 0;
  return C.ww * clamp((y - C.yW0) / (C.ww * C.tanT), 0, 1);
}
function scoop(C, y) {
  const rf = C.rf; if (rf <= 0) return 0;
  const q = C.bt + rf - y; if (q <= 0) return 0;
  return rf - Math.sqrt(Math.max(rf * rf - q * q, 0));
}
function cutTop(C, s, halfFlat) {
  const b = halfFlat * 0.92, x = Math.abs(s) / b;
  let f = 0;
  if (x <= 0.55) f = 1; else if (x < 1) f = 0.5 * (1 + Math.cos(Math.PI * (x - 0.55) / 0.45));
  return C.H - (C.H - C.yc) * f;
}

// ---------------------------------------------------------------------------------------------
// Loops at a level
// ---------------------------------------------------------------------------------------------
const FRONT_SAMPLES = 40;

function outerLoop(C, y) {
  const N = C.N, ins = outerIns(C, y, new Array(N));
  const F = frameLevel(C, ins, false);
  const xz = [], tag = [], fs = [], mark = [];
  const tmp = [];
  for (let k = 0; k < N; k++) {
    const n = C.nrm[k], t = C.tan[k], a0 = C.apo[k];
    const ox = a0 * n[0], oz = a0 * n[1];
    const fa = F.s0[k] + 0.1, fb = F.s1[k] - 0.1;
    for (const sl of C.sides[k]) {
      tmp.length = 0;
      slotPoints(sl, y, ins[k], tmp);
      for (let i = 0; i < tmp.length; i++) {
        const [u, nn] = tmp[i], s = clamp(sl.s + u, fa, fb);   // base-zone insets shorten the flat
        xz.push(ox + s * t[0] + nn * n[0], oz + s * t[1] + nn * n[1]);
        tag.push(i < tmp.length - 1 ? sl.tag : 0); fs.push(NaN);
        mark.push(i > 0 && i < tmp.length - 1 ? 1 : 0);
      }
    }
    if (C.cut && k === C.front) {
      const s0 = F.s0[k], s1 = F.s1[k], half = Math.min(-s0, s1);
      for (let i = 1; i < FRONT_SAMPLES; i++) {
        const s = s0 + (s1 - s0) * i / FRONT_SAMPLES;
        xz.push(F.foot[k][0] + s * t[0], F.foot[k][1] + s * t[1]); tag.push(0); fs.push(cutTop(C, s, half)); mark.push(0);
      }
    }
    for (const p of F.corner[k]) { xz.push(p[0], p[1]); tag.push(0); fs.push(NaN); mark.push(0); }
  }
  return { xz, tag, fs, mark };
}

function innerLoop(C, y) {
  const N = C.N, insO = outerIns(C, y, new Array(N)), insI = new Array(N);
  const sc = scoop(C, y);
  for (let k = 0; k < N; k++) insI[k] = insO[k] + C.w - widen(C, k, y) + sc;
  const F = frameLevel(C, insI, true);
  const xz = [], fs = [];
  for (let k = 0; k < N; k++) {
    const n = C.nrm[k], t = C.tan[k], a0 = C.apo[k];
    const ox = a0 * n[0], oz = a0 * n[1];
    const sl = C.sides[k];
    const fa = F.s0[k] + 0.25, fb = F.s1[k] - 0.25;
    const bnd = [fa];
    const needs = sl.map(q => slotReq(q, y, insO[k]) !== null);
    for (let j = 1; j < sl.length; j++) {
      // slots without an inner boss (males) only need a sliver; give the rest to the neighbour's boss
      let b = (sl[j - 1].s + sl[j].s) / 2;
      if (!needs[j - 1] && needs[j]) b = sl[j - 1].s + 8 * TAU;
      else if (needs[j - 1] && !needs[j]) b = sl[j].s - 8 * TAU;
      bnd.push(clamp(b, fa, fb));
    }
    bnd.push(fb);
    for (let j = 1; j < bnd.length; j++) bnd[j] = Math.max(bnd[j], bnd[j - 1]);
    for (let j = 0; j < sl.length; j++) {
      const s = sl[j], lo = bnd[j] - s.s + (j > 0 ? 3 * TAU : 0), hi = bnd[j + 1] - s.s - (j < sl.length - 1 ? 3 * TAU : 0);
      const wallD = insI[k];
      const q = slotReq(s, y, insO[k]);
      let A, B, Cc, D, nF = -wallD - TAU;
      if (q) {
        const sk = q.skin * clamp(q.depth / 0.3, 0, 1);   // stubs (vanishing joints) need no boss
        const faceD = q.depth + sk;
        const h = faceD - wallD;
        const face = q.half + sk, mouth = face + Math.max(h, 0);
        A = Math.max(-mouth, lo); D = Math.min(mouth, hi);
        nF = -wallD - Math.max(h, TAU);
        // keep the boss face inside the cavity near corners (sharp polygon corners / collar arcs)
        const fd = C.apo[k] + nF;                       // face line distance from centre
        let fl = -face, fr = face, free = false;
        if (C.collar) {
          const rr = C.Rarc - insI[k] - 0.3, lim = Math.sqrt(Math.max(0, rr * rr - fd * fd));
          fl = Math.max(fl, -lim - s.s); fr = Math.min(fr, lim - s.s); free = true;
        } else {
          const rho = Math.max(C.rc - insI[k], 0.6);
          if (-nF - wallD > rho) {
            free = true;
            const kp = (k + N - 1) % N, kn = (k + 1) % N;
            const lim = (kk) => {
              const nn = C.nrm[kk], A1 = C.apo[kk] - insI[kk] - 0.3;
              const tn = t[0] * nn[0] + t[1] * nn[1], nd = n[0] * nn[0] + n[1] * nn[1];
              return Math.abs(tn) < 1e-9 ? null : (A1 - fd * nd) / tn - s.s;
            };
            const lp = lim(kp), ln = lim(kn);
            if (lp !== null) fl = Math.max(fl, lp);
            if (ln !== null) fr = Math.min(fr, ln);
          }
        }
        // the face of an end boss may reach past the flat (segment stays inside the convex cavity)
        // (with a stacking plug, only next to a side whose plug inset already clears bosses)
        const freeL = free && j === 0 && (!C.stack || C.bossSide[(k + N - 1) % N]);
        const freeR = free && j === sl.length - 1 && (!C.stack || C.bossSide[(k + 1) % N]);
        B = freeL ? fl : Math.max(fl, A + TAU);
        Cc = freeR ? fr : Math.min(fr, D - TAU);
        if (Math.abs(B - A) < TAU) B = A + TAU;
        if (Math.abs(Cc - D) < TAU) Cc = D - TAU;
      } else {
        const c = clamp(0, lo + 2 * TAU, hi - 2 * TAU);
        A = c - 1.5 * TAU; B = c - 0.5 * TAU; Cc = c + 0.5 * TAU; D = c + 1.5 * TAU;
      }
      if (!(A < D && B < Cc)) {
        const c = clamp((lo + hi) / 2, lo, hi);
        A = c - 1.5 * TAU; B = c - 0.5 * TAU; Cc = c + 0.5 * TAU; D = c + 1.5 * TAU; nF = -wallD - TAU;
      }
      for (const [u, nn] of [[A, -wallD], [B, nF], [Cc, nF], [D, -wallD]]) {
        const ss = s.s + u;
        xz.push(ox + ss * t[0] + nn * n[0], oz + ss * t[1] + nn * n[1]); fs.push(NaN);
      }
    }
    if (C.cut && k === C.front) {
      const s0 = F.s0[k], s1 = F.s1[k];
      const Fo = frameLevel(C, new Array(N).fill(0), false);
      const half = Math.min(-Fo.s0[k], Fo.s1[k]);
      for (let i = 1; i < FRONT_SAMPLES; i++) {
        const s = s0 + (s1 - s0) * i / FRONT_SAMPLES;
        xz.push(F.foot[k][0] + s * t[0], F.foot[k][1] + s * t[1]); fs.push(cutTop(C, s, half));
      }
    }
    for (const p of F.corner[k]) { xz.push(p[0], p[1]); fs.push(NaN); }
  }
  return { xz, fs };
}

function levels(C, from) {
  const P = C.P, H = C.H, tanT = C.tanT;
  const br = [0, H, C.cel, C.bt];
  if (C.stack) br.push(C.hl, C.hl + C.Tst, C.yW0, C.yW0 + C.ww * tanT);
  if (C.yJ0 !== undefined) {
    const DM = C.DM || 0, DF = C.DF || 0;
    br.push(C.yJ0, C.yJ0 + DM * tanT, C.yJ1 - DM * tanT, C.yJ1, C.yJ0 - C.zc, C.yJ0 - C.zc + DF * tanT, C.yJ1 + C.zc - DF * tanT, C.yJ1 + C.zc);
    if (P.leadInChamfer > 0) br.push(H - P.leadInChamfer);
  }
  if (C.mag && C.mag.style === 'press-fit-side') for (const [a, b] of C.mag.yRows) br.push(a, a + 0.05, b, b + C.mag.Tm * tanT);
  if (C.cut) br.push(C.yc);
  if (C.rf > 0) for (let i = 1; i <= 10; i++) br.push(C.bt + C.rf * (1 - Math.cos(Math.PI / 2 * i / 10)));
  const nseg = clamp(Math.round(P.heightSegs), 4, 400);
  for (let i = 1; i < nseg; i++) br.push(H * i / nseg);
  const L = br.filter(v => v >= from - 1e-9 && v <= H + 1e-9 && isFinite(v)).sort((a, b) => a - b);
  const out = [];
  for (const v of L) if (!out.length || v - out[out.length - 1] > 0.008) out.push(v);
  out[0] = from; out[out.length - 1] = H;
  if (out.length > 1 && out[out.length - 1] - out[out.length - 2] < 0.008) out.splice(out.length - 2, 1);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Mesh assembly helpers
// ---------------------------------------------------------------------------------------------
class MeshBuf {
  constructor() { this.pos = []; this.idx = []; this.tag = []; this.shells = []; this._shellStart = 0; }
  v(x, y, z) { this.pos.push(x, y, z); return this.pos.length / 3 - 1; }
  t(a, b, c, tg = 0) { this.idx.push(a, b, c); this.tag.push(tg); }
  beginShell(name) { this._shellStart = this.idx.length; this._name = name; }
  endShell() { this.shells.push({ name: this._name, start: this._shellStart, end: this.idx.length }); }
}

// Triangulate planar caps (projected to xz) with earcut. Earcut silently drops collinear points
// (also after bridging holes), which would leave T-junctions; every dropped boundary vertex is
// re-inserted by splitting the triangle edge it lies on, so the cap stays watertight with the walls.
function triCap(M, loops, up, tg = 0) {
  const P = M.pos;
  const X = i => P[3 * i], Z = i => P[3 * i + 2];
  const flat = [], contour = [], holes = [];
  loops.forEach((loop, li) => {
    const arr = loop.map(i => new THREE.Vector2(X(i), Z(i)));
    flat.push(...loop);
    if (li === 0) contour.push(...arr); else holes.push(arr);
  });
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const tris = faces.map(f => [flat[f[0]], flat[f[1]], flat[f[2]]]);
  // candidates sorted by x for range queries
  const cand = flat.slice().sort((a, b) => X(a) - X(b));
  const cx = cand.map(X);
  const lower = v => { let lo = 0, hi = cx.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cx[m] < v) lo = m + 1; else hi = m; } return lo; };
  // drop zero-area slivers (a vertex lying inside the opposite edge); their neighbours get split instead
  const onEdge = (p, q, v) => {
    const px = X(p), pz = Z(p), dx = X(q) - px, dz = Z(q) - pz, L2 = dx * dx + dz * dz;
    if (L2 < 1e-16) return false;
    const ux = X(v) - px, uz = Z(v) - pz, sp = (ux * dx + uz * dz) / L2;
    if (sp <= 1e-9 || sp >= 1 - 1e-9) return false;
    const cr = ux * dz - uz * dx; return cr * cr < 1e-20 * L2;
  };
  const out = [], queue = tris.filter(t => !(onEdge(t[0], t[1], t[2]) || onEdge(t[1], t[2], t[0]) || onEdge(t[2], t[0], t[1])));
  let guard = 0;
  while (queue.length && guard++ < 200000) {
    const t = queue.pop(); let split = false;
    for (let e = 0; e < 3 && !split; e++) {
      const p = t[e], q = t[(e + 1) % 3], x = t[(e + 2) % 3];
      const px = X(p), pz = Z(p), dx = X(q) - px, dz = Z(q) - pz, L2 = dx * dx + dz * dz;
      if (L2 < 1e-16) continue;
      const x0 = Math.min(px, px + dx) - 1e-6, x1 = Math.max(px, px + dx) + 1e-6;
      const z0 = Math.min(pz, pz + dz) - 1e-6, z1 = Math.max(pz, pz + dz) + 1e-6;
      let on = null;
      for (let i = lower(x0); i < cand.length && cx[i] <= x1; i++) {
        const v = cand[i]; if (v === p || v === q || v === x) continue;
        const vz = Z(v); if (vz < z0 || vz > z1) continue;
        const ux = X(v) - px, uz = vz - pz, sp = (ux * dx + uz * dz) / L2;
        if (sp <= 1e-9 || sp >= 1 - 1e-9) continue;
        const cr = ux * dz - uz * dx;
        if (cr * cr < 1e-20 * L2) (on || (on = [])).push([sp, v]);
      }
      if (on) {
        on.sort((a, b) => a[0] - b[0]);
        const seq = [p, ...on.map(o => o[1]), q];
        for (let i = 0; i < seq.length - 1; i++) queue.push([seq[i], seq[i + 1], x]);
        split = true;
      }
    }
    if (!split) out.push(t);
  }
  let area = 0;
  for (const t of out) area += (X(t[1]) - X(t[0])) * (Z(t[2]) - Z(t[0])) - (Z(t[1]) - Z(t[0])) * (X(t[2]) - X(t[0]));
  // normal +Y  <=>  area(x,z) < 0
  const flip = up ? area > 0 : area < 0;
  for (const t of out) flip ? M.t(t[0], t[2], t[1], tg) : M.t(t[0], t[1], t[2], tg);
}

function loopArea(xz) {
  let a = 0; const n = xz.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += xz[2 * i] * xz[2 * j + 1] - xz[2 * j] * xz[2 * i + 1]; }
  return a / 2;
}

// Extrude a stack of equal-length loops into a tube; outward=true -> normals point away from loop interior
function stitch(M, rows, outward, tags) {
  for (let j = 0; j < rows.length - 1; j++) {
    const A = rows[j], B = rows[j + 1], n = A.length;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n, a = A[i], b = A[i1], c = B[i1], d = B[i];
      const tg = tags ? tags[i] : 0;
      if (outward) { M.t(a, c, b, tg); M.t(a, d, c, tg); } else { M.t(a, b, c, tg); M.t(a, c, d, tg); }
    }
  }
}

// Closed prism from per-level CCW loops (used for dividers, clips, ledges)
function solidFromLoops(M, levelsY, loopFn, name, tg = 0) {
  const loops = levelsY.map(loopFn);
  // one orientation for the whole stack (a per-level decision could flip a degenerate level)
  if (loops.some(xz => !xz || xz.some(v => !isFinite(v)))) return false;
  const rev = loopArea(loops[Math.floor(loops.length / 2)]) < 0;
  if (loops.some(xz => (loopArea(xz) < 0) !== rev || Math.abs(loopArea(xz)) < 1e-6)) return false;
  M.beginShell(name);
  const rows = [];
  for (let li = 0; li < levelsY.length; li++) {
    const y = levelsY[li];
    let xz = loops[li];
    if (rev) { const r = []; for (let i = xz.length / 2 - 1; i >= 0; i--) r.push(xz[2 * i], xz[2 * i + 1]); xz = r; }
    const row = []; for (let i = 0; i < xz.length; i += 2) row.push(M.v(xz[i], y, xz[i + 1]));
    rows.push(row);
  }
  stitch(M, rows, true, null);
  triCap(M, [rows[0]], false, tg);
  triCap(M, [rows[rows.length - 1]], true, tg);
  M.endShell();
  return true;
}

// ---------------------------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------------------------
export function buildModel(P) {
  const warn = [];
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const C = makeCtx(P, warn);
  setupVertical(C);
  // pass 1: provisional slots to know which sides need bosses, then the stacking plug, then final slots
  if (C.stack) {
    C.yB = Math.max(C.cel, C.hl);            // provisional
    buildSlots(C); finishVertical(C);
    C.yB = C.stack ? Math.max(C.cel, C.hl + C.Tst) : C.cel;
    const keepWarn = warn.length;
    buildSlots(C); finishVertical(C);
    warn.splice(keepWarn);                     // drop duplicate warnings from the second pass
  } else {
    buildSlots(C); finishVertical(C);
  }
  // re-dedupe warnings
  const W = [...new Set(warn)];

  const M = new MeshBuf();
  const H = C.H;

  // ---- main body shell
  M.beginShell('body');
  const Lo = levels(C, 0), Li = levels(C, C.bt);
  const oRows = [], iRows = [];
  let oTags = null, nO = -1, nI = -1, bbMin = [Infinity, Infinity], bbMax = [-Infinity, -Infinity];
  const yOf = (y, fsv) => (isNaN(fsv) || y <= C.yc ? y : C.yc + (y - C.yc) * (fsv - C.yc) / (H - C.yc));
  for (const y of Lo) {
    const L = outerLoop(C, y);
    if (nO < 0) { nO = L.xz.length / 2; oTags = L.tag; C.markO = L.mark; }
    else if (L.xz.length / 2 !== nO) throw new Error('outer loop size mismatch');
    const row = [];
    for (let i = 0; i < nO; i++) {
      const x = L.xz[2 * i], z = L.xz[2 * i + 1];
      row.push(M.v(x, yOf(y, L.fs[i]), z));
      if (x < bbMin[0]) bbMin[0] = x; if (z < bbMin[1]) bbMin[1] = z; if (x > bbMax[0]) bbMax[0] = x; if (z > bbMax[1]) bbMax[1] = z;
    }
    oRows.push(row);
  }
  let capVol = 0, prevA = null, prevY = 0;
  for (const y of Li) {
    const L = innerLoop(C, y);
    if (nI < 0) nI = L.xz.length / 2;
    else if (L.xz.length / 2 !== nI) throw new Error('inner loop size mismatch');
    const row = [];
    for (let i = 0; i < nI; i++) row.push(M.v(L.xz[2 * i], yOf(y, L.fs[i]), L.xz[2 * i + 1]));
    iRows.push(row);
    const A = Math.abs(loopArea(L.xz));
    if (prevA !== null && (!C.cut || y <= C.yc)) capVol += (A + prevA) / 2 * (y - prevY);
    prevA = A; prevY = y;
  }
  stitch(M, oRows, true, oTags);
  stitch(M, iRows, false, null);
  triCap(M, [oRows[0]], false);
  triCap(M, [iRows[0]], true);

  // magnet voids
  const voidTops = [];
  for (const vd of C.voids) {
    const k = vd.side, n = C.nrm[k], t = C.tan[k], a0 = C.apo[k];
    const lv = [vd.y0, vd.y1, ...vd.breaks].filter(v => v >= vd.y0 && v <= vd.y1).sort((a, b) => a - b);
    const nseg = Math.max(2, Math.round((vd.y1 - vd.y0) / 2));
    for (let i = 1; i < nseg; i++) lv.push(vd.y0 + (vd.y1 - vd.y0) * i / nseg);
    lv.sort((a, b) => a - b);
    const ly = lv.filter((v, i) => !i || v - lv[i - 1] > 0.008);
    ly[ly.length - 1] = vd.y1;
    const dc = (vd.d0 + vd.d1) / 2;
    const rows = ly.map(y => {
      const hu = vd.half(y), hn = vd.halfN(y);
      const loc = [[-hu, dc - hn], [hu, dc - hn], [hu, dc + hn], [-hu, dc + hn]];
      return loc.map(([u, dd]) => M.v(a0 * n[0] + (vd.s + u) * t[0] - dd * n[0], y, a0 * n[1] + (vd.s + u) * t[1] - dd * n[1]));
    });
    // ensure CCW in (x,z)
    const r0 = rows[0];
    const xz0 = []; for (const i of r0) xz0.push(M.pos[3 * i], M.pos[3 * i + 2]);
    if (loopArea(xz0) < 0) rows.forEach(r => r.reverse());
    stitch(M, rows, false, null);
    triCap(M, [rows[0]], true, vd.north ? 3 : 4);
    if (vd.open) voidTops.push(rows[rows.length - 1]);
    else triCap(M, [rows[rows.length - 1]], false, vd.north ? 3 : 4);
  }
  triCap(M, [oRows[oRows.length - 1], iRows[iRows.length - 1], ...voidTops], true);
  M.endShell();

  // ---- internal dividers (separate closed shells, overlapping walls/floor -> union in slicer)
  const P_ = P;
  const yDivTop = Math.min(C.bt + clamp(P_.dividerHeight, 0.2, 1) * (H - C.bt), C.stack ? H - C.hl - C.zc - 0.4 : H, C.cut ? C.yc : H);
  const nx = clamp(Math.round(P_.dividersX), 0, 5), nz = clamp(Math.round(P_.dividersY), 0, 6);
  const td = Math.max(1.2, 0.8 * C.w), ov = Math.min(0.5 * C.w, 1.0);
  let divVol = 0;
  if ((nx || nz) && yDivTop > C.bt + 2) {
    const dl = Li.filter(y => y < yDivTop - 0.01); dl.push(yDivTop);
    const dl2 = [C.bt - Math.min(0.4, C.bt * 0.4), ...dl.slice(1)];
    const innerAt = y => innerLoop(C, Math.max(y, C.bt)).xz;
    const cache = new Map();
    const getIn = y => { if (!cache.has(y)) cache.set(y, innerAt(y)); return cache.get(y); };
    const chord = (xz, ox, oz, dx, dz) => { // ray-cast line through (ox,oz) along d, return [tmin, tmax]
      let tmin = Infinity, tmax = -Infinity; const n = xz.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = xz[2 * i], az = xz[2 * i + 1], bx = xz[2 * j], bz = xz[2 * j + 1];
        const ex = bx - ax, ez = bz - az, den = dx * ez - dz * ex;
        if (Math.abs(den) < 1e-12) continue;
        const tt = ((ax - ox) * ez - (az - oz) * ex) / den, s = ((ax - ox) * dz - (az - oz) * dx) / den;
        if (s >= 0 && s <= 1) { tmin = Math.min(tmin, tt); tmax = Math.max(tmax, tt); }
      }
      return [tmin, tmax];
    };
    const topXZ = getIn(H * 0.6);
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < topXZ.length; i += 2) { xmin = Math.min(xmin, topXZ[i]); xmax = Math.max(xmax, topXZ[i]); zmin = Math.min(zmin, topXZ[i + 1]); zmax = Math.max(zmax, topXZ[i + 1]); }
    const plates = [];
    if (C.collar && nz >= 2) {
      for (let i = 0; i < nz; i++) { const a = i * 2 * Math.PI / nz + Math.PI / nz; plates.push({ ox: 0, oz: 0, dx: Math.cos(a), dz: Math.sin(a), radial: true }); }
    } else if (nz) {
      for (let i = 1; i <= nz; i++) plates.push({ ox: 0, oz: zmin + (zmax - zmin) * i / (nz + 1), dx: 1, dz: 0 });
    }
    for (let i = 1; i <= nx; i++) plates.push({ ox: xmin + (xmax - xmin) * i / (nx + 1), oz: 0, dx: 0, dz: 1 });
    for (const pl of plates) {
      const px = -pl.dz, pz = pl.dx; // perpendicular
      const ext = y => {
        const xz = getIn(y);
        let lo = -Infinity, hi = Infinity;
        for (const o of [-td / 2, 0, td / 2]) {
          const [a, b] = chord(xz, pl.ox + px * o, pl.oz + pz * o, pl.dx, pl.dz);
          lo = Math.max(lo, pl.radial ? -td : a); hi = Math.min(hi, b);
        }
        return [lo - (pl.radial ? 0 : ov), hi + ov];
      };
      const e0 = ext(dl[Math.floor(dl.length / 2)]);
      if (!isFinite(e0[0]) || !isFinite(e0[1]) || e0[1] - e0[0] < 3) continue;
      const built = solidFromLoops(M, dl2, y => {
        const [lo, hi] = ext(y);
        const h = td / 2;
        const c = (s, o) => [pl.ox + pl.dx * s + px * o, pl.oz + pl.dz * s + pz * o];
        const pts = [c(lo, -h), c(hi, -h), c(hi, h), c(lo, h)];
        return pts.flat();
      }, 'divider');
      if (built) { const [lo, hi] = ext((C.bt + yDivTop) / 2); divVol += (hi - lo - 2 * ov) * td * (yDivTop - C.bt); }
    }
  }

  // ---- label ledge / finger tab (separate shell hugging the inner wall)
  let ledgeInfo = null;
  if (P.labelLedge) {
    const k = C.cut ? (C.front + Math.floor(C.N / 2)) % C.N : C.front;
    const yTop = Math.min(H - 1.6, C.stack ? H - C.hl - C.zc - 0.6 : H - 1.6);
    const Fi = frameLevel(C, new Array(C.N).fill(C.w), true);
    const halfLen = 0.36 * (Fi.s1[k] - Fi.s0[k]);
    const sMid = (Fi.s0[k] + Fi.s1[k]) / 2;
    const depthMax = 0.22 * Math.min(...C.apo);
    const dl = Math.min(9, depthMax);
    const lip = 1.2;
    const yBot = yTop - lip - dl * C.tanT;
    if (yBot > C.bt + 4) {
      const n = C.nrm[k], t = C.tan[k], a0 = C.apo[k] - C.w;
      // cross-section (q = depth into cavity from inner wall, y)
      const sec = [[-ov, yBot - 0.01], [0, yBot], [dl, yTop - lip], [dl, yTop], [-ov, yTop]];
      M.beginShell('ledge');
      const mk = (s) => sec.map(([q, y]) => M.v(a0 * n[0] - q * n[0] + s * t[0], y, a0 * n[1] - q * n[1] + s * t[1]));
      const A = mk(sMid - halfLen), B = mk(sMid + halfLen);
      // orientation check via signed volume later (fixed by global pass)
      const m = sec.length;
      for (let i = 0; i < m; i++) { const i1 = (i + 1) % m; M.t(A[i], A[i1], B[i1]); M.t(A[i], B[i1], B[i]); }
      for (let i = 1; i < m - 1; i++) { M.t(A[0], A[i + 1], A[i]); M.t(B[0], B[i], B[i + 1]); }
      M.endShell();
      ledgeInfo = { side: k };
    }
  }

  // ---- orientation pass: every shell must have positive signed volume
  const pos = M.pos, idx = M.idx;
  const shellVol = (sh) => {
    let v = 0;
    for (let i = sh.start; i < sh.end; i += 3) {
      const a = 3 * idx[i], b = 3 * idx[i + 1], c = 3 * idx[i + 2];
      v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
    }
    return v / 6;
  };
  let volume = 0;
  for (const sh of M.shells) {
    let v = shellVol(sh);
    if (v < 0) { for (let i = sh.start; i < sh.end; i += 3) { const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; } v = -v; }
    sh.volume = v; volume += v;
  }
  // dividers/ledge overlap the wall slightly; subtract the estimated overlap
  const overlapEst = M.shells.filter(s => s.name !== 'body').length * 0;
  const bodyVol = M.shells[0].volume;

  const check = manifoldCheck(M);
  const elapsed = (typeof performance !== 'undefined' ? performance : Date).now() - t0;

  // stats & advisor
  const dens = DENSITY[P.filamentPreset] || 1.24;
  const solidVol = bodyVol + M.shells.filter(s => s.name !== 'body').reduce((a, s) => a + s.volume, 0) * 0.94;
  const stats = {
    bbox: [bbMax[0] - bbMin[0], bbMax[1] - bbMin[1], H],
    pitch: lattice(C),
    volume: solidVol, mass: solidVol / 1000 * dens,
    capacity: Math.max(0, capVol - divVol) / 1000,
    tris: M.idx.length / 3, verts: M.pos.length / 3,
    manifold: check, ms: elapsed,
    density: dens,
  };
  if (C.snap) {
    const s = C.snap;
    stats.strain = 3 * s.t * s.h / (2 * s.Lbeam * s.Lbeam) * 100;
    const lim = STRAIN_LIMIT[P.filamentPreset] || 2.2;
    if (P.filamentPreset === 'PLA (Stiff)' && stats.strain > 2.2) stats.strainWarn = '⚠ High snap strain for PLA — switch to PETG or reduce hook lip';
    else if (stats.strain > lim) stats.strainWarn = `⚠ Snap strain ${stats.strain.toFixed(1)}% exceeds ~${lim}% for ${P.filamentPreset}`;
  }
  const clr = { 'PLA (Stiff)': [0.15, 0.25], 'PETG (Recommended for Snap)': [0.2, 0.3], 'ABS / ASA': [0.2, 0.3], 'TPU (Flex)': [0.1, 0.2] }[P.filamentPreset];
  if (clr && (P.clearance < clr[0] || P.clearance > clr[1]) && P.jointType !== 'none' && P.jointType !== 'magnetic')
    W.push(`Clearance ${P.clearance.toFixed(2)} mm is outside the ${clr[0]}–${clr[1]} mm range typical for ${P.filamentPreset}.`);

  return {
    C, mesh: { pos: Float32Array.from(M.pos), idx: Uint32Array.from(M.idx), tag: Uint8Array.from(M.tag), shells: M.shells },
    stats, warnings: W, ledge: ledgeInfo,
    clip: buildClip(C),
  };
}

function lattice(C) {
  const W = C.P.outerWidth;
  if (C.shape === 'box') return { label: `${C.P.outerWidth.toFixed(1)} × ${C.P.outerDepth.toFixed(1)} mm`, T: [[C.P.outerWidth, 0], [0, C.P.outerDepth]] };
  if (C.shape === 'hexagon' || (C.collar && C.N === 6)) return { label: `${W.toFixed(1)} mm (hex, 60°)`, T: [[W, 0], [W / 2, W * Math.sqrt(3) / 2]] };
  if (C.shape === 'octagon' || (C.collar && C.N === 4)) return { label: `${W.toFixed(1)} mm (square)`, T: [[W, 0], [0, W]] };
  return { label: `${W.toFixed(1)} mm (flat-to-flat, rotated neighbours)`, T: null };
}

export function manifoldCheck(M) {
  const idx = M.idx; let open = 0, nonManifold = 0, flipped = 0;
  for (const sh of M.shells) {
    const map = new Map();
    for (let i = sh.start; i < sh.end; i += 3) {
      for (let e = 0; e < 3; e++) {
        const a = idx[i + e], b = idx[i + (e + 1) % 3];
        const k = a < b ? a * 4294967296 + b : b * 4294967296 + a;
        const r = map.get(k) || [0, 0];
        if (a < b) r[0]++; else r[1]++;
        map.set(k, r);
      }
    }
    for (const r of map.values()) {
      const tot = r[0] + r[1];
      if (tot === 1) open++; else if (tot > 2) nonManifold++; else if (r[0] !== 1) flipped++;
    }
  }
  return { ok: open === 0 && nonManifold === 0 && flipped === 0, open, nonManifold, flipped, shells: M.shells.length };
}

// ---------------------------------------------------------------------------------------------
// Double-male dogbone clip (for all-female polarity)
// ---------------------------------------------------------------------------------------------
function buildClip(C) {
  if (!C.clipDef || !C.clipDef.male) return null;
  const def = C.clipDef.male;
  const Lc = C.yJ1 - C.yJ0, tanT = C.tanT;
  if (!(Lc > 3)) return null;
  const DM = def.kind === 'snapM' ? profDepth(def.prof) : profDepth(def.prof);
  const sl = { ...def, z: y => Math.min(DM, (y + 0.001) / tanT, (Lc - y + 0.001) / tanT) };
  if (def.kind === 'snapM') sl.nSlot = 0.6;
  const M = new MeshBuf();
  const ly = [0, DM * tanT, Lc - DM * tanT, Lc];
  const nseg = Math.max(4, Math.round(Lc / 2));
  for (let i = 1; i < nseg; i++) ly.push(Lc * i / nseg);
  ly.sort((a, b) => a - b);
  const L = ly.filter((v, i) => v >= 0 && v <= Lc && (!i || v - ly[i - 1] > 0.008));
  solidFromLoops(M, L, y => {
    const up = []; slotPoints(sl, y, 0, up);
    const lo = up.map(([u, n]) => [u, -n]).reverse();
    const all = [...up, ...lo.slice(1, lo.length - 1)];
    const out = []; for (const [u, n] of all) out.push(u, n); // local: x = u (along wall), z = n (across contact)
    return out;
  }, 'clip', 1);
  // orientation
  let v = 0; const pos = M.pos, idx = M.idx;
  for (let i = 0; i < idx.length; i += 3) {
    const a = 3 * idx[i], b = 3 * idx[i + 1], c = 3 * idx[i + 2];
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (v < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return { pos: Float32Array.from(M.pos), idx: Uint32Array.from(M.idx), tag: Uint8Array.from(M.tag), shells: M.shells, length: Lc, volume: Math.abs(v / 6), manifold: manifoldCheck(M) };
}

// ---------------------------------------------------------------------------------------------
// Assembly: neighbour placement (2D transforms in plan: rotation by 0 or π + translation)
// ---------------------------------------------------------------------------------------------
export function neighbours(model, mode) {
  const C = model.C, N = C.N, out = [];
  if (mode === 'single') return out;
  const pol = C.polarity;
  const across = (k) => {
    const n = C.nrm[k], a = C.apo[k];
    if (pol === 'alternating' && N % 2 === 0) return { rot: 0, tx: 2 * a * n[0], tz: 2 * a * n[1], side: k };
    return { rot: Math.PI, tx: 2 * a * n[0], tz: 2 * a * n[1], side: k };
  };
  const compose = (A, B) => { // A ∘ B
    const c = Math.cos(A.rot), s = Math.sin(A.rot);
    return { rot: (A.rot + B.rot) % (2 * Math.PI), tx: A.tx + c * B.tx - s * B.tz, tz: A.tz + s * B.tx + c * B.tz, side: -1 };
  };
  const firstActive = () => { for (let k = 0; k < N; k++) if (C.active && C.active[k] && C.sides[k].length) return k; return 0; };
  if (mode === 'vertical-stack') {
    out.push({ rot: 0, tx: 0, tz: 0, ty: stackOffset(C), side: -1, stack: true });
    return out;
  }
  const k0 = firstActive();
  if (mode === 'pair-1x2') { out.push(across(k0)); return out; }
  const k1 = (() => { for (let j = 1; j < N; j++) { const k = (k0 + j) % N; if (C.active && C.active[k] && C.sides[k].length) return k; } return (k0 + 1) % N; })();
  const kAdj = (k0 + 1) % N;
  if (mode === 'cluster-3') { out.push(across(k0)); out.push(across(C.active && C.active[kAdj] ? kAdj : k1)); return out; }
  if (mode === 'grid-2x2') {
    if (N % 2) { for (let k = 0; k < N; k++) out.push(across(k)); return out; }
    const B0 = across(k0), B1 = across(kAdj);
    out.push(B0, B1);
    const opp = (kAdj + N / 2) % N;
    const kd = B0.rot ? opp : kAdj;
    out.push(compose(B0, across(kd)));
    return out;
  }
  return out;
}

export function stackOffset(C) {
  if (!C.stack) return C.H + 2;
  return C.H - C.hl - (C.d - C.zc) * C.tanT;
}

// Engagement offset for a neighbour (0 = separated, 1 = locked)
export function engageOffset(model, nb, e) {
  const C = model.C, f = 1 - e;
  if (nb.stack) return { dx: 0, dy: f * (C.hl + 12), dz: 0 };
  const jt = C.P.jointType;
  if (C.sliding && C.polarity !== 'all-female-clip') {
    let dir = 1;
    if (C.polarity === 'alternating' && nb.side >= 0) {
      const aMale = nb.side < C.N / 2;
      dir = aMale ? -1 : 1;
    }
    return { dx: 0, dy: dir * f * (C.yJ1 - C.yJ0 + C.DM * C.tanT + 3), dz: 0 };
  }
  if (C.polarity === 'all-female-clip' && C.sliding) return { dx: 0, dy: 0, dz: 0, clipDy: f * (C.yJ1 - C.yJ0 + 4) };
  const k = nb.side >= 0 ? nb.side : 0;
  const n = C.nrm[k], d = (C.DF || (jt === 'magnetic' ? 6 : 4)) + 6;
  return { dx: n[0] * f * d, dy: 0, dz: n[1] * f * d, clipDy: 0 };
}

// Clip placements (world, before engage) for clip polarity
export function clipPlacements(model, nbs) {
  const C = model.C; if (!model.clip) return [];
  const out = [];
  for (const nb of nbs) {
    if (nb.side < 0) continue;
    const k = nb.side, n = C.nrm[k], t = C.tan[k], a = C.apo[k];
    for (const sl of C.sides[k]) {
      out.push({ x: a * n[0] + sl.s * t[0], z: a * n[1] + sl.s * t[1], y: C.yJ0, ang: Math.atan2(n[1], n[0]) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Clearance inspection on a horizontal section: min gap between joint features of the primary
// unit and its locked neighbours, plus interference detection.
// ---------------------------------------------------------------------------------------------
export function clearanceAt(model, nbs, y) {
  const C = model.C;
  if (!nbs.length || C.P.jointType === 'none') return null;
  const A = outerLoop(C, y);
  const nA = A.xz.length / 2;
  let minGap = Infinity, interf = 0, samples = 0;
  const segDist = (px, pz, xz) => {
    let m = Infinity; const n = xz.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = xz[2 * i], az = xz[2 * i + 1], bx = xz[2 * j], bz = xz[2 * j + 1];
      const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1e-12;
      const t = clamp(((px - ax) * ex + (pz - az) * ez) / L2, 0, 1);
      const dx = ax + t * ex - px, dz = az + t * ez - pz;
      m = Math.min(m, dx * dx + dz * dz);
    }
    return Math.sqrt(m);
  };
  const inside = (px, pz, xz) => {
    let c = false; const n = xz.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = xz[2 * i], zi = xz[2 * i + 1], xj = xz[2 * j], zj = xz[2 * j + 1];
      if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  for (const nb of nbs) {
    if (nb.side < 0 || nb.stack) continue;
    const c = Math.cos(nb.rot), s = Math.sin(nb.rot);
    const B = new Array(A.xz.length);
    for (let i = 0; i < nA; i++) {
      const x = A.xz[2 * i], z = A.xz[2 * i + 1];
      B[2 * i] = c * x - s * z + nb.tx; B[2 * i + 1] = s * x + c * z + nb.tz;
    }
    const n = C.nrm[nb.side], a = C.apo[nb.side];
    const test = (src, dst, mark) => {
      for (let i = 0; i < nA; i++) {
        if (!mark[i]) continue;
        const px = src[2 * i], pz = src[2 * i + 1];
        const off = px * n[0] + pz * n[1] - a;  // signed distance from contact plane
        if (Math.abs(off) < 0.08 || Math.abs(off) > 20) continue;
        samples++;
        if (inside(px, pz, dst)) { interf++; continue; }
        minGap = Math.min(minGap, segDist(px, pz, dst));
      }
    };
    test(A.xz, B, A.mark);
    test(B, A.xz, A.mark);
  }
  if (!samples) return null;
  return { y, minGap, interf, samples };
}

export { outerLoop, innerLoop, levels, triCap, MeshBuf };

// ---------------------------------------------------------------------------------------------
// Validation + safety net: contours must be simple and nested at key levels and the shell closed.
// If not, retry with smaller joints, then without joints, so an export is never broken.
// ---------------------------------------------------------------------------------------------
function crossingsFast(A, B) {
  // sweep over x-intervals; A and B are flat xz arrays (B may be A)
  const segs = [];
  const add = (xz, id) => { const n = xz.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; const ax = xz[2 * i], az = xz[2 * i + 1], bx = xz[2 * j], bz = xz[2 * j + 1]; segs.push([Math.min(ax, bx), Math.max(ax, bx), ax, az, bx, bz, id, i, n]); } };
  add(A, 0); if (B !== A) add(B, 1);
  segs.sort((p, q) => p[0] - q[0]);
  const e = 1e-9, o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const active = [];
  for (const s of segs) {
    for (let a = active.length - 1; a >= 0; a--) if (active[a][1] < s[0] - 1e-9) active.splice(a, 1);
    for (const t of active) {
      if (B === A) { const d = Math.abs(s[7] - t[7]); if (d <= 1 || d === s[8] - 1) continue; }
      else if (s[6] === t[6]) continue;
      if (Math.max(s[3], s[5]) < Math.min(t[3], t[5]) - 1e-9 || Math.max(t[3], t[5]) < Math.min(s[3], s[5]) - 1e-9) continue;
      const d1 = o(t[2], t[3], t[4], t[5], s[2], s[3]), d2 = o(t[2], t[3], t[4], t[5], s[4], s[5]);
      const d3 = o(s[2], s[3], s[4], s[5], t[2], t[3]), d4 = o(s[2], s[3], s[4], s[5], t[4], t[5]);
      if (((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))) return true;
    }
    active.push(s);
  }
  return false;
}

export function validateModel(m) {
  const C = m.C, H = C.H;
  if (!m.stats.manifold.ok) return 'mesh not closed';
  if (m.clip && !m.clip.manifold.ok) return 'clip not closed';
  const ys = [0, C.cel, C.yB, C.yB + 0.6, C.bt, C.bt + 0.3, H * 0.5, H - 0.3, H];
  if (C.yJ0 !== undefined) ys.push(C.yJ0, C.yJ0 + 0.5, (C.yJ0 + C.yJ1) / 2, C.yJ1 - 0.5);
  if (C.stack) ys.push(C.hl, C.hl + C.Tst * 0.5, C.yW0, H - C.hl * 0.5);
  for (let i = 1; i <= 5; i++) ys.push(C.yB * i / 6);   // base zone: insets change fastest here
  for (const y of ys) {
    if (!(y >= 0 && y <= H)) continue;
    const O = outerLoop(C, y).xz;
    if (crossingsFast(O, O)) return `outer contour self-intersects at y=${y.toFixed(1)}`;
    if (y >= C.bt) {
      const I = innerLoop(C, y).xz;
      if (crossingsFast(I, I)) return `cavity contour self-intersects at y=${y.toFixed(1)}`;
      if (crossingsFast(O, I)) return `wall pierced at y=${y.toFixed(1)}`;
    }
  }
  if (C.stack) {
    const off = stackOffset(C);
    for (const yl of [H - 0.05, H - C.hl * 0.5, off + 0.05]) {
      const yu = yl - off; if (yu < 0 || yu > H) continue;
      if (crossingsFast(outerLoop(C, yu).xz, innerLoop(C, yl).xz)) return 'stacking plug collides';
    }
  }
  return null;
}

export function buildModelSafe(P) {
  let m = buildModel(P);
  let why = validateModel(m);
  if (!why) { m.valid = true; return m; }
  const tries = [];
  if (P.jointType !== 'none') for (const f of [0.75, 0.55, 0.4]) tries.push([{ ...P, jointDepth: Math.max(1.5, P.jointDepth * f), jointWidth: Math.max(3, P.jointWidth * f), hermSpacing: P.hermSpacing, snapHookLip: Math.max(0.4, P.snapHookLip * f) }, `Joint reduced to ${f * 100}% to resolve a geometry conflict (${why}).`]);
  if (P.jointType !== 'none') tries.push([{ ...P, jointsPerSide: 1 }, `Single connector per wall to resolve a geometry conflict (${why}).`]);
  if (P.stackableLip) tries.push([{ ...P, stackableLip: false }, `Stacking rim disabled to resolve a geometry conflict (${why}).`]);
  if (P.jointType !== 'none') tries.push([{ ...P, jointType: 'none' }, `Joints removed — no valid layout for these settings (${why}).`]);
  tries.push([{ ...P, jointType: 'none', stackableLip: false, frontCutout: 0, dividersX: 0, dividersY: 0, labelLedge: false }, `Simplified to a plain container (${why}).`]);
  for (const [Q, msg] of tries) {
    const m2 = buildModel(Q);
    if (!validateModel(m2)) { m2.warnings.unshift('⚠ ' + msg); m2.valid = true; m2.adjusted = Q; return m2; }
  }
  m.valid = false; m.warnings.unshift('⚠ Geometry conflict: ' + why);
  return m;
}
