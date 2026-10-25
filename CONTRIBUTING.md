# Contributing

Issues and pull requests are welcome — bug reports, new structures, better
labels, translations of the catalog, viewer features, and examples for other
engines.

- `npm install`, then `npm run dev` for the demo, `npm run typecheck` and
  `npm run verify` before opening a pull request.
- Model changes go through [`pipeline/`](pipeline/README.md): change the
  scripts or rules, rebuild, and commit the regenerated `.glb` and
  `catalog.json` together.
- Catalog keys are public API. Don't rename or remove one in a minor release.
- New source data must allow redistribution and be added to
  [ATTRIBUTION.md](ATTRIBUTION.md) with its licence.
- By contributing you agree that code is licensed MIT and model changes
  CC BY 4.0.
