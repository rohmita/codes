import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { Builder } from './geo.js';
import { TYPES, CATEGORIES, defaults, allParams } from './types.js';
import { exportFBX } from './fbx.js';
import { makeTextures } from './textures.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, attrs = {}, html) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html !== undefined) e.innerHTML = html; return e; };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };

// ---------------------------------------------------------------- icons
const I = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;
$('#undoBtn').insertAdjacentHTML('afterbegin', svg('undo'));
$('#redoBtn').insertAdjacentHTML('afterbegin', svg('redo'));
$('#randBtn').insertAdjacentHTML('afterbegin', svg('dice'));
$('#viewBtn').insertAdjacentHTML('afterbegin', svg('eye'));
$('#exportBtn').insertAdjacentHTML('afterbegin', svg('download'));

// ---------------------------------------------------------------- materials
const FINISHES = {
  kayu: { l: 'Kayu', rough: 0.58, tex: 'wood', bump: 0.6 },
  matte: { l: 'Doff', rough: 0.86 },
  satin: { l: 'Satin', rough: 0.45 },
  glossy: { l: 'Glossy', rough: 0.14, clear: 0.7 },
  logam: { l: 'Logam', rough: 0.3, metal: 1 },
  kain: { l: 'Kain', rough: 0.95, tex: 'fabric', bump: 1, sheen: 0.5 },
  beludru: { l: 'Beludru', rough: 0.8, tex: 'velvet', sheen: 1, sheenRough: 0.35 },
  kulit: { l: 'Kulit', rough: 0.48, tex: 'leather', bump: 0.6, clear: 0.15 },
  anyaman: { l: 'Rotan', rough: 0.7, tex: 'weave', bump: 1.4 },
  marmer: { l: 'Marmer', rough: 0.16, tex: 'marble', clear: 0.4 },
  kaca: { l: 'Kaca', rough: 0.04, glass: true },
};
const SLOT_ORDER = ['utama', 'sekunder', 'kain', 'aksen', 'kaca'];
const SWATCHES = ['#f2efe9', '#d9d3c9', '#9a9a98', '#4a4a4c', '#1f1f21', '#e2c9a0', '#c49a6c', '#9c6a43', '#6b4a33', '#3e2a1f',
  '#c56d4b', '#d9a441', '#c8b48a', '#7d8b6a', '#4f6e57', '#6f8fa3', '#2f4a66', '#7a4b5e', '#e3b8b0', '#b8925a', '#c7c9cc', '#e9e1cc'];

const PAL_FURN = [
  { n: 'Skandinavia', soft: ['#8fa3a8', 'kain'], m: { utama: ['#dcc09a', 'kayu'], sekunder: ['#dcc09a', 'kayu'], kain: ['#e6e1d8', 'kain'], aksen: ['#2b2b2d', 'logam'] } },
  { n: 'Walnut', soft: ['#c98b5a', 'beludru'], m: { utama: ['#6b4a33', 'kayu'], sekunder: ['#6b4a33', 'kayu'], kain: ['#c9b79c', 'kain'], aksen: ['#b8925a', 'logam'] } },
  { n: 'Industrial', soft: ['#b7a48b', 'kain'], m: { utama: ['#8a6a4f', 'kayu'], sekunder: ['#2a2a2c', 'logam'], kain: ['#5a3e2e', 'kulit'], aksen: ['#2a2a2c', 'logam'] } },
  { n: 'Japandi', soft: ['#8c8a6e', 'kain'], m: { utama: ['#b99572', 'kayu'], sekunder: ['#3a3532', 'matte'], kain: ['#d9d2c5', 'kain'], aksen: ['#3a3532', 'matte'] } },
  { n: 'Mid-century', soft: ['#3e6b6a', 'beludru'], m: { utama: ['#9c5f35', 'kayu'], sekunder: ['#9c5f35', 'kayu'], kain: ['#c99a3c', 'beludru'], aksen: ['#b8925a', 'logam'] } },
  { n: 'Putih modern', soft: ['#d9a441', 'kain'], m: { utama: ['#f2f0ec', 'satin'], sekunder: ['#c7c9cc', 'logam'], kain: ['#8c8f93', 'kain'], aksen: ['#c7c9cc', 'logam'] } },
  { n: 'Hitam & emas', soft: ['#c9a25e', 'beludru'], m: { utama: ['#262422', 'satin'], sekunder: ['#262422', 'satin'], kain: ['#3e5246', 'beludru'], aksen: ['#c9a25e', 'logam'] } },
  { n: 'Pastel', soft: ['#e3b8b0', 'beludru'], m: { utama: ['#f1dccf', 'satin'], sekunder: ['#e8c9b8', 'satin'], kain: ['#b7d3c8', 'beludru'], aksen: ['#f4f1ea', 'glossy'] } },
  { n: 'Rotan tropis', soft: ['#c56d4b', 'kain'], m: { utama: ['#d0ab73', 'anyaman'], sekunder: ['#8a5a36', 'kayu'], kain: ['#efe9dd', 'kain'], aksen: ['#3b2a1e', 'matte'] } },
  { n: 'Marmer', soft: ['#7d8b6a', 'beludru'], m: { utama: ['#ece9e4', 'marmer'], sekunder: ['#b8925a', 'logam'], kain: ['#e1d6c6', 'beludru'], aksen: ['#b8925a', 'logam'] } },
  { n: 'Terracotta', soft: ['#4f6e57', 'kain'], m: { utama: ['#c56d4b', 'matte'], sekunder: ['#8c5a3c', 'kayu'], kain: ['#e8d8c0', 'kain'], aksen: ['#3b2a1e', 'matte'] } },
  { n: 'Navy', soft: ['#d9a441', 'beludru'], m: { utama: ['#2f4a66', 'satin'], sekunder: ['#c49a6c', 'kayu'], kain: ['#2f4a66', 'beludru'], aksen: ['#b8925a', 'logam'] } },
];
const PAL_APPL = [
  { n: 'Putih', m: { utama: ['#efeeea', 'glossy'], sekunder: ['#d9d9d6', 'satin'], aksen: ['#c7c9cc', 'logam'] } },
  { n: 'Stainless', m: { utama: ['#b9bcc0', 'logam'], sekunder: ['#9fa3a8', 'logam'], aksen: ['#2a2a2c', 'satin'] } },
  { n: 'Hitam doff', m: { utama: ['#232325', 'matte'], sekunder: ['#2f2f32', 'satin'], aksen: ['#8a8d91', 'logam'] } },
  { n: 'Retro mint', m: { utama: ['#a9d4c2', 'glossy'], sekunder: ['#efeeea', 'glossy'], aksen: ['#d9dadc', 'logam'] } },
  { n: 'Krem', m: { utama: ['#ece0c8', 'glossy'], sekunder: ['#d8c9ad', 'satin'], aksen: ['#b8925a', 'logam'] } },
  { n: 'Merah retro', m: { utama: ['#b8372f', 'glossy'], sekunder: ['#efeeea', 'glossy'], aksen: ['#d9dadc', 'logam'] } },
];
const palettesFor = (type) => (TYPES[type].cat === 'alat' ? PAL_APPL : PAL_FURN);

const TEX = makeTextures();
function finishMaterial(mat, spec) {
  const f = FINISHES[spec.f] || FINISHES.satin;
  mat.color.set(spec.c);
  mat.roughness = f.rough; mat.metalness = f.metal || 0;
  mat.map = f.tex ? TEX[f.tex].map : null;
  mat.bumpMap = f.tex && f.bump ? TEX[f.tex].bump : null;
  mat.bumpScale = f.bump || 0;
  mat.clearcoat = f.clear || 0; mat.clearcoatRoughness = 0.25;
  mat.sheen = f.sheen || 0; mat.sheenRoughness = f.sheenRough ?? 0.6; mat.sheenColor.set(spec.c).lerp(new THREE.Color('#ffffff'), 0.25);
  mat.transmission = f.glass ? 0.92 : 0; mat.thickness = f.glass ? 1.2 : 0; mat.ior = 1.5;
  mat.envMapIntensity = f.metal ? 1.1 : 0.9;
  mat.needsUpdate = true;
}
function makeMats() {
  const mats = {};
  const mk = (name, o = {}) => { const m = new THREE.MeshPhysicalMaterial({ color: '#cccccc', roughness: 0.6, ...o }); m.name = name; return m; };
  for (const s of SLOT_ORDER) mats[s] = mk({ utama: 'Utama', sekunder: 'Sekunder', kain: 'Kain', aksen: 'Aksen', kaca: 'Kaca' }[s]);
  mats.gelap = mk('Hitam', { color: '#1c1c1e', roughness: 0.65 });
  mats.layar = mk('Layar', { color: '#0b0c0e', roughness: 0.12, clearcoat: 1 });
  mats.layarBiru = mk('Layar_menyala', { color: '#000000', roughness: 0.15, emissive: '#ffffff', emissiveMap: TEX.screenBlue, emissiveIntensity: 1 });
  mats.layarSenja = mk('Layar_senja', { color: '#000000', roughness: 0.15, emissive: '#ffffff', emissiveMap: TEX.screenDusk, emissiveIntensity: 1 });
  mats.kasur = mk('Kasur', { color: '#f3f0ea', roughness: 0.95, map: TEX.fabric.map, bumpMap: TEX.fabric.bump, bumpScale: 0.6, sheen: 0.4 });
  mats.cermin = mk('Cermin', { color: '#dfe7ea', roughness: 0.05, metalness: 1, envMapIntensity: 1.8, emissive: '#8f9ea5', emissiveIntensity: 0.32 });
  mats.lampu = mk('Lampu', { color: '#fff4dc', roughness: 0.4, emissive: '#ffcf8a', emissiveIntensity: 0.9 });
  mats.interior = mk('Interior', { color: '#f2f2f0', roughness: 0.4 });
  mats.dekor = mk('Keramik', { color: '#e6ded0', roughness: 0.2, clearcoat: 0.6 });
  mats.logamGelap = mk('Logam_gelap', { color: '#6d7075', roughness: 0.35, metalness: 0.9 });
  ['#8a3b2e', '#2f4a66', '#c9a25e', '#4f6e57', '#e8e0cf', '#3a3532'].forEach((c, i) => { mats['buku' + (i + 1)] = mk('Buku_' + (i + 1), { color: c, roughness: 0.75 }); });
  return mats;
}

// ---------------------------------------------------------------- state
const typeKeys = Object.keys(TYPES);
const freshType = (t) => ({ params: defaults(t), mats: JSON.parse(JSON.stringify(TYPES[t].mats)) });
const saved = store.get('furniture-studio:v1');
const state = { type: 'kursi', cat: 'duduk', per: {}, slot: 'utama', q: 1, view: { rotate: false, dims: false, grid: true, shadow: true, wire: false } };
if (saved && TYPES[saved.type]) Object.assign(state, { type: saved.type, per: saved.per || {}, q: saved.q || 1, view: { ...state.view, ...(saved.view || {}) } });
state.cat = TYPES[state.type].cat;
function cur(t = state.type) {
  if (!state.per[t]) state.per[t] = freshType(t);
  const c = state.per[t];
  // forward-compat: fill in params added later
  const d = defaults(t); for (const k in d) if (!(k in c.params)) c.params[k] = d[k];
  for (const s of SLOT_ORDER) if (!c.mats[s]) c.mats[s] = TYPES[t].mats[s] || { c: '#cfe3e0', f: s === 'kaca' ? 'kaca' : 'satin' };
  return c;
}
const persist = () => store.set('furniture-studio:v1', { type: state.type, per: state.per, q: state.q, view: state.view });

// undo history (snapshots of {type, params, mats})
const hist = { stack: [], i: -1, timer: 0 };
const snap = () => JSON.stringify({ type: state.type, ...cur() });
function pushHist(immediate) {
  clearTimeout(hist.timer);
  const go = () => {
    const s = snap();
    if (hist.stack[hist.i] === s) return;
    hist.stack.splice(hist.i + 1); hist.stack.push(s);
    if (hist.stack.length > 100) hist.stack.shift();
    hist.i = hist.stack.length - 1; updHistBtns();
  };
  immediate ? go() : (hist.timer = setTimeout(go, 350));
}
function restore(s) {
  const o = JSON.parse(s);
  state.type = o.type; state.cat = TYPES[o.type].cat;
  state.per[o.type] = { params: o.params, mats: o.mats };
  renderAll(false); rebuild(); persist();
}
function undo() { if (hist.i > 0) { hist.i--; restore(hist.stack[hist.i]); updHistBtns(); } }
function redo() { if (hist.i < hist.stack.length - 1) { hist.i++; restore(hist.stack[hist.i]); updHistBtns(); } }
function updHistBtns() { $('#undoBtn').disabled = hist.i <= 0; $('#redoBtn').disabled = hist.i >= hist.stack.length - 1; }

// ---------------------------------------------------------------- scene
const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.prepend(renderer.domElement);
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(34, 1, 1, 20000);
camera.position.set(180, 140, 220);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.autoRotateSpeed = 1.2;
scene.add(new THREE.HemisphereLight('#fff8ee', '#b9ad9c', 0.55));
const sun = new THREE.DirectionalLight('#fff4e6', 2.1);
sun.position.set(160, 320, 200); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6; sun.shadow.radius = 4;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#dfe8ff', 0.5); fill.position.set(-200, 120, -120); scene.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
let grid = null;
function makeGrid() {
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  const cs = getComputedStyle(document.documentElement);
  const a = new THREE.Color(cs.getPropertyValue('--line-2').trim() || '#cfc7ba'), b2 = new THREE.Color(cs.getPropertyValue('--line').trim() || '#e2dcd2');
  grid = new THREE.GridHelper(1000, 100, a, b2);
  grid.material.transparent = true; grid.material.opacity = 0.75; grid.position.y = 0.02; grid.visible = state.view.grid;
  scene.add(grid);
}
const mats = makeMats();
let model = new THREE.Group(); scene.add(model);
let bbox = new THREE.Box3();

function resize() {
  const r = view.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

function applyMats() {
  const c = cur();
  for (const s of SLOT_ORDER) finishMaterial(mats[s], c.mats[s]);
  for (const s of SLOT_ORDER) mats[s].wireframe = state.view.wire;
  for (const k in mats) mats[k].wireframe = state.view.wire;
  updColorUI();
}

function disposeTree(o) { o.traverse((m) => { if (m.isMesh) m.geometry.dispose(); }); }
let stats = { parts: 0, tris: 0 };
function rebuild() {
  const t = state.type, c = cur();
  const b = new Builder(mats, state.q);
  try { TYPES[t].build(b, { ...c.params }); }
  catch (e) { console.error(e); toast('Gagal membangun model: ' + e.message); return; }
  scene.remove(model); disposeTree(model);
  model = b.root; model.name = TYPES[t].label; scene.add(model);
  model.updateMatrixWorld(true);
  bbox = new THREE.Box3().setFromObject(model);
  stats = { parts: 0, tris: 0 };
  model.traverse((m) => { if (m.isMesh) { stats.parts++; const g = m.geometry; stats.tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  // fit the shadow camera to the model
  const s = bbox.getSize(new THREE.Vector3()), ctr = bbox.getCenter(new THREE.Vector3());
  const R = Math.max(s.x, s.y, s.z) * 0.9 + 20;
  sun.position.set(ctr.x + R * 0.6, R * 2.2 + s.y, ctr.z + R * 0.9); sun.target.position.copy(ctr);
  Object.assign(sun.shadow.camera, { left: -R * 1.3, right: R * 1.3, top: R * 1.3, bottom: -R * 1.3, near: 1, far: R * 6 });
  sun.shadow.camera.updateProjectionMatrix();
  model.traverse((m) => { if (m.isMesh) m.castShadow = state.view.shadow; });
  updHud(); updDims();
  $('#busy').hidden = true;
}
let pending = 0;
function schedule() { if (!pending) pending = requestAnimationFrame(() => { pending = 0; rebuild(); persist(); }); }

function frame(dir) {
  const s = bbox.getSize(new THREE.Vector3()), c = bbox.getCenter(new THREE.Vector3());
  const r = Math.max(30, s.length() * 0.5);
  const fov = camera.aspect < 1 ? 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect) : THREE.MathUtils.degToRad(camera.fov);
  const dist = (r / Math.sin(fov / 2)) * (camera.aspect < 1 ? 1.3 : 1.12);
  const d = { iso: [0.62, 0.45, 0.85], front: [0, 0.12, 1], side: [1, 0.12, 0], top: [0, 1, 0.0001] }[dir || 'iso'];
  const v = new THREE.Vector3(...d).normalize();
  controls.target.copy(c);
  camera.position.copy(c).addScaledVector(v, dist);
  camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
  controls.update();
}

// dimensions overlay
const dimRoot = $('#dims');
let dimLines = null;
function updDims() {
  if (dimLines) { scene.remove(dimLines); dimLines.geometry.dispose(); dimLines = null; }
  dimRoot.innerHTML = '';
  if (!state.view.dims || bbox.isEmpty()) return;
  const { min: a, max: b } = bbox, o = 6;
  const pts = [
    [a.x, 0.3, b.z + o], [b.x, 0.3, b.z + o], [a.x, 0.3, b.z + o - 3], [a.x, 0.3, b.z + o + 3], [b.x, 0.3, b.z + o - 3], [b.x, 0.3, b.z + o + 3],
    [b.x + o, 0.3, a.z], [b.x + o, 0.3, b.z], [b.x + o - 3, 0.3, a.z], [b.x + o + 3, 0.3, a.z], [b.x + o - 3, 0.3, b.z], [b.x + o + 3, 0.3, b.z],
    [b.x + o, 0, b.z + o], [b.x + o, b.y, b.z + o], [b.x + o - 3, b.y, b.z + o], [b.x + o + 3, b.y, b.z + o],
  ];
  const segs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const g = new THREE.BufferGeometry().setFromPoints(segs.map((i) => new THREE.Vector3(...pts[i])));
  const col = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  dimLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true }));
  dimLines.renderOrder = 10; scene.add(dimLines);
  const s = bbox.getSize(new THREE.Vector3());
  const lbl = (txt, p) => { const d = el('div', { class: 'dimlbl' }, txt); d._p = new THREE.Vector3(...p); dimRoot.append(d); };
  lbl(`${fmt(s.x)} cm`, [(a.x + b.x) / 2, 0.3, b.z + o]);
  lbl(`${fmt(s.z)} cm`, [b.x + o, 0.3, (a.z + b.z) / 2]);
  lbl(`${fmt(s.y)} cm`, [b.x + o, b.y / 2, b.z + o]);
}
const _v = new THREE.Vector3();
function placeDims() {
  if (!dimRoot.children.length) return;
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  for (const d of dimRoot.children) {
    _v.copy(d._p).project(camera);
    d.style.left = ((_v.x + 1) / 2) * w + 'px'; d.style.top = ((1 - _v.y) / 2) * h + 'px';
    d.style.display = _v.z < 1 ? '' : 'none';
  }
}
const fmt = (v) => (Math.round(v * 10) / 10).toLocaleString('id-ID');

function loop() {
  controls.autoRotate = state.view.rotate;
  controls.update();
  renderer.render(scene, camera);
  placeDims();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- thumbnails
const thumbs = {};
function makeThumbs() {
  const W = 192, H = 144;
  const r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r2.setSize(W, H); r2.setPixelRatio(1);
  r2.outputColorSpace = THREE.SRGBColorSpace; r2.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.environment = new THREE.PMREMGenerator(r2).fromScene(new RoomEnvironment(), 0.04).texture;
  sc.add(new THREE.HemisphereLight('#fff8ee', '#b9ad9c', 0.6));
  const l = new THREE.DirectionalLight('#fff4e6', 1.8); l.position.set(1, 2, 1.6); sc.add(l);
  const cam = new THREE.PerspectiveCamera(30, W / H, 1, 10000);
  const tm = makeMats();
  const queue = [state.type, ...typeKeys.filter((k) => k !== state.type)];
  const step = () => {
    const t = queue.shift(); if (!t) { r2.dispose(); return; }
    for (const s of SLOT_ORDER) finishMaterial(tm[s], TYPES[t].mats[s] || { c: '#cfe3e0', f: s === 'kaca' ? 'kaca' : 'satin' });
    const b = new Builder(tm, 0.6);
    try { TYPES[t].build(b, defaults(t)); } catch (e) { console.error(t, e); }
    sc.add(b.root);
    const bb = new THREE.Box3().setFromObject(b.root), c = bb.getCenter(new THREE.Vector3()), r = bb.getSize(new THREE.Vector3()).length() * 0.5;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(15)) * 0.92;
    cam.position.copy(c).add(new THREE.Vector3(0.62, 0.42, 0.85).normalize().multiplyScalar(dist));
    cam.near = dist / 50; cam.far = dist * 5; cam.updateProjectionMatrix(); cam.lookAt(c);
    r2.render(sc, cam);
    thumbs[t] = r2.domElement.toDataURL('image/png');
    sc.remove(b.root); disposeTree(b.root);
    const img = $(`.type[data-t="${t}"] .th`);
    if (img) img.innerHTML = `<img alt="" src="${thumbs[t]}">`;
    setTimeout(step, 16);
  };
  setTimeout(step, 60);
}

// ---------------------------------------------------------------- UI
function renderCats() {
  const nav = $('#cats'); nav.innerHTML = '';
  for (const c of CATEGORIES) {
    const b = el('button', { class: 'cat', 'aria-pressed': String(c.id === state.cat) }, c.label);
    b.onclick = () => { state.cat = c.id; renderCats(); renderTypes(); };
    nav.append(b);
  }
}
function renderTypes() {
  const box = $('#types'); box.innerHTML = '';
  for (const t of typeKeys.filter((k) => TYPES[k].cat === state.cat)) {
    const b = el('button', { class: 'type', 'data-t': t, role: 'listitem', 'aria-pressed': String(t === state.type) },
      `<span class="th">${thumbs[t] ? `<img alt="" src="${thumbs[t]}">` : '<i></i>'}</span>${TYPES[t].label}`);
    b.onclick = () => selectType(t);
    box.append(b);
  }
}
function selectType(t) {
  if (t === state.type) return;
  state.type = t; state.cat = TYPES[t].cat;
  renderAll(); rebuild(); frame('iso'); persist(); pushHist(true);
}
function renderStyles() {
  const box = $('#styles'); box.innerHTML = '';
  for (const [name, o] of Object.entries(TYPES[state.type].styles || {})) {
    const b = el('button', { class: 'chip' }, name);
    b.onclick = () => {
      const c = cur();
      c.params = { ...defaults(state.type), ...o };
      renderGroups(); schedule(); pushHist(true);
      $$('#styles .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    };
    box.append(b);
  }
}
const pct = (inp) => inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + '%');
let openGroups = null;
function renderGroups() {
  const box = $('#groups');
  if (box.children.length) openGroups = $$('details.grp', box).map((d) => d.open);
  box.innerHTML = '';
  const c = cur(), P = c.params;
  TYPES[state.type].schema.forEach((g, gi) => {
    const det = el('details', { class: 'grp' });
    det.open = openGroups && openGroups.length === TYPES[state.type].schema.length ? openGroups[gi] : gi < 2;
    det.append(el('summary', {}, g.title));
    const rows = el('div', { class: 'rows' });
    for (const p of g.params) {
      const id = 'p_' + p.k;
      const row = el('div', { class: 'row', 'data-k': p.k });
      if (p.t === 'r') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.l}</label><input class="num" type="number" min="${p.min}" max="${p.max}" step="${p.step}" aria-label="${p.l}"><span class="unit">${p.u || ''}</span></div><input id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}">`;
        const rg = $('input[type=range]', row), nm = $('.num', row);
        rg.value = nm.value = P[p.k]; pct(rg);
        rg.oninput = () => { P[p.k] = +rg.value; nm.value = rg.value; pct(rg); changed(); };
        nm.onchange = () => { const v = Math.min(p.max, Math.max(p.min, +nm.value || p.min)); P[p.k] = v; rg.value = nm.value = v; pct(rg); changed(); };
      } else if (p.t === 's') {
        if (p.o.length <= 3 && p.o.every(([, l]) => l.length < 15)) {
          row.innerHTML = `<div class="top"><span class="lbl">${p.l}</span></div><div class="seg" role="group" aria-label="${p.l}">${p.o.map(([v, l]) => `<button data-v="${v}" aria-pressed="${String(P[p.k]) === String(v)}">${l}</button>`).join('')}</div>`;
          $$('.seg button', row).forEach((bt) => bt.onclick = () => { P[p.k] = bt.dataset.v; $$('.seg button', row).forEach((x) => x.setAttribute('aria-pressed', String(x === bt))); changed(true); });
        } else {
          row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.l}</label></div><select id="${id}">${p.o.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
          const s = $('select', row); s.value = P[p.k];
          s.onchange = () => { P[p.k] = s.value; changed(true); };
        }
      } else if (p.t === 'c') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.l}</label><span class="switch"><input id="${id}" type="checkbox"><span></span></span></div>`;
        const cb = $('input', row); cb.checked = !!P[p.k];
        cb.onchange = () => { P[p.k] = cb.checked; changed(true); };
      }
      rows.append(row);
    }
    det.append(rows);
    box.append(det);
  });
  updVisibility();
}
function updVisibility() {
  const P = cur().params;
  for (const p of allParams(state.type)) {
    const row = $(`#groups .row[data-k="${p.k}"]`);
    if (row) row.classList.toggle('off', !!(p.when && !p.when(P)));
  }
}
function changed(immediate) {
  updVisibility(); schedule(); pushHist(immediate);
  $$('#styles .chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
}

// colour UI
function updColorUI() {
  const c = cur(), slots = Object.keys(TYPES[state.type].slots);
  if (!slots.includes(state.slot)) state.slot = slots[0];
  $('#colorSw').innerHTML = slots.slice(0, 4).map((s) => `<i style="background:${c.mats[s].c}"></i>`).join('');
  // panel swatches
  const sw = $('#slotSw'); sw.innerHTML = '';
  for (const s of slots) {
    const b = el('button', { class: 'swbtn', title: `${TYPES[state.type].slots[s]} — ${FINISHES[c.mats[s].f]?.l}` }, `<i style="background:${c.mats[s].c}"></i>${TYPES[state.type].slots[s]}`);
    b.onclick = () => { state.slot = s; openPop('colorPop', $('#colorBtn')); };
    sw.append(b);
  }
  if ($('#colorPop').hidden) return;
  const seg = $('#slotSeg'); seg.innerHTML = '';
  for (const s of slots) {
    const b = el('button', { 'aria-pressed': String(s === state.slot) }, `<i class="dot" style="background:${c.mats[s].c}"></i>${TYPES[state.type].slots[s]}`);
    b.onclick = () => { state.slot = s; updColorUI(); };
    seg.append(b);
  }
  const m = c.mats[state.slot];
  const swd = $('#swatches'); swd.innerHTML = '';
  for (const col of SWATCHES) {
    const b = el('button', { style: `background:${col}`, 'aria-pressed': String(col.toLowerCase() === m.c.toLowerCase()), 'aria-label': col, title: col });
    b.onclick = () => { m.c = col; matChanged(); };
    swd.append(b);
  }
  const custom = el('label', { title: 'Warna kustom' }, `${svg('plus')}<input type="color" aria-label="Warna kustom" value="${m.c}">`);
  $('input', custom).oninput = (e) => { m.c = e.target.value; finishMaterial(mats[state.slot], m); $('#colorSw').innerHTML = slots.slice(0, 4).map((s) => `<i style="background:${c.mats[s].c}"></i>`).join(''); persist(); };
  $('input', custom).onchange = () => { matChanged(); };
  swd.append(custom);
  const fin = $('#finishes'); fin.innerHTML = '';
  for (const [k, f] of Object.entries(FINISHES)) {
    const b = el('button', { class: 'chip', 'aria-pressed': String(k === m.f) }, f.l);
    b.onclick = () => { m.f = k; matChanged(); };
    fin.append(b);
  }
  const pals = $('#pals'); pals.innerHTML = '';
  for (const p of palettesFor(state.type)) {
    const keys = Object.keys(p.m);
    const b = el('button', { class: 'pal' }, `<span class="bar">${keys.map((k) => `<i style="background:${p.m[k][0]}"></i>`).join('')}</span>${p.n}`);
    b.onclick = () => { applyPalette(p); };
    pals.append(b);
  }
}
function applyPalette(p) {
  const c = cur();
  for (const [k, [col, f]] of Object.entries(p.m)) if (c.mats[k]) c.mats[k] = { c: col, f };
  // accent slot that is a textile on this type (cushions, blanket): use the palette's soft accent
  if (TYPES[state.type].softAksen && p.soft) c.mats.aksen = { c: p.soft[0], f: p.soft[1] };
  matChanged();
}
function matChanged() { applyMats(); persist(); pushHist(true); }

// popovers
let openId = null;
function openPop(id, btn) {
  for (const p of ['colorPop', 'viewPop', 'exportPop']) { $('#' + p).hidden = true; }
  $$('.tb [aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (openId === id && btn && !btn._force) { openId = null; return; }
  openId = id;
  const pop = $('#' + id); pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  const vr = view.getBoundingClientRect(), br = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  let left = br.left + br.width / 2 - vr.left - w / 2;
  left = Math.max(8, Math.min(vr.width - w - 8, left));
  pop.style.left = left + 'px';
  if (id === 'colorPop') updColorUI();
}
function closePops() { for (const p of ['colorPop', 'viewPop', 'exportPop']) $('#' + p).hidden = true; $$('.tb [aria-expanded]').forEach((b) => b.setAttribute('aria-expanded', 'false')); openId = null; }
$('#colorBtn').onclick = (e) => openPop('colorPop', e.currentTarget);
$('#openColor2').onclick = () => { state.slot = Object.keys(TYPES[state.type].slots)[0]; openId = null; openPop('colorPop', $('#colorBtn')); };
$('#viewBtn').onclick = (e) => openPop('viewPop', e.currentTarget);
$('#exportBtn').onclick = (e) => openPop('exportPop', e.currentTarget);
document.addEventListener('pointerdown', (e) => {
  if (!openId) return;
  if (e.target.closest('.pop') || e.target.closest('.tb') || e.target.closest('#slotSw')) return;
  closePops();
});

$$('[data-cam]').forEach((b) => b.onclick = () => frame(b.dataset.cam));
$$('[data-tog]').forEach((cb) => {
  cb.checked = !!state.view[cb.dataset.tog];
  cb.onchange = () => {
    state.view[cb.dataset.tog] = cb.checked;
    if (grid) grid.visible = state.view.grid;
    ground.visible = state.view.shadow;
    renderer.shadowMap.enabled = state.view.shadow;
    model.traverse((m) => { if (m.isMesh) m.castShadow = state.view.shadow; });
    for (const k in mats) { mats[k].wireframe = state.view.wire; mats[k].needsUpdate = true; }
    updDims(); persist();
  };
});
$$('#detailSeg button').forEach((b) => {
  b.setAttribute('aria-pressed', String(+b.dataset.q === state.q));
  b.onclick = () => { state.q = +b.dataset.q; $$('#detailSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); schedule(); };
});

// theme
function setTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('#themeBtn').querySelector('svg')?.remove();
  $('#themeBtn').insertAdjacentHTML('afterbegin', svg(dark ? 'sun' : 'moon'));
  const sceneCol = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim();
  scene.background = new THREE.Color(sceneCol);
  ground.material.opacity = dark ? 0.45 : 0.22;
  makeGrid(); updDims();
}
$('#themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(dark ? 'light' : 'dark'); store.set('furniture-studio:theme', document.documentElement.dataset.theme);
};
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTheme());

// panel collapse
$('#collapseBtn').onclick = () => { $('#app').classList.add('collapsed'); $('#showPanel').hidden = false; };
$('#showPanel').onclick = () => { $('#app').classList.remove('collapsed'); $('#showPanel').hidden = true; };

$('#resetBtn').onclick = () => { state.per[state.type] = freshType(state.type); renderAll(); schedule(); pushHist(true); toast('Kembali ke bawaan'); };
$('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;

// randomize
function randomize() {
  const t = state.type, c = cur(), d = defaults(t);
  const styles = Object.values(TYPES[t].styles || {});
  const P = { ...d, ...(styles.length && Math.random() < 0.6 ? styles[Math.floor(Math.random() * styles.length)] : {}) };
  for (const p of allParams(t)) {
    if (p.t === 's' && Math.random() < 0.55) P[p.k] = p.o[Math.floor(Math.random() * p.o.length)][0];
    else if (p.t === 'c' && Math.random() < 0.35) P[p.k] = !P[p.k];
    else if (p.t === 'r' && Math.random() < 0.5) {
      const span = (p.max - p.min) * 0.28, base = P[p.k];
      let v = base + (Math.random() * 2 - 1) * span;
      v = Math.min(p.max, Math.max(p.min, Math.round(v / p.step) * p.step));
      P[p.k] = +v.toFixed(4);
    }
  }
  if ('seed' in P) P.seed = 1 + Math.floor(Math.random() * 99);
  c.params = P;
  const pals = palettesFor(t); applyPalette(pals[Math.floor(Math.random() * pals.length)]);
  renderGroups(); schedule();
  $$('#styles .chip').forEach((x) => x.setAttribute('aria-pressed', 'false'));
}
$('#randBtn').onclick = randomize;

// HUD
function updHud() {
  const s = bbox.getSize(new THREE.Vector3());
  $('#hud').innerHTML = `<b>${TYPES[state.type].label}</b><span>${fmt(s.x)} × ${fmt(s.z)} × ${fmt(s.y)} cm</span><span>${stats.parts} bagian</span><span class="tris">${Math.round(stats.tris).toLocaleString('id-ID')} segitiga</span>`;
}
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

function renderAll(groups = true) {
  renderCats(); renderTypes(); renderStyles();
  if (groups) { openGroups = null; $('#groups').innerHTML = ''; }
  renderGroups(); applyMats();
}

// ---------------------------------------------------------------- export
const fname = () => `${state.type}-${new Date().toISOString().slice(0, 10)}`;
function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportOBJ(root) {
  let obj = `# Furniture Studio 3D — ${TYPES[state.type].label}\n# units: centimetres, Y up\nmtllib ${state.type}.mtl\n`;
  const mtl = {};
  let vo = 1;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  root.updateMatrixWorld(true);
  root.traverse((m) => {
    if (!m.isMesh || !m.visible) return;
    let g = m.geometry; if (g.index) g = g.toNonIndexed();
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    nm.getNormalMatrix(m.matrixWorld);
    obj += `o ${m.name.replace(/\s+/g, '_')}_${vo}\nusemtl ${m.material.name}\n`;
    mtl[m.material.name] = m.material;
    let s = '';
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); s += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`; }
    for (let i = 0; i < P.count; i++) { n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); s += `vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}\n`; }
    if (U) for (let i = 0; i < P.count; i++) s += `vt ${U.getX(i).toFixed(4)} ${U.getY(i).toFixed(4)}\n`;
    for (let i = 0; i < P.count; i += 3) {
      const a = vo + i, b = a + 1, c = a + 2;
      s += U ? `f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}\n` : `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
    }
    obj += s; vo += P.count;
    if (g !== m.geometry) g.dispose();
  });
  let mtlS = '';
  for (const [name, m] of Object.entries(mtl)) {
    const c = m.color, op = m.transmission ? 0.35 : 1;
    mtlS += `newmtl ${name}\nKd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}\nKs ${(0.5 - m.roughness * 0.4).toFixed(3)} ${(0.5 - m.roughness * 0.4).toFixed(3)} ${(0.5 - m.roughness * 0.4).toFixed(3)}\nNs ${Math.round((1 - m.roughness) ** 2 * 200 + 4)}\nd ${op}\nillum 2\nPr ${m.roughness.toFixed(3)}\nPm ${(m.metalness || 0).toFixed(3)}\n\n`;
  }
  return zipSync({ [`${state.type}.obj`]: strToU8(obj), [`${state.type}.mtl`]: strToU8(mtlS) });
}
async function doExport(kind) {
  closePops();
  const name = fname();
  try {
    if (kind === 'fbx') { download(exportFBX(model, TYPES[state.type].label.replace(/[^\w]+/g, '_')), name + '.fbx', 'application/octet-stream'); toast('FBX diekspor (cm, Y-up)'); }
    else if (kind === 'glb') {
      const g = new THREE.Group(); g.add(model.clone()); g.scale.setScalar(0.01); g.updateMatrixWorld(true);
      // plain metallic-roughness materials: the widest-compatible subset of glTF (no bump/sheen extensions)
      const conv = new Map();
      g.traverse((m) => {
        if (!m.isMesh) return;
        const s = m.material;
        if (!conv.has(s)) conv.set(s, new THREE.MeshStandardMaterial({
          name: s.name, color: s.color, roughness: s.roughness, metalness: s.metalness, map: s.map,
          emissive: s.emissive, emissiveMap: s.emissiveMap, emissiveIntensity: s.emissiveIntensity,
          transparent: s.transmission > 0, opacity: s.transmission > 0 ? 0.35 : 1,
        }));
        m.material = conv.get(s);
      });
      const res = await new GLTFExporter().parseAsync(g, { binary: true, onlyVisible: true });
      download(new Blob([res], { type: 'model/gltf-binary' }), name + '.glb'); toast('GLB diekspor (meter)');
      conv.forEach((m) => m.dispose());
    } else if (kind === 'obj') { download(exportOBJ(model), name + '-obj.zip', 'application/zip'); toast('OBJ + MTL diekspor'); }
    else if (kind === 'stl') { download(new STLExporter().parse(model, { binary: true }), name + '.stl', 'model/stl'); toast('STL diekspor (cm)'); }
    else if (kind === 'png') {
      const w = renderer.domElement.width, h = renderer.domElement.height, pr = renderer.getPixelRatio();
      const W = 2048, H = Math.round(2048 * h / w);
      renderer.setPixelRatio(1); renderer.setSize(W, H, false);
      const dl = dimLines; if (dl) dl.visible = false;
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      renderer.setPixelRatio(pr); resize(); if (dl) dl.visible = true;
      const a = el('a', { href: url, download: name + '.png' }); document.body.append(a); a.click(); a.remove();
      toast('PNG disimpan');
    } else if (kind === 'json') {
      download(JSON.stringify({ app: 'furniture-studio', version: 1, type: state.type, ...cur() }, null, 2), name + '.json', 'application/json'); toast('Desain disimpan');
    } else if (kind === 'load') $('#fileIn').click();
  } catch (e) { console.error(e); toast('Ekspor gagal: ' + e.message); }
}
$$('[data-exp]').forEach((b) => b.onclick = () => doExport(b.dataset.exp));
$('#fileIn').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const o = JSON.parse(await f.text());
    if (!TYPES[o.type]) throw new Error('tipe tidak dikenal');
    state.type = o.type; state.cat = TYPES[o.type].cat;
    state.per[o.type] = { params: { ...defaults(o.type), ...o.params }, mats: { ...TYPES[o.type].mats, ...o.mats } };
    renderAll(); rebuild(); frame('iso'); persist(); pushHist(true); toast('Desain dimuat');
  } catch (err) { toast('File tidak valid: ' + err.message); }
  e.target.value = '';
};

// keyboard
addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  else if (e.ctrlKey || e.metaKey || e.altKey) return;
  else if (k === 'r') randomize();
  else if (k === 'c') openPop('colorPop', $('#colorBtn'));
  else if (k === 'f') frame('iso');
  else if (k === 'escape') closePops();
});

// ---------------------------------------------------------------- boot
const th = store.get('furniture-studio:theme'); if (th) document.documentElement.dataset.theme = th;
resize();
setTheme();
renderAll();
rebuild();
frame('iso');
pushHist(true);
updHistBtns();
loop();
makeThumbs();
window.__fs = { state, rebuild, model: () => model, exportFBX: () => exportFBX(model, 'Test'), selectType, randomize, frame };
