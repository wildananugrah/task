import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { users } from '../db/schema'
import { env, googleEnabled } from '../lib/env'
import { badRequest, forbidden } from '../lib/errors'
import { signJwt, verifyJwt } from '../lib/jwt'
import { normalizeEmail } from '../lib/identity'
import {
  clearSession,
  currentUser,
  issueSession,
  issueWsTicket,
  upsertUserByEmail,
} from '../lib/auth'
import { shapeUser } from '../lib/shape'
import { requireUser, type AppEnv } from '../middleware/session'

const STATE_COOKIE = 'ts_oauth_state'

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/config', (c) =>
  c.json({
    providers: { google: googleEnabled(), dev: env.authDevMode },
    wsUrl: env.publicWsUrl,
  }),
)

/**
 * Dev sign-in. The prototype seeds three people and the login screen offers
 * them; this is what makes that work without an OAuth client. Off in production.
 */
authRoutes.post('/dev', async (c) => {
  if (!env.authDevMode) forbidden('Developer sign-in is disabled on this server')

  const body = await c.req.json<{ email?: string }>().catch(() => ({}) as { email?: string })
  const email = normalizeEmail(body.email ?? '')
  if (!email.includes('@')) badRequest('A valid email address is required')

  const user = await upsertUserByEmail({ email })
  await issueSession(c, user.id, user.email)
  return c.json({ user: shapeUser(user) })
})

authRoutes.get('/google', async (c) => {
  if (!googleEnabled()) badRequest('Google sign-in is not configured on this server')

  // The state is signed rather than random-and-stored: no server-side session
  // exists yet, and a signed value needs nowhere to live but the cookie.
  const state = await signJwt({ n: crypto.randomUUID() }, env.sessionSecret, 600)
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.appOrigin.startsWith('https://'),
    path: '/',
    maxAge: 600,
  })

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.google.clientId)
  url.searchParams.set('redirect_uri', env.google.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('state', state)
  url.searchParams.set('prompt', 'select_account')
  return c.redirect(url.toString())
})

authRoutes.get('/google/callback', async (c) => {
  if (!googleEnabled()) badRequest('Google sign-in is not configured on this server')

  // Every failure below is a redirect back to the app, which on its own is
  // indistinguishable from never having signed in. Log the reason: a sign-in
  // that silently bounces the user to the login screen is otherwise guesswork
  // from both ends.
  const failed = (reason: string, detail?: unknown) => {
    console.warn(`[auth] google sign-in failed: ${reason}`, detail ?? '')
    return c.redirect(`${env.appOrigin}/?auth_error=${encodeURIComponent(reason)}`)
  }

  const code = c.req.query('code')
  const state = c.req.query('state')
  const cookieState = getCookie(c, STATE_COOKIE)
  deleteCookie(c, STATE_COOKIE, { path: '/' })

  if (!code) return failed('no_code')
  if (!state || state !== cookieState || !(await verifyJwt(state, env.sessionSecret))) {
    return failed('bad_state')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: env.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) {
    return failed('token_exchange', await response.text().catch(() => ''))
  }

  const token = (await response.json()) as { id_token?: string }
  if (!token.id_token) return failed('no_id_token')

  // The id_token came back over TLS from Google's own token endpoint in a
  // server-to-server call, so per OIDC §3.1.3.7 the signature does not need
  // re-verifying here — nothing untrusted was in the path.
  const claims = decodeIdToken(token.id_token)
  if (!claims?.email || claims.email_verified === false) return failed('unverified_email')

  const email = normalizeEmail(claims.email)
  const domain = email.split('@')[1] ?? ''
  if (env.google.allowedDomains.length && !env.google.allowedDomains.includes(domain)) {
    return failed(
      'domain_not_allowed',
      `address domain "${domain}" is not in GOOGLE_ALLOWED_DOMAINS (${env.google.allowedDomains.join(', ')})`,
    )
  }

  const user = await upsertUserByEmail({
    email,
    name: claims.name,
    avatarUrl: claims.picture,
  })
  await issueSession(c, user.id, user.email)
  return c.redirect(env.appOrigin)
})

/**
 * "Who am I" is a question, and "nobody" is a valid answer — so this is a 200
 * with a null user rather than a 401. Every page load calls it, and a 401 here
 * put a red error in the console of anyone simply visiting the sign-in page.
 */
authRoutes.get('/me', async (c) => {
  const user = await currentUser(c)
  return c.json({ user: user ? shapeUser(user) : null })
})

authRoutes.post('/signout', (c) => {
  clearSession(c)
  return c.json({ ok: true })
})

/**
 * The session cookie does not reach the socket process across a port boundary,
 * so the client trades it for a 60-second ticket it passes in the query string.
 */
authRoutes.post('/ws-ticket', requireUser, async (c) => {
  const user = c.get('user')
  const ticket = await issueWsTicket(user.id)
  return c.json({ ticket, url: env.publicWsUrl, expiresIn: 60 })
})

type IdTokenClaims = {
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
}

function decodeIdToken(idToken: string): IdTokenClaims | null {
  const payload = idToken.split('.')[1]
  if (!payload) return null
  try {
    return JSON.parse(
      Buffer.from(payload.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8'),
    ) as IdTokenClaims
  } catch {
    return null
  }
}

/** Used by the seed script's summary, and by tests that need a known user. */
export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1)
  return user ?? null
}
