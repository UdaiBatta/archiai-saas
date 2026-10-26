import { useEffect, useRef, useState, type RefObject } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { type CanvasHistorySnapshot, useCanvasStore } from '../../store/canvasStore'
import { isPrimaryPointerButton } from '../../store/interactionModel'
import { EDITOR_PALETTE } from './editorPalette'

type Axis = 'w' | 'd' | 'both'

interface PlotDrag {
  pointerId: number
  axis: Axis
  historySnapshot: CanvasHistorySnapshot
}

const Y = 0.05
const PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const round = (value: number) => Math.round(value * 10) / 10

/** A typed plot dimension: shows the size, takes a new one on Enter or blur. */
function SizeInput({ label, value, readOnly, onCommit }: { label: string; value: number; readOnly: boolean; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const next = Number(draft)
    if (Number.isFinite(next) && next > 0 && next !== value) onCommit(next)
    else setDraft(String(value))
  }
  return (
    <label className="flex items-center gap-1 whitespace-nowrap rounded-md border border-ink/15 bg-graphite-800/90 px-1.5 py-0.5 font-mono text-[11px] text-ink shadow-md backdrop-blur">
      <span className="text-muted-light">{label}</span>
      <input
        aria-label={`Plot ${label === 'W' ? 'width' : 'depth'} in metres`}
        type="number"
        min={1}
        max={200}
        step={0.1}
        value={draft}
        readOnly={readOnly}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          if (event.key === 'Escape') setDraft(String(value))
        }}
        className="w-14 bg-transparent text-right tabular-nums outline-none [appearance:textfield]"
      />
      <span className="text-muted-light">m</span>
    </label>
  )
}

/**
 * The plot's edge as a dashed boundary with its width and depth, which can be
 * typed in or set by dragging the east edge, the south edge or the corner
 * between them. The north-west corner stays put: plan coordinates start there.
 */
export function PlotBoundary({ orbitRef, readOnly = false }: { orbitRef: RefObject<{ enabled: boolean }>; readOnly?: boolean }) {
  const footprint = useCanvasStore((s) => s.floors[0]?.footprint)
  const setPlotSize = useCanvasStore((s) => s.setPlotSize)
  const setPointerIntent = useCanvasStore((s) => s.setPointerIntent)
  const dragRef = useRef<PlotDrag | null>(null)
  // The drag previews locally and commits once, so the camera and the
  // server check do not chase every pointer move.
  const [preview, setPreview] = useState<{ w: number; d: number } | null>(null)
  if (!footprint || !(footprint.w > 0) || !(footprint.d > 0)) return null

  const { x, z } = footprint
  const w = preview?.w ?? footprint.w
  const d = preview?.d ?? footprint.d

  const begin = (axis: Axis) => (event: ThreeEvent<PointerEvent>) => {
    if (!isPrimaryPointerButton(event.button)) return
    event.stopPropagation()
    dragRef.current = { pointerId: event.pointerId, axis, historySnapshot: useCanvasStore.getState().createHistorySnapshot() }
    if (orbitRef.current) orbitRef.current.enabled = false
    setPointerIntent('resizing')
    ;(event.target as Element & { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId)
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(PLANE, hit)) return
    // Half-metre steps: plots are measured in round numbers.
    const step = (value: number) => Math.max(1, Math.round(value * 2) / 2)
    setPreview({
      w: drag.axis === 'd' ? footprint.w : step(hit.x - x),
      d: drag.axis === 'w' ? footprint.d : step(hit.z - z),
    })
  }
  const finish = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    dragRef.current = null
    if (orbitRef.current) orbitRef.current.enabled = true
    setPointerIntent('idle')
    ;(event.target as Element & { releasePointerCapture?: (id: number) => void }).releasePointerCapture?.(event.pointerId)
    if (preview && event.type !== 'pointercancel') setPlotSize(preview.w, preview.d, { historySnapshot: drag.historySnapshot })
    setPreview(null)
  }

  const size = Math.max(0.35, Math.min(0.9, Math.max(w, d) * 0.03))
  const handle = (axis: Axis, position: [number, number, number], args: [number, number, number]) => (
    <mesh
      name={`plot-handle-${axis}`}
      position={position}
      renderOrder={19}
      onPointerDown={begin(axis)}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      <boxGeometry args={args} />
      <meshBasicMaterial color={EDITOR_PALETTE.measure} transparent opacity={0.9} depthTest={false} />
    </mesh>
  )

  return (
    <group>
      <Line
        points={[[x, Y, z], [x + w, Y, z], [x + w, Y, z + d], [x, Y, z + d], [x, Y, z]]}
        color={EDITOR_PALETTE.measure}
        lineWidth={1.8}
        dashed
        dashSize={0.5}
        gapSize={0.3}
        raycast={() => null}
      />
      {!readOnly && (
        <>
          {handle('w', [x + w, Y + 0.05, z + d / 2], [size * 0.45, 0.06, size * 1.6])}
          {handle('d', [x + w / 2, Y + 0.05, z + d], [size * 1.6, 0.06, size * 0.45])}
          {handle('both', [x + w, Y + 0.05, z + d], [size, 0.06, size])}
        </>
      )}
      <Html position={[x + w / 2, Y, z - 0.7]} center zIndexRange={[2, 0]}>
        <SizeInput label="W" value={round(w)} readOnly={readOnly} onCommit={(value) => setPlotSize(value, footprint.d)} />
      </Html>
      <Html position={[x - 0.7, Y, z + d / 2]} center zIndexRange={[2, 0]}>
        <SizeInput label="D" value={round(d)} readOnly={readOnly} onCommit={(value) => setPlotSize(footprint.w, value)} />
      </Html>
    </group>
  )
}
