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

export interface Bar {
  /** 1-based measure number, continuous across time-signature changes. */
  number: number
  startSec: number
}

export interface Score {
  tracks: Track[]
  bars: Bar[]
}

export interface VizConfig {
  bg: string
  pxPerSec: number
  dotScale: number
  radiusMode: 'sqrt' | 'linear'
  /** Fraction of canvas width (0..1) where the fixed playhead sits. */
  playheadX: number
}
