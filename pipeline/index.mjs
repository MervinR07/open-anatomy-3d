import fs from 'fs'
import path from 'path'

const base = 'src_dataset'
const fjName = new Map()
for (const f of ['isa_element_parts.txt', 'partof_element_parts.txt']) {
  for (const line of fs.readFileSync(path.join(base, f), 'utf8').split(/\r?\n/).slice(1)) {
    const [, name, fj] = line.trim().split(/\t/)
    if (name && fj && !fjName.has(fj)) fjName.set(fj, name)
  }
}
const seen = new Map()
for (const dir of ['partof_BP3D_4.0_obj_99', 'isa_BP3D_4.0_obj_99']) {
  for (const f of fs.readdirSync(path.join(base, dir))) {
    if (!f.endsWith('.obj') || seen.has(f)) continue
    const p = path.join(base, dir, f)
    const fd = fs.openSync(p, 'r')
    const buf = Buffer.alloc(2048)
    fs.readSync(fd, buf, 0, 2048, 0)
    fs.closeSync(fd)
    const head = buf.toString('utf8')
    const headerName = /English name : (.*)/.exec(head)?.[1]?.trim() || ''
    const name = headerName || fjName.get(f.replace('.obj', '')) || ''
    const fma = /Concept ID : (\S+)/.exec(head)?.[1] ?? ''
    const b = /Bounds\(mm\): \(([^)]*)\)-\(([^)]*)\)/.exec(head)
    const size = fs.statSync(p).size
    seen.set(f, { headerName, file: p.replace(/\\/g, '/'), fj: f.replace('.obj', ''), fma, name, min: b?.[1], max: b?.[2], size })
  }
}
const flip = n => n.replace(/(left|right|Left|Right)/g, m => ({ left: 'right', right: 'left', Left: 'Right', Right: 'Left' })[m])
for (const r of seen.values()) {
  if (r.headerName) continue
  const twin = seen.get(r.fj.endsWith('M') ? r.fj.slice(0, -1) + '.obj' : r.fj + 'M.obj')
  if (twin?.headerName) r.name = flip(twin.headerName)
}
const rows = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
fs.writeFileSync('fj_index.json', JSON.stringify(rows))
fs.writeFileSync('fj_names.txt', rows.map(r => `${r.fj}\t${(r.size / 1024).toFixed(0)}KB\t${r.name}`).join('\n'))
console.log(rows.length)
