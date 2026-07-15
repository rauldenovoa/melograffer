# Milestone 1 — Scaffold + Deploy

## Context
Melograffer is a client-only MIDI visualizer (SPEC.md). The repo currently holds only
`SPEC.md`, `CLAUDE.md`, `.DS_Store` — no git, no code. Milestone 1 (SPEC §6) is purely
**Scaffold: Vite+React+TS, Vercel deploy green**. DoD: *"App deploys; placeholder page loads."*
Goal: stand up the toolchain (dev/test/lint/build all green) and the module layout from
CLAUDE.md so M2–M6 drop into place, then ship a live Vercel deploy. **No canvas, no MIDI
parsing, no domain types yet** — those belong to M2–M6.

Decisions confirmed with user:
- GitHub: **public** repo `melograffer` created via `gh` (authed as rauldenovoa).
- Deploy: **Vercel CLI** — user runs interactive `vercel login`; I run link + deploy.
- Stack pinned per SPEC §4: React **18**, TypeScript strict, Vite, Canvas 2D (no canvas code yet).

## Files to create
Authoring manually (not `npm create vite`) to avoid the interactive prompt overwriting
`SPEC.md`/`CLAUDE.md` in this non-empty dir.

Root:
- `package.json` — react/react-dom `^18`; devDeps: vite, @vitejs/plugin-react, typescript,
  @types/react `^18`, @types/react-dom `^18`, vitest, jsdom, @testing-library/react,
  @testing-library/jest-dom, eslint + @eslint/js + typescript-eslint + eslint-plugin-react-hooks
  + eslint-plugin-react-refresh + globals. Scripts: `dev`, `build`, `preview`, `test`, `lint`
  (exactly the commands CLAUDE.md lists).
- `index.html`
- `vite.config.ts` — react plugin + vitest block (`environment: 'jsdom'`, `setupFiles`, `globals: true`).
- `tsconfig.json` (strict) + `tsconfig.node.json`.
- `eslint.config.js` (flat config).
- `.gitignore` (node_modules, dist, .vercel, .DS_Store, *.local).
- `README.md` — project blurb + **Malinowski / Music Animation Machine attribution (SPEC §10)**.

src/:
- `main.tsx`, `App.tsx` (placeholder landing page: app name + "Milestone 1 — scaffold" note),
  `index.css`, `App.css`, `vite-env.d.ts`.
- `App.test.tsx` — smoke test: renders `<App/>`, asserts heading present (satisfies `npm test`).
- `vitest.setup.ts` — jest-dom matchers.
- Empty module dirs to lock in CLAUDE.md layout: `src/midi/.gitkeep`, `src/render/.gitkeep`,
  `src/audio/.gitkeep`, `src/export/.gitkeep`. (Dirs only — no `types.ts`/logic; that's M2+.)

## Commands (in order)
1. `npm install`
2. `npm run lint`
3. `npx tsc --noEmit`
4. `npm test -- --run`
5. `npm run build`
6. `npm run preview` (background) → browser-MCP load `http://localhost:4173`, confirm placeholder.
7. `git init && git add -A && git commit -m "chore: scaffold Vite+React+TS (M1)"`
8. `gh repo create melograffer --public --source=. --remote=origin --push`
9. Deploy (Vercel CLI, no global install — use `npx vercel`):
   - **User runs** `! npx vercel login` (interactive, browser).
   - `npx vercel link --yes`
   - `npx vercel --prod --yes`  (Vercel auto-detects Vite; output dir `dist`)
   - browser-MCP load the returned prod URL → confirm placeholder page loads.
10. Commit any `.vercel`/config follow-ups if generated (with reason in message).
11. Update **CLAUDE.md "Current state"**: Milestone 1 → Done (scaffold + deploy live), Next → M2.

## Verification (DoD SPEC §6: "App deploys; placeholder page loads")
- Toolchain green: lint, `tsc --noEmit`, `npm test`, `npm run build` all pass (proves the
  commands CLAUDE.md promises actually work → M2+ drops in).
- Local: `npm run preview` serves the placeholder; browser MCP confirms it renders.
- Live: `vercel --prod` returns a green URL; browser MCP loads that URL and shows the placeholder.
- Layout check: `src/{midi,render,audio,export}/` exist per CLAUDE.md conventions.

## Scope guard
Strictly M1. No `drawFrame`, no `@tonejs/midi`, no `src/types.ts` content, no audio/export
code — all deferred to their milestones. Only new deps are toolchain/test/lint (justified in
the commit message per CLAUDE.md's dependency rule).
