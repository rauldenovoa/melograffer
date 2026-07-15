import { describe, expect, it } from 'vitest'
import { GeneratorType, type SoundFont2 } from 'soundfont2'
import { applyZoneGenerators } from './instrument'

const ROOT_KEY = GeneratorType.OverridingRootKey
const SAMPLE_MODES = GeneratorType.SampleModes
const START_LOOP_OFFSET = GeneratorType.StartLoopAddrsOffset
const END_LOOP_OFFSET = GeneratorType.EndLoopAddrsOffset
const START_LOOP_COARSE = GeneratorType.StartLoopAddrsCoarseOffset

type Generators = Record<number, { id: number; value: number }>

function generators(values: Record<number, number>): Generators {
  return Object.fromEntries(
    Object.entries(values).map(([id, value]) => [id, { id: Number(id), value }]),
  )
}

function zone(opts: {
  originalPitch?: number
  startLoop?: number
  endLoop?: number
  dataLength?: number
  generators?: Record<number, number>
}) {
  return {
    keyRange: { lo: 0, hi: 127 },
    generators: generators(opts.generators ?? {}),
    sample: {
      data: new Int16Array(opts.dataLength ?? 1000),
      header: {
        name: 'sample',
        originalPitch: opts.originalPitch ?? 60,
        startLoop: opts.startLoop ?? 0,
        endLoop: opts.endLoop ?? 0,
      },
    },
  }
}

function sf2(instruments: unknown[]): SoundFont2 {
  return { instruments } as unknown as SoundFont2
}

describe('applyZoneGenerators', () => {
  describe('root key (gen 58)', () => {
    it('replaces the clamped header pitch with the zone-level OverridingRootKey generator', () => {
      const input = sf2([
        { header: { name: 'Piano' }, zones: [zone({ generators: { [ROOT_KEY]: 72 } })] },
      ])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(72)
    })

    it('does not mutate the parsed soundfont (samples may be shared across zones)', () => {
      const sharedZone = zone({ startLoop: 8, endLoop: 992, generators: { [ROOT_KEY]: 72 } })
      const input = sf2([{ header: { name: 'Piano' }, zones: [sharedZone] }])
      applyZoneGenerators(input)
      expect(sharedZone.sample.header.originalPitch).toBe(60)
      expect(sharedZone.sample.header.startLoop).toBe(8)
      expect(sharedZone.sample.header.endLoop).toBe(992)
    })

    it('keeps the header pitch when no root-key generator exists', () => {
      const input = sf2([{ header: { name: 'Piano' }, zones: [zone({ originalPitch: 48 })] }])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(48)
    })

    it('falls back to the instrument global zone root key', () => {
      const input = sf2([
        {
          header: { name: 'Piano' },
          globalZone: { generators: generators({ [ROOT_KEY]: 48 }) },
          zones: [zone({})],
        },
      ])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(48)
    })

    it('prefers the zone root key over the global zone', () => {
      const input = sf2([
        {
          header: { name: 'Piano' },
          globalZone: { generators: generators({ [ROOT_KEY]: 48 }) },
          zones: [zone({ generators: { [ROOT_KEY]: 72 } })],
        },
      ])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(72)
    })

    it('ignores out-of-range root keys', () => {
      const input = sf2([
        {
          header: { name: 'Piano' },
          zones: [
            zone({ generators: { [ROOT_KEY]: 200 } }),
            zone({ generators: { [ROOT_KEY]: -1 } }),
          ],
        },
      ])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(60)
      expect(out.instruments[0].zones[1].sample.header.originalPitch).toBe(60)
    })
  })

  describe('looping (gens 54, 2/3, 45/50)', () => {
    it('disables the loop when SampleModes is absent (SF2 default is "no loop")', () => {
      const input = sf2([
        { header: { name: 'Piano' }, zones: [zone({ startLoop: 8, endLoop: 992 })] },
      ])
      const out = applyZoneGenerators(input)
      const header = out.instruments[0].zones[0].sample.header
      expect(header.startLoop).toBe(0)
      expect(header.endLoop).toBe(0)
    })

    it('disables the loop when SampleModes is 0', () => {
      const input = sf2([
        {
          header: { name: 'Piano' },
          zones: [zone({ startLoop: 8, endLoop: 992, generators: { [SAMPLE_MODES]: 0 } })],
        },
      ])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.endLoop).toBe(0)
    })

    it('keeps header loop points for a continuously looping zone (mode 1)', () => {
      const input = sf2([
        {
          header: { name: 'Piano' },
          zones: [zone({ startLoop: 8, endLoop: 992, generators: { [SAMPLE_MODES]: 1 } })],
        },
      ])
      const out = applyZoneGenerators(input)
      const header = out.instruments[0].zones[0].sample.header
      expect(header.startLoop).toBe(8)
      expect(header.endLoop).toBe(992)
    })

    it('applies the zone loop-offset generators to the header loop points', () => {
      // Mirrors ChaosBank's piano zones: header nominally loops the whole
      // sample; the zone offsets narrow it to the sustain tail.
      const input = sf2([
        {
          header: { name: 'Piano' },
          zones: [
            zone({
              startLoop: 8,
              endLoop: 992,
              generators: { [SAMPLE_MODES]: 1, [START_LOOP_OFFSET]: 900, [END_LOOP_OFFSET]: 8 },
            }),
          ],
        },
      ])
      const out = applyZoneGenerators(input)
      const header = out.instruments[0].zones[0].sample.header
      expect(header.startLoop).toBe(908)
      expect(header.endLoop).toBe(1000)
    })

    it('applies coarse offsets in units of 32768 sample frames', () => {
      const input = sf2([
        {
          header: { name: 'Piano' },
          zones: [
            zone({
              startLoop: 8,
              endLoop: 40000,
              dataLength: 40000,
              generators: { [SAMPLE_MODES]: 1, [START_LOOP_COARSE]: 1, [START_LOOP_OFFSET]: 2 },
            }),
          ],
        },
      ])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.startLoop).toBe(8 + 2 + 32768)
    })

    it('treats mode 3 (loop until release) as a continuous loop', () => {
      const input = sf2([
        {
          header: { name: 'Piano' },
          zones: [zone({ startLoop: 8, endLoop: 992, generators: { [SAMPLE_MODES]: 3 } })],
        },
      ])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.endLoop).toBe(992)
    })

    it('disables the loop when the adjusted window is invalid', () => {
      const pastEnd = zone({
        startLoop: 8,
        endLoop: 992,
        dataLength: 1000,
        generators: { [SAMPLE_MODES]: 1, [END_LOOP_OFFSET]: 100 },
      })
      const inverted = zone({
        startLoop: 8,
        endLoop: 992,
        generators: { [SAMPLE_MODES]: 1, [START_LOOP_OFFSET]: 990 },
      })
      const input = sf2([{ header: { name: 'Piano' }, zones: [pastEnd, inverted] }])
      const out = applyZoneGenerators(input)
      expect(out.instruments[0].zones[0].sample.header.endLoop).toBe(0)
      expect(out.instruments[0].zones[1].sample.header.endLoop).toBe(0)
    })
  })
})
