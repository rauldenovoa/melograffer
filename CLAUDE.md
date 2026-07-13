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
- Milestone: 1 — Scaffold (see SPEC.md §6) — DONE
- Done: Vite+React+TS scaffold (strict TS, eslint, vitest smoke test); module dirs
  `src/{midi,render,audio,export}` created empty. Repo: github.com/rauldenovoa/melograffer
  (public). Deployed: https://melograffer.vercel.app (Vercel CLI, `vercel.json` pins
  framework/build/output since zero-config detection missed Vite).
- Next: Milestone 2 — MIDI ingest + data model (`src/types.ts`, `@tonejs/midi` parsing,
  fixtures in `fixtures/`)
<!-- Update this section at the end of every session; it replaces chat history. -->

## Rules
- Read SPEC.md before non-trivial changes. Do not restate it; reference sections.
- No new dependencies without stating why in the commit message.
- If stuck after 2 attempts, stop and summarize the problem instead of thrashing.
- Do not pre-build "Out (later)" features (MusicXML, DTW alignment, OMR).
