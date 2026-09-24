import { useMemo } from 'react'

import { useCanvasStore } from '../../store/canvasStore'
import type { Connection, RoomEdge } from '../../types/contracts'
import { buildRoomGraph, effectiveEdges } from './roomGraphModel'

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

/** The access graph for one floor, recomputed on every room or connection change. */
export function useAccessGraph(level: number) {
  const rooms = useCanvasStore((s) => s.rooms)
  const serverEdges = useCanvasStore((s) => s.layoutMetadata.mvpEdges)
  const connections = useCanvasStore((s) => s.layoutMetadata.mvpConnections)
  return useMemo(() => {
    const edges = effectiveEdges(asArray<RoomEdge>(serverEdges), asArray<Connection>(connections))
    return { ...buildRoomGraph(rooms, level, edges), hasConnectionData: Array.isArray(serverEdges) }
  }, [rooms, level, serverEdges, connections])
}
