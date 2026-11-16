# Furniture Studio 3D

A parametric generator for 3D furniture and household objects in your browser. It is a single offline `index.html` file, with three.js, the exporters and the fonts all inlined. The interface is in Indonesian.

## Catalogue (62 types, 9 categories)

| Category | Types |
|---|---|
| Kursi & Sofa (10) | Kursi makan (dining chair), Kursi santai (armchair), Sofa (with optional chaise), Kursi kantor (office chair), Kursi goyang (rocking chair), Kursi lipat (folding / director's chair), Stool / bar, Bangku panjang (bench), Ottoman / pouf, Beanbag |
| Meja (7) | Meja makan (dining, optional chair set), Meja kopi (coffee), Meja samping (side), Meja kerja (desk), Meja konsol (console), Meja bar (bar table, optional stools), Meja set (nesting tables) |
| Kamar tidur (7) | Tempat tidur (bed), Ranjang susun (bunk / loft bed), Boks bayi (crib), Lemari pakaian (wardrobe), Lemari laci (chest of drawers), Nakas (nightstand), Meja rias (vanity with Hollywood lights) |
| Rak & Penyimpanan (7) | Rak buku (bookshelf), Rak dinding (wall shelves), Rak kubus (cube organizer), Rak sepatu (shoe rack), Lemari pajangan (glass display cabinet), Meja TV / buffet, Lemari arsip (filing cabinet) |
| Dapur (7) | Kabinet dapur (kitchen cabinets), Pulau dapur (kitchen island), Kulkas (fridge), Kompor + oven, Microwave, Dispenser air (water dispenser), Rak piring (dish rack) |
| Kamar mandi (5) | Wastafel kabinet (bathroom vanity), Kloset (sit-down, wall-hung or squat toilet), Bathtub, Rak handuk (towel rack), Lemari cermin (mirror cabinet) |
| Lampu & Dekor (9) | Lampu lantai (floor lamp), Lampu meja (table lamp), Lampu gantung (pendant), Cermin (mirror), Pot tanaman (plant pot), Jam dinding (wall clock), Gantungan baju (coat rack), Karpet (rug), Lukisan (wall art) |
| Elektronik (6) | Televisi (TV), AC split, Kipas berdiri (standing fan), Mesin cuci (washing machine), Speaker, Komputer |
| Taman & Outdoor (4) | Kursi berjemur (sun lounger), Payung taman (patio umbrella), Meja piknik (picnic table), Ayunan (swing) |

The panel has a search box and category chips with a count for each category.

Each type has its own parameters (dimensions, shapes, edge profiles, number of parts and more) plus shared modules:

* **Legs:** 13 styles: straight square, tapered square, cylinder, mid-century, classic turned, slim metal, hairpin, sled, X-frame, side panel, pedestal (disc, cross or 5-star with casters), trestle and plinth. Thickness, taper, splay, inset and stretchers are adjustable.
* **Fronts & handles:** 7 front styles (plain, shaker, fluted, louvre, glass, mirror, rattan) and 7 handle styles (bar, knob, thin tab, recessed groove, ring, leather strap, push-to-open).
* **Style presets:** 2–6 per type. The **Acak** button (random) mixes styles, options, dimensions and colour palettes.

## Toolbar

One compact floating bar: undo/redo · Acak (random) · **Warna** (quick colour) · camera & display · light/dark theme · Export.

* **Warna:** 12 furniture palettes (6 for appliances), 22 colour swatches plus a custom colour, and 11 finishes (wood, matte, satin, glossy, metal, fabric, velvet, leather, rattan, marble, glass). Each finish is applied per part ("slot").
* **Camera & display:** Iso, front, side and top views; auto-rotate; dimension readout; floor grid; shadows; wireframe; mesh quality.
* Shortcuts: `R` random, `C` colour, `F` reframe, `Ctrl+Z` / `Ctrl+Y` undo/redo.

## Export

| Format | Notes |
|---|---|
| **FBX** | Binary FBX 7.4, in **cm** and **Y-up**. One empty root holds one mesh per part, each with its own pivot. Materials are shared Phong (colour, specular, metallic, opacity), with normals and UVs. |
| GLB | glTF 2.0 binary, in metres, using PBR metallic-roughness materials |
| OBJ | OBJ + MTL in one `.zip`, in cm |
| STL | Binary, in cm |
| PNG | 2048 px render |
| JSON | Saves or loads the design (type, parameters, materials) |

The FBX exporter is written from scratch (`src/fbx.js`), because three.js has no FBX exporter. The output was checked by importing all 62 types into Blender 5.3: hierarchy, materials and UVs come through, and the sizes match in metres.

## Build

```bash
npm install
npm run build   # → index.html (fully offline)
```

Source files:

* `src/catalog.js`: categories and order; `src/types.js`, `src/types2.js`, `src/types3.js`: types, parameters and generators
* `src/parts.js`: legs, handles, doors and drawers
* `src/geo.js`: primitive builder
* `src/textures.js`: procedural textures
* `src/fbx.js`: FBX writer
* `src/app.js`: UI and scene
