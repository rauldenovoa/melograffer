import type { Score } from '../types'
import type { Instrument } from './instrument'

const MIDI_VELOCITY_SCALE = 127

/**
 * Schedules every visible-track note whose sounding window hasn't fully
 * elapsed by `fromSec`, at Web-Audio-native `time` offsets from `atCtxTime`
 * (audioContext.currentTime at the moment playback starts). Notes already
 * in progress at `fromSec` are re-triggered immediately with a shortened
 * duration rather than resumed mid-sample.
 *
 * Each note's natural end is driven by our own setTimeout rather than
 * smplr's `duration` option (see instrument.ts) — that keeps the voice's
 * one-shot stop() available for early cancellation (pause/seek/new file),
 * whichever comes first. Returns the per-note cancel functions so the
 * caller can reliably stop everything early.
 */
export function scheduleScore(
  instrument: Instrument,
  score: Score,
  fromSec: number,
  atCtxTime: number,
): Array<() => void> {
  const cancelFns: Array<() => void> = []

  for (const track of score.tracks) {
    if (!track.visible) continue

    for (const note of track.notes) {
      const endSec = note.startSec + note.durationSec
      if (endSec <= fromSec) continue

      const soundingFromSec = Math.max(note.startSec, fromSec)
      const stopVoice = instrument.start({
        note: note.midiNote,
        velocity: Math.round(note.velocity * MIDI_VELOCITY_SCALE),
        time: atCtxTime + (soundingFromSec - fromSec),
      })

      const naturalEndDelayMs = (endSec - fromSec) * 1000
      const timeoutId = setTimeout(stopVoice, naturalEndDelayMs)

      cancelFns.push(() => {
        clearTimeout(timeoutId)
        stopVoice()
      })
    }
  }

  return cancelFns
}

export function stopAll(cancelFns: Array<() => void>): void {
  for (const cancel of cancelFns) cancel()
}
