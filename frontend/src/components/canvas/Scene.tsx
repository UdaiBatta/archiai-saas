import { useEffect, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { CanvasViewMode, useCanvasStore } from '../../store/canvasStore'
import { canClearSelectionFromEmptyCanvas } from '../../store/interactionModel'
import { edgeCardinals, parseOrientation, type ScreenEdge } from './orientationModel'

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
}

export function Scene({ orbitRef, readOnly = false, viewMode = '3d', modelStage = false }: SceneProps) {
  const camera = useThree((s) => s.camera)
  const viewportSize = useThree((s) => s.size)
  const floors = useCanvasStore((s) => s.floors)
  const selectedFloor = useCanvasStore((s) => s.selectedFloor)
  const measurePoints = useCanvasStore((s) => s.measurePoints)
  const layoutMetadata = useCanvasStore((s) => s.layoutMetadata)
  const orientation = parseOrientation(layoutMetadata)
  const visibleFloors =
    selectedFloor === 'all'
      ? floors
      : floors.filter((floor) => floor.level === selectedFloor)
  const isPlanView = viewMode !== '3d'
  const mouseButtons = isPlanView
    ? { LEFT: undefined, MIDDLE: undefined, RIGHT: THREE.MOUSE.PAN }
    : { LEFT: undefined, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN }
  // Floor slab: thin in plan view, thicker in 3D so multi-floor separation is visible
  const slabHeight = isPlanView ? 0.06 : 0.45
  const isMultiFloor = floors.length > 1
  // Frame the active level on entry; editing a room must not reset the camera.
  const footprint = visibleFloors[0]?.footprint
  const framingKey = `${selectedFloor}:${viewMode}:${modelStage}:${footprint?.w ?? 0}:${footprint?.d ?? 0}`
  useEffect(() => {
    if (!footprint) return
    const target = new THREE.Vector3(footprint.x + footprint.w / 2, visibleFloors[0]?.elevation ?? 0, footprint.z + footprint.d / 2)
    const portraitScale = Math.max(1, 0.95 * viewportSize.height / Math.max(viewportSize.width, 1))
    const distance = Math.max(footprint.w, footprint.d, 8) * 1.15 * portraitScale
    camera.position.copy(target).add(isPlanView ? new THREE.Vector3(0, distance * 1.7, 0.01) : new THREE.Vector3(distance * 0.8, distance, distance * 0.8))
    camera.lookAt(target)
    orbitRef.current?.target?.copy(target)
    orbitRef.current?.update?.()
  }, [framingKey, camera, viewportSize.width, viewportSize.height])

  // Distinct floor slab colours so stacked floors are visually separable
  const floorSlabColor = (level: number) => {
    if (modelStage) return '#e8e5dc'
    if (isPlanView) return '#26282D'
    const palette = ['#2E2E2F', '#343435', '#3A3A3B', '#404041']
    return palette[level % palette.length]
  }

  return (
    <>
      <ambientLight intensity={isPlanView ? 0.9 : 0.5} />
      {!isPlanView && (
        <hemisphereLight args={['#BDBDC0', '#26282D', 0.5]} />
      )}
      <directionalLight
        position={[10, 20, 10]}
        intensity={isPlanView ? 0.55 : 1.25}
        castShadow={!isPlanView}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0002}
      />

      {visibleFloors.map((floor) => {
        const footprint = floor.footprint
        if (!footprint || !footprint.w || !footprint.d) return null
        const centerX = footprint.x + footprint.w / 2
        const centerZ = footprint.z + footprint.d / 2
        const slabY = floor.elevation - slabHeight / 2
        const edgeGeometry = new THREE.BoxGeometry(footprint.w, slabHeight, footprint.d)
        return (
          <group key={floor.id}>
            {/* Floor slab */}
            <group position={[centerX, slabY, centerZ]}>
              <mesh raycast={() => null} receiveShadow>
                <boxGeometry args={[footprint.w, slabHeight, footprint.d]} />
                <meshStandardMaterial
                  color={floorSlabColor(floor.level)}
                  transparent
                  opacity={isPlanView ? 0.97 : 0.92}
                  roughness={0.82}
                  metalness={0.04}
                />
              </mesh>
              <lineSegments raycast={() => null}>
                <edgesGeometry args={[edgeGeometry]} />
                <lineBasicMaterial color={floor.level === 0 ? '#909094' : '#6A6A6E'} />
              </lineSegments>
            </group>

            {/* Ceiling plane between floors (only in 3D multi-floor mode) */}
            {!isPlanView && isMultiFloor && floor.level > 0 && (
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
                    </span>
                  </Html>
                )
              })}
            </>
          )
        })()}

      <Grid
        args={[40, 40]}
        position={[0, 0, 0]}
        cellColor={isPlanView ? '#323233' : '#323233'}
        sectionColor={isPlanView ? '#464648' : '#464648'}
        fadeDistance={isPlanView ? 80 : 60}
        infiniteGrid={!isPlanView}
      />

      <OrbitControls
        ref={orbitRef as RefObject<any>}
        makeDefault
        enableRotate={!isPlanView}
        enablePan
        enableZoom
        screenSpacePanning
        mouseButtons={mouseButtons}
      />

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
        <meshBasicMaterial transparent opacity={0} />
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
            <div className="rounded bg-warn px-2 py-0.5 text-[11px] font-semibold text-graphite-900 shadow">
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
