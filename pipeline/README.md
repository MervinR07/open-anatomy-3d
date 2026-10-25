# Model pipeline

Rebuilds `packages/open-anatomy-3d/models/*.glb` and `catalog.json` from the
original datasets. You only need this to change the models; the packages
already contain the built files. Needs Node 20+, `curl`, about 16 GB of RAM
and a few GB of disk.

```bash
cd pipeline
npm install
```

1. **Download BodyParts3D 4.0** from
   https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/ into
   `pipeline/src_dataset/`: unzip `isa_BP3D_4.0_obj_99.zip` and
   `partof_BP3D_4.0_obj_99.zip` there, and add `isa_element_parts.txt` and
   `partof_element_parts.txt`.
2. `npm run index` — indexes every mesh file (`fj_index.json`).
3. `npm run classify` — prints which structures each file falls into. The
   rules live in `catalog.mjs`; edit them to add, split or merge structures.
4. `npm run build:male` — `out/anatomy.glb` + `out/catalog_male.json`.
5. Female model:
   ```bash
   npm run female:download && npm run female:extract
   npm run female:makehuman && npm run female:body
   npm run build:female
   ```
6. `npm run catalog` — writes `packages/open-anatomy-3d/catalog.json`.
7. `npm run install-assets` — copies both models into the package.
8. From the repo root: `npm run verify`, then `npm run dev` to look at them.

`npm run preview -- out/anatomy_female.glb out/f.png` renders a quick PNG
without a browser (`closeup.mjs` renders a zoomed region).

Catalog keys are public API: renaming or removing one is a breaking change.
