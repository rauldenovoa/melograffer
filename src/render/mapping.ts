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

/** Inverse of xForNoteStart: the score time rendered at pixel column x. */
export function timeAtX(
  xPx: number,
  timeSec: number,
  config: VizConfig,
  canvasWidth: number,
): number {
  const playheadPx = config.playheadX * canvasWidth
  return timeSec + (xPx - playheadPx) / config.pxPerSec
}

/** Small dots stay clickable: hit radius never shrinks below this. */
const MIN_HIT_RADIUS_PX = 6

/**
 * The visible note whose dot contains (or is nearest to, within its hit
 * radius) the given canvas point — for click-to-seek. Null on empty space.
 */
export function findNoteAt(
  score: Score,
  config: VizConfig,
  timeSec: number,
  canvasWidth: number,
  canvasHeight: number,
  xPx: number,
  yPx: number,
): Note | null {
  const pitchRange = computePitchRange(score)
  const window = visibleTimeWindow(timeSec, config, canvasWidth)

  let best: Note | null = null
  let bestDist2 = Infinity
  for (const track of score.tracks) {
    if (!track.visible) continue
    for (const note of track.notes) {
      if (!isNoteInWindow(note, window)) continue
      const x = xForNoteStart(note.startSec, timeSec, config, canvasWidth)
      const y = pitchToY(note.midiNote, canvasHeight, pitchRange)
      const hitR = Math.max(
        radiusForDuration(note.durationSec, config.dotScale, config.radiusMode, canvasHeight),
        MIN_HIT_RADIUS_PX,
      )
      const dist2 = (x - xPx) ** 2 + (y - yPx) ** 2
      if (dist2 <= hitR * hitR && dist2 < bestDist2) {
        best = note
        bestDist2 = dist2
      }
    }
  }
  return best
}

/**
 * Higher = steeper early drop. 5 ≈ a struck-string feel: half gone in the
 * first ~15% of the note.
 */
const DECAY_RATE = 5

/**
 * Exponential decay from 1 (note onset) to exactly 0 (note end), like a real
 * sound wave's amplitude envelope — normalized so it reaches 0 at progress 1
 * instead of approaching it asymptotically.
 */
export function decayEnvelope(progress: number): number {
  if (progress <= 0) return 1
  if (progress >= 1) return 0
  const floor = Math.exp(-DECAY_RATE)
  return (Math.exp(-DECAY_RATE * progress) - floor) / (1 - floor)
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

/** 4/4 at 120bpm — used when a score has too few bars to measure one. */
const FALLBACK_BAR_SEC = 2

/**
 * Duration of the score's first and last measured bar, for sizing the
 * lead-in/lead-out silence in "bars" even when tempo changes mid-piece.
 */
export function barDurationsSec(score: Score): { first: number; last: number } {
  const bars = score.bars
  if (bars.length < 2) return { first: FALLBACK_BAR_SEC, last: FALLBACK_BAR_SEC }
  return {
    first: bars[1].startSec - bars[0].startSec,
    last: bars[bars.length - 1].startSec - bars[bars.length - 2].startSec,
  }
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
