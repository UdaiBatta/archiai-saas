import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { paletteColor, useSunAnalysis, useSunResultStale } from './sunAnalysis'

const noRaycast = () => null

/**
 * The sun-hours heatmap: ground squares and façade strips (1 m, one per
 * sample, at each floor's mid-height) as two instanced
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
  const strips = useRef<THREE.InstancedMesh>(null)
  const { scene, hours, summary } = result
  const max = summary.maxHours || 1
  const open = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < scene.groundCount; i++) if (!Number.isNaN(hours[i])) out.push(i)
    return out
  }, [scene, hours])
  const stripCount = scene.positions.length / 3 - scene.groundCount
  const tile = useMemo(() => new THREE.PlaneGeometry(scene.groundStep * 0.94, scene.groundStep * 0.94).rotateX(-Math.PI / 2), [scene.groundStep])
  const strip = useMemo(() => new THREE.PlaneGeometry(0.9, 1), [])
  useEffect(() => () => { tile.dispose(); strip.dispose() }, [tile, strip])

  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    const q = new THREE.Quaternion()
    const at = new THREE.Vector3()
    const one = new THREE.Vector3(1, 1, 1)
    const facing = new THREE.Vector3()
    const front = new THREE.Vector3(0, 0, 1)
    const p = scene.positions
    const n = scene.normals
    const place = (mesh: THREE.InstancedMesh | null, indices: Iterable<number>, lift: number) => {
      if (!mesh) return
      let k = 0
      for (const i of indices) {
        // Tiles face their surface: ground up (baked into the tile), façades outward.
        if (n[i * 3 + 1] === 1) q.identity()
        else q.setFromUnitVectors(front, facing.set(n[i * 3], 0, n[i * 3 + 2]).normalize())
        m.compose(at.set(p[i * 3], p[i * 3 + 1] + lift, p[i * 3 + 2]), q, one)
        mesh.setMatrixAt(k, m)
        mesh.setColorAt(k, c.setRGB(...paletteColor(hours[i] / max)))
        k++
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    place(ground.current, open, 0.01)
    place(strips.current, Array.from({ length: stripCount }, (_, k) => scene.groundCount + k), 0)
    invalidate()
  }, [scene, hours, max, open, stripCount, invalidate])

  return (
    <group name="sun-hours">
      {open.length > 0 && (
        <instancedMesh ref={ground} args={[tile, undefined, open.length]} raycast={noRaycast}>
          <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
        </instancedMesh>
      )}
      {stripCount > 0 && (
        <instancedMesh ref={strips} args={[strip, undefined, stripCount]} raycast={noRaycast}>
          <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} />
        </instancedMesh>
      )}
    </group>
  )
}
