import { eq } from 'drizzle-orm'
import { createApp } from '../src/app'
import { db } from '../src/db/client'
import {
  conversationMembers,
  conversations,
  labels,
  statuses,
  users,
  workspaceMembers,
  workspaces,
  type MemberRole,
} from '../src/db/schema'
import { DEFAULT_LABELS, DEFAULT_STATUSES } from '../src/lib/defaults'
import { colorFor, initialsFrom, nameFromEmail } from '../src/lib/identity'
import { signJwt } from '../src/lib/jwt'
import { env } from '../src/lib/env'

export const app = createApp()

let counter = 0
export const unique = (prefix = 'x') => `${prefix}${Date.now().toString(36)}${counter++}`

export async function makeUser(email = `${unique('u')}@test.co`) {
  const name = nameFromEmail(email)
  const [user] = await db
    .insert(users)
    .values({ email, name, initials: initialsFrom(name), color: colorFor(email) })
    .onConflictDoUpdate({ target: users.email, set: { name } })
    .returning()
  return user!
}

/** A session token, so tests can call the API exactly as a browser would. */
export async function tokenFor(userId: string, email: string) {
  return signJwt({ sub: userId, email }, env.sessionSecret, 3600)
}

export type Caller = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ status: number; body: any }>

export function callerFor(token: string): Caller {
  return async (method, path, body) => {
    const response = await app.request(`/api${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const parsed = await response.json().catch(() => null)
    return { status: response.status, body: parsed }
  }
}

export async function makeWorkspace(options: { prefix?: string } = {}) {
  const prefix = options.prefix ?? 'TST'
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: unique('Workspace '), initials: 'WS', prefix })
    .returning()

  const statusRows = await db
    .insert(statuses)
    .values(
      DEFAULT_STATUSES.map((status, position) => ({
        workspaceId: workspace!.id,
        name: status.name,
        color: status.color,
        position,
      })),
    )
    .returning()

  const labelRows = await db
    .insert(labels)
    .values(DEFAULT_LABELS.map((name) => ({ workspaceId: workspace!.id, name })))
    .returning()

  const [room] = await db
    .insert(conversations)
    .values({ workspaceId: workspace!.id, kind: 'group', title: workspace!.name })
    .returning()

  return { workspace: workspace!, statuses: statusRows, labels: labelRows, room: room! }
}

export async function join(workspaceId: string, userId: string, email: string, role: MemberRole) {
  const [member] = await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId, email, role, status: 'active' })
    .returning()

  const [room] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.workspaceId, workspaceId))
    .limit(1)
  if (room) {
    await db
      .insert(conversationMembers)
      .values({ conversationId: room.id, userId })
      .onConflictDoNothing()
  }
  return member!
}

/** A workspace with one member per role, and a caller for each. */
export async function scenario() {
  const made = await makeWorkspace()
  const roles: MemberRole[] = ['admin', 'member', 'viewer']
  const people: Record<string, { user: any; call: Caller; membershipId: string }> = {}

  for (const role of roles) {
    const user = await makeUser(`${unique(role)}@test.co`)
    const member = await join(made.workspace.id, user.id, user.email, role)
    people[role] = {
      user,
      call: callerFor(await tokenFor(user.id, user.email)),
      membershipId: member.id,
    }
  }

  return { ...made, ...(people as Record<MemberRole, (typeof people)[string]>) }
}
