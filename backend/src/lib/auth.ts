import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { users } from '../db/schema'
import { env } from './env'
import { signJwt, verifyJwt } from './jwt'
import { colorFor, initialsFrom, nameFromEmail, normalizeEmail } from './identity'

export const SESSION_COOKIE = 'ts_session'

type SessionClaims = { sub: string; email: string }

const secureCookies = () => env.appOrigin.startsWith('https://')

export async function issueSession(c: Context, userId: string, email: string) {
  const ttl = env.sessionDays * 24 * 60 * 60
  const token = await signJwt({ sub: userId, email }, env.sessionSecret, ttl)
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: secureCookies(),
    path: '/',
    maxAge: ttl,
  })
}

export function clearSession(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: secureCookies(), sameSite: 'Lax' })
}

/**
 * Reads the session cookie, or an `Authorization: Bearer` for non-browser
 * callers (the test suite and anything scripted).
 */
export async function currentUser(c: Context) {
  const header = c.req.header('authorization')
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null
  const token = getCookie(c, SESSION_COOKIE) ?? bearer
  const claims = await verifyJwt<SessionClaims>(token, env.sessionSecret)
  if (!claims?.sub) return null

  const [user] = await db.select().from(users).where(eq(users.id, claims.sub)).limit(1)
  return user ?? null
}

/** A 60-second, single-purpose token for the socket handshake. */
export function issueWsTicket(userId: string) {
  return signJwt({ sub: userId, aud: 'ws' }, env.wsTicketSecret, 60)
}

/**
 * Sign-in is by email whichever provider is used, so the account lookup is
 * shared: first login creates the row, later logins refresh what Google knows.
 */
export async function upsertUserByEmail(input: {
  email: string
  name?: string | null
  avatarUrl?: string | null
}) {
  const email = normalizeEmail(input.email)
  const name = input.name?.trim() || nameFromEmail(email)

  const [row] = await db
    .insert(users)
    .values({
      email,
      name,
      initials: initialsFrom(name),
      color: colorFor(email),
      avatarUrl: input.avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        name: sql`coalesce(nullif(excluded.name, ''), ${users.name})`,
        avatarUrl: sql`coalesce(excluded.avatar_url, ${users.avatarUrl})`,
      },
    })
    .returning()

  return row!
}
