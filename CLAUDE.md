# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is actually here

Only `frontend/` contains code. `backend/`, `infra/`, `docs/` and `ws/` are empty
directories — placeholders, not modules you have failed to find.

`deploy/` and `scripts/deploy.sh` were **inherited from a different product** (a
streaming app on the same domain) and were never rewritten for this one. They
describe a Bun/Postgres API on `:3004`, MediaMTX/HLS playback, pm2 and
`communities`/`streams` routes — none of which exist in this repo. Read them as
history, not as documentation of this app:

- `scripts/deploy.sh` aborts in preflight without `backend/.env` and `infra/.env`,
  neither of which this repo ships.
- `deploy/notes.md` talks about "two hostnames"; both names in it are the same
  string, left over from a find-and-replace.
- `deploy/nginx/task.mhamzah.id` carries live legacy proxy blocks its own
  comments mark as dead.

Do not "fix" these to match the frontend unless asked — they are production
routing for a box this repo does not otherwise describe.

## Commands

All of these run from `frontend/`:

```bash
npm install
npm run dev       # vite dev server
npm run build     # production bundle into frontend/dist
npm run lint      # oxlint; must be silent, warnings included
npm run preview   # serve the built bundle
```

There is **no test runner configured** — no vitest, no jest, no test script. If
you need to prove a change works beyond `lint` and `build`, the cheapest real
check is an SSR smoke render: build a temporary entry with
`npx vite build --ssr <entry>.jsx --outDir .smoke`, `renderToString` each screen
inside `<AppProvider>`, run it with `node`, then delete the entry and `.smoke`.
The output directory must stay inside `frontend/` or Node cannot resolve `react-dom`.

`scripts/deploy.sh` is not runnable here (see above).

## Frontend architecture

React 19 + Vite 8 + Tailwind CSS v4, plain JSX — no TypeScript, no router, no
data layer. It is a **working prototype**: every task, member, file and message is
generated once in `src/data/seed.js`, nothing is persisted, and a reload resets
everything.

State lives in one place and derivations live in another:

- `src/state/AppProvider.jsx` holds the entire app state object plus every action
  that mutates it. Actions are grouped by area (session, navigation, tasks,
  statuses, labels, members, workspaces, dialogs, messaging).
- `src/state/context.js` and `src/state/useApp.js` are split out from the provider
  so `only-export-components` stays quiet. `useApp()` returns `{ state, actions }`.
- `src/lib/select.js` derives everything read-only — filtered tasks, status
  counts, workspace summaries, file lists. Components call these rather than the
  store growing a view model.
- **Transient UI state stays local to the component that owns it**: open filter
  dropdown, colour picker, role menu, label draft, comment/chat drafts, drag-over.
  Only state that two distant components share is in the store.

Screens switch on `state.screen` (`login` / `workspaces` / `tasks` / `files` /
`settings`) inside `src/App.jsx`. There is no URL routing, so nothing is
linkable and back/forward do nothing.

`revealTask(taskId)` is the one cross-cutting action: `/TSK-104` references in
comments and chat, plus global search hits, jump to that task's workspace and
open its drawer. `src/components/RichText.jsx` renders those tokens and only
links the ones that resolve to a real task.

## Design source and tokens

The UI is a port of a Claude design project (`Taskspace.dc.html`, project
`07e5b6fc-712e-42a9-93a5-3cadde0e7622`), readable through the `claude_design` MCP
with `/design-login`. When something looks off, that file is the reference.

Tokens are Tailwind v4 `@theme` entries in `src/index.css`. The palette is
deliberately near-monochrome: one `--color-ink` used at many opacities carries
every hairline, muted label and scrim, so `border-ink/9` and `text-ink/55` are
the normal way to write those — not new tokens. Status colours are per-workspace
state, not theme tokens; they are edited at runtime in workspace settings.

The design's three editor props (accent, density, default view) are constants in
`src/lib/config.js`.

Icons are literal glyph characters (`⌕ ✕ ⇄ ⌄ ⠿ ◫ ◌ ✉ ＋`), as in the design. There
is no icon library.

## Tailwind v4 traps this codebase has already hit

- **Numeric font weights do not compile.** `font-500` / `font-600` silently
  produce no CSS and the text renders at 400. Use `font-medium`, `font-semibold`,
  `font-bold`. (The pre-port code had this bug throughout.)
- **Base CSS must be inside `@layer base`.** Unlayered CSS outranks every
  layered utility regardless of specificity, so a plain `button { color: inherit }`
  beats `text-white` on a dark button and the label disappears. Preflight already
  gives form controls `font: inherit` and `color: inherit`; do not restate them.
  The one intentionally unlayered rule is `:focus-visible`, which must outrank the
  `outline-none` on the borderless inline inputs.
- **`border-none` cancels `border-b`.** Preflight already zeroes borders on
  buttons, so `border-none` is never needed and actively breaks hairline rows.
- Verify a suspicious utility by grepping the built CSS in `frontend/dist/assets/`
  rather than trusting that it compiled — Tailwind does not error on a class it
  cannot generate.

## Conventions

- Exact pixel values from the design are kept as arbitrary values
  (`text-[12.5px]`, `gap-[9px]`) rather than rounded to the nearest scale step.
- Comments explain *why* a non-obvious decision was made, not what the line does.
  Match that density; most components carry none.
- Adjusting state during render (the `draftFor` pattern in `TaskDrawer.jsx`) is
  preferred over a `useState` + `useEffect` sync pair, which oxlint flags.
