import { Midi } from '@tonejs/midi'
import type { Score, Track } from '../types'

const TRACK_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
]

export function parseMidi(data: ArrayBuffer): Score {
  const midi = new Midi(new Uint8Array(data))

  const tracks: Track[] = midi.tracks.map((track, i) => ({
    id: `t${i}`,
    name: track.name || track.instrument?.name || `Track ${i + 1}`,
    notes: track.notes.map((note) => ({
      startSec: note.time,
      durationSec: note.duration,
      midiNote: note.midi,
      velocity: note.velocity,
    })),
    color: TRACK_COLORS[i % TRACK_COLORS.length],
    visible: true,
  }))

  return { tracks }
}
