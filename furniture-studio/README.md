# Furniture Studio 3D

A parametric generator for 3D furniture and household objects in your browser. It is a single offline `index.html` file, with three.js, the exporters and the fonts all inlined. The interface is in Indonesian.

## Catalogue (24 types, 6 categories)

| Category | Types |
|---|---|
| Kursi & Sofa (seating) | Kursi makan (dining chair), Kursi santai (armchair), Sofa (including an L-shaped chaise), Stool / bar, Bangku panjang (bench) |
| Meja (tables) | Meja makan (dining table, with an optional set of chairs), Meja kopi (coffee table), Meja samping (side table), Meja kerja (desk) |
| Kamar (bedroom) | Tempat tidur (bed), Lemari pakaian (wardrobe; doors and drawers can open), Lemari laci (chest of drawers), Nakas (nightstand) |
| Rak & Kabinet (shelves & cabinets) | Rak buku (bookshelf, with randomly placed books and decor), Meja TV / buffet, Kabinet dapur (kitchen: sink, built-in hob, cooker hood) |
| Lampu & Dekor (lighting & decor) | Lampu lantai (floor lamp), Lampu meja (table lamp), Cermin (mirror), Pot tanaman (plant pot) |
| Elektronik (appliances) | Kulkas (fridge), Mesin cuci (washing machine), Televisi (TV), Kipas berdiri (standing fan) |

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

The FBX exporter is written from scratch (`src/fbx.js`), because three.js has no FBX exporter. The output was checked by importing all 24 types into Blender 5.3: hierarchy, materials and UVs come through, and the sizes match in metres.

## Build

```bash
npm install
npm run build   # → index.html (fully offline)
```

Source files:

* `src/types.js`: catalogue and parameter schemas
* `src/parts.js`: legs, handles, doors and drawers
* `src/geo.js`: primitive builder
* `src/textures.js`: procedural textures
* `src/fbx.js`: FBX writer
* `src/app.js`: UI and scene
