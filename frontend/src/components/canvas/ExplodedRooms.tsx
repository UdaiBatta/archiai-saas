import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'
import type { Room } from '../../store/canvasStore'
import { blockEdge, blockFill, blockVolumeGeometry } from './blockGeometry'
import { BLOCK_OPACITY } from './modelView'
import { explodeOffset, progressAt, useViewTransition } from './viewTransition'

/**
 * The rooms as separate blocks for the length of a 3D <-> Top transition, so
 * each can fly out from the building and back. The merged model is hidden
 * meanwhile (see Canvas3D) and returns when this ends.
 */
export function ExplodedRooms({ rooms, startedAt }: { rooms: Room[]; startedAt: number }) {
  const invalidate = useThree((s) => s.invalidate)
  const end = useViewTransition((s) => s.end)
  const groups = useRef<(THREE.Group | null)[]>([])
  const spaces = useMemo(() => rooms.filter((room) => room.objectType === 'room' || room.objectType === 'stair'), [rooms])
  const parts = useMemo(() => spaces.map((room) => {
    const fill = blockFill(room, false)
    return { room, fill, edge: blockEdge(fill), geometry: blockVolumeGeometry(room, room.size.h) }
  }), [spaces])
  useEffect(() => () => parts.forEach((part) => part.geometry.dispose()), [parts])
  const frame = useMemo(() => {
    if (!spaces.length) return { center: { x: 0, z: 0 }, span: 0 }
    const xs = spaces.flatMap((r) => [r.position.x - r.size.w / 2, r.position.x + r.size.w / 2])
    const zs = spaces.flatMap((r) => [r.position.z - r.size.d / 2, r.position.z + r.size.d / 2])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs)
    return { center: { x: (x0 + x1) / 2, z: (z0 + z1) / 2 }, span: Math.max(x1 - x0, z1 - z0) }
  }, [spaces])

  // frameloop="demand": keep asking for frames until the flight lands.
  useEffect(() => invalidate(), [startedAt, invalidate])
  useFrame(() => {
    const t = progressAt(startedAt, performance.now())
    parts.forEach((part, i) => {
      const group = groups.current[i]
      if (!group) return
      const [dx, dy, dz] = explodeOffset({ x: part.room.position.x, z: part.room.position.z }, frame.center, frame.span, t)
      group.position.set(part.room.position.x + dx, part.room.position.y + dy, part.room.position.z + dz)
    })
    if (t >= 1) end()
    else invalidate()
  })

  return (
    <group>
      {parts.map((part, i) => (
        <group
          key={part.room.id}
          ref={(group) => { groups.current[i] = group }}
          position={[part.room.position.x, part.room.position.y, part.room.position.z]}
          rotation={[0, THREE.MathUtils.degToRad(part.room.rotation.y), 0]}
        >
          <mesh geometry={part.geometry} raycast={() => null}>
            <meshStandardMaterial color={part.fill} transparent opacity={BLOCK_OPACITY + 0.15} depthWrite={false} side={THREE.DoubleSide} roughness={0.3} />
            <Edges color={part.edge} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
