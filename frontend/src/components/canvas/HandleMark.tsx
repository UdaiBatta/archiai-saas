import { useRef, useState } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { EDITOR_PALETTE } from './editorPalette'

/** Grip sizes on screen, pixels: a point, an add-a-point midpoint, a corner. */
export const HANDLE_PX = { point: 20, midpoint: 15, corner: 18 } as const

/** Orthographic zoom = screen pixels per metre; re-rendered only on a real change. */
export function usePixelsPerMetre() {
  const [zoom, setZoom] = useState(30)
  const last = useRef(zoom)
  useFrame(({ camera }) => {
    if (Math.abs(camera.zoom - last.current) / camera.zoom > 0.02) {
      last.current = camera.zoom
      setZoom(camera.zoom)
    }
  })
  return zoom
}

/** Metres for `px` screen pixels: exact under the orthographic Axo and Top
 * cameras; under Persp a fixed size that reads at a normal viewing distance. */
export function useHandleMetres() {
  const pxPerMetre = usePixelsPerMetre()
  const ortho = useThree((s) => (s.camera as THREE.OrthographicCamera).isOrthographicCamera === true)
  return (px: number) => (ortho ? px / pxPerMetre : px * 0.035)
}

interface HandleMarkProps {
  name: string
  position: [number, number, number]
  size: number
  round?: boolean
  faint?: boolean
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void
  onPointerUp?: (event: ThreeEvent<PointerEvent>) => void
  onPointerCancel?: (event: ThreeEvent<PointerEvent>) => void
  onPointerOver?: () => void
  onPointerOut?: () => void
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
}

/** A flat grip lying on the plan, drawn over everything: the same look in
 * Top, Axo and Persp. */
export function HandleMark({ name, position, size, round, faint, ...events }: HandleMarkProps) {
  const shape = (s: number) => (round ? <circleGeometry args={[s / 2, 24]} /> : <planeGeometry args={[s, s]} />)
  return (
    <group position={position}>
      <mesh name={name} rotation={[-Math.PI / 2, 0, 0]} renderOrder={31} {...events}>
        {shape(size)}
        <meshBasicMaterial color={EDITOR_PALETTE.selection} transparent opacity={faint ? 0.6 : 1} depthTest={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={30} raycast={() => null}>
        {shape(size * 1.35)}
        <meshBasicMaterial color={EDITOR_PALETTE.handleRing} transparent opacity={faint ? 0.7 : 1} depthTest={false} />
      </mesh>
    </group>
  )
}
