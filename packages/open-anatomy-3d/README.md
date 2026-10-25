# open-anatomy-3d

Open 3D human anatomy models for the web: a male and a female body with skin,
skeleton, muscles, organs, vessels and nerves as separately named glTF meshes,
plus a typed catalog of all 147 structures.

```bash
npm i open-anatomy-3d
```

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { ANATOMY_BY_KEY, modelUrl } from 'open-anatomy-3d'

const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(modelUrl('female'))
gltf.scene.getObjectByName('heart') // every mesh is named by its catalog key
```

- Models: `open-anatomy-3d/models/anatomy-male.glb`, `anatomy-female.glb`
  (also on jsDelivr — `modelUrl()` points there by default).
- Catalog: `ANATOMY_STRUCTURES`, `ANATOMY_BY_KEY`, `structuresFor(sex)`,
  `SYSTEMS`, `CATEGORY_COLORS`… or `open-anatomy-3d/catalog.json`.
- React viewer: [`open-anatomy-3d-react`](https://www.npmjs.com/package/open-anatomy-3d-react).

**Licences:** code MIT; models and catalog CC BY 4.0, adapted from
BodyParts3D (© DBCLS), the Human Reference Atlas (HuBMAP) and MakeHuman (CC0).
Show the exported `ATTRIBUTION` string wherever the models appear. Not for
diagnosis.

Docs, demo and source: https://github.com/MervinR07/open-anatomy-3d
