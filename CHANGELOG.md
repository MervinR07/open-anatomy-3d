# Changelog

## open-anatomy-3d-react 0.1.1 — 2026-10-25

- Viewer buttons no longer pick up the host page's global `button` styles
  (e.g. the Vite React template), which hid the rotate handle's icon.

## 0.1.0 — 2026-10-25

First public release.

- `open-anatomy-3d`: male and female `.glb` models (147 structures across
  skin, skeleton, joints, muscles, organs, vessels and nerves), typed catalog,
  `modelUrl()` with jsDelivr default, `ATTRIBUTION`.
- `open-anatomy-3d-react`: `<AnatomyViewer>` (sex switch, layer toggles,
  orbit/zoom/pan, rotate arc, hover labels, pins with callout cards,
  theming via CSS variables, dark mode), `<AnatomyModel>`, `preloadAnatomy()`.
- Demo site and the model build pipeline.
