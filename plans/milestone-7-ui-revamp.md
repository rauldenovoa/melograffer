# Milestone 7 — Website/App UI Design Revamp

## Context

The app *works* but looks like raw browser widgets on a system-font page: native
unstyled buttons/selects/sliders, `system-ui` everywhere, `color-scheme: light dark`
so the chrome flips with the OS, and only two hardcoded UI colors (`#444` borders,
`#e5484d` error text). SPEC.md §6 M7 (BACKLOG #26, #27) calls for the app's
*container* — page layout, typography, color palette, panels, buttons, header/chrome —
to be redesigned to read as a **professional, elegant, understated product (not flashy)**.
This is explicitly the page *around* the canvas; the canvas visualization's own rendering
styles are M13, out of scope here.

**Decisions locked with the user:**
1. **Direction:** Dark jewel-tone. Near-black chrome, warm cream text, deep blue→green
   accent pulled directly from the `melograffer_logo_color.png` sphere (sampled pixel
   values, not the BACKLOG #26 Threads-scrape palette — see Design tokens below).
   Concert-hall/premium feel. Note: `melograffer_logo_color_dark.png` is a color-inverted
   (pastel) negative of the same asset, intended for light surfaces — not used here since
   we're committing to the dark chrome.
2. **Typography:** Add a self-hosted web font (serif display for the wordmark/headings +
   humanist sans for UI). No runtime CDN — vendor woff2 files. Note the reason in the commit.
3. **Layout:** Restructure into a product shell — top app bar, refined sidebar cards,
   dedicated bottom transport bar. Keep every existing role / aria-label / button text.
4. **Theme:** Commit to the single dark theme. No toggle. (Canvas bg stays independently
   user-configurable as today.)

## Hard constraints (must not break `App.test.tsx`)

Tests query by role / aria-label / text, never by CSS class, so markup can move freely
**as long as these survive**:
- A heading (`<h1>`) with accessible name matching `/melograffer/i` → keep
  `<h1><img alt="Melograffer" …/></h1>` in the header.
- All existing `aria-label`s: `Show track …`, `Color for track …`, `Background color`,
  `Scroll speed`, `Dot scale`, `Playhead position`, `Audio offset`, `Audio file`,
  `MIDI file`, `Playback position`, `Instrument`, `Export aspect ratio`.
- Button accessible names: `Play` / `Pause` (exact `^play$` matters), `Remove`,
  `Choose File` (or equivalent — retest names below), `Export MP4`, `Reset to defaults`.
- The hidden `<input type="file" accept=".mid,.midi">` + `<input type="file" accept="audio/*">`
  must remain (tests fire `change` on them).
- MIDI filename text, `staffA:`/`staffB:` track-name text, external-audio filename text.
- localStorage key `melograffer.vizConfig.v2` (untouched — not editing `config/storage.ts`).

Run `npm test` after the change; if a button's visible label changes, update the one
matching `getByRole('button', {name})` query in the test rather than contorting the UI.

## Design tokens (new — CSS custom properties in `index.css`)

Introduce a `:root` token layer (there is none today). Accent colors are sampled
directly from `public/images/melograffer_logo_color.png` (the deep/saturated sphere,
not its pastel `_dark` negative) via a pixel scan for the most saturated blue and green
points: blue pole `#1C6BAF`, green pole `#006E48`. Contrast-checked (WCAG formula)
against the near-black tokens below: both exceed the 3:1 non-text-UI-component minimum
against `--bg`/`--surface`, and white label text on either as a button fill clears 4.5:1
(5.57:1 and 6.32:1 respectively) — safe for the primary-button gradient.

```
--bg:        #0B0B0F   /* page */
--surface:   #16161C   /* sidebar cards, app bar */
--surface-2: #1E1E26   /* inputs, elevated */
--border:    #2A2A34
--text:      #F6E3E5   /* cream, headings */
--text-body: #E4E1E3
--text-muted:#9A9AA6
--accent:       #1C6BAF /* logo sphere blue pole, sampled */
--accent-bright:#4A9CE0 /* lightened blue, for text-sized accents needing AA text contrast */
--accent-green: #006E48 /* logo sphere green pole, sampled */
--accent-gradient: linear-gradient(135deg, var(--accent) 0%, var(--accent-green) 100%)
--danger:    #E5484D
--radius:    10px
--font-ui:  'Inter', system-ui, -apple-system, sans-serif
--font-display: 'Fraunces', 'Iowan Old Style', Georgia, serif
```
Set `accent-color: var(--accent)` globally so native checkboxes/ranges pick up the theme
for free. Drop `color-scheme: light dark` → `color-scheme: dark`.

## Typography (self-hosted, no CDN)

- Vendor **Fraunces** (serif display) and **Inter** (UI sans) as woff2 — both OFL/free.
  Fetch latin-subset woff2s during implementation into `public/fonts/`, declare via
  `@font-face` in `index.css` with `font-display: swap`.
- Fraunces for the app-bar wordmark echo / section eyebrows; Inter for all controls/body.
- Commit message states the *why* (premium brief; self-hosted for offline/privacy, no
  runtime dependency) per CLAUDE.md "no new deps without stating why" — these are static
  assets, not npm packages.

## Layout — product shell

Restructure `App.tsx`'s render tree (logic untouched — only JSX 460–561 and class names):

```
<div class="app-shell">
  <header class="app-bar">
     <h1><img alt="Melograffer" src=melograffer_title_dark.png (~40px)></h1>
     <div class="app-bar-actions">  ← Choose MIDI · Audio file, as buttons
  </header>
  <div class="workspace">           ← grid: sidebar + stage
     <ConfigPanel/>                 ← sidebar, now styled cards
     <section class="stage">
        <div class="canvas-frame">  ← canvas with rounded frame + subtle ring
           (empty state: styled placeholder when no score; wire real drag-drop
            onto this frame so the existing "Drop a MIDI file" copy is truthful —
            hidden inputs + buttons stay for the tests)
        </div>
        <div class="transport">     ← Play/Pause · scrubber · time readout mm:ss / mm:ss
        </div>
        <div class="audio-row"> … external-audio filename + Remove + offset slider … </div>
     </section>
  </div>
</div>
```

- **File actions** (MIDI picker button + audio input) move into the app bar; keep the
  hidden `.mid` input + the `audio/*` input in the DOM.
- **Transport bar**: Play/Pause primary button + full-width scrub range + a new
  `mm:ss / mm:ss` time readout derived from `timeSec` / `playbackEndSec` (pure formatting,
  no logic change).
- **Empty state**: replace the bare `<p>Drop a MIDI file…</p>` + button with a styled
  placeholder inside `.canvas-frame`; add `onDragOver`/`onDrop` handlers reusing the
  existing `handleFileChange` parse path (small, matches existing copy).

## Component styling (all in `App.css`, rewritten)

- **Buttons:** `.btn` base (Inter, `--surface-2`, `--border`, `--radius`, hover lift);
  `.btn-primary` (`--accent-gradient`) for Play and Export MP4; ghost/secondary for
  file pickers, Remove, Reset.
- **Sidebar cards:** keep `<fieldset>`/`<legend>` (a11y grouping) but style them as cards
  — `--surface` bg, `--border`, `--radius`, legend as a small Fraunces eyebrow label.
- **Native controls:** style `select`, `input[type=range]` (webkit/moz thumb + track in
  accent), `input[type=number]`, `input[type=color]` swatch, checkboxes (via
  `accent-color`) to match the dark theme.
- **Track rows:** color swatch + checkbox + ellipsised name, tightened spacing.

## Files to touch

| File | Change |
|---|---|
| `src/index.css` | Token `:root` layer, `@font-face` (Fraunces/Inter), base body/type, `color-scheme: dark` |
| `src/App.css` | Full rewrite: app-bar, workspace grid, stage/canvas-frame, transport, buttons, native-control theming |
| `src/App.tsx` | Restructure JSX into the shell (header/workspace/stage/transport); add time readout + drag-drop empty state. **No playback/audio logic changes.** |
| `src/ConfigPanel.tsx` | Class-name / minor structural tweaks for the card look; keep all aria-labels/roles |
| `index.html` | `theme-color` meta, switch favicon to color-logo, keep `<title>` |
| `public/fonts/*.woff2` | New vendored Fraunces + Inter subsets |
| `public/images/` | (reuse existing `melograffer_title_dark.png` / `melograffer_logo_color.png`) |
| `src/App.test.tsx` | Only if a queried button label changes |

Do **not** touch `render/`, `audio/`, `export/`, `midi/`, `config/storage.ts`, `types.ts`.

## Verification

1. `npm run dev`, open the preview, load `fixtures/multitrack.mid` (and the many-track
   `Led Zeppelin…` fixture to check the sidebar card scroll). Screenshot the shell.
2. Confirm end-to-end: Play toggles to Pause, scrubber + time readout move, an instrument
   loads, Export panel renders. Drag-drop a `.mid` onto the canvas frame loads it.
3. `read_console_messages` clean; check fonts load (Network) and no CDN request.
4. `resize_window` mobile/tablet — workspace should stack gracefully (sidebar above/below
   stage), no horizontal page scroll.
5. `npm test` (all `App.test.tsx` pass), `npm run lint`, `npx tsc --noEmit`.

## Process (per CLAUDE.md)

- After approval, copy this plan to `plans/milestone-7-ui-revamp.md` before implementing.
- Conventional commits, one per coherent task (tokens+fonts, shell layout, control styling,
  ConfigPanel cards). Update CLAUDE.md "Current state" to mark M7 done and point Next → M8.
