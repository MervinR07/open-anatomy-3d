// Extract named HRA female meshes (world-space positions) into a compact JSON cache.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import fs from 'fs'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read('female/united_female_v1.10.glb')
const root = doc.getRoot()
const out = {}
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue
  const m = node.getWorldMatrix()
  const pos = [], idx = []
  for (const p of mesh.listPrimitives()) {
    const a = p.getAttribute('POSITION'); const ind = p.getIndices()
    const base = pos.length / 3
    const v = [0, 0, 0]
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v)
      const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]
      const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]
      const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
      pos.push(+x.toFixed(5), +y.toFixed(5), +z.toFixed(5))
    }
    if (ind) for (let i = 0; i < ind.getCount(); i++) idx.push(ind.getScalar(i) + base)
    else for (let i = 0; i < a.getCount(); i++) idx.push(i + base)
  }
  // ancestry path for classification
  const path = []
  let n = node
  while (n) { path.unshift(n.getName()); n = n.listParents().find(p => p.propertyType === 'Node') }
  out[node.getName() + '#' + Object.keys(out).length] = { name: node.getName(), path, pos, idx }
}
fs.writeFileSync('female/meshes.json', JSON.stringify(out))
console.log(Object.keys(out).length)
