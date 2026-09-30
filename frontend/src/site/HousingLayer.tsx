import { useEffect, useMemo } from 'react'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useCanvasStore } from '../store/canvasStore'
import { usePixelsPerMetre } from '../components/canvas/TopPlanOverlay'
import type { MassHousing } from './housingTypes'
import { buildHousingModel, disposeHousingModel } from './housingGeometry'
import { useHousing, useHousingUi, useMassUi, useSiteAndMasses } from './massStore'
import type { Mass } from './siteTypes'

/** Housed masses in the 3D view: slabs, unit volumes, the open floor's interiors. */
export function HousingLayer({ topView }: { topView: boolean }) {
  const { masses } = useSiteAndMasses()
  const housing = useHousing()
  return (
    <group name="housing">
      {masses.map((m) => housing[m.id] && <HousedMass key={m.id} mass={m} housing={housing[m.id]} topView={topView} />)}
    </group>
  )
}

function HousedMass({ mass, housing, topView }: { mass: Mass; housing: MassHousing; topView: boolean }) {
  const selected = useMassUi((s) => s.selectedMassId === mass.id)
  const floor = useHousingUi((s) => s.floor)
  const unitId = useHousingUi((s) => s.unitId)
  const px = usePixelsPerMetre()
  // Only the selected mass opens a floor; others stay closed volumes.
  const view = { floor: selected ? floor : ('all' as const), top: topView, pickedUnitId: selected ? unitId : null }
  const model = useMemo(
    () => buildHousingModel(housing, mass, view),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [housing, mass, view.floor, view.top, view.pickedUnitId],
  )
  useEffect(() => () => disposeHousingModel(model), [model])

  const pick = (owners: string[]) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || event.faceIndex == null) return
    const id = owners[event.faceIndex]
    event.stopPropagation()
    useMassUi.getState().select(mass.id)
    useCanvasStore.getState().deselectAll()
    useHousingUi.getState().pickUnit(id || null)
  }

  return (
    <group name={`housing-${mass.id}`}>
      {model.solid && (
        <mesh geometry={model.solid} castShadow={!topView} receiveShadow onPointerDown={pick(model.solidOwners)}>
          <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
        </mesh>
      )}
      {model.units && (
        <mesh geometry={model.units} onPointerDown={pick(model.unitOwners)}>
          <meshStandardMaterial vertexColors transparent opacity={0.72} depthWrite={false} roughness={0.9} metalness={0} />
        </mesh>
      )}
      {model.ghost && (
        <mesh geometry={model.ghost} raycast={() => null} renderOrder={2}>
          <meshBasicMaterial vertexColors transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}
      {model.edges && (
        <lineSegments geometry={model.edges} raycast={() => null}>
          <lineBasicMaterial vertexColors transparent opacity={0.8} />
        </lineSegments>
      )}
      {model.markers && (
        <lineSegments geometry={model.markers} raycast={() => null} renderOrder={4}>
          <lineBasicMaterial vertexColors />
        </lineSegments>
      )}
      {topView && model.labels.filter((l) => l.size * px >= l.text.length * 5 + 4).map((l) => (
        <Html key={l.key} position={l.position} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap text-[9px] font-medium leading-none text-graphite-900/80">{l.text}</div>
        </Html>
      ))}
    </group>
  )
}
