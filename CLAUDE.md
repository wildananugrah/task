# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is actually here

`frontend/` (React), `backend/` (Bun + Hono + Drizzle API), `ws/` (Bun WebSocket
chat), `infra/` (compose file, env template, runbook) and `docs/SPEC.md`. All
four are real; none of them are placeholders any more.

`scripts/deploy.sh` **does deploy this app** — infra, migrations, both pm2
processes, the bundle and the nginx site. `ecosystem.config.cjs` at the root
declares `task-api` and `task-ws`; this box runs unrelated apps under pm2, so
both are addressed by name and `pm2 restart all` is never correct here.

`deploy/nginx/task.mhamzah.id` is the live site config, and it is **shared with a
different product** on the same host. Its `/api/` and `/ws` blocks are this app's;
the `/users`, `/streams`, `/communities` and `/hls` blocks below them are that
other product's, dead, and marked so by their own comments. Leave them — they are
production routing this repo does not otherwise describe. `deploy/notes.md` is
the same vintage: it talks about "two hostnames" that are the same string, left
over from a find-and-replace.

The deploy refuses to run in preflight if `backend/.env` still has
`AUTH_DEV_MODE=true`, a localhost `APP_ORIGIN`, placeholder secrets, or a
`WS_TICKET_SECRET` that disagrees with `ws/.env`. Those are the four ways a
development env file quietly becomes a production incident.

## Commands

Root (a Bun workspace over `backend/` and `ws/`):

```bash
bun install
bun run dev:api      # API with reload, :3004
bun run dev:ws       # chat socket with reload, :3005
bun run db:push      # apply backend/drizzle/*.sql
bun run db:seed      # demo data; idempotent
bun test             # backend suite, against <database>_test
```

From `backend/`: `bun run db:generate` after editing the schema, `bun run
db:reset` to drop and rebuild, `bun run files:sweep` for unconfirmed uploads.

From `frontend/`:

```bash
npm install
npm run dev       # vite dev server, :5173, proxies /api to the backend
npm run build     # production bundle into frontend/dist
npm run lint      # oxlint; must be silent, warnings included
npm run preview   # serve the built bundle
```

Services come up with `docker compose -f infra/docker-compose.yml --env-file
infra/.env up -d`. `infra/README.md` is the runbook, including which variables to
change when 3004/3005/5432/9000 are already taken on the machine.

**The frontend has no test runner.** Beyond `lint` and `build`, the cheapest real
check is an SSR smoke render: build a temporary entry with
`npx vite build --ssr <entry>.jsx --outDir .smoke`, render each screen inside an
`AppContext.Provider` holding a state snapshot (the components read the store,
not the network, so a snapshot is enough), run it with `node`, then delete the
entry and `.smoke`. The output directory must stay inside `frontend/` or Node
cannot resolve `react-dom`. That catches render crashes but not effects — a
module-ordering bug in `AppProvider` passed the smoke render and only showed up
in a browser, so drive the real app for anything touching the store.

## Architecture

`docs/SPEC.md` is the full picture. In short:

```
browser ──/api/*──────────► backend :3004 ──► postgres
        ──/ws?ticket=…────► ws :3005      ──► postgres
        ──PUT/GET presigned──────────────────► S3 bucket
```

Load-bearing decisions, each of which has a comment at its site:

- **Task ids are derived**, never stored: `prefix + '-' + number`. That is what
  makes changing a workspace's prefix renumber everything for free.
- **Task numbers** come from `max()+1` under a transaction-scoped advisory lock
  keyed on the workspace. An earlier version retried on the unique-index
  violation instead and silently did not work — Drizzle wraps the driver error,
  so the constraint name was not in the message the retry matched on.
- **Files never pass through the API**: presign → the browser `PUT`s the bytes →
  confirm. Rows stay `pending`, and invisible to every read, until that confirm.
- **The socket fans out per person** (`user:<id>`), not per conversation.
  Conversation topics delivered twice to anyone reachable both ways and left a
  socket deaf to a DM opened after it connected.
- **Sessions are an httpOnly cookie**; the socket takes a separate 60-second
  ticket because the cookie does not cross the port boundary.
- **Roles are enforced in `src/lib/access.ts` and nowhere else.** A workspace you
  are not in is a 404, not a 403 — membership is not something to probe for.

## Frontend

React 19 + Vite 8 + Tailwind CSS v4, plain JSX — no TypeScript, no router.

- `src/lib/api.js` is the only module that calls the API; it throws `ApiError`
  carrying the server's own `code`.
- `src/lib/socket.js` is the chat socket with backoff reconnect.
- `src/state/AppProvider.jsx` holds the whole state object and every action.
  Actions are async and grouped by area (session, navigation, browsing, tasks,
  statuses, labels, members, workspaces, dialogs, messaging). Every write goes
  through `run()`, which turns a failure into `state.error` rather than silence.
- `src/state/context.js` and `src/state/useApp.js` are split out from the
  provider so `only-export-components` stays quiet. `useApp()` returns
  `{ state, actions }`.
- `src/lib/select.js` derives everything read-only, `src/lib/format.js` does all
  display formatting (dates, sizes, relative times).
- **Transient UI state stays local to the component that owns it**: open filter
  dropdown, colour picker, role menu, label draft, comment/chat drafts, drag
  state. Only state two distant components share is in the store.

Screens switch on `state.screen` (`loading` / `login` / `workspaces` / `tasks` /
`files` / `settings`) inside `src/App.jsx`. There is no URL routing; the last
workspace is remembered in `localStorage` so a reload keeps your place.

`revealTask(idOrRef)` is the cross-cutting action: `/TSK-104` references and
global search hits jump to that task's workspace and open its drawer, loading
the workspace first if it is a different one. `RichText.jsx` renders those
tokens and only links ones that resolve — the store resolves refs from other
workspaces through search and caches them in `state.refIndex`.

## Design source and tokens

The UI is a port of a Claude design project (`Taskspace.dc.html`, project
`07e5b6fc-712e-42a9-93a5-3cadde0e7622`), readable through the `claude_design` MCP
with `/design-login`. When something looks off, that file is the reference.

Tokens are Tailwind v4 `@theme` entries in `src/index.css`. The palette is
deliberately near-monochrome: one `--color-ink` used at many opacities carries
every hairline, muted label and scrim, so `border-ink/9` and `text-ink/55` are
the normal way to write those — not new tokens. Status colours are per-workspace
rows in the database, not theme tokens; they are edited at runtime in settings.

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

## Backend conventions

- Every failure goes through `src/lib/errors.ts`, which produces
  `{ error: { code, message, detail } }`. Those helpers are **function
  declarations returning `never`** on purpose: as arrows, TypeScript will not
  narrow after `if (!user) unauthorized()`.
- Request bodies are parsed with a Zod schema through `src/lib/validate.ts`, so a
  bad body is always the same 400 with the offending field named.
- Row → wire conversion lives in `src/lib/shape.ts` and nowhere else.
- Reads that serve a whole screen live in `src/lib/queries.ts` and are written to
  avoid a query per row.
- Drizzle's `date` column comes back from Bun's driver as a `Date`, which
  serialises as UTC midnight and reads as the previous day west of London. The
  `calendarDate` custom type in `schema.ts` is why due dates stay `YYYY-MM-DD`.

## Conventions

- Exact pixel values from the design are kept as arbitrary values
  (`text-[12.5px]`, `gap-[9px]`) rather than rounded to the nearest scale step.
- Comments explain *why* a non-obvious decision was made, not what the line does.
  Match that density; most components carry none.
- Adjusting state during render (the `draftFor` pattern in `TaskDrawer.jsx`, the
  `preview.for` pattern in `FilePreviewDialog.jsx`) is preferred over a
  `useState` + `useEffect` sync pair, which oxlint flags.
