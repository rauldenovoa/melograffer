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
  /** 'arc' = halo circle, 'line' = bar line or connecting line. */
  kind: 'arc' | 'line'
  x: number
  y: number
  r: number
  points: Array<{ x: number; y: number }>
  strokeStyle: string
  globalAlpha: number
  lineWidth: number
}

interface TextEntry {
  text: string
  x: number
  y: number
}

function createMockCtx(width = 960, height = 360) {
  const draws: DrawEntry[] = []
  const strokes: StrokeEntry[] = []
  const texts: TextEntry[] = []
  let lastArc = { x: 0, y: 0, r: 0 }
  let pathKind: StrokeEntry['kind'] = 'arc'
  let points: Array<{ x: number; y: number }> = []

  const ctx: CanvasLike2D = {
    canvas: { width, height },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect() {},
    fillText(text, x, y) {
      texts.push({ text, x, y })
    },
    beginPath() {
      points = []
    },
    moveTo(x, y) {
      pathKind = 'line'
      points.push({ x, y })
    },
    lineTo(x, y) {
      pathKind = 'line'
      points.push({ x, y })
    },
    arc(x, y, r) {
      pathKind = 'arc'
      lastArc = { x, y, r }
    },
    fill() {
      draws.push({ ...lastArc, fillStyle: ctx.fillStyle as string, globalAlpha: ctx.globalAlpha })
    },
    stroke() {
      strokes.push({
        kind: pathKind,
        ...lastArc,
        points: [...points],
        strokeStyle: ctx.strokeStyle as string,
        globalAlpha: ctx.globalAlpha,
        lineWidth: ctx.lineWidth,
      })
    },
  }

  return { ctx, draws, strokes, texts }
}

describe('drawFrame', () => {
  it('draws a half note at exactly 2x the area of a quarter note', () => {
    const score = scoreOf([
      note({ startSec: 5, durationSec: 0.5, midiNote: 60 }),
      note({ startSec: 5, durationSec: 1.0, midiNote: 60 }),
    ])
    const { ctx, draws } = createMockCtx()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 4.5)

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
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 1.5)

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

  it('note lifecycle: filled dot before, hollow ring + playhead clone while sounding, hollow ring after', () => {
    const n = note({ startSec: 10, durationSec: 2, midiNote: 60 })
    const score = scoreOf([n])
    const playheadX = DEFAULT_VIZ_CONFIG.playheadX * 960

    // Before onset: one filled dot at resting alpha, no ring, no clone.
    const before = createMockCtx()
    drawFrame(before.ctx, score, DEFAULT_VIZ_CONFIG, 9)
    expect(before.draws).toHaveLength(1)
    expect(before.draws[0].globalAlpha).toBeCloseTo(0.65)
    expect(before.strokes.filter((s) => s.kind === 'arc')).toHaveLength(0)

    // At onset: the dot's fill is gone; a fully opaque ring at the dot, and a
    // fully opaque clone at the playhead with the dot's full radius.
    const onset = createMockCtx()
    drawFrame(onset.ctx, score, DEFAULT_VIZ_CONFIG, 10)
    const onsetRings = onset.strokes.filter((s) => s.kind === 'arc')
    expect(onsetRings).toHaveLength(1)
    expect(onsetRings[0].globalAlpha).toBeCloseTo(1)
    expect(onset.draws).toHaveLength(1) // only the clone fills
    expect(onset.draws[0].x).toBeCloseTo(playheadX)
    expect(onset.draws[0].globalAlpha).toBeCloseTo(1)
    expect(onset.draws[0].r).toBeCloseTo(onsetRings[0].r)

    // Mid-note: ring alpha decaying between 1 and resting; clone shrunk.
    const mid = createMockCtx()
    drawFrame(mid.ctx, score, DEFAULT_VIZ_CONFIG, 11)
    const midRings = mid.strokes.filter((s) => s.kind === 'arc')
    expect(midRings[0].globalAlpha).toBeGreaterThan(0.65)
    expect(midRings[0].globalAlpha).toBeLessThan(1)
    expect(mid.draws).toHaveLength(1)
    expect(mid.draws[0].r).toBeLessThan(onset.draws[0].r)
    expect(mid.draws[0].x).toBeCloseTo(playheadX) // clone stays at the playhead

    // After the note ends: hollow ring at resting alpha, no fill, no clone.
    const after = createMockCtx()
    drawFrame(after.ctx, score, DEFAULT_VIZ_CONFIG, 13)
    const afterRings = after.strokes.filter((s) => s.kind === 'arc')
    expect(afterRings).toHaveLength(1)
    expect(afterRings[0].globalAlpha).toBeCloseTo(0.65)
    expect(after.draws).toHaveLength(0)
  })

  it('still draws the playhead clone for a long note whose start dot scrolled off-screen', () => {
    // At 120 px/s the playhead is 320px from the left edge: a note that
    // started >3s ago is culled from the dot pass, but if it is still
    // sounding its clone must ride the playhead.
    const score = scoreOf([note({ startSec: 0, durationSec: 60, midiNote: 60 })])
    const { ctx, draws } = createMockCtx()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 30)

    expect(draws).toHaveLength(1)
    expect(draws[0].x).toBeCloseTo(DEFAULT_VIZ_CONFIG.playheadX * 960)
  })

  it('draws sounding clones on top: the clone fill comes after every dot-pass call', () => {
    const score = scoreOf([
      note({ startSec: 10, durationSec: 2 }), // sounding at t=10.5
      note({ startSec: 11, durationSec: 1 }), // future filled dot
    ])
    const calls: string[] = []
    const { ctx, draws } = createMockCtx()
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
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 10.5)

    expect(calls[calls.length - 1]).toBe('fill')
    expect(draws[draws.length - 1].x).toBeCloseTo(DEFAULT_VIZ_CONFIG.playheadX * 960)
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
    // Negative time keeps every windowed note in the future (filled dots), so
    // the fill count is exactly the windowed-note count.
    const timeSec = -80

    const window = visibleTimeWindow(timeSec, zoomedOutConfig, canvasWidth)
    const expectedCount = notes.filter((n) => isNoteInWindow(n, window)).length
    expect(expectedCount).toBeGreaterThan(0)
    expect(expectedCount).toBeLessThan(noteCount)

    const { ctx, draws } = createMockCtx(canvasWidth)
    drawFrame(ctx, score, zoomedOutConfig, timeSec)

    expect(draws).toHaveLength(expectedCount)
  })

  it('draws one connecting line per consecutive note pair within a voice, under the dots', () => {
    const score = scoreOf([
      note({ startSec: 1, midiNote: 60 }),
      note({ startSec: 2, midiNote: 64 }),
      note({ startSec: 3, midiNote: 67 }),
    ])
    const { ctx, draws, strokes } = createMockCtx()
    const order: string[] = []
    const origFill = ctx.fill.bind(ctx)
    const origStroke = ctx.stroke.bind(ctx)
    ctx.fill = () => {
      order.push('fill')
      origFill()
    }
    ctx.stroke = () => {
      origStroke()
      order.push(`stroke:${strokes[strokes.length - 1].kind}`)
    }
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 0.5)

    const lines = strokes.filter((s) => s.kind === 'line')
    expect(lines).toHaveLength(2)
    // Each line runs from one dot's center to the next dot's center.
    expect(lines[0].points).toEqual([
      { x: draws[0].x, y: draws[0].y },
      { x: draws[1].x, y: draws[1].y },
    ])
    expect(lines[0].strokeStyle).toBe('#ff0000')
    // All connecting lines are stroked before any dot is filled (halo arcs
    // are interleaved with their own dots, so only line strokes must lead).
    expect(order.lastIndexOf('stroke:line')).toBeLessThan(order.indexOf('fill'))
  })

  it('omits connecting lines when the toggle is off', () => {
    const score = scoreOf([note({ startSec: 1 }), note({ startSec: 2 })])
    const { ctx, strokes } = createMockCtx()
    drawFrame(ctx, score, { ...DEFAULT_VIZ_CONFIG, showConnectingLines: false }, 1.5)

    expect(strokes.filter((s) => s.kind === 'line')).toHaveLength(0)
  })

  it('skips connecting lines from hidden tracks', () => {
    const score = scoreOf([note({ startSec: 1 }), note({ startSec: 2 })], { visible: false })
    const { ctx, strokes } = createMockCtx()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 1.5)

    expect(strokes).toHaveLength(0)
  })

  it('draws bar lines and numbers only for bars inside the visible window, honoring toggles', () => {
    const score: Score = {
      ...scoreOf([note({ startSec: 10 })]),
      bars: [
        { number: 1, startSec: 0 }, // far off-screen at timeSec=10
        { number: 6, startSec: 10 },
        { number: 7, startSec: 12 },
        { number: 500, startSec: 1000 }, // far off-screen
      ],
    }

    const { ctx, strokes, texts } = createMockCtx()
    drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, 10)

    const barLines = strokes.filter((s) => s.kind === 'line')
    expect(barLines).toHaveLength(2)
    // Full-height verticals.
    expect(barLines[0].points[0].x).toBeCloseTo(barLines[0].points[1].x)
    expect(barLines[0].points[0].y).toBe(0)
    expect(barLines[0].points[1].y).toBe(360)
    expect(texts.map((t) => t.text)).toEqual(['6', '7'])

    const { ctx: ctx2, strokes: strokes2, texts: texts2 } = createMockCtx()
    drawFrame(ctx2, score, { ...DEFAULT_VIZ_CONFIG, showBarLines: false, showBarNumbers: false }, 10)
    expect(strokes2.filter((s) => s.kind === 'line')).toHaveLength(0)
    expect(texts2).toHaveLength(0)
  })
})
