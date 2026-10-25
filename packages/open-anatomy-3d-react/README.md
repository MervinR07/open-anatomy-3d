# open-anatomy-3d-react

An interactive 3D human anatomy viewer for React, built on react-three-fiber:
male and female bodies, body-system layers, orbit/zoom, hover labels,
click-to-select and callout cards.

```bash
npm i open-anatomy-3d open-anatomy-3d-react three @react-three/fiber @react-three/drei
```

```tsx
import { AnatomyViewer } from 'open-anatomy-3d-react'
import 'open-anatomy-3d-react/styles.css'

<AnatomyViewer
  pins={[{ key: 'heart', items: ['Hypertension'] }]}
  onStructureClick={(key, structure) => console.log(key, structure.label)}
/>
```

Also exports `AnatomyModel` (the body alone, for your own `<Canvas>`) and
`preloadAnatomy(sex)`. All props, theming and examples:
https://github.com/MervinR07/open-anatomy-3d

**Licences:** code MIT. The models it loads are CC BY 4.0 and must be
credited — show the `ATTRIBUTION` string from `open-anatomy-3d`.
