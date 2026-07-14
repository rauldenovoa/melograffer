import type { Score, VizConfig } from '../types'
import {
  computePitchRange,
  isNoteActive,
  isNoteInWindow,
  pitchToY,
  radiusForDuration,
  visibleTimeWindow,
  xForNoteStart,
} from './mapping'

const INACTIVE_ALPHA = 0.65
const HALO_ALPHA = 0.35
const HALO_PADDING_PX = 4

const TAU = Math.PI * 2

export interface CanvasLike2D {
  canvas: { width: number; height: number }
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  globalAlpha: number
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  fill(): void
  stroke(): void
}

export function drawFrame(
  ctx: CanvasLike2D,
  score: Score,
  config: VizConfig,
  timeSec: number,
): void {
  const { width, height } = ctx.canvas

  ctx.globalAlpha = 1
  ctx.fillStyle = config.bg
  ctx.fillRect(0, 0, width, height)

  const pitchRange = computePitchRange(score)
  const window = visibleTimeWindow(timeSec, config, width)

  for (const track of score.tracks) {
    if (!track.visible) continue

    for (const note of track.notes) {
      if (!isNoteInWindow(note, window)) continue

      const x = xForNoteStart(note.startSec, timeSec, config, width)
      const y = pitchToY(note.midiNote, height, pitchRange)
      const radius = radiusForDuration(note.durationSec, config.dotScale, config.radiusMode)
      const active = isNoteActive(note, timeSec)

      // Halo is drawn before the dot so the dot's edge stays crisp on top of it.
      if (active) {
        ctx.globalAlpha = HALO_ALPHA
        ctx.strokeStyle = track.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(x, y, radius + HALO_PADDING_PX, 0, TAU)
        ctx.stroke()
      }

      ctx.globalAlpha = active ? 1 : INACTIVE_ALPHA
      ctx.fillStyle = track.color
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, TAU)
      ctx.fill()
    }
  }

  ctx.globalAlpha = 1
}
