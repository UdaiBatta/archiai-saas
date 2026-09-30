import { create } from 'zustand'
import { useCanvasStore, type Room } from '../store/canvasStore'
import { parseMasses, parseSite } from '../site/siteTypes'
import { buildSunScene, computeSunHours, summarize, sunSamples, type SunScene, type SunSummary } from './sunHours'
import type { SunJob } from './sunHours.worker'
import { useSunContext, type SunContext } from './sunStore'

/** What a result was computed from; any change makes it out of date. */
interface Inputs {
  rooms: Room[]
  site: unknown
  masses: unknown
  date: string
  lat: number
  lon: number
}

export interface SunResult {
  scene: SunScene
  hours: Float32Array
  summary: SunSummary
  samples: number
  ms: number
  inputs: Inputs
}

interface AnalysisState {
  /** "Sun hours" mode: the heatmap is drawn while on. */
  show: boolean
  running: boolean
  progress: number
  result: SunResult | null
  error: string | null
  setShow: (show: boolean) => void
  run: (where: SunContext) => void
}

let worker: Worker | null = null

/** Sun-hours runs (not saved): the ray casting happens in a Web Worker. */
export const useSunAnalysis = create<AnalysisState>((set) => ({
  show: true,
  running: false,
  progress: 0,
  result: null,
  error: null,
  setShow: (show) => set({ show }),
  run: (where) => {
    const t0 = performance.now()
    const { rooms, layoutMetadata, floors } = useCanvasStore.getState()
    const inputs: Inputs = { rooms, site: layoutMetadata.site, masses: layoutMetadata.masses, date: where.date, lat: where.lat, lon: where.lon }
    const scene = buildSunScene({
      objects: rooms,
      masses: parseMasses(layoutMetadata.masses),
      site: parseSite(layoutMetadata.site),
      plot: floors[0]?.footprint ?? null,
    })
    const samples = sunSamples(where)
    const finish = (hours: Float32Array) =>
      set({
        running: false,
        progress: 1,
        show: true,
        result: { scene, hours, summary: summarize(scene, hours, samples), samples: samples.length, ms: performance.now() - t0, inputs },
      })
    set({ running: true, progress: 0, error: null })
    if (typeof Worker === 'undefined') return finish(computeSunHours(scene.triangles, scene.positions, scene.normals, samples))
    worker?.terminate()
    worker = new Worker(new URL('./sunHours.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ progress?: number; hours?: Float32Array }>) => {
      if (event.data.hours) {
        finish(event.data.hours)
        worker?.terminate()
        worker = null
      } else set({ progress: event.data.progress ?? 0 })
    }
    worker.onerror = (event) => set({ running: false, error: event.message || 'Sun analysis failed' })
    const job: SunJob = { triangles: scene.triangles, positions: scene.positions, normals: scene.normals, samples }
    worker.postMessage(job)
  },
}))

/** True when the model, site, masses, date or location changed since the run. */
export function useSunResultStale(): boolean {
  const result = useSunAnalysis((s) => s.result)
  const rooms = useCanvasStore((s) => s.rooms)
  const site = useCanvasStore((s) => s.layoutMetadata.site)
  const masses = useCanvasStore((s) => s.layoutMetadata.masses)
  const where = useSunContext()
  if (!result) return false
  const i = result.inputs
  return i.rooms !== rooms || i.site !== site || i.masses !== masses || i.date !== where.date || i.lat !== where.lat || i.lon !== where.lon
}

// Viridis, 5 stops: perceptually ordered, colour-blind safe.
export const PALETTE = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']

/** 0..1 -> rgb 0..1 on the palette. */
export function paletteColor(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (PALETTE.length - 1)
  const i = Math.min(PALETTE.length - 2, Math.floor(x))
  const f = x - i
  const rgb = (hex: string, k: number) => parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16) / 255
  return [0, 1, 2].map((k) => rgb(PALETTE[i], k) + (rgb(PALETTE[i + 1], k) - rgb(PALETTE[i], k)) * f) as [number, number, number]
}
