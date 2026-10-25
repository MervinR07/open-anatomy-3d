// Female anatomy build.
//
// The HRA female reference (united-female v1.10, CC BY 4.0) has real female
// skin, breasts, pelvis, uterus/ovaries/tubes/vagina, legs and organs, but no
// skull, ribs, arms, and almost no muscles or limb vessels. So the female
// model = the complete male BodyParts3D anatomy (out/anatomy.glb) fitted into
// the female body with a thin-plate-spline warp driven by matched landmarks
// (vertebrae, pelvis, leg bones, organs, head, and the body outline sliced
// along torso/arms/legs), with the sex-specific parts swapped for the real
// female ones.
import fs from 'fs'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { meshopt, prune, quantize, reorder } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const MALE_GLB = process.argv[2] ?? 'out/anatomy.glb'
const OUT_GLB = process.argv[3] ?? 'out/anatomy_female.glb'
const FEMALE_SRC = 'female/meshes.json'
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready

const { catalog: maleCatalog, toThree: T } = JSON.parse(fs.readFileSync('out/catalog_male.json', 'utf8'))
const bp3dToThree = ([x, y, z]) => [(x - T.cx) * 0.001, (z - T.minZ) * 0.001, -(y - T.cy) * 0.001]

// ---------------------------------------------------------------- helpers
const bboxCenter = P => {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]) }
  return { c: mn.map((v, k) => (v + mx[k]) / 2), mn, mx }
}
function endCentroid(P, which, band) {
  const { mn, mx } = bboxCenter(P)
  const s = [0, 0, 0]; let n = 0
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1]
    if (which === 'top' ? y > mx[1] - band : y < mn[1] + band) { s[0] += P[i]; s[1] += y; s[2] += P[i + 2]; n++ }
  }
  return s.map(v => v / n)
}
function concat(list) { const out = []; for (const a of list) for (const v of a) out.push(v); return out }

// ---------------------------------------------------------------- male input
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const maleDoc = await io.read(MALE_GLB)
const maleParts = []
for (const node of maleDoc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue
  const system = node.getParentNode()?.getName()
  const m = node.getWorldMatrix()
  const pos = [], idx = []
  for (const p of mesh.listPrimitives()) {
    const a = p.getAttribute('POSITION'), ind = p.getIndices(), base = pos.length / 3, v = [0, 0, 0]
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v)
      pos.push(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14])
    }
    for (let i = 0; i < ind.getCount(); i++) idx.push(ind.getScalar(i) + base)
  }
  maleParts.push({ key: node.getName(), system, pos, idx })
}
const maleByKey = new Map(maleParts.map(p => [p.key, p]))
console.log('male parts', maleParts.length)

// male bone landmarks straight from the BodyParts3D source (per-vertebra etc.)
const fjIndex = JSON.parse(fs.readFileSync('fj_index.json', 'utf8'))
function maleObj(name) {
  const row = fjIndex.find(r => r.name.toLowerCase() === name.toLowerCase())
  if (!row) throw new Error('male structure not found: ' + name)
  const P = []
  for (const l of fs.readFileSync(row.file, 'utf8').split('\n')) if (l.startsWith('v ')) {
    const [, x, y, z] = l.split(/\s+/).map(Number); P.push(...bp3dToThree([x, y, z]))
  }
  return P
}

// ---------------------------------------------------------------- female input
const fem = Object.values(JSON.parse(fs.readFileSync(FEMALE_SRC, 'utf8')))
const skinF0 = fem.find(o => o.name === 'VH_F_skin').pos
const sb = bboxCenter(skinF0)
// female frame: feet on y=0, centred on x/z like the male model
const FOFF = [-sb.c[0], -sb.mn[1], -sb.c[2]]
for (const o of fem) for (let i = 0; i < o.pos.length; i += 3) { o.pos[i] += FOFF[0]; o.pos[i + 1] += FOFF[1]; o.pos[i + 2] += FOFF[2] }

// ---- HRA female scan -> clean MakeHuman female body (out/female_skin.json).
// The scan's own skin (a cadaver: rough face/fingers, heavy abdomen, arms
// raised) is replaced by the MakeHuman body; the scan's internal female
// structures are carried into it with an outline-driven TPS over the torso,
// legs and head (arms excluded — the two poses differ there).
const mhSkin = JSON.parse(fs.readFileSync('out/female_skin.json', 'utf8'))
{
  const hraSkinObj = fem.find(o => o.name === 'VH_F_skin')
  const A = { pos: hraSkinObj.pos, idx: hraSkinObj.idx }, B = mhSkin
  const lvA = anatomyLevels(A), lvB = anatomyLevels(B)
  const L = []
  const lp = (a, b, t) => a + (b - a) * t
  const tSlice = (m, y) => clusters(m, y).find(c => c.lo < 0 && c.hi > 0)
  for (let i = 1; i < 60; i++) {
    const f = i / 60
    const ya = lp(lvA.crotch + 0.01, lvA.top, f), yb = lp(lvB.crotch + 0.01, lvB.top, f)
    const ca = tSlice(A, ya), cb = tSlice(B, yb)
    if (!ca || !cb || ca.pts.length < 6 || cb.pts.length < 6) continue
    const a = marks(ca.pts), b = marks(cb.pts)
    const armsA = clusters(A, ya).length >= 3, armsB = clusters(B, yb).length >= 3
    if (armsA === armsB) { L.push([a.c, b.c]); L.push([a.xmin, b.xmin]); L.push([a.xmax, b.xmax]) }
    L.push([a.zmin, b.zmin]); L.push([a.zmax, b.zmax])
  }
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const ya = lp(lvA.crotch - 0.01, 0.015, t), yb = lp(lvB.crotch - 0.01, 0.015, t)
    const pick = (m, y) => clusters(m, y).sort((p, q) => Math.abs(p.cx) - Math.abs(q.cx)).slice(0, 2).sort((p, q) => p.cx - q.cx)
    const ca = pick(A, ya), cb = pick(B, yb)
    if (ca.length < 2 || cb.length < 2) continue
    for (let k = 0; k < 2; k++) {
      const a = marks(ca[k].pts), b = marks(cb[k].pts)
      L.push([a.c, b.c]); L.push([a.xmin, b.xmin]); L.push([a.xmax, b.xmax]); L.push([a.zmin, b.zmin]); L.push([a.zmax, b.zmax])
    }
  }
  const topOf = m => { let t = null; for (let i = 0; i < m.pos.length; i += 3) if (!t || m.pos[i + 1] > t[1]) t = [m.pos[i], m.pos[i + 1], m.pos[i + 2]]; return t }
  L.push([topOf(A), topOf(B)])
  const kept = []
  for (const l of L) if (l[0].every(Number.isFinite) && l[1].every(Number.isFinite) && !kept.some(o => Math.hypot(o[0][0] - l[0][0], o[0][1] - l[0][1], o[0][2] - l[0][2]) < 0.004)) kept.push(l)
  const tA = solveTPS(kept.map(l => l[0]), kept.map(l => l[1]), 2e-4)
  const SKIP = /VH_F_mouth|Yao_lymph|VH_F_placenta|vasculature|adipose|VH_F_skin$/
  for (const o of fem) o.orig = Float32Array.from(o.pos) // scan-frame positions, internally consistent
  const out = [0, 0, 0]
  let n = 0
  for (const o of fem) {
    if (SKIP.test(o.path.join('/'))) { o.skip = true; continue }
    for (let i = 0; i < o.pos.length; i += 3) { warpPoint(tA, o.pos[i], o.pos[i + 1], o.pos[i + 2], out); o.pos[i] = out[0]; o.pos[i + 1] = out[1]; o.pos[i + 2] = out[2] }
    n++
  }
  console.log('HRA -> MakeHuman female: landmarks', kept.length, 'meshes moved', n, 'levels', JSON.stringify(lvB))
}
const femWhere = pred => fem.filter(o => pred(o))
const femPos = pred => concat(femWhere(pred).map(o => o.pos))
const femOrig = pred => concat(femWhere(pred).map(o => Array.from(o.orig ?? o.pos)))
const inPath = s => o => o.path.includes(s)
const named = s => o => o.name === s

function marks(pts) {
  const n = pts.length, c = [0, 0, 0]
  for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / n
  const by = (k, f) => pts.reduce((a, p) => (f(p[k], a[k]) ? p : a))
  return { c, xmin: by(0, (a, b) => a < b), xmax: by(0, (a, b) => a > b), zmin: by(2, (a, b) => a < b), zmax: by(2, (a, b) => a > b) }
}

// ---------------------------------------------------------------- landmarks
const LM = [] // [male xyz, female xyz, label]
const add = (a, b, label) => { if (a && b && a.every(Number.isFinite) && b.every(Number.isFinite)) LM.push([a, b, label]) }

// Skeleton landmarks: the MakeHuman rig's joint centres for this exact female
// body (posed with the same skin weights) against the male joint centres.
let spineLater = null
const J = mhSkin.joints
const anchorM = Object.fromEntries(maleCatalog.filter(c => c.anchor).map(c => [c.key, c.anchor]))
const lerp3 = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t)
for (const [s, S] of [['l', 'L'], ['r', 'R']]) {
  const chains = [
    [[anchorM[`shoulder_${s}`], J[`upperarm01.${S}`]], [anchorM[`elbow_${s}`], J[`lowerarm01.${S}`]], [anchorM[`wrist_${s}`], J[`wrist.${S}`]]],
    [[anchorM[`hip_${s}`], J[`upperleg01.${S}`]], [anchorM[`knee_${s}`], J[`lowerleg01.${S}`]], [anchorM[`ankle_${s}`], J[`foot.${S}`]]],
  ]
  for (const chain of chains) {
    for (let k = 0; k < chain.length; k++) {
      add(chain[k][0], chain[k][1], `joint ${S} ${k}`)
      // points along each segment keep the long bones straight
      if (k + 1 < chain.length) for (const t of [0.25, 0.5, 0.75]) add(lerp3(chain[k][0], chain[k + 1][0], t), lerp3(chain[k][1], chain[k + 1][1], t), `seg ${S} ${k} ${t}`)
    }
  }
  add(bboxCenter(maleByKey.get(`eye_${s}`).pos).c, J[`eye.${S}`], `eye ${S}`)
}
// Spine: male vertebral centres (L5 -> C1) against the rig's spine/neck
// chain (spine05 -> head), matched by fraction of length along each.
{
  const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
  const names = [
    ...[4, 3, 2, 1, 0].map(i => `${ORD[i]} lumbar vertebra`),
    ...[11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map(i => `${ORD[i]} thoracic vertebra`),
    ...[6, 5, 4, 3, 2].map(i => `${ORD[i]} cervical vertebra`), 'axis', 'atlas',
  ]
  const maleChain = names.map(n => bboxCenter(maleObj(n)).c)
  const femChain = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head'].map(n => J[n])
  // same fraction of body height; x/z from the rig's spine chain at that height
  const Hm = maleByKey.get('skin').pos.reduce((m, v, i) => (i % 3 === 1 ? Math.max(m, v) : m), 0)
  const Hf = mhSkin.pos.reduce((m, v, i) => (i % 3 === 1 ? Math.max(m, v) : m), 0)
  const onChain = y => {
    for (let i = 1; i < femChain.length; i++) if (femChain[i][1] >= y) return lerp3(femChain[i - 1], femChain[i], (y - femChain[i - 1][1]) / (femChain[i][1] - femChain[i - 1][1]))
    return femChain[femChain.length - 1]
  }
  spineLater = { maleChain, names } // placed after the outline helpers exist (needs the back surface)
}

// ---------------------------------------------------------------- silhouette
// Skin as {pos, idx}; a horizontal slice = the points where triangle edges
// cross the plane, so the outline is continuous even on a coarse mesh.
const skinM = { pos: maleByKey.get('skin').pos, idx: maleByKey.get('skin').idx }
const skinF = mhSkin // the clean MakeHuman female body is the female outline now
function slicePts(mesh, y) {
  const P = mesh.pos, I = mesh.idx, out = []
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = I[t + e] * 3, b = I[t + (e + 1) % 3] * 3
      const ya = P[a + 1], yb = P[b + 1]
      if ((ya - y) * (yb - y) >= 0 || ya === yb) continue
      const u = (y - ya) / (yb - ya)
      out.push([P[a] + (P[b] - P[a]) * u, y, P[a + 2] + (P[b + 2] - P[a + 2]) * u])
    }
  }
  return out
}
function clusters(mesh, y) {
  const s = slicePts(mesh, y).sort((a, b) => a[0] - b[0])
  const cl = []
  for (const p of s) { const c = cl[cl.length - 1]; if (!c || p[0] - c.hi > 0.012) cl.push({ lo: p[0], hi: p[0], pts: [p] }); else { c.hi = p[0]; c.pts.push(p) } }
  for (const c of cl) c.cx = (c.lo + c.hi) / 2
  return cl.filter(c => c.pts.length >= 4)
}
function anatomyLevels(mesh) {
  let top = -1e9
  for (let i = 1; i < mesh.pos.length; i += 3) top = Math.max(top, mesh.pos[i])
  const pts = mesh
  let armpit = null, crotch = null, fingertip = null
  for (let y = top * 0.85; y > top * 0.3; y -= 0.003) {
    const cl = clusters(pts, y)
    if (armpit === null && cl.length >= 3) armpit = y
    // legs have separated once no silhouette segment crosses the midline
    if (armpit !== null && crotch === null && !cl.some(c => c.lo < 0 && c.hi > 0)) crotch = y
  }
  // arms are the outermost segments; they end where the outermost segment
  // stops being clearly lateral to the leg/torso segment next to it
  for (let y = armpit; y > top * 0.25; y -= 0.003) {
    const cl = clusters(pts, y)
    const inner = y > crotch ? 1 : 2
    if (cl.length >= inner + 2) fingertip = y
  }
  return { top, armpit, crotch, fingertip }
}
const levM = anatomyLevels(skinM), levF = anatomyLevels(skinF)
console.log('levels M', JSON.stringify(levM), '\nlevels F', JSON.stringify(levF))

// breasts: skip front-most skin landmarks across the breast band
const br = bboxCenter(femPos(inPath('VH_F_mammary_gland')))

const lerp = (a, b, t) => a + (b - a) * t
// torso / neck / head. Where one body's arms have separated from the torso
// outline and the other's haven't (the female's arms are raised, so they
// separate lower), the side-most points aren't comparable — use only the
// front/back points there.
const torsoSlice = (mesh, y) => clusters(mesh, y).find(c => c.lo < 0 && c.hi > 0)
const armsApart = (mesh, y) => clusters(mesh, y).length >= 3
const breastY = [br.mn[1] - 0.02, br.mx[1] + 0.02]
// front/back taken on the midline — the single most-forward/backward point
// of a flat back or chest can sit anywhere left-right and would shear the fit
function midlineFB(pts) {
  const mid = pts.filter(p => Math.abs(p[0]) < 0.015)
  if (mid.length < 2) return null
  return { back: mid.reduce((a, p) => (p[2] < a[2] ? p : a)), front: mid.reduce((a, p) => (p[2] > a[2] ? p : a)) }
}
// male height -> female height, piecewise through matching anatomical levels
// (the female's shoulders sit relatively lower, so a single linear map would
// line her neck up with his shoulders)
const avgY = (a, b) => (a[1] + b[1]) / 2
const HEIGHT_KEYS = [
  [0, 0],
  [levM.crotch, levF.crotch],
  [avgY(anchorM.shoulder_l, anchorM.shoulder_r), avgY(J['upperarm01.L'], J['upperarm01.R'])],
  [(bboxCenter(maleByKey.get('eye_l').pos).c[1] + bboxCenter(maleByKey.get('eye_r').pos).c[1]) / 2, avgY(J['eye.L'], J['eye.R'])],
  [levM.top, levF.top],
]
const mapY = y => {
  for (let i = 1; i < HEIGHT_KEYS.length; i++) if (y <= HEIGHT_KEYS[i][0]) {
    const [a0, b0] = HEIGHT_KEYS[i - 1], [a1, b1] = HEIGHT_KEYS[i]
    return b0 + (b1 - b0) * (y - a0) / (a1 - a0)
  }
  return HEIGHT_KEYS[HEIGHT_KEYS.length - 1][1]
}
for (let i = 1; i < 56; i++) {
  const ym = lerp(levM.crotch + 0.01, levM.top - 0.004, i / 56), yf = mapY(ym)
  const cm = torsoSlice(skinM, ym), cf = torsoSlice(skinF, yf)
  if (!cm || !cf || cm.pts.length < 6 || cf.pts.length < 6) continue
  const a = marks(cm.pts), b = marks(cf.pts)
  if (armsApart(skinM, ym) === armsApart(skinF, yf)) {
    add(a.c, b.c, `torso c ${ym.toFixed(2)}`)
    add(a.xmin, b.xmin, 'torso x-'); add(a.xmax, b.xmax, 'torso x+')
  }
  const fm = midlineFB(cm.pts), ff = midlineFB(cf.pts)
  if (fm && ff) {
    // on the midline the female front is the skin over the sternum between
    // the breasts, so it's valid even across the breast band
    add(fm.back, ff.back, 'torso back (midline)')
    add(fm.front, ff.front, 'torso front (midline)')
  }
}
// Spine: each male vertebra at the matching female height, on the midline,
// at the same (height-scaled) depth in front of the back surface.
{
  const { maleChain, names } = spineLater
  const HSC = levF.top / levM.top
  maleChain.forEach((p, i) => {
    const yf = mapY(p[1])
    const cm = torsoSlice(skinM, p[1]), cf = torsoSlice(skinF, yf)
    const fm = cm && midlineFB(cm.pts), ff = cf && midlineFB(cf.pts)
    if (!fm || !ff) return
    add(p, [0, yf, ff.back[2] + (p[2] - fm.back[2]) * HSC], `spine ${names[i]}`)
  })
}
// arms + hands: at each height everything lateral to the torso (or to the
// two legs, below the crotch) belongs to the arm on that side — fingers split
// into several outline segments near the tips, so merge them.
function armSides(mesh, y, crotch) {
  const cl = clusters(mesh, y)
  if (!cl.length) return null
  let core
  if (y > crotch) core = cl.filter(c => c.lo < 0 && c.hi > 0)
  else core = [...cl].sort((a, b) => Math.abs(a.cx) - Math.abs(b.cx)).slice(0, 2)
  if (!core.length) return null
  const lo = Math.min(...core.map(c => c.lo)), hi = Math.max(...core.map(c => c.hi))
  const right = cl.filter(c => c.hi < lo).flatMap(c => c.pts), left = cl.filter(c => c.lo > hi).flatMap(c => c.pts)
  return { right, left }
}
// Arm centrelines (horizontal-slice centroids, fingertip -> armpit) matched
// by distance along the arm from the fingertip, scaled by body height — the
// female's arm is raised, so matching by height would stretch the humerus.
const HS = levF.top / levM.top
function armLine(mesh, lev, side) {
  const out = []
  for (let y = lev.fingertip + 0.003; y < lev.armpit - 0.004; y += 0.004) {
    const a = armSides(mesh, y, lev.crotch)
    if (!a || a[side].length < 4) continue
    const m = marks(a[side])
    out.push({ ...m, d: 0 })
  }
  for (let i = 1; i < out.length; i++) out[i].d = out[i - 1].d + Math.hypot(...[0, 1, 2].map(k => out[i].c[k] - out[i - 1].c[k]))
  return out
}
function atArc(line, d) {
  if (d <= 0) return line[0]
  for (let i = 1; i < line.length; i++) if (line[i].d >= d) return line[i]
  return null
}
for (const [side, S] of [['right', 'R'], ['left', 'L']]) {
  const lm = armLine(skinM, levM, side), lf = armLine(skinF, levF, side)
  if (lm.length < 10 || lf.length < 10) { console.log('arm line too short', side); continue }
  for (let d = 0; d <= lm[lm.length - 1].d; d += 0.02) {
    const a = atArc(lm, d), b = atArc(lf, d * HS)
    if (!a || !b) continue
    add(a.c, b.c, `arm ${S} c ${d.toFixed(2)}`); add(a.zmin, b.zmin, 'arm z-'); add(a.zmax, b.zmax, 'arm z+')
  }
  console.log('arm', S, 'male len', lm[lm.length - 1].d.toFixed(3), 'female len', lf[lf.length - 1].d.toFixed(3))
}
// legs
for (let i = 0; i <= 22; i++) {
  const s = i / 22
  const ym = lerp(levM.crotch - 0.01, 0.015, s), yf = lerp(levF.crotch - 0.01, 0.015, s)
  const legs = pts => clusters(pts, 0).length, pick = (pts, y) => clusters(pts, y).sort((a, b) => Math.abs(a.cx) - Math.abs(b.cx)).slice(0, 2).sort((a, b) => a.cx - b.cx)
  const cm = pick(skinM, ym), cf = pick(skinF, yf)
  if (cm.length < 2 || cf.length < 2) continue
  for (let k = 0; k < 2; k++) {
    if (cm[k].pts.length < 4 || cf[k].pts.length < 4) continue
    const a = marks(cm[k].pts), b = marks(cf[k].pts)
    add(a.xmin, b.xmin, 'leg x-'); add(a.xmax, b.xmax, 'leg x+'); add(a.zmin, b.zmin, 'leg z-'); add(a.zmax, b.zmax, 'leg z+')
  }
}
// head top
{
  const topPt = mesh => { let best = null; for (let i = 0; i < mesh.pos.length; i += 3) if (!best || mesh.pos[i + 1] > best[1]) best = [mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]]; return best }
  add(topPt(skinM), topPt(skinF), 'vertex')
}

// dedupe near-identical male points (keeps the system well-conditioned)
const lms = []
for (const l of LM) if (!lms.some(o => Math.hypot(o[0][0] - l[0][0], o[0][1] - l[0][1], o[0][2] - l[0][2]) < 0.004)) lms.push(l)
console.log('landmarks', LM.length, 'kept', lms.length)

// ---------------------------------------------------------------- thin-plate spline (3-D, phi(r) = r)
function solveTPS(src, dst, lambda) {
  const n = src.length, N = n + 4
  const A = Array.from({ length: N }, () => new Float64Array(N + 3))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r = Math.hypot(src[i][0] - src[j][0], src[i][1] - src[j][1], src[i][2] - src[j][2])
      A[i][j] = r + (i === j ? lambda : 0)
    }
    A[i][n] = 1; A[i][n + 1] = src[i][0]; A[i][n + 2] = src[i][1]; A[i][n + 3] = src[i][2]
    A[n][i] = 1; A[n + 1][i] = src[i][0]; A[n + 2][i] = src[i][1]; A[n + 3][i] = src[i][2]
    A[i][N] = dst[i][0]; A[i][N + 1] = dst[i][1]; A[i][N + 2] = dst[i][2]
  }
  for (let c = 0; c < N; c++) {
    let p = c
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r
    ;[A[c], A[p]] = [A[p], A[c]]
    const piv = A[c][c]
    for (let r = 0; r < N; r++) {
      if (r === c) continue
      const f = A[r][c] / piv
      if (f === 0) continue
      const Ar = A[r], Ac = A[c]
      for (let k = c; k < N + 3; k++) Ar[k] -= f * Ac[k]
    }
  }
  const W = [], Aff = []
  for (let i = 0; i < N; i++) {
    const row = [A[i][N] / A[i][i], A[i][N + 1] / A[i][i], A[i][N + 2] / A[i][i]]
    if (i < n) W.push(row); else Aff.push(row)
  }
  return { src, W, Aff }
}
function warpPoint(t, x, y, z, out) {
  const a = t.Aff
  let ox = a[0][0] + a[1][0] * x + a[2][0] * y + a[3][0] * z
  let oy = a[0][1] + a[1][1] * x + a[2][1] * y + a[3][1] * z
  let oz = a[0][2] + a[1][2] * x + a[2][2] * y + a[3][2] * z
  const S = t.src, W = t.W
  for (let i = 0; i < S.length; i++) {
    const r = Math.hypot(x - S[i][0], y - S[i][1], z - S[i][2])
    ox += W[i][0] * r; oy += W[i][1] * r; oz += W[i][2] * r
  }
  out[0] = ox; out[1] = oy; out[2] = oz
}
const tps = solveTPS(lms.map(l => l[0]), lms.map(l => l[1]), 3e-4)
let err = 0
const tmp = [0, 0, 0]
for (const [a, b] of lms) { warpPoint(tps, ...a, tmp); err = Math.max(err, Math.hypot(tmp[0] - b[0], tmp[1] - b[1], tmp[2] - b[2])) }
console.log('max landmark residual (m)', err.toFixed(4))
fs.writeFileSync('out/female_landmarks.json', JSON.stringify(lms))

// ---------------------------------------------------------------- assemble female parts
function normals(pos, idx) {
  const n = new Float32Array(pos.length)
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const o of [a, b, c]) { n[o] += nx; n[o + 1] += ny; n[o + 2] += nz }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l }
  return n
}
function weld(pos, idx) {
  const map = new Map(), P = [], remap = new Uint32Array(pos.length / 3)
  for (let v = 0; v < pos.length / 3; v++) {
    const k = `${Math.round(pos[v * 3] * 2e4)},${Math.round(pos[v * 3 + 1] * 2e4)},${Math.round(pos[v * 3 + 2] * 2e4)}`
    let id = map.get(k)
    if (id === undefined) { id = P.length / 3; map.set(k, id); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) }
    remap[v] = id
  }
  const I = []
  for (let i = 0; i < idx.length; i += 3) {
    const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]]
    if (a !== b && b !== c && a !== c) I.push(a, b, c)
  }
  return { pos: P, idx: I }
}
function simplify(pos0, idx0, ratio, error = 0.02) {
  const w = weld(pos0, idx0)
  const P = new Float32Array(w.pos), I = new Uint32Array(w.idx)
  const target = Math.max(300, Math.round(I.length / 3 * ratio))
  if (I.length / 3 <= target) return { pos: P, idx: I }
  const [s] = MeshoptSimplifier.simplify(I, P, 3, target * 3, error, [])
  const remap = new Int32Array(P.length / 3).fill(-1); let n = 0
  for (const i of s) if (remap[i] < 0) remap[i] = n++
  const np = new Float32Array(n * 3)
  for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) np.set(P.subarray(v * 3, v * 3 + 3), remap[v] * 3)
  return { pos: np, idx: Uint32Array.from(s, i => remap[i]) }
}

// ---------------------------------------------------------------- hand mapping
// The global TPS has too few degrees of freedom for 27 small hand bones, so
// everything past the wrist is mapped segment-by-segment instead: each male
// phalanx / metacarpal / the palm gets the rigid rotation (+ axial scale)
// that takes it onto the matching MakeHuman finger bone, with the palm normal
// fixing the roll. Vertices blend across nearby segments (1/d^4) and back into
// the TPS over the first 2 cm past the wrist.
const v3 = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
}
v3.norm = a => v3.mul(a, 1 / (v3.len(a) || 1))
// bone's two ends along its principal (longest bbox-free) axis: farthest pair
// of extreme points along the axis from centroid to farthest vertex
function boneEnds(P, wrist) {
  const c = [0, 0, 0]; const n = P.length / 3
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) c[k] += P[i + k] / n
  // power iteration on the covariance for the long axis
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < P.length; i += 3) { const d = [P[i] - c[0], P[i + 1] - c[1], P[i + 2] - c[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += d[a] * d[b] }
  let ax = [1, 1, 1]
  for (let it = 0; it < 50; it++) ax = v3.norm([v3.dot(C[0], ax), v3.dot(C[1], ax), v3.dot(C[2], ax)])
  let lo = 1e9, hi = -1e9
  for (let i = 0; i < P.length; i += 3) { const t = v3.dot([P[i] - c[0], P[i + 1] - c[1], P[i + 2] - c[2]], ax); lo = Math.min(lo, t); hi = Math.max(hi, t) }
  const A = v3.add(c, v3.mul(ax, lo * 0.97)), B = v3.add(c, v3.mul(ax, hi * 0.97))
  return v3.len(v3.sub(A, wrist)) < v3.len(v3.sub(B, wrist)) ? [A, B] : [B, A] // [proximal, distal]
}
const FINGERS = [['thumb', 1], ['index finger', 2], ['middle finger', 3], ['ring finger', 4], ['little finger', 5]]
const MC_ORD = ['first', 'second', 'third', 'fourth', 'fifth']
const handMaps = {}
for (const [s, S, side, Side] of [['l', 'L', 'left', 'Left'], ['r', 'R', 'right', 'Right']]) {
  const wM = anchorM[`wrist_${s}`], wF = J[`wrist.${S}`]
  const mid = (a, b) => v3.mul(v3.add(a, b), 0.5)
  // male joint chains: [base, MCP, PIP, DIP, tip] (thumb: [CMC, MCP, IP, tip])
  const male = {}, fem = {}
  for (const [fname, k] of FINGERS) {
    const mc = boneEnds(maleObj(`${Side} ${MC_ORD[k - 1]} metacarpal bone`), wM)
    const ph = (k === 1 ? ['Proximal', 'Distal'] : ['Proximal', 'Middle', 'Distal']).map(p => boneEnds(maleObj(`${p} phalanx of ${side} ${fname}`), wM))
    const chain = [mc[0], mid(mc[1], ph[0][0])]
    for (let i = 0; i + 1 < ph.length; i++) chain.push(mid(ph[i][1], ph[i + 1][0]))
    chain.push(ph[ph.length - 1][1])
    male[k] = chain
    const f = k === 1
      ? [J[`finger1-1.${S}`], J[`finger1-2.${S}`], J[`finger1-3.${S}`], J[`finger1-tip.${S}`]]
      : [J[`metacarpal${k - 1}.${S}`], J[`finger${k}-1.${S}`], J[`finger${k}-2.${S}`], J[`finger${k}-3.${S}`], J[`finger${k}-tip.${S}`]]
    // the rig's tip is the skin tip; the bone stops ~4 mm short of it
    const n = f.length, dir = v3.norm(v3.sub(f[n - 1], f[n - 2]))
    f[n - 1] = v3.sub(f[n - 1], v3.mul(dir, 0.004))
    fem[k] = f
  }
  // palm frame: normal from (index MCP -> little MCP) x (wrist -> middle MCP)
  const palmN = (ch, w) => v3.norm(v3.cross(v3.sub(ch[5][1], ch[2][1]), v3.sub(ch[3][1], w)))
  const nM = palmN(male, wM), nF = palmN(fem, wF)
  const radial = v3.len(v3.sub(fem[5][1], fem[2][1])) / v3.len(v3.sub(male[5][1], male[2][1]))
  const frame = (a, b, n) => { const e1 = v3.norm(v3.sub(b, a)); const e2 = v3.norm(v3.sub(n, v3.mul(e1, v3.dot(n, e1)))); return [e1, e2, v3.cross(e1, e2)] }
  const segs = []
  const addSeg = (a0, a1, b0, b1) => {
    const Fm = frame(a0, a1, nM), Ff = frame(b0, b1, nF)
    segs.push({ a0, a1, b0, Fm, Ff, sAx: v3.len(v3.sub(b1, b0)) / v3.len(v3.sub(a1, a0)) })
  }
  addSeg(wM, male[3][1], wF, fem[3][1]) // palm / carpus
  for (const [, k] of FINGERS) for (let i = 0; i + 1 < male[k].length; i++) addSeg(male[k][i], male[k][i + 1], fem[k][i], fem[k][i + 1])
  const elbowM = anchorM[`elbow_${s}`]
  handMaps[s] = { segs, radial, wM, fore: v3.norm(v3.sub(wM, elbowM)) }
  console.log(`hand ${S}: ${segs.length} segments, radial scale ${radial.toFixed(3)}, axial`, segs.map(g => g.sAx.toFixed(2)).join(' '))
}
function segDist(p, g) {
  const d = v3.sub(g.a1, g.a0), t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, g.a0), d) / v3.dot(d, d)))
  return v3.len(v3.sub(p, v3.add(g.a0, v3.mul(d, t))))
}
function segMap(p, g, radial) {
  const q = v3.sub(p, g.a0)
  const l = [v3.dot(q, g.Fm[0]) * g.sAx, v3.dot(q, g.Fm[1]) * radial, v3.dot(q, g.Fm[2]) * radial]
  return v3.add(g.b0, v3.add(v3.mul(g.Ff[0], l[0]), v3.add(v3.mul(g.Ff[1], l[1]), v3.mul(g.Ff[2], l[2]))))
}
const HAND_KEYS = /^(hand|hand_muscles|forearm|forearm_muscles|arteries_arm|veins_arm)_(l|r)$/
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t) }
function warpHand(s, x, y, z, out) {
  warpPoint(tps, x, y, z, out)
  const H = handMaps[s], p = [x, y, z]
  const w = smooth(-0.005, 0.02, v3.dot(v3.sub(p, H.wM), H.fore))
  if (w <= 0) return
  let sw = 0; const acc = [0, 0, 0]
  for (const g of H.segs) {
    const d = segDist(p, g) + 0.002, wi = 1 / (d * d * d * d)
    const m = segMap(p, g, H.radial)
    acc[0] += m[0] * wi; acc[1] += m[1] * wi; acc[2] += m[2] * wi; sw += wi
  }
  for (let k = 0; k < 3; k++) out[k] = out[k] * (1 - w) + (acc[k] / sw) * w
}

const DROP_MALE = new Set(['skin', 'prostate', 'reproductive'])
const outParts = []
const t0 = Date.now()
for (const p of maleParts) {
  if (DROP_MALE.has(p.key)) continue
  const pos = new Float32Array(p.pos.length)
  const hs = HAND_KEYS.exec(p.key)?.[2]
  for (let i = 0; i < p.pos.length; i += 3) { if (hs) warpHand(hs, p.pos[i], p.pos[i + 1], p.pos[i + 2], tmp); else warpPoint(tps, p.pos[i], p.pos[i + 1], p.pos[i + 2], tmp); pos[i] = tmp[0]; pos[i + 1] = tmp[1]; pos[i + 2] = tmp[2] }
  outParts.push({ key: p.key, system: p.system, pos, idx: Uint32Array.from(p.idx) })
}
console.log('warped male parts in', ((Date.now() - t0) / 1000).toFixed(1), 's')

function femalePart(key, system, pred, ratio) {
  const objs = femWhere(pred)
  const pos = [], idx = []
  for (const o of objs) { const base = pos.length / 3; for (const v of o.pos) pos.push(v); for (const i of o.idx) idx.push(i + base) }
  const s = simplify(pos, idx, ratio)
  outParts.push({ key, system, ...s })
  console.log('female', key, objs.length, 'meshes ->', s.idx.length / 3, 'tris')
}
{
  const sk = simplify(mhSkin.pos, mhSkin.idx, 0.6, 0.004)
  outParts.push({ key: 'skin', system: 'skin', ...sk })
  console.log('female skin (MakeHuman)', sk.idx.length / 3, 'tris')
}
const glandular = o => o.path.includes('VH_F_mammary_gland') && !/fat_|suspensory/.test(o.name)
femalePart('breast_l', 'organs', o => glandular(o) && /_L$/.test(o.name), 0.25)
femalePart('breast_r', 'organs', o => glandular(o) && /_R$/.test(o.name), 0.25)
// Seat the real female pelvis (and the pelvic organs with it) exactly on the
// fitted skeleton: least-squares affine from the scan pelvis's landmarks to
// the same points on the warped male skeleton (femoral heads, iliac crests,
// hip-bone centres, sacrum, L5).
{
  const W = p => { const o = [0, 0, 0]; warpPoint(tps, ...p, o); return o }
  const pairs = []
  for (const [s, S] of [['left', 'L'], ['right', 'R']]) {
    const fM = maleObj(`${s} femur`), hM = maleObj(`${s} hip bone`)
    const fF = femOrig(named(`VH_F_femur_${S}`)), hF = femOrig(named(`VH_F_ilium_compact_bone_${S}`))
    pairs.push([endCentroid(fF, 'top', 0.025), W(endCentroid(fM, 'top', 0.025))])
    pairs.push([endCentroid(hF, 'top', 0.02), W(endCentroid(hM, 'top', 0.02))])
  }
  pairs.push([bboxCenter(femOrig(named('VH_F_sacrum'))).c, W(bboxCenter(maleObj('sacrum')).c)])
  pairs.push([bboxCenter(femOrig(named('VH_F_lumbar_vertebra_5'))).c, W(bboxCenter(maleObj('fifth lumbar vertebra')).c)])
  // similarity (rotation + uniform scale + translation), Umeyama/Horn via
  // power-iterated quaternion — can't shear the pelvis the way an affine can
  const n = pairs.length
  const ca = [0, 1, 2].map(k => pairs.reduce((s, p) => s + p[0][k], 0) / n)
  const cb = [0, 1, 2].map(k => pairs.reduce((s, p) => s + p[1][k], 0) / n)
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  let va = 0
  for (const [a, b] of pairs) {
    const x = a.map((v, k) => v - ca[k]), y = b.map((v, k) => v - cb[k])
    va += x[0] * x[0] + x[1] * x[1] + x[2] * x[2]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += x[i] * y[j]
  }
  const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = S
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ]
  // largest eigenvector of N (shifted so it's the dominant one)
  let q = [1, 0, 0, 0]
  const shift = 10 * Math.max(...N.flat().map(Math.abs))
  for (let it = 0; it < 500; it++) {
    const nq = N.map((r, i) => r.reduce((s, v, j) => s + v * q[j], 0) + shift * q[i])
    const l = Math.hypot(...nq); q = nq.map(v => v / l)
  }
  const [w, x, y, z] = q
  const R = [
    [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
  ]
  let num = 0
  for (const [a, b] of pairs) { const xa = a.map((v, k) => v - ca[k]), yb = b.map((v, k) => v - cb[k]); const r = R.map(row => row[0] * xa[0] + row[1] * xa[1] + row[2] * xa[2]); num += r[0] * yb[0] + r[1] * yb[1] + r[2] * yb[2] }
  const scale = num / va
  const fit = v => { const d = v.map((u, k) => u - ca[k]); const r = R.map(row => row[0] * d[0] + row[1] * d[1] + row[2] * d[2]); return r.map((u, k) => u * scale + cb[k]) }
  let err = 0
  for (const [a, b] of pairs) err = Math.max(err, Math.hypot(...fit(a).map((v, k) => v - b[k])))
  pairs.forEach(([a, b], i) => console.log('  pair', i, 'src', a.map(v => v.toFixed(3)).join(','), 'dst', b.map(v => v.toFixed(3)).join(','), 'res', Math.hypot(...fit(a).map((v, k) => v - b[k])).toFixed(3)))
  // pelvic organs from their scan-frame positions (the pelvic bones stay the
  // fitted skeleton's own, which meet the femurs and spine exactly)
  const PELVIC = /VH_F_(uterus|ovary|fallopian_tube|vagina)|VH_F_(left|right)_ovary/
  let moved = 0
  for (const o of fem) if (PELVIC.test(o.path.join('/'))) {
    const src = o.orig
    o.pos = []
    for (let i = 0; i < src.length; i += 3) o.pos.push(...fit([src[i], src[i + 1], src[i + 2]]))
    moved++
  }
  console.log('pelvis seat: pairs', pairs.length, 'scale', scale.toFixed(3), 'max residual (m)', err.toFixed(4), 'meshes', moved)
}
femalePart('uterus', 'organs', inPath('VH_F_uterus'), 0.5)
femalePart('ovary_l', 'organs', named('VH_F_left_ovary'), 1)
femalePart('ovary_r', 'organs', named('VH_F_right_ovary'), 1)
femalePart('fallopian_tubes', 'organs', inPath('VH_F_fallopian_tube'), 0.4)
femalePart('vagina', 'organs', inPath('VH_F_vagina'), 0.6)

// joint hotspot anchors for the female body
const femaleAnchors = {}
for (const c of maleCatalog) if (c.anchor) { warpPoint(tps, ...c.anchor, tmp); femaleAnchors[c.key] = tmp.map(v => +v.toFixed(4)) }

// ---------------------------------------------------------------- write GLB
const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('anatomy_female')
const groups = {}
for (const sys of ['skin', 'skeleton', 'muscles', 'organs', 'vessels', 'nerves']) { groups[sys] = doc.createNode(sys); scene.addChild(groups[sys]) }
let tris = 0
for (const p of outParts) {
  const n = normals(p.pos, p.idx)
  const vc = p.pos.length / 3
  const ind = vc > 65535 ? new Uint32Array(p.idx) : new Uint16Array(p.idx)
  tris += ind.length / 3
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(p.pos)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(n).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(ind).setBuffer(buffer))
  groups[p.system].addChild(doc.createNode(p.key).setMesh(doc.createMesh(p.key).addPrimitive(prim)))
}
doc.createExtension(KHRMeshQuantization).setRequired(true)
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
await doc.transform(prune(), reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ quantizePosition: 14, quantizeNormal: 10 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
await io.write(OUT_GLB, doc)
fs.writeFileSync('out/catalog_female.json', JSON.stringify({ anchors: femaleAnchors, keys: outParts.map(p => p.key) }))
console.log('female glb', fs.statSync(OUT_GLB).size, 'bytes,', tris, 'tris,', outParts.length, 'structures')
