// DeskKit Studio 3D — viewport, UI and exporters
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { SCHEMA, DEFAULTS, PRESETS, PRESET_GROUPS, OBJECT_TYPES } from './params.js';
import { buildObject, printedVolume, DENSITY } from './objects.js';
import { writeFBX } from './fbx.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PARAMS = SCHEMA.flatMap(g => g.params.map(p => ({ ...p, group: g })));
const PBY = Object.fromEntries(PARAMS.map(p => [p.key, p]));

let P = { ...PRESETS['Stepped Pen Block'] };
const view = { cut: 'off', cutPos: 50, theme: 'dark' };
try { const t = localStorage.getItem('dk-theme'); if (t === 'light' || t === 'dark') view.theme = t; } catch (e) { /* storage unavailable */ }

// ------------------------------------------------------------------ scene
const canvas = $('#cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotateSpeed = 1.4;
const hemi = new THREE.HemisphereLight(0xffffff, 0x3a403b, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xcfe3ff, 0.35); fill.position.set(-200, 120, -160); scene.add(fill);
const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
plate.rotation.x = -Math.PI / 2; plate.receiveShadow = true; plate.position.y = -0.02; scene.add(plate);
let grid = null;
const world = new THREE.Group(); scene.add(world);
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

function capify(mat, hex) {
  mat.userData.cap = { value: new THREE.Color(hex).convertLinearToSRGB() };
  mat.onBeforeCompile = sh => {
    sh.uniforms.capColor = mat.userData.cap;
    sh.fragmentShader = 'uniform vec3 capColor;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  if (!gl_FrontFacing) { gl_FragColor = vec4(capColor, 1.0); }');
  };
  mat.customProgramCacheKey = () => 'cap';
  return mat;
}
const matPart = capify(new THREE.MeshPhysicalMaterial({ vertexColors: true, clippingPlanes: [] }), '#2c3a33');
const matWire = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.16, clippingPlanes: [] });
const matRef = new THREE.MeshPhysicalMaterial({ color: 0xb9c3cf, roughness: 0.35, transparent: true, opacity: 0.55, depthWrite: false });
const matScreen = new THREE.MeshPhysicalMaterial({ color: 0x1b2230, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 });
const matPaper = new THREE.MeshStandardMaterial({ color: 0xf7f3e8, roughness: 0.9, transparent: true, opacity: 0.92 });
const matCable = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.6 });

// ------------------------------------------------------------------ geometry conversion (crease-aware normals, face colours)
function creased(m, crease = 30 * Math.PI / 180) {
  const pos = m.pos, idx = m.idx, nv = pos.length / 3, nt = idx.length / 3;
  const fn = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = 3 * idx[3 * t], b = 3 * idx[3 * t + 1], c = 3 * idx[3 * t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    fn[3 * t] = uy * vz - uz * vy; fn[3 * t + 1] = uz * vx - ux * vz; fn[3 * t + 2] = ux * vy - uy * vx;
  }
  const cnt = new Uint32Array(nv + 1); for (let i = 0; i < idx.length; i++) cnt[idx[i] + 1]++;
  for (let i = 0; i < nv; i++) cnt[i + 1] += cnt[i];
  const fillp = cnt.slice(0, nv), adj = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) adj[fillp[idx[i]]++] = (i / 3) | 0;
  const cosC = Math.cos(crease), P3 = new Float32Array(nt * 9), N3 = new Float32Array(nt * 9);
  for (let t = 0; t < nt; t++) {
    const fx = fn[3 * t], fy = fn[3 * t + 1], fz = fn[3 * t + 2], fl = Math.hypot(fx, fy, fz) || 1;
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k], o = 9 * t + 3 * k;
      P3[o] = pos[3 * v]; P3[o + 1] = pos[3 * v + 1]; P3[o + 2] = pos[3 * v + 2];
      let sx = 0, sy = 0, sz = 0;
      for (let q = cnt[v]; q < cnt[v + 1]; q++) { const g = adj[q], gx = fn[3 * g], gy = fn[3 * g + 1], gz = fn[3 * g + 2], gl = Math.hypot(gx, gy, gz) || 1; if ((fx * gx + fy * gy + fz * gz) / (fl * gl) >= cosC) { sx += gx; sy += gy; sz += gz; } }
      const l = Math.hypot(sx, sy, sz) || 1; N3[o] = sx / l; N3[o + 1] = sy / l; N3[o + 2] = sz / l;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P3, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nt * 9), 3));
  g.userData.tags = Uint8Array.from(m.tag);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
const tagColors = () => { const b = new THREE.Color(P.colorBody); return [b, P.twoTone ? new THREE.Color(P.colorAccent) : b]; };
function paint(g) {
  const cols = tagColors(), tags = g.userData.tags, col = g.attributes.color.array;
  for (let t = 0; t < tags.length; t++) { const c = cols[tags[t]] || cols[0]; for (let k = 0; k < 3; k++) { const o = 9 * t + 3 * k; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; } }
  g.attributes.color.needsUpdate = true;
}

// ------------------------------------------------------------------ build
let model = null, items = [];   // items: { part, geo, mesh, wire, plateM (Matrix4), asmM }
const geoCache = new Map();
function rebuild(preview = false) {
  const Q = preview ? { ...P, curveSegs: Math.min(P.curveSegs, 40), heightSegs: Math.min(P.heightSegs, 30) } : P;
  model = buildObject(Q);
  for (const g of geoCache.values()) g.dispose();
  geoCache.clear();
  for (const c of [...world.children]) world.remove(c);
  items = model.parts.map(part => {
    let geo = geoCache.get(part.mesh);
    if (!geo) { geo = creased(part.mesh); paint(geo); geoCache.set(part.mesh, geo); }
    const mesh = new THREE.Mesh(geo, matPart); mesh.castShadow = mesh.receiveShadow = true;
    const wire = new THREE.Mesh(geo, matWire); wire.visible = !!P.wireframe;
    world.add(mesh, wire);
    return { part, geo, mesh, wire };
  });
  computePlate();
  buildRefs();
  place();
  updateHUD();
}

// print plate: each part rotated into print orientation, dropped to y = 0, laid out in a row
function computePlate() {
  let x = 0; const gap = 10;
  const boxes = items.map(it => {
    const r = it.part.print.r || [0, 0, 0];
    const R = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2]));
    const b = it.geo.boundingBox.clone().applyMatrix4(R);
    return { R, b };
  });
  const total = boxes.reduce((a, o) => a + (o.b.max.x - o.b.min.x), 0) + gap * (boxes.length - 1);
  x = -total / 2;
  items.forEach((it, i) => {
    const { R, b } = boxes[i];
    const T = new THREE.Matrix4().makeTranslation(x - b.min.x, -b.min.y, -(b.min.z + b.max.z) / 2);
    it.plateM = T.multiply(R);
    x += b.max.x - b.min.x + gap;
  });
}
function asmMatrix(it) {
  const a = it.part.asm, p = a.p || [0, 0, 0];
  const dz = a.drawer ? (P.drawerOpen / 100) * a.depth * 0.72 : 0;
  return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2] + dz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
}
function place() {
  for (const it of items) {
    const M = P.viewMode === 'plate' ? it.plateM : asmMatrix(it);
    for (const m of [it.mesh, it.wire]) { m.matrixAutoUpdate = false; m.matrix.copy(M); m.matrixWorldNeedsUpdate = true; }
  }
  refGroup.visible = P.viewMode !== 'plate' && !!P.showRefs;
  $('#openBar').hidden = !(P.objectType === 'mini-drawer' && P.viewMode !== 'plate');
  updatePlateMesh(); updateCut(); if (model) updateHUD();
}

const refGroup = new THREE.Group(); scene.add(refGroup);
function buildRefs() {
  for (const c of [...refGroup.children]) { refGroup.remove(c); c.geometry.dispose(); }
  for (const r of model.refs || []) {
    let g, mat = matRef;
    if (r.kind === 'cyl') g = new THREE.CylinderGeometry(r.r, r.r, r.h, 24);
    else g = new THREE.BoxGeometry(r.size[0], r.size[1], r.size[2]);
    if (r.screen) mat = matScreen; if (r.paper) mat = matPaper; if (r.cable) mat = matCable;
    const m = new THREE.Mesh(g, mat);
    m.position.set(...r.pos); m.rotation.set(...r.rot);
    m.castShadow = !!(r.cable || r.screen);
    refGroup.add(m);
  }
}

function sceneBox() {
  const box = new THREE.Box3();
  for (const it of items) box.union(it.geo.boundingBox.clone().applyMatrix4(it.mesh.matrix));
  if (refGroup.visible) box.union(new THREE.Box3().setFromObject(refGroup));
  return box;
}
function updatePlateMesh() {
  const box = sceneBox(), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const span = Math.max(260, Math.ceil(Math.max(size.x, size.z) * 1.8 / 20) * 20);
  plate.scale.set(span * 2, span * 2, 1); plate.position.set(c.x, -0.02, c.z);
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  const dark = view.theme === 'dark';
  grid = new THREE.GridHelper(span, span / 10, dark ? 0x4a514c : 0xb4bcb3, dark ? 0x262a27 : 0xd5dbd3);
  grid.position.set(Math.round(c.x / 10) * 10, 0, Math.round(c.z / 10) * 10); grid.visible = !!P.showGrid; scene.add(grid);
  const r = Math.max(size.x, size.y, size.z) * 1.3 + 60;
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 2500 }); sun.shadow.camera.updateProjectionMatrix();
  sun.position.set(c.x + 160, 320 + size.y, c.z + 180); sun.target.position.copy(c);
}

function updateMaterials() {
  matPart.roughness = P.roughness; matPart.metalness = 0.02; matPart.sheen = P.sheen; matPart.sheenRoughness = 0.5; matPart.sheenColor = new THREE.Color(0xffffff);
  if (matPart.flatShading !== !!P.flatShading) { matPart.flatShading = !!P.flatShading; matPart.needsUpdate = true; }
  for (const g of geoCache.values()) paint(g);
  for (const it of items) it.wire.visible = !!P.wireframe;
  if (grid) grid.visible = !!P.showGrid;
  controls.autoRotate = !!P.autoRotate;
  const c = new THREE.Color(P.colorBody).multiplyScalar(0.45);
  matPart.userData.cap.value.copy(c).convertLinearToSRGB();
  place(); syncToggles();
}

function updateCut() {
  const on = view.cut !== 'off';
  for (const m of [matPart, matWire]) {
    m.clippingPlanes = on ? [cutPlane] : [];
    const side = on && m === matPart ? THREE.DoubleSide : THREE.FrontSide;
    if (m.side !== side) { m.side = side; m.needsUpdate = true; }
  }
  if (on) {
    const box = new THREE.Box3(); for (const it of items) box.union(it.geo.boundingBox.clone().applyMatrix4(it.mesh.matrix));
    const f = view.cutPos / 100;
    if (view.cut === 'y') { cutPlane.normal.set(0, -1, 0); cutPlane.constant = box.min.y + (box.max.y - box.min.y) * f; }
    if (view.cut === 'x') { cutPlane.normal.set(-1, 0, 0); cutPlane.constant = box.min.x + (box.max.x - box.min.x) * f; }
    if (view.cut === 'z') { cutPlane.normal.set(0, 0, -1); cutPlane.constant = box.min.z + (box.max.z - box.min.z) * f; }
  }
}

// ------------------------------------------------------------------ HUD
const fmt = (v, d = 1) => (isFinite(v) ? v.toFixed(d) : '—');
let hudMin = false;
function updateHUD() {
  if (!model) return;
  const s = model.stats, dens = DENSITY[P.filament] || 1.24;
  const pv = printedVolume(model.parts, P.infill);
  const box = new THREE.Box3(); for (const it of items) box.union(it.geo.boundingBox.clone().applyMatrix4(asmMatrixStatic(it)));
  const sz = box.getSize(new THREE.Vector3());
  const mins = pv / 9 / 60 + (sz.y / 0.2) * 2 / 60;
  const tm = mins >= 60 ? `${Math.floor(mins / 60)} h ${String(Math.round(mins % 60)).padStart(2, '0')} min` : `${Math.round(mins)} min`;
  const typeName = (OBJECT_TYPES.find(t => t[0] === P.objectType) || [])[1];
  const uniq = model.parts.length;
  const notes = [...new Set(model.parts.map(p => p.printNote).filter(Boolean))];
  const html = `<h3><span>${typeName}</span><button id="hudMin" aria-label="Collapse">${hudMin ? '+' : '–'}</button></h3>
  <dl>
    <dt>Size (W × H × D)</dt><dd>${fmt(sz.x)} × ${fmt(sz.y)} × ${fmt(sz.z)} mm</dd>
    <dt>Parts</dt><dd>${uniq}${uniq > 1 ? ' (see print plate)' : ''}</dd>
    ${model.capacity > 0 ? `<dt>Capacity</dt><dd>${fmt(model.capacity, 0)} ml</dd>` : ''}
    <dt>Filament</dt><dd>≈ ${fmt(pv / 1000 * dens, 0)} g · ${fmt(pv / 1000 / 2.98, 1)} m</dd>
    <dt>Solid volume</dt><dd>${fmt(s.volume / 1000, 1)} cm³</dd>
    <dt>Print time</dt><dd>≈ ${tm}</dd>
    <dt>Mesh</dt><dd>${(s.tris / 1000).toFixed(1)}k tris · ${s.watertight ? '<span class="ok">closed ✓</span>' : '<span class="bad">open edges</span>'}</dd>
  </dl>
  ${notes.length || model.warnings.length ? `<ul>${model.warnings.map(w => `<li class="w">${w}</li>`).join('')}${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}`;
  const hud = $('#hud'); hud.innerHTML = html; hud.classList.toggle('min', hudMin);
  $('#hudMobile').innerHTML = `<div class="hud">${html}</div>`;
  for (const b of $$('#hudMin')) b.onclick = () => { hudMin = !hudMin; updateHUD(); };
  $('#legend').innerHTML = `<span><i style="background:${P.colorBody}"></i>body</span>${P.twoTone ? `<span><i style="background:${P.colorAccent}"></i>interior</span>` : ''}${P.showRefs && model.refs.length && P.viewMode !== 'plate' ? '<span><i style="background:#b9c3cf"></i>fit reference</span>' : ''}<span>${P.filament} · ${P.infill}% infill</span>`;
}
function asmMatrixStatic(it) { const p = it.part.asm.p || [0, 0, 0]; return new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]); }

// ------------------------------------------------------------------ UI
const ICONS = {
  tray: '<rect x="3" y="9" width="26" height="14" rx="3"/><path d="M12 9v14M20 9v14M3 16h26"/>',
  'pen-cup': '<path d="M9 9h14l-1.5 18h-11z"/><path d="M13 9 11 3M17 9l1-6M20 9l3-5"/>',
  'pen-block': '<path d="M3 26h26V12h-7V18h-7v-4H8v-2H3z"/><circle cx="25" cy="15" r="1.4"/><circle cx="18.5" cy="21" r="1.4"/>',
  'phone-stand': '<path d="M4 26h24M7 26v-4M12 26l7-20"/><rect x="12" y="5" width="5" height="17" rx="1" transform="rotate(20 14 14)"/>',
  'card-holder': '<rect x="4" y="16" width="24" height="10" rx="2"/><path d="M9 16l2-9h11l-2 9"/>',
  'cable-organizer': '<rect x="3" y="12" width="26" height="12" rx="3"/><circle cx="10" cy="16" r="2.4"/><circle cx="16" cy="16" r="2.4"/><circle cx="22" cy="16" r="2.4"/><path d="M10 12v1.6M16 12v1.6M22 12v1.6"/>',
  'mini-drawer': '<rect x="5" y="4" width="22" height="24" rx="2"/><path d="M5 12h22M5 20h22M14 8h4M14 16h4M14 24h4"/>',
};
const ctrls = {};
function buildUI() {
  $('#types').innerHTML = OBJECT_TYPES.map(([k, n]) => `<button class="type" role="radio" data-type="${k}" aria-checked="false"><svg viewBox="0 0 32 32">${ICONS[k]}</svg><span>${n}</span></button>`).join('');
  for (const b of $$('[data-type]')) b.onclick = () => {
    const k = b.dataset.type;
    const pre = Object.entries(PRESETS).find(([, v]) => v.objectType === k);
    const keep = { colorAccent: P.colorAccent, twoTone: P.twoTone, showRefs: P.showRefs, filament: P.filament, infill: P.infill, roughness: P.roughness, sheen: P.sheen, showGrid: P.showGrid, viewMode: P.viewMode };
    P = { ...(pre ? pre[1] : DEFAULTS), ...keep, objectType: k };
    syncUI(); rebuild(); fitCamera('iso');
  };
  const host = $('#groups'); host.innerHTML = '';
  for (const g of SCHEMA) {
    const det = document.createElement('details'); det.className = 'group'; det.open = !!g.open; det.dataset.gid = g.id;
    det.innerHTML = `<summary><span class="dot"></span>${g.title}<span class="chev"></span></summary>`;
    const rows = document.createElement('div'); rows.className = 'rows'; det.appendChild(rows);
    for (const p0 of g.params) {
      const p = PBY[p0.key], row = document.createElement('div'); row.className = 'row'; const id = 'p-' + p.key;
      if (p.type === 'range') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.label}</label><input class="num" type="number" min="${p.min}" max="${p.max}" step="${p.step}" aria-label="${p.label} value"><span class="unit">${p.unit || ''}</span></div><input id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}">`;
        const r = row.querySelector('input[type=range]'), n = row.querySelector('.num');
        r.addEventListener('input', () => setParam(p.key, +r.value, true));
        r.addEventListener('change', () => setParam(p.key, +r.value, false));
        n.addEventListener('change', () => setParam(p.key, Math.min(p.max, Math.max(p.min, +n.value || p.min)), false));
        ctrls[p.key] = { row, r, n, p };
      } else if (p.type === 'select') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.label}</label></div><select id="${id}">${p.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
        const sel = row.querySelector('select'); sel.addEventListener('change', () => setParam(p.key, sel.value, false));
        ctrls[p.key] = { row, sel, p };
      } else if (p.type === 'check') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.label}</label><label class="switch"><input id="${id}" type="checkbox"><span></span></label></div>`;
        const cb = row.querySelector('input'); cb.addEventListener('change', () => setParam(p.key, cb.checked, false));
        ctrls[p.key] = { row, cb, p };
      } else if (p.type === 'color') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.label}</label><input id="${id}" type="color"></div>`;
        const ci = row.querySelector('input'); ci.addEventListener('input', () => setParam(p.key, ci.value, true));
        ctrls[p.key] = { row, ci, p };
      }
      rows.appendChild(row);
    }
    host.appendChild(det);
  }
  const ps = $('#presetSel');
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  ps.innerHTML = `<option value="">— custom (${Object.keys(PRESETS).length} presets) —</option>` +
    PRESET_GROUPS.map(([label, keys]) => `<optgroup label="${esc(label)} (${keys.length})">${keys.map(k => `<option value="${esc(k)}">${esc(k)}</option>`).join('')}</optgroup>`).join('');
  const loadPreset = k => { if (!PRESETS[k]) return; P = { ...PRESETS[k], viewMode: P.viewMode }; syncUI(); rebuild(); fitCamera('iso'); };
  ps.addEventListener('change', () => loadPreset(ps.value));
  const order = PRESET_GROUPS.flatMap(([, keys]) => keys);
  const step = d => { let i = order.indexOf(ps.value); i = i < 0 ? (d > 0 ? 0 : order.length - 1) : (i + d + order.length) % order.length; loadPreset(order[i]); };
  $('#presetPrev').onclick = () => step(-1);
  $('#presetNext').onclick = () => step(1);
  $('#openRange').addEventListener('input', e => setParam('drawerOpen', +e.target.value, true));
}
function syncUI() {
  for (const k in ctrls) {
    const c = ctrls[k], v = P[k];
    if (c.r) { c.r.value = v; c.n.value = +(+v).toFixed(3); c.r.style.setProperty('--p', `${((v - c.p.min) / (c.p.max - c.p.min)) * 100}%`); }
    if (c.sel) c.sel.value = v; if (c.cb) c.cb.checked = !!v; if (c.ci) c.ci.value = v;
    c.row.classList.toggle('hide', !(!c.p.show || c.p.show(P)));
  }
  for (const det of $$('details.group')) { const g = SCHEMA.find(x => x.id === det.dataset.gid); det.style.display = g.show && !g.show(P) ? 'none' : ''; }
  for (const b of $$('[data-type]')) { const on = b.dataset.type === P.objectType; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }
  // colours & other live "look" settings don't detach the current preset
  const shape = o => JSON.stringify(Object.keys(o).filter(k => k !== 'viewMode' && !(PBY[k] && PBY[k].live)).sort().map(k => [k, o[k]]));
  const cur = shape(P), pk = Object.keys(PRESETS).find(k => shape(PRESETS[k]) === cur);
  $('#presetSel').value = pk || '';
  syncColorMenu();
  $('#openRange').value = P.drawerOpen; $('#openRange').style.setProperty('--p', `${P.drawerOpen}%`);
  syncToggles();
}
// ------------------------------------------------------------------ quick colour menu (top-right)
const PALETTE = [
  ['Sage', '#5fae8f'], ['Ivory', '#f2efe6'], ['Matte Black', '#26282b'], ['Space Grey', '#7d838c'], ['Signal Red', '#d9483b'], ['Tangerine', '#f08a3c'],
  ['Sun Yellow', '#f2c84b'], ['Lime', '#9ccc5a'], ['Teal', '#2a9d8f'], ['Sky Blue', '#6fb3e0'], ['Cobalt', '#3d6fd8'], ['Navy', '#1d3557'],
  ['Lavender', '#a98bd6'], ['Blush Pink', '#f4a6c1'], ['Terracotta', '#c8674a'], ['Walnut', '#8a5a3c'], ['Silk Gold', '#c9a24d'], ['Mint', '#bfe6d3'],
];
let colorTarget = 'body';
const targetKey = () => (colorTarget === 'body' ? 'colorBody' : 'colorAccent');
function openColorMenu(on) {
  const pop = $('#cqPop'), btn = $('#cqBtn');
  pop.hidden = !on; btn.setAttribute('aria-expanded', String(on));
  if (on) (pop.querySelector('.sw.on') || pop.querySelector('.sw')).focus({ preventScroll: true });
}
function buildColorMenu() {
  $('#cqGrid').innerHTML = PALETTE.map(([n, h]) => `<button class="sw" data-sw="${h}" style="background:${h}" title="${n}" aria-label="${n}" aria-pressed="false"></button>`).join('');
  for (const b of $$('[data-sw]')) b.onclick = () => applyColor(b.dataset.sw);
  for (const b of $$('[data-ctarget]')) b.onclick = () => { colorTarget = b.dataset.ctarget; syncColorMenu(); };
  $('#cqCustom').addEventListener('input', e => applyColor(e.target.value));
  $('#cqTwo').addEventListener('change', e => setParam('twoTone', e.target.checked, false));
  $('#cqSwap').onclick = () => {
    const b = P.colorBody;
    P.colorBody = P.colorAccent; P.colorAccent = b; P.twoTone = true;
    syncUI(); updateMaterials(); updateHUD();
  };
  $('#cqRandom').onclick = () => {
    const pick = () => PALETTE[Math.floor(Math.random() * PALETTE.length)][1];
    const lum = h => { const c = new THREE.Color(h); return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; };
    const a = pick(); let b = pick(), guard = 0;
    while ((a === b || Math.abs(lum(a) - lum(b)) < 0.18) && guard++ < 60) b = pick();
    P.colorBody = a; P.colorAccent = b; P.twoTone = true;
    syncUI(); updateMaterials(); updateHUD();
  };
  $('#cqBtn').onclick = e => { e.stopPropagation(); openColorMenu($('#cqPop').hidden); };
  document.addEventListener('pointerdown', e => { if (!$('#cqPop').hidden && !$('#cq').contains(e.target)) openColorMenu(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#cqPop').hidden) { openColorMenu(false); $('#cqBtn').focus(); }
    else if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) openColorMenu($('#cqPop').hidden);
  });
}
function applyColor(hex) {
  P[targetKey()] = hex.toLowerCase();
  if (colorTarget === 'interior') P.twoTone = true;
  syncUI(); updateMaterials(); updateHUD();
}
function syncColorMenu() {
  $('#cqDotBody').style.background = P.colorBody;
  $('#cqDotIn').style.background = P.twoTone ? P.colorAccent : P.colorBody;
  const cur = String(P[targetKey()]).toLowerCase();
  for (const b of $$('[data-sw]')) { const on = b.dataset.sw === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  for (const b of $$('[data-ctarget]')) { const on = b.dataset.ctarget === colorTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
  $('#cqCustom').value = cur; $('#cqHex').textContent = cur;
  $('#cqTwo').checked = !!P.twoTone;
}

let lastCam = 'iso';
function syncToggles() {
  for (const b of $$('[data-tog]')) b.classList.toggle('on', !!P[b.dataset.tog]);
  for (const b of $$('[data-cut]')) b.classList.toggle('on', b.dataset.cut === view.cut);
  for (const b of $$('[data-cam]')) b.classList.toggle('on', b.dataset.cam === lastCam);
  for (const b of $$('[data-mode]')) b.classList.toggle('on', b.dataset.mode === P.viewMode);
  $('#themeBtn').textContent = view.theme === 'dark' ? 'Light' : 'Dark';
  $('#fnameHint').textContent = model && model.parts.length > 1 ? `${model.parts.length} parts · print plate` : 'print orientation';
}
let raf = 0, pendingPreview = false;
function scheduleRebuild(preview) { pendingPreview = preview; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; rebuild(pendingPreview); }); }
function setParam(key, value, live) {
  P[key] = value; syncUI();
  const p = PBY[key];
  if (key === 'drawerOpen') { place(); return; }
  if (p && p.live) { updateMaterials(); updateHUD(); return; }
  scheduleRebuild(live);
}

function fitCamera(kind = lastCam) {
  lastCam = kind;
  const box = sceneBox(), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.length() * 0.5, 30);
  const vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * Math.max(camera.aspect, 0.3));
  const d = r / Math.sin(Math.min(vf, hf)) * 1.05;
  const dir = { front: [0, 0.15, 1], side: [1, 0.15, 0], top: [0, 1, 0.0001], iso: [0.75, 0.72, 1] }[kind];
  camera.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(d)); controls.target.copy(c);
  camera.near = Math.max(0.5, d / 200); camera.far = d * 20; camera.updateProjectionMatrix(); controls.update(); syncToggles();
}
function applyTheme() {
  document.documentElement.dataset.theme = view.theme;
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--viewport').trim());
  hemi.intensity = view.theme === 'dark' ? 0.6 : 0.85;
  try { localStorage.setItem('dk-theme', view.theme); } catch (e) { /* ignore */ }
  updatePlateMesh(); syncToggles();
}

// ------------------------------------------------------------------ exports
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fname = (ext, extra = '') => `deskkit-${P.objectType}${extra ? '-' + extra : ''}-${today()}.${ext}`;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200); }
function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// welded geometry of selected items under a matrix choice
function mergedIndexed(list, which) {
  let nv = 0, ni = 0; for (const it of list) { nv += it.part.mesh.pos.length / 3; ni += it.part.mesh.idx.length; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), index = new Uint32Array(ni), cols = tagColors(), v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const it of list) {
    const m = it.part.mesh, M = which === 'plate' ? it.plateM : which === 'none' ? new THREE.Matrix4() : asmMatrix(it);
    const n = m.pos.length / 3, vt = new Uint8Array(n);
    for (let i = 0; i < m.idx.length; i++) { const tg = m.tag[(i / 3) | 0]; if (tg > vt[m.idx[i]]) vt[m.idx[i]] = tg; index[io + i] = m.idx[i] + vo; }
    for (let i = 0; i < n; i++) {
      v.set(m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]).applyMatrix4(M);
      pos.set([v.x, v.y, v.z], 3 * (vo + i)); const c = cols[vt[i]] || cols[0]; col.set([c.r, c.g, c.b], 3 * (vo + i));
    }
    vo += n; io += m.idx.length;
  }
  const G = new THREE.BufferGeometry();
  G.setAttribute('position', new THREE.BufferAttribute(pos, 3)); G.setAttribute('color', new THREE.BufferAttribute(col, 3)); G.setIndex(new THREE.BufferAttribute(index, 1));
  return G;
}
function stlOf(list, which = 'plate') {
  const G = mergedIndexed(list, which);
  if (which === 'single') { G.computeBoundingBox(); }
  G.rotateX(Math.PI / 2);   // Y-up → Z-up for slicers
  G.computeBoundingBox(); G.translate(0, 0, -G.boundingBox.min.z);
  const out = new STLExporter().parse(new THREE.Mesh(G), { binary: true }); G.dispose(); return out;
}
function stlPart(it) {
  const G = mergedIndexed([it], 'none'); const r = it.part.print.r || [0, 0, 0];
  G.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2])));
  G.computeBoundingBox(); const b = G.boundingBox; G.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  G.rotateX(Math.PI / 2);
  const out = new STLExporter().parse(new THREE.Mesh(G), { binary: true }); G.dispose(); return out;
}
function objData() {
  const G = mergedIndexed(items, 'asm');
  let txt = new OBJExporter().parse(new THREE.Mesh(G, new THREE.MeshStandardMaterial()));
  const col = G.attributes.color.array, c = new THREE.Color(); let vi = 0;
  txt = txt.replace(/^v (.+)$/gm, (l, rest) => { c.setRGB(col[3 * vi], col[3 * vi + 1], col[3 * vi + 2]).convertLinearToSRGB(); vi++; return `v ${rest} ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`; });
  G.dispose();
  return `# DeskKit Studio 3D — ${P.objectType}\n# units: mm, Y-up, assembled\n` + txt;
}
// FBX 7.4 binary: one object per part in assembled position, Body/Interior materials,
// per-corner normals (from the crease-aware render geometry) and sRGB vertex colours
function fbxData() {
  const twoTone = !!P.twoTone;
  const c = new THREE.Color();
  const parts = items.map(it => {
    const m = it.part.mesh, M = asmMatrix(it), v = new THREE.Vector3();
    const pos = new Float64Array(m.pos.length);
    for (let i = 0; i < pos.length; i += 3) { v.set(m.pos[i], m.pos[i + 1], m.pos[i + 2]).applyMatrix4(M); pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z; }
    const triMat = twoTone ? Uint8Array.from(m.tag, t => (t ? 1 : 0)) : new Uint8Array(m.tag.length);
    const col = it.geo.attributes.color.array, colors = new Float32Array(col.length);
    for (let i = 0; i < col.length; i += 3) { c.setRGB(col[i], col[i + 1], col[i + 2]).convertLinearToSRGB(); colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    return { name: it.part.name, pos, idx: m.idx, triMat, normals: it.geo.attributes.normal.array, colors };
  });
  const lin = h => { const k = new THREE.Color(h); return [k.r, k.g, k.b]; };
  const materials = [{ name: 'Body', color: lin(P.colorBody) }];
  if (twoTone) materials.push({ name: 'Interior', color: lin(P.colorAccent) });
  return writeFBX(parts, materials, { creator: 'DeskKit Studio 3D' });
}
function glbData() {
  return new Promise((res, rej) => {
    const grp = new THREE.Group();
    for (const it of items) { const m = new THREE.Mesh(it.geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: P.roughness })); m.name = it.part.name; m.applyMatrix4(asmMatrix(it)); grp.add(m); }
    grp.scale.setScalar(0.001);
    new GLTFExporter().parse(grp, r => res(r), rej, { binary: true });
  });
}
function pngData() {
  return new Promise(res => {
    const W = 2048, w0 = canvas.clientWidth, h0 = canvas.clientHeight, H = Math.round(W * Math.max(0.5, Math.min(1.5, h0 / w0))), pr0 = renderer.getPixelRatio();
    const bg = scene.background, gv = grid && grid.visible, pv = plate.visible;
    scene.background = null; if (grid) grid.visible = false; plate.visible = false;
    renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0, 0); camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    canvas.toBlob(b => { scene.background = bg; if (grid) grid.visible = gv; plate.visible = pv; renderer.setPixelRatio(pr0); resize(); res(b); }, 'image/png');
  });
}
const jsonData = () => JSON.stringify({ app: 'DeskKit Studio 3D', version: 1, date: today(), params: P }, null, 2);
function guideText() {
  const s = model.stats, dens = DENSITY[P.filament] || 1.24, pv = printedVolume(model.parts, P.infill);
  const temps = { PLA: '200–215 °C / bed 60 °C', 'Silk PLA': '210–225 °C / bed 60 °C, slower walls', 'Wood PLA': '195–210 °C / bed 60 °C, 0.6 mm nozzle recommended', PETG: '230–245 °C / bed 75–85 °C', 'ABS / ASA': '245–260 °C / bed 100 °C, enclosure' }[P.filament];
  const L = ['DESKKIT STUDIO 3D — PRINT GUIDE', '='.repeat(36), `Generated ${today()}`, '', `OBJECT   ${(OBJECT_TYPES.find(t => t[0] === P.objectType) || [])[1]}`,
    `Filament ≈ ${(pv / 1000 * dens).toFixed(0)} g of ${P.filament} at ${P.infill}% infill (solid volume ${(s.volume / 1000).toFixed(1)} cm3)`,
    `Mesh     ${s.tris} triangles, ${s.watertight ? 'watertight' : 'NOT watertight'}`, model.capacity > 0 ? `Capacity ${model.capacity.toFixed(0)} ml` : '', '',
    'PARTS (all exported in print orientation — no supports needed)'];
  model.parts.forEach((p, i) => L.push(`  ${i + 1}. ${p.name}${p.printNote ? ' — ' + p.printNote : ''}`));
  L.push('', 'SLICER SETTINGS', '  Layer height ....... 0.20 mm (0.16 mm for finer curves)', '  Walls .............. 3 perimeters', '  Top / bottom ....... 4 / 4 layers', `  Infill ............. ${P.infill}% gyroid or grid`, '  Supports ........... none', `  Elephant-foot comp.  ${P.bottomChamfer >= 0.4 ? '0 (model has a ' + P.bottomChamfer.toFixed(1) + ' mm bottom chamfer)' : '0.15–0.2 mm'}`, `  Temperatures ....... ${temps}`, '');
  if (P.objectType === 'mini-drawer') L.push('ASSEMBLY', `  Slide the drawers into the case. Sliding clearance is ${P.drawerClear} mm per side —`, '  if a drawer binds, sand the sides lightly or reprint with +0.1 mm clearance.', '');
  if (P.objectType === 'tray' && P.trayFeet !== 'none') L.push('UNDERSIDE', P.trayFeet.startsWith('magnets') ? '  Press 6 × 2 mm neodymium magnets into the four recesses (drop of CA glue).' : '  Stick 10 mm self-adhesive rubber bumpers into the four recesses.', '');
  if (model.warnings.length) L.push('NOTES', ...model.warnings.map(w => '  - ' + w), '');
  return L.filter(l => l !== undefined).join('\n');
}
async function doExport(kind) {
  try {
    if (kind === 'stl') download(stlOf(items, 'plate'), fname('stl'), 'model/stl');
    if (kind === 'obj') download(objData(), fname('obj'), 'text/plain');
    if (kind === 'glb') download(await glbData(), fname('glb'), 'model/gltf-binary');
    if (kind === 'fbx') download(fbxData(), fname('fbx'), 'application/octet-stream');
    if (kind === 'png') download(await pngData(), fname('png'), 'image/png');
    if (kind === 'json') download(jsonData(), fname('json'), 'application/json');
    if (kind === 'zip') {
      toast('Packing…');
      const files = { [fname('stl', 'plate')]: new Uint8Array(stlOf(items, 'plate').buffer) };
      const seen = new Set();
      items.forEach((it, i) => {
        if (seen.has(it.part.mesh)) return; seen.add(it.part.mesh);
        const qty = items.filter(o => o.part.mesh === it.part.mesh).length;
        const name = qty > 1 ? `${slug(it.part.name.replace(/\s*\d+$/, ''))}-x${qty}` : slug(it.part.name);
        files[`parts/${String(seen.size).padStart(2, '0')}-${name}.stl`] = new Uint8Array(stlPart(it).buffer);
      });
      files[fname('obj')] = strToU8(objData());
      files[fname('glb')] = new Uint8Array(await glbData());
      files[fname('fbx')] = fbxData();
      files[fname('png')] = new Uint8Array(await (await pngData()).arrayBuffer());
      files[fname('json')] = strToU8(jsonData());
      files['PRINT_GUIDE.txt'] = strToU8(guideText());
      download(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }), fname('zip'));
    }
    toast(`Exported ${kind.toUpperCase()}`);
  } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
}

// ------------------------------------------------------------------ wiring
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe($('#view'));
for (const b of $$('[data-cam]')) b.onclick = () => fitCamera(b.dataset.cam);
for (const b of $$('[data-tog]')) b.onclick = () => setParam(b.dataset.tog, !P[b.dataset.tog], false);
for (const b of $$('[data-cut]')) b.onclick = () => { view.cut = b.dataset.cut; updateCut(); syncToggles(); };
for (const b of $$('[data-mode]')) b.onclick = () => { P.viewMode = b.dataset.mode; place(); syncToggles(); fitCamera(lastCam); };
$('#cutPos').addEventListener('input', e => { view.cutPos = +e.target.value; updateCut(); });
$('#themeBtn').onclick = () => { view.theme = view.theme === 'dark' ? 'light' : 'dark'; applyTheme(); };
for (const b of $$('[data-exp]')) b.onclick = () => doExport(b.dataset.exp);
$('#loadBtn').onclick = () => $('#loadFile').click();
$('#loadFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()), src = j.params || j, next = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (k in src && typeof src[k] === typeof DEFAULTS[k]) next[k] = src[k];
    P = next; syncUI(); rebuild(); fitCamera('iso'); toast('Preset loaded');
  } catch (err) { toast('Invalid JSON preset'); }
  e.target.value = '';
});
function loop() { controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); }

buildUI(); buildColorMenu(); syncUI(); applyTheme(); resize(); rebuild(); updateMaterials(); fitCamera('iso'); loop();
window.__dk = { get P() { return P; }, get model() { return model; }, setParam, doExport, fitCamera, view, guideText };
