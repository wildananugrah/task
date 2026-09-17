import { describe, expect, test } from 'bun:test'
import { app, callerFor, makeUser, tokenFor, unique } from './helpers'
import { env } from '../src/lib/env'
import { signJwt, verifyJwt } from '../src/lib/jwt'

describe('sessions', () => {
  test('dev sign-in creates the account and sets an httpOnly cookie', async () => {
    const email = `${unique('new')}@test.co`
    const response = await app.request('/api/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('ts_session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')

    const body = await response.json()
    expect(body.user.email).toBe(email)
    // Initials and colour are derived, so a new person is never blank.
    expect(body.user.initials).toHaveLength(2)
    expect(body.user.color).toStartWith('#')
  })

  test('signing in twice is the same account, not two', async () => {
    const email = `${unique('same')}@test.co`
    const first = await app.request('/api/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const second = await app.request('/api/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.toUpperCase() }),
    })

    expect((await first.json()).user.id).toBe((await second.json()).user.id)
  })

  test('"who am I" answers nobody with a 200, not a 401', async () => {
    const response = await app.request('/api/auth/me')
    expect(response.status).toBe(200)
    expect((await response.json()).user).toBeNull()
  })

  test('a tampered or expired session is refused', async () => {
    const user = await makeUser()

    const wrongSecret = await signJwt({ sub: user.id, email: user.email }, 'not-the-secret', 3600)
    expect((await callerFor(wrongSecret)('GET', '/bootstrap')).status).toBe(401)

    const expired = await signJwt({ sub: user.id, email: user.email }, env.sessionSecret, -10)
    expect((await callerFor(expired)('GET', '/bootstrap')).status).toBe(401)

    const forDeletedUser = await signJwt(
      { sub: '00000000-0000-4000-8000-000000000000', email: 'ghost@test.co' },
      env.sessionSecret,
      3600,
    )
    expect((await callerFor(forDeletedUser)('GET', '/bootstrap')).status).toBe(401)
  })
})

describe('socket tickets', () => {
  test('a ticket is short-lived, audience-tagged, and signed with its own secret', async () => {
    const user = await makeUser()
    const call = callerFor(await tokenFor(user.id, user.email))

    const result = await call('POST', '/auth/ws-ticket')
    expect(result.status).toBe(200)
    expect(result.body.expiresIn).toBe(60)

    const claims = await verifyJwt<{ sub: string; aud: string; exp: number }>(
      result.body.ticket,
      env.wsTicketSecret,
    )
    expect(claims?.sub).toBe(user.id)
    expect(claims?.aud).toBe('ws')
    expect(claims!.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60)

    // A session token must not be usable as a ticket, nor the reverse.
    expect(await verifyJwt(result.body.ticket, env.sessionSecret)).toBeNull()
  })

  test('an anonymous caller cannot mint one', async () => {
    const response = await app.request('/api/auth/ws-ticket', { method: 'POST' })
    expect(response.status).toBe(401)
  })
})

describe('invites', () => {
  test('an invite waits under the email and becomes membership on first sign-in', async () => {
    const { scenario } = await import('./helpers')
    const world = await scenario()
    const email = `${unique('invited')}@test.co`

    const invited = await world.admin.call('POST', `/workspaces/${world.workspace.id}/members`, {
      emails: [email],
      role: 'member',
    })
    expect(invited.status).toBe(201)
    expect(invited.body.members[0].status).toBe('pending')

    // The account does not exist yet; signing in is what resolves the invite.
    const signedIn = await app.request('/api/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const user = (await signedIn.json()).user
    const call = callerFor(await tokenFor(user.id, user.email))

    const bootstrap = await call('GET', '/bootstrap')
    expect(bootstrap.body.workspaces.map((w: any) => w.id)).toContain(world.workspace.id)

    const members = await call('GET', `/workspaces/${world.workspace.id}/members`)
    const row = members.body.members.find((member: any) => member.email === email)
    expect(row.status).toBe('active')
    expect(row.role).toBe('member')
  })

  test('inviting the same address twice does not duplicate the member', async () => {
    const { scenario } = await import('./helpers')
    const world = await scenario()
    const email = `${unique('dup')}@test.co`

    expect(
      (await world.admin.call('POST', `/workspaces/${world.workspace.id}/members`, { emails: [email] }))
        .status,
    ).toBe(201)
    expect(
      (await world.admin.call('POST', `/workspaces/${world.workspace.id}/members`, { emails: [email] }))
        .status,
    ).toBe(409)

    const members = await world.admin.call('GET', `/workspaces/${world.workspace.id}/members`)
    expect(members.body.members.filter((member: any) => member.email === email)).toHaveLength(1)
  })
})
