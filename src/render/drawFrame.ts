import type { Note, Score, VizConfig } from '../types'
import {
  computePitchRange,
  decayEnvelope,
  isNoteActive,
  isNoteInWindow,
  pitchToY,
  radiusForDuration,
  visibleTimeWindow,
  xForNoteStart,
} from './mapping'

const INACTIVE_ALPHA = 0.65
const RING_LINE_WIDTH = 2

// Mid-gray stays legible over both dark and light configurable backgrounds.
const BAR_LINE_COLOR = '#888888'
const BAR_LINE_ALPHA = 0.3
const BAR_NUMBER_ALPHA = 0.7
const BAR_NUMBER_FONT = '11px sans-serif'
const BAR_NUMBER_OFFSET_X_PX = 4
const BAR_NUMBER_OFFSET_Y_PX = 4

const CONNECTING_LINE_ALPHA = 0.35
const CONNECTING_LINE_WIDTH = 1.5

const TAU = Math.PI * 2

export interface CanvasLike2D {
  canvas: { width: number; height: number }
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  globalAlpha: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
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

  if (config.showBarLines || config.showBarNumbers) {
    ctx.font = BAR_NUMBER_FONT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    for (const bar of score.bars) {
      if (bar.startSec < window.startSec || bar.startSec > window.endSec) continue
      const x = xForNoteStart(bar.startSec, timeSec, config, width)

      if (config.showBarLines) {
        ctx.globalAlpha = BAR_LINE_ALPHA
        ctx.strokeStyle = BAR_LINE_COLOR
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }

      if (config.showBarNumbers) {
        ctx.globalAlpha = BAR_NUMBER_ALPHA
        ctx.fillStyle = BAR_LINE_COLOR
        ctx.fillText(String(bar.number), x + BAR_NUMBER_OFFSET_X_PX, BAR_NUMBER_OFFSET_Y_PX)
      }
    }
  }

  // Separate pass so every dot sits above every voice's connecting lines.
  if (config.showConnectingLines) {
    for (const track of score.tracks) {
      if (!track.visible) continue

      ctx.globalAlpha = CONNECTING_LINE_ALPHA
      ctx.strokeStyle = track.color
      ctx.lineWidth = CONNECTING_LINE_WIDTH
      for (let i = 0; i + 1 < track.notes.length; i++) {
        const a = track.notes[i]
        const b = track.notes[i + 1]
        // Segment culling: notes are in start-time order, so the segment is
        // visible iff it overlaps the window on the time axis.
        if (b.startSec < window.startSec || a.startSec > window.endSec) continue

        ctx.beginPath()
        ctx.moveTo(xForNoteStart(a.startSec, timeSec, config, width), pitchToY(a.midiNote, height, pitchRange))
        ctx.lineTo(xForNoteStart(b.startSec, timeSec, config, width), pitchToY(b.midiNote, height, pitchRange))
        ctx.stroke()
      }
    }
  }

  // 0 for a finished note, 1 at onset, exponential in between.
  const soundEnvelope = (note: Note) =>
    decayEnvelope(
      note.durationSec > 0 ? (timeSec - note.startSec) / note.durationSec : 1,
    )

  for (const track of score.tracks) {
    if (!track.visible) continue

    for (const note of track.notes) {
      const radius = radiusForDuration(note.durationSec, config.dotScale, config.radiusMode, height)
      if (!isNoteInWindow(note, window, radius / config.pxPerSec)) continue

      const x = xForNoteStart(note.startSec, timeSec, config, width)
      const y = pitchToY(note.midiNote, height, pitchRange)

      if (timeSec < note.startSec) {
        // Not yet played: filled dot, slightly transparent.
        ctx.globalAlpha = INACTIVE_ALPHA
        ctx.fillStyle = track.color
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, TAU)
        ctx.fill()
      } else {
        // From the instant a note sounds its fill goes transparent forever;
        // the outline flashes fully opaque and decays back to the resting
        // alpha across the note's own length. Past notes stay hollow rings.
        ctx.globalAlpha = INACTIVE_ALPHA + (1 - INACTIVE_ALPHA) * soundEnvelope(note)
        ctx.strokeStyle = track.color
        ctx.lineWidth = RING_LINE_WIDTH
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, TAU)
        ctx.stroke()
      }
    }
  }

  // Sounding-note clones ride the playhead on top of everything: opaque at
  // onset, fading and shrinking to nothing by note end. No window culling —
  // a long note whose start dot scrolled off is still sounding.
  for (const track of score.tracks) {
    if (!track.visible) continue

    for (const note of track.notes) {
      if (!isNoteActive(note, timeSec)) continue

      const envelope = soundEnvelope(note)
      const radius =
        radiusForDuration(note.durationSec, config.dotScale, config.radiusMode, height) * envelope
      if (radius <= 0) continue

      ctx.globalAlpha = INACTIVE_ALPHA + (1 - INACTIVE_ALPHA) * envelope
      ctx.fillStyle = track.color
      ctx.beginPath()
      ctx.arc(config.playheadX * width, pitchToY(note.midiNote, height, pitchRange), radius, 0, TAU)
      ctx.fill()
    }
  }

  ctx.globalAlpha = 1
}
