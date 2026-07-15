import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { drawFrame, type CanvasLike2D } from './drawFrame'
import { isNoteInWindow, visibleTimeWindow } from './mapping'
import { DEFAULT_VIZ_CONFIG } from './defaultConfig'
import { parseMidi } from '../midi/parseMidi'
import type { Note, Score } from '../types'

function note(overrides: Partial<Note> = {}): Note {
  return { startSec: 0, durationSec: 1, midiNote: 60, velocity: 1, ...overrides }
}

function scoreOf(notes: Note[], overrides: Partial<{ color: string; visible: boolean }> = {}): Score {
  return {
    tracks: [
      { id: 't0', name: 'track', notes, color: overrides.color ?? '#ff0000', visible: overrides.visible ?? true },
    ],
    bars: [],
  }
}

interface DrawEntry {
  x: number
  y: number
  r: number
  fillStyle: string
  globalAlpha: number
}

interface StrokeEntry {
  x: number
  y: number
  r: number
  strokeStyle: string
  globalAlpha: number
  lineWidth: number
}

function createMockCtx(width = 960, height = 360) {
  const draws: DrawEntry[] = []
  const strokes: StrokeEntry[] = []
  let lastArc = { x: 0, y: 0, r: 0 }

  const ctx: CanvasLike2D = {
    canvas: { width, height },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    fillRect() {},
    beginPath() {},
    arc(x, y, r) {
      lastArc = { x, y, r }
    },
    fill() {
      draws.push({ ...lastArc, fillStyle: ctx.fillStyle as string, globalAlpha: ctx.globalAlpha })
    },
    stroke() {
      strokes.push({
        ...lastArc,
        strokeStyle: ctx.strokeStyle as string,
        globalAlpha: ctx.globalAlpha,
        lineWidth: ctx.lineWidth,
      })
    },
  }

  return { ctx, draws, strokes }
}

describe('drawFrame', () => {
  it('draws a half note at exactly 2x the area of a quarter note', () => {
    const score = scoreOf([
      note({ startSec: 5, durationSec: 0.5, midiNote: 60 }),
      note({ startSec: 5, durationSec: 1.0, midiNote: 60 }),
    ])
    const { ctx, draws } = createMockCtx()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 5)

    expect(draws).toHaveLength(2)
    const [quarter, half] = draws
    expect((half.r / quarter.r) ** 2).toBeCloseTo(2)
  })

  it('renders a higher-pitch note at a smaller y than a lower-pitch note', () => {
    const score = scoreOf([
      note({ startSec: 2, midiNote: 50 }),
      note({ startSec: 2, midiNote: 74 }),
    ])
    const { ctx, draws } = createMockCtx()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 2)

    const [lowNoteDraw, highNoteDraw] = draws
    expect(highNoteDraw.y).toBeLessThan(lowNoteDraw.y)
  })

  it('culls notes far outside the visible time window (no draw call at all)', () => {
    const score = scoreOf([
      note({ startSec: 10 }),
      note({ startSec: 10_000 }),
    ])
    const { ctx, draws } = createMockCtx()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 10)

    expect(draws).toHaveLength(1)
  })

  it('gives an active note full alpha plus a halo stroke, unlike an inactive note', () => {
    const score = scoreOf([
      note({ startSec: 10, durationSec: 1 }), // active at timeSec=10.5
      note({ startSec: 12, durationSec: 1 }), // in the visible window, but not yet active
    ])
    const { ctx, draws, strokes } = createMockCtx()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 10.5)

    const [activeDraw, inactiveDraw] = draws
    expect(activeDraw.globalAlpha).toBe(1)
    expect(inactiveDraw.globalAlpha).toBeLessThan(1)
    expect(strokes).toHaveLength(1)
    expect(strokes[0].x).toBeCloseTo(activeDraw.x)
    expect(strokes[0].y).toBeCloseTo(activeDraw.y)
  })

  it('draws the halo stroke before the dot fill for an active note', () => {
    const score = scoreOf([note({ startSec: 1, durationSec: 1 })])
    const calls: string[] = []
    const { ctx } = createMockCtx()
    const origFill = ctx.fill.bind(ctx)
    const origStroke = ctx.stroke.bind(ctx)
    ctx.fill = () => {
      calls.push('fill')
      origFill()
    }
    ctx.stroke = () => {
      calls.push('stroke')
      origStroke()
    }
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 1.5)
    expect(calls).toEqual(['stroke', 'fill'])
  })

  it('renders real parsed MIDI data without throwing', () => {
    const buf = readFileSync(resolve(__dirname, '../../fixtures/bach_sinfonia.mid'))
    const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const score = parseMidi(buffer)
    const { ctx, draws } = createMockCtx()

    expect(() => drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 0)).not.toThrow()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 5)
    expect(draws.length).toBeGreaterThan(0)
  })

  it('culls a synthetic 6000-note score down to exactly the notes inside the visible window at extreme zoom-out', () => {
    const spacingSec = 0.1
    const noteCount = 6000
    const notes: Note[] = []
    for (let i = 0; i < noteCount; i++) {
      notes.push(note({ startSec: i * spacingSec, durationSec: 0.05, midiNote: 60 + (i % 12) }))
    }
    const score = scoreOf(notes)

    const zoomedOutConfig = { ...DEFAULT_VIZ_CONFIG, pxPerSec: 5 }
    const canvasWidth = 960
    const timeSec = 300

    const window = visibleTimeWindow(timeSec, zoomedOutConfig, canvasWidth)
    const expectedCount = notes.filter((n) => isNoteInWindow(n, window)).length
    expect(expectedCount).toBeGreaterThan(0)
    expect(expectedCount).toBeLessThan(noteCount)

    const { ctx, draws } = createMockCtx(canvasWidth)
    drawFrame(ctx, score, zoomedOutConfig, timeSec)

    expect(draws).toHaveLength(expectedCount)
  })
})
