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
  showBarLines: boolean
  showBarNumbers: boolean
  /** Lines connecting consecutive notes within a voice (MAM "part motion" look). */
  showConnectingLines: boolean
  /** Silent bars before the first note (playback starts at negative time). */
  leadInBars: number
  /** Silent bars after the last note before playback stops. */
  leadOutBars: number
  /** Persisted instrument choice; '' means "use the synth's built-in default". */
  instrumentName: string
  /** MP4 export aspect preset: 'landscape' = 1920x1080 (YouTube), 'portrait' = 1080x1920 (Reels/Stories). */
  exportAspect: 'landscape' | 'portrait'
}
