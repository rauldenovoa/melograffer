import { describe, expect, it, vi } from 'vitest'
import type { Score } from '../types'
import { scheduleScore, stopAll } from './scheduler'
import type { Instrument } from './instrument'

function fakeInstrument(): Instrument & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } {
  return { start: vi.fn(), stop: vi.fn() }
}

function score(overrides: Partial<Score['tracks'][number]> = {}): Score {
  return {
    tracks: [
      {
        id: 't0',
        name: 'track',
        color: '#fff',
        visible: true,
        notes: [
          { startSec: 0, durationSec: 1, midiNote: 60, velocity: 1 },
          { startSec: 1, durationSec: 1, midiNote: 62, velocity: 0.5 },
          { startSec: 5, durationSec: 2, midiNote: 64, velocity: 0 },
        ],
        ...overrides,
      },
    ],
  }
}

describe('scheduleScore', () => {
  it('schedules every note relative to atCtxTime when starting from 0', () => {
    const instrument = fakeInstrument()
    scheduleScore(instrument, score(), 0, 100)

    expect(instrument.start).toHaveBeenCalledTimes(3)
    expect(instrument.start).toHaveBeenNthCalledWith(1, {
      note: 60,
      velocity: 127,
      time: 100,
      duration: 1,
    })
    expect(instrument.start).toHaveBeenNthCalledWith(2, {
      note: 62,
      velocity: 64,
      time: 101,
      duration: 1,
    })
    expect(instrument.start).toHaveBeenNthCalledWith(3, {
      note: 64,
      velocity: 0,
      time: 105,
      duration: 2,
    })
  })

  it('skips notes that fully finished before fromSec', () => {
    const instrument = fakeInstrument()
    scheduleScore(instrument, score(), 3, 100)

    // note@0-1 and note@1-2 are both over by t=3; only the t=5..7 note remains
    expect(instrument.start).toHaveBeenCalledTimes(1)
    expect(instrument.start).toHaveBeenCalledWith({
      note: 64,
      velocity: 0,
      time: 102,
      duration: 2,
    })
  })

  it('re-triggers an in-progress note immediately with a shortened duration', () => {
    const instrument = fakeInstrument()
    scheduleScore(instrument, score(), 6, 100)

    expect(instrument.start).toHaveBeenCalledTimes(1)
    expect(instrument.start).toHaveBeenCalledWith({
      note: 64,
      velocity: 0,
      time: 100,
      duration: 1,
    })
  })

  it('skips hidden tracks', () => {
    const instrument = fakeInstrument()
    const hidden = score({ visible: false })
    scheduleScore(instrument, hidden, 0, 100)

    expect(instrument.start).not.toHaveBeenCalled()
  })
})

describe('stopAll', () => {
  it('delegates to instrument.stop()', () => {
    const instrument = fakeInstrument()
    stopAll(instrument)
    expect(instrument.stop).toHaveBeenCalledTimes(1)
  })
})
