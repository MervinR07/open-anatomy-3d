// Integrity check: every catalog structure is present in the model(s) it
// claims to be in, every mesh node in a model is in the catalog, and joint
// hotspots have an anchor for each body. Reads only the GLB JSON chunk, so it
// needs no dependencies. Run: npm run verify
import fs from 'fs'

const root = new URL('../', import.meta.url)
const catalog = JSON.parse(fs.readFileSync(new URL('catalog.json', root), 'utf8'))
const SYSTEMS = ['skin', 'skeleton', 'joints', 'muscles', 'organs', 'vessels', 'nerves']

function glbNodes(file) {
  const buf = fs.readFileSync(new URL(`models/${file}`, root))
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a GLB`)
  const len = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'))
  return {
    meshNodes: new Set(json.nodes.filter(n => n.mesh !== undefined).map(n => n.name)),
    groups: new Set(json.nodes.filter(n => n.mesh === undefined).map(n => n.name)),
    required: json.extensionsRequired ?? [],
  }
}

const errors = []
const keys = new Set()
for (const s of catalog) {
  if (keys.has(s.key)) errors.push(`duplicate key ${s.key}`)
  keys.add(s.key)
  if (!SYSTEMS.includes(s.system)) errors.push(`${s.key}: unknown system ${s.system}`)
  if (!/^#[0-9a-f]{6}$/i.test(s.color)) errors.push(`${s.key}: bad colour ${s.color}`)
}

for (const [sex, file] of [['male', 'anatomy-male.glb'], ['female', 'anatomy-female.glb']]) {
  const { meshNodes, groups, required } = glbNodes(file)
  for (const s of catalog) {
    const inBody = !s.sex || s.sex === sex
    if (s.system === 'joints') {
      const anchor = sex === 'female' ? s.anchorFemale : s.anchor
      if (inBody && (!Array.isArray(anchor) || anchor.length !== 3)) errors.push(`${file}: joint ${s.key} has no anchor`)
      continue
    }
    if (inBody && !meshNodes.has(s.key)) errors.push(`${file}: missing mesh ${s.key}`)
    if (!inBody && meshNodes.has(s.key)) errors.push(`${file}: has ${s.key}, which the catalog marks ${s.sex}-only`)
  }
  for (const n of meshNodes) if (!keys.has(n)) errors.push(`${file}: mesh ${n} is not in the catalog`)
  for (const g of SYSTEMS.filter(x => x !== 'joints')) if (!groups.has(g)) errors.push(`${file}: no "${g}" group node`)
  console.log(`${file}: ${meshNodes.size} meshes; requires ${required.join(', ')}`)
}

const pkg = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8'))
const src = fs.readFileSync(new URL('src/index.ts', root), 'utf8')
const srcVersion = /export const VERSION = '([^']+)'/.exec(src)?.[1]
if (srcVersion !== pkg.version) errors.push(`src/index.ts VERSION ${srcVersion} != package.json ${pkg.version} (the CDN URLs use it)`)

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`catalog OK: ${catalog.length} structures`)
