# Ruang3D Viewer

Penampil model 3D di browser yang terinspirasi dari 3dviewer.net, plus **galeri multi-file**:
buka banyak model sekaligus, lihat semuanya sebagai thumbnail, lalu klik salah satunya untuk melihatnya utuh.

Cara pakai: buka `index.html` di browser (bisa langsung dari disk atau di-hosting statis, mis. GitHub Pages).

## Format yang didukung

OBJ (+MTL & tekstur), STL, PLY, OFF, 3DS, glTF/GLB, FBX, DAE (COLLADA), WRL (VRML), 3MF, AMF, BIM,
3DM (Rhino), IFC, STEP/STP, IGES/IGS, BREP, FCStd, serta arsip **ZIP** berisi model-model di atas.

Format CAD/BIM (3DM, IFC, STEP, IGES, BREP, FCStd) dan glTF ber-Draco mengunduh parsernya dari CDN jsDelivr
saat pertama dipakai, jadi butuh internet. Format lain bekerja penuh secara offline.

## Fitur

- **Multi-file & galeri thumbnail**: seret banyak file, satu folder, atau ZIP. Setiap file model dapat thumbnail
  (dirender di latar belakang). Klik thumbnail untuk membukanya di penampil. Galeri bisa dicari, diurutkan
  (nama, format, ukuran, jumlah segitiga), dan diatur ukuran thumbnailnya.
- Panel kiri: daftar file (thumbnail kecil) dan **struktur** model (pohon mesh, tampil/sembunyikan, zoom, isolasi).
- Panel kanan: detail model (format, vertex, segitiga, mesh, material, dimensi, volume & luas permukaan,
  file yang dipakai / hilang).
- Navigasi: orbit tetap/bebas, sumbu atas Y/Z, balik arah atas, perspektif/ortografis, paskan ke layar,
  tampilan tepi (edges), warna latar, tema gelap/terang, layar penuh.
- Klik mesh di viewer untuk memilih & menyorotnya.
- Simpan gambar PNG; ekspor model ke OBJ, STL, PLY, OFF, glTF, GLB.
- Buka dari URL (dialog atau `index.html#model=url1,url2`), termasuk tautan Dropbox/GitHub/Google Drive.
- File pendukung yang hilang (mis. `.mtl`/tekstur) bisa diseret belakangan untuk melengkapi model.
- Tombol **Coba model contoh** membuat 6 model demo (GLB, OBJ+MTL+tekstur, STL, PLY, OFF, glTF).

Pintasan: `O` buka file, `G` galeri, `←/→` model sebelumnya/berikutnya, `F` paskan, `E` tepi,
`P` proyeksi, `Esc` kembali/batal pilih, `?` bantuan.

Semua file diproses lokal di browser; tidak ada yang diunggah ke server.

## Build

```bash
npm install
npm run build   # menghasilkan index.html mandiri (≈1,3 MB)
```

Sumber ada di `src/`: `main.js` (UI), `engine.js` (pembungkus engine & renderer thumbnail),
`files.js` (pengumpulan/pengelompokan file, ZIP, URL), `samples.js` (model contoh), `template.html` (tata letak & gaya).

## Lisensi pihak ketiga

- Mesin impor/render: [Online 3D Viewer](https://github.com/kovacsv/Online3DViewer) engine (MIT)
- [three.js](https://threejs.org) (MIT), [fflate](https://github.com/101arrowz/fflate) (MIT)
- Font Manrope & JetBrains Mono (SIL OFL)
