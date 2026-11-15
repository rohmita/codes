// TessellaLock Studio 3D — viewport, UI and exporters
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { SCHEMA, DEFAULTS, PRESETS } from './params.js';
import { buildModelSafe, neighbours, engageOffset, clipPlacements, clearanceAt, stackOffset, DENSITY } from './engine.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PARAMS = SCHEMA.flatMap(g => g.params.map(p => ({ ...p, group: g })));
const PBY = Object.fromEntries(PARAMS.map(p => [p.key, p]));

let P = { ...PRESETS['Hex Honeycomb Dovetail'] };
const view = { cut: 'off', cutPos: 50, shadow: true, theme: 'dark' };
try { const t = localStorage.getItem('tl-theme'); if (t === 'light' || t === 'dark') view.theme = t; } catch (e) { /* storage unavailable */ }

// ------------------------------------------------------------------------------------------
// Renderer / scene
// ------------------------------------------------------------------------------------------
const canvas = $('#cv');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
camera.position.set(220, 200, 260);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotateSpeed = 1.6;

const hemi = new THREE.HemisphereLight(0xffffff, 0x404040, 0.55); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(180, 320, 140); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xb8d4ff, 0.35); fill.position.set(-200, 120, -160); scene.add(fill);

const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
plate.rotation.x = -Math.PI / 2; plate.receiveShadow = true; plate.position.y = -0.02; scene.add(plate);
let grid = null;

const asm = new THREE.Group(); scene.add(asm);
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

// ------------------------------------------------------------------------------------------
// Materials (back faces of a section cut are painted with a flat "cap" colour → solid look)
// ------------------------------------------------------------------------------------------
function capify(mat, capHex) {
  mat.userData.cap = { value: new THREE.Color(capHex).convertLinearToSRGB() };
  mat.onBeforeCompile = sh => {
    sh.uniforms.capColor = mat.userData.cap;
    sh.fragmentShader = 'uniform vec3 capColor;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  if (!gl_FrontFacing) { gl_FragColor = vec4(capColor, 1.0); }');
  };
  mat.customProgramCacheKey = () => 'cap';
  return mat;
}
const matUnit = capify(new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.FrontSide, clippingPlanes: [] }), '#3aa0e0');
const matGhost = capify(new THREE.MeshPhysicalMaterial({ color: 0x4ea8de, transparent: true, side: THREE.FrontSide, clippingPlanes: [], depthWrite: false, forceSinglePass: true }), '#e0603a');
const matGhostSolid = capify(new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.FrontSide, clippingPlanes: [] }), '#e0603a');
const matClip = capify(new THREE.MeshPhysicalMaterial({ color: 0xe07a3a, roughness: 0.4, side: THREE.FrontSide, clippingPlanes: [] }), '#e0603a');
const matWire = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.18, clippingPlanes: [] });

// ------------------------------------------------------------------------------------------
// Geometry conversion: indexed engine mesh → non-indexed with crease-aware normals + face colours
// ------------------------------------------------------------------------------------------
function creasedGeometry(m, crease = 32 * Math.PI / 180) {
  const { pos, idx, tag } = m;
  const nv = pos.length / 3, nt = idx.length / 3;
  const fn = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = 3 * idx[3 * t], b = 3 * idx[3 * t + 1], c = 3 * idx[3 * t + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    fn[3 * t] = uy * vz - uz * vy; fn[3 * t + 1] = uz * vx - ux * vz; fn[3 * t + 2] = ux * vy - uy * vx; // area-weighted
  }
  // vertex -> faces (CSR)
  const cnt = new Uint32Array(nv + 1);
  for (let i = 0; i < idx.length; i++) cnt[idx[i] + 1]++;
  for (let i = 0; i < nv; i++) cnt[i + 1] += cnt[i];
  const fill = cnt.slice(0, nv), adj = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) adj[fill[idx[i]]++] = (i / 3) | 0;
  const cosC = Math.cos(crease);
  const P3 = new Float32Array(nt * 9), N3 = new Float32Array(nt * 9);
  for (let t = 0; t < nt; t++) {
    const fx = fn[3 * t], fy = fn[3 * t + 1], fz = fn[3 * t + 2], fl = Math.hypot(fx, fy, fz) || 1;
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k], o = 9 * t + 3 * k;
      P3[o] = pos[3 * v]; P3[o + 1] = pos[3 * v + 1]; P3[o + 2] = pos[3 * v + 2];
      let sx = 0, sy = 0, sz = 0;
      for (let q = cnt[v]; q < cnt[v + 1]; q++) {
        const g = adj[q], gx = fn[3 * g], gy = fn[3 * g + 1], gz = fn[3 * g + 2], gl = Math.hypot(gx, gy, gz) || 1;
        if ((fx * gx + fy * gy + fz * gz) / (fl * gl) >= cosC) { sx += gx; sy += gy; sz += gz; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      N3[o] = sx / l; N3[o + 1] = sy / l; N3[o + 2] = sz / l;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P3, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N3, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nt * 9), 3));
  g.userData.tags = tag;
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
function tagColors() {
  const body = new THREE.Color(P.colorPrimary);
  const male = new THREE.Color(P.colorJoint ? P.colorMale : P.colorPrimary);
  const fem = new THREE.Color(P.colorJoint ? P.colorFemale : P.colorPrimary);
  return [body, male, fem, male, fem];
}
function paint(g, clipTag) {
  const cols = tagColors(), tags = g.userData.tags, col = g.attributes.color.array;
  for (let t = 0; t < tags.length; t++) {
    const c = cols[clipTag !== undefined ? clipTag : tags[t]] || cols[0];
    for (let k = 0; k < 3; k++) { const o = 9 * t + 3 * k; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; }
  }
  g.attributes.color.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------
// Build + assembly
// ------------------------------------------------------------------------------------------
let model = null, unitGeo = null, clipGeo = null, nbs = [], lastClr = null;
const meshes = { unit: null, ghosts: [], clips: [], wires: [] };

function rebuild(preview = false) {
  const Q = preview ? { ...P, curveSegs: Math.min(P.curveSegs, 40), heightSegs: Math.min(P.heightSegs, 40) } : P;
  model = buildModelSafe(Q);
  if (unitGeo) unitGeo.dispose();
  if (clipGeo) clipGeo.dispose();
  unitGeo = creasedGeometry(model.mesh); paint(unitGeo);
  clipGeo = model.clip ? creasedGeometry(model.clip) : null;
  if (clipGeo) paint(clipGeo, 1);
  layoutAssembly();
  updateHUD();
  updateExportHint();
}

function clearAsm() {
  for (const m of [...asm.children]) asm.remove(m);
  meshes.ghosts = []; meshes.clips = []; meshes.wires = []; meshes.unit = null;
}

function layoutAssembly() {
  clearAsm();
  nbs = neighbours(model, P.assemblyMode);
  const unit = new THREE.Mesh(unitGeo, matUnit);
  unit.castShadow = unit.receiveShadow = true;
  asm.add(unit); meshes.unit = unit;
  const solid = P.ghostOpacity >= 0.99 || view.cut !== 'off';   // opaque neighbours while sectioning (clean caps)
  for (const nb of nbs) {
    const g = new THREE.Mesh(unitGeo, solid ? matGhostSolid : matGhost);
    g.castShadow = solid; g.receiveShadow = solid; g.userData.nb = nb;
    asm.add(g); meshes.ghosts.push(g);
  }
  if (clipGeo && model.C.polarity === 'all-female-clip') {
    for (const c of clipPlacements(model, nbs)) {
      const m = new THREE.Mesh(clipGeo, matClip);
      m.userData.place = c; m.castShadow = true;
      asm.add(m); meshes.clips.push(m);
    }
  }
  for (const m of [unit, ...meshes.ghosts, ...meshes.clips]) {
    const w = new THREE.Mesh(m.geometry, matWire); w.visible = !!P.wireframe; w.userData.of = m;
    asm.add(w); meshes.wires.push(w);
  }
  applyEngage();
  updatePlate();
}

function applyEngage() {
  const e = P.slideEngage / 100;
  for (const g of meshes.ghosts) {
    const nb = g.userData.nb, off = engageOffset(model, nb, e);
    g.position.set(nb.tx + off.dx, (nb.ty || 0) + off.dy, nb.tz + off.dz);
    g.rotation.set(0, -nb.rot, 0);
  }
  for (const m of meshes.clips) {
    const c = m.userData.place, off = engageOffset(model, { side: 0 }, e);
    m.position.set(c.x, c.y + (off.clipDy || 0), c.z);
    m.rotation.set(0, Math.atan2(Math.cos(c.ang), Math.sin(c.ang)), 0);
  }
  for (const w of meshes.wires) { const o = w.userData.of; w.position.copy(o.position); w.rotation.copy(o.rotation); }
  $('#engageV').textContent = `${Math.round(P.slideEngage)}%`;
  updateCut();
}

function asmBox(locked = false) {
  const box = new THREE.Box3();
  const add = (m, pos, rotY) => {
    const b = m.geometry.boundingBox.clone();
    const M = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1));
    box.union(b.applyMatrix4(M));
  };
  if (meshes.unit) add(meshes.unit, new THREE.Vector3(), 0);
  for (const g of meshes.ghosts) {
    const nb = g.userData.nb;
    if (locked) add(g, new THREE.Vector3(nb.tx, nb.ty || 0, nb.tz), -nb.rot); else add(g, g.position, g.rotation.y);
  }
  return box;
}

function updatePlate() {
  const box = asmBox(true), size = box.getSize(new THREE.Vector3());
  const span = Math.max(240, Math.ceil(Math.max(size.x, size.z) * 1.8 / 20) * 20);
  plate.scale.set(span * 2, span * 2, 1);
  const c = box.getCenter(new THREE.Vector3());
  plate.position.set(c.x, -0.02, c.z);
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  const dark = view.theme === 'dark';
  grid = new THREE.GridHelper(span, span / 10, dark ? 0x4a4c52 : 0xb3ad9f, dark ? 0x26282c : 0xd8d3c7);
  grid.position.set(Math.round(c.x / 10) * 10, 0, Math.round(c.z / 10) * 10);
  grid.material.transparent = true; grid.material.opacity = dark ? 0.9 : 1;
  grid.visible = !!P.showGrid; scene.add(grid);
  const r = Math.max(size.x, size.z, size.y) * 1.2 + 60;
  sun.shadow.camera.left = -r; sun.shadow.camera.right = r; sun.shadow.camera.top = r; sun.shadow.camera.bottom = -r;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 2000; sun.shadow.camera.updateProjectionMatrix();
  sun.position.set(c.x + 180, 320 + size.y, c.z + 140); sun.target.position.copy(c);
}

function updateMaterials() {
  for (const m of [matUnit, matGhostSolid]) {
    m.roughness = P.roughness; m.metalness = P.metalness; m.clearcoat = P.clearcoat; m.clearcoatRoughness = 0.5;
    if (m.flatShading !== !!P.flatShading) { m.flatShading = !!P.flatShading; m.needsUpdate = true; }
  }
  matGhost.opacity = P.ghostOpacity; matGhost.roughness = 0.35; matGhost.metalness = 0; matGhost.clearcoat = 0.3;
  if (matGhost.flatShading !== !!P.flatShading) { matGhost.flatShading = !!P.flatShading; matGhost.needsUpdate = true; }
  matClip.roughness = P.roughness; matClip.metalness = P.metalness;
  if (unitGeo) paint(unitGeo);
  for (const w of meshes.wires) w.visible = !!P.wireframe;
  if (grid) grid.visible = !!P.showGrid;
  controls.autoRotate = !!P.autoRotate;
  sun.castShadow = view.shadow; plate.visible = view.shadow;
  syncToggles();
}

// ------------------------------------------------------------------------------------------
// Section cut + clearance heatmap readout
// ------------------------------------------------------------------------------------------
function updateCut() {
  const on = view.cut !== 'off';
  const mats = [matUnit, matGhost, matGhostSolid, matClip, matWire];
  for (const m of mats) {
    m.clippingPlanes = on ? [cutPlane] : [];
    const side = on && m !== matWire ? THREE.DoubleSide : THREE.FrontSide;
    if (m.side !== side) { m.side = side; m.needsUpdate = true; }
  }
  // heatmap colours: primary unit = socket (cyan), neighbours = pins (amber)
  matUnit.userData.cap.value.set('#3aa0e0').convertLinearToSRGB();
  if (on && meshes.unit) {
    const box = asmBox(false), f = view.cutPos / 100;
    if (view.cut === 'y') { cutPlane.normal.set(0, -1, 0); cutPlane.constant = box.min.y + (box.max.y - box.min.y) * f; }
    if (view.cut === 'x') { cutPlane.normal.set(-1, 0, 0); cutPlane.constant = box.min.x + (box.max.x - box.min.x) * f; }
    if (view.cut === 'z') { cutPlane.normal.set(0, 0, -1); cutPlane.constant = box.min.z + (box.max.z - box.min.z) * f; }
  }
  updateClearance();
}

function updateClearance() {
  lastClr = null;
  const C = model && model.C;
  if (!C || C.yJ0 === undefined || !nbs.some(n => n.side >= 0)) { updateHUD(); return; }
  const y = view.cut === 'y' ? cutPlane.constant : (C.yJ0 + C.yJ1) / 2;
  if (y > 0 && y < C.H) lastClr = clearanceAt(model, nbs, y);
  if (lastClr) lastClr.atCut = view.cut === 'y';
  updateHUD();
}

// ------------------------------------------------------------------------------------------
// HUD
// ------------------------------------------------------------------------------------------
const fmt = (v, d = 1) => (isFinite(v) ? v.toFixed(d) : '—');
function updateHUD() {
  if (!model) return;
  const s = model.stats, C = model.C;
  const man = s.manifold.ok ? `<span class="ok">closed ✓</span>` : `<span class="bad">open edges ${s.manifold.open}</span>`;
  let clr = '';
  if (lastClr) {
    const ok = !lastClr.interf;
    const mode = C.polarity === 'all-female-clip' ? 'socket wall gap' : 'pin ↔ socket';
    clr = `<dt>Joint clearance</dt><dd class="${ok ? 'ok' : 'bad'}">${ok ? fmt(lastClr.minGap, 3) + ' mm' : 'interference ✗'}</dd>
           <dt>${lastClr.atCut ? 'Section' : 'Probe'} y</dt><dd>${fmt(lastClr.y, 1)} mm · ${mode}</dd>`;
  }
  let strain = '';
  if (s.strain !== undefined) strain = `<dt>Snap strain</dt><dd class="${s.strainWarn ? 'warn' : 'ok'}">${fmt(s.strain, 2)} %</dd>`;
  const warns = [...model.warnings];
  if (s.strainWarn) warns.unshift(s.strainWarn);
  const html = `<h3><span>Engineering HUD</span><button id="hudMin" aria-label="Collapse HUD">${hudMin ? '+' : '–'}</button></h3>
  <dl>
    <dt>Footprint</dt><dd>${fmt(s.bbox[0])} × ${fmt(s.bbox[1])} × ${fmt(s.bbox[2])} mm</dd>
    <dt>Grid pitch</dt><dd>${s.pitch.label}</dd>
    <dt>Material</dt><dd>${fmt(s.volume / 1000, 1)} cm³ · ${fmt(s.mass, 0)} g</dd>
    <dt>Capacity</dt><dd>${fmt(s.capacity, 0)} ml</dd>
    ${clr}${strain}
    <dt>Mesh</dt><dd>${(s.tris / 1000).toFixed(1)}k tris · ${man}</dd>
    <dt>Rebuild</dt><dd>${fmt(s.ms, 0)} ms</dd>
  </dl>
  ${warns.length ? `<ul>${warns.map(w => `<li>${w.replace(/^⚠\s*/, '')}</li>`).join('')}</ul>` : ''}`;
  const hud = $('#hud'); hud.innerHTML = html; hud.classList.toggle('min', hudMin);
  $('#hudMobile').innerHTML = `<div class="hud">${html}</div>`;
  for (const b of $$('#hudMin')) b.onclick = () => { hudMin = !hudMin; updateHUD(); };
  const lg = $('#legend');
  lg.innerHTML = view.cut !== 'off' && nbs.length
    ? `<span><i style="background:#3aa0e0"></i>socket unit</span><span><i style="background:#e0603a"></i>pin unit</span><span>gap = dark</span>`
    : `<span><i style="background:${P.colorPrimary}"></i>body</span>${P.colorJoint ? `<span><i style="background:${P.colorMale}"></i>male</span><span><i style="background:${P.colorFemale}"></i>female</span>` : ''}${nbs.length && P.ghostOpacity < 0.99 ? `<span><i style="background:#4ea8de"></i>neighbour</span>` : ''}`;
}
let hudMin = false;

// ------------------------------------------------------------------------------------------
// UI from SCHEMA
// ------------------------------------------------------------------------------------------
const ctrls = {};
function buildUI() {
  const host = $('#groups');
  host.innerHTML = '';
  SCHEMA.forEach((g, gi) => {
    const det = document.createElement('details');
    det.className = 'group'; det.open = !!g.open; det.dataset.gid = g.id;
    det.innerHTML = `<summary><span class="idx">${String(gi + 1).padStart(2, '0')}</span>${g.title}<span class="chev"></span></summary>`;
    const rows = document.createElement('div'); rows.className = 'rows'; det.appendChild(rows);
    for (const p of g.params) {
      const row = document.createElement('div'); row.className = 'row'; row.dataset.key = p.key;
      const id = 'p-' + p.key;
      if (p.type === 'range') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.label}</label><input class="num" type="number" min="${p.min}" max="${p.max}" step="${p.step}" aria-label="${p.label} value"><span class="unit">${p.unit || ''}</span></div>
          <input id="${id}" type="range" min="${p.min}" max="${p.max}" step="${p.step}"><div class="hint"></div>`;
        const r = row.querySelector('input[type=range]'), n = row.querySelector('.num');
        r.addEventListener('input', () => setParam(p.key, +r.value, true));
        r.addEventListener('change', () => setParam(p.key, +r.value, false));
        n.addEventListener('change', () => setParam(p.key, Math.min(p.max, Math.max(p.min, +n.value || p.min)), false));
        ctrls[p.key] = { row, r, n, p: PBY[p.key] };
      } else if (p.type === 'select') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.label}</label></div><select id="${id}">${p.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select><div class="hint"></div>`;
        const sel = row.querySelector('select');
        sel.addEventListener('change', () => setParam(p.key, sel.value, false));
        ctrls[p.key] = { row, sel, p: PBY[p.key] };
      } else if (p.type === 'check') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.label}</label><label class="switch"><input id="${id}" type="checkbox"><span></span></label></div>`;
        const cb = row.querySelector('input');
        cb.addEventListener('change', () => setParam(p.key, cb.checked, false));
        ctrls[p.key] = { row, cb, p: PBY[p.key] };
      } else if (p.type === 'color') {
        row.innerHTML = `<div class="top"><label class="lbl" for="${id}">${p.label}</label><input id="${id}" type="color"></div>`;
        const ci = row.querySelector('input');
        ci.addEventListener('input', () => setParam(p.key, ci.value, true));
        ctrls[p.key] = { row, ci, p: PBY[p.key] };
      }
      rows.appendChild(row);
    }
    host.appendChild(det);
  });
  const ps = $('#presetSel');
  ps.innerHTML = `<option value="">— custom —</option>` + Object.keys(PRESETS).map(k => `<option>${k}</option>`).join('');
  ps.value = 'Hex Honeycomb Dovetail';
  ps.addEventListener('change', () => { if (PRESETS[ps.value]) { P = { ...PRESETS[ps.value] }; syncUI(); rebuild(); fitCamera('iso'); } });
  const as = $('#asmSel');
  as.innerHTML = PBY.assemblyMode.options.map(o => `<option value="${o}">${o}</option>`).join('');
  as.addEventListener('change', () => setParam('assemblyMode', as.value, false));
  const en = $('#engage');
  en.addEventListener('input', () => setParam('slideEngage', +en.value, true));
}

function syncUI() {
  for (const k in ctrls) {
    const c = ctrls[k], v = P[k];
    if (c.r) { c.r.value = v; c.n.value = +(+v).toFixed(3); c.r.style.setProperty('--p', `${((v - c.p.min) / (c.p.max - c.p.min)) * 100}%`); }
    if (c.sel) c.sel.value = v;
    if (c.cb) c.cb.checked = !!v;
    if (c.ci) c.ci.value = v;
    const show = (!c.p.group.show || c.p.group.show(P)) && (!c.p.show || c.p.show(P));
    c.row.classList.toggle('hide', !show);
    const h = c.row.querySelector('.hint'); if (h) h.textContent = c.p.hint ? c.p.hint(P) : '';
  }
  for (const det of $$('details.group')) {
    const g = SCHEMA.find(x => x.id === det.dataset.gid);
    det.style.display = g.show && !g.show(P) ? 'none' : '';
  }
  $('#asmSel').value = P.assemblyMode;
  $('#engage').value = P.slideEngage;
  $('#engage').style.setProperty('--p', `${P.slideEngage}%`);
  syncToggles();
}

function syncToggles() {
  for (const b of $$('[data-tog]')) {
    const k = b.dataset.tog;
    b.classList.toggle('on', k === 'shadow' ? view.shadow : !!P[k]);
  }
  for (const b of $$('[data-cut]')) b.classList.toggle('on', b.dataset.cut === view.cut);
  for (const b of $$('[data-cam]')) b.classList.toggle('on', b.dataset.cam === lastCam);
  $('#themeBtn').textContent = view.theme === 'dark' ? 'Light' : 'Dark';
}

let rebuildRaf = 0, pendingPreview = false;
function scheduleRebuild(preview) {
  pendingPreview = preview;
  $('#busy').classList.add('on');
  if (rebuildRaf) return;
  rebuildRaf = requestAnimationFrame(() => {
    rebuildRaf = 0;
    rebuild(pendingPreview);
    $('#busy').classList.remove('on');
  });
}

function setParam(key, value, live) {
  const p = PBY[key];
  P[key] = value;
  if (p.type !== 'color' && p.type !== 'check') $('#presetSel').value = Object.keys(PRESETS).find(k => JSON.stringify(PRESETS[k]) === JSON.stringify(P)) || '';
  syncUI();
  if (key === 'slideEngage') { applyEngage(); return; }
  if (key === 'assemblyMode' || key === 'ghostOpacity' && ((value >= 0.99) !== (meshes.ghosts[0] && meshes.ghosts[0].material === matGhostSolid))) { layoutAssembly(); updateMaterials(); updateHUD(); return; }
  if (key === 'exportTarget') { updateExportHint(); return; }
  if (p.live) { updateMaterials(); updateHUD(); return; }
  scheduleRebuild(live);
}

// ------------------------------------------------------------------------------------------
// Camera
// ------------------------------------------------------------------------------------------
let lastCam = 'iso';
function fitCamera(kind = lastCam) {
  lastCam = kind;
  const box = asmBox(true), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const r = Math.max(size.length() * 0.5, 30);
  const vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * Math.max(camera.aspect, 0.3));
  const d = r / Math.sin(Math.min(vf, hf)) * 1.05;
  const dir = { front: [0, 0.12, 1], side: [1, 0.12, 0], top: [0, 1, 0.0001], iso: [0.85, 0.75, 1] }[kind];
  if (kind === 'iso' && nbs.length && !nbs[0].stack) {
    let cx = 0, cz = 0; for (const nb of nbs) { cx += nb.tx; cz += nb.tz; }
    const a = Math.atan2(-cz, -cx) + 0.7;             // away from the neighbours, rotated for a 3/4 view
    dir[0] = Math.cos(a); dir[2] = Math.sin(a); dir[1] = 0.85;
  }
  const v = new THREE.Vector3(...dir).normalize().multiplyScalar(d);
  camera.position.copy(c).add(v); controls.target.copy(c);
  camera.near = Math.max(0.5, d / 200); camera.far = d * 20; camera.updateProjectionMatrix();
  controls.update(); syncToggles();
}

// ------------------------------------------------------------------------------------------
// Theme
// ------------------------------------------------------------------------------------------
function applyTheme() {
  document.documentElement.dataset.theme = view.theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--viewport').trim();
  scene.background = new THREE.Color(bg);
  matWire.color.set(view.theme === 'dark' ? 0x000000 : 0x2a2418);
  hemi.intensity = view.theme === 'dark' ? 0.55 : 0.8;
  try { localStorage.setItem('tl-theme', view.theme); } catch (e) { /* ignore */ }
  updatePlate(); syncToggles();
}

// ------------------------------------------------------------------------------------------
// Exports
// ------------------------------------------------------------------------------------------
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fname = ext => `tessellalock-${P.baseShape}-${P.jointType}-${today()}.${ext}`;
function updateExportHint() {
  const t = P.exportTarget, ok = t !== 'dogbone-clip-only' || !!model?.clip;
  $('#fnameHint').textContent = ok ? t : 'no clip in this mode';
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200); }
function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// geometry that will be exported (world-space, Y-up, mm) with colours
function exportGeometry() {
  const parts = [];
  const t = P.exportTarget;
  if (t === 'dogbone-clip-only') {
    if (!clipGeo) return null;
    const g = clipGeo.clone(); g.rotateX(0); // clip already stands on y = 0
    parts.push(g);
  } else {
    parts.push(unitGeo.clone());
    if (t === 'full-assembly') {
      for (const m of [...meshes.ghosts, ...meshes.clips]) {
        const g = m.geometry.clone();
        if (m.material === matClip) paint(g, 1); else paint(g);
        m.updateMatrix(); g.applyMatrix4(m.matrix); parts.push(g);
      }
    }
  }
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.array.length; g.dispose(); }
  const G = new THREE.BufferGeometry();
  G.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  G.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  G.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return G;
}
function stlData() {
  const G = exportGeometry(); if (!G) return null;
  G.rotateX(Math.PI / 2);           // Y-up → Z-up for slicers
  const m = new THREE.Mesh(G, new THREE.MeshBasicMaterial()); m.name = 'tessellalock';
  const out = new STLExporter().parse(m, { binary: true });
  G.dispose(); return out;
}
// Welded (indexed) export mesh straight from the engine: much smaller OBJ files.
// Vertex colour = highest joint tag among the faces sharing the vertex.
function exportIndexed() {
  const items = [], t = P.exportTarget;
  if (t === 'dogbone-clip-only') { if (!model.clip) return null; items.push([model.clip, new THREE.Matrix4(), 1]); }
  else {
    items.push([model.mesh, new THREE.Matrix4(), -1]);
    if (t === 'full-assembly') {
      for (const m of meshes.ghosts) { m.updateMatrix(); items.push([model.mesh, m.matrix.clone(), -1]); }
      for (const m of meshes.clips) { m.updateMatrix(); items.push([model.clip, m.matrix.clone(), 1]); }
    }
  }
  let nv = 0, ni = 0; for (const [m] of items) { nv += m.pos.length / 3; ni += m.idx.length; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), index = new Uint32Array(ni);
  const cols = tagColors(), v = new THREE.Vector3();
  let vo = 0, io = 0;
  for (const [m, M, forced] of items) {
    const n = m.pos.length / 3, vt = new Uint8Array(n);
    for (let i = 0; i < m.idx.length; i++) { const tg = forced >= 0 ? forced : m.tag[(i / 3) | 0]; if (tg > vt[m.idx[i]]) vt[m.idx[i]] = tg; index[io + i] = m.idx[i] + vo; }
    for (let i = 0; i < n; i++) {
      v.set(m.pos[3 * i], m.pos[3 * i + 1], m.pos[3 * i + 2]).applyMatrix4(M);
      pos[3 * (vo + i)] = v.x; pos[3 * (vo + i) + 1] = v.y; pos[3 * (vo + i) + 2] = v.z;
      const c = cols[vt[i]] || cols[0]; col[3 * (vo + i)] = c.r; col[3 * (vo + i) + 1] = c.g; col[3 * (vo + i) + 2] = c.b;
    }
    vo += n; io += m.idx.length;
  }
  const G = new THREE.BufferGeometry();
  G.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  G.setAttribute('color', new THREE.BufferAttribute(col, 3));
  G.setIndex(new THREE.BufferAttribute(index, 1));
  return G;
}
function objData() {
  const G = exportIndexed(); if (!G) return null;
  const m = new THREE.Mesh(G, new THREE.MeshStandardMaterial({ vertexColors: true })); m.name = 'tessellalock';
  let txt = new OBJExporter().parse(m);
  // OBJExporter writes positions only; append sRGB vertex colours ("v x y z r g b")
  const col = G.attributes.color.array, c = new THREE.Color(); let vi = 0;
  txt = txt.replace(/^v (.+)$/gm, (line, rest) => {
    c.setRGB(col[3 * vi], col[3 * vi + 1], col[3 * vi + 2]).convertLinearToSRGB(); vi++;
    return `v ${rest} ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`;
  });
  G.dispose();
  return `# TessellaLock Studio 3D — ${P.baseShape} / ${P.jointType} / ${P.polarityMode}\n# units: mm, Y-up; vertex colours: body / male / female\n` + txt;
}
function glbData() {
  return new Promise((res, rej) => {
    const G = exportGeometry(); if (!G) return res(null);
    G.scale(0.001, 0.001, 0.001);    // mm → m
    const m = new THREE.Mesh(G, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: P.roughness, metalness: P.metalness }));
    m.name = 'TessellaLock';
    new GLTFExporter().parse(m, r => { G.dispose(); res(r); }, rej, { binary: true });
  });
}
function pngData() {
  return new Promise(res => {
    const w0 = canvas.clientWidth, h0 = canvas.clientHeight, pr0 = renderer.getPixelRatio();
    const W = 2048, H = Math.round(2048 * Math.max(0.5, Math.min(1.5, h0 / w0)));
    const bg = scene.background, gv = grid && grid.visible, pv = plate.visible;
    scene.background = null; if (grid) grid.visible = false; plate.visible = false;
    renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.setClearColor(0x000000, 0);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    canvas.toBlob(b => {
      scene.background = bg; if (grid) grid.visible = gv; plate.visible = pv;
      renderer.setPixelRatio(pr0); resize();
      res(b);
    }, 'image/png');
  });
}
function jsonData() {
  const out = { app: 'TessellaLock Studio 3D', version: 1, date: today(), params: P };
  return JSON.stringify(out, null, 2);
}
function guideText() {
  const s = model.stats, C = model.C, f = P.filamentPreset;
  const temps = { 'PLA (Stiff)': '200–215 °C nozzle / 60 °C bed', 'PETG (Recommended for Snap)': '230–245 °C / 75–85 °C', 'ABS / ASA': '245–260 °C / 100 °C, enclosure', 'TPU (Flex)': '220–235 °C / 50 °C, slow 20–30 mm/s' }[f];
  const efc = P.elephantChamfer >= 0.4 ? '0.00 mm (the model already carries a ' + P.elephantChamfer.toFixed(1) + ' mm bottom chamfer)' : '0.15–0.20 mm (model chamfer is small)';
  const L = [];
  L.push('TESSELLALOCK STUDIO 3D — PRINT GUIDE', '='.repeat(40), `Generated ${today()}`, '');
  L.push('PART', `  Shape .............. ${P.baseShape}${P.baseShape === 'multigon' ? ' (' + C.N + ' sides)' : ''}`, `  Footprint .......... ${s.bbox[0].toFixed(1)} x ${s.bbox[1].toFixed(1)} x ${s.bbox[2].toFixed(1)} mm`, `  Grid pitch ......... ${s.pitch.label}`, `  Locking ............ ${P.jointType} / ${C.polarity}`, `  Material ........... ${(s.volume / 1000).toFixed(1)} cm3, approx. ${s.mass.toFixed(0)} g of ${f} (${s.density} g/cm3, 100% solid estimate)`, `  Capacity ........... ${s.capacity.toFixed(0)} ml`, `  Mesh ............... ${s.tris} triangles, ${s.manifold.ok ? 'watertight' : 'NOT watertight'}, ${s.manifold.shells} shell(s)`, '');
  L.push('SLICER SETTINGS', '  Layer height ....... 0.20 mm (0.12–0.16 mm for finer joints)', '  Walls / perimeters . >= 3 (4 recommended for snap-fits)', '  Top/bottom layers .. >= 4', '  Infill ............. 15–25 % gyroid', `  Elephant-foot comp.  ${efc}`, '  Supports ........... NONE — all joint overhangs are tapered to ' + P.overhangAngle + '°', `  Temperatures ....... ${temps}`, '  Orientation ........ as exported (STL is Z-up, floor on the bed)', '');
  L.push('FIT & TOLERANCES', `  XY clearance ....... ${P.clearance.toFixed(2)} mm per contact face (male -δ/2, female +δ/2)`, `  Z clearance ........ ${P.zClearance.toFixed(2)} mm`, `  Lead-in bevel ...... ${P.leadInChamfer.toFixed(1)} mm`, '  Tip: print a pair first. Too tight -> raise clearance by 0.05 mm; loose -> lower it.', '');
  if (C.polarity === 'hermaphroditic') L.push('ASSEMBLY', '  Every unit is identical. Rotate one unit 180° and face any active wall to another;', C.sliding ? '  slide the neighbour down from above until both rest on the table.' : '  push the walls together until the connectors lock.', '');
  if (C.polarity === 'alternating') L.push('ASSEMBLY', '  Male walls face female walls of the next unit (translated copy, same orientation).', C.sliding ? '  Lower the unit carrying the male rail into the open-top female slot until it hits the stop ledge.' : '', '');
  if (C.polarity === 'all-female-clip') L.push('ASSEMBLY', '  All walls are female. Print the double-male dogbone clips (export target "dogbone-clip-only")', `  — ${C.sides.reduce((a, s) => a + s.length, 0)} slot(s) per unit; one clip joins two units.`, '');
  if (P.exportTarget === 'full-assembly') L.push('FULL-ASSEMBLY EXPORT', '  Units are exported in their assembled positions; neighbouring flat walls touch exactly.', '  For batch printing, spread the parts apart in the slicer (or export single units).', '');
  if (C.stack) L.push('STACKING', `  Rim height ${C.hl.toFixed(1)} mm: the bottom plug of the upper unit drops into the top of the lower unit.`, '');
  if (C.mag) {
    const nMag = C.sides.reduce((a, s) => a + s.length, 0) * C.mag.rows;
    L.push('MAGNETS', `  Size ............... Ø${P.magDiameter} x ${P.magThickness} mm neodymium discs (N35–N52)`, `  Quantity ........... ${nMag} per unit (${C.mag.rows} per slot)`, `  Pocket ............. Ø${C.mag.Dm.toFixed(2)} x ${C.mag.Tm.toFixed(2)} mm, wall skin ${P.magWallSkin} mm`, `  Insertion .......... ${P.magInsertStyle}${P.magInsertStyle === 'embedded-pause' ? ' — add a pause in the slicer at the layer just above the pocket roof start' : P.magInsertStyle === 'top-drop-slot' ? ' — drop magnets in from the top rim; a 0.25 mm detent lip holds them' : ' — press magnets into the side pockets (a drop of CA glue helps)'}`, '  Polarity ........... slots marked orange = NORTH facing out, blue = SOUTH facing out', '                       (identical units then always attract).', '');
  }
  if (s.strain !== undefined) L.push('SNAP-FIT', `  Estimated beam strain ${s.strain.toFixed(2)} % (ε ≈ 3·t·h / 2L²)${s.strainWarn ? ' — ' + s.strainWarn : ''}`, '');
  if (model.warnings.length) L.push('NOTES', ...model.warnings.map(w => '  - ' + w.replace(/^⚠\s*/, '')), '');
  return L.join('\n');
}

async function doExport(kind) {
  try {
    if (P.exportTarget === 'dogbone-clip-only' && !clipGeo && ['stl', 'obj', 'glb', 'zip'].includes(kind)) { toast('No dogbone clip: choose polarity "all-female-clip" with a sliding joint'); return; }
    if (kind === 'stl') download(stlData(), fname('stl'), 'model/stl');
    if (kind === 'obj') download(objData(), fname('obj'), 'text/plain');
    if (kind === 'glb') download(await glbData(), fname('glb'), 'model/gltf-binary');
    if (kind === 'png') download(await pngData(), fname('png'), 'image/png');
    if (kind === 'json') download(jsonData(), fname('json'), 'application/json');
    if (kind === 'zip') {
      toast('Packing…');
      const png = new Uint8Array(await (await pngData()).arrayBuffer());
      const files = {
        [fname('stl')]: new Uint8Array(stlData().buffer),
        [fname('obj')]: strToU8(objData()),
        [fname('glb')]: new Uint8Array(await glbData()),
        [fname('png')]: png,
        [fname('json')]: strToU8(jsonData()),
        'PRINT_GUIDE.txt': strToU8(guideText()),
      };
      download(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }), fname('zip'));
    }
    toast(`Exported ${kind.toUpperCase()}`);
  } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
}

// ------------------------------------------------------------------------------------------
// Wiring
// ------------------------------------------------------------------------------------------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe($('#view'));

for (const b of $$('[data-cam]')) b.onclick = () => fitCamera(b.dataset.cam);
for (const b of $$('[data-tog]')) b.onclick = () => {
  const k = b.dataset.tog;
  if (k === 'shadow') { view.shadow = !view.shadow; updateMaterials(); return; }
  setParam(k, !P[k], false);
};
for (const b of $$('[data-cut]')) b.onclick = () => { const was = view.cut !== 'off'; view.cut = b.dataset.cut; if (was !== (view.cut !== 'off')) layoutAssembly(); else updateCut(); syncToggles(); updateHUD(); };
$('#cutPos').addEventListener('input', e => { view.cutPos = +e.target.value; updateCut(); });
$('#themeBtn').onclick = () => { view.theme = view.theme === 'dark' ? 'light' : 'dark'; applyTheme(); };
for (const b of $$('[data-exp]')) b.onclick = () => doExport(b.dataset.exp);
$('#loadBtn').onclick = () => $('#loadFile').click();
$('#loadFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()), src = j.params || j;
    const next = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (k in src && typeof src[k] === typeof DEFAULTS[k]) next[k] = src[k];
    P = next; syncUI(); rebuild(); fitCamera('iso'); toast('Preset loaded');
  } catch (err) { toast('Invalid JSON preset'); }
  e.target.value = '';
});

function loop() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

buildUI();
syncUI();
applyTheme();
resize();
rebuild();
updateMaterials();
fitCamera('iso');
loop();
window.__tl = { get P() { return P; }, get model() { return model; }, rebuild, setParam, doExport, view, updateCut, fitCamera, guideText, camera, controls };
