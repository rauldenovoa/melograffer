import { describe, expect, it } from 'vitest'
import { GeneratorType, type SoundFont2 } from 'soundfont2'
import { applyOverridingRootKeys } from './instrument'

const ROOT_KEY = GeneratorType.OverridingRootKey

function zone(originalPitch: number, rootKey?: number) {
  return {
    keyRange: { lo: 0, hi: 127 },
    generators:
      rootKey === undefined ? {} : { [ROOT_KEY]: { id: ROOT_KEY, value: rootKey } },
    sample: {
      data: new Int16Array(4),
      header: { name: 'sample', originalPitch },
    },
  }
}

function sf2(instruments: unknown[]): SoundFont2 {
  return { instruments } as unknown as SoundFont2
}

describe('applyOverridingRootKeys', () => {
  it('replaces the clamped header pitch with the zone-level OverridingRootKey generator', () => {
    const input = sf2([{ header: { name: 'Piano' }, zones: [zone(60, 72)] }])
    const out = applyOverridingRootKeys(input)
    expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(72)
  })

  it('does not mutate the parsed soundfont (samples may be shared across zones)', () => {
    const sharedZone = zone(60, 72)
    const input = sf2([{ header: { name: 'Piano' }, zones: [sharedZone] }])
    applyOverridingRootKeys(input)
    expect(sharedZone.sample.header.originalPitch).toBe(60)
  })

  it('leaves zones without a root-key generator untouched', () => {
    const untouched = zone(60)
    const input = sf2([{ header: { name: 'Piano' }, zones: [untouched] }])
    const out = applyOverridingRootKeys(input)
    expect(out.instruments[0].zones[0]).toBe(untouched)
  })

  it('falls back to the instrument global zone root key', () => {
    const input = sf2([
      {
        header: { name: 'Piano' },
        globalZone: { generators: { [ROOT_KEY]: { id: ROOT_KEY, value: 48 } } },
        zones: [zone(60)],
      },
    ])
    const out = applyOverridingRootKeys(input)
    expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(48)
  })

  it('prefers the zone root key over the global zone', () => {
    const input = sf2([
      {
        header: { name: 'Piano' },
        globalZone: { generators: { [ROOT_KEY]: { id: ROOT_KEY, value: 48 } } },
        zones: [zone(60, 72)],
      },
    ])
    const out = applyOverridingRootKeys(input)
    expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(72)
  })

  it('ignores out-of-range root keys', () => {
    const input = sf2([
      { header: { name: 'Piano' }, zones: [zone(60, 200), zone(60, -1)] },
    ])
    const out = applyOverridingRootKeys(input)
    expect(out.instruments[0].zones[0].sample.header.originalPitch).toBe(60)
    expect(out.instruments[0].zones[1].sample.header.originalPitch).toBe(60)
  })
})
