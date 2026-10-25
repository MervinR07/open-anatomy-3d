import { useMemo, useState } from 'react'
import {
  ANATOMY_BY_KEY, ATTRIBUTION, CATEGORY_COLORS, SYSTEM_LABELS, structuresFor,
  type AnatomySex, type AnatomyStructure, type AnatomySystem,
} from 'open-anatomy-3d'
import { AnatomyViewer, type AnatomyPin } from 'open-anatomy-3d-react'
// The demo self-hosts the models; apps can do the same or use the CDN default.
import maleUrl from 'open-anatomy-3d/models/anatomy-male.glb?url'
import femaleUrl from 'open-anatomy-3d/models/anatomy-female.glb?url'

const MODEL_URLS = { male: maleUrl, female: femaleUrl }
const REPO = 'https://github.com/MervinR07/open-anatomy-3d'
const SYSTEM_ORDER: AnatomySystem[] = ['organs', 'skeleton', 'joints', 'muscles', 'vessels', 'nerves', 'skin']

const STARTER_PINS: AnatomyPin[] = [
  { key: 'heart', items: ['Pinned example — click any structure to pin it'] },
  { key: 'lung_l', items: ['Callouts follow the body as it turns'] },
  { key: 'knee_r', items: ['Joints are hotspots too'] },
]

const SNIPPET = `npm i open-anatomy-3d open-anatomy-3d-react \\
  three @react-three/fiber @react-three/drei

import { AnatomyViewer } from 'open-anatomy-3d-react'
import 'open-anatomy-3d-react/styles.css'

<AnatomyViewer
  pins={[{ key: 'heart', items: ['Hypertension'] }]}
  onStructureClick={(key, s) => console.log(key, s.label)}
/>`

export function App() {
  const [sex, setSex] = useState<AnatomySex>('male')
  const [pins, setPins] = useState<AnatomyPin[]>(STARTER_PINS)
  const [selected, setSelected] = useState<AnatomyStructure | null>(ANATOMY_BY_KEY.heart)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const pinned = useMemo(() => new Set(pins.map(p => p.key)), [pins])
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = structuresFor(sex).filter(s =>
      !q || s.label.toLowerCase().includes(q) || s.key.includes(q) || s.category.toLowerCase().includes(q))
    return SYSTEM_ORDER
      .map(system => ({ system, items: list.filter(s => s.system === system).sort((a, b) => a.label.localeCompare(b.label)) }))
      .filter(g => g.items.length > 0)
  }, [sex, query])
  const total = useMemo(() => structuresFor(sex).length, [sex])

  function togglePin(s: AnatomyStructure) {
    setSelected(s)
    setPins(prev => prev.some(p => p.key === s.key)
      ? prev.filter(p => p.key !== s.key)
      : [...prev, { key: s.key, items: [] }])
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(SNIPPET)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard blocked — the code is still selectable */ }
  }

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden><span /><span /></span>
          <div>
            <h1>Open Anatomy 3D</h1>
            <p>Free, interactive human anatomy for the web</p>
          </div>
        </div>
        <nav className="links">
          <a href="https://www.npmjs.com/package/open-anatomy-3d" target="_blank" rel="noreferrer">npm</a>
          <a className="primary" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      <main className="layout">
        <section className="stage" aria-label="3D anatomy viewer">
          <AnatomyViewer
            sex={sex}
            onSexChange={setSex}
            pins={pins}
            modelUrls={MODEL_URLS}
            hoverHint="Click to pin or unpin"
            onStructureClick={(_, s) => togglePin(s)}
          />
          <p className="hint">Drag to orbit · Ctrl/⌘ + scroll or pinch to zoom · right-drag to pan</p>
        </section>

        <aside className="side">
          <div className="card">
            <div className="stats">
              <div><strong>2</strong><span>bodies</span></div>
              <div><strong>{total}</strong><span>structures</span></div>
              <div><strong>7</strong><span>systems</span></div>
            </div>
          </div>

          {selected && (
            <div className="card selected">
              <span className="eyebrow" style={{ color: CATEGORY_COLORS[selected.category] }}>{selected.category}</span>
              <h2>{selected.label}</h2>
              <dl>
                <div><dt>Key</dt><dd><code>{selected.key}</code></dd></div>
                <div><dt>System</dt><dd>{SYSTEM_LABELS[selected.system]}</dd></div>
                <div><dt>Body</dt><dd>{selected.sex ? `${selected.sex} only` : 'both'}</dd></div>
              </dl>
              <button type="button" className="btn" onClick={() => togglePin(selected)}>
                {pinned.has(selected.key) ? 'Unpin' : 'Pin to body'}
              </button>
            </div>
          )}

          <div className="card browse">
            <div className="browseHead">
              <h3>Structures</h3>
              {pins.length > 0 && <button type="button" className="link" onClick={() => setPins([])}>Clear {pins.length} pinned</button>}
            </div>
            <input
              className="search"
              type="search"
              placeholder="Search heart, femur, kidney…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search structures"
            />
            <div className="list">
              {groups.map(g => (
                <section key={g.system}>
                  <h4>{SYSTEM_LABELS[g.system]} <span>{g.items.length}</span></h4>
                  <ul>
                    {g.items.map(s => (
                      <li key={s.key}>
                        <button
                          type="button"
                          className={pinned.has(s.key) ? 'on' : undefined}
                          onClick={() => togglePin(s)}
                          aria-pressed={pinned.has(s.key)}
                        >
                          <span className="dot" style={{ background: s.color }} />
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {groups.length === 0 && <p className="empty">No structure matches “{query}”.</p>}
            </div>
          </div>
        </aside>
      </main>

      <section className="install">
        <div>
          <h3>Use it in your app</h3>
          <p>
            <code>open-anatomy-3d</code> ships the two <code>.glb</code> models and a typed catalog for any engine
            (Three.js, Babylon.js, Unity, Godot…). <code>open-anatomy-3d-react</code> is this viewer as a component.
          </p>
        </div>
        <div className="code">
          <button type="button" className="copy" onClick={copySnippet}>{copied ? 'Copied' : 'Copy'}</button>
          <pre><code>{SNIPPET}</code></pre>
        </div>
      </section>

      <footer className="foot">
        <p>{ATTRIBUTION}</p>
        <p>Code MIT · models CC BY 4.0 · Not for diagnosis.</p>
      </footer>
    </div>
  )
}
