/**
 * The site in the 3D workspace: boundary, buildable envelope (dashed, subtly
 * filled), per-edge setback labels and corner grips in Top view, an optional
 * height-limit cap, and the "Draw site" tool.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { useCanvasStore } from '../store/canvasStore'
import { MODEL_COLORS } from '../components/canvas/modelView'
import { EDITOR_PALETTE } from '../components/canvas/editorPalette'
import { snappedCoord } from '../components/canvas/plan2dGeometry'
import { usePixelsPerMetre } from '../components/canvas/TopPlanOverlay'
import { buildableEnvelope, type Region } from './siteGeometry'
import { parseSite, type Site, type SitePoint } from './siteTypes'
import { edgeLabels, frontEdgeIndex, moveCorner, streetDirection, withBoundary } from './siteEdit'
import { drawStep } from './drawTool'
import { useSiteUi } from './siteUiStore'

/** Just above Scene's site ground (-0.2) and plot outline (-0.16). */
const GROUND_LINE_Y = -0.14
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const ENVELOPE = '#3f7f6a'
const HANDLE_PX = 11

const at = (p: SitePoint, y: number): [number, number, number] => [p.x, y, p.z]
const closed = (pts: SitePoint[], y: number) => [...pts, pts[0]].map((p) => at(p, y))
const ringPts = (ring: [number, number][]) => ring.slice(0, -1).map(([x, z]) => ({ x, z }))

/** Flat geometry for a region; shape space (x, -z) rotated onto the ground. */
function useRegionGeometry(region: Region) {
  const geometry = useMemo(() => {
    const shapes = region.map(([outer, ...holes]) => {
      const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)))
      shape.holes = holes.map((hole) => new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))))
      return shape
    })
    return new THREE.ShapeGeometry(shapes)
  }, [region])
  useEffect(() => () => geometry.dispose(), [geometry])
  return geometry
}

interface SiteLayerProps {
  orbitRef: RefObject<{ enabled: boolean }>
  readOnly: boolean
  topView: boolean
  /** Height Top-view annotations float at (above everything on the level). */
  planY: number
}

export function SiteLayer({ orbitRef, readOnly, topView, planY }: SiteLayerProps) {
  const raw = useCanvasStore((s) => s.layoutMetadata.site)
  const orientation = useCanvasStore((s) => s.layoutMetadata.orientation)
  const requirements = useCanvasStore((s) => s.layoutMetadata.mvpRequirements)
  const stored = useMemo(() => parseSite(raw), [raw])
  const [preview, setPreview] = useState<Site | null>(null)
  const site = preview ?? stored
  const drawing = useSiteUi((s) => s.drawing) && topView && !readOnly
  const setDrawing = useSiteUi((s) => s.setDrawing)

  useEffect(() => {
    if (!topView && useSiteUi.getState().drawing) setDrawing(false)
  }, [topView, setDrawing])

  const front = useMemo(
    () => (site ? frontEdgeIndex(site.boundary, streetDirection({ orientation, mvpRequirements: requirements })) : null),
    [site, orientation, requirements],
  )

  return (
    <group name="site-layer">
      {site && (
        <SiteDrawing
          site={site}
          front={front}
          topView={topView}
          planY={planY}
          editable={topView && !readOnly && !drawing}
          orbitRef={orbitRef}
          onPreview={setPreview}
        />
      )}
      {drawing && <DrawTool planY={planY} current={stored} />}
    </group>
  )
}

interface SiteDrawingProps {
  site: Site
  front: number | null
  topView: boolean
  planY: number
  editable: boolean
  orbitRef: RefObject<{ enabled: boolean }>
  onPreview: (site: Site | null) => void
}

function SiteDrawing({ site, front, topView, planY, editable, orbitRef, onPreview }: SiteDrawingProps) {
  const hoveredEdge = useSiteUi((s) => s.hoveredEdge)
  const showHeightCap = useSiteUi((s) => s.showHeightCap)
  const envelope = useMemo(() => {
    try {
      return buildableEnvelope(site)
    } catch {
      return [] // a clipping failure must never take the canvas down
    }
  }, [site])
  const envelopeGeometry = useRegionGeometry(envelope)
  const lineY = topView ? planY : GROUND_LINE_Y
  const { boundary, rules } = site
  const hovered = hoveredEdge !== null && hoveredEdge < boundary.length ? hoveredEdge : null
  const cap = !topView && showHeightCap && rules.maxHeightM ? rules.maxHeightM : null

  return (
    <>
      <Line name="site-boundary" points={closed(boundary, lineY)} color={MODEL_COLORS.plotLine} lineWidth={2} />
      <mesh geometry={envelopeGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_LINE_Y - 0.01, 0]} raycast={() => null}>
        <meshBasicMaterial color={ENVELOPE} transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {envelope.flatMap((polygon, p) =>
        polygon.map((ring, r) => (
          <Line
            key={`env-${p}-${r}`}
            name="site-envelope"
            points={closed(ringPts(ring), lineY + 0.01)}
            color={ENVELOPE}
            lineWidth={1.4}
            dashed
            dashSize={0.5}
            gapSize={0.3}
          />
        )),
      )}
      {hovered !== null && (
        <Line
          name="site-edge-highlight"
          points={[at(boundary[hovered], lineY + 0.02), at(boundary[(hovered + 1) % boundary.length], lineY + 0.02)]}
          color={EDITOR_PALETTE.selection}
          lineWidth={5}
        />
      )}
      {cap !== null && <HeightCap envelope={envelope.length ? envelope : [[[...boundary.map((p) => [p.x, p.z] as [number, number]), [boundary[0].x, boundary[0].z]]]]} height={cap} />}
      {topView &&
        edgeLabels(site).map((label) => (
          <Html key={label.index} position={at(label.point, planY)} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
            <span
              data-testid={`site-setback-${label.index}`}
              className="block whitespace-nowrap rounded-sm px-1 font-mono text-[10px] tabular-nums"
              style={{
                color: label.index === hovered ? EDITOR_PALETTE.selection : ENVELOPE,
                background: 'rgba(255,255,255,0.8)',
                fontWeight: label.index === hovered ? 700 : 500,
              }}
            >
              {label.index === front ? 'Front · ' : ''}
              {label.text}
            </span>
          </Html>
        ))}
      {editable && <CornerGrips site={site} y={planY + 0.3} orbitRef={orbitRef} onPreview={onPreview} />}
    </>
  )
}

function HeightCap({ envelope, height }: { envelope: Region; height: number }) {
  const geometry = useRegionGeometry(envelope)
  return (
    <group name="site-height-cap">
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, height, 0]} raycast={() => null}>
        <meshBasicMaterial color={ENVELOPE} transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {envelope.map(([outer], i) => {
        const pts = ringPts(outer)
        return (
          <group key={i}>
            <Line points={closed(pts, height)} color={ENVELOPE} lineWidth={1} transparent opacity={0.6} dashed dashSize={0.4} gapSize={0.3} />
            {pts.map((p, j) => (
              <Line key={j} points={[at(p, GROUND_LINE_Y), at(p, height)]} color={ENVELOPE} lineWidth={0.6} transparent opacity={0.35} />
            ))}
          </group>
        )
      })}
    </group>
  )
}

function snap(point: THREE.Vector3): SitePoint {
  const { snapToGrid, gridSize } = useCanvasStore.getState()
  const mm = (v: number) => Math.round(v * 1000) / 1000
  return { x: mm(snappedCoord(point.x, snapToGrid, gridSize)), z: mm(snappedCoord(point.z, snapToGrid, gridSize)) }
}

/** Corner grips: drag previews locally, release commits one undo step. */
function CornerGrips({ site, y, orbitRef, onPreview }: { site: Site; y: number; orbitRef: RefObject<{ enabled: boolean }>; onPreview: (site: Site | null) => void }) {
  const gl = useThree((s) => s.gl)
  const size = HANDLE_PX / usePixelsPerMetre()
  const drag = useRef<{ pointerId: number; index: number; start: Site; current: Site } | null>(null)

  const end = () => {
    drag.current = null
    onPreview(null)
    if (orbitRef.current) orbitRef.current.enabled = true
  }

  useEffect(() => {
    const cancel = () => drag.current && end()
    window.addEventListener('archiai:cancel-canvas-interaction', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('archiai:cancel-canvas-interaction', cancel)
      window.removeEventListener('blur', cancel)
    }
  }, [])

  const down = (index: number) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const stored = parseSite(useCanvasStore.getState().layoutMetadata.site)
    if (!stored) return
    drag.current = { pointerId: event.pointerId, index, start: stored, current: stored }
    if (orbitRef.current) orbitRef.current.enabled = false
    ;(event.target as Element | null)?.setPointerCapture?.(event.pointerId)
  }
  const move = (event: ThreeEvent<PointerEvent>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    const hit = new THREE.Vector3()
    if (!event.ray.intersectPlane(GROUND, hit)) return
    active.current = moveCorner(active.start, active.index, snap(hit))
    onPreview(active.current)
  }
  const up = (event: ThreeEvent<PointerEvent>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    event.stopPropagation()
    ;(event.target as Element | null)?.releasePointerCapture?.(event.pointerId)
    if (event.type === 'pointerup' && active.current !== active.start) useCanvasStore.getState().setSite(active.current)
    end()
  }

  return (
    <>
      {site.boundary.map((p, index) => (
        <group key={index} position={at(p, y)}>
          <mesh
            name={`site-corner-${index}`}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={31}
            onPointerDown={down(index)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerOver={() => { gl.domElement.style.cursor = 'move' }}
            onPointerOut={() => { gl.domElement.style.cursor = '' }}
          >
            <circleGeometry args={[size / 2, 20]} />
            <meshBasicMaterial color={ENVELOPE} depthTest={false} transparent />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={30} raycast={() => null}>
            <circleGeometry args={[(size * 1.35) / 2, 20]} />
            <meshBasicMaterial color="#ffffff" depthTest={false} transparent />
          </mesh>
        </group>
      ))}
    </>
  )
}

/**
 * Click to add corners, click the first corner or double-click to close,
 * Escape to cancel. Listens on the window in the capture phase so rooms and
 * orbit controls under the cursor do not also react to the left button.
 */
function DrawTool({ planY, current }: { planY: number; current: Site | null }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const [points, setPoints] = useState<SitePoint[]>([])
  const [cursor, setCursor] = useState<SitePoint | null>(null)
  const pointsRef = useRef(points)
  pointsRef.current = points

  useEffect(() => {
    const canvas = gl.domElement
    const raycaster = new THREE.Raycaster()
    const toGround = (event: MouseEvent): SitePoint | null => {
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = new THREE.Vector3()
      return raycaster.ray.intersectPlane(GROUND, hit) ? snap(hit) : null
    }
    const apply = (result: ReturnType<typeof drawStep>) => {
      if (result.status === 'drawing') setPoints(result.points)
      else {
        if (result.status === 'closed') useCanvasStore.getState().setSite(withBoundary(current, result.boundary))
        useSiteUi.getState().setDrawing(false)
      }
    }
    const onDown = (event: PointerEvent) => {
      if (event.target !== canvas || event.button !== 0) return
      event.stopPropagation()
      const point = toGround(event)
      if (point) apply(drawStep(pointsRef.current, { type: 'click', point, tolerance: 10 / Math.max(camera.zoom, 1e-3) }))
    }
    const onDouble = (event: MouseEvent) => {
      if (event.target !== canvas) return
      event.stopPropagation()
      apply(drawStep(pointsRef.current, { type: 'doubleClick' }))
    }
    const onMove = (event: PointerEvent) => {
      if (event.target === canvas) setCursor(toGround(event))
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      apply(drawStep(pointsRef.current, { type: 'cancel' }))
    }
    canvas.style.cursor = 'crosshair'
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('dblclick', onDouble, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      canvas.style.cursor = ''
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('dblclick', onDouble, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [camera, gl, current])

  const y = planY + 0.2
  const rubber = cursor && points.length ? [...points, cursor] : points
  return (
    <group name="site-draw">
      {rubber.length >= 2 && <Line points={rubber.map((p) => at(p, y))} color={EDITOR_PALETTE.selection} lineWidth={2} />}
      {points.map((p, i) => (
        <mesh key={i} position={at(p, y)} rotation={[-Math.PI / 2, 0, 0]} renderOrder={31} raycast={() => null}>
          <circleGeometry args={[i === 0 ? 0.35 : 0.22, 20]} />
          <meshBasicMaterial color={EDITOR_PALETTE.selection} depthTest={false} transparent />
        </mesh>
      ))}
      {cursor && (
        <Html position={at(cursor, y)} zIndexRange={[1, 0]} style={{ pointerEvents: 'none', transform: 'translate(12px, 12px)' }}>
          <span className="whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-graphite-900 shadow-sm">
            {points.length < 3 ? 'Click to add corners · Esc to cancel' : 'Click first corner or double-click to close'}
          </span>
        </Html>
      )}
    </group>
  )
}
