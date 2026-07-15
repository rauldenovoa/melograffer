# Global MIDI instrument selector

## Context
SPEC.md's "Out (later)" list has two separate instrument-selection items. The user asked to build the **global** one now ("Low effort whenever wanted") and leave the harder **per-track GM-honoring** one deferred, but with a concrete plan written down so the investigation done today isn't lost.

Root cause recap (for the commit message / SPEC update): smplr's `Soundfont2` wrapper only exposes the SF2 file's raw *instrument* names (`instrumentNames`/`loadInstrument(name)`), never the *preset* layer where GM bank/program numbers actually live. `instrument.ts`'s `/piano/i` regex is a one-shot workaround for ChaosBank.sf2's non-GM-ordered instrument list — it hardcodes one instrument for the whole piece today. This plan exposes that same single global choice to the user via a dropdown; it does not touch GM/per-track logic.

## Changes

**`src/audio/instrument.ts`**
`loadInstrument()` currently loads the sampler, picks a name via `PREFERRED_INSTRUMENT_PATTERN`, and returns only `{ start }`. Extend the returned shape to also expose:
- `instrumentNames: string[]` — straight from `sampler.instrumentNames`.
- `defaultInstrumentName: string` — the name the `/piano/i` heuristic resolved to (today's behavior, unchanged).
- `setInstrument(name: string): Promise<void>` — thin wrapper over `sampler.loadInstrument(name)`.

**`src/types.ts` / `src/render/defaultConfig.ts`**
Add `instrumentName: string` to `VizConfig`, default `''` (empty = "no persisted preference, use the built-in default pick"). No changes needed in `src/config/storage.ts` — its per-key loop already validates any plain string field generically.

**`src/App.tsx`**
- Add state `instrumentNames: string[]` (default `[]`) and `selectedInstrument: string` (default `''`).
- In `handlePlayPause`, right after `instrumentRef.current = await loadInstrument(ctx)`: populate `instrumentNames`; resolve the initial name (`config.instrumentName` if it's in the list, else `defaultInstrumentName`); if it differs from the default pick, `await instrumentRef.current.setInstrument(initialName)` before the first note is scheduled; set `selectedInstrument`.
- New `handleInstrumentChange(name)`: calls `instrumentRef.current?.setInstrument(name)`, updates `selectedInstrument`, persists `instrumentName` via `setConfig`, and — mirroring `handleTrackChange`'s existing reschedule-if-playing block (App.tsx:210-221) — if `isPlaying && !externalPlayerRef.current`, stop and restart sound at the current clock position so the change is audible immediately instead of only on the next Play.
- Pass `instrumentNames`, `selectedInstrument`, `onInstrumentChange` down to `<ConfigPanel>`.

**`src/ConfigPanel.tsx`**
New "Sound" fieldset with a `<select aria-label="Instrument">` (options = `instrumentNames`), rendered only when `instrumentNames.length > 0` — same conditional-render pattern already used for the Tracks fieldset (`score && ...`). Before the instrument loads (i.e. before first Play), the fieldset simply isn't there yet.

## Tests
- **`src/App.test.tsx`**: extend the `vi.mock('./audio/instrument', ...)` fixture with `instrumentNames`, `defaultInstrumentName`, `setInstrument`. Add cases: dropdown appears with the mocked names after Play; selecting an option calls `setInstrument` and persists `instrumentName` to localStorage; a pre-existing persisted `instrumentName` gets applied via `setInstrument` before the first note plays.
- **`src/config/storage.test.ts`**: add `instrumentName` to the round-trip test.
- `src/audio/instrument.test.ts` (existing `applyZoneGenerators` tests) is unaffected.

## SPEC.md
- Remove the "MIDI instrument selector (global)" bullet from Out (later) — it's built now, not deferred. Note it done in CLAUDE.md's "Current state" instead (matches how M5 polish items were recorded).
- Rewrite the "Per-track instruments honoring GM program number" bullet with the concrete approach found today: `soundfont2`'s parsed `sf2.presets[i].header.{bank, preset}` already carries the real GM address (smplr's wrapper ignores it); a fix would look up presets by bank+program ourselves, pull each preset's instrument(s), run them through the existing `applyZoneGenerators` patch plus smplr's exported `sf2InstrumentToPreset()` helper, and play them via smplr's lower-level `Sampler` class instead of its `Soundfont2` convenience wrapper (one `Sampler` per distinct program number used) — plus capturing each track's program number in `Score` (currently discarded in `parseMidi.ts`, though `@tonejs/midi` already parses it as `track.instrument.number`). Also note `spessasynth_lib` (M4's original candidate, passed over for smplr) as worth a look if it does bank/program addressing natively.

## Verification
- `npm test`, `npm run lint`, `npx tsc --noEmit`.
- Live browser: drop a MIDI fixture, press Play, confirm the new "Sound" dropdown appears listing ChaosBank's real instrument names; switch it mid-playback and confirm the sound changes; reload the page and confirm the persisted choice is still selected and audible without re-selecting.
