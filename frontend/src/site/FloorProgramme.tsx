import { useEffect, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import { polygonArea } from './siteGeometry'
import { useMassUi } from './massStore'
import { FLOOR_USES, FLOOR_USE_LABEL, useBands, withFloorUse, type FloorUse, type Mass } from './siteTypes'

const field = 'rounded-md border border-ink/15 bg-graphite-900/60 px-1.5 py-1 text-[11px] text-ink'

/**
 * The selected mass's programme: runs of floors by use (top first), each
 * switchable, and a range setter ("L1-L3 Retail"). A floor picked in 3D
 * pre-fills the range.
 */
export function FloorProgramme({ mass, masses, readOnly }: { mass: Mass; masses: Mass[]; readOnly: boolean }) {
  const setMasses = useCanvasStore((s) => s.setMasses)
  const selectedFloor = useMassUi((s) => s.selectedFloor)
  const [from, setFrom] = useState(1)
  const [to, setTo] = useState(1)
  const [use, setUse] = useState<FloorUse>('retail')
  useEffect(() => {
    if (selectedFloor !== null) {
      setFrom(selectedFloor + 1)
      setTo(selectedFloor + 1)
    }
  }, [selectedFloor, mass.id])

  const apply = (a: number, b: number, value: FloorUse) =>
    setMasses(masses.map((m) => (m.id === mass.id ? withFloorUse(m, Math.min(a, b) - 1, Math.max(a, b) - 1, value) : m)))
  const plate = polygonArea(mass.footprint)
  const bands = useBands(mass).reverse()

  return (
    <section aria-label="Floor programme" className="flex flex-col gap-1.5 border-t border-ink/10 pt-2">
      <span className="font-semibold text-ink">Programme</span>
      <ul className="flex flex-col gap-1">
        {bands.map((band) => (
          <li key={band.from} className="flex items-center gap-2">
            <span className="w-16 shrink-0 font-mono tabular-nums text-muted">
              {band.from === band.to ? `L${band.from + 1}` : `L${band.from + 1}–L${band.to + 1}`}
            </span>
            <select
              aria-label={`Use of floors ${band.from + 1} to ${band.to + 1}`}
              value={band.use}
              disabled={readOnly}
              onChange={(event) => apply(band.from + 1, band.to + 1, event.target.value as FloorUse)}
              className={`${field} min-w-0 flex-1`}
            >
              {FLOOR_USES.map((u) => <option key={u} value={u}>{FLOOR_USE_LABEL[u]}</option>)}
            </select>
            <span className="w-16 shrink-0 text-right font-mono tabular-nums text-muted-light">{Math.round(plate * (band.to - band.from + 1)).toLocaleString()} m²</span>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted-light">Set</span>
          <input aria-label="From floor" type="number" min={1} max={mass.floors} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} className={`${field} w-12`} />
          <span className="text-muted-light">to</span>
          <input aria-label="To floor" type="number" min={1} max={mass.floors} value={to} onChange={(e) => setTo(Number(e.target.value) || 1)} className={`${field} w-12`} />
          <select aria-label="Use for those floors" value={use} onChange={(e) => setUse(e.target.value as FloorUse)} className={`${field} min-w-0 flex-1`}>
            {FLOOR_USES.map((u) => <option key={u} value={u}>{FLOOR_USE_LABEL[u]}</option>)}
          </select>
          <button type="button" onClick={() => apply(from, to, use)} className="rounded-md border border-ink/15 px-2 py-1 text-[11px] text-ink hover:border-ink/30">Apply</button>
        </div>
      )}
    </section>
  )
}
