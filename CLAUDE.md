# CLAUDE.md — Melograffer

<!-- HARD LIMIT: keep this file under ~60 lines. It is injected into every turn. -->

## What this is
Client-only MIDI music visualizer (smalin-style scrolling dots) with MP4 export. Full context in SPEC.md — read it at session start.

## Stack
Vite · React 18 · TypeScript strict · Canvas 2D · @tonejs/midi · WebCodecs + mp4-muxer · Vercel (static)

## Commands
- dev: `npm run dev`
- test: `npm test` (vitest)
- lint/typecheck: `npm run lint && npx tsc --noEmit`
- build: `npm run build`

## Conventions
- `drawFrame(ctx, score, config, timeSec)` MUST stay a pure function of its args — live player and exporter both call it. Never let it read clocks, React state, or globals.
- Playback clock is `AudioContext.currentTime`, never `Date.now()`/`performance.now()`.
- Domain types in `src/types.ts`; MIDI parsing isolated in `src/midi/`; rendering in `src/render/`; audio in `src/audio/`; export in `src/export/`.
- No server code, no auth, no DB — static site only (SPEC.md §3 "Never").
- Test fixtures: small public-domain MIDIs in `fixtures/`, committed.
- Conventional commits; commit per milestone task.

## Current state
- Milestone: 5 — Config UI + external audio (see SPEC.md §6) — DONE
- M5 polish round (user feedback, 2026-07-15): dotScale is now canvas-relative
  (1/1000ths of canvas height per √sec; storage key bumped to v2) so 1080p
  export scales dots for free; range/default revised 2026-07-15 to 30–70,
  default 50 (was too small at 1–50/25) — ConfigPanel shows this as a
  default-relative percentage (60%–140%, `config.dotScale / DEFAULT.dotScale`)
  rather than the raw unit, which is meaningless to a user; radius-mode selector
  hidden but dormant (`SHOW_RADIUS_MODE_SELECTOR` in ConfigPanel.tsx);
  lead-in/lead-out silence in bars (default 2 each, sized from the score's
  first/last measured bar; timeline starts at negative seconds; REPLACED the
  automatic scroll-off end buffer); seek/scrub audio restart debounced 150ms
  (`restartSoundDebounced`) so skips never machine-gun crossed notes; canvas
  grab-drag scrubbing + click-a-dot-to-seek (pure helpers `timeAtX`/
  `findNoteAt` in mapping.ts); spacebar play/pause when no form control has
  focus; halo replaced by sounding-note animation — played notes become
  hollow rings forever (fill transparent from onset), outline flashes opaque
  and decays exponentially (`decayEnvelope`, k=5, normalized to hit resting
  alpha exactly at note end), plus a borderless clone riding the playhead
  that shrinks/fades to nothing by note end (clone pass skips window culling
  so long notes with off-screen starts still animate). Global instrument
  selector added post-M5 (2026-07-15): `loadInstrument` (instrument.ts) now
  also returns `instrumentNames`/`defaultInstrumentName`/`setInstrument`;
  ConfigPanel shows a dropdown once Play has loaded the sampler; choice
  persists as `VizConfig.instrumentName`. Per-track GM instruments remain
  Out (later) — SPEC.md now has the concrete bypass plan (sf2.presets
  bank/program + smplr's `sf2InstrumentToPreset`).
- M5 done: `Score.bars` (measure starts from the time-signature map,
  4/4 fallback, computed in `parseMidi`); `drawFrame` draws bar lines +
  numbers and per-voice connecting lines behind the dots (3 new VizConfig
  toggles); config sidebar `src/ConfigPanel.tsx` (track show/hide + color,
  bg, speed, dot scale, radius mode, playhead, toggles) persisted via
  `src/config/storage.ts` (localStorage, field-by-field validation);
  external audio (Flow 2) in `src/audio/externalAudio.ts` — uploaded
  mp3/wav plays via AudioBufferSourceNode instead of the synth, ±1000ms
  offset slider restarts the source live; hiding a track mid-play
  reschedules synth audio; scroll-off buffer now derives from live
  `pxPerSec` (old baked-in constant trap resolved); debug note counters
  removed.
- M4 done: `src/audio/{clock,instrument,scheduler}.ts` + Play/Pause/seek in
  `App.tsx` (rAF-driven `timeSec`, never Date.now/performance.now). Audio
  schedules notes straight from `Score` (no second MIDI parse). SoundFont
  `public/soundfonts/ChaosBank.sf2` (CC0 1.0, rKhive) over GPLv2
  `TimGM6mb.sf2` — deliberate, see SPEC §3 "swappable soundfont". Fixture
  `fixtures/fur_elise.mid` added for the §8 drift check. Offline-render
  smoke-tested — de-risks M6.
- SF2 bugs RESOLVED (2026-07-14): smplr's SF2→preset conversion reads only raw
  sample headers, ignoring zone generators. Two audible consequences, both
  fixed by `applyZoneGenerators` (instrument.ts): (1) pitch — root key lives
  in gen 58 when originalPitch is the "unset" 255→60 fallback, so zones played
  as middle-C recordings; (2) "ghost" note repeats — gens 2/3/45/50 narrow the
  nominal whole-sample loop to a short sustain tail, and gen 54 defaults to
  no-loop; ignoring them re-struck the attack every loop wrap on held notes.
  Don't resurrect "parse pitch from sample name" — dead end, checked.
- Known simplifications / traps: no devicePixelRatio scaling; VizConfig
  persists but per-track colors/visibility are session-only (reset on file
  load — per-file persistence would need a file identity key, deferred);
  external-audio offset is session-only too; playback end is MIDI-driven, so
  an external audio file longer than the MIDI gets cut off at scroll-out;
  one shared instrument for all tracks — smplr still drops
  velRange/vol-envelope/tuning generators (only 58+54+2/3/45/50 patched), so
  per-track GM instruments may hit layered patches; the `/piano/i` name
  heuristic is file-specific (GeneralUser.sf2 has no "piano" name at all —
  smplr reads low-level instrument names, not presets); scheduler.ts's
  upfront full-piece scheduling is untested at SPEC §5's dense-orchestral
  scale; M6's exporter needs explicit note durations — scheduler.ts's
  setTimeout note-offs never fire in a faster-than-realtime offline render,
  and in external-audio mode the exporter must pull audio from the uploaded
  buffer (offset-shifted), not the synth.
- Next: Milestone 6 — MP4 export
<!-- Update this section at the end of every session; it replaces chat history. -->

## Rules
- Read SPEC.md before non-trivial changes. Do not restate it; reference sections.
- No new dependencies without stating why in the commit message.
- If stuck after 2 attempts, stop and summarize the problem instead of thrashing.
- Do not pre-build "Out (later)" features (MusicXML, DTW alignment, OMR).
