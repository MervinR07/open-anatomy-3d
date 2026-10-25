import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { cn } from './cn'

interface RotateArcControlProps {
  rotationY: number
  onChange: (radians: number) => void
}

// Radians of model rotation per pixel of horizontal drag.
const SENSITIVITY = 0.012
// Bounded slider, not an infinite dial — full left/right is a full 180°
// turn either way (back of the body), centre is front-facing.
const ROTATION_RANGE = Math.PI

// Arc endpoints/control point, matches the <path> below (viewBox 0 0 220 40).
const ARC_P0 = { x: 10, y: 36 }
const ARC_P1 = { x: 110, y: -6 }
const ARC_P2 = { x: 210, y: 36 }

function pointOnArc(t: number): { x: number; y: number } {
  const mt = 1 - t
  return {
    x: mt * mt * ARC_P0.x + 2 * mt * t * ARC_P1.x + t * t * ARC_P2.x,
    y: mt * mt * ARC_P0.y + 2 * mt * t * ARC_P1.y + t * t * ARC_P2.y,
  }
}

function clampRotation(r: number): number {
  return Math.max(-ROTATION_RANGE, Math.min(ROTATION_RANGE, r))
}

/** An arc with a draggable handle under the body: drag left/right to turn
 *  the model. The handle slides along the arc to track the rotation. */
export function RotateArcControl({ rotationY, onChange }: RotateArcControlProps) {
  const dragRef = useRef<{ startX: number; startRotation: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = { startX: e.clientX, startRotation: rotationY }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [rotationY])

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    onChange(clampRotation(dragRef.current.startRotation + dx * SENSITIVITY))
  }, [onChange])

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = null
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const t = (clampRotation(rotationY) + ROTATION_RANGE) / (2 * ROTATION_RANGE)
  const { x, y } = pointOnArc(t)

  return (
    <div className="oa3d-rotate">
      <svg viewBox="0 0 220 40" className="oa3d-rotate-svg">
        <path d="M 10 36 Q 110 -6 210 36" strokeWidth="1.5" fill="none" />
      </svg>
      <button
        type="button"
        className={cn('oa3d-rotate-handle', dragging && 'oa3d-rotate-handle-active')}
        style={{ left: `${x}px`, top: `${y}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Drag left or right to rotate the model"
      >
        <svg viewBox="0 0 24 24" className="oa3d-rotate-icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l-5 6 5 6M15 6l5 6-5 6" />
        </svg>
      </button>
    </div>
  )
}
