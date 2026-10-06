import { useCanvasStore } from '../../store/canvasStore'
import { isEngineWall } from '../../store/componentRegistry'
import { wallRun } from '../../store/wallLines'
import { EDITOR_PALETTE } from './editorPalette'

/** The whole wall line of a selected engine wall, so the joined pieces read as one wall. */
export function WallLineHighlight() {
  const wall = useCanvasStore((s) => s.rooms.find((r) => r.id === s.selectedId))
  const rooms = useCanvasStore((s) => s.rooms)
  if (!wall || !isEngineWall(wall)) return null
  const run = wallRun(rooms, wall.id)
  if (!run || run.wallIds.length < 2) return null
  const length = run.to - run.from
  const mid = (run.from + run.to) / 2
  const [x, z, w, d] = run.axis === 'x' ? [run.at, mid, 0.2, length] : [mid, run.at, length, 0.2]
  return (
    <mesh position={[x, wall.position.y, z]} raycast={() => null} renderOrder={4}>
      <boxGeometry args={[w, wall.size.h + 0.04, d]} />
      <meshBasicMaterial color={EDITOR_PALETTE.selection} transparent opacity={0.22} depthWrite={false} />
    </mesh>
  )
}
