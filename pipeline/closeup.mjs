// Close-up renderer: node closeup.mjs <glb|json> <out.png> <layers> <x0> <x1> <y0> <y1> [view=front|side] [solidSkin=1]
import fs from 'fs'
import zlib from 'zlib'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

const [, , IN, OUT, layersArg, X0, X1, Y0, Y1, VIEW = 'front', SOLID = '0'] = process.argv
const [x0, x1, y0, y1] = [X0, X1, Y0, Y1].map(Number)
const layers = new Set(layersArg.split(','))
await MeshoptDecoder.ready
const COLOR = { skin: [226, 178, 152], skeleton: [236, 228, 208], muscles: [181, 70, 61], organs: [201, 111, 93], vessels: [192, 57, 43], nerves: [242, 193, 78] }
const meshes = []
if (IN.endsWith('.json')) {
  const j = JSON.parse(fs.readFileSync(IN, 'utf8'))
  meshes.push({ system: 'skin', pos: Float32Array.from(j.pos), idx: Uint32Array.from(j.idx) })
} else {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  const doc = await io.read(IN)
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue
    const system = node.getParentNode()?.getName(); if (!layers.has(system)) continue
    const m = node.getWorldMatrix()
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION'), ind = p.getIndices(), v = [0, 0, 0], pos = new Float32Array(a.getCount() * 3)
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); for (let k = 0; k < 3; k++) pos[i * 3 + k] = m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2] + m[12 + k] }
      const idx = new Uint32Array(ind.getCount()); for (let i = 0; i < idx.length; i++) idx[i] = ind.getScalar(i)
      meshes.push({ system, pos, idx })
    }
  }
}
const H = 900, W = Math.round(H * (x1 - x0) / (y1 - y0))
const sc = H / (y1 - y0)
const img = new Float32Array(W * H * 3).fill(250), zb = new Float32Array(W * H).fill(-1e9), skinA = new Float32Array(W * H)
const proj = VIEW === 'side' ? (x, y, z) => [z, y, -x] : (x, y, z) => [x, y, z]
for (const m of meshes) {
  const solid = m.system !== 'skin' || SOLID === '1'
  const col = COLOR[m.system]
  for (let i = 0; i < m.idx.length; i += 3) {
    const P = [0, 1, 2].map(k => { const o = m.idx[i + k] * 3; return proj(m.pos[o], m.pos[o + 1], m.pos[o + 2]) })
    const S = P.map(([x, y, d]) => [(x - x0) * sc, (y1 - y) * sc, d])
    const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl
    const shade = 0.3 + 0.7 * Math.abs(nx * 0.35 + ny * 0.45 + nz * 0.82)
    const minX = Math.max(0, Math.floor(Math.min(S[0][0], S[1][0], S[2][0]))), maxX = Math.min(W - 1, Math.ceil(Math.max(S[0][0], S[1][0], S[2][0])))
    const minY = Math.max(0, Math.floor(Math.min(S[0][1], S[1][1], S[2][1]))), maxY = Math.min(H - 1, Math.ceil(Math.max(S[0][1], S[1][1], S[2][1])))
    if (minX > maxX || minY > maxY) continue
    const area = (S[1][0] - S[0][0]) * (S[2][1] - S[0][1]) - (S[2][0] - S[0][0]) * (S[1][1] - S[0][1]); if (Math.abs(area) < 1e-9) continue
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const w0 = ((S[1][0] - x) * (S[2][1] - y) - (S[2][0] - x) * (S[1][1] - y)) / area, w1 = ((S[2][0] - x) * (S[0][1] - y) - (S[0][0] - x) * (S[2][1] - y)) / area, w2 = 1 - w0 - w1
      if (w0 < 0 || w1 < 0 || w2 < 0) continue
      const k = y * W + x
      if (!solid) { skinA[k] = Math.max(skinA[k], 1 - Math.abs(nz)); continue }
      const d = w0 * S[0][2] + w1 * S[1][2] + w2 * S[2][2]
      if (d <= zb[k]) continue
      zb[k] = d; for (let c = 0; c < 3; c++) img[k * 3 + c] = col[c] * shade
    }
  }
}
for (let k = 0; k < W * H; k++) { const s = skinA[k]; if (!s) continue; const a = 0.15 + 0.55 * Math.pow(s, 2); for (let c = 0; c < 3; c++) img[k * 3 + c] = img[k * 3 + c] * (1 - a) + COLOR.skin[c] * 0.8 * a }
const raw = Buffer.alloc((W * 3 + 1) * H)
for (let y = 0; y < H; y++) for (let x = 0; x < W * 3; x++) raw[y * (W * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, img[y * W * 3 + x]))
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([l, td, c]) }
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2
fs.writeFileSync(OUT, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
console.log('wrote', OUT, W, 'x', H)
