# Taskspace — full-stack specification

Status: implementation spec for turning the `frontend/` prototype into a working
product. Every behaviour the UI already offers gets a real server behind it.

## 1. Shape of the system

| Piece | Runtime | Port | Directory |
| --- | --- | --- | --- |
| Web app | Vite 8 / React 19 | 5173 (dev) | `frontend/` |
| API | Bun + Hono + Drizzle | 3004 | `backend/` |
| Chat socket | Bun.serve WebSocket + Drizzle | 3005 | `ws/` |
| Database | PostgreSQL 16 | 5432 | `infra/` |
| Object storage | S3-compatible (AWS S3 / R2 / MinIO) | — | `infra/` |

`3004` is not arbitrary — the inherited `deploy/nginx/task.mhamzah.id` already
proxies `^~ /api/` there, so the API keeps that port and mounts every route under
`/api`. The socket adds one new prefix, `/ws`.

The browser never talks to Postgres or S3 directly except through **presigned S3
URLs** minted by the API. Uploads and downloads go straight to the bucket; bytes
never pass through Bun.

```
browser ──/api/*──────────► backend :3004 ──► postgres
        ──/ws?ticket=…────► ws :3005      ──► postgres
        ──PUT/GET presigned──────────────────► S3 bucket
```

## 2. Identity and sessions

The login screen says "Continue with Google", so Google is the real provider:

- `GET /api/auth/google` → redirect to Google's consent screen (PKCE-less code
  flow with a signed `state` cookie).
- `GET /api/auth/google/callback` → exchange code, verify the `id_token`, upsert
  the user by email, set the session cookie, redirect to the app.

Google is optional at runtime. When `GOOGLE_CLIENT_ID` is unset the API reports
`providers.google=false` from `GET /api/auth/config` and the login screen offers
the seeded accounts instead (`POST /api/auth/dev`), which is what makes the
prototype runnable on a laptop with no OAuth app. `AUTH_DEV_MODE=false` turns
that off for production.

**Session** = HS256 JWT in an `httpOnly`, `SameSite=Lax` cookie, 7 days,
`Secure` when `APP_ORIGIN` is https. The socket cannot rely on that cookie across
a port boundary, so the client asks for a **60-second ws ticket**
(`POST /api/auth/ws-ticket`) and passes it as `?ticket=`. Short-lived, single
purpose, never stored.

Authorisation is per workspace membership, enforced in the API, not the client:

| Role | Can |
| --- | --- |
| `viewer` | read everything in the workspace |
| `member` | viewer + create/edit/delete tasks, upload files, comment, chat |
| `admin` | member + statuses, labels, members, workspace settings, delete |

The frontend mirrors the same rules to hide affordances, but the server is the
authority: every mutating route re-checks.

## 3. Data model

Postgres, Drizzle schema in `backend/src/db/schema.ts`. UUID v7-ish (`gen_random_uuid()`)
primary keys throughout.

- **users** — `id, email (unique), name, initials, color, avatar_url, created_at`
- **workspaces** — `id, name, initials, prefix (3 letters), color, description,
  logo_key, archived_at, created_by, created_at`
- **workspace_members** — `id, workspace_id, user_id (null while pending), email,
  role, status (active|pending), invited_by, created_at`, unique on
  `(workspace_id, lower(email))`
- **statuses** — `id, workspace_id, name, color, position`
- **labels** — `id, workspace_id, name`, unique on `(workspace_id, name)`
- **tasks** — `id, workspace_id, number, title, description, status_id,
  assignee_id, due_date (date|null), created_by, created_at, updated_at`,
  unique on `(workspace_id, number)`
- **task_labels** — `task_id, label_id` (composite pk)
- **files** — `id, workspace_id, task_id, key, name, ext, size, content_type,
  uploaded_by, state (pending|ready), created_at`
- **comments** — `id, task_id, author_id, body, created_at`
- **conversations** — `id, workspace_id (null for DMs), kind (dm|group), title`
- **conversation_members** — `conversation_id, user_id, last_read_at`
- **messages** — `id, conversation_id, author_id, body, created_at`

The display id the UI shows (`TSK-104`) is `workspace.prefix + '-' + task.number`,
derived — never stored. Renaming a prefix therefore renumbers the whole workspace
for free, which is exactly what the settings screen promises. `number` is
allocated per workspace starting at 101 inside the insert transaction, so two
simultaneous creates cannot collide.

Due dates become real `date` columns. The `'Sep 15' / '—' / overdue` strings in
the prototype are formatting, done in the client.

## 4. API

All JSON, all under `/api`, all authenticated except `health`, `auth/config`,
`auth/dev`, `auth/google*`.

```
GET    /api/health
GET    /api/auth/config            which providers are live
POST   /api/auth/dev               { email } → session          (dev mode only)
GET    /api/auth/google            → 302 Google
GET    /api/auth/google/callback   → 302 app
GET    /api/auth/me                current user
POST   /api/auth/signout
POST   /api/auth/ws-ticket         { ticket, url }

GET    /api/bootstrap              user + workspace cards + conversations
POST   /api/workspaces             { name, prefix }
GET    /api/workspaces/:id         statuses, labels, members, tasks, files
PATCH  /api/workspaces/:id         { name?, prefix?, color? }
POST   /api/workspaces/:id/archive
DELETE /api/workspaces/:id
POST   /api/workspaces/:id/logo    presign a logo upload

POST   /api/workspaces/:id/statuses
POST   /api/workspaces/:id/statuses/reorder   { ids: [...] }
PATCH  /api/statuses/:id           { name?, color? }
DELETE /api/statuses/:id           { moveTo } for the tasks that used it

POST   /api/workspaces/:id/labels
DELETE /api/labels/:id

POST   /api/workspaces/:id/members  invite by email
PATCH  /api/members/:id             { role }
DELETE /api/members/:id

GET    /api/workspaces/:id/tasks    ?q&status&assignee&label&due
POST   /api/workspaces/:id/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id               title, description, status, assignee, due, labels
DELETE /api/tasks/:id
POST   /api/tasks/:id/comments

GET    /api/workspaces/:id/files    ?q
POST   /api/tasks/:id/files         presign upload → { fileId, uploadUrl, key }
POST   /api/files/:id/complete      mark ready once the PUT succeeded
GET    /api/files/:id/url           ?disposition=inline|attachment → presigned GET
DELETE /api/files/:id

GET    /api/search?q=               tasks across every workspace you belong to

GET    /api/conversations
GET    /api/conversations/:id/messages ?before
POST   /api/conversations/:id/messages
POST   /api/conversations/:id/read
POST   /api/conversations/dm        { userId } → find-or-create a DM
```

Errors are `{ error: { code, message } }` with a real status. `409` carries the
current value when a prefix or label collides.

## 5. Files and S3

The bucket is a **third-party S3**: anything that speaks the S3 API. The API uses
Bun's built-in `S3Client` (no SDK dependency) configured from
`S3_ENDPOINT / S3_REGION / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY`
plus `S3_FORCE_PATH_STYLE` for MinIO and R2.

Upload is three steps so bytes never touch the API:

1. `POST /api/tasks/:id/files` with `{ name, size, contentType }`. The server
   rejects over `MAX_UPLOAD_BYTES` (25 MB, matching the drop zone's own label),
   writes a `pending` row, returns a presigned `PUT` valid 5 minutes for the key
   `ws/<workspaceId>/tasks/<taskId>/<fileId>-<safeName>`.
2. The browser `PUT`s the blob straight to the bucket.
3. `POST /api/files/:id/complete` flips it to `ready`. Rows that never complete
   are invisible to every read and swept by `bun run files:sweep`.

Reads are presigned `GET`s valid 5 minutes, `inline` for the preview dialog and
`attachment` for the Download button. The preview dialog stops faking content:
images render the real object, PDFs go in an `<iframe>`, text and CSV are fetched
and shown, everything else offers the download.

Deleting a file, a task, or a workspace deletes the objects too.

## 6. Chat over WebSocket (`ws/`)

A separate Bun process so a socket restart never interrupts the API, sharing the
Drizzle schema by import.

- Connect: `ws://host:3005/ws?ticket=<60s JWT>`. A bad or expired ticket is
  closed with `4401` before any subscription.
- On connect the server subscribes the socket to `conv:<id>` for every
  conversation the user belongs to, and announces presence on `user:<id>`.
- Client → server: `{t:'send', conversationId, body, clientId}`,
  `{t:'typing', conversationId}`, `{t:'read', conversationId}`, `{t:'ping'}`.
- Server → client: `{t:'ready', userId, conversations}`, `{t:'message', message}`,
  `{t:'typing', conversationId, userId}`, `{t:'presence', userId, online}`,
  `{t:'read', conversationId, userId, at}`, `{t:'error', code, message}`.
- The socket writes the message row itself, then publishes to the conversation
  topic. `clientId` echoes back so the sender can reconcile its optimistic bubble
  rather than showing it twice.
- Presence is derived from live socket counts per user — that is what makes the
  chat header's "Active now" true instead of decorative.
- The client reconnects with backoff and refetches the thread on reconnect, so a
  dropped socket loses nothing: the durable copy is in Postgres, the socket is
  only the delivery path.

`POST /api/conversations/:id/messages` exists as the same write over HTTP, for
when the socket is down.

## 7. Frontend changes

The component tree and the design stay as they are. What changes is where the
data comes from.

- `src/lib/api.js` — one fetch wrapper: `credentials: 'include'`, JSON in/out,
  throws `ApiError`.
- `src/lib/socket.js` — ticketed socket with backoff reconnect.
- `src/state/AppProvider.jsx` — same action names and the same grouping, but the
  actions are async and reconcile against the server. State gains `loading`,
  `error`, `me` and `perms`; `src/data/seed.js` shrinks to
  `src/lib/constants.js` (palette, roles, role copy) because the data now comes
  from the API.
- `src/lib/select.js` keeps deriving, over server-shaped records.
- Gaps the prototype left open, now closed because the data layer can carry them:
  assignee, due date and labels become editable in the task drawer (they were
  display-only, so a new task could never be given any of them); status reorder
  is wired to the drag handle that was already in settings; the workspace logo
  "Replace" button uploads; the preview "Download" button downloads.
- Role is enforced in the UI: a viewer sees no New task, no Edit, no Delete, no
  settings tabs beyond read.

Unchanged and still out of scope: URL routing (nothing is linkable) and
drag-and-drop between board columns.

## 8. Environments

`infra/docker-compose.yml` brings up Postgres and a MinIO that stands in for the
third-party bucket, plus a one-shot job that creates it. `infra/.env.example`
documents every variable; `infra/README.md` is the runbook.

`scripts/deploy.sh` and `deploy/` stay as they are. They are production routing
for a different product on the same box, and this spec does not change what is
serving there — `infra/nginx/taskspace.conf.example` is the reference block for
`/api` and `/ws` if that host is ever repointed at this app.

## 9. Verification

There is no test runner in the repo. This work adds one — `bun test` in
`backend/` — covering the pieces where being wrong is silent: task numbering
under concurrency, prefix renumbering, permission checks per role, filter
composition, presign shape, and the socket's ticket validation. The frontend
keeps `npm run lint` and `npm run build`, plus the SSR smoke render described in
CLAUDE.md.
