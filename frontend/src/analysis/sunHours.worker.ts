/// <reference lib="webworker" />
import { computeSunHours, type SunSample } from './sunHours'

export interface SunJob {
  triangles: Float32Array
  positions: Float32Array
  normals: Float32Array
  samples: SunSample[]
}

self.onmessage = (event: MessageEvent<SunJob>) => {
  const { triangles, positions, normals, samples } = event.data
  const hours = computeSunHours(triangles, positions, normals, samples, (done) => self.postMessage({ progress: done }))
  self.postMessage({ hours }, { transfer: [hours.buffer] })
}
