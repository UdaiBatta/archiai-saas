import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useCanvasStore } from '../store/canvasStore'
import { MODEL_COLORS } from '../components/canvas/modelView'
import { useSiteUi } from './siteUiStore'
import { OSM_CREDIT, parseSiteContext } from './surroundings'

/**
 * Surrounding buildings as plain grey massing (Site Atlas context): every
 * building merged into one mesh and one edge buffer, so a few hundred
 * neighbours cost two draw calls. Not pickable.
 */
export function ContextLayer() {
  const raw = useCanvasStore((s) => s.layoutMetadata.siteContext)
  const show = useSiteUi((s) => s.showContext)
  const context = useMemo(() => parseSiteContext(raw), [raw])
  const { body, edges } = useMemo(() => {
    if (!context?.buildings.length) return { body: null, edges: null }
    const parts = context.buildings.map((b) => {
      const shape = new THREE.Shape(b.footprint.map((p) => new THREE.Vector2(p.x, -p.z)))
      const g = new THREE.ExtrudeGeometry(shape, { depth: b.heightM, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      return g
    })
    const merged = mergeGeometries(parts, false)
    parts.forEach((g) => g.dispose())
    if (!merged) return { body: null, edges: null }
    return { body: merged, edges: new THREE.EdgesGeometry(merged, 25) }
  }, [context])
  useEffect(() => () => { body?.dispose(); edges?.dispose() }, [body, edges])
  if (!show || !body || !edges) return null
  return (
    <group name="site-context">
      <mesh geometry={body} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color={MODEL_COLORS.context} roughness={0.95} metalness={0} />
      </mesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={MODEL_COLORS.contextEdge} />
      </lineSegments>
    </group>
  )
}

/** OpenStreetMap credit (ODbL), shown over the canvas while context is drawn. */
export function ContextCredit() {
  const raw = useCanvasStore((s) => s.layoutMetadata.siteContext)
  const show = useSiteUi((s) => s.showContext)
  const count = useMemo(() => parseSiteContext(raw)?.buildings.length ?? 0, [raw])
  if (!show || !count) return null
  return (
    <span className="pointer-events-none absolute bottom-[100px] right-3 z-10 text-[10px] text-muted-light">{OSM_CREDIT}</span>
  )
}
