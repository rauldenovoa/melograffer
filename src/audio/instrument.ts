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
 * smplr's SF2→preset conversion reads only the raw sample headers and ignores
 * the zone generators that the SF2 spec says amend them. This rewrites each
 * zone's header copy so the values smplr does read are the spec-correct ones:
 *
 * - Root key: an originalPitch byte of 255 means "unset" (parsers fall back
 *   to 60 — the soundfont2 lib does), and the authoritative root key then
 *   comes from gen 58 (OverridingRootKey). Without this, every zone of a
 *   multi-sampled instrument plays as if recorded at middle C.
 * - Looping: gen 54 (SampleModes) defaults to 0 = "no loop", but smplr loops
 *   whenever the header carries loop points. Gens 2/3 (+ coarse 45/50) shift
 *   the header loop points per zone — e.g. ChaosBank's piano headers nominally
 *   loop the whole sample, attack included, and rely on these offsets to
 *   narrow the loop to a short sustain tail. Ignoring them re-strikes the
 *   attack transient on every loop wrap: audible "ghost" repeats of any note
 *   held longer than its sample. Mode 3 ("loop until release") is approximated
 *   as a continuous loop — smplr has no way to exit a loop at note-off.
 *
 * Headers are cloned per zone: one sample may serve several zones, each with
 * its own root key and loop window.
 */
type ParsedInstrument = SoundFont2['instruments'][number]
// soundfont2's parser attaches a globalZone to each instrument at runtime,
// but its published Instrument typing omits it.
type WithGlobalZone = ParsedInstrument & {
  globalZone?: { generators: ParsedInstrument['zones'][number]['generators'] }
}

const SAMPLE_MODE_LOOP_CONTINUOUS = 1
const SAMPLE_MODE_LOOP_UNTIL_RELEASE = 3
const COARSE_OFFSET_UNIT = 32768

export function applyZoneGenerators(sf2: SoundFont2) {
  return {
    instruments: sf2.instruments.map((instrument: WithGlobalZone) => ({
      header: instrument.header,
      zones: instrument.zones.map((zone) => {
        // Per the SF2 spec, a local zone's generator supersedes the
        // instrument's global zone generator of the same type.
        const gen = (type: GeneratorType) =>
          zone.generators?.[type]?.value ??
          instrument.globalZone?.generators?.[type]?.value

        const header = { ...zone.sample.header }

        const rootKey = gen(GeneratorType.OverridingRootKey)
        if (rootKey !== undefined && rootKey >= 0 && rootKey <= 127) {
          header.originalPitch = rootKey
        }

        const mode = gen(GeneratorType.SampleModes) ?? 0
        const loops =
          mode === SAMPLE_MODE_LOOP_CONTINUOUS || mode === SAMPLE_MODE_LOOP_UNTIL_RELEASE
        const startLoop = loops
          ? header.startLoop +
            (gen(GeneratorType.StartLoopAddrsOffset) ?? 0) +
            COARSE_OFFSET_UNIT * (gen(GeneratorType.StartLoopAddrsCoarseOffset) ?? 0)
          : 0
        const endLoop = loops
          ? header.endLoop +
            (gen(GeneratorType.EndLoopAddrsOffset) ?? 0) +
            COARSE_OFFSET_UNIT * (gen(GeneratorType.EndLoopAddrsCoarseOffset) ?? 0)
          : 0
        if (loops && startLoop >= 0 && endLoop > startLoop && endLoop <= zone.sample.data.length) {
          header.startLoop = startLoop
          header.endLoop = endLoop
        } else {
          // startLoop === endLoop reads as "no loop" to smplr's hasLoop check.
          header.startLoop = 0
          header.endLoop = 0
        }

        return { ...zone, sample: { ...zone.sample, header } }
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
    createSoundfont: (data) => applyZoneGenerators(new SoundFont2(data)),
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
