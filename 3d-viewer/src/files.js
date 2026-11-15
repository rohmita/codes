// Collecting files (picker, drag & drop incl. folders, URLs, zip archives)
// and grouping them into "models": one entry per importable 3D file plus the
// auxiliary files it may reference (mtl, textures, bin, ...).
import { unzipSync } from 'fflate';

export const MODEL_EXTENSIONS = [
  'obj', 'stl', 'off', 'ply', '3ds', 'gltf', 'glb', 'fbx', 'dae', 'wrl', '3mf', 'amf',
  'bim', '3dm', 'ifc', 'step', 'stp', 'iges', 'igs', 'brep', 'brp', 'fcstd',
];

// Formats whose parser is downloaded from a CDN the first time it's needed.
export const REMOTE_LIB_EXTENSIONS = ['3dm', 'ifc', 'step', 'stp', 'iges', 'igs', 'brep', 'brp', 'fcstd'];

export function extOf(name) {
  const base = name.split(/[\\/]/).pop();
  const i = base.lastIndexOf('.');
  return i < 0 ? '' : base.slice(i + 1).toLowerCase();
}

export function baseName(name) {
  return name.split(/[\\/]/).pop();
}

export function stemOf(name) {
  const b = baseName(name);
  const i = b.lastIndexOf('.');
  return i < 0 ? b : b.slice(0, i);
}

export const isModelFile = (name) => MODEL_EXTENSIONS.includes(extOf(name));

// Expands every .zip into the files it contains (one level of nesting is enough in practice).
async function expandArchives(files) {
  const out = [];
  for (const f of files) {
    if (extOf(f.name) !== 'zip') { out.push(f); continue; }
    try {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
      const prefix = stemOf(f.name);
      for (const [path, data] of Object.entries(entries)) {
        if (path.endsWith('/') || data.length === 0) continue;
        if (/(^|\/)__MACOSX\//.test(path) || baseName(path).startsWith('._')) continue;
        const file = new File([data], baseName(path));
        file.relPath = prefix + '.zip/' + path;
        out.push(file);
      }
    } catch (err) {
      console.warn('Gagal membuka zip', f.name, err);
    }
  }
  return out;
}

let nextId = 1;

// Turns a flat list of File objects into model descriptors.
// Every model gets all non-model files as auxiliaries; the importer only reads
// the ones its main file actually references (e.g. .mtl, textures, .bin).
export async function groupIntoModels(rawFiles) {
  const files = await expandArchives(rawFiles);
  const main = files.filter((f) => isModelFile(f.name));
  const aux = files.filter((f) => !isModelFile(f.name));
  const ignored = [];
  const models = main.map((file) => ({
    id: nextId++,
    name: baseName(file.name),
    path: file.relPath || file.webkitRelativePath || file.name,
    ext: extOf(file.name),
    size: file.size,
    files: [file, ...aux],
    status: 'pending', // pending | loading | ready | error
    thumb: null,
    stats: null,
    error: null,
  }));
  if (models.length === 0) ignored.push(...files);
  return { models, ignored };
}

// Reads files from a drop event, descending into dropped folders.
export async function filesFromDataTransfer(dt) {
  const entries = [];
  for (const item of dt.items || []) {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return Array.from(dt.files || []);

  const out = [];
  const readEntries = (reader) => new Promise((res, rej) => reader.readEntries(res, rej));
  const fileOf = (entry) => new Promise((res, rej) => entry.file(res, rej));
  async function walk(entry, path) {
    if (entry.isFile) {
      const f = await fileOf(entry);
      f.relPath = path + f.name;
      out.push(f);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await readEntries(reader);
        for (const e of batch) await walk(e, path + entry.name + '/');
      } while (batch.length > 0);
    }
  }
  for (const e of entries) await walk(e, '');
  return out;
}

// Downloads URLs into File objects so they go through the same pipeline.
export async function filesFromUrls(urls, onProgress) {
  const out = [];
  let done = 0;
  for (const raw of urls) {
    const url = transformHostUrl(raw.trim());
    if (!url) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${raw}`);
    const blob = await res.blob();
    let name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || 'model');
    const cd = res.headers.get('content-disposition');
    const m = cd && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    if (m) name = decodeURIComponent(m[1]);
    out.push(new File([blob], name));
    onProgress && onProgress(++done, urls.length);
  }
  return out;
}

// Rewrites share links of common hosts to direct-download links.
function transformHostUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'www.dropbox.com' || u.hostname === 'dropbox.com') {
      u.hostname = 'dl.dropboxusercontent.com';
      u.searchParams.delete('dl');
      return u.toString();
    }
    if (u.hostname === 'github.com' && u.pathname.includes('/blob/')) {
      return 'https://raw.githubusercontent.com' + u.pathname.replace('/blob/', '/');
    }
    const g = /drive\.google\.com\/file\/d\/([^/]+)/.exec(url);
    if (g) return `https://drive.google.com/uc?export=download&id=${g[1]}`;
  } catch { /* not a URL */ }
  return url;
}

export function formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
