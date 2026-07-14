import { Soundfont2 } from 'smplr'
import { SoundFont2 } from 'soundfont2'

const SOUNDFONT_URL = '/soundfonts/ChaosBank.sf2'

export interface Instrument {
  /**
   * Starts a note with no end time and returns a function that stops it.
   * Deliberately excludes `duration` — smplr pre-schedules a note's own
   * release the moment `duration` is passed to it, which consumes the
   * underlying voice's one-shot (idempotent) stop() call and makes any
   * later stop from us a silent no-op. Callers own ending the note.
   */
  start(opts: { note: number; velocity: number; time: number }): () => void
}

export async function loadInstrument(ctx: BaseAudioContext): Promise<Instrument> {
  const sampler = Soundfont2(ctx, {
    url: SOUNDFONT_URL,
    createSoundfont: (data) => new SoundFont2(data),
  })
  await sampler.ready

  const [firstInstrumentName] = sampler.instrumentNames
  if (firstInstrumentName) {
    await sampler.loadInstrument(firstInstrumentName)
  }

  let nextStopId = 0

  return {
    start(opts) {
      // smplr's stopId defaults to the note number, so two overlapping notes
      // of the same pitch (common across tracks) would otherwise share one —
      // stopping either voice would stop both. A unique id per call keeps
      // each returned stop function scoped to only the voice it started.
      return sampler.start({ ...opts, stopId: nextStopId++ })
    },
  }
}
