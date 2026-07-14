import type { Score } from '../types'
import type { Instrument } from './instrument'

const MIDI_VELOCITY_SCALE = 127

/**
 * Schedules every visible-track note whose sounding window hasn't fully
 * elapsed by `fromSec`, at Web-Audio-native `time` offsets from `atCtxTime`
 * (audioContext.currentTime at the moment playback starts). Notes already
 * in progress at `fromSec` are re-triggered immediately with a shortened
 * duration rather than resumed mid-sample.
 */
export function scheduleScore(
  instrument: Instrument,
  score: Score,
  fromSec: number,
  atCtxTime: number,
): void {
  for (const track of score.tracks) {
    if (!track.visible) continue

    for (const note of track.notes) {
      const endSec = note.startSec + note.durationSec
      if (endSec <= fromSec) continue

      const soundingFromSec = Math.max(note.startSec, fromSec)
      instrument.start({
        note: note.midiNote,
        velocity: Math.round(note.velocity * MIDI_VELOCITY_SCALE),
        time: atCtxTime + (soundingFromSec - fromSec),
        duration: endSec - soundingFromSec,
      })
    }
  }
}

export function stopAll(instrument: Instrument): void {
  instrument.stop()
}
