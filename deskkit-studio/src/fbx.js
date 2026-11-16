// Minimal FBX 7.4 binary writer (no dependencies besides fflate for array compression).
// Produces one Model + Mesh Geometry per part, per-polygon materials, per-corner normals and
// vertex colours. Units: millimetres (UnitScaleFactor 0.1 → 1 unit = 1 mm), Y-up.
import { zlibSync } from 'three/addons/libs/fflate.module.js';

const enc = new TextEncoder();
const HEAD = [...enc.encode('Kaydara FBX Binary  '), 0x00, 0x1a, 0x00];
const FOOT_ID = [0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e];
const FOOT_MAGIC = [0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b];
const VERSION = 7400;

// ---- growable little-endian byte writer
class Out {
  constructor() { this.buf = new Uint8Array(1 << 16); this.dv = new DataView(this.buf.buffer); this.n = 0; }
  need(k) { if (this.n + k <= this.buf.length) return; let c = this.buf.length; while (c < this.n + k) c *= 2; const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.n)); this.buf = b; this.dv = new DataView(b.buffer); }
  u8(v) { this.need(1); this.buf[this.n++] = v; }
  bytes(a) { this.need(a.length); this.buf.set(a, this.n); this.n += a.length; }
  u32(v) { this.need(4); this.dv.setUint32(this.n, v, true); this.n += 4; }
  i32(v) { this.need(4); this.dv.setInt32(this.n, v, true); this.n += 4; }
  i16(v) { this.need(2); this.dv.setInt16(this.n, v, true); this.n += 2; }
  i64(v) { this.need(8); this.dv.setBigInt64(this.n, BigInt(v), true); this.n += 8; }
  f64(v) { this.need(8); this.dv.setFloat64(this.n, v, true); this.n += 8; }
  setU32(at, v) { this.dv.setUint32(at, v, true); }
  result() { return this.buf.slice(0, this.n); }
}

// ---- property constructors
const I = v => ({ t: 'I', v }), L = v => ({ t: 'L', v }), D = v => ({ t: 'D', v }), Y = v => ({ t: 'Y', v }), C = v => ({ t: 'C', v });
const S = v => ({ t: 'S', v }), R = v => ({ t: 'R', v });
const AD = v => ({ t: 'd', v }), AI = v => ({ t: 'i', v });
const N = (name, props = [], children = []) => ({ name, props, children });
// FBX binary object names: "Name\x00\x01Class"
const objName = (name, cls) => S(`${name}\u0000\u0001${cls}`);
// Properties70 entry
const P = (name, type, label, flags, ...vals) => N('P', [S(name), S(type), S(label), S(flags), ...vals]);

function writeProp(o, p) {
  switch (p.t) {
    case 'Y': o.u8(0x59); o.i16(p.v); break;
    case 'C': o.u8(0x43); o.u8(p.v ? 1 : 0); break;
    case 'I': o.u8(0x49); o.i32(p.v); break;
    case 'L': o.u8(0x4c); o.i64(p.v); break;
    case 'D': o.u8(0x44); o.f64(p.v); break;
    case 'S': { const b = enc.encode(p.v); o.u8(0x53); o.u32(b.length); o.bytes(b); break; }
    case 'R': o.u8(0x52); o.u32(p.v.length); o.bytes(p.v); break;
    case 'd': case 'i': {
      const isD = p.t === 'd', n = p.v.length;
      const raw = new Uint8Array(n * (isD ? 8 : 4)), dv = new DataView(raw.buffer);
      for (let k = 0; k < n; k++) isD ? dv.setFloat64(8 * k, p.v[k], true) : dv.setInt32(4 * k, p.v[k], true);
      const z = raw.length > 256 ? zlibSync(raw, { level: 6 }) : null;
      o.u8(isD ? 0x64 : 0x69); o.u32(n); o.u32(z ? 1 : 0); o.u32(z ? z.length : raw.length); o.bytes(z || raw);
      break;
    }
    default: throw new Error('fbx: unknown property type ' + p.t);
  }
}
function writeNode(o, node) {
  const start = o.n;
  o.u32(0); o.u32(node.props.length); o.u32(0);
  const name = enc.encode(node.name); o.u8(name.length); o.bytes(name);
  const p0 = o.n; for (const p of node.props) writeProp(o, p);
  o.setU32(start + 8, o.n - p0);
  if (node.children.length) { for (const c of node.children) writeNode(o, c); o.bytes(new Uint8Array(13)); }
  else if (!node.props.length) o.bytes(new Uint8Array(13));
  o.setU32(start, o.n);
}

/**
 * parts: [{ name, pos: Float64Array|number[] (xyz), idx: Uint32Array (triangles), triMat: Uint8Array (material per triangle),
 *          normals?: Float32Array (per triangle corner xyz), colors?: Float32Array (per triangle corner rgb, sRGB 0..1) }]
 * materials: [{ name, color: [r,g,b] (linear 0..1) }]
 */
export function writeFBX(parts, materials, { creator = 'DeskKit Studio 3D', date = new Date() } = {}) {
  let id = 1000000;
  const nid = () => ++id;
  const objects = [], conns = [];
  const matIds = materials.map(() => nid());
  materials.forEach((m, k) => {
    const [r, g, b] = m.color;
    objects.push(N('Material', [L(matIds[k]), objName(m.name, 'Material'), S('')], [
      N('Version', [I(102)]), N('ShadingModel', [S('phong')]), N('MultiLayer', [I(0)]),
      N('Properties70', [], [
        P('DiffuseColor', 'Color', '', 'A', D(r), D(g), D(b)),
        P('DiffuseFactor', 'Number', '', 'A', D(1)),
        P('SpecularColor', 'Color', '', 'A', D(0.2), D(0.2), D(0.2)),
        P('Shininess', 'Number', '', 'A', D(12)),
        P('Opacity', 'double', 'Number', '', D(1)),
      ]),
    ]));
  });
  for (const part of parts) {
    const gid = nid(), mid = nid();
    const nt = part.idx.length / 3;
    const pvi = new Int32Array(part.idx.length);
    for (let t = 0; t < nt; t++) { pvi[3 * t] = part.idx[3 * t]; pvi[3 * t + 1] = part.idx[3 * t + 1]; pvi[3 * t + 2] = -part.idx[3 * t + 2] - 1; }
    // only reference materials actually used by this part
    const used = [...new Set(part.triMat)].sort((a, b) => a - b);
    const local = new Map(used.map((m, k) => [m, k]));
    const mats = new Int32Array(nt); for (let t = 0; t < nt; t++) mats[t] = local.get(part.triMat[t]);
    const layers = [];
    const geomChildren = [
      N('Vertices', [AD(part.pos)]),
      N('PolygonVertexIndex', [AI(pvi)]),
      N('GeometryVersion', [I(124)]),
    ];
    if (part.normals) {
      geomChildren.push(N('LayerElementNormal', [I(0)], [
        N('Version', [I(101)]), N('Name', [S('')]),
        N('MappingInformationType', [S('ByPolygonVertex')]), N('ReferenceInformationType', [S('Direct')]),
        N('Normals', [AD(part.normals)]),
      ]));
      layers.push('LayerElementNormal');
    }
    if (part.colors) {
      const nc = part.colors.length / 3, rgba = new Float64Array(nc * 4);
      for (let k = 0; k < nc; k++) { rgba[4 * k] = part.colors[3 * k]; rgba[4 * k + 1] = part.colors[3 * k + 1]; rgba[4 * k + 2] = part.colors[3 * k + 2]; rgba[4 * k + 3] = 1; }
      const ci = new Int32Array(nc); for (let k = 0; k < nc; k++) ci[k] = k;
      geomChildren.push(N('LayerElementColor', [I(0)], [
        N('Version', [I(101)]), N('Name', [S('Col')]),
        N('MappingInformationType', [S('ByPolygonVertex')]), N('ReferenceInformationType', [S('IndexToDirect')]),
        N('Colors', [AD(rgba)]), N('ColorIndex', [AI(ci)]),
      ]));
      layers.push('LayerElementColor');
    }
    geomChildren.push(N('LayerElementMaterial', [I(0)], [
      N('Version', [I(101)]), N('Name', [S('')]),
      N('MappingInformationType', [S(used.length > 1 ? 'ByPolygon' : 'AllSame')]), N('ReferenceInformationType', [S('IndexToDirect')]),
      N('Materials', [AI(used.length > 1 ? mats : new Int32Array([0]))]),
    ]));
    layers.push('LayerElementMaterial');
    geomChildren.push(N('Layer', [I(0)], [N('Version', [I(100)]), ...layers.map(t => N('LayerElement', [], [N('Type', [S(t)]), N('TypedIndex', [I(0)])]))]));
    objects.push(N('Geometry', [L(gid), objName(part.name, 'Geometry'), S('Mesh')], geomChildren));
    objects.push(N('Model', [L(mid), objName(part.name, 'Model'), S('Mesh')], [
      N('Version', [I(232)]),
      N('Properties70', [], [P('DefaultAttributeIndex', 'int', 'Integer', '', I(0)), P('InheritType', 'enum', '', '', I(1))]),
      N('Shading', [C(true)]), N('Culling', [S('CullingOff')]),
    ]));
    conns.push(N('C', [S('OO'), L(mid), L(0)]), N('C', [S('OO'), L(gid), L(mid)]));
    for (const m of used) conns.push(N('C', [S('OO'), L(matIds[m]), L(mid)]));
  }
  const pad = v => String(v).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}:000`;
  const root = [
    N('FBXHeaderExtension', [], [
      N('FBXHeaderVersion', [I(1003)]), N('FBXVersion', [I(VERSION)]), N('EncryptionType', [I(0)]),
      N('CreationTimeStamp', [], [N('Version', [I(1000)]), N('Year', [I(date.getFullYear())]), N('Month', [I(date.getMonth() + 1)]), N('Day', [I(date.getDate())]), N('Hour', [I(date.getHours())]), N('Minute', [I(date.getMinutes())]), N('Second', [I(date.getSeconds())]), N('Millisecond', [I(0)])]),
      N('Creator', [S(creator)]),
    ]),
    N('FileId', [R(new Uint8Array([0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1]))]),
    N('CreationTime', [S(stamp)]),
    N('Creator', [S(creator)]),
    N('GlobalSettings', [], [
      N('Version', [I(1000)]),
      N('Properties70', [], [
        P('UpAxis', 'int', 'Integer', '', I(1)), P('UpAxisSign', 'int', 'Integer', '', I(1)),
        P('FrontAxis', 'int', 'Integer', '', I(2)), P('FrontAxisSign', 'int', 'Integer', '', I(1)),
        P('CoordAxis', 'int', 'Integer', '', I(0)), P('CoordAxisSign', 'int', 'Integer', '', I(1)),
        P('OriginalUpAxis', 'int', 'Integer', '', I(1)), P('OriginalUpAxisSign', 'int', 'Integer', '', I(1)),
        P('UnitScaleFactor', 'double', 'Number', '', D(0.1)), P('OriginalUnitScaleFactor', 'double', 'Number', '', D(0.1)),
      ]),
    ]),
    N('Documents', [], [N('Count', [I(1)]), N('Document', [L(nid()), S('Scene'), S('Scene')], [N('Properties70', []), N('RootNode', [L(0)])])]),
    N('References', []),
    N('Definitions', [], [
      N('Version', [I(100)]), N('Count', [I(1 + 2 * parts.length + materials.length)]),
      N('ObjectType', [S('GlobalSettings')], [N('Count', [I(1)])]),
      N('ObjectType', [S('Model')], [N('Count', [I(parts.length)])]),
      N('ObjectType', [S('Geometry')], [N('Count', [I(parts.length)])]),
      N('ObjectType', [S('Material')], [N('Count', [I(materials.length)])]),
    ]),
    N('Objects', [], objects),
    N('Connections', [], conns),
  ];
  const o = new Out();
  o.bytes(HEAD); o.u32(VERSION);
  for (const n of root) writeNode(o, n);
  o.bytes(new Uint8Array(13));
  o.bytes(FOOT_ID); o.bytes(new Uint8Array(4));
  let padN = ((o.n + 15) & ~15) - o.n; if (padN === 0) padN = 16;
  o.bytes(new Uint8Array(padN)); o.u32(VERSION); o.bytes(new Uint8Array(120)); o.bytes(FOOT_MAGIC);
  return o.result();
}
