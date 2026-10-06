import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, Grid, Html, Line, Edges, GizmoHelper, GizmoViewcube } from '@react-three/drei'
import * as THREE from 'three'
import { CanvasViewMode, useCanvasStore } from '../../store/canvasStore'
import { canClearSelectionFromEmptyCanvas } from '../../store/interactionModel'
import { edgeCardinals, northAngleDeg, parseOrientation, type ScreenEdge } from './orientationModel'
import { sunAt } from './sunModel'
import { useSunContext } from '../../analysis/sunStore'
import { MODEL_COLORS, presetView, sceneExtent, shadowFrustum, type CameraPreset } from './modelView'
import { parseMasses, parseSite } from '../../site/siteTypes'

/** Site ground sits below floor level so the ground-floor slab reads as a plinth. */
const GROUND_Y = -0.2

interface OrbitHandle {
  enabled: boolean
  target?: THREE.Vector3
  update?: () => void
}

interface SceneProps {
  orbitRef: RefObject<OrbitHandle>
  readOnly?: boolean
  viewMode?: CanvasViewMode
  modelStage?: boolean
  /** Time of day for the 3D sun (06:00-18:00). */
  sunHour?: number
  /** Camera preset for the 3D view (ignored by the plan lenses). */
  preset?: CameraPreset
  /** Architectural site presentation: white model, site ground, AO-ready lighting. */
  site?: boolean
  /** Level to show instead of the store's selection (Top view shows one level). */
  level?: number | 'all'
  /** Bumped to re-frame the camera on demand (re-clicking a preset). */
  frameNonce?: number
  /** What the camera frames: the building's rooms (plot when absent). */
  focus?: { x: number; z: number; w: number; d: number } | null
}

export function Scene({ orbitRef, readOnly = false, viewMode = '3d', modelStage = false, sunHour = 10, preset = 'perspective', site = false, level, frameNonce = 0, focus = null }: SceneProps) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const viewportSize = useThree((s) => s.size)
  const floors = useCanvasStore((s) => s.floors)
  const storedFloor = useCanvasStore((s) => s.selectedFloor)
  const selectedFloor = level ?? storedFloor
  const measurePoints = useCanvasStore((s) => s.measurePoints)
  // Narrow selectors: other metadata (quality, saved views) must not re-render the scene.
  const orientationMeta = useCanvasStore((s) => s.layoutMetadata.orientation)
  const mvpFootprint = useCanvasStore((s) => s.layoutMetadata.mvpFootprint)
  const siteMeta = useCanvasStore((s) => s.layoutMetadata.site)
  const massMeta = useCanvasStore((s) => s.layoutMetadata.masses)
  const orientation = useMemo(() => parseOrientation({ orientation: orientationMeta }), [orientationMeta])
  const visibleFloors =
    selectedFloor === 'all'
      ? floors
      : floors.filter((floor) => floor.level === selectedFloor)
  const isPlanView = viewMode !== '3d'
  const studio = site && !isPlanView
  const topView = !isPlanView && preset === 'top'
  const mouseButtons = isPlanView
    ? { LEFT: undefined, MIDDLE: undefined, RIGHT: THREE.MOUSE.PAN }
    : topView
      ? { LEFT: undefined, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: undefined, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }
  // Floor slab: thin in plan view, thicker in 3D so multi-floor separation is visible
  const slabHeight = isPlanView ? 0.06 : 0.45
  const isMultiFloor = floors.length > 1
  const floorHeight = useCanvasStore((s) => s.floorHeight)
  const buildingTop = Math.max(0, ...floors.map((floor) => floor.elevation)) + floorHeight
  // Frame the active level on entry; editing a room must not reset the camera.
  const footprint = visibleFloors[0]?.footprint
  const siteModel = useMemo(() => parseSite(siteMeta), [siteMeta])
  const masses = useMemo(() => parseMasses(massMeta), [massMeta])
  // Everything on the site: plot, site boundary, masses. Plan lenses keep
  // framing the floor itself.
  const extent = useMemo(
    () => footprint && (studio ? sceneExtent(focus ?? footprint, buildingTop, siteModel, masses) : { ...footprint, h: buildingTop }),
    [footprint, focus, studio, buildingTop, siteModel, masses],
  )
  // Reframe when the site changes, not on every mass edit (that would jump
  // the camera mid push/pull).
  const siteKey = siteModel ? siteModel.boundary.map((p) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(';') : ''
  const framingKey = `${frameNonce}:${selectedFloor}:${viewMode}:${modelStage}:${preset}:${footprint?.w ?? 0}:${footprint?.d ?? 0}:${siteKey}`
  useEffect(() => {
    if (!extent) return
    const bounds = extent
    const elevation = visibleFloors[0]?.elevation ?? 0
    // Studio chrome: 48 px top bar; dock + status bar take ~112 px at the bottom.
    const insets = studio ? { top: 56, bottom: 120 } : { top: 0, bottom: 0 }
    const view = presetView(isPlanView ? 'perspective' : preset, bounds, viewportSize, elevation, insets)
    if (isPlanView) {
      // Plan lenses: the old straight-down perspective framing.
      const distance = view.position[1] - elevation
      view.position = [view.target[0], elevation + distance * 1.7, view.target[2] + 0.01]
    }
    camera.position.set(...view.position)
    camera.zoom = view.zoom
    camera.updateProjectionMatrix()
    camera.lookAt(...view.target)
    orbitRef.current?.target?.set(...view.target)
    orbitRef.current?.update?.()
    // frameloop="demand": moving the camera here draws nothing by itself, so
    // the old view could stay on screen under the new view's labels.
    invalidate()
  }, [framingKey, camera, viewportSize.width, viewportSize.height])

  // The 3D sun: aimed at the house centre from where the sun is at
  // `sunHour`, with a shadow box fitted to the site so shadows stay crisp.
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const sun = sunAt(sunHour, useSunContext())
  const centerX = extent ? extent.x + extent.w / 2 : 0
  const centerZ = extent ? extent.z + extent.d / 2 : 0
  const shadow = shadowFrustum({ x: 0, z: 0, w: extent?.w ?? 10, d: extent?.d ?? 10, h: extent?.h ?? buildingTop })
  useEffect(() => {
    const light = sunRef.current
    if (!light) return
    light.target.position.set(centerX, 0, centerZ)
    light.target.updateMatrixWorld()
    light.shadow.camera.updateProjectionMatrix()
  }, [centerX, centerZ, shadow.radius])

  // The building's own outline on the plot (the engine sizes it inside the
  // plot); slabs use it so upper floors are not plot-sized in the model.
  const building = mvpFootprint as { x: number; y: number; w: number; h: number } | undefined
  const orientationNorth = orientation ? THREE.MathUtils.degToRad(northAngleDeg(orientation)) : 0

  // Distinct floor slab colours so stacked floors are visually separable
  const floorSlabColor = (level: number) => {
    if (modelStage) return '#e8e5dc'
    if (isPlanView) return '#26282D'
    const palette = ['#2E2E2F', '#343435', '#3A3A3B', '#404041']
    return palette[level % palette.length]
  }

  return (
    <>
      <ambientLight intensity={isPlanView ? 0.9 : studio ? 0.08 : 0.35} />
      {!isPlanView && (
        studio
          ? <hemisphereLight args={['#ffffff', '#c8c6c0', 1.35]} />
          : <hemisphereLight args={['#BDBDC0', '#26282D', 0.45]} />
      )}
      <directionalLight
        ref={sunRef}
        position={
          isPlanView
            ? [10, 20, 10]
            : [centerX + sun.direction[0] * shadow.distance, sun.direction[1] * shadow.distance, centerZ + sun.direction[2] * shadow.distance]
        }
        color={isPlanView ? '#ffffff' : sun.color}
        intensity={isPlanView ? 0.55 : studio ? sun.intensity * 1.9 : sun.intensity}
        castShadow={!isPlanView && !topView}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
        shadow-normalBias={0.03}
        shadow-radius={studio ? 4 : 1}
        shadow-camera-left={-shadow.radius}
        shadow-camera-right={shadow.radius}
        shadow-camera-top={shadow.radius}
        shadow-camera-bottom={-shadow.radius}
        shadow-camera-near={shadow.near}
        shadow-camera-far={shadow.far}
      />
      {!isPlanView && preset !== 'perspective' && <OrthographicCamera makeDefault near={0.1} far={2000} />}

      {visibleFloors.map((floor) => {
        const plot = floor.footprint
        if (!plot || !plot.w || !plot.d) return null
        // Studio: slabs follow the building outline; otherwise the floor footprint.
        const footprint = studio && building?.w && building.h
          ? { x: building.x, z: building.y, w: building.w, d: building.h }
          : plot
        const centerX = footprint.x + footprint.w / 2
        const centerZ = footprint.z + footprint.d / 2
        const slabY = floor.elevation - slabHeight / 2
        return (
          <group key={floor.id}>
            {/* Floor slab */}
            <mesh position={[centerX, slabY, centerZ]} raycast={() => null} castShadow={studio} receiveShadow>
              <boxGeometry args={[footprint.w, slabHeight, footprint.d]} />
              {studio ? (
                <meshStandardMaterial color={MODEL_COLORS.slab} roughness={0.95} />
              ) : (
                <meshStandardMaterial
                  color={floorSlabColor(floor.level)}
                  transparent
                  opacity={isPlanView ? 0.97 : 0.92}
                  roughness={0.82}
                  metalness={0.04}
                />
              )}
              <Edges color={studio ? MODEL_COLORS.edge : floor.level === 0 ? '#909094' : '#6A6A6E'} />
            </mesh>

            {/* Ceiling plane between floors (only in 3D multi-floor mode) */}
            {!isPlanView && !studio && isMultiFloor && floor.level > 0 && (
              <mesh
                position={[centerX, floor.elevation - 0.01, centerZ]}
                rotation={[-Math.PI / 2, 0, 0]}
                raycast={() => null}
              >
                <planeGeometry args={[footprint.w, footprint.d]} />
                <meshStandardMaterial
                  color="#48484A"
                  transparent
                  opacity={0.3}
                  side={2}
                />
              </mesh>
            )}
          </group>
        )
      })}

      {studio && footprint && (
        <SiteGround
          plot={footprint}
          showPlot={!siteModel}
          northAngle={orientationNorth}
          fadeDistance={shadow.radius * 8}
          ortho={preset !== 'perspective'}
        />
      )}

      {/* Orientation markers: cardinal letters at the footprint edges, the
          facing edge labelled as Front — same mapping as the 2D plan. */}
      {orientation &&
        (() => {
          const ground =
            visibleFloors.find((floor) => floor.footprint?.w) ??
            floors.find((floor) => floor.footprint?.w)
          const footprint = ground?.footprint
          if (!footprint) return null
          const cardinals = edgeCardinals(orientation)
          const facing = orientation.facingDirection ?? orientation.entrySide
          const midX = footprint.x + footprint.w / 2
          const midZ = footprint.z + footprint.d / 2
          const pad = 1.6
          const positions: Record<ScreenEdge, [number, number, number]> = {
            top: [midX, 0.05, footprint.z - pad],
            bottom: [midX, 0.05, footprint.z + footprint.d + pad],
            left: [footprint.x - pad, 0.05, midZ],
            right: [footprint.x + footprint.w + pad, 0.05, midZ],
          }
          return (
            <>
              {(Object.keys(positions) as ScreenEdge[]).map((edge) => {
                const isFacing = cardinals[edge] === facing
                const isRoad = cardinals[edge] === orientation.roadSide
                return (
                  <Html
                    key={edge}
                    position={positions[edge]}
                    center
                    zIndexRange={[1, 0]}
                    style={{ pointerEvents: 'none' }}
                  >
                    <span
                      className={`whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        isFacing
                          ? 'bg-ink text-graphite-900'
                          : 'bg-graphite-800/80 text-muted'
                      }`}
                    >
                      {cardinals[edge]}
                      {isFacing ? ' · FRONT' : ''}
                      {isRoad ? ' · ROAD' : ''}
                    </span>
                  </Html>
                )
              })}
            </>
          )
        })()}

      {!studio && <Grid
        args={[40, 40]}
        position={[0, 0, 0]}
        cellColor={isPlanView ? '#323233' : '#323233'}
        sectionColor={isPlanView ? '#464648' : '#464648'}
        fadeDistance={isPlanView ? 80 : 60}
        infiniteGrid={!isPlanView}
      />}

      <OrbitControls
        ref={orbitRef as RefObject<any>}
        makeDefault
        enableRotate={!isPlanView && !topView}
        enablePan
        enableZoom
        screenSpacePanning
        mouseButtons={mouseButtons}
      />
      {studio && !topView && (
        <GizmoHelper alignment="top-right" margin={[76, 160]} renderPriority={2}>
          <GizmoViewcube
            color={MODEL_COLORS.wall}
            textColor="#2f2e2b"
            strokeColor="#8a877f"
            hoverColor="#FF9A7A"
            opacity={0.95}
          />
        </GizmoHelper>
      )}

      {/* Invisible ground plane — click-to-place when a tool is armed,
          otherwise deselects when clicking empty canvas. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        onPointerDown={(event) => {
          if (readOnly) return
          const state = useCanvasStore.getState()
          if (event.button === 0 && state.measureMode) {
            event.stopPropagation()
            state.addMeasurePoint(event.point.x, event.point.z)
            return
          }
          if (event.button === 0 && state.placementMode) {
            event.stopPropagation()
            state.addObjectAt(state.placementMode, event.point.x, event.point.z)
            return
          }

          const shouldClear = canClearSelectionFromEmptyCanvas({
            interactionMode: state.interactionMode,
            pointerIntent: state.pointerIntent,
            placementArmed: state.placementMode !== null || state.interactionMode === 'place',
            measureActive:
              state.measureMode || state.interactionMode === 'measure' || state.showDimensions,
            cameraAction: event.button === 1 || event.button === 2,
            button: event.button,
          })
          if (shouldClear) {
            event.stopPropagation()
            state.deselectAll()
          }
        }}
      >
        <planeGeometry args={[200, 200]} />
        {/* Catches clicks only: it must not write depth, or the grid and site
            lines just below it vanish whenever it sorts before them (Persp/Axo). */}
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      {/* Tape measure — points, connecting line, and a distance label. */}
      {measurePoints.map((point, index) => (
        <mesh key={index} position={[point.x, 0.05, point.z]} raycast={() => null}>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial color="#C9A96E" emissive="#C9A96E" emissiveIntensity={0.4} />
        </mesh>
      ))}
      {measurePoints.length === 2 && (
        <>
          <Line
            points={[
              [measurePoints[0].x, 0.05, measurePoints[0].z],
              [measurePoints[1].x, 0.05, measurePoints[1].z],
            ]}
            color="#C9A96E"
            lineWidth={2}
          />
          <Html
            position={[
              (measurePoints[0].x + measurePoints[1].x) / 2,
              0.3,
              (measurePoints[0].z + measurePoints[1].z) / 2,
            ]}
            center
            style={{ pointerEvents: 'none' }}
          >
            <div className="whitespace-nowrap rounded bg-warn px-2 py-0.5 text-[11px] font-semibold text-graphite-900 shadow">
              {Math.hypot(
                measurePoints[1].x - measurePoints[0].x,
                measurePoints[1].z - measurePoints[0].z,
              ).toFixed(2)}
              {' m'}
            </div>
          </Html>
        </>
      )}
    </>
  )
}

const ringPoints = Array.from({ length: 49 }, (_, i) => {
  const angle = (i / 48) * Math.PI * 2
  return [Math.cos(angle), 0, Math.sin(angle)] as [number, number, number]
})

/** Site context under the model: shadow-catching ground with a faint metre
 * grid, the plot pad and boundary, and a north arrow off the plot corner. */
function SiteGround({
  plot,
  showPlot,
  northAngle,
  fadeDistance,
  ortho,
}: {
  plot: { x: number; z: number; w: number; d: number }
  /** Off once a site is drawn: the site layer draws the real boundary. */
  showPlot: boolean
  northAngle: number
  fadeDistance: number
  /** Axo/Top: the camera sits far off, so fog and the grid's camera-based
   * fade would wash the ground out to the sky colour. */
  ortho: boolean
}) {
  const cx = plot.x + plot.w / 2
  const cz = plot.z + plot.d / 2
  const x0 = plot.x, x1 = plot.x + plot.w, z0 = plot.z, z1 = plot.z + plot.d
  const size = Math.min(4, Math.max(1.2, Math.max(plot.w, plot.d) * 0.08))
  const offset = size * 2.2
  // Classic split north arrow in shape space (+y = north), laid on the ground.
  const [arrowDark, arrowLight] = useMemo(() => {
    const half = (side: number) => {
      const shape = new THREE.Shape()
      shape.moveTo(0, 1)
      shape.lineTo(side * 0.42, -0.62)
      shape.lineTo(0, -0.3)
      shape.closePath()
      return new THREE.ShapeGeometry(shape)
    }
    return [half(-1), half(1)]
  }, [])
  useEffect(() => () => { arrowDark.dispose(); arrowLight.dispose() }, [arrowDark, arrowLight])

  return (
    <>
      {/* Fog must attach to the scene itself, so this component returns a fragment. */}
      {!ortho && <fog attach="fog" args={[MODEL_COLORS.sky, fadeDistance * 0.9, fadeDistance * 2.2]} />}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, GROUND_Y, cz]} receiveShadow raycast={() => null}>
        <planeGeometry args={[fadeDistance * 5, fadeDistance * 5]} />
        <meshStandardMaterial color={MODEL_COLORS.ground} roughness={1} />
      </mesh>
      {showPlot && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, GROUND_Y + 0.02, cz]} receiveShadow raycast={() => null}>
          <planeGeometry args={[plot.w, plot.d]} />
          <meshStandardMaterial color={MODEL_COLORS.plot} roughness={1} />
        </mesh>
      )}
      {/* A fixed patch centred on the plot: drei's infiniteGrid centres its
          patch under the camera, which in Axo sits far off to one side, so
          the grid missed the building entirely. */}
      <Grid
        position={[cx, GROUND_Y + 0.03, cz]}
        args={[fadeDistance * 2, fadeDistance * 2]}
        cellSize={1}
        sectionSize={5}
        cellThickness={0.6}
        sectionThickness={1}
        cellColor={MODEL_COLORS.gridCell}
        sectionColor={MODEL_COLORS.gridSection}
        fadeDistance={fadeDistance}
        fadeStrength={1.5}
        fadeFrom={ortho ? 0 : 1}
      />
      {showPlot && (
        <Line
          points={[[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, 0, z0]]}
          position={[0, GROUND_Y + 0.04, 0]}
          color={MODEL_COLORS.plotLine}
          lineWidth={1.6}
        />
      )}
      <group position={[x1 + offset, GROUND_Y + 0.04, z0 - offset]} rotation={[0, -northAngle, 0]} scale={size}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <mesh geometry={arrowDark} raycast={() => null}>
            <meshBasicMaterial color={MODEL_COLORS.plotLine} />
          </mesh>
          <mesh geometry={arrowLight} raycast={() => null}>
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
        <Line points={ringPoints} scale={0.78} color={MODEL_COLORS.plotLine} lineWidth={1} />
        {/* "N" beyond the tip (world -z is shape +y). */}
        <Line
          points={[[-0.2, 0, -1.25], [-0.2, 0, -1.7], [0.2, 0, -1.25], [0.2, 0, -1.7]]}
          color={MODEL_COLORS.plotLine}
          lineWidth={1.6}
        />
      </group>
    </>
  )
}
