import { useEffect, useMemo, useRef } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { type Room, useCanvasStore } from '../../store/canvasStore'
import { COMPONENT_REGISTRY } from '../../store/componentRegistry'
import { isPrimaryPointerButton, objectPointerIntent } from '../../store/interactionModel'
import { formatArea, formatDims } from '../../utils/format'
import { buildMergedModel } from './mergedGeometry'
import { roomLabelLayout, roomPlanArea, roomWorldBounds } from './topViewModel'

/** Same list back while its items are the same objects: a drag replaces only
 * the dragged room, so the static model is not rebuilt on every step. */
function useStableList<T>(list: T[]): T[] {
  const ref = useRef(list)
  const prev = ref.current
  if (prev.length !== list.length || prev.some((item, i) => item !== list[i])) ref.current = list
  return ref.current
}

interface MergedModelProps {
  /** Static, mergeable objects (not the selection). */
  objects: Room[]
  /** Every door/window on the floor, for wall openings. */
  openings: Room[]
  invalidRoomIds: ReadonlySet<string>
  readOnly: boolean
  /** Top view: hover tooltips for rooms too small to label. */
  plan: boolean
}

/** The unselected walls, floors and windows as 3 draw calls (see mergedModel). */
export function MergedModel({ objects, openings, invalidRoomIds, readOnly, plan }: MergedModelProps) {
  const stableObjects = useStableList(objects)
  const stableOpenings = useStableList(openings)
  const model = useMemo(
    () => buildMergedModel(stableObjects, stableOpenings, invalidRoomIds),
    [stableObjects, stableOpenings, invalidRoomIds],
  )
  useEffect(() => () => {
    model.solid?.dispose()
    model.glass?.dispose()
    model.edges?.dispose()
  }, [model])
  const byId = useMemo(() => new Map(stableObjects.map((room) => [room.id, room])), [stableObjects])
  const camera = useThree((s) => s.camera)
  const canvasElement = useThree((s) => s.gl.domElement)

  const ownerOf = (owners: string[]) => (event: ThreeEvent<PointerEvent>) =>
    event.faceIndex != null ? byId.get(owners[event.faceIndex]) : undefined

  // Same behaviour as clicking an unselected RoomMesh: place an armed object,
  // otherwise select (the selection then renders on its own and can be dragged).
  const onPointerDown = (owners: string[]) => (event: ThreeEvent<PointerEvent>) => {
    if (readOnly || !isPrimaryPointerButton(event.button)) return
    const room = ownerOf(owners)(event)
    if (!room) return
    const state = useCanvasStore.getState()
    if (state.placementMode) {
      event.stopPropagation()
      state.addObjectAt(state.placementMode, event.point.x, event.point.z)
      return
    }
    if (objectPointerIntent(event.button, false, COMPONENT_REGISTRY[room.objectType]) !== 'selecting') return
    event.stopPropagation()
    state.selectRoom(room.id)
    state.setPointerIntent('idle')
  }

  const onPointerMove = (owners: string[]) => (event: ThreeEvent<PointerEvent>) => {
    if (!plan) return
    const room = ownerOf(owners)(event)
    if (!room) return
    const world = roomWorldBounds(room)
    const isSpace = COMPONENT_REGISTRY[room.objectType]?.category === 'space'
    const { showName } = roomLabelLayout({ label: room.label, w: world.w, d: world.d, pxPerMetre: camera.zoom, isSpace })
    canvasElement.title = showName ? '' : `${room.label} — ${formatDims(world.w, world.d)} · ${formatArea(roomPlanArea(room))}`
  }
  const onPointerOut = () => {
    if (plan) canvasElement.title = ''
  }

  return (
    <>
      {model.solid && (
        <mesh
          geometry={model.solid}
          castShadow
          receiveShadow
          onPointerDown={onPointerDown(model.solidOwners)}
          onPointerMove={onPointerMove(model.solidOwners)}
          onPointerOut={onPointerOut}
        >
          <meshStandardMaterial vertexColors roughness={0.93} metalness={0} />
        </mesh>
      )}
      {model.glass && (
        <mesh
          geometry={model.glass}
          receiveShadow
          onPointerDown={onPointerDown(model.glassOwners)}
          onPointerMove={onPointerMove(model.glassOwners)}
          onPointerOut={onPointerOut}
        >
          <meshStandardMaterial vertexColors transparent opacity={0.35} depthWrite={false} roughness={0.05} metalness={0.1} />
        </mesh>
      )}
      {model.edges && (
        <lineSegments geometry={model.edges} raycast={() => null}>
          <lineBasicMaterial vertexColors />
        </lineSegments>
      )}
    </>
  )
}
