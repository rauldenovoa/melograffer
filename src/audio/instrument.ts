import { Soundfont2 } from 'smplr'
import { GeneratorType, SoundFont2 } from 'soundfont2'

const SOUNDFONT_URL = '/soundfonts/ChaosBank.sf2'

// ChaosBank.sf2 prepends a batch of SC-88 Pro drum/synth patches (its
// instrumentNames[0] is a buzzy "Square Wave" synth lead) before the actual
// General MIDI bank. Default to the real acoustic piano rather than
// whatever happens to sort first; fall back to index 0 if a future
// soundfont swap doesn't have anything matching "piano".
const PREFERRED_INSTRUMENT_PATTERN = /piano/i

/**
 * Per the SF2 spec, a sample header's originalPitch byte of 255 means
 * "unset" (parsers must fall back to 60 — the soundfont2 lib does), and the
 * authoritative root key then comes from the zone-level OverridingRootKey
 * generator (id 58). smplr's SF2→preset conversion reads only the header
 * byte and ignores gen 58, so every zone of a multi-sampled instrument
 * plays as if recorded at middle C. Bake gen 58 into the header copy smplr
 * reads. Headers are cloned per zone: one sample may serve several zones,
 * each with its own root key.
 */
type ParsedInstrument = SoundFont2['instruments'][number]
// soundfont2's parser attaches a globalZone to each instrument at runtime,
// but its published Instrument typing omits it.
type WithGlobalZone = ParsedInstrument & {
  globalZone?: { generators: ParsedInstrument['zones'][number]['generators'] }
}

export function applyOverridingRootKeys(sf2: SoundFont2) {
  return {
    instruments: sf2.instruments.map((instrument: WithGlobalZone) => ({
      header: instrument.header,
      zones: instrument.zones.map((zone) => {
        const rootKey =
          zone.generators?.[GeneratorType.OverridingRootKey]?.value ??
          instrument.globalZone?.generators?.[GeneratorType.OverridingRootKey]?.value
        if (rootKey === undefined || rootKey < 0 || rootKey > 127) return zone
        return {
          ...zone,
          sample: {
            ...zone.sample,
            header: { ...zone.sample.header, originalPitch: rootKey },
          },
        }
      }),
    })),
  }
}

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
    createSoundfont: (data) => applyOverridingRootKeys(new SoundFont2(data)),
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
