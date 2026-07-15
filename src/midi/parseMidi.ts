import { Midi } from '@tonejs/midi'
import type { Bar, Score, Track } from '../types'

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

const QUARTER_NOTES_PER_WHOLE = 4

/**
 * Bar (measure) start times from the header's time-signature map, numbered
 * continuously across signature changes. Files with no time-signature event
 * (or one that starts late) are treated as 4/4 from tick 0, matching how
 * DAWs and notation software render them.
 */
function computeBars(midi: Midi): Bar[] {
  const { header, durationTicks } = midi
  if (durationTicks <= 0) return []

  const signatures = [...header.timeSignatures].sort((a, b) => a.ticks - b.ticks)
  if (signatures.length === 0 || signatures[0].ticks > 0) {
    signatures.unshift({ ticks: 0, timeSignature: [4, 4] })
  }

  const bars: Bar[] = []
  for (let i = 0; i < signatures.length; i++) {
    const [numerator, denominator] = signatures[i].timeSignature
    const segmentEndTicks = i + 1 < signatures.length ? signatures[i + 1].ticks : durationTicks
    let barTicks = header.ppq * QUARTER_NOTES_PER_WHOLE * (numerator / denominator)
    if (!Number.isFinite(barTicks) || barTicks <= 0) {
      barTicks = header.ppq * QUARTER_NOTES_PER_WHOLE
    }

    for (let tick = signatures[i].ticks; tick < segmentEndTicks; tick += barTicks) {
      bars.push({ number: bars.length + 1, startSec: header.ticksToSeconds(tick) })
    }
  }

  return bars
}

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

  return { tracks, bars: computeBars(midi) }
}
