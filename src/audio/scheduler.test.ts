import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Score } from '../types'
import { scheduleScore, scheduleScoreOffline, stopAll } from './scheduler'
import type { Instrument } from './instrument'

function fakeInstrument(): Instrument & { start: ReturnType<typeof vi.fn> } {
  return {
    start: vi.fn(() => vi.fn()),
    instrumentNames: [],
    defaultInstrumentName: '',
    setInstrument: vi.fn().mockResolvedValue(undefined),
  }
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
    bars: [],
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scheduleScore', () => {
  it('schedules every note relative to atCtxTime when starting from 0, without a duration option', () => {
    const instrument = fakeInstrument()
    const cancelFns = scheduleScore(instrument, score(), 0, 100)

    expect(instrument.start).toHaveBeenCalledTimes(3)
    expect(instrument.start).toHaveBeenNthCalledWith(1, { note: 60, velocity: 127, time: 100 })
    expect(instrument.start).toHaveBeenNthCalledWith(2, { note: 62, velocity: 64, time: 101 })
    expect(instrument.start).toHaveBeenNthCalledWith(3, { note: 64, velocity: 0, time: 105 })
    expect(cancelFns).toHaveLength(3)
  })

  it('skips notes that fully finished before fromSec', () => {
    const instrument = fakeInstrument()
    const cancelFns = scheduleScore(instrument, score(), 3, 100)

    // note@0-1 and note@1-2 are both over by t=3; only the t=5..7 note remains
    expect(instrument.start).toHaveBeenCalledTimes(1)
    expect(instrument.start).toHaveBeenCalledWith({ note: 64, velocity: 0, time: 102 })
    expect(cancelFns).toHaveLength(1)
  })

  it('re-triggers an in-progress note immediately', () => {
    const instrument = fakeInstrument()
    scheduleScore(instrument, score(), 6, 100)

    expect(instrument.start).toHaveBeenCalledTimes(1)
    expect(instrument.start).toHaveBeenCalledWith({ note: 64, velocity: 0, time: 100 })
  })

  it('skips hidden tracks', () => {
    const instrument = fakeInstrument()
    const hidden = score({ visible: false })
    const cancelFns = scheduleScore(instrument, hidden, 0, 100)

    expect(instrument.start).not.toHaveBeenCalled()
    expect(cancelFns).toHaveLength(0)
  })

  it('stops each note itself once its own duration elapses, without a second call from us', () => {
    const stopVoice = vi.fn()
    const instrument: Instrument = { ...fakeInstrument(), start: vi.fn(() => stopVoice) }
    // A single note lasting 1s, starting immediately (fromSec === note.startSec).
    scheduleScore(instrument, score({ notes: [{ startSec: 0, durationSec: 1, midiNote: 60, velocity: 1 }] }), 0, 100)

    expect(stopVoice).not.toHaveBeenCalled()
    vi.advanceTimersByTime(999)
    expect(stopVoice).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(stopVoice).toHaveBeenCalledTimes(1)
  })

  it('cancelling before the natural end stops the voice immediately and never fires the natural-end timer', () => {
    const stopVoice = vi.fn()
    const instrument: Instrument = { ...fakeInstrument(), start: vi.fn(() => stopVoice) }
    const cancelFns = scheduleScore(
      instrument,
      score({ notes: [{ startSec: 0, durationSec: 5, midiNote: 60, velocity: 1 }] }),
      0,
      100,
    )

    vi.advanceTimersByTime(500)
    stopAll(cancelFns)
    expect(stopVoice).toHaveBeenCalledTimes(1)

    // The natural-end timer must have been cleared — advancing past it must not call stop again.
    vi.advanceTimersByTime(10000)
    expect(stopVoice).toHaveBeenCalledTimes(1)
  })
})

describe('scheduleScoreOffline', () => {
  it('schedules every note with an explicit duration, relative to fromSec, and returns nothing to cancel', () => {
    const instrument = fakeInstrument()
    scheduleScoreOffline(instrument, score(), 0)

    expect(instrument.start).toHaveBeenCalledTimes(3)
    expect(instrument.start).toHaveBeenNthCalledWith(1, { note: 60, velocity: 127, time: 0, duration: 1 })
    expect(instrument.start).toHaveBeenNthCalledWith(2, { note: 62, velocity: 64, time: 1, duration: 1 })
    expect(instrument.start).toHaveBeenNthCalledWith(3, { note: 64, velocity: 0, time: 5, duration: 2 })
  })

  it('skips notes that fully finished before fromSec', () => {
    const instrument = fakeInstrument()
    scheduleScoreOffline(instrument, score(), 3)

    expect(instrument.start).toHaveBeenCalledTimes(1)
    expect(instrument.start).toHaveBeenCalledWith({ note: 64, velocity: 0, time: 2, duration: 2 })
  })

  it('shortens a note already in progress at fromSec instead of re-triggering its full duration', () => {
    const instrument = fakeInstrument()
    scheduleScoreOffline(instrument, score(), 6)

    expect(instrument.start).toHaveBeenCalledTimes(1)
    expect(instrument.start).toHaveBeenCalledWith({ note: 64, velocity: 0, time: 0, duration: 1 })
  })

  it('skips hidden tracks', () => {
    const instrument = fakeInstrument()
    scheduleScoreOffline(instrument, score({ visible: false }), 0)

    expect(instrument.start).not.toHaveBeenCalled()
  })

  it('never sets a setTimeout (safe for faster-than-realtime offline rendering)', () => {
    const instrument = fakeInstrument()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    scheduleScoreOffline(instrument, score(), 0)
    expect(setTimeoutSpy).not.toHaveBeenCalled()
  })
})

describe('stopAll', () => {
  it('calls every cancel function returned by scheduleScore', () => {
    const cancelA = vi.fn()
    const cancelB = vi.fn()
    stopAll([cancelA, cancelB])
    expect(cancelA).toHaveBeenCalledTimes(1)
    expect(cancelB).toHaveBeenCalledTimes(1)
  })
})
