import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { ProjectedAnchor } from './AnatomyModel'

export interface Callout {
  key: string
  title: string
  subtitle: string
  items: string[]
  color: string
}

export interface CalloutOverlayHandle {
  /** Called every frame by the canvas-side projector with fresh screen
   * positions — mutates the DOM directly so a spinning model never
   * re-renders React 60×/s. */
  update: (anchors: ProjectedAnchor[], width: number, height: number) => void
}

interface CalloutOverlayProps {
  callouts: Callout[]
  hoveredKey: string | null
  onSelect?: (key: string) => void
  onHover: (key: string | null) => void
}

const CARD_W = 168
const CARD_W_MIN = 108
const CARD_GAP = 10
const EDGE_PAD = 10
const ELBOW = 26

interface Placed { key: string; side: 'left' | 'right'; ax: number; ay: number; cy: number; h: number }

// 1-D label placement per column: sort by anchor height, push each card down
// past the previous one, then pull the whole stack back up if it overflows —
// keeps every card as close to its structure's height as possible without
// overlapping.
function layoutColumn(items: Placed[], height: number) {
  items.sort((a, b) => a.ay - b.ay)
  let cursor = EDGE_PAD
  for (const it of items) {
    const top = Math.max(cursor, it.ay - it.h / 2)
    it.cy = top + it.h / 2
    cursor = top + it.h + CARD_GAP
  }
  let overflow = cursor - CARD_GAP - (height - EDGE_PAD)
  for (let i = items.length - 1; i >= 0 && overflow > 0; i--) {
    const it = items[i]
    const room = i === 0 ? it.cy - it.h / 2 - EDGE_PAD : it.cy - it.h / 2 - (items[i - 1].cy + items[i - 1].h / 2 + CARD_GAP)
    const shift = Math.min(overflow, Math.max(0, room))
    for (let j = i; j < items.length; j++) items[j].cy -= shift
    overflow -= shift
  }
}

/** Callout cards beside the body with dotted leader lines to their structures. */
export const CalloutOverlay = forwardRef<CalloutOverlayHandle, CalloutOverlayProps>(
  function CalloutOverlay({ callouts, hoveredKey, onSelect, onHover }, ref) {
    const cardRefs = useRef(new Map<string, HTMLButtonElement>())
    const lineRefs = useRef(new Map<string, SVGPolylineElement>())
    const dotRefs = useRef(new Map<string, SVGCircleElement>())

    useImperativeHandle(ref, () => ({
      update(anchors, width, height) {
        const byKey = new Map(anchors.map(a => [a.key, a]))
        // Narrow viewers (phones): shrink the cards so they don't bury the body.
        const cardW = width < 520 ? Math.max(CARD_W_MIN, Math.round(width * 0.3)) : CARD_W
        const left: Placed[] = []
        const right: Placed[] = []
        for (const c of callouts) {
          const a = byKey.get(c.key)
          const card = cardRefs.current.get(c.key)
          if (!a || !card) continue
          const placed: Placed = {
            key: c.key,
            side: a.x < width / 2 ? 'left' : 'right',
            ax: a.x, ay: a.y, cy: 0,
            h: card.offsetHeight || 56,
          }
          ;(placed.side === 'left' ? left : right).push(placed)
        }
        layoutColumn(left, height)
        layoutColumn(right, height)

        for (const p of [...left, ...right]) {
          const card = cardRefs.current.get(p.key)!
          const line = lineRefs.current.get(p.key)
          const dot = dotRefs.current.get(p.key)
          const cardX = p.side === 'left' ? EDGE_PAD : width - cardW - EDGE_PAD
          if (card.style.width !== `${cardW}px`) card.style.width = `${cardW}px`
          card.style.transform = `translate(${cardX}px, ${p.cy - p.h / 2}px)`
          card.style.opacity = '1'
          const edgeX = p.side === 'left' ? cardX + cardW : cardX
          const elbowX = p.side === 'left' ? edgeX + ELBOW : edgeX - ELBOW
          line?.setAttribute('points', `${edgeX},${p.cy} ${elbowX},${p.cy} ${p.ax},${p.ay}`)
          dot?.setAttribute('cx', String(p.ax))
          dot?.setAttribute('cy', String(p.ay))
        }
        for (const c of callouts) {
          const a = byKey.get(c.key)
          const hidden = !a || !a.visible
          const card = cardRefs.current.get(c.key)
          if (card && hidden) card.style.opacity = '0'
          lineRefs.current.get(c.key)?.style.setProperty('opacity', hidden ? '0' : '1')
          dotRefs.current.get(c.key)?.style.setProperty('opacity', hidden ? '0' : '1')
        }
      },
    }), [callouts])

    return (
      <div className="oa3d-callout-layer">
        <svg className="oa3d-callout-svg">
          {callouts.map(c => (
            <g key={c.key} className={hoveredKey === c.key ? 'oa3d-callout-line-active' : undefined}>
              <polyline
                ref={el => { if (el) lineRefs.current.set(c.key, el); else lineRefs.current.delete(c.key) }}
                fill="none"
                stroke={c.color}
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <circle
                ref={el => { if (el) dotRefs.current.set(c.key, el); else dotRefs.current.delete(c.key) }}
                r={6}
                fill="#ffffff"
                stroke={c.color}
                strokeWidth={3}
              />
            </g>
          ))}
        </svg>
        {callouts.map(c => (
          <button
            key={c.key}
            type="button"
            ref={el => { if (el) cardRefs.current.set(c.key, el); else cardRefs.current.delete(c.key) }}
            className="oa3d-callout-card"
            style={{ width: CARD_W, opacity: 0, borderLeftColor: c.color }}
            onClick={() => onSelect?.(c.key)}
            onMouseEnter={() => onHover(c.key)}
            onMouseLeave={() => onHover(null)}
          >
            <span className="oa3d-callout-title" style={{ color: c.color }}>{c.title}</span>
            <span className="oa3d-callout-subtitle">{c.subtitle}</span>
            {c.items.length > 0 && <span className="oa3d-callout-items">{c.items.join(', ')}</span>}
          </button>
        ))}
      </div>
    )
  },
)
