import type { Score } from '../types'
import { loadInstrument } from '../audio/instrument'
import { scheduleScoreOffline } from '../audio/scheduler'
import { externalAudioStartParams } from '../audio/externalAudio'

const EXPORT_SAMPLE_RATE = 44100
const EXPORT_CHANNELS = 2

export interface RenderAudioOptions {
  score: Score
  /** Persisted instrument choice ('' = the synth's built-in default). Ignored in external-audio mode. */
  instrumentName: string
  /** When set, plays this decoded file instead of the SoundFont synth (Flow 2 / Audio B). */
  externalBuffer: AudioBuffer | null
  /** Offset in seconds, same convention as ExternalAudioPlayer/externalAudioStartParams. */
  externalOffsetSec: number
  /** Timeline bounds to render, matching the video frame range (App.tsx's playbackStartSec/EndSec). */
  startSec: number
  endSec: number
}

/**
 * Renders the export's audio track offline — the synth (Audio A) via an
 * OfflineAudioContext SoundFont render, or the uploaded file (Audio B)
 * offset-shifted into the same window — so the exporter can mux it
 * deterministically alongside the frame-by-frame video (SPEC §3 Flow 3).
 */
export async function renderAudioTrack(opts: RenderAudioOptions): Promise<AudioBuffer> {
  const { score, instrumentName, externalBuffer, externalOffsetSec, startSec, endSec } = opts
  const lengthSec = Math.max(endSec - startSec, 0)
  const offlineCtx = new OfflineAudioContext(
    EXPORT_CHANNELS,
    Math.ceil(lengthSec * EXPORT_SAMPLE_RATE),
    EXPORT_SAMPLE_RATE,
  )

  if (externalBuffer) {
    const params = externalAudioStartParams(startSec, externalOffsetSec, externalBuffer.duration)
    if (params) {
      const source = offlineCtx.createBufferSource()
      source.buffer = externalBuffer
      source.connect(offlineCtx.destination)
      source.start(params.whenDelaySec, params.bufferOffsetSec)
    }
  } else {
    const instrument = await loadInstrument(offlineCtx)
    if (instrumentName && instrumentName !== instrument.defaultInstrumentName) {
      await instrument.setInstrument(instrumentName)
    }
    scheduleScoreOffline(instrument, score, startSec)
  }

  return offlineCtx.startRendering()
}
