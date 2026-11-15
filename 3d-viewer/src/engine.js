// Thin wrapper around the Online3DViewer engine (MIT, github.com/kovacsv/Online3DViewer):
// one main interactive viewer plus an offscreen viewer that renders gallery thumbnails.
import * as OV from 'online-3d-viewer';
export { OV };

// A soft "studio" cube map drawn on canvases, so PBR materials (glTF etc.) have
// something to reflect without shipping environment photos.
let envSettings = null;
export function studioEnvironment() {
  if (envSettings) return envSettings;
  const S = 128;
  const face = (kind) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    if (kind === 'top') {
      const r = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.75);
      r.addColorStop(0, '#ffffff'); r.addColorStop(1, '#c9d0d8');
      g.fillStyle = r;
    } else if (kind === 'bottom') {
      g.fillStyle = '#3a3e44';
    } else {
      const l = g.createLinearGradient(0, 0, 0, S);
      l.addColorStop(0, '#d5dbe2'); l.addColorStop(0.48, '#aeb6c0');
      l.addColorStop(0.52, '#6c727a'); l.addColorStop(1, '#3a3e44');
      g.fillStyle = l;
    }
    g.fillRect(0, 0, S, S);
    if (kind === 'side-light') { // a softbox panel on two opposite sides
      const p = g.createLinearGradient(0, 0, S, 0);
      p.addColorStop(0, 'rgba(255,255,255,0)'); p.addColorStop(0.5, 'rgba(255,255,255,0.95)'); p.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = p;
      g.fillRect(S * 0.2, S * 0.12, S * 0.6, S * 0.3);
    }
    return c.toDataURL('image/png');
  };
  const lit = face('side-light'), plain = face('side'), top = face('top'), bottom = face('bottom');
  envSettings = new OV.EnvironmentSettings([lit, plain, top, bottom, plain, lit], false);
  return envSettings;
}

export const importErrorText = (err) => {
  const C = OV.ImportErrorCode;
  let msg = 'Terjadi kesalahan tidak dikenal.';
  if (err.code === C.NoImportableFile) msg = 'Tidak ada file yang bisa diimpor.';
  else if (err.code === C.FailedToLoadFile) msg = 'Gagal membaca file.';
  else if (err.code === C.ImportFailed) msg = 'Gagal mengimpor model.';
  if (err.message) msg += ' (' + err.message + ')';
  return msg;
};

export function modelStats(model, viewer) {
  const box = viewer.GetBoundingBox(() => true);
  const size = box ? {
    x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z,
  } : null;
  return {
    vertices: model.VertexCount(),
    triangles: model.TriangleCount(),
    lines: model.LineSegmentCount(),
    meshes: model.MeshInstanceCount(),
    materials: model.MaterialCount(),
    size,
  };
}

// Loads `files` into an OV viewer. Resolves with { importResult, threeObject }.
export function loadInto(viewer, loader, files, settings, hooks = {}) {
  return new Promise((resolve, reject) => {
    const inputFiles = OV.InputFilesFromFileObjects(files);
    viewer.Clear();
    loader.LoadModel(inputFiles, settings, {
      onLoadStart: () => hooks.stage && hooks.stage('Membaca file…'),
      onFileListProgress: () => {},
      onFileLoadProgress: () => {},
      onSelectMainFile: (names, select) => select(0),
      onImportStart: () => hooks.stage && hooks.stage('Mengimpor model…'),
      onVisualizationStart: () => hooks.stage && hooks.stage('Menyiapkan tampilan…'),
      onModelFinished: (importResult, threeObject) => {
        viewer.SetMainObject(threeObject);
        resolve({ importResult, threeObject });
      },
      onTextureLoaded: () => { viewer.Render(); hooks.texture && hooks.texture(); },
      onLoadError: (err) => reject(new Error(importErrorText(err))),
    });
  });
}

export function importSettings(color, lineColor) {
  const s = new OV.ImportSettings();
  if (color) s.defaultColor = color;
  if (lineColor) s.defaultLineColor = lineColor;
  return s;
}

export function fitView(viewer, animate) {
  const sphere = viewer.GetBoundingSphere(() => true);
  viewer.AdjustClippingPlanesToSphere(sphere);
  viewer.FitSphereToWindow(sphere, animate);
}

// Fits the model and turns the camera to a 3/4 view so flat-on models still read as 3D.
export function threeQuarterView(viewer, animate = false) {
  fitView(viewer, false);
  const cam = viewer.GetCamera().Clone();
  const d = OV.SubCoord3D(cam.eye, cam.center);
  const dist = Math.hypot(d.x, d.y, d.z);
  const a = Math.PI / 5;
  const up = cam.up;
  const zUp = Math.abs(up.z) > Math.abs(up.y);
  const s = (zUp ? up.z : up.y) < 0 ? -1 : 1;
  const h = dist * Math.sin(a) * s, r = dist * Math.cos(a);
  const p1 = r * Math.sin(a * 1.2), p2 = r * Math.cos(a * 1.2);
  cam.eye = zUp
    ? new OV.Coord3D(cam.center.x + p1, cam.center.y - p2, cam.center.z + h)
    : new OV.Coord3D(cam.center.x + p1, cam.center.y + h, cam.center.z + p2);
  viewer.SetCamera(cam);
  const sphere = viewer.GetBoundingSphere(() => true);
  viewer.FitSphereToWindow(sphere, animate);
}

// Renders thumbnails one at a time in a single hidden WebGL context.
export class ThumbnailRenderer {
  constructor(width = 480, height = 360) {
    this.w = width;
    this.h = height;
    this.host = document.createElement('div');
    this.host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;pointer-events:none;opacity:0`;
    this.host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.host);
    const canvas = document.createElement('canvas');
    this.host.appendChild(canvas);
    this.viewer = new OV.Viewer();
    this.viewer.Init(canvas);
    this.viewer.Resize(width, height);
    this.viewer.SetEnvironmentMapSettings(studioEnvironment());
    this.loader = new OV.ThreeModelLoader();
    this.queue = Promise.resolve();
  }

  setBackground(rgba) { this.viewer.SetBackgroundColor(rgba); }

  // Queues a render; resolves with { dataUrl, stats } or rejects with an Error.
  render(model, settings) {
    const job = this.queue.then(() => this.#run(model, settings));
    this.queue = job.catch(() => {});
    return job;
  }

  async #run(model, settings) {
    const { importResult } = await loadInto(this.viewer, this.loader, model.files, settings);
    this.viewer.SetUpVector(OV.Direction.Y, false);
    this.viewer.SetProjectionMode(OV.ProjectionMode.Perspective);
    threeQuarterView(this.viewer);
    // Give textures a moment to arrive (they're decoded from object URLs).
    if (importResult.model.MaterialCount() > 0) await new Promise((r) => setTimeout(r, 250));
    const dpr = window.devicePixelRatio || 1;
    const dataUrl = this.viewer.GetImageAsDataUrl(this.w * dpr, this.h * dpr, true);
    const stats = modelStats(importResult.model, this.viewer);
    stats.missing = importResult.missingFiles.slice();
    this.viewer.Clear();
    return { dataUrl, stats };
  }
}
