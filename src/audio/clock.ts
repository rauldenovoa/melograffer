type PlaybackStatus = 'paused' | 'playing'

/**
 * Tracks playback position against an injected clock (real `AudioContext.currentTime`
 * in the app, a fake counter in tests). Never Date.now()/performance.now() — see CLAUDE.md.
 */
export class PlaybackClock {
  private status: PlaybackStatus = 'paused'
  private anchorSec = 0
  private startedAtCtxTime = 0

  constructor(private readonly now: () => number) {}

  get isPlaying(): boolean {
    return this.status === 'playing'
  }

  play(fromSec: number): void {
    this.anchorSec = fromSec
    this.startedAtCtxTime = this.now()
    this.status = 'playing'
  }

  pause(): void {
    this.anchorSec = this.getCurrentTimeSec()
    this.status = 'paused'
  }

  seek(sec: number): void {
    this.anchorSec = sec
    if (this.status === 'playing') {
      this.startedAtCtxTime = this.now()
    }
  }

  getCurrentTimeSec(): number {
    if (this.status === 'playing') {
      return this.anchorSec + (this.now() - this.startedAtCtxTime)
    }
    return this.anchorSec
  }
}
