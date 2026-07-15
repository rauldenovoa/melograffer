# Milestone 4 — Audio playback + live sync

## Context
Milestone 3 (canvas renderer + scrub) is done. Per SPEC.md §6, M4's definition of done is: "Play/pause/seek with SoundFont synth; drift < 1 frame over 3 min (clock = AudioContext.currentTime)". SPEC.md §5 flags a risk that needs verifying before committing to a synth library: whether it supports offline (faster-than-realtime) rendering via `OfflineAudioContext`, which M6 (MP4 export) will depend on.

SPEC.md §4 named `spessasynth_lib` as the candidate, with `smplr` as fallback. I researched both:
- `spessasynth_lib`'s only *confirmed* (README-sourced) API is low-level immediate-fire `noteOn`/`noteOff`/`programChange` on a `WorkletSynthesizer`, requires copying a separate AudioWorklet processor file, and its higher-level `Sequencer` (which would re-parse the MIDI file itself) has no reliably-documented API — every source I found disagreed on method names.
- `smplr`'s `Soundfont2` class loads a raw `.sf2` directly and its `start({ note, time, duration, velocity })` takes a **time value measured directly against `audioContext.currentTime`**, i.e. sample-accurate Web Audio scheduling is built in. No worklet file to manage. Works with any `BaseAudioContext`, so it should work transparently with `OfflineAudioContext` too (same API surface, which is the whole point of that class) — de-risking M6.

**Decision: use `smplr`.** It's simpler, lower-risk (its one load-bearing behavior — `time` being context-relative — is confirmed straight from the README), and avoids two things spessasynth would have required: managing a separate worklet asset file, and building our own lookahead-polling scheduler (Web Audio's native `AudioBufferSourceNode.start(when)` — which is what `time` presumably maps to — already handles precise firing, and can be cancelled with `.stop()` even before its scheduled time, so pause/seek is just "stop everything, reschedule from the new position").

Architecturally, audio will be driven from our **own already-parsed `Score`** (the same data `drawFrame` renders), not from a second MIDI parse inside the synth library. This guarantees visuals and audio can never drift apart from parsing differences, and makes per-track mute (M5) trivial — it's the same `track.visible` flag the renderer already checks.

SoundFont asset: rechecked licensing before defaulting to anything — there is no small (<10MB) *permissively*-licensed full General MIDI soundfont. Sizes found: `TimGM6mb.sf2` (5.7MB, GPLv2); `ChaosBank.sf2` (~11.5MB, CC0, "Chaos Bank v1.9" from rKhive); `Jnsgm2.sf2`/`Masterpiece.sf2`/`Unison.SF2` (~29-33MB, CC0). User chose **`ChaosBank.sf2`** — CC0, no copyleft entanglement even if the repo goes public later, at a reasonable ~2x size premium over the GPL option. Source: `https://raw.githubusercontent.com/bratpeki/soundfonts/main/SF2/GM/ChaosBank.sf2`. Add a short attribution note (rKhive, CC0 1.0) — check if one already exists near SPEC §10's Malinowski credit; follow that pattern.

Also add to SPEC.md §3 "Out (later)": **swappable/multiple soundfont support** — so a future milestone can let a different `.sf2` (e.g. `TimGM6mb.sf2` or a full CC0 GM bank) be swapped in/tested without re-litigating this decision.

3-minute fixture: `fixtures/fur_elise.mid` — Beethoven's Für Elise (WoO 59), Mutopia Project, public domain, confirmed 7,590 bytes at `https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.mid`. User approved this specific file for the SPEC §8 M4 drift-verification fixture (the existing fixtures — `bach_invention.mid`, `multitrack.mid`, `bach_sinfonia.mid` — are all much shorter pieces, not 3 minutes).

## Implementation

**New dependency:** `smplr` (package.json, with a commit message stating why per CLAUDE.md's "no new deps without stating why" rule — see Decision above).

**New asset:** `public/soundfonts/ChaosBank.sf2` (~11.5MB, CC0), committed. Add a one-line attribution (rKhive, "Chaos Bank v1.9", CC0 1.0) to README or an ATTRIBUTION section — check if one already exists near SPEC §10's Malinowski credit; follow that pattern.

**New files, all in `src/audio/` per CLAUDE.md's module layout:**

- `src/audio/instrument.ts` — thin wrapper around `smplr`'s `Soundfont2`, exposing our own minimal structural interface (mirrors how `drawFrame.ts` defines `CanvasLike2D` instead of depending on lib.dom types directly):
  ```ts
  export interface Instrument {
    start(opts: { note: number; velocity: number; time: number; duration: number }): void
    stop(): void
  }
  ```
  `loadInstrument(ctx: BaseAudioContext): Promise<Instrument>` fetches/loads `ChaosBank.sf2` into a `Soundfont2`. During implementation, check the installed package's type defs for whether `start()` supports a `program`/`preset` param for per-track GM instrument selection — if yes, use `track` instrument info from the parsed MIDI (`@tonejs/midi` exposes `instrument.number`); if not cleanly supported, fall back to one shared instrument sound for all tracks in M4 (acceptable — SPEC already treats the built-in synth as a "cheap preview", timbral accuracy is not part of M4's DoD).

- `src/audio/clock.ts` — `PlaybackClock`: tracks `{ status: 'paused' | 'playing', anchorSec, startedAtCtxTime }`. Methods `play(fromSec)`, `pause()`, `seek(sec)`, `getCurrentTimeSec()`. Takes an injected `now: () => number` (defaults to reading `audioContext.currentTime`) so it's unit-testable without a real `AudioContext` — mirrors `mapping.ts`'s pattern of pure, injectable functions. This is what replaces `Date.now()`/`performance.now()` — never use those per CLAUDE.md.

- `src/audio/scheduler.ts` — pure scheduling logic, decoupled from any specific Instrument implementation:
  - `scheduleScore(instrument: Instrument, score: Score, fromSec: number, atCtxTime: number): void` — for every note in every visible track with `note.startSec + note.durationSec > fromSec`, calls `instrument.start({ ..., time: atCtxTime + (note.startSec - fromSec) })`.
  - `stopAll(instrument: Instrument): void` — thin wrapper over `instrument.stop()`.
  - Unit-testable with a fake `Instrument` spy — no real audio needed.

**`src/App.tsx` changes:**
- Add Play/Pause button. Lazily create the `AudioContext` + load the instrument on first Play click (avoids autoplay-policy issues — must originate from a user gesture — and avoids fetching the 6MB soundfont before it's needed).
- On Play: `clock.play(timeSec)`, then `scheduleScore(instrument, score, timeSec, ctx.currentTime)`.
- On Pause: `stopAll(instrument)`, `clock.pause()`.
- On seeking the existing slider while playing: `stopAll`, `clock.seek(newSec)`, `scheduleScore(...)` again from the new position (small audio blip on scrub is acceptable).
- Replace the current purely-slider-driven `timeSec` state: while playing, drive it from a `requestAnimationFrame` loop reading `clock.getCurrentTimeSec()`; while paused, the slider continues to directly set `timeSec` as it does today (keeps the existing M3 scrub behavior/tests intact).

## Testing
- `src/audio/clock.test.ts` — play/pause/seek arithmetic against an injected fake `now()`.
- `src/audio/scheduler.test.ts` — fake `Score` + fake `Instrument` spy: correct notes/times scheduled, notes already-finished before `fromSec` are skipped, hidden (`visible: false`) tracks are skipped.
- `src/App.test.tsx` — `vi.mock('./audio/instrument')` so the Play button works in jsdom without real Web Audio; extend existing tests to click Play and assert it doesn't throw and toggles to a Pause label. Keep the 3 existing tests (heading, track list, canvas+slider) passing unmodified in behavior.
- Lightweight offline-render smoke check (addresses SPEC §5's "verify in M4" risk item, without building full M6 export): a small test or scratch script rendering ~2s of a fixture through `OfflineAudioContext` with `loadInstrument` + `scheduleScore`, asserting the rendered buffer isn't silent. This is a smoke test only, not the M6 exporter.

## Verification
1. `npm test`, `npm run lint`, `npx tsc --noEmit` all clean.
2. Browser pane: start the dev server, load `fixtures/bach_sinfonia.mid`, click Play — confirm no console errors, `AudioContext.state === 'running'`, Pause and slider-seek both work, and the M3 scrub behavior (drag slider while paused) still works.
3. **Manual step for the user, not automatable by me:** SPEC §8's actual M4 verification — play `fixtures/fur_elise.mid` (the 3-minute fixture) and confirm (by ear/eye, screen-recorded and frame-stepped) the final note's visual onset lands within one frame of its audible onset. I cannot hear audio through these tools, so I'll flag this as an explicit follow-up for you to check locally once the implementation is in.
4. Update CLAUDE.md's "Current state" section to mark Milestone 4 done (matching the precedent set for M1/M3), noting: the smplr decision, the `ChaosBank.sf2` asset + CC0 license choice (and why it was picked over the smaller GPLv2 `TimGM6mb.sf2`), and the new `fixtures/fur_elise.mid` fixture — under "Done"; set "Next: Milestone 5". Also add "swappable/multiple soundfont support" to SPEC.md §3's "Out (later)" list.
