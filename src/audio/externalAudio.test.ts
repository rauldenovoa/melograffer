import { describe, expect, it, vi } from 'vitest'
import { ExternalAudioPlayer, externalAudioStartParams } from './externalAudio'

describe('externalAudioStartParams', () => {
  it('starts mid-buffer when playing from mid-piece with no offset', () => {
    expect(externalAudioStartParams(10, 0, 60)).toEqual({ whenDelaySec: 0, bufferOffsetSec: 10 })
  })

  it('positive offset shifts audio later: buffer position lags MIDI time', () => {
    expect(externalAudioStartParams(10, 0.25, 60)).toEqual({
      whenDelaySec: 0,
      bufferOffsetSec: 9.75,
    })
  })

  it('negative offset shifts audio earlier', () => {
    expect(externalAudioStartParams(10, -0.25, 60)).toEqual({
      whenDelaySec: 0,
      bufferOffsetSec: 10.25,
    })
  })

  it('delays the start instead of using a negative buffer position', () => {
    expect(externalAudioStartParams(0, 0.5, 60)).toEqual({ whenDelaySec: 0.5, bufferOffsetSec: 0 })
  })

  it('returns null when the buffer is entirely in the past', () => {
    expect(externalAudioStartParams(61, 0, 60)).toBeNull()
    expect(externalAudioStartParams(60, 0, 60)).toBeNull()
  })
})

function fakeCtx(currentTime = 0) {
  const sources: Array<{
    buffer: unknown
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }> = []
  const ctx = {
    currentTime,
    destination: {},
    createBufferSource: vi.fn(() => {
      const source = {
        buffer: null as unknown,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      sources.push(source)
      return source
    }),
  }
  return { ctx: ctx as unknown as AudioContext, sources }
}

describe('ExternalAudioPlayer', () => {
  const buffer = { duration: 60 } as AudioBuffer

  it('starts a source at the offset-adjusted buffer position', () => {
    const { ctx, sources } = fakeCtx(100)
    const player = new ExternalAudioPlayer(ctx, buffer)
    player.start(10, 0.25)

    expect(sources).toHaveLength(1)
    expect(sources[0].buffer).toBe(buffer)
    expect(sources[0].start).toHaveBeenCalledWith(100, 9.75)
  })

  it('restarting stops the previous source first; stop() is idempotent', () => {
    const { ctx, sources } = fakeCtx()
    const player = new ExternalAudioPlayer(ctx, buffer)
    player.start(0, 0)
    player.start(5, 0)

    expect(sources).toHaveLength(2)
    expect(sources[0].stop).toHaveBeenCalledOnce()
    expect(sources[1].stop).not.toHaveBeenCalled()

    player.stop()
    player.stop()
    expect(sources[1].stop).toHaveBeenCalledOnce()
  })

  it('creates no source when playback begins past the end of the buffer', () => {
    const { ctx, sources } = fakeCtx()
    const player = new ExternalAudioPlayer(ctx, buffer)
    player.start(75, 0)

    expect(sources).toHaveLength(0)
  })
})
