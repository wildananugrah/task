import { createMiddleware } from 'hono/factory'
import { currentUser } from '../lib/auth'
import { unauthorized } from '../lib/errors'
import type { User } from '../db/schema'

// Augmenting Hono's own variable map rather than threading a generic through
// every route: `c.get('user')` is then typed in all of them, including the ones
// that also use middleware with its own variables (secureHeaders).
declare module 'hono' {
  interface ContextVariableMap {
    user: User
  }
}

export type AppEnv = { Variables: { user: User } }

/** Attaches the signed-in user, or 401s. Every route but auth/health uses it. */
export const requireUser = createMiddleware(async (c, next) => {
  const user = await currentUser(c)
  if (!user) unauthorized()
  c.set('user', user)
  await next()
})
