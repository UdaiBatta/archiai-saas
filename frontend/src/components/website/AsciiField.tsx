import { useEffect, useRef } from 'react'

import { EXAMPLE } from '../../constants/examplePlan'

/**
 * Animated dot-field background ("Sunset", dots mode): a sunset glowing
 * over a real ArchiAI floor plan, resampled into a grid of dots sized by
 * brightness, tinted ember, pulsing outward in rings, with bloom.
 *
 * Parameters follow the brief: 10 px cells, contrast 115%, #ff3b1f tint at
 * 32% (overlay), bloom 45, pulse animation at 60% intensity. The vignette is
 * a CSS layer on top. Pauses off-screen and in hidden tabs; draws a single
 * still frame for visitors who prefer reduced motion.
 */
const CELL = 10
const CONTRAST = 1.15
const TINT = [255, 59, 31] as const
const TINT_OPACITY = 0.32
const BLOOM = 0.45
const PULSE = 0.6
const LEVELS = 16
const FRAME_MS = 1000 / 30

const overlay = (base: number, blend: number) =>
  base < 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend)

/** Ember ramp: brightness 0..1 -> tinted colour, overlay-blended at 32%. */
function rampColor(level: number) {
  const l = level / (LEVELS - 1)
  // Warm base: deep red -> orange -> pale gold as brightness rises.
  const base = [0.35 + 0.65 * l, 0.12 + 0.75 * l * l, 0.08 + 0.6 * l * l * l]
  const mixed = base.map((c, i) => {
    const tinted = overlay(c, TINT[i] / 255)
    return Math.round(255 * (c * (1 - TINT_OPACITY) + tinted * TINT_OPACITY))
  })
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`
}

/** The source picture, drawn at grid resolution (one pixel per cell). */
function drawScene(ctx: CanvasRenderingContext2D, cols: number, rows: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, rows)
  sky.addColorStop(0, '#1c0f0b')
  sky.addColorStop(0.55, '#3a1a10')
  sky.addColorStop(1, '#120a08')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, cols, rows)

  const sx = cols * 0.74
  const sy = rows * 0.42
  const radius = Math.min(cols, rows) * 0.42
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius)
  sun.addColorStop(0, 'rgba(255, 236, 200, 1)')
  sun.addColorStop(0.22, 'rgba(255, 150, 90, 0.9)')
  sun.addColorStop(0.6, 'rgba(160, 50, 25, 0.35)')
  sun.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, cols, rows)

  // The real plan, walls bright and rooms dim, sitting in the sunset.
  const { plot, rooms, walls } = EXAMPLE.plan
  const scale = (rows * 0.78) / plot.depth_m
  const ox = cols * 0.74 - (plot.width_m * scale) / 2
  const oy = rows * 0.12
  ctx.save()
  ctx.translate(ox, oy)
  ctx.scale(scale, scale)
  rooms.forEach((room, i) => {
    ctx.fillStyle = `rgba(255, 190, 150, ${i % 2 ? 0.1 : 0.18})`
    ctx.fillRect(room.x, room.y, room.w, room.h)
  })
  ctx.strokeStyle = 'rgba(255, 245, 230, 0.95)'
  ctx.lineWidth = 1.1 / scale
  for (const wall of walls) {
    if (wall.kind === 'open') continue
    ctx.beginPath()
    ctx.moveTo(wall.x1, wall.y1)
    ctx.lineTo(wall.x2, wall.y2)
    ctx.stroke()
  }
  ctx.restore()
}

interface Cell {
  x: number
  y: number
  base: number
  phase: number
}

export function AsciiField({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const colors = Array.from({ length: LEVELS }, (_, level) => rampColor(level))
    let buckets: Cell[][] = []
    let width = 0
    let height = 0
    let frame = 0
    let last = 0
    let visible = true

    const sample = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const cols = Math.ceil(width / CELL)
      const rows = Math.ceil(height / CELL)
      const source = document.createElement('canvas')
      source.width = cols
      source.height = rows
      const sctx = source.getContext('2d')
      if (!sctx || !cols || !rows) return
      drawScene(sctx, cols, rows)
      const pixels = sctx.getImageData(0, 0, cols, rows).data
      buckets = Array.from({ length: LEVELS }, () => [])
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const i = (r * cols + c) * 4
          const lum = (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255
          const level = Math.max(0, Math.min(1, (lum - 0.5) * CONTRAST + 0.5))
          if (level < 0.02) continue
          const bucket = Math.min(LEVELS - 1, Math.round(level * (LEVELS - 1)))
          buckets[bucket].push({
            x: c * CELL + CELL / 2,
            y: r * CELL + CELL / 2,
            // Dim areas keep a small visible dot so the texture fills the field.
            base: (0.16 + 0.84 * level) * CELL * 0.46,
            phase: Math.hypot(c - cols * 0.74, r - rows * 0.42) * 0.18,
          })
        }
      }
    }

    const draw = (time: number) => {
      const t = time / 1000
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.filter = 'none'
      ctx.fillStyle = '#050506'
      ctx.fillRect(0, 0, width, height)
      buckets.forEach((cells, level) => {
        if (!cells.length) return
        ctx.fillStyle = colors[level]
        ctx.beginPath()
        for (const cell of cells) {
          // Pulse: rings of growth travelling outward from the sun.
          const r = cell.base * (1 + PULSE * 0.35 * Math.sin(t * 2.2 - cell.phase))
          ctx.moveTo(cell.x + r, cell.y)
          ctx.arc(cell.x, cell.y, Math.max(0.3, r), 0, Math.PI * 2)
        }
        ctx.fill()
      })
      // Bloom: a blurred copy of the dots added back on top.
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = BLOOM * 0.55
      ctx.filter = 'blur(6px)'
      ctx.drawImage(canvas, 0, 0, width, height)
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    const loop = (time: number) => {
      frame = requestAnimationFrame(loop)
      if (!visible || document.hidden || time - last < FRAME_MS) return
      last = time
      draw(time)
    }

    sample()
    draw(0)
    const resize = new ResizeObserver(() => {
      sample()
      draw(performance.now())
    })
    resize.observe(canvas)
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    seen.observe(canvas)
    if (!reduceMotion) frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      seen.disconnect()
    }
  }, [])

  return (
    <div aria-hidden="true" className={`pointer-events-none ${className}`}>
      <canvas ref={canvasRef} className="h-full w-full" />
      {/* Vignette (55%) */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_45%,transparent_35%,rgba(5,5,6,0.9)_100%)]" />
    </div>
  )
}
