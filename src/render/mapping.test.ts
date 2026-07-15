import { describe, expect, it } from 'vitest'
import {
  barDurationsSec,
  computePitchRange,
  isNoteActive,
  isNoteInWindow,
  pitchToY,
  radiusForDuration,
  scoreDurationSec,
  visibleTimeWindow,
} from './mapping'
import type { Note, Score } from '../types'
import { DEFAULT_VIZ_CONFIG } from './defaultConfig'

function note(overrides: Partial<Note> = {}): Note {
  return { startSec: 0, durationSec: 1, midiNote: 60, velocity: 1, ...overrides }
}

function scoreOf(notes: Note[]): Score {
  return { tracks: [{ id: 't0', name: 'track', notes, color: '#fff', visible: true }], bars: [] }
}

describe('radiusForDuration', () => {
  it('sqrt mode: half-note area is exactly 2x quarter-note area', () => {
    const quarter = radiusForDuration(0.5, 25, 'sqrt', 360)
    const half = radiusForDuration(1.0, 25, 'sqrt', 360)
    const areaRatio = (half / quarter) ** 2
    expect(areaRatio).toBeCloseTo(2)
  })

  it('scales relative to canvas height: same score at 1080p gets 3x the dot radius of 360p', () => {
    const at360 = radiusForDuration(1, 25, 'sqrt', 360)
    const at1080 = radiusForDuration(1, 25, 'sqrt', 1080)
    expect(at360).toBe(9)
    expect(at1080 / at360).toBeCloseTo(3)
  })

  it('linear mode: radius stops growing past the cap', () => {
    const atCap = radiusForDuration(2, 25, 'linear', 360)
    const beyondCap = radiusForDuration(10, 25, 'linear', 360)
    expect(beyondCap).toBe(atCap)
  })

  it('never goes below the minimum radius', () => {
    expect(radiusForDuration(0, 25, 'sqrt', 360)).toBeGreaterThanOrEqual(1)
  })
})

describe('pitchToY', () => {
  it('maps a higher MIDI note to a smaller y (higher on screen)', () => {
    const range = { min: 48, max: 72 }
    const yHigh = pitchToY(72, 400, range)
    const yLow = pitchToY(48, 400, range)
    expect(yHigh).toBeLessThan(yLow)
  })

  it('is monotonic across a sweep of note numbers', () => {
    const range = { min: 21, max: 108 }
    const ys = []
    for (let n = range.min; n <= range.max; n++) ys.push(pitchToY(n, 400, range))
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1])
  })
})

describe('computePitchRange', () => {
  it('spans padded min/max across all tracks', () => {
    const score = scoreOf([note({ midiNote: 40 }), note({ midiNote: 76 })])
    const range = computePitchRange(score)
    expect(range.min).toBeLessThan(40)
    expect(range.max).toBeGreaterThan(76)
  })

  it('does not divide by zero for a single-pitch score', () => {
    const score = scoreOf([note({ midiNote: 60 }), note({ midiNote: 60 })])
    const range = computePitchRange(score)
    expect(range.max - range.min).toBeGreaterThan(0)
    expect(Number.isFinite(pitchToY(60, 400, range))).toBe(true)
  })

  it('returns a sane default range for an empty score', () => {
    const range = computePitchRange(scoreOf([]))
    expect(range.max - range.min).toBeGreaterThan(0)
  })
})

describe('isNoteActive', () => {
  it('is active at the exact start (inclusive)', () => {
    expect(isNoteActive(note({ startSec: 1, durationSec: 1 }), 1)).toBe(true)
  })

  it('is not active at start+duration (exclusive)', () => {
    expect(isNoteActive(note({ startSec: 1, durationSec: 1 }), 2)).toBe(false)
  })
})

describe('visibleTimeWindow / isNoteInWindow', () => {
  it('includes a note just inside the window and excludes one just outside', () => {
    const window = visibleTimeWindow(10, DEFAULT_VIZ_CONFIG, 960)
    const justInside = note({ startSec: window.endSec - 0.01 })
    const justOutside = note({ startSec: window.endSec + 1 })
    expect(isNoteInWindow(justInside, window)).toBe(true)
    expect(isNoteInWindow(justOutside, window)).toBe(false)
  })
})

describe('barDurationsSec', () => {
  it('measures the first and last bar separately (tempo may differ)', () => {
    const score: Score = {
      ...scoreOf([]),
      bars: [
        { number: 1, startSec: 0 },
        { number: 2, startSec: 2 },
        { number: 3, startSec: 3.5 }, // faster tempo at the end
        { number: 4, startSec: 5 },
      ],
    }
    expect(barDurationsSec(score)).toEqual({ first: 2, last: 1.5 })
  })

  it('falls back to 2s bars when the score has fewer than two bars', () => {
    expect(barDurationsSec(scoreOf([]))).toEqual({ first: 2, last: 2 })
  })
})

describe('scoreDurationSec', () => {
  it('is 0 for an empty score', () => {
    expect(scoreDurationSec(scoreOf([]))).toBe(0)
  })

  it('is the max note end across all tracks', () => {
    const score: Score = {
      tracks: [
        { id: 't0', name: 'a', notes: [note({ startSec: 0, durationSec: 1 })], color: '#fff', visible: true },
        { id: 't1', name: 'b', notes: [note({ startSec: 5, durationSec: 2 })], color: '#000', visible: true },
      ],
      bars: [],
    }
    expect(scoreDurationSec(score)).toBe(7)
  })
})
