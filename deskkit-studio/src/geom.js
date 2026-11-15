// DeskKit Studio 3D — solid modelling kernel
// Two watertight primitives:
//   prism()   : vertical extrusion of a closed loop with pockets (blind / through / from below),
//               per-level shape functions (chamfers, fillets, twist, taper, shear) and optional
//               non-flat top (slanted / finger dip) via a per-column band.
//   extrude() : straight extrusion of a 2D profile with holes along any axis.
// Every loop keeps a constant point count across its levels, so walls stitch into closed shells.
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class MeshBuf {
  constructor() { this.pos = []; this.idx = []; this.tag = []; this.shells = []; }
  v(x, y, z) { this.pos.push(x, y, z); return this.pos.length / 3 - 1; }
  t(a, b, c, tg = 0) { this.idx.push(a, b, c); this.tag.push(tg); }
  begin(name) { this._s = this.idx.length; this._n = name; }
  end() { this.shells.push({ name: this._n, start: this._s, end: this.idx.length }); }
}

// ---------------------------------------------------------------- shapes (parametric, insettable)
// Each shape: { n, pt(i, ins) -> [x, z] } ; points CCW in (x, z); ins = inward offset (scalar or {r,f,l,b})
export function rrect(cx, cz, w, d, radii, segs = 8) {
  const R = Array.isArray(radii) ? radii : [radii, radii, radii, radii]; // corners: (+x+z), (-x+z), (-x-z), (+x-z)
  const n = 4 * (segs + 1);
  return {
    n,
    pt(i, ins = 0) {
      const I = typeof ins === 'number' ? { r: ins, f: ins, l: ins, b: ins } : ins;
      const x0 = cx - w / 2 + I.l, x1 = cx + w / 2 - I.r, z0 = cz - d / 2 + I.b, z1 = cz + d / 2 - I.f;
      const k = Math.floor(i / (segs + 1)), j = i % (segs + 1);
      const sx = k === 0 || k === 3 ? 1 : -1, sz = k < 2 ? 1 : -1;
      const insAdj = [(I.r + I.f) / 2, (I.l + I.f) / 2, (I.l + I.b) / 2, (I.r + I.b) / 2][k];
      const rad = clamp(R[k] - insAdj, 0.15, Math.max(0.15, Math.min(x1 - x0, z1 - z0) / 2 - 0.05));
      const ccx = sx > 0 ? x1 - rad : x0 + rad, ccz = sz > 0 ? z1 - rad : z0 + rad;
      const a = (k * Math.PI) / 2 + (j / segs) * (Math.PI / 2);
      return [ccx + rad * Math.cos(a), ccz + rad * Math.sin(a)];
    },
  };
}

// rounded regular polygon (apothem apo, corner radius rc); `side` extra samples along each flat
export function rpoly(N, apo, rc, segs = 6, rot = 0, side = 0) {
  const per = segs + 1 + side, n = N * per;
  const corner = (k, j, ins) => {
    const a = apo - ins, r = clamp(rc - ins, 0.15, a * 0.9);
    const a0 = rot + k * 2 * Math.PI / N, a1 = a0 + 2 * Math.PI / N, am = (a0 + a1) / 2;
    const dc = (a - r) / Math.cos(Math.PI / N), th = a0 + (a1 - a0) * j / segs;
    return [dc * Math.cos(am) + r * Math.cos(th), dc * Math.sin(am) + r * Math.sin(th)];
  };
  return {
    n,
    pt(i, ins = 0) {
      const k = Math.floor(i / per), j = i % per;
      if (j <= segs) return corner(k, j, ins);
      const p = corner(k, segs, ins), q = corner((k + 1) % N, 0, ins), f = (j - segs) / (side + 1);
      return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
    },
  };
}

export function circle(cx, cz, R, n = 64, lobes = 0, lobeDepth = 0) {
  return {
    n,
    pt(i, ins = 0) {
      const th = (i / n) * 2 * Math.PI;
      const r = R - ins - (lobes ? lobeDepth * (1 - Math.cos(lobes * th)) / 2 : 0);
      return [cx + r * Math.cos(th), cz + r * Math.sin(th)];
    },
  };
}

// ---------------------------------------------------------------- caps
// Triangulate a planar-ish cap (projected along its dominant normal axis) with earcut.
// Earcut drops exactly-collinear points; they are re-inserted by splitting edges (no T-junctions).
export function triCap(M, loops, normal, tg = 0) {
  const P = M.pos;
  const ax = Math.abs(normal[0]), ay = Math.abs(normal[1]), az = Math.abs(normal[2]);
  const [iu, iv] = ay >= ax && ay >= az ? [0, 2] : ax >= az ? [2, 1] : [0, 1];
  const U = i => P[3 * i + iu], V = i => P[3 * i + iv];
  const flat = [], contour = [], holes = [];
  loops.forEach((loop, li) => {
    const arr = loop.map(i => new THREE.Vector2(U(i), V(i)));
    flat.push(...loop);
    if (li === 0) contour.push(...arr); else holes.push(arr);
  });
  const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
  const onEdge = (p, q, v) => {
    const pu = U(p), pv = V(p), du = U(q) - pu, dv = V(q) - pv, L2 = du * du + dv * dv;
    if (L2 < 1e-16) return false;
    const wu = U(v) - pu, wv = V(v) - pv, sp = (wu * du + wv * dv) / L2;
    if (sp <= 1e-9 || sp >= 1 - 1e-9) return false;
    const cr = wu * dv - wv * du; return cr * cr < 1e-20 * L2;
  };
  const tris = faces.map(f => [flat[f[0]], flat[f[1]], flat[f[2]]])
    .filter(t => !(onEdge(t[0], t[1], t[2]) || onEdge(t[1], t[2], t[0]) || onEdge(t[2], t[0], t[1])));
  const cand = flat.slice().sort((a, b) => U(a) - U(b)), cu = cand.map(U);
  const lower = v => { let lo = 0, hi = cu.length; while (lo < hi) { const m = (lo + hi) >> 1; if (cu[m] < v) lo = m + 1; else hi = m; } return lo; };
  const out = []; let guard = 0;
  while (tris.length && guard++ < 400000) {
    const t = tris.pop(); let split = false;
    for (let e = 0; e < 3 && !split; e++) {
      const p = t[e], q = t[(e + 1) % 3], x = t[(e + 2) % 3];
      const pu = U(p), pv = V(p), du = U(q) - pu, dv = V(q) - pv, L2 = du * du + dv * dv;
      if (L2 < 1e-16) continue;
      const u0 = Math.min(pu, pu + du) - 1e-6, u1 = Math.max(pu, pu + du) + 1e-6, v0 = Math.min(pv, pv + dv) - 1e-6, v1 = Math.max(pv, pv + dv) + 1e-6;
      let on = null;
      for (let i = lower(u0); i < cand.length && cu[i] <= u1; i++) {
        const v = cand[i]; if (v === p || v === q || v === x) continue;
        const vv = V(v); if (vv < v0 || vv > v1) continue;
        const wu = U(v) - pu, wv = vv - pv, sp = (wu * du + wv * dv) / L2;
        if (sp <= 1e-9 || sp >= 1 - 1e-9) continue;
        const cr = wu * dv - wv * du;
        if (cr * cr < 1e-20 * L2) (on || (on = [])).push([sp, v]);
      }
      if (on) {
        on.sort((a, b) => a[0] - b[0]);
        const seq = [p, ...on.map(o => o[1]), q];
        for (let i = 0; i < seq.length - 1; i++) tris.push([seq[i], seq[i + 1], x]);
        split = true;
      }
    }
    if (!split) out.push(t);
  }
  let s = 0;
  for (const t of out) {
    const a = 3 * t[0], b = 3 * t[1], c = 3 * t[2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    s += (uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] + (ux * vy - uy * vx) * normal[2];
  }
  for (const t of out) s < 0 ? M.t(t[0], t[2], t[1], tg) : M.t(t[0], t[1], t[2], tg);
}

// stitch rows of equal-length loops; flip decided by the caller
function stitch(M, rows, flip, tag = 0) {
  for (let j = 0; j < rows.length - 1; j++) {
    const A = rows[j], B = rows[j + 1], n = A.length;
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n, a = A[i], b = A[i1], c = B[i1], d = B[i];
      if (flip) { M.t(a, c, b, tag); M.t(a, d, c, tag); } else { M.t(a, b, c, tag); M.t(a, c, d, tag); }
    }
  }
}
const area2 = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

// ---------------------------------------------------------------- prism
// o = { name, y0, levels:[y...] (ascending, from y0 to yS), top: null | (x,z)=>y, band: K rows,
//       outer: { n, at(i, y) -> [x,z] }, pockets: [{ n, at(i,y), floor, through, levels:[...], tag }],
//       under: [{ n, at(i,y), depth }], tagOuter, tagCap }
export function prism(M, o) {
  M.begin(o.name || 'prism');
  const yS = o.levels[o.levels.length - 1];
  const K = o.top ? (o.band || 6) : 0;
  const rowsOf = (shape, lv, flatTop) => {
    const rows = [];
    for (const y of lv) { const r = []; for (let i = 0; i < shape.n; i++) { const [x, z] = shape.at(i, y); r.push(M.v(x, y, z)); } rows.push(r); }
    if (K && flatTop) {
      const base = []; for (let i = 0; i < shape.n; i++) base.push(shape.at(i, yS));
      for (let k = 1; k <= K; k++) {
        const u = k / K, r = [];
        for (const [x, z] of base) { const yt = o.top(x, z); r.push(M.v(x, yS + (yt - yS) * u, z)); }
        rows.push(r);
      }
    }
    return rows;
  };
  const ccw = (shape, y) => { const pts = []; for (let i = 0; i < shape.n; i++) pts.push(shape.at(i, y)); return area2(pts) > 0; };
  // frame (x, z, y) is left-handed: an outer CCW loop gets (a,c,b)
  const oRows = rowsOf(o.outer, o.levels, true);
  stitch(M, oRows, ccw(o.outer, o.levels[0]), o.tagOuter || 0);
  const topHoles = [], botHoles = [];
  for (const pk of o.pockets || []) {
    const lv = pk.levels.filter(y => y <= yS + 1e-9);
    const rows = rowsOf(pk, lv, true);
    stitch(M, rows, !ccw(pk, lv[0]), pk.tag ?? 1);
    if (pk.through) botHoles.push(rows[0]); else triCap(M, [rows[0]], [0, 1, 0], pk.tag ?? 1);
    topHoles.push(rows[rows.length - 1]);
  }
  for (const ud of o.under || []) {
    const lv = ud.levels || [o.y0, o.y0 + ud.depth];
    const rows = rowsOf(ud, lv, false);
    stitch(M, rows, !ccw(ud, lv[0]), ud.tag ?? 0);
    triCap(M, [rows[rows.length - 1]], [0, -1, 0], ud.tag ?? 0);
    botHoles.push(rows[0]);
  }
  triCap(M, [oRows[0], ...botHoles], [0, -1, 0], o.tagCap || 0);
  triCap(M, [oRows[oRows.length - 1], ...topHoles], [0, 1, 0], o.tagCap || 0);
  M.end();
}

// ---------------------------------------------------------------- profile extrusion
// loops: [outer, ...holes] as [[u,v],...]; frame: origin O and axes U, V, W (unit vectors, any handedness)
export function extrude(M, o) {
  M.begin(o.name || 'extrude');
  const { O = [0, 0, 0], U, V, W, w0, w1 } = o;
  const map = (u, v, w) => [O[0] + U[0] * u + V[0] * v + W[0] * w, O[1] + U[1] * u + V[1] * v + W[1] * w, O[2] + U[2] * u + V[2] * v + W[2] * w];
  const cr = [U[1] * V[2] - U[2] * V[1], U[2] * V[0] - U[0] * V[2], U[0] * V[1] - U[1] * V[0]];
  const right = cr[0] * W[0] + cr[1] * W[1] + cr[2] * W[2] > 0;
  const capA = [], capB = [];
  o.loops.forEach((loop, li) => {
    const rows = [w0, w1].map(w => loop.map(([u, v]) => M.v(...map(u, v, w))));
    const isOuter = li === 0, isCcw = area2(loop) > 0;
    // left-handed + ccw + outward -> flip ; each toggle inverts
    const flip = ((!right ? 1 : 0) ^ (isCcw ? 1 : 0) ^ (isOuter ? 1 : 0)) === 1;
    stitch(M, rows, flip, o.tag || 0);
    capA.push(rows[0]); capB.push(rows[1]);
  });
  triCap(M, capA, W.map(c => -c), o.tag || 0);
  triCap(M, capB, W, o.tag || 0);
  M.end();
}

// ---------------------------------------------------------------- checks
export function manifoldCheck(M) {
  const idx = M.idx; let open = 0, nonManifold = 0, flipped = 0;
  for (const sh of M.shells) {
    const map = new Map();
    for (let i = sh.start; i < sh.end; i += 3) for (let e = 0; e < 3; e++) {
      const a = idx[i + e], b = idx[i + (e + 1) % 3];
      const k = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      const r = map.get(k) || [0, 0]; if (a < b) r[0]++; else r[1]++; map.set(k, r);
    }
    for (const r of map.values()) { const t = r[0] + r[1]; if (t === 1) open++; else if (t > 2) nonManifold++; else if (r[0] !== 1) flipped++; }
  }
  return { ok: open === 0 && nonManifold === 0 && flipped === 0, open, nonManifold, flipped, shells: M.shells.length };
}

export function shellVolumes(M) {
  const P = M.pos, I = M.idx;
  return M.shells.map(sh => {
    let v = 0;
    for (let i = sh.start; i < sh.end; i += 3) {
      const a = 3 * I[i], b = 3 * I[i + 1], c = 3 * I[i + 2];
      v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
    }
    return v / 6;
  });
}

// make every shell's signed volume positive (consistent outward normals)
export function orientShells(M) {
  const vols = shellVolumes(M);
  M.shells.forEach((sh, k) => {
    if (vols[k] < 0) { for (let i = sh.start; i < sh.end; i += 3) { const t = M.idx[i + 1]; M.idx[i + 1] = M.idx[i + 2]; M.idx[i + 2] = t; } vols[k] = -vols[k]; }
  });
  return vols;
}

// segment-sweep crossing test between two loops (or a loop with itself) — used by validation
export function loopsCross(A, B) {
  const segs = [];
  const add = (pts, id) => { const n = pts.length; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; segs.push([Math.min(p[0], q[0]), Math.max(p[0], q[0]), p[0], p[1], q[0], q[1], id, i, n]); } };
  add(A, 0); if (B !== A) add(B, 1);
  segs.sort((p, q) => p[0] - q[0]);
  const e = 1e-9, o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const act = [];
  for (const s of segs) {
    for (let a = act.length - 1; a >= 0; a--) if (act[a][1] < s[0] - 1e-9) act.splice(a, 1);
    for (const t of act) {
      if (B === A) { const d = Math.abs(s[7] - t[7]); if (d <= 1 || d === s[8] - 1) continue; } else if (s[6] === t[6]) continue;
      const d1 = o(t[2], t[3], t[4], t[5], s[2], s[3]), d2 = o(t[2], t[3], t[4], t[5], s[4], s[5]);
      const d3 = o(s[2], s[3], s[4], s[5], t[2], t[3]), d4 = o(s[2], s[3], s[4], s[5], t[4], t[5]);
      if (((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))) return true;
    }
    act.push(s);
  }
  return false;
}
export const pointIn = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
export const sampleLoop = (shape, y) => { const r = []; for (let i = 0; i < shape.n; i++) r.push(shape.at(i, y)); return r; };
export { area2 };
