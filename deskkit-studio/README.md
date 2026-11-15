# DeskKit Studio 3D

Generator parametrik berbasis browser untuk **desk organizer** siap cetak 3D (FDM). Satu file HTML, tanpa instalasi.

## File siap pakai

| File | Keterangan |
| --- | --- |
| `index.html` | three.js `0.160.0` via CDN `importmap` + Google Fonts (perlu internet). |
| `deskkit-studio-offline.html` | Semua di-inline (three.js, addons, font) — jalan tanpa internet. |

## Jenis objek

| Objek | Parameter utama |
| --- | --- |
| **Compartment tray** | ukuran, tata letak (grid, wide-left, wide-back, trough-front), kolom × baris, tebal & tinggi sekat (penuh = kantong terpisah, rendah = sekat tipis), finger scoop, ceruk kaki karet / magnet 6×2 di bawah |
| **Pen cup** | bentuk (round, hexagon, square, octagon, flower), flute/lobe, twist, taper, bibir miring, sekat dalam (half, cross, three-way), fillet dasar |
| **Stepped pen block** | 1–4 tingkat, lubang per tingkat (single/staggered), kedalaman lubang, tingkat depan = lubang / tray / slot ponsel miring, rongga bawah 45° hemat filamen |
| **Phone / tablet stand** | tebal perangkat, sudut pandang, lebar, sandaran, bibir depan, notch kabel, brace truss/solid; dicetak miring di sisinya (tanpa support) |
| **Card & note holder** | kartu nama, sticky note, index card, credit card atau custom; jumlah slot, tebal tumpukan, kemiringan, finger dip, trough pena |
| **Cable dock** | jumlah kanal, diameter kabel, leher snap-in, panjang; dicetak rebah (kanal vertikal, tanpa overhang) |
| **Mini drawer unit** | 1–5 laci, ukuran dalam, clearance geser, handle tab/dip; casing dicetak berdiri di panel belakang |

## Fitur

- 12 preset, pemilih jenis objek, UI dibangun dari `SCHEMA`.
- Viewport: mode **Assembled** / **Print plate** (semua part dalam orientasi cetak), slider buka laci, referensi ukuran (pena, ponsel/tablet, kartu, kabel), section cut Y/X/Z, tema gelap/terang, layout mobile.
- HUD: ukuran, kapasitas (ml), estimasi filamen (gram & meter, sesuai infill), estimasi waktu cetak, status mesh *watertight*, peringatan.
- Ekspor: STL plate (Z-up), OBJ berwarna, GLB, PNG 2048 px transparan, JSON, ZIP (plate + STL per part + `PRINT_GUIDE.txt`).

## Jaminan geometri

Semua objek dibangun dari dua primitif tertutup (prisma berkantong dan ekstrusi profil). Parameter yang bentrok (sudut terlalu bulat, lubang terlalu dekat tepi, dll.) otomatis dibatasi dengan peringatan.

Uji: `npm test` (atau `node test/objects.test.mjs <seed> <n>`): 12 preset + 1.050 konfigurasi acak per seed di seluruh rentang parameter → semua part watertight, tanpa kantong menembus dinding.

## Pengembangan

```bash
npm install
npm run build   # index.html + deskkit-studio-offline.html dari src/
npm test
```

`src/geom.js` (kernel solid), `src/objects.js` (resep objek), `src/params.js` (SCHEMA & preset), `src/app.js` (UI & ekspor), `src/template.html`.
