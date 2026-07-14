import { describe, expect, it } from 'vitest'
import { PlaybackClock } from './clock'

function fakeClockSource(start = 0) {
  let t = start
  return { now: () => t, advance: (dt: number) => (t += dt) }
}

describe('PlaybackClock', () => {
  it('starts paused at 0', () => {
    const clock = new PlaybackClock(fakeClockSource().now)
    expect(clock.isPlaying).toBe(false)
    expect(clock.getCurrentTimeSec()).toBe(0)
  })

  it('advances with the injected clock while playing', () => {
    const src = fakeClockSource(100)
    const clock = new PlaybackClock(src.now)

    clock.play(5)
    expect(clock.isPlaying).toBe(true)
    expect(clock.getCurrentTimeSec()).toBe(5)

    src.advance(2.5)
    expect(clock.getCurrentTimeSec()).toBe(7.5)
  })

  it('freezes position on pause', () => {
    const src = fakeClockSource(0)
    const clock = new PlaybackClock(src.now)

    clock.play(0)
    src.advance(3)
    clock.pause()
    expect(clock.isPlaying).toBe(false)
    expect(clock.getCurrentTimeSec()).toBe(3)

    src.advance(10)
    expect(clock.getCurrentTimeSec()).toBe(3)
  })

  it('seeking while paused just moves the anchor', () => {
    const src = fakeClockSource(0)
    const clock = new PlaybackClock(src.now)

    clock.seek(42)
    expect(clock.getCurrentTimeSec()).toBe(42)

    src.advance(5)
    expect(clock.getCurrentTimeSec()).toBe(42)
  })

  it('seeking while playing rebases the anchor to the new clock reading', () => {
    const src = fakeClockSource(0)
    const clock = new PlaybackClock(src.now)

    clock.play(0)
    src.advance(10)
    clock.seek(20)
    expect(clock.getCurrentTimeSec()).toBe(20)

    src.advance(1)
    expect(clock.getCurrentTimeSec()).toBe(21)
  })

  it('resuming after pause continues from the paused position', () => {
    const src = fakeClockSource(0)
    const clock = new PlaybackClock(src.now)

    clock.play(0)
    src.advance(4)
    clock.pause()
    src.advance(100) // time passes while paused; must not leak into position

    clock.play(clock.getCurrentTimeSec())
    src.advance(1)
    expect(clock.getCurrentTimeSec()).toBe(5)
  })
})
