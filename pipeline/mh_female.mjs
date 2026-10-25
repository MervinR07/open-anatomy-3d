// Female outer body for the anatomy viewer, from the MakeHuman hm08 base mesh
// (CC0): average young female (race targets 1/3 each), arms lowered from the
// base A-pose to the relaxed anatomical pose used by the male BodyParts3D
// model (palms forward), via linear-blend skinning with MakeHuman's own CC0
// default rig + weights, then one level of Catmull-Clark subdivision.
// Output: out/female_skin.json {pos (m, feet on y=0, centred), idx}.
import fs from 'fs'

const DIR = 'mh/'
const ARM_ANGLE_FROM_VERTICAL = +(process.argv[2] ?? 12) // degrees
const lines = fs.readFileSync(DIR + 'makehuman_base.obj', 'utf8').split(/\r?\n/)
const V = []
const faces = []
let group = ''
for (const l of lines) {
  const p = l.trim().split(/\s+/)
  if (p[0] === 'v') V.push(p.slice(1, 4).map(Number))
  else if (p[0] === 'g') group = p[1]
  else if (p[0] === 'f' && group === 'body') faces.push(p.slice(1).map(c => parseInt(c, 10) - 1))
}
for (const race of ['caucasian', 'african', 'asian']) {
  for (const l of fs.readFileSync(`${DIR}${race}-female-young.target`, 'utf8').split(/\r?\n/)) {
    if (!l || l[0] === '#') continue
    const [i, x, y, z] = l.trim().split(/\s+/).map(Number)
    V[i][0] += x / 3; V[i][1] += y / 3; V[i][2] += z / 3
  }
}

const skel = JSON.parse(fs.readFileSync(DIR + 'default.mhskel', 'utf8'))
const weights = JSON.parse(fs.readFileSync(DIR + 'default_weights.mhw', 'utf8')).weights
const joint = name => {
  const ids = skel.joints[name]; const c = [0, 0, 0]
  for (const i of ids) for (let k = 0; k < 3; k++) c[k] += V[i][k] / ids.length
  return c
}
const children = {}
for (const [b, d] of Object.entries(skel.bones)) (children[d.parent] ??= []).push(b)
const descendants = b => [b, ...(children[b] ?? []).flatMap(descendants)]

// ---- rotation helpers
const sub = (a, b) => a.map((v, i) => v - b[i])
const add = (a, b) => a.map((v, i) => v + b[i])
const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l) }
function rotMat(axis, ang) {
  const [x, y, z] = norm(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]]
}
const mulMV = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2])
const mulMM = (a, b) => a.map(r => [0, 1, 2].map(j => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]))
// affine transform = {m, t}: x -> m x + t
const about = (m, pivot) => ({ m, t: sub(pivot, mulMV(m, pivot)) })
const compose = (A, B) => ({ m: mulMM(A.m, B.m), t: add(mulMV(A.m, B.t), A.t) }) // A after B
const apply = (T, v) => add(mulMV(T.m, v), T.t)
const I = { m: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] }

const boneT = {} // bone -> transform
for (const side of ['L', 'R']) {
  const sgn = side === 'L' ? 1 : -1 // patient's left = +X
  const shoulder = joint(`upperarm01.${side}____head`)
  const elbow = joint(`lowerarm01.${side}____head`)
  const wrist = joint(`wrist.${side}____head`)
  // 1) lower the whole arm in the frontal plane (about Z through the shoulder)
  const dir = norm(sub(wrist, shoulder))
  const cur = Math.atan2(Math.abs(dir[0]), -dir[1]) // angle from straight down
  const target = ARM_ANGLE_FROM_VERTICAL * Math.PI / 180
  // whichever rotation direction brings the wrist down is the right one
  const angleZ = [1, -1].map(s => s * (cur - target))
    .sort((a, b) => apply(about(rotMat([0, 0, 1], a), shoulder), wrist)[1] - apply(about(rotMat([0, 0, 1], b), shoulder), wrist)[1])[0]
  const lowerT = about(rotMat([0, 0, 1], angleZ), shoulder)
  // 2) straighten the elbow: the A-pose forearm is bent forward/outward —
  //    bring it in line with the (lowered) upper arm
  const s2 = shoulder, e1 = apply(lowerT, elbow), w1 = apply(lowerT, wrist)
  const up = norm(sub(e1, s2)), fore = norm(sub(w1, e1))
  const bendAxis = [fore[1] * up[2] - fore[2] * up[1], fore[2] * up[0] - fore[0] * up[2], fore[0] * up[1] - fore[1] * up[0]]
  const bendAng = Math.acos(Math.max(-1, Math.min(1, fore[0] * up[0] + fore[1] * up[1] + fore[2] * up[2])))
  const straight = Math.hypot(...bendAxis) > 1e-6 ? about(rotMat(bendAxis, bendAng * 0.92), e1) : I
  const armT = compose(straight, lowerT)
  // 3) no forced supination: MakeHuman's palms face the thighs once the arm
  //    is lowered — the natural relaxed pose. (Twisting the forearm 90° with
  //    linear-blend skinning pinched the wrist.) The anatomy's hand bones are
  //    mapped onto this hand per finger segment in f_build.mjs instead.
  const twist = () => I
  console.log(side, 'arm angle was', (cur * 180 / Math.PI).toFixed(1), 'deg')

  // partial lowering for the shoulder girdle to avoid a pinched armpit
  const partial = f => about(rotMat([0, 0, 1], angleZ * f), shoulder)
  boneT[`clavicle.${side}`] = partial(0.1)
  boneT[`shoulder01.${side}`] = partial(0.35)
  for (const b of descendants(`upperarm01.${side}`)) boneT[b] = lowerT
  boneT[`lowerarm01.${side}`] = compose(twist(0.35), armT)
  boneT[`lowerarm02.${side}`] = compose(twist(0.75), armT)
  // 4) straighten the wrist: point the hand (wrist -> middle knuckle) along
  //    the forearm instead of the A-pose's outward bend
  const handT0 = compose(twist(1), armT)
  const wr = apply(handT0, wrist), kn = apply(handT0, joint(`finger3-1.${side}____head`))
  const el = apply(handT0, elbow)
  const hDir = norm(sub(kn, wr)), fDir = norm(sub(wr, el))
  const wAxis = [hDir[1] * fDir[2] - hDir[2] * fDir[1], hDir[2] * fDir[0] - hDir[0] * fDir[2], hDir[0] * fDir[1] - hDir[1] * fDir[0]]
  const wAng = Math.acos(Math.max(-1, Math.min(1, hDir[0] * fDir[0] + hDir[1] * fDir[1] + hDir[2] * fDir[2])))
  const wristFix = Math.hypot(...wAxis) > 1e-6 ? about(rotMat(wAxis, wAng * 0.85), wr) : I
  for (const b of descendants(`wrist.${side}`)) boneT[b] = compose(wristFix, handT0)
  // 5) relax the splayed A-pose fingers: rotate each finger at its knuckle
  //    toward the middle finger's direction (thumb only partly)
  const handT = compose(wristFix, handT0)
  const fingerDir = k => norm(sub(apply(handT, joint(`finger${k}-3.${side}____tail`)), apply(handT, joint(`finger${k}-1.${side}____head`))))
  const mid = fingerDir(3)
  for (const [k, amount] of [[2, 0.75], [4, 0.75], [5, 0.8]]) {
    const d = fingerDir(k)
    const ax = [d[1] * mid[2] - d[2] * mid[1], d[2] * mid[0] - d[0] * mid[2], d[0] * mid[1] - d[1] * mid[0]]
    const ang = Math.acos(Math.max(-1, Math.min(1, d[0] * mid[0] + d[1] * mid[1] + d[2] * mid[2])))
    if (Math.hypot(...ax) < 1e-6) continue
    const knuckle = apply(handT, joint(`finger${k}-1.${side}____head`))
    const R = compose(about(rotMat(ax, ang * amount), knuckle), handT)
    for (const b of descendants(`finger${k}-1.${side}`)) boneT[b] = R
  }
  // thumb: lay it along the index finger (aim its tip at the index finger's
  // middle joint) instead of jutting out across the palm
  {
    const base = apply(handT, joint(`finger1-1.${side}____head`))
    const tip = apply(handT, joint(`finger1-3.${side}____tail`))
    const aim = apply(boneT[`finger2-1.${side}`] ?? handT, joint(`finger2-2.${side}____head`))
    const d = norm(sub(tip, base)), t = norm(sub(aim, base))
    const ax = [d[1] * t[2] - d[2] * t[1], d[2] * t[0] - d[0] * t[2], d[0] * t[1] - d[1] * t[0]]
    const ang = Math.acos(Math.max(-1, Math.min(1, d[0] * t[0] + d[1] * t[1] + d[2] * t[2])))
    if (Math.hypot(...ax) > 1e-6) {
      const R = compose(about(rotMat(ax, ang * 0.85), base), handT)
      for (const b of descendants(`finger1-1.${side}`)) boneT[b] = R
    }
  }
  // 6) straighten the curled fingers: each phalanx mostly in line with the
  //    one before it (a little natural flexion kept)
  for (let k = 1; k <= 5; k++) {
    const T1 = boneT[`finger${k}-1.${side}`] ?? handT
    const pa = apply(T1, joint(`finger${k}-1.${side}____head`)), pb = apply(T1, joint(`finger${k}-2.${side}____head`))
    const pc = apply(T1, joint(`finger${k}-3.${side}____head`))
    const straightenAt = (p0, p1, p2, amount) => {
      const u = norm(sub(p1, p0)), v = norm(sub(p2, p1))
      const ax = [v[1] * u[2] - v[2] * u[1], v[2] * u[0] - v[0] * u[2], v[0] * u[1] - v[1] * u[0]]
      const ang = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])))
      return Math.hypot(...ax) < 1e-6 ? I : about(rotMat(ax, ang * amount), p1)
    }
    const Rb = straightenAt(pa, pb, pc, 0.8)
    const T2 = compose(Rb, T1)
    const pc2 = apply(T2, joint(`finger${k}-3.${side}____head`)), pd2 = apply(T2, joint(`finger${k}-3.${side}____tail`))
    const Rc = straightenAt(apply(T2, joint(`finger${k}-2.${side}____head`)), pc2, pd2, 0.8)
    boneT[`finger${k}-2.${side}`] = T2
    boneT[`finger${k}-3.${side}`] = compose(Rc, T2)
  }
  console.log(side, 'wrist straightened by', (wAng * 0.85 * 180 / Math.PI).toFixed(1), 'deg')
  console.log(side, 'elbow straightened by', (bendAng * 0.92 * 180 / Math.PI).toFixed(1), 'deg')
}

// legs: bring the A-pose stance in so the ankles sit about under the hips,
// like the male model's anatomical stance (rotation in the frontal plane
// about each hip joint; the pelvis bone takes a little of it for a smooth groin)
for (const side of ['L', 'R']) {
  const hip = joint(`upperleg01.${side}____head`), ankle = joint(`foot.${side}____head`)
  const cur = Math.atan2(ankle[0] - hip[0], hip[1] - ankle[1])      // + = ankle out to +X
  const want = (side === 'L' ? 1 : -1) * 2.5 * Math.PI / 180
  const ang = cur - want // rotate about +Z by +ang moves a point below the pivot toward +X... sign checked below
  const cand = [ang, -ang].map(a => about(rotMat([0, 0, 1], a), hip))
  const legT = cand.sort((a, b) => Math.abs(apply(a, ankle)[0] - (hip[0] + Math.tan(want) * (hip[1] - ankle[1]))) - Math.abs(apply(b, ankle)[0] - (hip[0] + Math.tan(want) * (hip[1] - ankle[1]))))[0]
  for (const b of descendants(`upperleg01.${side}`)) boneT[b] = legT
  const angZ = Math.atan2(legT.m[1][0], legT.m[0][0])
  boneT[`pelvis.${side}`] = about(rotMat([0, 0, 1], angZ * 0.25), hip)
  console.log(side, 'leg brought in by', (Math.abs(angZ) * 180 / Math.PI).toFixed(1), 'deg')
}

// ---- linear-blend skinning
const vw = new Map() // vertex -> [[T, w]]
for (const [bone, list] of Object.entries(weights)) {
  const T = boneT[bone]; if (!T) continue
  for (const [vi, w] of list) { if (!vw.has(vi)) vw.set(vi, []); vw.get(vi).push([T, w]) }
}
const P = V.map((v, i) => {
  const ws = vw.get(i); if (!ws) return v
  let tot = 0; const o = [0, 0, 0]
  for (const [T, w] of ws) { const p = apply(T, v); for (let k = 0; k < 3; k++) o[k] += p[k] * w; tot += w }
  // weights for bones we don't move carry the rest (identity)
  for (let k = 0; k < 3; k++) o[k] += v[k] * Math.max(0, 1 - tot)
  return tot > 1 ? o.map(x => x / tot) : o
})

// ---- keep only body-group vertices
const used = new Map(); const pos = []; const polys = []
for (const f of faces) polys.push(f.map(i => { if (!used.has(i)) { used.set(i, pos.length); pos.push(P[i].slice()) } return used.get(i) }))

// ---- Catmull-Clark (one level)
function catmullClark(pos, polys) {
  const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`)
  const facePts = polys.map(f => f.reduce((s, i) => add(s, pos[i]), [0, 0, 0]).map(v => v / f.length))
  const edges = new Map()
  polys.forEach((f, fi) => f.forEach((a, k) => {
    const b = f[(k + 1) % f.length], key = edgeKey(a, b)
    if (!edges.has(key)) edges.set(key, { a, b, faces: [] })
    edges.get(key).faces.push(fi)
  }))
  const out = pos.map(p => p.slice()); const edgeIdx = new Map()
  for (const [key, e] of edges) {
    const mid = add(pos[e.a], pos[e.b]).map(v => v / 2)
    const p = e.faces.length === 2 ? add(add(pos[e.a], pos[e.b]), add(facePts[e.faces[0]], facePts[e.faces[1]])).map(v => v / 4) : mid
    e.mid = mid; edgeIdx.set(key, out.length); out.push(p)
  }
  const vFaces = pos.map(() => []), vEdges = pos.map(() => [])
  polys.forEach((f, fi) => f.forEach(i => vFaces[i].push(fi)))
  for (const e of edges.values()) { vEdges[e.a].push(e); vEdges[e.b].push(e) }
  for (let i = 0; i < pos.length; i++) {
    const bnd = vEdges[i].filter(e => e.faces.length !== 2)
    if (bnd.length) {
      if (bnd.length === 2) {
        const o = bnd.map(e => pos[e.a === i ? e.b : e.a])
        out[i] = pos[i].map((v, k) => (6 * v + o[0][k] + o[1][k]) / 8)
      }
      continue
    }
    const n = vFaces[i].length
    const F = vFaces[i].reduce((s, fi) => add(s, facePts[fi]), [0, 0, 0]).map(v => v / n)
    const R = vEdges[i].reduce((s, e) => add(s, e.mid), [0, 0, 0]).map(v => v / vEdges[i].length)
    out[i] = pos[i].map((v, k) => (F[k] + 2 * R[k] + (n - 3) * v) / n)
  }
  const newPolys = []
  polys.forEach((f, fi) => {
    const fp = out.length; out.push(facePts[fi])
    f.forEach((a, k) => {
      const next = f[(k + 1) % f.length], prev = f[(k + f.length - 1) % f.length]
      newPolys.push([a, edgeIdx.get(edgeKey(a, next)), fp, edgeIdx.get(edgeKey(prev, a))])
    })
  })
  return { pos: out, polys: newPolys }
}
const cc = catmullClark(pos, polys)

// ---- to metres, feet on y=0, centred on x/z; triangulate
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
for (const p of cc.pos) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]) }
const TARGET_HEIGHT = 1.62
const sc = TARGET_HEIGHT / (mx[1] - mn[1])
const flat = []
for (const p of cc.pos) flat.push((p[0] - (mn[0] + mx[0]) / 2) * sc, (p[1] - mn[1]) * sc, (p[2] - (mn[2] + mx[2]) / 2) * sc)
const idx = []
for (const f of cc.polys) for (let k = 1; k + 1 < f.length; k++) idx.push(f[0], f[k], f[k + 1])
// posed joint centres, same frame as the skin
const JOINTS = ['upperarm01', 'lowerarm01', 'wrist', 'upperleg01', 'lowerleg01', 'foot', 'eye']
const jointsOut = {}
const posedJoint = name => { const ids = skel.joints[name]; const c = [0, 0, 0]; for (const i of ids) for (let k = 0; k < 3; k++) c[k] += P[i][k] / ids.length; return c }
const toFrame = c => [(c[0] - (mn[0] + mx[0]) / 2) * sc, (c[1] - mn[1]) * sc, (c[2] - (mn[2] + mx[2]) / 2) * sc].map(v => +v.toFixed(5))
for (const b of JOINTS) for (const side of ['L', 'R']) jointsOut[`${b}.${side}`] = toFrame(posedJoint(`${b}.${side}____head`))
for (const b of ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head']) jointsOut[b] = toFrame(posedJoint(`${b}____head`))
jointsOut['head.tail'] = toFrame(posedJoint('head____tail'))
for (const side of ['L', 'R']) {
  for (let k = 1; k <= 5; k++) {
    for (const j of ['1', '2', '3']) jointsOut[`finger${k}-${j}.${side}`] = toFrame(posedJoint(`finger${k}-${j}.${side}____head`))
    jointsOut[`finger${k}-tip.${side}`] = toFrame(posedJoint(`finger${k}-3.${side}____tail`))
  }
  for (let m = 1; m <= 4; m++) jointsOut[`metacarpal${m}.${side}`] = toFrame(posedJoint(`metacarpal${m}.${side}____head`))
}
fs.writeFileSync('out/female_skin.json', JSON.stringify({ pos: flat.map(v => +v.toFixed(5)), idx, joints: jointsOut }))

console.log('female skin: verts', cc.pos.length, 'tris', idx.length / 3, 'height m', TARGET_HEIGHT, 'width m', ((mx[0] - mn[0]) * sc).toFixed(3))
