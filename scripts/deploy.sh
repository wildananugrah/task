#!/usr/bin/env bash
#
# Full-stack deploy for task: infra (Postgres + S3), backend API, chat socket,
# frontend bundle and the nginx site — in one command.
#
# The three independent stages (infra / frontend build / backend install) run in
# PARALLEL; everything after them is ordered by real dependencies:
#
#     infra up ──┐                    frontend build ──┐      backend install ──┐
#                └─> wait for pg ──> db:migrate ──> pm2 reload api              │
#                                         ^                                     │
#                                         └─────────────────────────────────────┘
#                    deploy web dist ──> nginx sync+reload ──> health checks
#
# Deliberately NOT done here:
#   * `db:seed`  — it truncates every table. Seeding is a one-off, by hand.
#   * touching backend/.env or infra/.env — real secrets, placed once by hand.
#   * `git pull` — you deploy the tree you are looking at, not a moving target.
#
# Usage: scripts/deploy.sh [options]   (run from anywhere)
#   --skip-infra     don't touch docker compose
#   --skip-web       don't build/publish the frontend
#   --skip-api       don't install/migrate/restart the backend
#   --skip-nginx     don't sync the nginx site config
#   --serial         run stages one at a time (easier to read when debugging)
#   -h, --help       show this
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# TWO HOSTNAMES, ONE APPLICATION. Both names serve the same bundle and the same
# nginx location set; neither redirects to the other. They are deployed together,
# in one run, so a bundle can never be live on one host and stale on the other.
# Index i of SITES is published to index i of WEB_DIST_TARGETS.
SITES=( "task.mhamzah.id" )
WEB_DIST_TARGETS=( "/var/www/html/task/dist" )
# The first is the canonical one for single-host checks and messages.
NGINX_SITE="${SITES[0]}"
NGINX_AVAILABLE="/etc/nginx/sites-available/$NGINX_SITE"
# Read from backend/.env so a port change in one place moves the health checks
# with it. These are API_PORT/WS_PORT, not PORT — grepping '^PORT=' matched
# nothing and silently fell back to 3004 while the API listened elsewhere.
env_value() { grep -E "^$1=" backend/.env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '[:space:]'; }
API_PORT="$(env_value API_PORT)"; API_PORT="${API_PORT:-3004}"
WS_PORT="$(env_value WS_PORT)";   WS_PORT="${WS_PORT:-3005}"
PM2_APP="task-api"
PM2_WS_APP="task-ws"
PM2_ECOSYSTEM="$REPO_ROOT/ecosystem.config.cjs"

DO_INFRA=1 DO_WEB=1 DO_API=1 DO_NGINX=1 PARALLEL=1
for arg in "$@"; do
  case "$arg" in
    --skip-infra) DO_INFRA=0 ;;
    --skip-web)   DO_WEB=0 ;;
    --skip-api)   DO_API=0 ;;
    --skip-nginx) DO_NGINX=0 ;;
    --serial)     PARALLEL=0 ;;
    -h|--help)    sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

LOG_DIR="$(mktemp -d /tmp/task-deploy.XXXXXX)"
START_TS=$SECONDS
trap 'rc=$?; [ $rc -ne 0 ] && echo "" && echo "DEPLOY FAILED (exit $rc). Logs kept in $LOG_DIR" >&2; exit $rc' EXIT

say()  { printf "\n\033[1m==> %s\033[0m\n" "$*"; }
info() { printf "    %s\n" "$*"; }
ok()   { printf "    \033[32mok\033[0m %s\n" "$*"; }
die()  { printf "\033[31mERROR:\033[0m %s\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
# Fail before mutating anything, rather than half-deploying and stopping.
say "preflight"
need() { command -v "$1" >/dev/null || die "missing required command: $1"; }
need bun; need docker; need curl
[ "$DO_WEB" = 1 ] && need npm
[ "$DO_API"   = 1 ] && need pm2
[ "$DO_WEB"   = 1 ] && need rsync
[ "$DO_NGINX" = 1 ] && need nginx

[ "$DO_API" = 1 ] && [ ! -f backend/.env ] && die "backend/.env missing (copy backend/.env.example and fill it in)"
[ "$DO_API" = 1 ] && [ ! -f ws/.env ] && die "ws/.env missing (copy ws/.env.example and fill it in)"
[ "$DO_INFRA" = 1 ] && [ ! -f infra/.env ] && die "infra/.env missing (copy infra/.env.example and fill it in)"
[ "$DO_API" = 1 ] && [ ! -f "$PM2_ECOSYSTEM" ] && die "missing $PM2_ECOSYSTEM"

# These two are the difference between a deploy and an incident, and both are
# easy to leave at their development values by copying the wrong env file.
if [ "$DO_API" = 1 ]; then
  [ "$(env_value AUTH_DEV_MODE)" = "true" ] && die "backend/.env has AUTH_DEV_MODE=true — that lets anyone sign in as any email address. Set it to false."
  case "$(env_value APP_ORIGIN)" in
    ""|*localhost*|*127.0.0.1*) die "backend/.env has a local APP_ORIGIN ($(env_value APP_ORIGIN)) — the session cookie will not be marked Secure and Google sign-in will redirect to the wrong host." ;;
  esac
  case "$(env_value SESSION_SECRET)$(env_value WS_TICKET_SECRET)" in
    *CHANGE_ME*|*change-me*|"") die "backend/.env still has placeholder secrets — generate them with: openssl rand -hex 32" ;;
  esac
  # The API mints socket tickets and ws/ verifies them; a mismatch is a chat
  # service that refuses every connection with no error anywhere but the browser.
  if [ "$(env_value WS_TICKET_SECRET)" != "$(grep -E '^WS_TICKET_SECRET=' ws/.env | tail -1 | cut -d= -f2- | tr -d '[:space:]')" ]; then
    die "WS_TICKET_SECRET differs between backend/.env and ws/.env — every socket connection would be rejected"
  fi
fi

# A deploy that leaves the API unreachable from nginx is worse than no deploy.
if [ "$DO_NGINX" = 0 ] && [ -f "$NGINX_AVAILABLE" ] && ! grep -q "location ^~ /api/" "$NGINX_AVAILABLE"; then
  info "WARNING: live nginx config has no '/api' block and --skip-nginx was passed."
  info "         /api/* will fall through to the SPA and return HTML, not JSON."
fi
ok "tooling and env files present"

# ------------------------------------------------------------ stage runners
declare -A JOB_PID
start_stage() { # name, function
  local name=$1 fn=$2
  if [ "$PARALLEL" = 1 ]; then
    ( "$fn" ) >"$LOG_DIR/$name.log" 2>&1 &
    JOB_PID[$name]=$!
    info "started: $name"
  else
    say "$name"
    "$fn" 2>&1 | sed 's/^/    /'
  fi
}
await_stage() { # name
  local name=$1
  [ "$PARALLEL" = 1 ] || return 0
  [ -n "${JOB_PID[$name]:-}" ] || return 0
  if wait "${JOB_PID[$name]}"; then
    ok "$name"
  else
    echo ""; echo "--- $name failed; last 40 lines ---" >&2
    tail -40 "$LOG_DIR/$name.log" >&2
    die "stage '$name' failed"
  fi
}

# ------------------------------------------------------------------- stages
# Every `cd` below is wrapped in a subshell. In --serial mode the stage
# functions run in THIS shell, so a bare `cd` would leak into the main flow and
# make later relative paths resolve from the wrong directory.
stage_infra() {
  ( cd "$REPO_ROOT/infra" && docker compose up -d )
}

stage_web_build() {
  (
    cd "$REPO_ROOT/frontend"
    # npm, not bun: package-lock.json is the lockfile this app commits, and
    # `bun install` here would write a second one that drifts from it.
    npm ci 2>/dev/null || npm install
    # VITE_API_URL is intentionally unset: in production the SPA and API share an
    # origin, so the client's default of "/api" is what we want.
    npm run build
    [ -f dist/index.html ] || { echo "build produced no dist/index.html"; exit 1; }
  )
}

stage_api_install() {
  # From the workspace root: backend/ and ws/ share one node_modules, and ws/
  # imports the API's schema, so installing only backend/ leaves it broken.
  ( cd "$REPO_ROOT" && { bun install --frozen-lockfile 2>/dev/null || bun install; } )
}

wait_for_postgres() {
  local tries=60
  # `docker compose up -d` returns as soon as the container starts, which is
  # well before Postgres accepts connections. Migrating into that gap fails.
  until docker compose -f "$REPO_ROOT/infra/docker-compose.yml" exec -T postgres pg_isready -q 2>/dev/null; do
    tries=$((tries - 1))
    [ "$tries" -gt 0 ] || die "postgres did not become ready in 60s"
    sleep 1
  done
}

publish_web() {
  local target
  for target in "${WEB_DIST_TARGETS[@]}"; do
    sudo mkdir -p "$target"
    # rsync --delete instead of `rm -rf` + `cp`: files are replaced in place, so
    # there is no window where the document root is empty and the site 404s.
    sudo rsync -a --delete "$REPO_ROOT/frontend/dist/" "$target/"
    sudo chown -R "$(id -un):www-data" "$(dirname "$target")"
    info "published -> $target"
  done
}

sync_nginx() {
  # All sites are staged first, then ONE `nginx -t`, then one reload. Testing
  # after each file would reload a half-updated pair, and `nginx -t` validates the
  # whole server config anyway — a bad file here would take down the other sites
  # on this box, so a failure restores every backup before anything is reloaded.
  local -a backups=() changed=()
  local site available repo_conf backup

  for site in "${SITES[@]}"; do
    repo_conf="$REPO_ROOT/deploy/nginx/$site"
    available="/etc/nginx/sites-available/$site"
    [ -f "$repo_conf" ] || die "missing $repo_conf"

    if [ -f "$available" ] && sudo cmp -s "$repo_conf" "$available"; then
      info "nginx config already current: $site"
      continue
    fi

    backup=""
    if [ -f "$available" ]; then
      backup="$available.bak.$(date +%Y%m%d-%H%M%S)"
      sudo cp -a "$available" "$backup"
      info "backed up live config -> $backup"
    fi
    backups+=( "$backup" )
    changed+=( "$site" )

    sudo cp "$repo_conf" "$available"
    sudo ln -sfn "$available" "/etc/nginx/sites-enabled/$site"
  done

  if [ ${#changed[@]} -eq 0 ]; then
    info "all nginx configs already current"
    return 0
  fi

  if ! sudo nginx -t 2>"$LOG_DIR/nginx-t.log"; then
    local i
    for i in "${!changed[@]}"; do
      available="/etc/nginx/sites-available/${changed[$i]}"
      if [ -n "${backups[$i]}" ]; then
        sudo cp -a "${backups[$i]}" "$available"
      else
        sudo rm -f "$available" "/etc/nginx/sites-enabled/${changed[$i]}"
      fi
    done
    info "nginx -t failed; restored previous config for: ${changed[*]}"
    cat "$LOG_DIR/nginx-t.log" >&2
    die "nginx config rejected (see above); nothing was reloaded"
  fi

  # reload, not restart: other sites on this host keep serving.
  sudo systemctl reload nginx 2>/dev/null || sudo nginx -s reload
  info "nginx reloaded (${changed[*]})"
}

# ---------------------------------------------------------------- run it
say "building (parallel stages: infra, web, api deps)"
[ "$DO_INFRA" = 1 ] && start_stage infra       stage_infra
[ "$DO_WEB"   = 1 ] && start_stage web-build   stage_web_build
[ "$DO_API"   = 1 ] && start_stage api-install stage_api_install

[ "$DO_INFRA" = 1 ] && await_stage infra
[ "$DO_WEB"   = 1 ] && await_stage web-build
[ "$DO_API"   = 1 ] && await_stage api-install

if [ "$DO_API" = 1 ]; then
  say "database: waiting for postgres, then migrating"
  [ "$DO_INFRA" = 1 ] && wait_for_postgres && ok "postgres accepting connections"
  # Migrate BEFORE the restart so new code never briefly serves an old schema.
  ( cd "$REPO_ROOT/backend" && bun run db:migrate ) | sed 's/^/    /'
  ok "migrations applied"
fi

# Cutover order matters, and it is api -> nginx -> web, not the other way round.
# The new frontend calls /api on this same origin, so it must go live LAST, once
# the API is serving and nginx has a route to it. Publishing the bundle first
# would leave the site briefly requesting /api through an nginx that answers
# with index.html. Adding the /api block while the OLD frontend is still live is
# harmless, because the old bundle never calls it.
if [ "$DO_API" = 1 ]; then
  say "api: (re)starting '$PM2_APP' on :$API_PORT and '$PM2_WS_APP' on :$WS_PORT"
  # delete-then-start, not startOrReload: pm2 keeps the exec_mode/interpreter an
  # app was first created with, so a reload would silently ignore changes to
  # ecosystem.config.cjs. Single-instance fork mode restarts on reload anyway, so
  # this costs no extra downtime. Scoped to these two app names — never
  # `pm2 restart all`, this box also runs unrelated apps under pm2.
  #
  # The socket is restarted with the API rather than left alone: it imports the
  # API's schema, so leaving it on old code after a migration is the one way the
  # two can disagree about what a message is.
  pm2 delete "$PM2_APP" >/dev/null 2>&1 || true
  pm2 delete "$PM2_WS_APP" >/dev/null 2>&1 || true
  ( cd "$REPO_ROOT" && pm2 start "$PM2_ECOSYSTEM" --update-env ) | sed 's/^/    /'
  pm2 save >/dev/null 2>&1 || true
  ok "api and chat socket started"
fi

if [ "$DO_NGINX" = 1 ]; then
  say "nginx: syncing site config"
  sync_nginx
  ok "nginx in sync"
fi

if [ "$DO_WEB" = 1 ]; then
  say "publishing frontend -> ${WEB_DIST_TARGETS[*]}"
  publish_web
  ok "web bundle published"
fi

# -------------------------------------------------------------- verify
# A deploy isn't done because the commands exited 0 — it's done when it serves.
say "verifying"
FAILED=0
check() { # label, expected, actual
  if [ "$2" = "$3" ]; then ok "$1 ($3)"; else printf "    \033[31mFAIL\033[0m %s (want %s, got %s)\n" "$1" "$2" "$3"; FAILED=1; fi
}
# curl already prints "000" via -w when it cannot connect, so `|| true` (not
# `|| echo 000`, which would concatenate a second one) is what we want here.
http_code() { local c; c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || true)"; echo "${c:-000}"; }

if [ "$DO_API" = 1 ]; then
  # Poll rather than sleep-once: pm2 reports "online" the instant it forks, well
  # before the process has bound the port — and it reports "online" for a process
  # that is crashing on startup, too. Only /health proves the API is serving.
  # Every API route is mounted under /api, health included — probing /health
  # here hit the catch-all 404 and reported a working API as broken.
  api_code=000
  for _ in $(seq 1 15); do
    api_code="$(http_code "http://127.0.0.1:$API_PORT/api/health")"
    [ "$api_code" = 200 ] && break
    sleep 1
  done
  check "api /api/health (direct :$API_PORT)" 200 "$api_code"

  ws_code=000
  for _ in $(seq 1 15); do
    ws_code="$(http_code "http://127.0.0.1:$WS_PORT/health")"
    [ "$ws_code" = 200 ] && break
    sleep 1
  done
  check "chat socket /health (direct :$WS_PORT)" 200 "$ws_code"
fi

if [ "$DO_NGINX" = 1 ] || [ "$DO_WEB" = 1 ]; then
  # EVERY hostname is verified, not just the first. Two names serving one app fail
  # independently — a missing block or an unpublished bundle on the second host is
  # exactly the kind of thing nobody notices until someone uses that URL.
  for site in "${SITES[@]}"; do
    check "$site / (through nginx)" 200 "$(http_code "https://$site/")"
    # The one that actually proves the /api proxy block works: this must be JSON
    # from the API, not the SPA's index.html.
    # The one that actually proves the /api proxy block works: this must be JSON
    # from the API, not the SPA's index.html. /api/health and not some resource
    # route — the API answers 404s in JSON too, so a 404 would "pass" here and
    # hide a proxy that is routing nowhere.
    api_probe="$(curl -s --max-time 10 "https://$site/api/health" || true)"
    case "$api_probe" in
      *'"service":"taskspace-api"'*) ok "$site api via nginx (/api -> the API)" ;;
      *'<!doctype'*|*'<html'*) printf "    \033[31mFAIL\033[0m %s /api is falling through to the SPA — nginx has no '/api' block\n" "$site"; FAILED=1 ;;
      *) printf "    \033[31mFAIL\033[0m %s api via nginx returned '%s' (check \`pm2 logs %s\`)\n" "$site" "${api_probe:0:80}" "$PM2_APP"; FAILED=1 ;;
    esac

    # The chat socket, through nginx. A handshake without the Upgrade headers is
    # answered 400 by the socket itself and 200-with-HTML by the SPA fallback, so
    # asking for the upgrade is the only probe that tells those two apart.
    ws_probe="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
      -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: ZGVwbG95Y2hlY2sxMjM0NQ==' \
      "https://$site/ws" || echo 000)"
    case "$ws_probe" in
      # 401 is the socket refusing a ticketless handshake — which means it is
      # there, reachable, and checking. That is exactly what we want to see.
      401|101) ok "$site /ws -> chat socket ($ws_probe)" ;;
      *) printf "    \033[31mFAIL\033[0m %s /ws returned %s — nginx is not proxying the socket (check the 'location ^~ /ws' block and its Upgrade headers)\n" "$site" "$ws_probe"; FAILED=1 ;;
    esac
  done
fi

say "done in $((SECONDS - START_TS))s"
pm2 list 2>/dev/null | grep -E "name|$PM2_APP|$PM2_WS_APP" || true

if [ "$FAILED" -ne 0 ]; then
  echo ""
  die "deploy finished but verification failed (logs: $LOG_DIR)"
fi
rm -rf "$LOG_DIR"
trap - EXIT