import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseMidi } from './parseMidi'

function loadFixture(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../fixtures', name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseMidi', () => {
  it('parses bach_invention.mid into two voices with the right note counts', () => {
    const score = parseMidi(loadFixture('bach_invention.mid'))

    expect(score.tracks).toHaveLength(2)
    expect(score.tracks[0].name).toBe('one')
    expect(score.tracks[0].notes).toHaveLength(240)
    expect(score.tracks[1].name).toBe('two')
    expect(score.tracks[1].notes).toHaveLength(218)

    const firstNote = score.tracks[0].notes[0]
    expect(firstNote).toEqual({
      startSec: expect.any(Number),
      durationSec: expect.any(Number),
      midiNote: expect.any(Number),
      velocity: expect.any(Number),
    })
  })

  it('parses multitrack.mid into two distinct tracks', () => {
    const score = parseMidi(loadFixture('multitrack.mid'))

    expect(score.tracks).toHaveLength(2)
    expect(score.tracks[0].name).toBe('staffA:')
    expect(score.tracks[0].notes).toHaveLength(127)
    expect(score.tracks[1].name).toBe('staffB:')
    expect(score.tracks[1].notes).toHaveLength(74)
    expect(score.tracks[0].color).not.toBe(score.tracks[1].color)
  })
})
