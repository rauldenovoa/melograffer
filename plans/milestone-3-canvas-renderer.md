# Milestone 3 — Canvas renderer (static + scrub)

## Context

M1 (scaffold) and M2 (MIDI ingest: `parseMidi` → `Score`/`Track`/`Note`, file-drop UI listing track names/note counts) are done. SPEC.md §6 defines M3 as: a pure `drawFrame(ctx, score, config, timeSec)` function, a time slider that scrubs the score, correct pitch/duration/color mapping, and 60fps rendering at 5k+ notes. This is the core rendering engine the live player (M4) and MP4 exporter (M6) will both call identically — CLAUDE.md's central invariant is that `drawFrame` never reads a clock, React state, or globals, only its arguments.

Confirmed design decisions (via user Q&A):
- `VizConfig.colors` (listed in SPEC §4) is **omitted** — `Track.color` (from M2) already supplies per-track dot color; the active-note halo reuses the track's own color rather than inventing a new field.
- Pitch→y mapping **auto-fits to each score's min/max note** (not a fixed piano range) — maximizes canvas use per piece.
- `playheadX` is a **fraction of canvas width (0–1)**, not a fixed pixel value — resolution-independent between preview and future 1080p export.
- Perf verification for "5k+ notes" requires **sourcing a real dense public-domain MIDI fixture** (not just a synthetic note-count test) — see step 6 below; downloading it needs explicit user permission (filename/source/size) before fetching, per standing rules.

## Files

```
src/types.ts                 (+VizConfig)
src/render/mapping.ts         (new — pure math: pitch/duration/x/window/range)
src/render/mapping.test.ts    (new)
src/render/drawFrame.ts       (new — CanvasLike2D interface + drawFrame)
src/render/drawFrame.test.ts  (new — hand-rolled mock ctx, no new deps)
src/render/defaultConfig.ts   (new — DEFAULT_VIZ_CONFIG)
src/App.tsx                   (modified — canvas + time slider)
src/App.test.tsx              (modified — canvas/slider presence tests)
fixtures/<dense>.mid           (new — real public-domain dense MIDI, licensed same way as existing fixtures)
CLAUDE.md                     (modified — Current state section)
```

## VizConfig (src/types.ts)

```ts
export interface VizConfig {
  bg: string                          // canvas background color
  pxPerSec: number                    // horizontal scroll speed
  dotScale: number                    // k in radius formulas
  radiusMode: 'sqrt' | 'linear'
  playheadX: number                   // fraction of canvas width, 0..1
}
```

`src/render/defaultConfig.ts`: `DEFAULT_VIZ_CONFIG = { bg: '#101014', pxPerSec: 120, dotScale: 8, radiusMode: 'sqrt', playheadX: 1/3 }`.

## Coordinate math (src/render/mapping.ts) — pure, no canvas API

- `computePitchRange(score: Score): { min: number; max: number }` — scans **all** notes across all tracks (ignoring `visible`, so the vertical scale doesn't jump if a track is toggled later in M5), adds a small semitone padding (e.g. 2) on each side; handles the degenerate single-pitch case (min === max) by padding a fixed minimum span so it doesn't divide by zero.
- `pitchToY(midiNote: number, canvasHeight: number, range: {min,max}): number` — linear map, inverted so higher MIDI note → smaller y (higher on screen). MIDI note number is already ≈log-frequency, so no extra log transform needed.
- `xForNoteStart(startSec: number, timeSec: number, config: VizConfig, canvasWidth: number): number` — `playheadX*canvasWidth + (startSec - timeSec) * pxPerSec`. Notes scroll right→left as `timeSec` increases; x = playhead exactly when `startSec === timeSec`. Position depends only on note start (not duration) — dots are points, not bars (bars are explicitly out of scope).
- `radiusForDuration(durationSec: number, dotScale: number, radiusMode: 'sqrt'|'linear'): number` — `sqrt` mode: `dotScale*Math.sqrt(duration)`; `linear` mode: `dotScale*Math.min(duration, LINEAR_CAP_SECONDS)` (capped, e.g. `LINEAR_CAP_SECONDS = 2`). Floor at `MIN_RADIUS_PX = 1`. Under sqrt mode, a half note (2× duration) has exactly `√2`× the radius of a quarter note → area ratio exactly 2 — matches SPEC §8's verification requirement precisely, not approximately.
- `isNoteActive(note: Note, timeSec: number): boolean` — `timeSec >= start && timeSec < start + duration` (half-open interval).
- `visibleTimeWindow(timeSec, config, canvasWidth): {startSec, endSec}` and `isNoteInWindow(note, window): boolean` — culling: since x depends only on `startSec`, this is one range check per note. Simple `Array.filter` per track (no interval tree/binary search) — 5k notes × 2 comparisons per frame is well under the 16ms/frame budget; skip this optimization unless a real dense fixture proves it's needed.
- `scoreDurationSec(score: Score): number` — max over all notes of `startSec + durationSec`, 0 if empty. Drives the slider's `max`.

## drawFrame (src/render/drawFrame.ts)

```ts
export interface CanvasLike2D {
  canvas: { width: number; height: number }
  fillStyle: string; strokeStyle: string; lineWidth: number; globalAlpha: number
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void
  fill(): void
  stroke(): void
}

export function drawFrame(ctx: CanvasLike2D, score: Score, config: VizConfig, timeSec: number): void
```

A narrow structural interface (not the full DOM `CanvasRenderingContext2D`) so a real canvas context, and later an `OffscreenCanvasRenderingContext2D` (M6 exporter), both satisfy it with no cast — and so tests can pass a hand-written mock instead of adding a `node-canvas`/`jest-canvas-mock` dependency.

Behavior: fill background (`config.bg`); compute `computePitchRange(score)` and `visibleTimeWindow(...)` once; for each `track` with `visible: true`, filter notes to the window, and for each note compute x/y/radius, then draw dot: if `isNoteActive`, draw the translucent stroked halo ring **first** (`radius + HALO_PADDING_PX`, `strokeStyle = track.color`, `globalAlpha = HALO_ALPHA`), **then** draw the solid dot on top at full alpha — halo-then-dot order keeps the dot's edge crisp instead of the halo stroke clipping over its rim; inactive notes just draw the dot at `globalAlpha = INACTIVE_ALPHA`, no halo. Add a one-line comment in `drawFrame.ts` pinning this draw order so it doesn't drift in a later refactor. `INACTIVE_ALPHA`/`HALO_PADDING_PX`/`HALO_ALPHA` are local constants, not config fields (no speculative config surface beyond SPEC's listed `VizConfig` shape).

Purity: `drawFrame` never reads `Date.now()`, `AudioContext`, React state, or module-level mutable state — every draw decision derives only from `(ctx, score, config, timeSec)`.

## App.tsx changes

- Fixed-size `<canvas ref={canvasRef} width={960} height={360} />` below the existing track `<ul>` (kept as-is — still exercised by existing `App.test.tsx` assertions).
- `timeSec` state (default 0, reset to 0 on new file load) driven by a `<input type="range">` slider (`min=0`, `max={scoreDurationSec(score)}`, `step=0.01`), disabled until a score is loaded.
- `useEffect` keyed on `[score, timeSec]`: `canvasRef.current?.getContext('2d')`, guard on `null` (jsdom returns `null`, and it's correct defensive behavior generally), call `drawFrame(ctx, score, DEFAULT_VIZ_CONFIG, timeSec)`.
- No config UI (colors/speed/etc.) — that's M5; `DEFAULT_VIZ_CONFIG` is hardcoded for now.
- No devicePixelRatio scaling or responsive resize — fixed preview size for M3, noted as a known simplification in CLAUDE.md, not a bug.

## Perf verification approach (revised per user feedback)

A real symphony rarely has more than a few dozen simultaneous notes, and at the default zoom (~8s visible window) only a few hundred dots are ever on screen at once — a real MIDI with 5,000+ notes isn't realistic repertoire to hunt for. Split the concern in two:

- **Musical-realism smoke test**: a small, genuinely dense/contrapuntal public-domain MIDI (a few hundred notes is enough — e.g. something denser than the existing two-voice `bach_invention.mid`), sourced the same way as existing fixtures (Mutopia Project, public domain). Ask the user for explicit permission before downloading (filename/source URL/size), commit to `fixtures/`, attribute in CLAUDE.md.
- **Synthetic culling stress test**: a procedurally generated in-memory `Score` with thousands of notes, exercised at an extreme zoom-out (low `pxPerSec`) to stress-test the culling filter's engineering headroom for a future zoom feature (M5) — not a claim about real symphonic density. No download needed; lives entirely in the test file.

## Test plan

**`mapping.test.ts`** (pure numbers):
- `radiusForDuration` sqrt mode: exact-ratio case (duration pair at exactly 2×) asserts `(rHalf/rQuarter)**2 === 2` (or `toBeCloseTo`); linear mode: radius stops growing past `LINEAR_CAP_SECONDS`.
- `pitchToY`: higher MIDI note → smaller y; monotonicity across a sweep.
- `computePitchRange`: normal multi-pitch score; degenerate single-pitch score doesn't divide by zero.
- `isNoteActive`: boundary at `start` (true) and `start+duration` (false, half-open).
- `visibleTimeWindow`/`isNoteInWindow`: note just inside vs. just outside the padded window.
- `scoreDurationSec`: empty score → 0; multi-track max.

**`drawFrame.test.ts`** (mock `CanvasLike2D`, synthetic `Score`, plus one fixture smoke test):
- (a) half-note dot area ≈ 2× quarter-note dot area (same pitch/track, default sqrt mode) — read back computed radius from the mock's recorded `arc()` calls at `fill()` time.
- (b) higher-pitch note renders at smaller y than a lower-pitch note at the same x.
- (c) a note far outside the visible time window produces **no** `arc`/`fill` call at all (proves culling, not just off-canvas placement).
- (d) an active note (`timeSec` inside `[start, start+duration)`) gets full alpha + a halo stroke; an inactive one does not.
- (e) fixture smoke test: `parseMidi(bach_invention.mid)` (or the new denser fixture) → `drawFrame` at a couple of `timeSec` values doesn't throw and produces at least one draw call — sanity check on real parsed data (precision assertions stay on synthetic data, since fixture note durations aren't guaranteed exact ratios after tempo conversion).
- (f) synthetic culling stress test: generate a synthetic multi-track `Score` with a known large note count (e.g. exactly 6000 notes spread across the timeline), call `drawFrame` once at an extreme zoom-out `pxPerSec` and a mid-piece `timeSec`, and assert the resulting draw-call count against a concrete computed threshold derived from the visible time window (not a vague "stays in the thousands") — e.g. compute the expected visible-window note count from the synthetic generation parameters and assert `draws.length` matches it, proving culling actually drops the off-window notes rather than merely not crashing. Real 60fps itself is a manual browser DevTools check (jsdom has no real canvas backend to measure against), noted as the actual sign-off step for that specific DoD clause.

**`App.test.tsx`** additions: after loading `multitrack.mid`, a `<canvas>` exists and a slider (`getByRole('slider')`) exists with `max > 0`; changing the slider updates without throwing (exercises the `null`-ctx-guarded `useEffect` path under jsdom).

## CLAUDE.md updates after M3 lands

- Milestone line → `3 — Canvas renderer (static + scrub) — DONE`.
- Done bullet: list `src/render/mapping.ts`, `src/render/drawFrame.ts`, `src/render/defaultConfig.ts`, canvas+slider UI in `App.tsx`, new dense fixture (with attribution).
- Note deferred items so they aren't re-litigated: no devicePixelRatio/responsive canvas, no config UI (M5), `VizConfig.colors` intentionally omitted (superseded by `Track.color`).
- Next: Milestone 4 — Audio playback + live sync.

## Verification

1. `npm test` — all new unit tests in `mapping.test.ts` and `drawFrame.test.ts` pass, plus updated `App.test.tsx`.
2. `npm run lint && npx tsc --noEmit` — clean.
3. `npm run dev`, drop `fixtures/multitrack.mid` (or the new dense fixture) in the browser, drag the time slider end-to-end: confirm notes scroll right→left through a fixed playhead, higher pitches sit higher on screen, longer notes are visibly larger dots, and the currently-sounding note(s) show a distinct halo/brighter treatment.
4. Manual DevTools performance check with the new dense fixture loaded: scrub/observe frame time stays near 60fps (this satisfies the DoD clause that automated tests can't cover).
