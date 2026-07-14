export interface Note {
  startSec: number
  durationSec: number
  midiNote: number
  velocity: number
}

export interface Track {
  id: string
  name: string
  notes: Note[]
  color: string
  visible: boolean
}

export interface Score {
  tracks: Track[]
}
