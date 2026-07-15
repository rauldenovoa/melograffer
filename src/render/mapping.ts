import type { Note, Score, VizConfig } from '../types'

const PITCH_PADDING_SEMITONES = 2
const MIN_PITCH_SPAN_SEMITONES = 12

const LINEAR_CAP_SECONDS = 2
const MIN_RADIUS_PX = 1

const CULL_PADDING_PX = 40

export interface PitchRange {
  min: number
  max: number
}

export function computePitchRange(score: Score): PitchRange {
  let min = Infinity
  let max = -Infinity
  for (const track of score.tracks) {
    for (const note of track.notes) {
      if (note.midiNote < min) min = note.midiNote
      if (note.midiNote > max) max = note.midiNote
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 60 - MIN_PITCH_SPAN_SEMITONES / 2, max: 60 + MIN_PITCH_SPAN_SEMITONES / 2 }
  }

  min -= PITCH_PADDING_SEMITONES
  max += PITCH_PADDING_SEMITONES

  if (max - min < MIN_PITCH_SPAN_SEMITONES) {
    const center = (min + max) / 2
    min = center - MIN_PITCH_SPAN_SEMITONES / 2
    max = center + MIN_PITCH_SPAN_SEMITONES / 2
  }

  return { min, max }
}

export function pitchToY(midiNote: number, canvasHeight: number, range: PitchRange): number {
  const t = (midiNote - range.min) / (range.max - range.min)
  return canvasHeight - t * canvasHeight
}

export function xForNoteStart(
  startSec: number,
  timeSec: number,
  config: VizConfig,
  canvasWidth: number,
): number {
  const playheadPx = config.playheadX * canvasWidth
  return playheadPx + (startSec - timeSec) * config.pxPerSec
}

/**
 * `dotScale` is relative to the canvas, not absolute pixels: it's the radius
 * of a 1-second note in 1/1000ths of canvas height (dotScale 25 on a 360px
 * canvas → 9px). Rendering the same score at 1080p (M6 export) scales the
 * dots proportionally for free.
 */
export function radiusForDuration(
  durationSec: number,
  dotScale: number,
  radiusMode: VizConfig['radiusMode'],
  canvasHeight: number,
): number {
  const scalePx = (dotScale / 1000) * canvasHeight
  const raw =
    radiusMode === 'linear'
      ? scalePx * Math.min(durationSec, LINEAR_CAP_SECONDS)
      : scalePx * Math.sqrt(Math.max(durationSec, 0))
  return Math.max(raw, MIN_RADIUS_PX)
}

export function isNoteActive(note: Note, timeSec: number): boolean {
  return timeSec >= note.startSec && timeSec < note.startSec + note.durationSec
}

export interface TimeWindow {
  startSec: number
  endSec: number
}

export function visibleTimeWindow(
  timeSec: number,
  config: VizConfig,
  canvasWidth: number,
): TimeWindow {
  const playheadPx = config.playheadX * canvasWidth
  return {
    startSec: timeSec - (playheadPx + CULL_PADDING_PX) / config.pxPerSec,
    endSec: timeSec + (canvasWidth - playheadPx + CULL_PADDING_PX) / config.pxPerSec,
  }
}

export function isNoteInWindow(note: Note, window: TimeWindow): boolean {
  return note.startSec >= window.startSec && note.startSec <= window.endSec
}

export function scoreDurationSec(score: Score): number {
  let max = 0
  for (const track of score.tracks) {
    for (const note of track.notes) {
      const end = note.startSec + note.durationSec
      if (end > max) max = end
    }
  }
  return max
}
