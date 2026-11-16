// Binary FBX 7.4 writer (no dependencies besides three + fflate).
// Produces one Null root with one Mesh model per part; materials are shared Phong materials.
// Units: centimetres (UnitScaleFactor = 1), Y-up — the native FBX convention, so Blender,
// Maya, 3ds Max, Unity and Unreal all import it at real-world size.
import * as THREE from 'three';
import { zlibSync } from 'three/addons/libs/fflate.module.js';

const enc = new TextEncoder();

// ---- property helpers -------------------------------------------------------
const L = (v) => ({ t: 'L', v: BigInt(v) });
const I = (v) => ({ t: 'I', v: v | 0 });
const D = (v) => ({ t: 'D', v: +v });
const S = (v) => ({ t: 'S', v: enc.encode(v) });
const R = (v) => ({ t: 'R', v });
const C = (v) => ({ t: 'C', v: v ? 1 : 0 });
const dA = (v) => ({ t: 'd', v: v instanceof Float64Array ? v : Float64Array.from(v) });
const iA = (v) => ({ t: 'i', v: v instanceof Int32Array ? v : Int32Array.from(v) });
const N = (name, props = [], children = []) => ({ name, props, children });
const P = (name, type, type2, flags, ...vals) =>
  N('P', [S(name), S(type), S(type2), S(flags), ...vals]);
const cls = (name, klass) => `${name}\x00\x01${klass}`;

// Fixed header ids — the FBX SDK validates FileId/CreationTime against the footer.
const FILE_ID = new Uint8Array([0x28, 0xb3, 0x2a, 0xeb, 0xb6, 0x24, 0xcc, 0xc2, 0xbf, 0xc8, 0xb0, 0x2a, 0xa9, 0x2b, 0xfc, 0xf1]);
const FOOT_ID = new Uint8Array([0xfa, 0xbc, 0xab, 0x09, 0xd0, 0xc8, 0xd4, 0x66, 0xb1, 0x76, 0xfb, 0x83, 0x1c, 0xf7, 0x26, 0x7e]);
const FOOT_MAGIC = new Uint8Array([0xf8, 0x5a, 0x8c, 0x6a, 0xde, 0xf5, 0xd9, 0x7e, 0xec, 0xe9, 0x0c, 0xe3, 0x75, 0x8f, 0x29, 0x0b]);
const VERSION = 7400;

// ---- byte writer ------------------------------------------------------------
class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.dv = new DataView(this.buf.buffer); this.p = 0; }
  need(n) {
    if (this.p + n <= this.buf.length) return;
    let len = this.buf.length; while (len < this.p + n) len *= 2;
    const nb = new Uint8Array(len); nb.set(this.buf); this.buf = nb; this.dv = new DataView(nb.buffer);
  }
  u8(v) { this.need(1); this.dv.setUint8(this.p, v); this.p += 1; }
  u32(v) { this.need(4); this.dv.setUint32(this.p, v >>> 0, true); this.p += 4; }
  i32(v) { this.need(4); this.dv.setInt32(this.p, v, true); this.p += 4; }
  i64(v) { this.need(8); this.dv.setBigInt64(this.p, v, true); this.p += 8; }
  f64(v) { this.need(8); this.dv.setFloat64(this.p, v, true); this.p += 8; }
  bytes(b) { this.need(b.length); this.buf.set(b, this.p); this.p += b.length; }
  zeros(n) { this.need(n); this.buf.fill(0, this.p, this.p + n); this.p += n; }
  result() { return this.buf.slice(0, this.p); }
}

function writeProp(w, pr) {
  w.u8(pr.t.charCodeAt(0));
  switch (pr.t) {
    case 'L': w.i64(pr.v); break;
    case 'I': w.i32(pr.v); break;
    case 'D': w.f64(pr.v); break;
    case 'C': w.u8(pr.v); break;
    case 'S': case 'R': w.u32(pr.v.length); w.bytes(pr.v); break;
    case 'd': case 'i': {
      const raw = new Uint8Array(pr.v.buffer, pr.v.byteOffset, pr.v.byteLength);
      const big = raw.length > 128;
      const data = big ? zlibSync(raw, { level: 6 }) : raw;
      w.u32(pr.v.length); w.u32(big ? 1 : 0); w.u32(data.length); w.bytes(data);
      break;
    }
    default: throw new Error('FBX: bad prop type ' + pr.t);
  }
}

function writeNode(w, node) {
  const start = w.p;
  w.u32(0); w.u32(node.props.length); w.u32(0);
  const name = enc.encode(node.name);
  w.u8(name.length); w.bytes(name);
  const ps = w.p;
  for (const pr of node.props) writeProp(w, pr);
  const plen = w.p - ps;
  if (node.children.length) for (const c of node.children) writeNode(w, c);
  if (node.children.length || !node.props.length) w.zeros(13); // nested-list sentinel
  w.dv.setUint32(start, w.p, true);
  w.dv.setUint32(start + 8, plen, true);
}

// ---- scene → nodes ----------------------------------------------------------
let uid = 1000000;
const nextId = () => ++uid;

function meshData(mesh) {
  // Bake scale into vertices, keep translation + rotation on the model so each part keeps its pivot.
  mesh.updateWorldMatrix(true, false);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
  mesh.matrixWorld.decompose(pos, quat, scl);
  const euler = new THREE.Euler().setFromQuaternion(quat, 'ZYX'); // = FBX eEulerXYZ

  let g = mesh.geometry;
  if (g.index) g = g.toNonIndexed();
  const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv;
  const n = P.count;
  // weld positions so DCC tools see connected topology
  const map = new Map(), verts = [], idx = new Int32Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).multiply(scl);
    const key = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    let k = map.get(key);
    if (k === undefined) { k = verts.length / 3; map.set(key, k); verts.push(v.x, v.y, v.z); }
    idx[i] = k;
  }
  const pvi = new Int32Array(n);
  for (let i = 0; i < n; i += 3) { pvi[i] = idx[i]; pvi[i + 1] = idx[i + 1]; pvi[i + 2] = ~idx[i + 2]; }
  const normals = new Float64Array(n * 3);
  const inv = new THREE.Vector3(1 / scl.x, 1 / scl.y, 1 / scl.z);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(Nn, i).multiply(inv).normalize();
    normals[i * 3] = v.x; normals[i * 3 + 1] = v.y; normals[i * 3 + 2] = v.z;
  }
  let uvs = null;
  if (U) { uvs = new Float64Array(n * 2); for (let i = 0; i < n; i++) { uvs[i * 2] = U.getX(i); uvs[i * 2 + 1] = U.getY(i); } }
  if (g !== mesh.geometry) g.dispose();
  const deg = THREE.MathUtils.RAD2DEG;
  return { verts, pvi, normals, uvs, t: [pos.x, pos.y, pos.z], r: [euler.x * deg, euler.y * deg, euler.z * deg] };
}

function materialNode(id, name, m) {
  const c = m.color || new THREE.Color(0.8, 0.8, 0.8);
  const rough = m.roughness ?? 0.6, metal = m.metalness ?? 0;
  const opacity = m.transparent ? (m.opacity ?? 1) : (m.transmission ? 1 - m.transmission * 0.7 : 1);
  const shin = Math.max(2, (1 - rough) * (1 - rough) * 100);
  const spec = 0.1 + (1 - rough) * 0.4;
  return N('Material', [L(id), S(cls(name, 'Material')), S('')], [
    N('Version', [I(102)]),
    N('ShadingModel', [S('phong')]),
    N('MultiLayer', [I(0)]),
    N('Properties70', [], [
      P('AmbientColor', 'Color', '', 'A', D(0), D(0), D(0)),
      P('DiffuseColor', 'Color', '', 'A', D(c.r), D(c.g), D(c.b)),
      P('DiffuseFactor', 'Number', '', 'A', D(1)),
      P('SpecularColor', 'Color', '', 'A', D(spec), D(spec), D(spec)),
      P('SpecularFactor', 'Number', '', 'A', D(1)),
      P('ShininessExponent', 'Number', '', 'A', D(shin)),
      P('Shininess', 'Number', '', 'A', D(shin)),
      P('ReflectionFactor', 'Number', '', 'A', D(metal)),
      P('TransparencyFactor', 'Number', '', 'A', D(1 - opacity)),
      P('Opacity', 'Number', '', 'A', D(opacity)),
      P('Emissive', 'Vector3D', 'Vector', '', D(0), D(0), D(0)),
      P('Diffuse', 'Vector3D', 'Vector', '', D(c.r), D(c.g), D(c.b)),
      P('Specular', 'Vector3D', 'Vector', '', D(spec), D(spec), D(spec)),
    ]),
  ]);
}

/**
 * @param {THREE.Object3D} root   group with meshes (scene units = cm)
 * @param {string} rootName
 * @returns {Uint8Array}
 */
export function exportFBX(root, rootName = 'Furniture') {
  uid = 1000000;
  const meshes = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => { if (o.isMesh && o.visible && o.geometry?.attributes?.position) meshes.push(o); });

  const objects = [], conns = [];
  const matIds = new Map(), usedNames = new Map();
  const uniq = (base) => {
    base = (base || 'Part').replace(/[^\w\-. ]+/g, '_');
    const k = usedNames.get(base) || 0; usedNames.set(base, k + 1);
    return k ? `${base}.${String(k).padStart(3, '0')}` : base;
  };

  // Null root
  const rootId = nextId(), rootAttr = nextId();
  objects.push(N('NodeAttribute', [L(rootAttr), S(cls(rootName, 'NodeAttribute')), S('Null')], [N('TypeFlags', [S('Null')])]));
  objects.push(N('Model', [L(rootId), S(cls(rootName, 'Model')), S('Null')], [
    N('Version', [I(232)]),
    N('Properties70', [], [
      P('Lcl Translation', 'Lcl Translation', '', 'A', D(0), D(0), D(0)),
      P('Lcl Rotation', 'Lcl Rotation', '', 'A', D(0), D(0), D(0)),
      P('Lcl Scaling', 'Lcl Scaling', '', 'A', D(1), D(1), D(1)),
    ]),
    N('Shading', [C(true)]), N('Culling', [S('CullingOff')]),
  ]));
  conns.push(N('C', [S('OO'), L(rootId), L(0)]));
  conns.push(N('C', [S('OO'), L(rootAttr), L(rootId)]));

  let nGeo = 0;
  for (const mesh of meshes) {
    const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const mName = m.name || 'Material';
    if (!matIds.has(mName)) {
      const id = nextId(); matIds.set(mName, id);
      objects.push(materialNode(id, mName, m));
    }
    const d = meshData(mesh);
    const name = uniq(mesh.name);
    const gid = nextId(), mid = nextId();
    const layerEls = [
      N('LayerElement', [], [N('Type', [S('LayerElementNormal')]), N('TypedIndex', [I(0)])]),
      N('LayerElement', [], [N('Type', [S('LayerElementMaterial')]), N('TypedIndex', [I(0)])]),
    ];
    const geoChildren = [
      N('Vertices', [dA(d.verts)]),
      N('PolygonVertexIndex', [iA(d.pvi)]),
      N('GeometryVersion', [I(124)]),
      N('LayerElementNormal', [I(0)], [
        N('Version', [I(101)]), N('Name', [S('')]),
        N('MappingInformationType', [S('ByPolygonVertex')]),
        N('ReferenceInformationType', [S('Direct')]),
        N('Normals', [dA(d.normals)]),
      ]),
    ];
    if (d.uvs) {
      const uvIndex = new Int32Array(d.uvs.length / 2); for (let i = 0; i < uvIndex.length; i++) uvIndex[i] = i;
      geoChildren.push(N('LayerElementUV', [I(0)], [
        N('Version', [I(101)]), N('Name', [S('UVMap')]),
        N('MappingInformationType', [S('ByPolygonVertex')]),
        N('ReferenceInformationType', [S('IndexToDirect')]),
        N('UV', [dA(d.uvs)]), N('UVIndex', [iA(uvIndex)]),
      ]));
      layerEls.splice(1, 0, N('LayerElement', [], [N('Type', [S('LayerElementUV')]), N('TypedIndex', [I(0)])]));
    }
    geoChildren.push(
      N('LayerElementMaterial', [I(0)], [
        N('Version', [I(101)]), N('Name', [S('')]),
        N('MappingInformationType', [S('AllSame')]),
        N('ReferenceInformationType', [S('IndexToDirect')]),
        N('Materials', [iA([0])]),
      ]),
      N('Layer', [I(0)], [N('Version', [I(100)]), ...layerEls]),
    );
    objects.push(N('Geometry', [L(gid), S(cls(name, 'Geometry')), S('Mesh')], geoChildren));
    objects.push(N('Model', [L(mid), S(cls(name, 'Model')), S('Mesh')], [
      N('Version', [I(232)]),
      N('Properties70', [], [
        P('Lcl Translation', 'Lcl Translation', '', 'A', D(d.t[0]), D(d.t[1]), D(d.t[2])),
        P('Lcl Rotation', 'Lcl Rotation', '', 'A', D(d.r[0]), D(d.r[1]), D(d.r[2])),
        P('Lcl Scaling', 'Lcl Scaling', '', 'A', D(1), D(1), D(1)),
        P('DefaultAttributeIndex', 'int', 'Integer', '', I(0)),
        P('InheritType', 'enum', '', '', I(1)),
      ]),
      N('Shading', [C(true)]), N('Culling', [S('CullingOff')]),
    ]));
    conns.push(N('C', [S('OO'), L(mid), L(rootId)]));
    conns.push(N('C', [S('OO'), L(gid), L(mid)]));
    conns.push(N('C', [S('OO'), L(matIds.get(mName)), L(mid)]));
    nGeo++;
  }

  const now = new Date();
  const header = N('FBXHeaderExtension', [], [
    N('FBXHeaderVersion', [I(1003)]),
    N('FBXVersion', [I(VERSION)]),
    N('EncryptionType', [I(0)]),
    N('CreationTimeStamp', [], [
      N('Version', [I(1000)]), N('Year', [I(now.getFullYear())]), N('Month', [I(now.getMonth() + 1)]),
      N('Day', [I(now.getDate())]), N('Hour', [I(now.getHours())]), N('Minute', [I(now.getMinutes())]),
      N('Second', [I(now.getSeconds())]), N('Millisecond', [I(0)]),
    ]),
    N('Creator', [S('Furniture Studio 3D')]),
  ]);
  const ip = (n, v) => P(n, 'int', 'Integer', '', I(v));
  const global = N('GlobalSettings', [], [
    N('Version', [I(1000)]),
    N('Properties70', [], [
      ip('UpAxis', 1), ip('UpAxisSign', 1), ip('FrontAxis', 2), ip('FrontAxisSign', 1),
      ip('CoordAxis', 0), ip('CoordAxisSign', 1), ip('OriginalUpAxis', 1), ip('OriginalUpAxisSign', 1),
      P('UnitScaleFactor', 'double', 'Number', '', D(1)),
      P('OriginalUnitScaleFactor', 'double', 'Number', '', D(1)),
      P('AmbientColor', 'ColorRGB', 'Color', '', D(0), D(0), D(0)),
      P('DefaultCamera', 'KString', '', '', S('Producer Perspective')),
      P('TimeMode', 'enum', '', '', I(11)),
      P('TimeSpanStart', 'KTime', 'Time', '', L(0)),
      P('TimeSpanStop', 'KTime', 'Time', '', L(46186158000)),
      P('CustomFrameRate', 'double', 'Number', '', D(-1)),
    ]),
  ]);
  const docId = nextId();
  const documents = N('Documents', [], [
    N('Count', [I(1)]),
    N('Document', [L(docId), S(''), S('Scene')], [
      N('Properties70', [], [P('SourceObject', 'object', '', ''), P('ActiveAnimStackName', 'KString', '', '', S(''))]),
      N('RootNode', [L(0)]),
    ]),
  ]);
  const ot = (type, count) => N('ObjectType', [S(type)], [N('Count', [I(count)])]);
  const definitions = N('Definitions', [], [
    N('Version', [I(100)]),
    N('Count', [I(1 + 2 + nGeo * 2 + matIds.size)]),
    ot('GlobalSettings', 1), ot('NodeAttribute', 1), ot('Model', nGeo + 1), ot('Geometry', nGeo), ot('Material', matIds.size),
  ]);

  const top = [
    header,
    N('FileId', [R(FILE_ID)]),
    N('CreationTime', [S('1970-01-01 10:00:00:000')]),
    N('Creator', [S('Furniture Studio 3D')]),
    global, documents, N('References'), definitions,
    N('Objects', [], objects),
    N('Connections', [], conns),
    N('Takes', [], [N('Current', [S('')])]),
  ];

  const w = new Writer();
  w.bytes(enc.encode('Kaydara FBX Binary  ')); w.u8(0); w.u8(0x1a); w.u8(0);
  w.u32(VERSION);
  for (const n of top) writeNode(w, n);
  w.zeros(13);
  w.bytes(FOOT_ID); w.zeros(4);
  let pad = ((w.p + 15) & ~15) - w.p; if (pad === 0) pad = 16;
  w.zeros(pad);
  w.u32(VERSION); w.zeros(120); w.bytes(FOOT_MAGIC);
  return w.result();
}
