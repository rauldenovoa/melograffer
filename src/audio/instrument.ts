import { Soundfont2 } from 'smplr'
import { SoundFont2 } from 'soundfont2'

const SOUNDFONT_URL = '/soundfonts/ChaosBank.sf2'

// ChaosBank.sf2 prepends a batch of SC-88 Pro drum/synth patches (its
// instrumentNames[0] is a buzzy "Square Wave" synth lead) before the actual
// General MIDI bank. Default to the real acoustic piano rather than
// whatever happens to sort first; fall back to index 0 if a future
// soundfont swap doesn't have anything matching "piano".
const PREFERRED_INSTRUMENT_PATTERN = /piano/i

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

  const instrumentName =
    sampler.instrumentNames.find((name) => PREFERRED_INSTRUMENT_PATTERN.test(name)) ?? sampler.instrumentNames[0]
  if (instrumentName) {
    await sampler.loadInstrument(instrumentName)
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
