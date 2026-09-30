import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { paletteColor, useSunAnalysis, useSunResultStale } from './sunAnalysis'

const noRaycast = () => null

/**
 * The sun-hours heatmap: ground squares and façade dots as two instanced
 * meshes (2 draw calls however many points). Hidden when out of date.
 */
export function SunHoursLayer() {
  const show = useSunAnalysis((s) => s.show)
  const result = useSunAnalysis((s) => s.result)
  const stale = useSunResultStale()
  if (!show || !result || stale) return null
  return <Heatmap key={result.ms} />
}

function Heatmap() {
  const result = useSunAnalysis((s) => s.result)!
  const invalidate = useThree((s) => s.invalidate)
  const ground = useRef<THREE.InstancedMesh>(null)
  const dots = useRef<THREE.InstancedMesh>(null)
  const { scene, hours, summary } = result
  const max = summary.maxHours || 1
  const open = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < scene.groundCount; i++) if (!Number.isNaN(hours[i])) out.push(i)
    return out
  }, [scene, hours])
  const dotCount = scene.positions.length / 3 - scene.groundCount
  const tile = useMemo(() => new THREE.PlaneGeometry(scene.groundStep * 0.94, scene.groundStep * 0.94).rotateX(-Math.PI / 2), [scene.groundStep])
  const dot = useMemo(() => new THREE.IcosahedronGeometry(0.18, 0), [])
  useEffect(() => () => { tile.dispose(); dot.dispose() }, [tile, dot])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const p = scene.positions
    const place = (mesh: THREE.InstancedMesh | null, indices: Iterable<number>, lift: number) => {
      if (!mesh) return
      let k = 0
      for (const i of indices) {
        m.makeTranslation(p[i * 3], p[i * 3 + 1] + lift, p[i * 3 + 2])
        mesh.setMatrixAt(k, m)
        mesh.setColorAt(k, c.setRGB(...paletteColor(hours[i] / max)))
        k++
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    place(ground.current, open, 0.01)
    place(dots.current, Array.from({ length: dotCount }, (_, k) => scene.groundCount + k), 0)
    invalidate()
  }, [scene, hours, max, open, dotCount, invalidate])

  return (
    <group name="sun-hours">
      {open.length > 0 && (
        <instancedMesh ref={ground} args={[tile, undefined, open.length]} raycast={noRaycast}>
          <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
        </instancedMesh>
      )}
      {dotCount > 0 && (
        <instancedMesh ref={dots} args={[dot, undefined, dotCount]} raycast={noRaycast}>
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  )
}
