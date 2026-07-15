> **Reconstructed after the fact.** No plan-mode approval exists for this milestone — implementation was done directly with Claude Fable 5 (CLI), bypassing the usual opusplan planning step. This document was written afterward from `git log`, commit diffs, and CLAUDE.md's "Current state" notes, as a stand-in for the missing real plan. Treat it as a description of what was built and why, not as a pre-approved design that was then executed.

# Milestone 5 — Config UI + external audio

## Context
Milestone 4 (audio playback + live sync) was done. Per SPEC.md §6, M5's definition of done: "Track toggles, colors, bg, speed, dot scale; audio file upload + offset slider; settings persist." Before implementation, scope was expanded in SPEC.md (commit `9e27611`, "docs: expand M5/M6 scope"): connecting lines between notes moved from "Out (later)" into M5 proper, plus a bar-marks/bar-number toggle and adjustable playhead position — all folded into the milestone's DoD line in the table.

## Implementation
Reconstructed commit-by-commit (`68e8d81`..`f5dda36`, the milestone's core; polish-round commits follow separately below):

- **`68e8d81`** `Score.bars` — bar (measure) start times computed in `parseMidi.ts` from the header's time-signature map, numbered continuously across signature changes; files with no time-signature event default to 4/4 from tick 0. Groundwork for the bar-marks/numbers toggle.
- **`679c831`** `drawFrame` gains bar lines, bar numbers, and per-voice connecting lines, gated behind three new `VizConfig` toggles (`showBarLines`/`showBarNumbers`/`showConnectingLines`). Connecting lines draw in their own pass so every dot sits above every voice's lines; bars cull to the visible window like notes. `drawFrame` stays a pure function of its args (CLAUDE.md convention).
- **`1bba30c`** Config sidebar (`src/ConfigPanel.tsx`): track show/hide + per-track color, background, scroll speed, dot scale, radius mode, playhead position, plus the three toggles above. Persisted via new `src/config/storage.ts` (localStorage, field-by-field validation so stale/invalid stored values don't break a reload). Incidental fixes bundled in: scroll-off buffer now derives from live `pxPerSec` instead of a baked-in module constant; the rAF loop reads playback end through a ref so mid-playback speed edits apply; hiding a track mid-playback reschedules audio without it; per-track debug note counters removed.
- **`c8d4d6d`** External audio (Flow 2, `src/audio/externalAudio.ts`): an uploaded mp3/wav plays via `AudioBufferSourceNode` instead of the SoundFont synth, while visuals keep following MIDI timing. ±1000ms offset slider (5ms steps) restarts the source live for alignment. External stop handles reuse the same `activeStopFns` path as synth notes so pause/seek/new-file behave identically in both modes.
- **`f5dda36`** docs: CLAUDE.md marks M5 done, M6 next.

**Polish round** (same day, user feedback after using the feature — still under the M5 banner per `a969392`'s commit message, before the separately-planned post-M5 instrument selector):

- **`fc19d77`** dot scale becomes canvas-relative (1/1000ths of canvas height instead of absolute px) so the M6 1080p export scales dots for free; storage key bumped to v2 since old absolute values would misread; radius-mode selector hidden but left dormant behind a const.
- **`e21f64e`** lead-in/lead-out silence sized in bars (default 2 each), timeline starts at negative seconds; replaces the old automatic scroll-off buffer.
- **`c9d0d00`** debounce audio restart after seeks (150ms) — undebounced, every scrub event rescheduled and re-triggered crossed notes, machine-gunning them.
- **`0a3fc92`** canvas grab-drag scrubbing and click-a-dot-to-seek, via pure helpers `timeAtX`/`findNoteAt` in `mapping.ts`.
- **`71bc033`** spacebar play/pause when no form control has focus.
- **`4b9f4dd`** sounding-note animation replaces the old halo: played notes become hollow rings permanently, outline flashes opaque and decays exponentially (`decayEnvelope`, k=5) back to resting alpha exactly at note end; a borderless clone rides the playhead and shrinks/fades to nothing by note end (skips window culling so off-screen-start long notes still animate).
- **`21ab8df`** canvas pointer capture made best-effort (defensive fix alongside the scrubbing work).
- **`a061311`** (later, user feedback) dot scale default/range raised — the 1–50 range with default 25 read as too small in practice; revised to 30–70, default 50. ConfigPanel shows this to the user as a default-relative percentage (`config.dotScale / DEFAULT.dotScale`, 60%–140%) rather than the raw unit, which is meaningless without context.

Not part of M5: `479f07c` (global instrument selector) was planned and executed separately, after M5 was marked done — see the actual approved plan for it if you want it added to this folder too.

## Testing
Per-commit: `parseMidi.test.ts`/`drawFrame.test.ts`/`mapping.test.ts` extended for bars/connecting-lines/dot-scale/lead-in-out math; `config/storage.test.ts` new, covering persistence and per-field validation; `externalAudio.test.ts` new; `App.test.tsx` extended for the config sidebar, external-audio upload flow, debounced scrub, and grab-drag/click-seek.

## Verification
Not directly witnessed (reconstructed) — inferred from the fact that `npm test`/lint/typecheck were passing at each of these commits per the repo's normal commit discipline, and from CLAUDE.md's "Current state" notes recording each behavior as shipped.
