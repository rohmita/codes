# TessellaLock Studio 3D

Generator CAD parametrik berbasis browser untuk wadah modular yang **tersusun rapat (tessellation)** dan **saling mengunci (interlocking)**, siap cetak 3D (FDM/SLA). Dibuat sesuai PRD *TessellaLock Studio 3D*.

## File siap pakai

| File | Keterangan |
| --- | --- |
| `index.html` | Versi PRD: satu file, three.js `0.160.0` via CDN `importmap` + Google Fonts (perlu internet). |
| `tessellalock-studio-offline.html` | Satu file mandiri, semua (three.js, addons, font) di-inline — jalan tanpa internet. |

Cukup buka salah satu file di browser modern (Chrome/Edge/Firefox/Safari).

## Fitur utama

- **Bentuk dasar:** box, hexagon, octagon, triangle, circle-collar (4/6 pad), multigon 3–12 sisi.
- **Pengunci:** sliding dovetail, snap-fit cantilever kembar, magnet (press-fit / top-drop / embedded), T-slot (leher 45°), puzzle (lobe bulat), none.
- **Polaritas:** hermaphroditic (2 cetakan identik saling mengunci), alternating (male/female berlawanan), all-female + klip dogbone double-male.
- **DfAM:** clearance ±δ/2 per bidang kontak (offset normal), taper bebas-support ≥ sudut overhang, chamfer elephant-foot, lead-in bevel, corner relief, stacking rim (plug bawah masuk ke tongue atas), boss internal otomatis di balik soket.
- **Viewport:** preview tessellation (single, 1×2, cluster-3, 2×2, stack), slider engage 0–100 %, section cut Y/X/Z dengan *clearance heatmap* (unit soket = cyan, unit pin = amber, celah = gelap) dan pengukuran celah minimum di HUD.
- **HUD:** footprint, pitch kisi, volume & berat filamen, kapasitas (ml), status mesh *watertight*, regangan snap-fit + peringatan PLA.
- **Ekspor:** STL (biner, Z-up, mm), OBJ (warna vertex, Y-up, mm), GLB (meter), PNG 2048 px transparan, JSON preset (simpan/muat), ZIP lengkap + `PRINT_GUIDE.txt`.

## Jaminan geometri

Setiap rebuild divalidasi (shell tertutup, kontur tidak saling memotong, plug stacking tidak bertabrakan). Jika kombinasi parameter ekstrem menimbulkan konflik, aplikasi otomatis mengecilkan joint / mengurangi konektor / mematikan fitur yang bentrok dan menampilkan peringatan — file ekspor tidak pernah rusak.

Uji otomatis (`npm test`, `node test/fuzz.test.mjs <seed> <n>`):
- 359 kombinasi terstruktur (8 bentuk × 8 varian pengunci × 3 polaritas × stacking on/off) → semua *watertight*, kontur valid, celah sambungan = `clearance`, tanpa interferensi.
- 1.800+ konfigurasi acak di seluruh rentang SCHEMA → semua valid.

## Pengembangan

```bash
npm install
npm run build   # menghasilkan index.html dan tessellalock-studio-offline.html dari src/
npm test
```

Struktur: `src/engine.js` (mesin geometri), `src/params.js` (SCHEMA & PRESETS), `src/app.js` (UI, viewport, ekspor), `src/template.html` (layout & CSS).
