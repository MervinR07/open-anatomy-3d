// open-anatomy-3d asset pipeline — male model.
//   Male:   BodyParts3D 4.0 (DBCLS, CC BY 4.0)
//   Female: built afterwards by f_build.mjs (see its header)
// Full steps: pipeline/README.md
import fs from 'fs'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { meshopt, prune, quantize, reorder } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { classify } from './classify.mjs'
import { JOINTS, SYSTEMS } from './catalog.mjs'

const OUT_GLB = process.argv[2] ?? 'out/anatomy.glb'
fs.mkdirSync('out', { recursive: true })

await MeshoptSimplifier.ready
await MeshoptEncoder.ready

// Triangle budget as a fraction of the source, per system — skin and brain
// are extremely dense in the source; thin vessels/nerves keep more detail so
// they don't break apart.
const RATIO = { skin: 0.2, skeleton: 0.22, muscles: 0.1, organs: 0.14, vessels: 0.12, nerves: 0.4 }
const MIN_TRIS = 400
const ERROR = { skin: 0.02, skeleton: 0.05, muscles: 0.05, organs: 0.05, vessels: 0.08, nerves: 0.08 }

function parseObj(file) {
  const pos = []
  const nrm = []
  const idx = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/); pos.push(+p[1], +p[2], +p[3])
    } else if (line.startsWith('vn ')) {
      const p = line.split(/\s+/); nrm.push(+p[1], +p[2], +p[3])
    } else if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1).map(t => parseInt(t, 10) - 1)
      for (let i = 1; i + 1 < p.length; i++) idx.push(p[0], p[i], p[i + 1])
    }
  }
  return { pos, nrm, idx }
}

const { assigned } = classify()

// ---------- pass 1: parse + merge per structure (source mm, Z-up) ----------
const parts = []
let gmin = [Infinity, Infinity, Infinity], gmax = [-Infinity, -Infinity, -Infinity]
for (const a of assigned.values()) {
  const pos = [], nrm = [], idx = []
  for (const f of a.files) {
    const o = parseObj(f.file)
    const base = pos.length / 3
    for (const v of o.pos) pos.push(v)
    if (o.nrm.length === o.pos.length) for (const n of o.nrm) nrm.push(n)
    else for (let i = 0; i < o.pos.length; i++) nrm.push(0)
    for (const i of o.idx) idx.push(i + base)
  }
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
    gmin[k] = Math.min(gmin[k], pos[i + k]); gmax[k] = Math.max(gmax[k], pos[i + k])
  }
  parts.push({ ...a, pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint32Array(idx) })
  process.stdout.write('.')
}
console.log('\nsource bounds (mm)', gmin.map(Math.round), gmax.map(Math.round))

// BodyParts3D: mm, Z-up, anterior = -Y, patient's left = +X.
// three.js: metres, Y-up, anterior = +Z, feet on y = 0, centred on x/z.
const cx = (gmin[0] + gmax[0]) / 2
const cy = (gmin[1] + gmax[1]) / 2
const toThree = (x, y, z) => [(x - cx) * 0.001, (z - gmin[2]) * 0.001, -(y - cy) * 0.001]

// ---------- joint hotspots from bone ends ----------
const byKey = new Map(parts.map(p => [p.key, p]))
function endCentroid(key, which, band) {
  const p = byKey.get(key); if (!p) return null
  let zmin = Infinity, zmax = -Infinity
  for (let i = 2; i < p.pos.length; i += 3) { zmin = Math.min(zmin, p.pos[i]); zmax = Math.max(zmax, p.pos[i]) }
  const s = [0, 0, 0]; let n = 0
  for (let i = 0; i < p.pos.length; i += 3) {
    const z = p.pos[i + 2]
    if (which === 'top' ? z > zmax - band : z < zmin + band) { s[0] += p.pos[i]; s[1] += p.pos[i + 1]; s[2] += z; n++ }
  }
  return s.map(v => v / n)
}
const mid = (a, b) => a.map((v, i) => (v + b[i]) / 2)
const jointAnchors = {}
for (const s of ['l', 'r']) {
  jointAnchors[`shoulder_${s}`] = endCentroid(`humerus_${s}`, 'top', 30)
  jointAnchors[`elbow_${s}`] = endCentroid(`humerus_${s}`, 'bottom', 30)
  jointAnchors[`wrist_${s}`] = endCentroid(`forearm_${s}`, 'bottom', 22)
  jointAnchors[`hip_${s}`] = endCentroid(`femur_${s}`, 'top', 30)
  jointAnchors[`knee_${s}`] = mid(endCentroid(`femur_${s}`, 'bottom', 25), endCentroid(`lower_leg_${s}`, 'top', 25))
  jointAnchors[`ankle_${s}`] = endCentroid(`lower_leg_${s}`, 'bottom', 25)
}
jointAnchors.hip = mid(jointAnchors.hip_l, jointAnchors.hip_r)
const jointThree = Object.fromEntries(Object.entries(jointAnchors).map(([k, v]) => [k, toThree(...v).map(n => +n.toFixed(4))]))

// ---------- pass 2: simplify, transform, emit glTF ----------
const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('anatomy')
const groups = {}
for (const sys of SYSTEMS.filter(s => s !== 'joints')) {
  groups[sys] = doc.createNode(sys)
  scene.addChild(groups[sys])
}

let totalTris = 0
const stats = {}
const catalog = []
for (const p of parts) {
  const sys = p.rule.system
  const srcTris = p.idx.length / 3
  const target = Math.max(MIN_TRIS, Math.round(srcTris * RATIO[sys]))
  let idx = p.idx
  if (srcTris > target) {
    const [simplified] = MeshoptSimplifier.simplify(p.idx, p.pos, 3, target * 3, ERROR[sys], [])
    if (simplified.length >= 3 * 16) idx = simplified
  }
  // compact to used vertices
  const remap = new Int32Array(p.pos.length / 3).fill(-1)
  let n = 0
  for (const i of idx) if (remap[i] < 0) remap[i] = n++
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3)
  for (let v = 0; v < remap.length; v++) {
    const r = remap[v]; if (r < 0) continue
    const t = toThree(p.pos[v * 3], p.pos[v * 3 + 1], p.pos[v * 3 + 2])
    pos.set(t, r * 3)
    // normals: same axis swap, no translation/scale
    nrm.set([p.nrm[v * 3], p.nrm[v * 3 + 2], -p.nrm[v * 3 + 1]], r * 3)
  }
  const out = n > 65535 ? new Uint32Array(idx.length) : new Uint16Array(idx.length)
  for (let i = 0; i < idx.length; i++) out[i] = remap[idx[i]]
  totalTris += out.length / 3
  stats[sys] ??= [0, 0]; stats[sys][0] += srcTris; stats[sys][1] += out.length / 3

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(out).setBuffer(buffer))
  const mesh = doc.createMesh(p.key).addPrimitive(prim)
  groups[sys].addChild(doc.createNode(p.key).setMesh(mesh))
  catalog.push({ key: p.key, label: p.label, system: sys, region: p.rule.region, category: p.rule.category, color: p.rule.color })
}
console.log('structures', parts.length, 'triangles', totalTris, JSON.stringify(stats))

for (const j of JOINTS) for (const s of ['l', 'r']) {
  const key = j.key.replace('{s}', s)
  catalog.push({
    key, label: j.label.replace('{S}', s === 'l' ? '(L)' : '(R)'), system: 'joints', region: 'joints_mobility',
    category: 'Musculoskeletal', color: '#ff9a3c', anchor: jointThree[key],
  })
}

doc.createExtension(KHRMeshQuantization).setRequired(true)
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
await doc.transform(
  prune(),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ quantizePosition: 14, quantizeNormal: 10 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
await io.write(OUT_GLB, doc)
console.log('glb bytes', fs.statSync(OUT_GLB).size)

// ---------- catalog for make_catalog.mjs ----------
catalog.sort((a, b) => a.system.localeCompare(b.system) || a.label.localeCompare(b.label))
fs.writeFileSync('out/catalog_male.json', JSON.stringify({ catalog, toThree: { cx, cy, minZ: gmin[2] } }))
console.log('catalog entries', catalog.length)
