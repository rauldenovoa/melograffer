import { describe, expect, it } from 'vitest'
import { frameCount, frameTimeSec } from './frameTiming'

describe('frameCount', () => {
  it('covers a whole-second span exactly', () => {
    expect(frameCount(0, 2, 60)).toBe(120)
  })

  it('rounds fractional frame counts', () => {
    // 60fps * 1.001s = 60.06 frames
    expect(frameCount(0, 1.001, 60)).toBe(60)
  })

  it('accounts for a non-zero start', () => {
    expect(frameCount(-1, 1, 60)).toBe(120)
  })

  it('never goes negative when end precedes start', () => {
    expect(frameCount(5, 2, 60)).toBe(0)
  })
})

describe('frameTimeSec', () => {
  it('maps frame 0 to startSec', () => {
    expect(frameTimeSec(-2, 0, 60)).toBe(-2)
  })

  it('advances by 1/fps per frame', () => {
    expect(frameTimeSec(0, 60, 60)).toBe(1)
    expect(frameTimeSec(0, 30, 60)).toBeCloseTo(0.5, 10)
  })

  it('is exact at frame N = fps * duration for whole-second durations', () => {
    expect(frameTimeSec(10, 120, 60)).toBe(12)
  })
})
