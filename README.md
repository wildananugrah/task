# Taskspace

A small team task workspace: workspaces, tasks in a list or on a board, files
attached to tasks, per-workspace statuses and labels, and chat that can point
straight at a task.

**Status: working application.** Postgres behind it, a third-party S3 bucket for
files, and a WebSocket service for chat. Sign-in is Google, with seeded accounts
when Google is not configured. Nothing is in-memory any more; a reload keeps
everything, including which workspace you were in.

## Quick start

```sh
cp infra/.env.example infra/.env && cp infra/.env.example backend/.env && cp infra/.env.example ws/.env
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
bun install && bun run db:push && bun run db:seed

bun run dev:api                              # :3004
bun run dev:ws                               # :3005
cd frontend && npm install && npm run dev    # :5173
```

Sign in as `iqbal@team.co`. `infra/README.md` is the full runbook, including what
to change when those ports are already taken.

| Command | |
| --- | --- |
| `bun run dev:api` / `dev:ws` | API and chat socket, with reload |
| `bun run db:push` / `db:seed` | migrate / load the demo data |
| `bun test` | backend suite (61 tests) |
| `npm run dev` *(in `frontend/`)* | dev server |
| `npm run build` | production bundle into `frontend/dist` |
| `npm run lint` | oxlint; must be silent, warnings included |

## Repository layout

| Path | |
| --- | --- |
| `frontend/` | The app. React 19, Vite 8, Tailwind CSS v4, plain JSX. |
| `backend/` | The API. Bun + Hono + Drizzle, on `:3004` under `/api`. |
| `ws/` | The chat socket. Bun's WebSocket server on `:3005`. |
| `infra/` | Compose file for Postgres and a stand-in S3, env template, runbook. |
| `docs/` | `SPEC.md` — what was built and why it is shaped this way. |
| `references/` | Screenshots used while building. Git-ignored. |
| `deploy/`, `scripts/` | Inherited from another project — see *Deployment* below. |

## How it fits together

```
browser ──/api/*──────────► backend :3004 ──► postgres
        ──/ws?ticket=…────► ws :3005      ──► postgres
        ──PUT/GET presigned──────────────────► S3 bucket
```

- **Sessions** are a signed JWT in an `httpOnly` cookie. The socket runs on
  another port where that cookie does not reach, so the client trades it for a
  60-second ticket it passes in the query string.
- **Files never pass through the API.** Uploading is presign → the browser `PUT`s
  straight to the bucket → confirm. A row stays invisible until that confirm, so
  a failed upload never becomes a file you cannot open.
- **Task ids are derived**, not stored: `workspace.prefix + '-' + task.number`.
  Changing the prefix in settings renumbers the whole workspace for free.
- **Chat is durable in Postgres**; the socket is only the delivery path. A
  dropped connection falls back to HTTP and refetches on reconnect, so it slows
  chat down rather than losing it.
- **Roles are enforced in the API.** `viewer` reads, `member` owns the tasks,
  `admin` owns the settings. The UI hides what you cannot do, but the server is
  the authority.

## What works

- **Sign-in** — Google OAuth when configured, seeded accounts otherwise. The
  session survives a reload, and so does the workspace you were in.
- **Workspaces** — create one and it arrives with statuses, labels, a team chat
  room and you as its admin. Rename, recolour, replace the logo, change the task
  prefix, archive, restore, delete.
- **Tasks** — list and board, search by title or task number, filter by status,
  assignee, label and due date. Create, edit, restatus, delete. Assignee, due
  date and labels are editable in the drawer. Drag a card between board columns.
- **Files** — real uploads to S3, previews that fetch the real object (images,
  PDFs, text, CSV), downloads that keep the original filename, and a workspace
  file list that is searchable.
- **Comments** — `@name` mentions and `/TSK-104` task links with autocomplete. A
  task link is clickable anywhere it appears and jumps to that task, switching
  workspace if it belongs to another one.
- **Settings** — statuses (rename, recolour, reorder by dragging, add, delete
  with its tasks moved rather than orphaned), members and roles, labels, and a
  danger zone behind a type-the-name confirmation.
- **Messaging** — DMs and one room per workspace, delivered live, with presence,
  typing indicators, unread counts and the same autocomplete as comments.

## Not implemented

No URL routing — nothing is linkable and the back button does nothing. Invites
create the membership but send no email. Chat has no history pagination beyond
the most recent 100 messages, and no attachments.

## Design

The UI is a port of a Claude design project (`Taskspace.dc.html`). Design tokens
live in `frontend/src/index.css` as Tailwind v4 `@theme` entries.

The palette is near-monochrome by intention: one ink colour at many opacities
carries every hairline, muted label and scrim, and the only saturated colour in
the app is a status or a person's avatar. That is what makes a status dot read as
information rather than decoration.

## Deployment

`infra/README.md` covers going to production: managed Postgres, a real bucket
(**with CORS**, or uploads fail in the browser while every server-side test
passes), real secrets, `AUTH_DEV_MODE=false`, and an nginx block for `/api/` and
`/ws`.

`scripts/deploy.sh` and `deploy/` came from a different product on the same
domain and were never rewritten. They describe an API on `:3004`, MediaMTX and
pm2 — and while this app's API does listen on `:3004`, nothing else in there
belongs to it. Treat that nginx config as a record of what is currently live on
that host, not as this app's deployment.
