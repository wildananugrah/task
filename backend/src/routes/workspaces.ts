import { Hono } from 'hono'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import {
  conversationMembers,
  conversations,
  files,
  labels,
  statuses,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '../db/schema'
import { loadAccess, requireAccess } from '../lib/access'
import { badRequest, conflict, notFound } from '../lib/errors'
import { DEFAULT_LABELS, DEFAULT_STATUSES } from '../lib/defaults'
import { initialsFrom, normalizeEmail, safeFileName } from '../lib/identity'
import { listWorkspaceCards, workspaceFiles, workspacePayload } from '../lib/queries'
import { deleteObjects, logoKey, presignDownload, presignUpload } from '../lib/s3'
import { shapeLabel, shapeMember, shapeStatus, shapeWorkspace } from '../lib/shape'
import { requireUser, type AppEnv } from '../middleware/session'
import { parse } from '../lib/validate'

export const workspaceRoutes = new Hono<AppEnv>()
workspaceRoutes.use('*', requireUser)

const prefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'A task prefix is exactly three letters')

const createSchema = z.object({
  name: z.string().trim().min(1, 'A workspace needs a name').max(60),
  prefix: prefixSchema,
  description: z.string().trim().max(200).optional(),
})

workspaceRoutes.get('/', async (c) => c.json({ workspaces: await listWorkspaceCards(c.get('user').id) }))

workspaceRoutes.post('/', async (c) => {
  const user = c.get('user')
  const input = parse(createSchema, await c.req.json().catch(() => ({})))

  const workspace = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(workspaces)
      .values({
        name: input.name,
        initials: initialsFrom(input.name),
        prefix: input.prefix,
        color: '#4a4a4a',
        description: input.description ?? 'Created just now',
        createdBy: user.id,
      })
      .returning()

    const created = row!

    await tx.insert(workspaceMembers).values({
      workspaceId: created.id,
      userId: user.id,
      email: user.email,
      role: 'admin',
      status: 'active',
    })

    await tx.insert(statuses).values(
      DEFAULT_STATUSES.map((status, index) => ({
        workspaceId: created.id,
        name: status.name,
        color: status.color,
        position: index,
      })),
    )

    await tx
      .insert(labels)
      .values(DEFAULT_LABELS.map((name) => ({ workspaceId: created.id, name })))

    // Every workspace gets its team room, so chat is never an empty screen.
    const [conversation] = await tx
      .insert(conversations)
      .values({ workspaceId: created.id, kind: 'group', title: created.name })
      .returning()
    await tx
      .insert(conversationMembers)
      .values({ conversationId: conversation!.id, userId: user.id })

    return created
  })

  const payload = await workspacePayload(workspace.id, workspace.prefix)
  return c.json({ workspace: shapeWorkspace(workspace, { role: 'admin' }), ...payload }, 201)
})

workspaceRoutes.get('/:id', async (c) => {
  const access = await loadAccess(c.req.param('id'), c.get('user').id)
  const payload = await workspacePayload(access.workspace.id, access.workspace.prefix)
  return c.json({
    workspace: shapeWorkspace(access.workspace, {
      role: access.role,
      logoUrl: access.workspace.logoKey
        ? presignDownload(access.workspace.logoKey, 'logo', 'inline')
        : null,
    }),
    ...payload,
  })
})

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  prefix: prefixSchema.optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  description: z.string().trim().max(200).optional(),
})

workspaceRoutes.patch('/:id', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin')
  const input = parse(patchSchema, await c.req.json().catch(() => ({})))

  // The prefix is only ever stored on the workspace. Task ids are derived from
  // it, so changing it here renumbers every task in the workspace by itself.
  const [row] = await db
    .update(workspaces)
    .set({
      ...(input.name ? { name: input.name, initials: initialsFrom(input.name) } : {}),
      ...(input.prefix ? { prefix: input.prefix } : {}),
      ...(input.color ? { color: input.color } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .where(eq(workspaces.id, access.workspace.id))
    .returning()

  return c.json({ workspace: shapeWorkspace(row!, { role: access.role }) })
})

workspaceRoutes.post('/:id/archive', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin')
  await db
    .update(workspaces)
    .set({ archivedAt: new Date() })
    .where(eq(workspaces.id, access.workspace.id))
  return c.json({ ok: true })
})

workspaceRoutes.post('/:id/restore', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin', {
    includeArchived: true,
  })
  await db
    .update(workspaces)
    .set({ archivedAt: null })
    .where(eq(workspaces.id, access.workspace.id))
  return c.json({ ok: true })
})

workspaceRoutes.delete('/:id', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin', {
    includeArchived: true,
  })

  // Rows cascade; objects do not, so collect the keys before the delete.
  const keys = await db
    .select({ key: files.key })
    .from(files)
    .where(eq(files.workspaceId, access.workspace.id))
  if (access.workspace.logoKey) keys.push({ key: access.workspace.logoKey })

  await db.delete(workspaces).where(eq(workspaces.id, access.workspace.id))
  await deleteObjects(keys.map((row) => row.key))
  return c.json({ ok: true })
})

/* ── logo ──────────────────────────────────────────────────────────────── */

workspaceRoutes.post('/:id/logo', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin')
  const input = parse(
    z.object({
      name: z.string().trim().min(1).max(200),
      contentType: z.string().regex(/^image\//, 'A workspace logo must be an image'),
    }),
    await c.req.json().catch(() => ({})),
  )

  const key = logoKey(access.workspace.id, crypto.randomUUID(), safeFileName(input.name))
  return c.json({ key, uploadUrl: presignUpload(key) })
})

workspaceRoutes.post('/:id/logo/complete', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin')
  const { key } = parse(
    z.object({ key: z.string().min(1) }),
    await c.req.json().catch(() => ({})),
  )
  if (!key.startsWith(`ws/${access.workspace.id}/logo/`)) badRequest('That key is not this workspace')

  const previous = access.workspace.logoKey
  const [row] = await db
    .update(workspaces)
    .set({ logoKey: key })
    .where(eq(workspaces.id, access.workspace.id))
    .returning()
  if (previous && previous !== key) await deleteObjects([previous])

  return c.json({
    workspace: shapeWorkspace(row!, {
      role: access.role,
      logoUrl: presignDownload(key, 'logo', 'inline'),
    }),
  })
})

/* ── statuses ──────────────────────────────────────────────────────────── */

workspaceRoutes.post('/:id/statuses', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin')
  const input = parse(
    z.object({
      name: z.string().trim().min(1).max(40).default('New status'),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default('#8c8c8c'),
    }),
    await c.req.json().catch(() => ({})),
  )

  const [{ next } = { next: 0 }] = await db
    .select({ next: sql<number>`coalesce(max(${statuses.position}), -1) + 1` })
    .from(statuses)
    .where(eq(statuses.workspaceId, access.workspace.id))

  const [row] = await db
    .insert(statuses)
    .values({
      workspaceId: access.workspace.id,
      name: input.name,
      color: input.color,
      position: Number(next),
    })
    .returning()

  return c.json({ status: shapeStatus(row!) }, 201)
})

workspaceRoutes.post('/:id/statuses/reorder', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin')
  const { ids } = parse(
    z.object({ ids: z.array(z.uuid()).min(1) }),
    await c.req.json().catch(() => ({})),
  )

  const existing = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(eq(statuses.workspaceId, access.workspace.id))
  const known = new Set(existing.map((row) => row.id))
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    badRequest('Reorder must list every status in this workspace exactly once')
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.update(statuses).set({ position: index }).where(eq(statuses.id, id))
    }
  })

  const rows = await db
    .select()
    .from(statuses)
    .where(eq(statuses.workspaceId, access.workspace.id))
    .orderBy(asc(statuses.position))
  return c.json({ statuses: rows.map(shapeStatus) })
})

/* ── labels ────────────────────────────────────────────────────────────── */

workspaceRoutes.post('/:id/labels', async (c) => {
  const access = await requireAccess(c.req.param('id'), c.get('user').id, 'admin')
  const { name } = parse(
    z.object({ name: z.string().trim().min(1).max(18) }),
    await c.req.json().catch(() => ({})),
  )

  const [existing] = await db
    .select()
    .from(labels)
    .where(and(eq(labels.workspaceId, access.workspace.id), eq(labels.name, name)))
    .limit(1)
  if (existing) conflict('That label already exists', shapeLabel(existing))

  const [row] = await db
    .insert(labels)
    .values({ workspaceId: access.workspace.id, name })
    .returning()
  return c.json({ label: shapeLabel(row!) }, 201)
})

/* ── members ───────────────────────────────────────────────────────────── */

const ROLE = z.enum(['admin', 'member', 'viewer'])

workspaceRoutes.post('/:id/members', async (c) => {
  const user = c.get('user')
  const access = await requireAccess(c.req.param('id'), user.id, 'admin')
  const input = parse(
    z.object({
      emails: z.array(z.email()).min(1, 'Add at least one email address'),
      role: ROLE.default('member'),
    }),
    await c.req.json().catch(() => ({})),
  )

  const emails = [...new Set(input.emails.map(normalizeEmail))]

  const added = await db.transaction(async (tx) => {
    // An invited address may already have an account — in which case the invite
    // resolves to that user immediately and they see the workspace on next load.
    const existingUsers = await tx.select().from(users).where(inArray(users.email, emails))
    const byEmail = new Map(existingUsers.map((row) => [row.email, row]))

    const rows = await tx
      .insert(workspaceMembers)
      .values(
        emails.map((email) => ({
          workspaceId: access.workspace.id,
          userId: byEmail.get(email)?.id ?? null,
          email,
          role: input.role,
          status: 'pending' as const,
          invitedBy: user.id,
        })),
      )
      .onConflictDoNothing()
      .returning()

    const conversation = await tx
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.workspaceId, access.workspace.id), eq(conversations.kind, 'group')),
      )
      .limit(1)
    const room = conversation[0]
    if (room) {
      const joined = rows.filter((row) => row.userId)
      if (joined.length) {
        await tx
          .insert(conversationMembers)
          .values(joined.map((row) => ({ conversationId: room.id, userId: row.userId! })))
          .onConflictDoNothing()
      }
    }

    return rows.map((row) => shapeMember(row, byEmail.get(row.email) ?? null))
  })

  if (!added.length) conflict('Everyone on that list is already in this workspace')
  return c.json({ members: added }, 201)
})

workspaceRoutes.get('/:id/members', async (c) => {
  const access = await loadAccess(c.req.param('id'), c.get('user').id)
  const rows = await db
    .select({ member: workspaceMembers, user: users })
    .from(workspaceMembers)
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, access.workspace.id))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.email))
  return c.json({ members: rows.map((row) => shapeMember(row.member, row.user)) })
})

/* ── files ─────────────────────────────────────────────────────────────── */

workspaceRoutes.get('/:id/files', async (c) => {
  const access = await loadAccess(c.req.param('id'), c.get('user').id)
  const files = await workspaceFiles(
    access.workspace.id,
    access.workspace.prefix,
    c.req.query('q'),
  )
  return c.json({ files })
})

/* ── member role / removal, addressed by membership id ─────────────────── */

export const memberRoutes = new Hono<AppEnv>()
memberRoutes.use('*', requireUser)

async function loadMembership(membershipId: string, userId: string, level: 'admin' | 'member') {
  const [row] = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.id, membershipId))
    .limit(1)
  if (!row) notFound('Member not found')
  const access = await requireAccess(row.workspaceId, userId, level, { includeArchived: true })
  return { member: row, access }
}

memberRoutes.patch('/:id', async (c) => {
  const user = c.get('user')
  const { member, access } = await loadMembership(c.req.param('id'), user.id, 'admin')
  const { role } = parse(z.object({ role: ROLE }), await c.req.json().catch(() => ({})))

  // Losing the last admin would lock the workspace's settings for everyone.
  if (member.role === 'admin' && role !== 'admin') {
    const [{ admins } = { admins: 0 }] = await db
      .select({ admins: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, access.workspace.id),
          eq(workspaceMembers.role, 'admin'),
          eq(workspaceMembers.status, 'active'),
          ne(workspaceMembers.id, member.id),
        ),
      )
    if (Number(admins) === 0) conflict('A workspace needs at least one admin')
  }

  const [row] = await db
    .update(workspaceMembers)
    .set({ role })
    .where(eq(workspaceMembers.id, member.id))
    .returning()
  const [account] = row!.userId
    ? await db.select().from(users).where(eq(users.id, row!.userId)).limit(1)
    : []

  return c.json({ member: shapeMember(row!, account ?? null) })
})

memberRoutes.delete('/:id', async (c) => {
  const user = c.get('user')
  const { member, access } = await loadMembership(c.req.param('id'), user.id, 'admin')

  if (member.role === 'admin' && member.status === 'active') {
    const [{ admins } = { admins: 0 }] = await db
      .select({ admins: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, access.workspace.id),
          eq(workspaceMembers.role, 'admin'),
          eq(workspaceMembers.status, 'active'),
          ne(workspaceMembers.id, member.id),
        ),
      )
    if (Number(admins) === 0) conflict('A workspace needs at least one admin')
  }

  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, member.id))
  // Tasks keep their assignee column pointing at a user who is simply no longer
  // here; clearing it would quietly rewrite history on every task they owned.
  return c.json({ ok: true })
})

/* ── status / label edits, addressed by their own id ───────────────────── */

export const statusRoutes = new Hono<AppEnv>()
statusRoutes.use('*', requireUser)

statusRoutes.patch('/:id', async (c) => {
  const [row] = await db.select().from(statuses).where(eq(statuses.id, c.req.param('id'))).limit(1)
  if (!row) notFound('Status not found')
  await requireAccess(row.workspaceId, c.get('user').id, 'admin')

  const input = parse(
    z.object({
      name: z.string().trim().min(1).max(40).optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    }),
    await c.req.json().catch(() => ({})),
  )

  const [updated] = await db
    .update(statuses)
    .set({ ...(input.name ? { name: input.name } : {}), ...(input.color ? { color: input.color } : {}) })
    .where(eq(statuses.id, row.id))
    .returning()
  return c.json({ status: shapeStatus(updated!) })
})

statusRoutes.delete('/:id', async (c) => {
  const [row] = await db.select().from(statuses).where(eq(statuses.id, c.req.param('id'))).limit(1)
  if (!row) notFound('Status not found')
  await requireAccess(row.workspaceId, c.get('user').id, 'admin')

  const remaining = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.workspaceId, row.workspaceId), ne(statuses.id, row.id)))
    .orderBy(asc(statuses.position))
  if (!remaining.length) conflict('A workspace needs at least one status')

  // Tasks in the deleted column move to the first remaining one rather than
  // becoming statusless and invisible on the board.
  const moveTo = c.req.query('moveTo') ?? remaining[0]!.id
  if (!remaining.some((status) => status.id === moveTo)) badRequest('Unknown target status')

  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ statusId: moveTo }).where(eq(tasks.statusId, row.id))
    await tx.delete(statuses).where(eq(statuses.id, row.id))
  })

  return c.json({ ok: true, movedTo: moveTo })
})

export const labelRoutes = new Hono<AppEnv>()
labelRoutes.use('*', requireUser)

labelRoutes.delete('/:id', async (c) => {
  const [row] = await db.select().from(labels).where(eq(labels.id, c.req.param('id'))).limit(1)
  if (!row) notFound('Label not found')
  await requireAccess(row.workspaceId, c.get('user').id, 'admin')
  // task_labels cascades, so this removes it from every task that used it.
  await db.delete(labels).where(eq(labels.id, row.id))
  return c.json({ ok: true })
})

/* ── bootstrap: the home screen in one request ─────────────────────────── */

export const bootstrapRoute = new Hono<AppEnv>()
bootstrapRoute.use('*', requireUser)

bootstrapRoute.get('/', async (c) => {
  const user = c.get('user')

  // Signing in is what turns a pending invite into membership: the invite was
  // addressed to an email, and this is the first moment it is known to be them.
  await db
    .update(workspaceMembers)
    .set({ userId: user.id, status: 'active' })
    .where(and(eq(workspaceMembers.email, user.email), eq(workspaceMembers.status, 'pending')))

  // ...and joins them to the team room of every workspace they are now in.
  await db.execute(sql`
    insert into conversation_members (conversation_id, user_id)
    select c.id, ${user.id}::uuid
      from conversations c
      join workspace_members m
        on m.workspace_id = c.workspace_id
       and m.user_id = ${user.id}::uuid
       and m.status = 'active'
     where c.kind = 'group'
    on conflict do nothing
  `)

  return c.json({ workspaces: await listWorkspaceCards(user.id) })
})
