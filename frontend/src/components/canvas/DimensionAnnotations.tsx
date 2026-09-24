import { Html, Line } from '@react-three/drei'
import { Room } from '../../store/canvasStore'
import { ACCENT_HEX, DIM_HEX } from '../../constants/theme'
import { formatMeters } from '../../utils/format'

interface DimensionAnnotationsProps {
  room: Room
  /** Selected room gets bold lines; others (when the global toggle is on) get faint lines only. */
  emphasized: boolean
}

const OFFSET = 0.45
const TICK = 0.18

export function DimensionAnnotations({ room, emphasized }: DimensionAnnotationsProps) {
  const { x, z } = room.position
  const { w, d } = room.size
  const halfW = w / 2
  const halfD = d / 2
  const lineY = 0.02
  const color = emphasized ? ACCENT_HEX : DIM_HEX
  const lineWidth = emphasized ? 1.5 : 1

  const widthLineZ = z - halfD - OFFSET
  const depthLineX = x - halfW - OFFSET

  return (
    <group>
      {/* Width dimension (along X), offset in -Z */}
      <Line
        points={[
          [x - halfW, lineY, widthLineZ],
          [x + halfW, lineY, widthLineZ],
        ]}
        color={color}
        lineWidth={lineWidth}
      />
      <Line
        points={[
          [x - halfW, lineY, widthLineZ - TICK],
          [x - halfW, lineY, widthLineZ + TICK],
        ]}
        color={color}
        lineWidth={lineWidth}
      />
      <Line
        points={[
          [x + halfW, lineY, widthLineZ - TICK],
          [x + halfW, lineY, widthLineZ + TICK],
        ]}
        color={color}
        lineWidth={lineWidth}
      />
      <Html position={[x, lineY, widthLineZ - 0.3]} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
        <span
          className={`whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums shadow-sm ${
            emphasized
              ? 'bg-ink text-graphite-900'
              : 'border border-ink/10 bg-graphite-800/90 text-muted'
          }`}
        >
          {formatMeters(w)}
        </span>
      </Html>

      {/* Depth dimension (along Z), offset in -X */}
      <Line
        points={[
          [depthLineX, lineY, z - halfD],
          [depthLineX, lineY, z + halfD],
        ]}
        color={color}
        lineWidth={lineWidth}
      />
      <Line
        points={[
          [depthLineX - TICK, lineY, z - halfD],
          [depthLineX + TICK, lineY, z - halfD],
        ]}
        color={color}
        lineWidth={lineWidth}
      />
      <Line
        points={[
          [depthLineX - TICK, lineY, z + halfD],
          [depthLineX + TICK, lineY, z + halfD],
        ]}
        color={color}
        lineWidth={lineWidth}
      />
      <Html position={[depthLineX - 0.3, lineY, z]} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none' }}>
        <span
          className={`whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums shadow-sm ${
            emphasized
              ? 'bg-ink text-graphite-900'
              : 'border border-ink/10 bg-graphite-800/90 text-muted'
          }`}
        >
          {formatMeters(d)}
        </span>
      </Html>

    </group>
  )
}
