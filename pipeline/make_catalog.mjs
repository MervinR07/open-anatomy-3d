// Merge the male + female build outputs into the package's catalog.json.
// Run after build.mjs and f_build.mjs.
import fs from 'fs'

const OUT = process.argv[2] ?? '../packages/open-anatomy-3d/catalog.json'
const { catalog } = JSON.parse(fs.readFileSync('out/catalog_male.json', 'utf8'))
const female = JSON.parse(fs.readFileSync('out/catalog_female.json', 'utf8'))

const MALE_ONLY = new Set(['prostate', 'reproductive'])
const entries = catalog.map(c => {
  const e = { key: c.key, label: c.label, system: c.system, category: c.category, color: c.color }
  if (c.key === 'reproductive') e.label = 'Male Reproductive Organs'
  if (c.anchor) e.anchor = c.anchor
  if (c.anchor && female.anchors[c.key]) e.anchorFemale = female.anchors[c.key]
  if (MALE_ONLY.has(c.key)) e.sex = 'male'
  return e
})
for (const e of [
  { key: 'breast_l', label: 'Breast (L)', color: '#f0a8a0' },
  { key: 'breast_r', label: 'Breast (R)', color: '#f0a8a0' },
  { key: 'uterus', label: 'Uterus', color: '#d9737a' },
  { key: 'ovary_l', label: 'Ovary (L)', color: '#e8b36a' },
  { key: 'ovary_r', label: 'Ovary (R)', color: '#e8b36a' },
  { key: 'fallopian_tubes', label: 'Fallopian Tubes', color: '#d98a8f' },
  { key: 'vagina', label: 'Vagina', color: '#cf8a86' },
]) entries.push({ key: e.key, label: e.label, system: 'organs', category: 'Reproductive', color: e.color, sex: 'female' })

const missing = entries.filter(e => !e.anchor && !female.keys.includes(e.key) && e.sex !== 'male' && e.key !== 'skin')
if (missing.length) console.warn('in catalog but not in female model:', missing.map(m => m.key).join(', '))

entries.sort((a, b) => a.system.localeCompare(b.system) || a.label.localeCompare(b.label))
fs.writeFileSync(OUT, JSON.stringify(entries, null, 2) + '\n')
console.log('catalog entries', entries.length, '->', OUT)
