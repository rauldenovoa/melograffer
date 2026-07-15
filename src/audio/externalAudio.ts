export interface ExternalAudioStart {
  /** Seconds to wait (from "now") before the source starts playing. */
  whenDelaySec: number
  /** Position inside the buffer to start playing from. */
  bufferOffsetSec: number
}

/**
 * Maps a play request at MIDI-timeline position `fromSec` onto an
 * AudioBufferSourceNode start. `offsetSec` shifts the audio relative to the
 * score: positive = audio sounds later (buffer position p is heard at MIDI
 * time p + offsetSec). Returns null when the whole buffer already lies in
 * the past at `fromSec`.
 */
export function externalAudioStartParams(
  fromSec: number,
  offsetSec: number,
  bufferDurationSec: number,
): ExternalAudioStart | null {
  const bufferPos = fromSec - offsetSec
  if (bufferPos >= bufferDurationSec) return null
  if (bufferPos < 0) {
    return { whenDelaySec: -bufferPos, bufferOffsetSec: 0 }
  }
  return { whenDelaySec: 0, bufferOffsetSec: bufferPos }
}

/**
 * Plays a decoded user-supplied audio file (SPEC §2 Flow 2) in place of the
 * SoundFont synth. One-shot sources: every (re)start builds a fresh node.
 */
export class ExternalAudioPlayer {
  private source: AudioBufferSourceNode | null = null

  constructor(
    private readonly ctx: AudioContext,
    private readonly buffer: AudioBuffer,
  ) {}

  start(fromSec: number, offsetSec: number): void {
    this.stop()
    const params = externalAudioStartParams(fromSec, offsetSec, this.buffer.duration)
    if (!params) return

    const source = this.ctx.createBufferSource()
    source.buffer = this.buffer
    source.connect(this.ctx.destination)
    source.start(this.ctx.currentTime + params.whenDelaySec, params.bufferOffsetSec)
    this.source = source
  }

  stop(): void {
    if (!this.source) return
    this.source.stop()
    this.source.disconnect()
    this.source = null
  }
}
