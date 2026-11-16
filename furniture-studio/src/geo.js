// Part builder: every furniture generator composes primitives through this API.
// Units: centimetres. Y up, floor at y = 0, front of the object faces +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
export const TEX_CM = 60; // one texture tile = 60 cm

/** Box-projected UVs; the wood grain (texture U) follows the longest axis of the part. */
export function boxUV(geo) {
  geo.computeBoundingBox();
  const s = new THREE.Vector3(); geo.boundingBox.getSize(s);
  const P = geo.attributes.position, N = geo.attributes.normal;
  const uv = new Float32Array(P.count * 2);
  const ax = ['x', 'y', 'z'];
  for (let i = 0; i < P.count; i++) {
    const n = [Math.abs(N.getX(i)), Math.abs(N.getY(i)), Math.abs(N.getZ(i))];
    const k = n[0] > n[1] ? (n[0] > n[2] ? 0 : 2) : (n[1] > n[2] ? 1 : 2);
    let a = (k + 1) % 3, b = (k + 2) % 3;
    if (s[ax[b]] > s[ax[a]]) [a, b] = [b, a];
    const p = [P.getX(i), P.getY(i), P.getZ(i)];
    uv[i * 2] = p[a] / TEX_CM; uv[i * 2 + 1] = p[b] / TEX_CM + k * 0.37;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
/** Native lathe/cylinder UVs (u around, v along) → grain along the length, in cm scale. */
function lengthUV(geo, len, circ) {
  const U = geo.attributes.uv; if (!U) return geo;
  for (let i = 0; i < U.count; i++) { const u = U.getX(i), v = U.getY(i); U.setXY(i, v * len / TEX_CM, u * circ / TEX_CM); }
  return geo;
}
function flat(geo) { const g = geo.toNonIndexed(); g.computeVertexNormals(); geo.dispose(); return g; }

// ---- 2D outlines -------------------------------------------------------------
export function outline(type, w, d, r = 4) {
  const s = new THREE.Shape();
  const hw = w / 2, hd = d / 2;
  if (type === 'bulat' || type === 'oval') { s.absellipse(0, 0, hw, hd, 0, Math.PI * 2, false, 0); return s; }
  if (type === 'kapsul') r = Math.min(hw, hd);
  if (type === 'persegi') r = 0.01;
  if (type === 'lunak') {               // soft "squircle"
    const n = 72, e = 4;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2, c = Math.cos(t), si = Math.sin(t);
      const x = hw * Math.sign(c) * Math.abs(c) ** (2 / e), y = hd * Math.sign(si) * Math.abs(si) ** (2 / e);
      i ? s.lineTo(x, y) : s.moveTo(x, y);
    }
    return s;
  }
  r = Math.max(0.01, Math.min(r, hw - 0.01, hd - 0.01));
  s.moveTo(-hw + r, -hd); s.lineTo(hw - r, -hd); s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r); s.quadraticCurveTo(hw, hd, hw - r, hd); s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r); s.lineTo(-hw, -hd + r); s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}

/** Polyline with rounded corners → CurvePath (used for bent tube frames). */
export function bentPath(pts, radius) {
  const path = new THREE.CurvePath();
  const P = pts.map((p) => (p.isVector3 ? p : V(...p)));
  let cur = P[0].clone();
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    if (!c) { path.add(new THREE.LineCurve3(cur, b.clone())); break; }
    const d1 = b.clone().sub(a), d2 = c.clone().sub(b);
    const r = Math.min(radius, d1.length() / 2.01, d2.length() / 2.01);
    const p1 = b.clone().sub(d1.normalize().multiplyScalar(r));
    const p2 = b.clone().add(d2.normalize().multiplyScalar(r));
    if (cur.distanceTo(p1) > 1e-4) path.add(new THREE.LineCurve3(cur, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b.clone(), p2));
    cur = p2;
  }
  return path;
}

export class Builder {
  constructor(mats, detail = 1) {
    this.root = new THREE.Group();
    this.cur = this.root;
    this.mats = mats;
    this.q = detail;            // 0.5 = low, 1 = normal, 2 = high
  }
  seg(n) { return Math.max(3, Math.round(n * this.q)); }

  add(geo, slot, name, x = 0, y = 0, z = 0, rot) {
    const m = new THREE.Mesh(geo, this.mats[slot]);
    m.name = name; m.userData.slot = slot;
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    m.castShadow = true; m.receiveShadow = true;
    this.cur.add(m);
    return m;
  }
  /** Sub-group with its own pivot (doors, drawers). */
  group(name, x, y, z, fn) {
    const g = new THREE.Group(); g.name = name; g.position.set(x, y, z);
    this.cur.add(g); const prev = this.cur; this.cur = g;
    fn(g); this.cur = prev; return g;
  }

  /** Centered box; o.r = edge radius, o.rot = [rx,ry,rz]. */
  box(slot, name, w, h, d, x, y, z, o = {}) {
    if (w <= 0.01 || h <= 0.01 || d <= 0.01) return null;
    const r = Math.min(o.r || 0, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
    const geo = r > 0.08 ? new RoundedBoxGeometry(w, h, d, Math.max(1, Math.round(3 * this.q)), r) : new THREE.BoxGeometry(w, h, d);
    return this.add(o.uv01 ? geo : boxUV(geo), slot, name, x, y, z, o.rot);
  }
  /** Box resting on y0 (bottom face at y0). */
  boxY(slot, name, w, h, d, x, y0, z, o) { return this.box(slot, name, w, h, d, x, y0 + h / 2, z, o); }

  /** Round (seg≥8) or square (seg=4) rod between two points with radius r0 at a and r1 at b. */
  rod(slot, name, a, b, r0, r1 = r0, seg = 16) {
    a = a.isVector3 ? a : V(...a); b = b.isVector3 ? b : V(...b);
    const dir = b.clone().sub(a), len = dir.length(); if (len < 0.01) return null;
    const sq = seg === 4;
    let geo = new THREE.CylinderGeometry(sq ? r1 * Math.SQRT2 : r1, sq ? r0 * Math.SQRT2 : r0, len, sq ? 4 : this.seg(seg), 1);
    if (sq) { geo.rotateY(Math.PI / 4); geo = flat(geo); boxUV(geo); }
    else lengthUV(geo, len, Math.PI * 2 * Math.max(r0, r1));
    const m = this.add(geo, slot, name, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    return m;
  }
  /** Vertical cylinder standing on y0. */
  cyl(slot, name, rTop, rBot, h, x, y0, z, seg = 32, o = {}) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, this.seg(seg), 1, !!o.open);
    lengthUV(geo, h, Math.PI * 2 * Math.max(rTop, rBot));
    return this.add(geo, slot, name, x, y0 + h / 2, z, o.rot);
  }
  /** Lathe from [radius, y] pairs; placed with its y=0 at y0. */
  lathe(slot, name, pts, x, y0, z, seg = 40, o = {}) {
    const v2 = pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
    const geo = new THREE.LatheGeometry(v2, this.seg(seg), o.phiStart || 0, o.phiLength || Math.PI * 2);
    let len = 0; for (let i = 1; i < v2.length; i++) len += v2[i].distanceTo(v2[i - 1]);
    lengthUV(geo, len, Math.PI * 2 * Math.max(...pts.map((p) => p[0])));
    return this.add(geo, slot, name, x, y0, z, o.rot);
  }
  /** Tube along a bent polyline (metal frames, hairpins, rails). Ends are capped with spheres. */
  tube(slot, name, pts, r, bend = 4, o = {}) {
    const path = bentPath(pts, bend);
    const len = path.getLength();
    const geo = new THREE.TubeGeometry(path, this.seg(Math.max(8, Math.ceil(len / 3))), r, this.seg(o.radial || 10), false);
    const U = geo.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * len / TEX_CM, U.getY(i) * 2 * Math.PI * r / TEX_CM);
    const m = this.add(geo, slot, name);
    if (o.caps !== false) {
      for (const p of [pts[0], pts[pts.length - 1]]) this.sphere(slot, name + ' cap', r, ...(p.isVector3 ? p.toArray() : p), 8);
    }
    return m;
  }
  sphere(slot, name, r, x, y, z, seg = 24, o = {}) {
    const geo = new THREE.SphereGeometry(r, this.seg(seg), this.seg(Math.max(6, seg * 0.66)));
    if (o.scale) geo.scale(...o.scale);
    lengthUV(geo, Math.PI * r, Math.PI * 2 * r);
    return this.add(geo, slot, name, x, y, z, o.rot);
  }
  torus(slot, name, R, r, x, y, z, rot, arc = Math.PI * 2) {
    const geo = new THREE.TorusGeometry(R, r, this.seg(10), this.seg(48), arc);
    lengthUV(geo, 1, 1);
    const U = geo.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, U.getY(i) * 2 * Math.PI * R / TEX_CM, U.getX(i) * 2 * Math.PI * r / TEX_CM);
    return this.add(geo, slot, name, x, y, z, rot);
  }
  /**
   * Flat slab from an outline (tabletops, seats, shelves) lying in XZ, bottom at y0.
   * edge: 'siku' square | 'bevel' chamfer | 'bulat' rounded | 'tipis' knife edge.
   */
  slab(slot, name, shape, w, d, t, x, y0, z, o = {}) {
    const edge = o.edge || 'siku';
    let bs = 0, bt = 0, segs = 1;
    if (edge === 'bevel') { bs = bt = Math.min(t * 0.3, 1.2); }
    if (edge === 'bulat') { bs = bt = t * 0.48; segs = Math.max(2, Math.round(4 * this.q)); }
    if (edge === 'tipis') { bt = t * 0.45; bs = Math.min(w, d) * 0.04; segs = 2; }
    const shp = outline(shape, w - bs * 2, d - bs * 2, Math.max(0.01, (o.r ?? 4) - bs));
    const depth = Math.max(0.05, t - bt * 2);
    const geo = new THREE.ExtrudeGeometry(shp, {
      depth, bevelEnabled: bs > 0, bevelSize: bs, bevelThickness: bt, bevelSegments: segs,
      curveSegments: this.seg(shape === 'persegi' ? 1 : 12),
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, bt, 0);
    geo.computeVertexNormals();
    return this.add(boxUV(geo), slot, name, x, y0, z, o.rot);
  }
  /** Vertical profile extruded along X (chair backs, headboards, arched mirrors). Outline in XY. */
  panel(slot, name, shape2d, t, x, y, z, o = {}) {
    const bs = o.round ? Math.min(t * 0.45, 2) : 0;
    const geo = new THREE.ExtrudeGeometry(shape2d, {
      depth: Math.max(0.05, t - bs * 2), bevelEnabled: bs > 0, bevelSize: bs * 0.8, bevelThickness: bs, bevelSegments: bs ? 3 : 1,
      curveSegments: this.seg(16),
    });
    geo.translate(0, 0, -t / 2 + bs);
    geo.computeVertexNormals();
    return this.add(boxUV(geo), slot, name, x, y, z, o.rot);
  }
  /** Curved board: a box bent around a vertical axis (curved chair backs). bend = sagitta in cm. */
  curvedBoard(slot, name, w, h, t, bend, x, y, z, o = {}) {
    if (w < 0.5 || h < 0.2 || t < 0.1) return null;
    const geo = new RoundedBoxGeometry(w, h, t, 2, Math.min(o.r ?? 0.6, t / 2 - 0.01, h / 2 - 0.01));
    if (Math.abs(bend) > 0.05) {
      const g2 = new THREE.BoxGeometry(w, h, t, this.seg(24), 1, 1);
      // use a segmented box so the bend is smooth
      const P = g2.attributes.position;
      for (let i = 0; i < P.count; i++) { const u = P.getX(i) / (w / 2); P.setZ(i, P.getZ(i) + bend * u * u); }
      g2.computeVertexNormals(); geo.dispose();
      return this.add(boxUV(g2), slot, name, x, y, z, o.rot);
    }
    return this.add(boxUV(geo), slot, name, x, y, z, o.rot);
  }
}

export { V };
