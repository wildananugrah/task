/**
 * pm2 apps for Taskspace: the API and the chat socket.
 *
 * Two processes on purpose — restarting the API during a deploy should not drop
 * everybody's open conversation. They are declared together so a deploy can
 * never bring one up against the other's old code.
 *
 * This box runs unrelated apps under pm2, so both names are specific and
 * scripts/deploy.sh only ever addresses them by name. Never `pm2 restart all`.
 *
 * Each app's `cwd` is its own package, which is also how it gets its config:
 * Bun reads `.env` from the working directory, so the API sees backend/.env and
 * the socket sees ws/.env without pm2 having to pass anything through.
 */
const { execSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

// pm2's daemon does not inherit an interactive shell's PATH, so `interpreter:
// 'bun'` resolves to nothing under systemd and the app silently never starts.
// Resolve it to an absolute path here instead.
function bunPath() {
  const candidates = [
    process.env.BUN_PATH,
    join(process.env.HOME || '', '.bun/bin/bun'),
    '/usr/local/bin/bun',
    '/usr/bin/bun',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  try {
    return execSync('command -v bun', { encoding: 'utf8' }).trim()
  } catch {
    throw new Error('bun not found; set BUN_PATH or install bun for this user')
  }
}

const bun = bunPath()

const common = {
  interpreter: bun,
  // Single instance, fork mode: these hold WebSocket connections and an
  // in-memory presence count, which cluster mode would split across workers.
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,
  max_restarts: 10,
  min_uptime: '20s',
  max_memory_restart: '512M',
  time: true,
  merge_logs: true,
  env: { NODE_ENV: 'production' },
}

module.exports = {
  apps: [
    {
      ...common,
      name: 'task-api',
      cwd: __dirname + '/backend',
      script: 'src/index.ts',
    },
    {
      ...common,
      name: 'task-ws',
      cwd: __dirname + '/ws',
      script: 'src/index.ts',
    },
  ],
}
