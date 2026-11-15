import { zipSync } from 'fflate';
import { OV, ThumbnailRenderer, studioEnvironment, loadInto, importSettings, fitView, threeQuarterView, modelStats } from './engine.js';
import {
  groupIntoModels, filesFromDataTransfer, filesFromUrls, formatBytes, stemOf, baseName,
  MODEL_EXTENSIONS, REMOTE_LIB_EXTENSIONS,
} from './files.js';
import { buildSamples } from './samples.js';
import { icon } from './icons.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('id-ID');
const fmtNum = (n) => nf.format(n);
const fmtLen = (n) => (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) ? n.toExponential(2) : nf.format(+n.toFixed(3));
const store = {
  get(k, d) { try { const v = localStorage.getItem('r3d.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('r3d.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const FORMAT_NAMES = {
  obj: 'Wavefront OBJ', stl: 'Stereolithography (STL)', off: 'Object File Format', ply: 'Polygon File Format',
  '3ds': 'Autodesk 3DS', gltf: 'glTF (JSON)', glb: 'glTF Binary', fbx: 'Autodesk FBX', dae: 'COLLADA',
  wrl: 'VRML', '3mf': '3D Manufacturing Format', amf: 'Additive Manufacturing', bim: 'dotbim',
  '3dm': 'Rhino 3DM', ifc: 'IFC (BIM)', step: 'STEP (CAD)', stp: 'STEP (CAD)', iges: 'IGES (CAD)',
  igs: 'IGES (CAD)', brep: 'OpenCascade BREP', brp: 'OpenCascade BREP', fcstd: 'FreeCAD',
};
const UNIT_NAMES = { 1: 'mm', 2: 'cm', 3: 'm', 4: 'in', 5: 'ft' };

// ---------------------------------------------------------------- state
const prefersLight = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches;
const state = {
  models: [],
  current: null,
  view: 'welcome',
  model: null,        // OV.Model of the model in the main viewer
  importResult: null,
  meshes: [],         // [{ key, id, name, tris, color, depth, kind }]
  hidden: new Set(),
  selected: null,
  edges: store.get('edges', false),
  upZ: false,
  freeOrbit: store.get('freeOrbit', false),
  ortho: store.get('ortho', false),
  theme: store.get('theme', prefersLight ? 'light' : 'dark'),
  bg: store.get('bg', null),
  filter: '',
  sort: store.get('sort', 'added'),
  cardSize: store.get('cardSize', 220),
  thumbsDone: 0,
  thumbsTotal: 0,
};
let loadToken = 0;
let mainChain = Promise.resolve();

// ---------------------------------------------------------------- engine setup
document.documentElement.dataset.theme = state.theme;
const stage = $('#stage');
const viewerHost = $('#viewer');
const canvas = document.createElement('canvas');
viewerHost.appendChild(canvas);
const viewer = new OV.Viewer();
viewer.Init(canvas);
viewer.SetEnvironmentMapSettings(studioEnvironment());
const loader = new OV.ThreeModelLoader();
const thumbs = new ThumbnailRenderer(400, 300);
const settings = importSettings();

new ResizeObserver(() => viewer.Resize(stage.clientWidth, stage.clientHeight)).observe(stage);
viewer.Resize(stage.clientWidth, stage.clientHeight);

function themeBg() {
  return state.theme === 'light' ? '#f7f8fa' : '#1d2128';
}
function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new OV.RGBAColor((n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
}
function applyBackground() {
  viewer.SetBackgroundColor(hexToRgba(state.bg || themeBg()));
  stage.style.background = state.bg || '';
}
function applyEdges() {
  const c = state.theme === 'light' || (state.bg && luminance(state.bg) > 0.4) ? new OV.RGBColor(20, 22, 26) : new OV.RGBColor(8, 9, 11);
  viewer.SetEdgeSettings(new OV.EdgeSettings(state.edges, c, 1));
}
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
applyBackground();
applyEdges();
viewer.SetNavigationMode(state.freeOrbit ? OV.NavigationMode.FreeOrbit : OV.NavigationMode.FixedUpVector);
viewer.SetProjectionMode(state.ortho ? OV.ProjectionMode.Orthographic : OV.ProjectionMode.Perspective);

viewer.SetMouseClickHandler((button, coords) => {
  if (button !== 1 || !state.model) return;
  const ud = viewer.GetMeshUserDataUnderMouse(OV.IntersectionMode.MeshAndLine, coords);
  select(ud && ud.originalMeshInstance ? ud.originalMeshInstance.id.GetKey() : null);
});

// ---------------------------------------------------------------- toolbar
const TOOLS = [
  { id: 'open', icon: 'open', label: 'Buka', primary: true, title: 'Buka file (O)', menu: openMenu },
  { sep: true },
  { id: 'gallery', icon: 'grid', label: 'Galeri', title: 'Galeri thumbnail (G)', action: () => toggleGallery(), needsModels: true },
  { sep: true },
  { id: 'fit', icon: 'fit', title: 'Paskan ke layar (F)', action: () => fitView(viewer, true), needsModel: true },
  { id: 'up', icon: 'up', title: 'Sumbu atas: Y / Z', action: toggleUp, needsModel: true, badge: () => (state.upZ ? 'Z' : 'Y') },
  { id: 'flip', icon: 'flip', title: 'Balik arah atas', action: () => viewer.FlipUpVector(), needsModel: true },
  { id: 'orbit', icon: 'orbit', title: 'Orbit bebas / sumbu atas tetap', action: toggleOrbit, on: () => state.freeOrbit },
  { id: 'proj', icon: 'persp', title: 'Perspektif / ortografis (P)', action: toggleProjection, on: () => state.ortho, iconFn: () => (state.ortho ? 'ortho' : 'persp') },
  { sep: true },
  { id: 'edges', icon: 'edges', title: 'Tampilkan tepi (E)', action: toggleEdges, on: () => state.edges },
  { id: 'bg', title: 'Warna latar', menu: bgMenu, html: () => `<span class="color-dot" style="background:${state.bg || themeBg()}"></span>` },
  { id: 'theme', title: 'Tema terang / gelap', action: toggleTheme, iconFn: () => (state.theme === 'light' ? 'moon' : 'sun') },
  { sep: true },
  { id: 'snap', icon: 'camera', title: 'Simpan gambar PNG', action: snapshot, needsModel: true },
  { id: 'export', icon: 'download', label: 'Ekspor', title: 'Ekspor model', menu: exportMenu, needsModel: true, cls: 'hide-mobile-lbl' },
  { id: 'full', icon: 'expand', title: 'Layar penuh', action: toggleFullscreen },
  { sep: true, cls: 'hide-mobile' },
  { id: 'pl', icon: 'panelL', title: 'Panel kiri', action: () => togglePanel('left'), on: () => !$('#body').classList.contains('no-left'), cls: 'hide-mobile' },
  { id: 'pr', icon: 'panelR', title: 'Panel kanan', action: () => togglePanel('right'), on: () => !$('#body').classList.contains('no-right'), cls: 'hide-mobile' },
  { id: 'help', icon: 'help', title: 'Bantuan & pintasan (?)', action: () => $('#helpDlg').showModal() },
];

function renderToolbar() {
  const tools = $('#tools');
  tools.innerHTML = TOOLS.map((t) => {
    if (t.sep) return `<span class="sep ${t.cls || ''}"></span>`;
    const ic = t.html ? t.html() : icon(t.iconFn ? t.iconFn() : t.icon);
    const lbl = t.label ? `<span class="lbl">${t.label}</span>` : '';
    const badge = t.badge ? `<span class="badge-up">${t.badge()}</span>` : '';
    return `<button class="tb ${t.primary ? 'primary' : ''} ${t.cls || ''}" data-tool="${t.id}" title="${t.title}" aria-label="${t.title}">${ic}${lbl}${badge}</button>`;
  }).join('');
  refreshToolbar();
}
function refreshToolbar() {
  for (const t of TOOLS) {
    if (t.sep) continue;
    const b = $(`[data-tool="${t.id}"]`);
    if (!b) continue;
    if (t.on) { b.classList.toggle('on', !!t.on()); b.setAttribute('aria-pressed', !!t.on()); }
    b.disabled = (t.needsModel && !state.model) || (t.needsModels && state.models.length === 0);
    if (t.id === 'gallery') b.classList.toggle('on', state.view === 'gallery');
    if (t.iconFn || t.html || t.badge) {
      const ic = t.html ? t.html() : icon(t.iconFn ? t.iconFn() : t.icon);
      b.innerHTML = ic + (t.label ? `<span class="lbl">${t.label}</span>` : '') + (t.badge ? `<span class="badge-up">${t.badge()}</span>` : '');
    }
  }
}
$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  const t = TOOLS.find((x) => x.id === b.dataset.tool);
  if (t.menu) showMenu(b, t.menu());
  else t.action();
});
$('#mLeft').innerHTML = icon('layers');
$('#mRight').innerHTML = icon('info');
$('#mLeft').onclick = () => { $('#body').classList.toggle('m-left'); $('#body').classList.remove('m-right'); };
$('#mRight').onclick = () => { $('#body').classList.toggle('m-right'); $('#body').classList.remove('m-left'); };
stage.addEventListener('pointerdown', () => $('#body').classList.remove('m-left', 'm-right'));

function toggleUp() {
  state.upZ = !state.upZ;
  viewer.SetUpVector(state.upZ ? OV.Direction.Z : OV.Direction.Y, true);
  refreshToolbar();
}
function toggleOrbit() {
  state.freeOrbit = !state.freeOrbit;
  store.set('freeOrbit', state.freeOrbit);
  viewer.SetNavigationMode(state.freeOrbit ? OV.NavigationMode.FreeOrbit : OV.NavigationMode.FixedUpVector);
  toast(state.freeOrbit ? 'Orbit bebas aktif' : 'Orbit dengan sumbu atas tetap');
  refreshToolbar();
}
function toggleProjection() {
  state.ortho = !state.ortho;
  store.set('ortho', state.ortho);
  viewer.SetProjectionMode(state.ortho ? OV.ProjectionMode.Orthographic : OV.ProjectionMode.Perspective);
  refreshToolbar();
}
function toggleEdges() {
  state.edges = !state.edges;
  store.set('edges', state.edges);
  applyEdges();
  refreshToolbar();
}
function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  store.set('theme', state.theme);
  document.documentElement.dataset.theme = state.theme;
  applyBackground();
  applyEdges();
  refreshToolbar();
}
function togglePanel(side) {
  $('#body').classList.toggle(side === 'left' ? 'no-left' : 'no-right');
  refreshToolbar();
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Layar penuh tidak didukung di sini', true));
}

// ---------------------------------------------------------------- menus
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function showMenu(anchor, items) {
  closeMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu';
  menuEl.setAttribute('role', 'menu');
  menuEl.innerHTML = items.map((it, i) => it === '-' ? '<hr>' :
    `<button role="menuitem" data-i="${i}">${it.swatch ? `<span class="color-dot" style="background:${it.swatch}"></span>` : icon(it.icon || 'cube')}<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`).join('');
  document.body.appendChild(menuEl);
  const r = anchor.getBoundingClientRect();
  const w = menuEl.offsetWidth;
  menuEl.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  menuEl.style.top = (r.bottom + 6) + 'px';
  menuEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeMenu();
    it.action();
  });
  menuEl.querySelector('button')?.focus();
}
document.addEventListener('pointerdown', (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-tool]')) closeMenu(); });

function openMenu() {
  return [
    { icon: 'file', label: 'Buka file…', hint: 'O', action: () => $('#fileInput').click() },
    { icon: 'folder', label: 'Buka folder…', action: () => $('#folderInput').click() },
    { icon: 'link', label: 'Buka dari URL…', action: openUrlDialog },
    '-',
    { icon: 'sparkle', label: 'Muat model contoh', action: loadSamples },
    ...(state.models.length ? ['-', { icon: 'trash', label: 'Tutup semua model', action: clearAll }] : []),
  ];
}
function bgMenu() {
  const pick = (c) => () => { state.bg = c; store.set('bg', c); applyBackground(); applyEdges(); refreshToolbar(); };
  return [
    { swatch: themeBg(), label: 'Ikuti tema', action: pick(null) },
    { swatch: '#ffffff', label: 'Putih', action: pick('#ffffff') },
    { swatch: '#e6e8ec', label: 'Abu muda', action: pick('#e6e8ec') },
    { swatch: '#8a9099', label: 'Abu', action: pick('#8a9099') },
    { swatch: '#2f3640', label: 'Batu tulis', action: pick('#2f3640') },
    { swatch: '#000000', label: 'Hitam', action: pick('#000000') },
    { swatch: '#14324a', label: 'Biru malam', action: pick('#14324a') },
    '-',
    { icon: 'sparkle', label: 'Warna kustom…', action: () => {
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = state.bg || themeBg();
      inp.oninput = () => pick(inp.value)();
      inp.click();
    } },
  ];
}
const EXPORTS = [
  ['OBJ', 'obj', OV.FileFormat.Text], ['STL (ASCII)', 'stl', OV.FileFormat.Text], ['STL (biner)', 'stl', OV.FileFormat.Binary],
  ['PLY (ASCII)', 'ply', OV.FileFormat.Text], ['PLY (biner)', 'ply', OV.FileFormat.Binary], ['OFF', 'off', OV.FileFormat.Text],
  ['glTF (.gltf)', 'gltf', OV.FileFormat.Text], ['GLB (.glb)', 'glb', OV.FileFormat.Binary],
];
function exportMenu() {
  return EXPORTS.map(([label, ext, fmt]) => ({ icon: 'download', label, hint: '.' + ext, action: () => exportModel(ext, fmt) }));
}

// ---------------------------------------------------------------- toasts / overlays
function toast(msg, isErr = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), isErr ? 6000 : 3200);
}
function setLoading(on, text) {
  $('#loading').hidden = !on;
  if (text) $('#loadingText').textContent = text;
}
function showError(title, msg) {
  const ov = $('#errorOv');
  ov.hidden = false;
  ov.innerHTML = `<div class="errbox"><h4>${esc(title)}</h4><p>${esc(msg)}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${state.models.length > 1 ? `<button class="btn primary" data-act="gallery">${icon('grid')}Ke galeri</button>` : ''}
    <button class="btn" data-act="open">${icon('open')}Buka file lain</button></div></div>`;
  ov.onclick = (e) => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'gallery') showView('gallery');
    if (a === 'open') $('#fileInput').click();
  };
}

function renderWelcome() {
  const fm = MODEL_EXTENSIONS.filter((e) => !['stp', 'igs', 'brp'].includes(e));
  $('#welcome').innerHTML = `<div class="welcome">
    <div class="glyph">${icon('cube')}</div>
    <h1>Buka model 3D langsung di browser</h1>
    <p>Seret & lepas satu atau banyak file (atau satu folder / file .zip) ke sini. Beberapa model sekaligus akan ditampilkan sebagai galeri thumbnail — klik salah satu untuk melihatnya utuh.</p>
    <div class="actions">
      <button class="btn primary" data-act="file">${icon('file')}Pilih file</button>
      <button class="btn" data-act="folder">${icon('folder')}Pilih folder</button>
      <button class="btn" data-act="url">${icon('link')}Dari URL</button>
      <button class="btn" data-act="samples">${icon('sparkle')}Coba model contoh</button>
    </div>
    <div class="formats">${fm.map((e) => `<span class="fmt" title="${esc(FORMAT_NAMES[e] || e)}">${e}</span>`).join('')}<span class="fmt">zip</span></div>
    <div class="hint">File diproses secara lokal di perangkat Anda — tidak ada yang diunggah.</div>
  </div>`;
}
$('#welcome').addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'file') $('#fileInput').click();
  if (a === 'folder') $('#folderInput').click();
  if (a === 'url') openUrlDialog();
  if (a === 'samples') loadSamples();
});

// ---------------------------------------------------------------- views
function showView(view) {
  if (state.models.length === 0) view = 'welcome';
  state.view = view;
  $('#welcome').hidden = view !== 'welcome';
  $('#gallery').hidden = view !== 'gallery';
  if (view !== 'viewer') { setLoading(false); }
  if (view === 'welcome') { $('#errorOv').hidden = true; }
  if (view === 'gallery') renderGallery();
  renderNavPill();
  refreshToolbar();
}
function toggleGallery() {
  if (state.view === 'gallery') {
    if (state.current) showView('viewer');
    else if (state.models[0]) openModel(state.models[0].id);
  } else showView('gallery');
}

function sortedModels() {
  const q = state.filter.trim().toLowerCase();
  let list = state.models.filter((m) => !q || m.path.toLowerCase().includes(q) || m.ext.includes(q));
  const by = {
    name: (a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }),
    format: (a, b) => a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name),
    size: (a, b) => b.size - a.size,
    tris: (a, b) => (b.stats?.triangles || 0) - (a.stats?.triangles || 0),
  }[state.sort];
  if (by) list = list.slice().sort(by);
  return list;
}

function thumbInner(m, big) {
  if (m.thumb) return `<img src="${m.thumb}" alt="" loading="lazy" draggable="false">`;
  if (m.status === 'error') return `<div class="ph err">${icon('alert')}${big ? `<span>${esc(m.error || 'Gagal dimuat')}</span>` : ''}</div>`;
  return `<div class="ph"><div class="spinner" style="width:${big ? 26 : 18}px;height:${big ? 26 : 18}px;border-width:${big ? 3 : 2}px"></div>${big ? '<span>Membuat thumbnail…</span>' : ''}</div>`;
}
function subInfo(m) {
  if (m.status === 'error') return 'gagal';
  if (m.stats) return fmtNum(m.stats.triangles) + ' △';
  return '…';
}
function cardHTML(m) {
  return `<div class="card ${m.id === state.current ? 'on' : ''}" data-id="${m.id}" tabindex="0" role="button" aria-label="Buka ${esc(m.name)}">
    <div class="thumb">${thumbInner(m, true)}<span class="fmt">${m.ext}</span>${m.status === 'error' ? '' : `<div class="open"><span>${icon('expand')}Lihat utuh</span></div>`}</div>
    <button class="x" data-remove="${m.id}" title="Hapus dari daftar" aria-label="Hapus ${esc(m.name)}">${icon('x')}</button>
    <div class="info"><div class="nm" title="${esc(m.path)}">${esc(m.name)}</div>
    <div class="sub"><span>${formatBytes(m.size)}</span><span>${subInfo(m)}</span></div></div></div>`;
}
function rowHTML(m) {
  return `<button class="row ${m.id === state.current ? 'on' : ''}" data-id="${m.id}" title="${esc(m.path)}">
    <span class="mini">${thumbInner(m, false)}</span>
    <span class="meta"><span class="nm" style="display:block">${esc(m.name)}</span>
    <span class="sub"><span class="fmt">${m.ext}</span>${formatBytes(m.size)} · ${subInfo(m)}</span></span></button>`;
}

function renderGallery() {
  const g = $('#gallery');
  const list = sortedModels();
  const pct = state.thumbsTotal ? Math.round((state.thumbsDone / state.thumbsTotal) * 100) : 100;
  if (!g.firstChild) {
    g.innerHTML = `<div class="g-head">
      <h2>Galeri <small id="gCount"></small></h2>
      <div class="grow"></div>
      <label class="search">${icon('search')}<input id="gSearch" type="search" placeholder="Cari nama / format" aria-label="Cari model"></label>
      <select class="sel" id="gSort" aria-label="Urutkan">
        <option value="added">Urutan dibuka</option><option value="name">Nama</option><option value="format">Format</option>
        <option value="size">Ukuran file</option><option value="tris">Jumlah segitiga</option></select>
      <label class="size-ctl" title="Ukuran thumbnail">${icon('grid')}<input id="gSize" type="range" min="140" max="380" step="10" aria-label="Ukuran thumbnail"></label>
      <button class="btn" id="gBack">${icon('cube')}Ke penampil</button>
    </div><div class="progress"><i id="gProg"></i></div><div class="grid" id="gGrid"></div>`;
    $('#gSearch').oninput = (e) => { state.filter = e.target.value; renderGallery(); };
    $('#gSort').onchange = (e) => { state.sort = e.target.value; store.set('sort', state.sort); renderGallery(); };
    $('#gSize').oninput = (e) => { state.cardSize = +e.target.value; store.set('cardSize', state.cardSize); $('#gGrid').style.setProperty('--card', state.cardSize + 'px'); };
    $('#gBack').onclick = () => toggleGallery();
    $('#gGrid').addEventListener('click', onCardClick);
    $('#gGrid').addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) { e.preventDefault(); openModel(+e.target.dataset.id); }
    });
  }
  $('#gSort').value = state.sort;
  $('#gSize').value = state.cardSize;
  $('#gGrid').style.setProperty('--card', state.cardSize + 'px');
  $('#gCount').textContent = list.length === state.models.length ? `${state.models.length} model` : `${list.length} dari ${state.models.length} model`;
  $('#gProg').style.width = pct + '%';
  $('#gProg').parentElement.style.visibility = pct >= 100 ? 'hidden' : 'visible';
  $('#gGrid').innerHTML = list.map(cardHTML).join('') +
    `<button class="card add-card" data-add="1">${icon('plus')}<span>Tambah file</span></button>`;
}
function onCardClick(e) {
  const rm = e.target.closest('[data-remove]');
  if (rm) { e.stopPropagation(); removeModel(+rm.dataset.remove); return; }
  if (e.target.closest('[data-add]')) { $('#fileInput').click(); return; }
  const c = e.target.closest('.card[data-id]');
  if (c) openModel(+c.dataset.id);
}

function renderFiles() {
  $('#fileCount').textContent = state.models.length;
  const pane = $('#pane-files');
  if (!state.models.length) { pane.innerHTML = '<div class="empty-note">Belum ada model. Buka file atau seret ke area penampil.</div>'; return; }
  pane.innerHTML = `<div class="pane-head"><span>${state.models.length} model</span><span>
    <button class="link" data-act="gallery">Galeri</button><button class="link" data-act="add">+ Tambah</button></span></div>
    <div class="strip">${state.models.map(rowHTML).join('')}</div>`;
}
$('#pane-files').addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'gallery') { showView('gallery'); return; }
  if (a === 'add') { $('#fileInput').click(); return; }
  const r = e.target.closest('.row[data-id]');
  if (r) { openModel(+r.dataset.id); $('#body').classList.remove('m-left'); }
});

// Re-renders the pieces showing one model (row + card) without rebuilding the lists.
function patchModel(m) {
  const row = $(`#pane-files .row[data-id="${m.id}"]`);
  if (row) row.outerHTML = rowHTML(m);
  const card = $(`#gGrid .card[data-id="${m.id}"]`);
  if (card) card.outerHTML = cardHTML(m);
  if (state.view === 'gallery') {
    const pct = state.thumbsTotal ? Math.round((state.thumbsDone / state.thumbsTotal) * 100) : 100;
    $('#gProg').style.width = pct + '%';
    $('#gProg').parentElement.style.visibility = pct >= 100 ? 'hidden' : 'visible';
  }
  if (m.id === state.current) renderNavPill();
}
function markCurrent() {
  document.querySelectorAll('.row[data-id], .card[data-id]').forEach((el) => el.classList.toggle('on', +el.dataset.id === state.current));
  $(`#pane-files .row[data-id="${state.current}"]`)?.scrollIntoView({ block: 'nearest' });
}

function renderNavPill() {
  const pill = $('#navPill');
  const idx = state.models.findIndex((m) => m.id === state.current);
  if (state.view !== 'viewer' || idx < 0) { pill.hidden = true; return; }
  const m = state.models[idx];
  const many = state.models.length > 1;
  pill.hidden = false;
  pill.innerHTML = `${many ? `<button class="tb" data-nav="-1" title="Sebelumnya (←)" aria-label="Model sebelumnya">${icon('left')}</button>` : ''}
    <span class="pos">${idx + 1} / ${state.models.length}</span><span class="nm" title="${esc(m.path)}">${esc(m.name)}</span>
    ${many ? `<button class="tb" data-nav="1" title="Berikutnya (→)" aria-label="Model berikutnya">${icon('right')}</button>
    <button class="tb" data-nav="g" title="Galeri (G)" aria-label="Galeri">${icon('grid')}</button>` : ''}`;
}
$('#navPill').addEventListener('click', (e) => {
  const n = e.target.closest('[data-nav]')?.dataset.nav;
  if (n === 'g') showView('gallery');
  else if (n) step(+n);
});
function step(d) {
  if (!state.models.length) return;
  const idx = state.models.findIndex((m) => m.id === state.current);
  const next = state.models[(idx + d + state.models.length) % state.models.length];
  openModel(next.id);
}

// ---------------------------------------------------------------- adding files / thumbnails
async function addFiles(fileList, origin = 'file') {
  const raw = Array.from(fileList || []);
  if (!raw.length) return;
  const { models, ignored } = await groupIntoModels(raw);
  if (!models.length) {
    // Only auxiliary files: attach them to models that reported missing references.
    if (state.models.length && ignored.length) {
      const names = new Set(ignored.map((f) => baseName(f.name).toLowerCase()));
      const affected = state.models.filter((m) => (m.stats?.missing || []).some((x) => names.has(baseName(x).toLowerCase())));
      const targets = affected.length ? affected : state.models;
      for (const m of targets) {
        m.files.push(...ignored);
        resetThumb(m);
      }
      toast(`${ignored.length} file pendukung ditambahkan ke ${targets.length} model`);
      queueThumbs(targets);
      if (targets.some((m) => m.id === state.current)) openModel(state.current);
      return;
    }
    toast('Tidak ada file 3D yang dikenali. Format yang didukung: ' + MODEL_EXTENSIONS.join(', '), true);
    return;
  }
  const wasEmpty = state.models.length === 0;
  state.models.push(...models);
  if (models.some((m) => REMOTE_LIB_EXTENSIONS.includes(m.ext))) toast('Beberapa format (CAD/BIM) mengunduh parser dari CDN — butuh koneksi internet.');
  renderFiles();
  queueThumbs(models);
  if (wasEmpty && models.length === 1) openModel(models[0].id);
  else {
    if (wasEmpty) openModel(models[0].id, { background: true });
    showView('gallery');
    if (!wasEmpty) toast(`${models.length} model ditambahkan${origin === 'url' ? ' dari URL' : ''}`);
  }
}

function resetThumb(m) {
  if (m.thumb) URL.revokeObjectURL(m.thumb);
  m.thumb = null; m.status = 'pending'; m.error = null;
}

function queueThumbs(models) {
  state.thumbsTotal += models.length;
  for (const m of models) {
    thumbs.render(m, settings).then(async ({ dataUrl, stats }) => {
      const blob = await (await fetch(dataUrl)).blob();
      if (!state.models.includes(m)) return;
      m.thumb = URL.createObjectURL(blob);
      m.stats = { ...stats, ...(m.stats && m.id === state.current ? m.stats : {}) };
      m.stats.missing = stats.missing;
      m.status = 'ready';
    }).catch((err) => {
      m.status = 'error';
      m.error = err.message;
    }).finally(() => {
      state.thumbsDone++;
      if (state.thumbsDone >= state.thumbsTotal) { state.thumbsDone = state.thumbsTotal = 0; }
      patchModel(m);
      if (m.id === state.current) renderDetails();
    });
  }
}

function removeModel(id) {
  const i = state.models.findIndex((m) => m.id === id);
  if (i < 0) return;
  const [m] = state.models.splice(i, 1);
  if (m.thumb) URL.revokeObjectURL(m.thumb);
  if (state.current === id) {
    const next = state.models[Math.min(i, state.models.length - 1)];
    clearMain();
    if (next && state.view === 'viewer') openModel(next.id);
  }
  renderFiles();
  if (!state.models.length) showView('welcome'); else if (state.view === 'gallery') renderGallery();
  renderNavPill();
}
function clearAll() {
  for (const m of state.models) if (m.thumb) URL.revokeObjectURL(m.thumb);
  state.models = [];
  clearMain();
  renderFiles();
  showView('welcome');
}
function clearMain() {
  loadToken++;
  state.current = null; state.model = null; state.importResult = null;
  state.meshes = []; state.hidden.clear(); state.selected = null;
  viewer.Clear();
  $('#errorOv').hidden = true;
  setLoading(false);
  renderTree(); renderDetails(); renderPickInfo(); refreshToolbar();
}

// ---------------------------------------------------------------- main viewer loading
function openModel(id, opts = {}) {
  const m = state.models.find((x) => x.id === id);
  if (!m) return;
  if (!opts.background) showView('viewer');
  if (state.current === id && state.model && !opts.force && m.status !== 'pending') { markCurrent(); return; }
  state.current = id;
  state.model = null;
  state.importResult = null;
  state.meshes = [];
  state.selected = null;
  state.hidden.clear();
  markCurrent();
  renderNavPill();
  renderDetails();
  renderTree();
  renderPickInfo();
  refreshToolbar();
  $('#errorOv').hidden = true;
  setLoading(true, 'Memuat ' + m.name + '…');
  const token = ++loadToken;
  mainChain = mainChain.then(() => (token === loadToken ? loadMain(m, token) : null)).catch(() => {});
}

async function loadMain(m, token) {
  try {
    const { importResult } = await loadInto(viewer, loader, m.files, settings, {
      stage: (t) => token === loadToken && setLoading(true, t),
    });
    if (token !== loadToken) return;
    state.importResult = importResult;
    state.model = importResult.model;
    viewer.SetUpVector(state.upZ ? OV.Direction.Z : OV.Direction.Y, false);
    threeQuarterView(viewer);
    const stats = modelStats(importResult.model, viewer);
    stats.missing = importResult.missingFiles.slice();
    m.stats = stats;
    if (m.status === 'error') { m.status = m.thumb ? 'ready' : 'pending'; }
    buildMeshList();
    setLoading(false);
    renderTree(); renderDetails(); refreshToolbar(); patchModel(m);
    if (stats.missing.length) toast(`File pendukung tidak ditemukan: ${stats.missing.join(', ')}. Seret file tersebut ke sini untuk melengkapi.`, true);
  } catch (err) {
    if (token !== loadToken) return;
    setLoading(false);
    viewer.Clear();
    showError('Model tidak dapat dibuka', `${m.name}: ${err.message}`);
    refreshToolbar();
  }
}

// ---------------------------------------------------------------- structure tree
function meshColor(mesh) {
  if (!state.model || mesh.TriangleCount() === 0) return null;
  const t = mesh.GetTriangle(0);
  if (t.mat === null || t.mat === undefined) return null;
  const mat = state.model.GetMaterial(t.mat);
  return mat ? `rgb(${mat.color.r},${mat.color.g},${mat.color.b})` : null;
}
function buildMeshList() {
  const out = [];
  let n = 0;
  const walk = (node, depth) => {
    const kids = node.GetChildNodes();
    const meshIdx = node.GetMeshIndices();
    let d = depth;
    const isGroup = node.HasParent() && node.GetName() && (kids.length > 0 || meshIdx.length > 1);
    if (isGroup) { out.push({ kind: 'group', name: node.GetName(), depth, nodeId: node.GetId(), keys: [] }); d++; }
    const groupRow = isGroup ? out[out.length - 1] : null;
    const start = out.length;
    for (const mi of meshIdx) {
      const mesh = state.model.GetMesh(mi);
      const id = new OV.MeshInstanceId(node.GetId(), mi);
      out.push({
        kind: 'mesh', key: id.GetKey(), id, depth: d,
        name: mesh.GetName() || (meshIdx.length === 1 && node.GetName()) || `Mesh ${++n}`,
        tris: mesh.TriangleCount(), lines: mesh.LineSegmentCount(), color: meshColor(mesh),
      });
    }
    for (const k of kids) walk(k, d);
    if (groupRow) groupRow.keys = out.slice(start).filter((x) => x.kind === 'mesh').map((x) => x.key);
  };
  walk(state.model.GetRootNode(), 0);
  state.meshes = out;
}
function renderTree() {
  const meshes = state.meshes.filter((x) => x.kind === 'mesh');
  $('#meshCount').textContent = meshes.length;
  const pane = $('#pane-tree');
  if (!state.model) { pane.innerHTML = '<div class="empty-note">Buka model untuk melihat strukturnya.</div>'; return; }
  pane.innerHTML = `<div class="pane-head"><span>${meshes.length} mesh</span><span>
    <button class="link" data-act="showall">Tampilkan semua</button><button class="link" data-act="fit">Paskan</button></span></div>
    <div class="tree">${state.meshes.map((x, i) => {
      const hidden = x.kind === 'mesh' ? state.hidden.has(x.key) : x.keys.every((k) => state.hidden.has(k));
      const pad = 6 + x.depth * 14;
      if (x.kind === 'group') {
        return `<div class="node ${hidden ? 'hidden-mesh' : ''}" data-i="${i}" style="padding-left:${pad}px">${icon('layers')}<span class="nm" title="${esc(x.name)}"><b>${esc(x.name)}</b></span>
        <button class="eye" data-eye="${i}" aria-label="Tampil/sembunyikan grup">${icon(hidden ? 'eyeOff' : 'eye')}</button></div>`;
      }
      return `<div class="node ${x.key === state.selected ? 'sel' : ''} ${hidden ? 'hidden-mesh' : ''}" data-i="${i}" style="padding-left:${pad}px">
        <span class="sw" style="background:${x.color || 'var(--raise)'}"></span><span class="nm" title="${esc(x.name)} · ${fmtNum(x.tris)} segitiga">${esc(x.name)}</span>
        <button class="zoom" data-zoom="${i}" title="Zoom ke mesh" aria-label="Zoom ke mesh">${icon('target')}</button>
        <button class="eye" data-eye="${i}" aria-label="Tampil/sembunyikan">${icon(hidden ? 'eyeOff' : 'eye')}</button></div>`;
    }).join('')}</div>`;
}
$('#pane-tree').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'showall') { state.hidden.clear(); applyVisibility(); return; }
  if (act === 'fit') { fitView(viewer, true); return; }
  const eye = e.target.closest('[data-eye]');
  if (eye) {
    const x = state.meshes[+eye.dataset.eye];
    const keys = x.kind === 'mesh' ? [x.key] : x.keys;
    const hide = !keys.every((k) => state.hidden.has(k));
    keys.forEach((k) => (hide ? state.hidden.add(k) : state.hidden.delete(k)));
    applyVisibility();
    return;
  }
  const z = e.target.closest('[data-zoom]');
  if (z) { zoomTo(state.meshes[+z.dataset.zoom].key); return; }
  const node = e.target.closest('.node');
  if (node) {
    const x = state.meshes[+node.dataset.i];
    if (x.kind === 'mesh') select(state.selected === x.key ? null : x.key);
  }
});
$('#pane-tree').addEventListener('dblclick', (e) => {
  const node = e.target.closest('.node');
  const x = node && state.meshes[+node.dataset.i];
  if (x && x.kind === 'mesh') zoomTo(x.key);
});
function applyVisibility() {
  viewer.SetMeshesVisibility((ud) => !(ud.originalMeshInstance && state.hidden.has(ud.originalMeshInstance.id.GetKey())));
  renderTree();
  renderPickInfo();
}
function zoomTo(key) {
  const sphere = viewer.GetBoundingSphere((ud) => ud.originalMeshInstance && ud.originalMeshInstance.id.GetKey() === key);
  if (sphere) viewer.FitSphereToWindow(sphere, true);
}
function select(key) {
  state.selected = key;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff8a3d';
  const c = hexToRgba(accent);
  viewer.SetMeshesHighlight(new OV.RGBColor(c.r, c.g, c.b), (ud) => key !== null && ud.originalMeshInstance && ud.originalMeshInstance.id.GetKey() === key);
  renderTree();
  renderPickInfo();
  if (key) $(`#pane-tree .node.sel`)?.scrollIntoView({ block: 'nearest' });
}
function renderPickInfo() {
  const el = $('#pickInfo');
  const x = state.selected && state.meshes.find((m) => m.key === state.selected);
  if (!x) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<b>${esc(x.name)}</b> · <span class="mono">${fmtNum(x.tris)} △</span>
    <button class="link" data-p="zoom">Zoom</button><button class="link" data-p="iso">Isolasi</button><button class="link" data-p="hide">Sembunyikan</button><button class="link" data-p="x" aria-label="Batal pilih">✕</button>`;
}
$('#pickInfo').addEventListener('click', (e) => {
  const p = e.target.closest('[data-p]')?.dataset.p;
  const key = state.selected;
  if (!p || !key) return;
  if (p === 'zoom') zoomTo(key);
  if (p === 'hide') { state.hidden.add(key); select(null); applyVisibility(); }
  if (p === 'iso') { state.hidden = new Set(state.meshes.filter((m) => m.kind === 'mesh' && m.key !== key).map((m) => m.key)); applyVisibility(); zoomTo(key); }
  if (p === 'x') select(null);
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
  $('#pane-files').hidden = t.dataset.tab !== 'files';
  $('#pane-tree').hidden = t.dataset.tab !== 'tree';
}));

// ---------------------------------------------------------------- details panel
function renderDetails() {
  const pane = $('#pane-details');
  const m = state.models.find((x) => x.id === state.current);
  if (!m) {
    pane.innerHTML = `<div class="sect"><h3>Detail</h3><div class="empty-note" style="padding:4px 0">Pilih model untuk melihat informasinya.</div></div>
      <div class="sect"><h3>Tips</h3><div style="color:var(--muted);font-size:13px">Untuk OBJ, sertakan file <span class="mono">.mtl</span> dan teksturnya. Untuk glTF, sertakan <span class="mono">.bin</span> dan teksturnya. Anda juga bisa membuka satu folder atau file <span class="mono">.zip</span> berisi banyak model.</div></div>`;
    return;
  }
  const s = m.stats;
  const unit = state.model ? UNIT_NAMES[state.model.GetUnit()] || '' : '';
  const mats = [];
  if (state.model) for (let i = 0; i < state.model.MaterialCount(); i++) mats.push(state.model.GetMaterial(i));
  const used = state.importResult ? state.importResult.usedFiles : [];
  const missing = s?.missing || [];
  pane.innerHTML = `
    <div class="sect"><div class="title">${esc(m.name)}</div>
      <dl><dt>Format</dt><dd style="font-family:var(--font)">${esc(FORMAT_NAMES[m.ext] || m.ext.toUpperCase())}</dd>
      <dt>Ukuran file</dt><dd>${formatBytes(m.size)}</dd>
      ${m.path !== m.name ? `<dt>Lokasi</dt><dd title="${esc(m.path)}">${esc(m.path)}</dd>` : ''}</dl></div>
    ${missing.length ? `<div class="sect"><div class="warnbox"><b>File hilang:</b> ${missing.map(esc).join(', ')}<br>Seret file tersebut ke penampil untuk melengkapinya.</div></div>` : ''}
    ${s ? `<div class="sect"><h3>Geometri</h3><dl>
      <dt>Vertex</dt><dd>${fmtNum(s.vertices)}</dd>
      <dt>Segitiga</dt><dd>${fmtNum(s.triangles)}</dd>
      ${s.lines ? `<dt>Segmen garis</dt><dd>${fmtNum(s.lines)}</dd>` : ''}
      <dt>Mesh</dt><dd>${fmtNum(s.meshes)}</dd>
      <dt>Material</dt><dd>${fmtNum(s.materials)}</dd></dl></div>` : ''}
    ${s && s.size ? `<div class="sect"><h3>Dimensi${unit ? ` (${unit})` : ''}</h3><dl>
      <dt>X</dt><dd>${fmtLen(s.size.x)}</dd><dt>Y</dt><dd>${fmtLen(s.size.y)}</dd><dt>Z</dt><dd>${fmtLen(s.size.z)}</dd>
      ${s.volume !== undefined ? `<dt>Volume</dt><dd>${s.volume === null ? '<span title="Mesh tidak tertutup rapat">–</span>' : fmtLen(s.volume)}</dd><dt>Luas permukaan</dt><dd>${fmtLen(s.area)}</dd>` : ''}
      </dl>${state.model && s.volume === undefined ? '<div style="margin-top:10px"><button class="btn" id="calcVol">Hitung volume & luas</button></div>' : ''}
      ${s.volume === null ? '<div style="margin-top:8px;color:var(--muted);font-size:12px">Volume hanya dihitung untuk mesh yang tertutup rapat (2-manifold).</div>' : ''}</div>` : ''}
    ${mats.length ? `<div class="sect"><h3>Material</h3><div class="mats">${mats.slice(0, 60).map((mt) => `<div class="mat"><span class="sw" style="background:rgb(${mt.color.r},${mt.color.g},${mt.color.b})"></span><span class="nm" title="${esc(mt.name || '')}">${esc(mt.name || '(tanpa nama)')}</span></div>`).join('')}${mats.length > 60 ? `<div class="mat" style="color:var(--muted)">+${mats.length - 60} lainnya</div>` : ''}</div></div>` : ''}
    ${used.length ? `<div class="sect"><h3>File yang dipakai</h3><ul class="filelist">${used.map((f) => `<li>${esc(f)}</li>`).join('')}${missing.map((f) => `<li class="miss">✕ ${esc(f)}</li>`).join('')}</ul></div>` : ''}
    ${!state.model && m.status === 'error' ? `<div class="sect"><div class="warnbox"><b>Gagal:</b> ${esc(m.error || '')}</div></div>` : ''}`;
  const btn = $('#calcVol');
  if (btn) btn.onclick = () => {
    const vol = OV.IsTwoManifold(state.model) ? Math.abs(OV.CalculateVolume(state.model)) : null;
    s.volume = vol;
    s.area = OV.CalculateSurfaceArea(state.model);
    renderDetails();
  };
}

// ---------------------------------------------------------------- snapshot / export
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function currentStem() {
  const m = state.models.find((x) => x.id === state.current);
  return m ? stemOf(m.name) : 'model';
}
async function snapshot() {
  const size = viewer.GetCanvasSize();
  const url = viewer.GetImageAsDataUrl(Math.round(size.width * 2), Math.round(size.height * 2), false);
  download(await (await fetch(url)).blob(), currentStem() + '.png');
  toast('Gambar disimpan');
}
function exportModel(ext, format) {
  if (!state.model) return;
  const exporter = new OV.Exporter();
  const settingsX = new OV.ExporterSettings({ isMeshVisible: (id) => !state.hidden.has(id.GetKey()) });
  exporter.Export(state.model, settingsX, format, ext, {
    onSuccess: (files) => {
      const stem = currentStem();
      if (files.length === 1) {
        const f = files[0];
        const name = stem + '.' + ext;
        download(new Blob([f.GetBufferContent()]), name);
      } else {
        const entries = {};
        for (const f of files) entries[f.GetName()] = new Uint8Array(f.GetBufferContent());
        download(new Blob([zipSync(entries)]), `${stem}-${ext}.zip`);
      }
      toast(`Diekspor sebagai ${ext.toUpperCase()}` + (state.hidden.size ? ' (hanya mesh yang terlihat)' : ''));
    },
    onError: () => toast('Ekspor gagal', true),
  });
}

// ---------------------------------------------------------------- inputs: picker, drop, URL, samples
$('#fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
$('#folderInput').addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  files.forEach((f) => { f.relPath = f.webkitRelativePath; });
  addFiles(files);
  e.target.value = '';
});

let dragDepth = 0;
const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; $('#dropHint').hidden = false; });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropHint').hidden = true; } });
window.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('#dropHint').hidden = true;
  try {
    addFiles(await filesFromDataTransfer(e.dataTransfer));
  } catch (err) {
    toast('Gagal membaca file: ' + err.message, true);
  }
});

function openUrlDialog() {
  const dlg = $('#urlDlg');
  dlg.returnValue = '';
  dlg.showModal();
  $('#urlText').focus();
}
$('#urlDlg').addEventListener('close', () => {
  if ($('#urlDlg').returnValue !== 'ok') return;
  const urls = $('#urlText').value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  if (urls.length) loadUrls(urls);
});
async function loadUrls(urls) {
  setLoading(true, 'Mengunduh 0 / ' + urls.length);
  try {
    const files = await filesFromUrls(urls, (d, t) => setLoading(true, `Mengunduh ${d} / ${t}`));
    setLoading(false);
    await addFiles(files, 'url');
  } catch (err) {
    setLoading(false);
    toast('Gagal mengunduh: ' + err.message + ' (periksa URL dan izin CORS)', true);
  }
}
async function loadSamples() {
  setLoading(true, 'Membuat model contoh…');
  try {
    const files = await buildSamples();
    setLoading(false);
    await addFiles(files);
  } catch (err) {
    setLoading(false);
    toast('Gagal membuat contoh: ' + err.message, true);
  }
}

// ---------------------------------------------------------------- keyboard
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey || e.altKey) {
    if (e.key === 'Escape') closeMenu();
    return;
  }
  const k = e.key;
  if (k === 'Escape') {
    if (menuEl) closeMenu();
    else if (state.selected) select(null);
    else if (state.view === 'viewer' && state.models.length > 1) showView('gallery');
    return;
  }
  if (k === 'o' || k === 'O') $('#fileInput').click();
  else if ((k === 'g' || k === 'G') && state.models.length) toggleGallery();
  else if (k === '?') $('#helpDlg').showModal();
  else if (state.view === 'viewer') {
    if (k === 'ArrowRight') step(1);
    else if (k === 'ArrowLeft') step(-1);
    else if ((k === 'f' || k === 'F') && state.model) fitView(viewer, true);
    else if (k === 'e' || k === 'E') toggleEdges();
    else if (k === 'p' || k === 'P') toggleProjection();
  }
});

// ---------------------------------------------------------------- boot
renderToolbar();
renderWelcome();
renderFiles();
renderTree();
renderDetails();
showView('welcome');

// #model=url1,url2 (same convention as other web viewers)
function bootFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  const m = /(?:^|\$)model=([^$]+)/.exec(h);
  if (m) loadUrls(m[1].split(','));
}
bootFromHash();
window.addEventListener('hashchange', bootFromHash);
// Expose for debugging / automation.
window.ruang3d = { state, viewer, addFiles, openModel, loadSamples };
