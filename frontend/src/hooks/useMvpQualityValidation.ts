import { useEffect, useMemo, useRef } from 'react'

import { validateAndSyncMvpLayout } from '../services/mvp.service'
import {
  canvasObjectsToLayoutPlan,
  edgesFromLayout,
  replaceDerivedCanvasObjects,
} from '../services/mvpLayoutAdapter'
import { useCanvasStore } from '../store/canvasStore'
import type { Connection, Facing, RequirementsSpec } from '../types/contracts'

const DEFAULT_DEBOUNCE_MS = 300

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRequirements(value: unknown): RequirementsSpec | null {
  if (!isRecord(value)) return null
  if (typeof value.building_type !== 'string' || typeof value.floors !== 'number') return null
  if (!Array.isArray(value.rooms) || !Array.isArray(value.adjacency)) return null
  if (!Array.isArray(value.avoid_adjacency) || !Array.isArray(value.missing_info)) return null
  if (!isRecord(value.plot)) return null
  return value as unknown as RequirementsSpec
}

function parseConnections(value: unknown): Connection[] {
  return Array.isArray(value) ? (value as Connection[]) : []
}

function geometryFingerprint(
  objects: ReturnType<typeof useCanvasStore.getState>['rooms'],
  connections: unknown = [],
) {
  return JSON.stringify([
    connections,
    objects
      .filter((object) => ['room', 'wall', 'door'].includes(object.objectType))
      .map((object) => [
        object.id,
        object.label,
        object.objectType,
        object.roomType,
        object.hostWallId,
        object.position.x,
        object.position.z,
        object.size.w,
        object.size.d,
        object.rotation.y,
      ])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  ])
}

interface UseMvpQualityValidationOptions {
  debounceMs?: number
}

/** Debounced full scoring for manual edits to canonical single-floor plans. */
export function useMvpQualityValidation({
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseMvpQualityValidationOptions = {}) {
  const objects = useCanvasStore((state) => state.rooms)
  const floors = useCanvasStore((state) => state.floors)
  const pipeline = useCanvasStore((state) => state.layoutMetadata.pipeline)
  const requirementsValue = useCanvasStore(
    (state) => state.layoutMetadata.mvpRequirements,
  )
  const includeVastu = useCanvasStore(
    (state) => state.layoutMetadata.mvpVastuEnabled === true,
  )
  const connectionsValue = useCanvasStore((state) => state.layoutMetadata.mvpConnections)
  const connections = useMemo(() => parseConnections(connectionsValue), [connectionsValue])
  const fingerprint = useMemo(
    () => geometryFingerprint(objects, connections),
    [objects, connections],
  )
  const previousFingerprint = useRef<string | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => {
    const requirements = parseRequirements(requirementsValue)
    const floor = floors.length === 1 ? floors[0] : null
    const footprint = floor?.footprint
    const facing = requirements?.facing

    if (
      pipeline !== 'mvp' ||
      requirements === null ||
      footprint === undefined ||
      (facing != null && !['north', 'south', 'east', 'west'].includes(facing))
    ) {
      previousFingerprint.current = null
      return
    }

    if (previousFingerprint.current === null) {
      previousFingerprint.current = fingerprint
      return
    }
    if (previousFingerprint.current === fingerprint) return
    previousFingerprint.current = fingerprint

    const requestId = ++requestSequence.current
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      const plan = canvasObjectsToLayoutPlan(
        objects,
        footprint,
        (facing ?? 'east') as Facing,
        connections,
      )
      void validateAndSyncMvpLayout(plan, { requirements, includeVastu })
        .then(({ layout, quality }) => {
          if (cancelled || requestId !== requestSequence.current) return
          useCanvasStore.setState((state) => {
            // A newer edit may land before React runs this effect's cleanup.
            // Never paint derived geometry from an older room snapshot.
            if (
              geometryFingerprint(state.rooms, parseConnections(state.layoutMetadata.mvpConnections))
              !== fingerprint
            ) return state

            const rooms = replaceDerivedCanvasObjects(state.rooms, layout)
            // The server drops connections whose rooms no longer touch.
            const syncedConnections = layout.connections ?? []
            // The wall/door replacement changes the fingerprint. Advance the
            // baseline now so derived-state repaint does not enqueue a second
            // validation request.
            previousFingerprint.current = geometryFingerprint(rooms, syncedConnections)
            return {
              rooms,
              selectedId:
                state.selectedId &&
                !rooms.some((object) => object.id === state.selectedId)
                  ? null
                  : state.selectedId,
              // Quality and rebuilt walls/doors are derived state: preserve
              // edit history, activity, and the current dirty/save status.
              layoutMetadata: {
                ...state.layoutMetadata,
                mvpQuality: quality,
                mvpEdges: edgesFromLayout(layout),
                mvpConnections: syncedConnections,
              },
            }
          })
        })
        .catch(() => {
          // Preserve the last known report on a transient validation failure.
        })
    }, debounceMs)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [connections, debounceMs, fingerprint, floors, includeVastu, objects, pipeline, requirementsValue])
}
