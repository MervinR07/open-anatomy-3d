import fs from 'fs'
import { DROP, RULES, ZONES, zoneOf } from './catalog.mjs'

const index = JSON.parse(fs.readFileSync('fj_index.json', 'utf8'))

// PART-OF concept name -> set of FJ ids
const conceptFiles = new Map()
for (const line of fs.readFileSync('src_dataset/partof_element_parts.txt', 'utf8').split('\n').slice(1)) {
  const [, name, fj] = line.trim().split('\t')
  if (!name || !fj) continue
  const k = name.toLowerCase()
  if (!conceptFiles.has(k)) conceptFiles.set(k, new Set())
  conceptFiles.get(k).add(fj)
}

const parseVec = s => s.split(',').map(Number)
const sideOfText = t => (/\bleft\b/.test(t) ? 'l' : /\bright\b/.test(t) ? 'r' : null)

export function classify() {
  const assigned = new Map() // key -> { rule, side, zone, files: [] }
  const unmatched = []
  const dropped = []
  for (const row of index) {
    const lower = row.name.toLowerCase()
    const bare = lower.replace(/^(left|right) /, '').replace(/ of (left|right) /g, ' of ')
    if (DROP.some(re => re.test(bare))) { dropped.push(row.name); continue }
    const min = parseVec(row.min), max = parseVec(row.max)
    const center = min.map((v, i) => (v + max[i]) / 2)
    let hit = null
    let conceptSide = null
    // Whole-organ PART-OF membership beats name rules, so e.g. the hepatic
    // veins inside the liver stay part of the liver, not "Veins — Abdomen".
    const fjBase = row.fj.replace(/M$/, '')
    for (const rule of RULES) {
      const c = rule.concept?.find(cn => conceptFiles.get(cn)?.has(row.fj) || conceptFiles.get(cn)?.has(fjBase))
      if (c) { hit = rule; conceptSide = sideOfText(c); break }
    }
    if (!hit) hit = RULES.find(rule => rule.re && rule.re.test(bare)) ?? null
    if (!hit) { unmatched.push(row.name); continue }
    // Limb structures well off the midline take their side from where they
    // actually are — a few source files carry the wrong side in their name.
    const geoSide = center[0] > 0 ? 'l' : 'r'
    const side = hit.key.includes('{s}') && Math.abs(center[0]) > 100 ? geoSide : sideOfText(lower) ?? conceptSide ?? geoSide
    const zone = zoneOf(center)
    const key = hit.key.replace('{s}', side).replace('{zone}', zone)
    const label = hit.label
      .replace('{S}', side === 'l' ? '(L)' : '(R)')
      .replace('{ZONE}', ZONES[zone])
    if (!assigned.has(key)) assigned.set(key, { key, label, rule: hit, files: [] })
    assigned.get(key).files.push(row)
  }
  return { assigned, unmatched, dropped }
}

if (process.argv[1].endsWith('classify.mjs')) {
  const { assigned, unmatched, dropped } = classify()
  console.log('keys', assigned.size, 'unmatched', unmatched.length, 'dropped', dropped.length)
  const bySystem = {}
  for (const a of assigned.values()) {
    const kb = a.files.reduce((s, f) => s + f.size, 0) / 1024
    ;(bySystem[a.rule.system] ??= []).push(`${a.key}(${a.files.length},${kb.toFixed(0)}k)`)
  }
  for (const [s, list] of Object.entries(bySystem)) console.log(`\n[${s}] ${list.length}:`, list.join(' '))
  console.log('\nUNMATCHED:', [...new Set(unmatched.map(n => n.toLowerCase().replace(/^(left|right) /, '')))].join(' | '))
}
