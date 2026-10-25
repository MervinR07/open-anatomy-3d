// Tiny offline renderer: orthographic front + side views of an anatomy GLB
// (z-buffered, Lambert-shaded, translucent skin) written to a PNG.
import fs from 'fs'
import zlib from 'zlib'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const [, , IN, OUT, layersArg] = process.argv
const layers = new Set((layersArg ?? 'skin,skeleton,organs,vessels,nerves').split(','))
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = IN.endsWith('.json') ? null : await io.read(IN)

const COLOR = { skin: [233, 181, 150], skeleton: [236, 228, 208], muscles: [181, 70, 61], organs: [201, 111, 93], vessels: [192, 57, 43], nerves: [242, 193, 78] }
const W = 420, H = 820, PAD = 10, VIEWS = 2
const img = new Float32Array(W * VIEWS * H * 3).fill(248)
const zb = new Float32Array(W * VIEWS * H).fill(-1e9)
const skinAcc = new Float32Array(W * VIEWS * H)

const meshes = []
if (!doc) {
  // raw {pos, idx} JSON — render opaque (to judge the surface itself)
  const j = JSON.parse(fs.readFileSync(IN, 'utf8'))
  meshes.push({ system: 'solid', name: 'solid', pos: Float32Array.from(j.pos), idx: Uint32Array.from(j.idx), color: [224, 176, 150] })
}
for (const node of doc ? doc.getRoot().listNodes() : []) {
  const mesh = node.getMesh(); if (!mesh) continue
  const system = node.getParentNode()?.getName()
  if (!layers.has(system)) continue
  const m = node.getWorldMatrix()
  for (const p of mesh.listPrimitives()) {
    const a = p.getAttribute('POSITION'), ind = p.getIndices(), v = [0, 0, 0], pos = new Float32Array(a.getCount() * 3)
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v)
      pos[i * 3] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]
      pos[i * 3 + 1] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]
      pos[i * 3 + 2] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
    }
    const idx = new Uint32Array(ind.getCount()); for (let i = 0; i < idx.length; i++) idx[i] = ind.getScalar(i)
    meshes.push({ system, name: node.getName(), pos, idx, color: COLOR[system] })
  }
}
const scale = (H - 2 * PAD) / 1.8
function tri(view, ax, ay, az, bx, by, bz, cx, cy, cz, color, isSkin) {
  // view 0: front (x right, y up, depth +z); view 1: side (z right, depth -x... patient's right side)
  const P = view === 0 ? [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] : [[az, ay, -ax], [bz, by, -bx], [cz, cy, -cx]]
  const S = P.map(([x, y, d]) => [W / 2 + x * scale + view * W, H - PAD - y * scale, d])
  const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2]
  const vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2]
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl
  const shade = 0.35 + 0.65 * Math.abs(nx * 0.3 + ny * 0.5 + nz * 0.81)
  const minX = Math.max(view * W, Math.floor(Math.min(S[0][0], S[1][0], S[2][0]))), maxX = Math.min(view * W + W - 1, Math.ceil(Math.max(S[0][0], S[1][0], S[2][0])))
  const minY = Math.max(0, Math.floor(Math.min(S[0][1], S[1][1], S[2][1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(S[0][1], S[1][1], S[2][1])))
  const area = (S[1][0] - S[0][0]) * (S[2][1] - S[0][1]) - (S[2][0] - S[0][0]) * (S[1][1] - S[0][1])
  if (Math.abs(area) < 1e-9) return
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const w0 = ((S[1][0] - x) * (S[2][1] - y) - (S[2][0] - x) * (S[1][1] - y)) / area
    const w1 = ((S[2][0] - x) * (S[0][1] - y) - (S[0][0] - x) * (S[2][1] - y)) / area
    const w2 = 1 - w0 - w1
    if (w0 < 0 || w1 < 0 || w2 < 0) continue
    const d = w0 * S[0][2] + w1 * S[1][2] + w2 * S[2][2]
    const k = y * W * VIEWS + x
    if (isSkin) { skinAcc[k] = Math.max(skinAcc[k], 1 - Math.abs(nz)); continue }
    if (d <= zb[k]) continue
    zb[k] = d
    img[k * 3] = color[0] * shade; img[k * 3 + 1] = color[1] * shade; img[k * 3 + 2] = color[2] * shade
  }
}
for (const m of meshes) for (let view = 0; view < VIEWS; view++) for (let i = 0; i < m.idx.length; i += 3) {
  const a = m.idx[i] * 3, b = m.idx[i + 1] * 3, c = m.idx[i + 2] * 3
  tri(view, m.pos[a], m.pos[a + 1], m.pos[a + 2], m.pos[b], m.pos[b + 1], m.pos[b + 2], m.pos[c], m.pos[c + 1], m.pos[c + 2], m.color, m.system === 'skin')
}
// translucent skin: tint + rim darkening over whatever is behind
for (let k = 0; k < W * VIEWS * H; k++) {
  const s = skinAcc[k]; if (!s && zb[k] === -1e9) continue
  const covered = s > 0 || zb[k] > -1e9
  if (!covered) continue
  const alpha = 0.12 + 0.5 * Math.pow(s, 2.2)
  for (let c = 0; c < 3; c++) img[k * 3 + c] = img[k * 3 + c] * (1 - alpha) + COLOR.skin[c] * 0.85 * alpha
}
// PNG encode
const raw = Buffer.alloc((W * VIEWS * 3 + 1) * H)
for (let y = 0; y < H; y++) { raw[y * (W * VIEWS * 3 + 1)] = 0; for (let x = 0; x < W * VIEWS * 3; x++) raw[y * (W * VIEWS * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, img[y * W * VIEWS * 3 + x])) }
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([len, td, crc]) }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W * VIEWS, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2
fs.writeFileSync(OUT, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log('wrote', OUT)
