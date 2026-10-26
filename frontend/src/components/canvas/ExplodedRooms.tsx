import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Room } from '../../store/canvasStore'
import { roomOutline, type OutlinePoint } from '../../store/roomOutline'
import { BLOCK_FLOOR_M, blockEdge, blockFill, blockVolumeGeometry, buildBlockModel } from './blockGeometry'
import { furnitureParts } from './furnitureParts'
import { BLOCK_COLORS, BLOCK_OPACITY } from './modelView'
import { burstAmount, explodeOffset, progressAt } from './viewTransition'

const toRad = THREE.MathUtils.degToRad

function contains(outline: OutlinePoint[], p: OutlinePoint) {
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i], b = outline[j]
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/**
 * The plan as an exploded diagram for the length of a 3D <-> Top transition:
 * each room (with the furniture standing in it) lifts and drifts out from the
 * building's centre and settles back; walls, doors and windows fade out for
 * the flight and back in, and each room's home outline shows on the ground
 * while it is away. Canvas3D hides the real model meanwhile.
 */
export function ExplodedRooms({ rooms, startedAt }: { rooms: Room[]; startedAt: number }) {
  const invalidate = useThree((s) => s.invalidate)
  const groups = useRef<(THREE.Group | null)[]>([])
  const fading = useRef<THREE.Material[]>([])
  const homeLines = useRef<THREE.LineBasicMaterial>(null)

  const spaces = useMemo(() => rooms.filter((room) => room.objectType === 'room' || room.objectType === 'stair'), [rooms])
  const parts = useMemo(() => spaces.map((room) => {
    const fill = blockFill(room, false)
    const outline = roomOutline(room)
    return {
      room,
      outline,
      fill,
      edge: blockEdge(fill),
      volume: blockVolumeGeometry(room, room.size.h),
      floor: blockVolumeGeometry(room, BLOCK_FLOOR_M),
      furniture: rooms.filter((item) => item.objectType === 'furniture' && contains(outline, { x: item.position.x, z: item.position.z })),
    }
  }), [rooms, spaces])
  // Walls (outlines in this style), windows and doors: they belong to two
  // rooms at once, so they fade rather than fly.
  const frame = useMemo(() => {
    const openings = rooms.filter((o) => o.objectType === 'door' || o.objectType === 'window')
    return buildBlockModel(rooms.filter((o) => o.objectType === 'wall' || o.objectType === 'window'), openings, new Set())
  }, [rooms])
  const doors = useMemo(() => rooms.filter((o) => o.objectType === 'door'), [rooms])
  const home = useMemo(() => {
    const points: number[] = []
    for (const part of parts) {
      const y = part.room.position.y - part.room.size.h / 2 + 0.02
      part.outline.forEach((p, i) => {
        const q = part.outline[(i + 1) % part.outline.length]
        points.push(p.x, y, p.z, q.x, y, q.z)
      })
    }
    return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  }, [parts])
  useEffect(() => () => {
    parts.forEach((part) => { part.volume.dispose(); part.floor.dispose() })
    frame.solid?.dispose(); frame.glass?.dispose(); frame.edges?.dispose()
    home.dispose()
  }, [parts, frame, home])
  const layout = useMemo(() => {
    if (!spaces.length) return { center: { x: 0, z: 0 }, span: 0 }
    const xs = parts.flatMap((p) => p.outline.map((v) => v.x))
    const zs = parts.flatMap((p) => p.outline.map((v) => v.z))
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
    return { center: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }, span: Math.max(x1 - x0, z1 - z0) }
  }, [parts, spaces.length])

  // frameloop="demand": SwingCamera keeps frames coming; this asks too in
  // case the flight runs without it.
  useEffect(() => invalidate(), [startedAt, invalidate])
  useFrame(() => {
    const t = progressAt(startedAt, performance.now())
    parts.forEach((part, i) => {
      const [dx, dy, dz] = explodeOffset({ x: part.room.position.x, z: part.room.position.z }, layout.center, layout.span, t)
      groups.current[i]?.position.set(dx, dy, dz)
    })
    const apart = burstAmount(t)
    // Gone a little before the rooms leave, back a little after they land.
    const frameShown = 1 - Math.min(1, apart * 3)
    fading.current.forEach((material) => {
      material.opacity = (material.userData.full as number) * frameShown
      material.visible = frameShown > 0.01
    })
    if (homeLines.current) homeLines.current.opacity = 0.55 * apart
    if (t < 1) invalidate()
  })

  const fade = (full: number) => (material: THREE.Material | null) => {
    if (!material || fading.current.includes(material)) return
    material.userData.full = full
    fading.current.push(material)
  }

  return (
    <group>
      <lineSegments geometry={home} raycast={() => null}>
        <lineBasicMaterial ref={homeLines} color={BLOCK_COLORS.plotLine} transparent opacity={0} depthWrite={false} />
      </lineSegments>
      {frame.edges && (
        <lineSegments geometry={frame.edges} raycast={() => null}>
          <lineBasicMaterial ref={fade(1)} vertexColors transparent depthWrite={false} />
        </lineSegments>
      )}
      {frame.glass && (
        <mesh geometry={frame.glass} raycast={() => null}>
          <meshStandardMaterial ref={fade(BLOCK_OPACITY)} vertexColors transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {doors.map((door) => (
        <mesh
          key={door.id}
          position={[door.position.x, door.position.y - door.size.h / 2 + 0.03, door.position.z]}
          rotation={[0, toRad(door.rotation.y), 0]}
          raycast={() => null}
        >
          <boxGeometry args={[door.size.w, 0.05, door.size.d]} />
          <meshStandardMaterial ref={fade(1)} color={BLOCK_COLORS.wall} transparent />
        </mesh>
      ))}
      {parts.map((part, i) => (
        <group key={part.room.id} ref={(group) => { groups.current[i] = group }}>
          <group position={[part.room.position.x, part.room.position.y, part.room.position.z]} rotation={[0, toRad(part.room.rotation.y), 0]}>
            <mesh geometry={part.volume} raycast={() => null}>
              <meshStandardMaterial color={part.fill} transparent opacity={BLOCK_OPACITY} depthWrite={false} side={THREE.DoubleSide} roughness={0.3} />
            </mesh>
            <lineSegments raycast={() => null}>
              <edgesGeometry args={[part.volume]} />
              <lineBasicMaterial color={part.edge} />
            </lineSegments>
            <mesh geometry={part.floor} position={[0, -part.room.size.h / 2 + BLOCK_FLOOR_M / 2, 0]} raycast={() => null}>
              <meshStandardMaterial color={part.fill} roughness={1} />
            </mesh>
          </group>
          {part.furniture.map((item) => (
            <group
              key={item.id}
              position={[item.position.x, item.position.y, item.position.z]}
              rotation={[toRad(item.rotation.x), toRad(item.rotation.y), toRad(item.rotation.z)]}
            >
              {furnitureParts(item).map((piece, index) => (
                <mesh key={index} position={piece.position} raycast={() => null}>
                  <boxGeometry args={piece.size} />
                  <meshStandardMaterial color={piece.color} roughness={0.9} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}
