# Milestone 2 — MIDI ingest + data model

## Context
Milestone 1 (scaffold) is done and deployed. Per SPEC.md §6, Milestone 2's definition of done is: "Drop .mid → track list with names/note counts rendered; unit tests on 2 sample MIDIs." This plan implements the MIDI parsing layer, the domain data model, a minimal file-drop UI to visually confirm parsing works, and commits the two fixture MIDIs required for the unit tests.

## Fixture sourcing (confirmed with user)
User chose to download real public-domain files rather than synthesize them. Both come from **Mutopia Project** (mutopiaproject.org), which only hosts public-domain/CC-licensed, LilyPond-generated scores with MIDI previews — clean provenance, no attribution ambiguity.

- `fixtures/bach_invention.mid` ← https://www.mutopiaproject.org/ftp/BachJS/BWV772/bach-invention-01/bach-invention-01.mid (Bach, Invention No. 1 in C major, BWV 772 — solo keyboard, 2-voice contrapuntal texture)
- `fixtures/multitrack.mid` ← https://www.mutopiaproject.org/ftp/BachJS/BWVAnh114/Minuet-xpose/Minuet-xpose.mid — kept as SPEC.md's exact required fixture filename (`multitrack.mid`), which is attribution-neutral. Note for the commit message and any future on-screen/README credit only: Mutopia catalogs this under Bach's Anh. 114, but the piece ("Menuet in G", from the Anna Magdalena Notebook) is now musicologically attributed to **Christian Petzold**, not Bach — a well-known, settled misattribution. Wherever this piece is credited in text, say **"Petzold (formerly attrib. J.S. Bach), BWV Anh. 114"**, never just "Bach".

Before downloading either file during execution, I will restate the exact filename/URL/size in chat and get explicit confirmation, per the download-permission rule — this plan approval alone does not count as that confirmation.

**Track-count assumption flagged, not trusted:** the description above ("2 separate instrument tracks" for the trumpet duet) is what Mutopia's page text implies, not something confirmed by opening the file. I will not hardcode an assumed track count anywhere (fixture naming, test assertions, or this plan's later steps) — after downloading, I'll actually parse the file first (e.g. a quick Node/vitest scratch check) and read off the real track count and per-track note counts before writing any test assertions or referring to it as "multitrack" in code/comments.

## Data model — `src/types.ts`
Per SPEC.md §4, matching field names exactly:
```ts
export interface Note {
  startSec: number
  durationSec: number
  midiNote: number
  velocity: number // 0-1
}

export interface Track {
  id: string
  name: string
  notes: Note[]
  color: string
  visible: boolean
}

export interface Score {
  tracks: Track[]
}
```
`color` is assigned from a small fixed default palette (cycled by track index) at parse time — it's part of the declared `Track` shape in SPEC §4, not new scope. `visible` defaults to `true`.

## MIDI parsing — `src/midi/`
- Add `@tonejs/midi` to `package.json` dependencies (commit message states why: standard, actively maintained MIDI parser already named as the candidate library in SPEC.md §4).
- `src/midi/parseMidi.ts`: `export function parseMidi(data: ArrayBuffer): Score`
  - Uses `new Midi(data)` from `@tonejs/midi`.
  - Maps each `midi.tracks[i]` → our `Track`: `id = 't' + i`, `name = track.name || track.instrument?.name || 'Track ' + (i + 1)`, `notes` mapped from `track.notes[]` (`.time` → `startSec`, `.duration` → `durationSec`, `.midi` → `midiNote`, `.velocity` → `velocity`), `color` from palette, `visible = true`.
  - Pure function, no I/O — matches the codebase's "isolate MIDI parsing" convention and keeps it trivially testable.
- `src/midi/parseMidi.test.ts`: loads both fixtures via `fs.readFileSync` (Node/vitest environment, not jsdom), converts `Buffer` → `ArrayBuffer`, and asserts track count / track names / total note counts per fixture. **All of these numbers — including track count, not just note counts — will be read off the actual parsed output after download, never assumed.** In particular, the "multitrack" fixture is expected to have multiple tracks based on Mutopia's page text, but that will be verified by actually parsing the file (e.g. a quick scratch script logging `midi.tracks.map(t => [t.name, t.notes.length])`) before any assertion is written — if it turns out to collapse to one track, the test will assert what's actually there and the milestone plan will be revisited rather than the file swapped without noting it.

## Minimal UI — `src/App.tsx`
- Replace the placeholder with a `<input type="file" accept=".mid,.midi">`.
- On change: read the file via `file.arrayBuffer()`, call `parseMidi`, store the resulting `Score` in `useState`.
- Render a `<ul>` below the input: one `<li>` per track showing `track.name` and `${track.notes.length} notes`.
- Keep styling minimal (reuse `App.css`), no config sidebar / colors UI yet — that's Milestone 5 scope.
- Update `src/App.test.tsx` only if the placeholder-heading test breaks; add a small test rendering `App` and simulating a file input change with one fixture, asserting the track list appears (jsdom's `File`/`FileReader` support is sufficient for this).

## Out of scope (explicitly not building now)
- Canvas rendering (`drawFrame`) — Milestone 3.
- Audio playback — Milestone 4.
- Track color pickers / visibility toggles / persistence — Milestone 5.

## Verification
1. `npm test` — new `parseMidi.test.ts` passes against both committed fixtures; existing `App.test.tsx` still passes (updated if needed).
2. `npm run lint && npx tsc --noEmit` — clean (strict TS).
3. `npm run dev`, open in browser, drop `fixtures/bach_invention.mid` → confirm track list renders with plausible name/note count; repeat with `fixtures/multitrack.mid` → confirm 2 tracks appear.
4. `npm run build` to confirm production build still succeeds (Vercel deploy parity).

## Commit
One conventional commit for the milestone (per CLAUDE.md: "commit per milestone task"), e.g. `feat(midi): parse MIDI files into Score data model (M2)`, body noting the new `@tonejs/midi` dependency and its purpose. Separately update CLAUDE.md's "Current state" section (Milestone 2 → DONE, Next → Milestone 3) the same way Milestone 1 was marked done.
