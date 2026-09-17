# Running Taskspace

Four processes: Postgres, an S3 bucket, the API, and the chat socket. The first
two are third-party in production and containers here.

## First run

```sh
cp infra/.env.example infra/.env        # docker compose
cp infra/.env.example backend/.env      # the API
cp infra/.env.example ws/.env           # the socket

docker compose -f infra/docker-compose.yml --env-file infra/.env up -d
bun install                             # backend + ws (a bun workspace)
bun run db:push                         # apply backend/drizzle/*.sql
bun run db:seed                         # demo workspaces, people and chat
```

Then three terminals, or one with a process manager:

```sh
bun run dev:api          # :3004
bun run dev:ws           # :3005
cd frontend && npm install && npm run dev   # :5173
```

Open http://localhost:5173 and sign in as `iqbal@team.co`, `welby@team.co` or
`shauma@team.co`. Sign in as two of them in two browser profiles to watch chat,
presence and typing indicators work between them.

**If those ports are taken**, change `API_PORT`, `WS_PORT`, `POSTGRES_PORT` and
`S3_PORT` in `infra/.env`, mirror `DATABASE_URL`, `PUBLIC_WS_URL` and
`S3_ENDPOINT` into `backend/.env` and `ws/.env`, and point the dev server at the
API with `frontend/.env.local`:

```sh
echo 'VITE_API_PROXY=http://127.0.0.1:3104' > frontend/.env.local
```

## The pieces

| | |
| --- | --- |
| `postgres` | Every task, file record, comment and message. Port from `POSTGRES_PORT`. |
| `minio` | Stands in for the third-party bucket. Console on `:9001`, `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`. |
| `minio-init` | One-shot: creates the bucket and exits. `docker compose ps` showing it as exited is correct. |

`minio/*` on Docker Hub refuses anonymous pulls, so the compose file uses the
`quay.io` mirror.

## Commands

From the repository root:

| | |
| --- | --- |
| `bun run dev:api` | API with reload |
| `bun run dev:ws` | chat socket with reload |
| `bun run db:push` | apply migrations |
| `bun run db:seed` | reset the demo data (leaves other workspaces alone) |
| `bun test` | the backend suite, against `<database>_test` |

From `backend/`:

| | |
| --- | --- |
| `bun run db:generate` | write a new migration after editing `src/db/schema.ts` |
| `bun run db:reset` | drop and recreate the schema (refuses in production) |
| `bun run files:sweep` | delete uploads that were never confirmed |

## Continuous deployment

A push to `main` deploys, through `.github/workflows/deploy.yml`, on a
self-hosted runner on the production box — the same arrangement carreel and
diudara use. `docs/RUNNER.md` registers it; the runners are repo-scoped, so the
existing two will not pick up this repository's jobs.

The workflow runs one thing: `scripts/deploy.sh --pull`. That refuses to deploy
a dirty checkout, or one holding commits that are not on `origin/main`.

## Going to production

1. **Postgres**: any managed instance. Set `DATABASE_URL`, run `db:push`.
2. **Bucket**: any S3-compatible service.
   - AWS — leave `S3_ENDPOINT` empty, set `S3_REGION`, `S3_FORCE_PATH_STYLE=false`.
   - Cloudflare R2 — `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`.
   - The browser `PUT`s and `GET`s directly, so the bucket needs **CORS**
     allowing `PUT, GET` and `Content-Type` from the app's origin. Without it
     uploads fail in the browser while every server-side test still passes.
3. **Secrets**: `SESSION_SECRET` and `WS_TICKET_SECRET`, 32 random bytes each
   (`openssl rand -hex 32`). The socket and the API must agree on the ticket one.
4. **Auth**: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, add
   `<api origin>/api/auth/google/callback` as an authorised redirect URI, and set
   **`AUTH_DEV_MODE=false`** — it is what lets anyone sign in as any address.
5. **Origins**: `APP_ORIGIN` (used for the cookie's Secure flag and the OAuth
   redirect) and `PUBLIC_WS_URL` (`wss://…` behind TLS).
6. **Serve**: `frontend/dist` as static files with an SPA fallback, `/api/` to
   the API and `/ws` to the socket with the Upgrade headers.
   `infra/nginx/taskspace.conf.example` is that block.

`deploy/` and `scripts/deploy.sh` are **not** this app — they are production
routing for a different product on the same box. See the repository CLAUDE.md.
