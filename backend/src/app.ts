import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import { env } from './lib/env'
import { authRoutes } from './routes/auth'
import { conversationRoutes } from './routes/conversations'
import { fileRoutes, taskFileRoutes } from './routes/files'
import { searchRoutes } from './routes/search'
import { taskRoutes, workspaceTaskRoutes } from './routes/tasks'
import {
  bootstrapRoute,
  labelRoutes,
  memberRoutes,
  statusRoutes,
  workspaceRoutes,
} from './routes/workspaces'
import type { AppEnv } from './middleware/session'

function postgresCode(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; current && depth < 6; depth += 1) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && /^\d{5}$/.test(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return null
}

export function createApp() {
  const app = new Hono<AppEnv>()

  // Quiet in tests; a request log per assertion buries the failures.
  if (env.nodeEnv === 'development') app.use('*', logger())
  app.use('*', secureHeaders())

  // The session rides in a cookie, so the allow-list has to be explicit — a
  // wildcard origin and credentials are mutually exclusive by design.
  app.use(
    '/api/*',
    cors({
      origin: (origin) => (env.allowedOrigins.includes(origin) ? origin : env.allowedOrigins[0]!),
      credentials: true,
      allowHeaders: ['content-type', 'authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      maxAge: 600,
    }),
  )

  const api = new Hono<AppEnv>()

  api.get('/health', (c) => c.json({ ok: true, service: 'taskspace-api' }))
  api.route('/auth', authRoutes)
  api.route('/bootstrap', bootstrapRoute)
  api.route('/workspaces', workspaceRoutes)
  // Task collection routes hang off a workspace; both mount on the same prefix.
  api.route('/workspaces', workspaceTaskRoutes)
  api.route('/members', memberRoutes)
  api.route('/statuses', statusRoutes)
  api.route('/labels', labelRoutes)
  api.route('/tasks', taskRoutes)
  api.route('/tasks', taskFileRoutes)
  api.route('/files', fileRoutes)
  api.route('/conversations', conversationRoutes)
  api.route('/search', searchRoutes)

  app.route('/api', api)

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'No such endpoint' } }, 404))

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      // fail() already built the body; anything else gets a plain one.
      return error.getResponse()
    }
    // Drizzle wraps driver errors, so the Postgres SQLSTATE is somewhere down
    // the cause chain. A unique violation that reaches here is a conflict the
    // caller can act on, not an internal fault.
    if (postgresCode(error) === '23505') {
      return c.json(
        { error: { code: 'conflict', message: 'That already exists' } },
        409,
      )
    }

    console.error('[api]', error)
    return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500)
  })

  return app
}
