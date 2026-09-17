# Taskspace

A small team task workspace: workspaces, tasks in a list or on a board, files
attached to tasks, per-workspace statuses and labels, and chat that can point
straight at a task.

**Status: front-end prototype.** There is no backend and no network call. All
data is generated in memory at start-up, so anything you change is gone on
reload. The UI is complete and interactive; the persistence is not there yet.

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Sign-in is a button — there is no auth. It takes you to the workspace list.

| Command | |
| --- | --- |
| `npm run dev` | dev server with hot reload |
| `npm run build` | production bundle into `frontend/dist` |
| `npm run lint` | oxlint |
| `npm run preview` | serve the built bundle |

No test runner is configured yet.

## Repository layout

| Path | |
| --- | --- |
| `frontend/` | The app. React 19, Vite 8, Tailwind CSS v4, plain JSX. |
| `references/` | Screenshots used while building. Git-ignored. |
| `deploy/`, `scripts/` | Inherited from another project — see *Deployment* below. |
| `backend/`, `infra/`, `docs/`, `ws/` | Empty placeholders. |

## What works

- **Workspaces** — four seeded workspaces, each with its own tasks, task-number
  prefix, members and role. Create one and it opens on its own empty board.
- **Tasks** — list and board view, search by title or task number, filter by
  status, assignee, label or due date. Create, edit, restatus and delete.
- **Task drawer** — description, assignee, due date, labels, file drop zone,
  and comments with `@name` mentions and `/TSK-104` task links, both with
  autocomplete. A task link is clickable anywhere it appears and jumps to that
  task, switching workspace if needed.
- **Files** — every file attached to a task in the workspace, searchable, with
  previews that differ by type (image, PDF, spreadsheet, text, unknown).
- **Settings** — rename and recolour statuses, add and remove them, change member
  roles, rename the workspace, change the task prefix (which renumbers every task
  in it), manage labels, and archive or delete the workspace behind a
  type-the-name confirmation.
- **Messaging** — a dock of conversations with the same mention and task-link
  autocomplete as comments.

## Not implemented

No persistence, no auth, no URL routing (nothing is linkable, and the browser's
back button does nothing), no drag-and-drop on the board, and no real file
upload — dropped files are recorded by name only.

## Design

The UI is a port of a Claude design project (`Taskspace.dc.html`). Design tokens
live in `frontend/src/index.css` as Tailwind v4 `@theme` entries.

The palette is near-monochrome by intention: one ink colour at many opacities
carries every hairline, muted label and scrim, and the only saturated colour in
the app is a status or a person's avatar. That is what makes a status dot read as
information rather than decoration.

## Deployment

`scripts/deploy.sh` and `deploy/` came from a different product on the same
domain and were never rewritten. They describe an API on `:3004`, Postgres,
MediaMTX and pm2 — none of which exist in this repository — and the script stops
in preflight without env files this repo does not ship.

To publish the prototype today, build it and serve `frontend/dist` as static
files with an SPA fallback. Treat the existing nginx config as a record of what
is currently live on that host, not as this app's deployment.
