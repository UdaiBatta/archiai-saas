import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Edges, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { useCanvasStore } from '../store/canvasStore'
import { MODEL_COLORS, mixHex } from '../components/canvas/modelView'
import { EDITOR_PALETTE } from '../components/canvas/editorPalette'
import { HANDLE_PX, HandleMark, usePixelsPerMetre } from '../components/canvas/TopPlanOverlay'
import { buildableEnvelope, polygonArea, type Region } from './siteGeometry'
import type { Mass, SitePoint } from './siteTypes'
import {
  centroid,
  floorsForTop,
  makeMass,
  massTop,
  moveCorner,
  moveMass,
  rectPoints,
  snap,
  spillRegion,
  zoningIssues,
} from './massing'
import { commitMasses, currentMasses, previewMasses, useMassUi, useSiteAndMasses } from './massStore'

interface OrbitHandle {
  enabled: boolean
}

type DragKind = { type: 'height' } | { type: 'move' } | { type: 'corner'; index: number }

interface ActiveDrag {
  pointerId: number
  kind: DragKind
  start: Mass[]
  mass: Mass
  origin: THREE.Vector3
  plane: THREE.Plane
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const OFFENDING = mixHex(MODEL_COLORS.wall, MODEL_COLORS.invalid, 0.45)

function ringsToShape(outer: SitePoint[], holes: SitePoint[][] = []) {
  // Shape space (x, -z) extruded along +Z, then rotated -90° about X: +Z -> world up.
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, -p.z)))
  shape.holes = holes.map((h) => new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.z))))
  return shape
}

const regionShapes = (region: Region) =>
  region.map(([outer, ...holes]) => {
    const pts = (r: [number, number][]) => r.slice(0, -1).map(([x, z]) => ({ x, z }))
    return ringsToShape(pts(outer), holes.map(pts))
  })

/**
 * The massing model in the 3D view: extruded masses with slab lines, the
 * selection label and push/pull handle, spill regions outside the envelope,
 * and (in Top view) move / corner grips and the rectangle / polygon draw tool.
 */
export function MassLayer({ orbitRef, readOnly, topView, focusedMassId = null }: { orbitRef: RefObject<OrbitHandle>; readOnly: boolean; topView: boolean; focusedMassId?: string | null }) {
  const { site, masses } = useSiteAndMasses()
  const selectedMassId = useMassUi((s) => s.selectedMassId)
  const select = useMassUi((s) => s.select)
  const roomSelected = useCanvasStore((s) => s.selectedId)
  const gl = useThree((s) => s.gl)
  const pxPerMetre = usePixelsPerMetre()
  const dragRef = useRef<ActiveDrag | null>(null)

  const issues = useMemo(() => zoningIssues(site, masses), [site, masses])
  const offending = useMemo(() => new Set(issues.map((i) => i.massId)), [issues])
  const spills = useMemo(() => {
    if (!site) return []
    const envelope = buildableEnvelope(site)
    return masses
      .filter((m) => issues.some((i) => i.code === 'outside' && i.massId === m.id))
      .map((m) => ({ mass: m, shapes: regionShapes(spillRegion(m, envelope)) }))
  }, [site, masses, issues])

  // Room and mass selection are exclusive.
  useEffect(() => {
    if (roomSelected) select(null)
  }, [roomSelected, select])

  const setCursor = (cursor: string) => () => { gl.domElement.style.cursor = cursor }

  const endDrag = (restore: boolean) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (orbitRef.current) orbitRef.current.enabled = true
    commitMasses(drag.start, restore ? drag.start : currentMasses())
  }

  useEffect(() => {
    const cancel = () => endDrag(true)
    window.addEventListener('archiai:cancel-canvas-interaction', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('archiai:cancel-canvas-interaction', cancel)
      window.removeEventListener('blur', cancel)
    }
  })

  const beginDrag = (mass: Mass, kind: DragKind) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || readOnly) return
    event.stopPropagation()
    select(mass.id)
    useCanvasStore.getState().deselectAll()
    let plane = GROUND
    if (kind.type === 'height') {
      // A vertical plane through the handle, facing the camera.
      const facing = event.camera.getWorldDirection(new THREE.Vector3()).setY(0)
      if (facing.lengthSq() < 1e-6) return
      plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing.normalize(), event.point)
    }
    const origin = new THREE.Vector3()
    if (!event.ray.intersectPlane(plane, origin)) return
    dragRef.current = { pointerId: event.pointerId, kind, start: masses, mass, origin, plane }
    if (orbitRef.current) orbitRef.current.enabled = false
    ;(event.target as Element | null)?.setPointerCapture?.(event.pointerId)
  }

  const onDrag = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(drag.plane, hit)) return
    const { snapToGrid, gridSize } = useCanvasStore.getState()
    const m = drag.mass
    let patch: Partial<Mass>
    if (drag.kind.type === 'height') {
      patch = { floors: floorsForTop(m, massTop(m) + hit.y - drag.origin.y) }
    } else if (drag.kind.type === 'move') {
      patch = { footprint: moveMass(m, hit.x - drag.origin.x, hit.z - drag.origin.z, gridSize, snapToGrid) }
    } else {
      patch = { footprint: moveCorner(m.footprint, drag.kind.index, { x: hit.x, z: hit.z }, gridSize, snapToGrid) }
    }
    previewMasses(drag.start.map((x) => (x.id === m.id ? { ...x, ...patch } : x)))
  }

  const onDragEnd = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    ;(event.target as Element | null)?.releasePointerCapture?.(event.pointerId)
    endDrag(event.type === 'pointercancel')
  }

  const dragHandlers = { onPointerMove: onDrag, onPointerUp: onDragEnd, onPointerCancel: onDragEnd }
  const selected = masses.find((m) => m.id === selectedMassId)
  const metre = 1 / pxPerMetre

  return (
    <group name="masses" onPointerMissed={() => { if (!dragRef.current) select(null) }}>
      {masses.map((m) => (
        <MassBody
          key={m.id}
          mass={m}
          selected={m.id === selectedMassId}
          focused={topView && focusedMassId === m.id}
          invalid={offending.has(m.id)}
          onPointerDown={
            topView
              ? beginDrag(m, { type: 'move' })
              : (event) => {
                  if (event.button !== 0) return
                  event.stopPropagation()
                  select(m.id)
                  useCanvasStore.getState().deselectAll()
                }
          }
          {...(topView ? dragHandlers : {})}
          onPointerOver={setCursor(topView && !readOnly ? 'move' : 'pointer')}
          onPointerOut={setCursor('')}
        />
      ))}

      {spills.map(({ mass, shapes }) => (
        <mesh key={mass.id} position={[0, mass.baseM, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={5} raycast={() => null}>
          <extrudeGeometry args={[shapes, { depth: mass.floors * mass.floorHeightM + 0.02, bevelEnabled: false }]} />
          <meshBasicMaterial color={MODEL_COLORS.invalid} transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}

      {selected && (
        <Html position={[centroid(selected.footprint).x, massTop(selected) + (topView ? 0.5 : 1.6), centroid(selected.footprint).z]} center zIndexRange={[2, 0]} style={{ pointerEvents: 'none' }}>
          <div data-testid="mass-label" className="whitespace-nowrap rounded-md border border-ink/10 bg-graphite-800/95 px-2 py-1 text-[11px] font-semibold text-ink shadow-sm">
            {selected.name} <span className="font-mono font-normal tabular-nums text-muted">· {selected.floors} fl · {massTop(selected).toFixed(1)} m</span>
          </div>
        </Html>
      )}

      {selected && !readOnly && !topView && (
        <group position={[centroid(selected.footprint).x, massTop(selected) + 0.5, centroid(selected.footprint).z]}>
          <mesh
            name={`mass-pushpull-${selected.id}`}
            onPointerDown={beginDrag(selected, { type: 'height' })}
            {...dragHandlers}
            onPointerOver={setCursor('ns-resize')}
            onPointerOut={setCursor('')}
          >
            <coneGeometry args={[0.6, 1.2, 20]} />
            <meshBasicMaterial color={EDITOR_PALETTE.selection} depthTest={false} />
          </mesh>
        </group>
      )}

      {selected && !readOnly && topView &&
        selected.footprint.map((p, index) => (
          <HandleMark
            key={index}
            name={`mass-corner-${selected.id}-${index}`}
            position={[p.x, massTop(selected) + 0.3, p.z]}
            size={HANDLE_PX * metre}
            round
            onPointerDown={beginDrag(selected, { type: 'corner', index })}
            {...dragHandlers}
            onPointerOver={setCursor('move')}
            onPointerOut={setCursor('')}
          />
        ))}

      {topView && !readOnly && <DrawTool masses={masses} y={Math.max(1, ...masses.map(massTop)) + 0.5} />}
    </group>
  )
}

interface MassBodyProps {
  mass: Mass
  selected: boolean
  focused: boolean
  invalid: boolean
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void
  onPointerCancel?: (event: ThreeEvent<PointerEvent>) => void
  onPointerOver: () => void
  onPointerOut: () => void
}

function MassBody({ mass, selected, focused, invalid, ...events }: MassBodyProps) {
  const height = mass.floors * mass.floorHeightM
  const shape = useMemo(() => ringsToShape(mass.footprint), [mass.footprint])
  // Slab edges at every floor, in world space, as one line-segments buffer.
  const slabs = useMemo(() => {
    const pts: number[] = []
    for (let f = 1; f < mass.floors; f++) {
      const y = mass.baseM + f * mass.floorHeightM
      mass.footprint.forEach((a, i) => {
        const b = mass.footprint[(i + 1) % mass.footprint.length]
        pts.push(a.x, y, a.z, b.x, y, b.z)
      })
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return geometry
  }, [mass.footprint, mass.floors, mass.floorHeightM, mass.baseM])
  useEffect(() => () => slabs.dispose(), [slabs])

  const edge = selected ? EDITOR_PALETTE.selection : invalid ? MODEL_COLORS.invalid : MODEL_COLORS.edge
  const fill = invalid ? OFFENDING : selected ? MODEL_COLORS.wallSelected : MODEL_COLORS.wall
  return (
    <group>
      <mesh name={`mass-${mass.id}`} position={[0, mass.baseM, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow {...events}>
        <extrudeGeometry args={[shape, { depth: height, bevelEnabled: false }]} />
        <meshStandardMaterial color={fill} roughness={0.9} metalness={0} />
        <Edges threshold={20} color={edge} lineWidth={selected ? 2 : 1} />
      </mesh>
      {focused && <Line name={`focus-ring-${mass.id}`} points={[...mass.footprint, mass.footprint[0]].map((p) => [p.x, massTop(mass) + 0.05, p.z] as [number, number, number])} color={EDITOR_PALETTE.selection} lineWidth={4} />}
      <lineSegments geometry={slabs} raycast={() => null}>
        <lineBasicMaterial color={invalid ? MODEL_COLORS.invalid : MODEL_COLORS.floorEdge} />
      </lineSegments>
    </group>
  )
}

/**
 * Top view draw tool: drag a rectangle, or click polygon corners (click the
 * first corner, double-click or Enter to close; Esc cancels). Listens on the
 * canvas element in the capture phase so rooms and masses under the cursor
 * don't react; right / middle drag still pans.
 */
function DrawTool({ masses, y }: { masses: Mass[]; y: number }) {
  const drawMode = useMassUi((s) => s.drawMode)
  const setDrawMode = useMassUi((s) => s.setDrawMode)
  const select = useMassUi((s) => s.select)
  const get = useThree((s) => s.get)
  const [points, setPoints] = useState<SitePoint[]>([])
  const [hover, setHover] = useState<SitePoint | null>(null)
  const massesRef = useRef(masses)
  massesRef.current = masses

  useEffect(() => {
    setPoints([])
    setHover(null)
    if (!drawMode) return
    const { gl } = get()
    const el = gl.domElement
    el.style.cursor = 'crosshair'
    let pts: SitePoint[] = []
    let dragging = false
    const update = (next: SitePoint[]) => { pts = next; setPoints(next) }
    const ground = (event: MouseEvent): SitePoint | null => {
      const { camera, raycaster } = get()
      const r = el.getBoundingClientRect()
      const ndc = new THREE.Vector2(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(GROUND, hit)) return null
      const { snapToGrid, gridSize } = useCanvasStore.getState()
      return { x: snap(hit.x, gridSize, snapToGrid), z: snap(hit.z, gridSize, snapToGrid) }
    }
    const create = (footprint: SitePoint[]) => {
      update([])
      if (polygonArea(footprint) < 1) return
      const current = massesRef.current
      const mass = makeMass(current, footprint)
      useCanvasStore.getState().setMasses([...current, mass])
      select(mass.id)
      setDrawMode(null)
    }
    const ours = (event: MouseEvent) => event.target === el && event.button === 0
    const down = (event: PointerEvent) => {
      if (!ours(event)) return
      event.stopPropagation()
      const p = ground(event)
      if (!p) return
      if (drawMode === 'rect') {
        dragging = true
        update([p, p])
        return
      }
      const first = pts[0]
      const closeEnough = first && Math.hypot(first.x - p.x, first.z - p.z) < Math.max(0.3, useCanvasStore.getState().gridSize)
      if (pts.length >= 3 && closeEnough) create(pts)
      else update([...pts, p])
    }
    const move = (event: PointerEvent) => {
      if (event.target !== el) return
      const p = ground(event)
      if (!p) return
      if (dragging) update([pts[0], p])
      else setHover(p)
    }
    const up = (event: PointerEvent) => {
      if (!dragging || event.button !== 0) return
      event.stopPropagation()
      dragging = false
      create(rectPoints(pts[0], pts[1]))
    }
    const dbl = (event: MouseEvent) => {
      if (!ours(event)) return
      event.stopPropagation()
      // The double-click's second press already added a duplicate corner.
      if (drawMode === 'poly' && pts.length >= 4) create(pts.slice(0, -1))
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        update([])
        setDrawMode(null)
      } else if (event.key === 'Enter' && drawMode === 'poly' && pts.length >= 3) create(pts)
    }
    const swallow = (event: MouseEvent) => { if (ours(event)) event.stopPropagation() }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('click', swallow, true)
    window.addEventListener('dblclick', dbl, true)
    window.addEventListener('keydown', key)
    return () => {
      el.style.cursor = ''
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('click', swallow, true)
      window.removeEventListener('dblclick', dbl, true)
      window.removeEventListener('keydown', key)
    }
  }, [drawMode, get, select, setDrawMode])

  if (!drawMode) return null
  const outline =
    drawMode === 'rect' ? (points.length === 2 ? rectPoints(points[0], points[1]) : []) : hover ? [...points, hover] : points
  const at = (p: SitePoint) => [p.x, y, p.z] as [number, number, number]
  return (
    <group name="mass-draw">
      {outline.length >= 2 && (
        <Line points={[...outline, ...(drawMode === 'rect' ? [outline[0]] : [])].map(at)} color={EDITOR_PALETTE.selection} lineWidth={2} dashed={drawMode === 'poly'} dashSize={0.4} gapSize={0.2} />
      )}
      {points.map((p, i) => (
        <mesh key={i} position={at(p)} rotation={[-Math.PI / 2, 0, 0]} renderOrder={31} raycast={() => null}>
          <circleGeometry args={[0.25, 16]} />
          <meshBasicMaterial color={EDITOR_PALETTE.selection} depthTest={false} />
        </mesh>
      ))}
    </group>
  )
}
