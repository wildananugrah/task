import { Hono } from 'hono'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { comments, files, labels, statuses, taskLabels, tasks, users } from '../db/schema'
import { loadAccess, requireAccess, type Access } from '../lib/access'
import { badRequest, notFound } from '../lib/errors'
import { FIRST_TASK_NUMBER } from '../lib/defaults'
import { taskComments, taskFiles, taskLabelNames } from '../lib/queries'
import { deleteObjects } from '../lib/s3'
import { shapeComment, shapeTask } from '../lib/shape'
import { parse } from '../lib/validate'
import { requireUser, type AppEnv } from '../middleware/session'

export const workspaceTaskRoutes = new Hono<AppEnv>()
workspaceTaskRoutes.use('*', requireUser)

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A due date looks like 2026-09-15')

const bodySchema = z.object({
  title: z.string().trim().min(1, 'A task needs a title').max(200).optional(),
  description: z.string().max(10_000).optional(),
  statusId: z.uuid().nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(18)).optional(),
})

/**
 * Task numbers are a per-workspace sequence, not a global one, so they are
 * allocated as max()+1. Two creates racing would read the same max — Postgres
 * cannot lock a row that does not exist yet — so the allocation takes a
 * transaction-scoped advisory lock keyed on the workspace. Contention is
 * limited to simultaneous creates in the same workspace, and the number that
 * comes out is never duplicated or skipped.
 *
 * The first cut of this retried on the unique-index violation instead. It did
 * not work: Drizzle wraps the driver error, so the constraint name the retry
 * matched on was not in the message it was reading, and every loser of a race
 * became a 500.
 */
async function insertWithNumber(
  access: Access,
  values: Omit<typeof tasks.$inferInsert, 'number' | 'workspaceId'>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${access.workspace.id}, 0))`)

    const [{ next } = { next: FIRST_TASK_NUMBER }] = await tx
      .select({
        next: sql<number>`coalesce(max(${tasks.number}), ${FIRST_TASK_NUMBER - 1}) + 1`,
      })
      .from(tasks)
      .where(eq(tasks.workspaceId, access.workspace.id))

    const [row] = await tx
      .insert(tasks)
      .values({ ...values, workspaceId: access.workspace.id, number: Number(next) })
      .returning()
    return row!
  })
}

/** Names in, rows out: labels are created on demand so a task can carry a new one. */
async function syncLabels(workspaceId: string, taskId: string, names: string[]) {
  const wanted = [...new Set(names.map((name) => name.trim()).filter(Boolean))]

  await db.transaction(async (tx) => {
    await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId))
    if (!wanted.length) return

    await tx
      .insert(labels)
      .values(wanted.map((name) => ({ workspaceId, name })))
      .onConflictDoNothing()

    const rows = await tx
      .select()
      .from(labels)
      .where(and(eq(labels.workspaceId, workspaceId), inArray(labels.name, wanted)))

    if (rows.length) {
      await tx
        .insert(taskLabels)
        .values(rows.map((row) => ({ taskId, labelId: row.id })))
        .onConflictDoNothing()
    }
  })
}

async function assertAssignable(workspaceId: string, assigneeId: string | null | undefined) {
  if (!assigneeId) return
  const [row] = await db.execute<{ ok: boolean }>(sql`
    select true as ok from workspace_members
     where workspace_id = ${workspaceId}::uuid and user_id = ${assigneeId}::uuid limit 1
  `)
  if (!row) badRequest('That person is not a member of this workspace')
}

async function assertStatus(workspaceId: string, statusId: string | null | undefined) {
  if (!statusId) return
  const [row] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.workspaceId, workspaceId)))
    .limit(1)
  if (!row) badRequest('That status is not in this workspace')
}

workspaceTaskRoutes.get('/:id/tasks', async (c) => {
  const access = await loadAccess(c.req.param('id'), c.get('user').id)
  const { q, status, assignee, label, due } = c.req.query()

  const today = new Date().toISOString().slice(0, 10)
  const conditions = [eq(tasks.workspaceId, access.workspace.id)]
  if (status) conditions.push(eq(tasks.statusId, status))
  if (assignee) conditions.push(eq(tasks.assigneeId, assignee))
  if (due === 'overdue') {
    conditions.push(and(isNotNull(tasks.dueDate), lt(tasks.dueDate, today))!)
  }
  if (due === 'set') conditions.push(isNotNull(tasks.dueDate))
  if (due === 'none') conditions.push(isNull(tasks.dueDate))
  if (due === 'week') {
    const end = new Date()
    end.setDate(end.getDate() + 7)
    conditions.push(
      and(isNotNull(tasks.dueDate), lte(tasks.dueDate, end.toISOString().slice(0, 10)))!,
    )
  }
  if (q) {
    const needle = `%${q.toLowerCase()}%`
    conditions.push(
      sql`(lower(${tasks.title}) like ${needle} or lower(${access.workspace.prefix} || '-' || ${tasks.number}) like ${needle})`,
    )
  }

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.number))

  const ids = rows.map((row) => row.id)
  const links = ids.length
    ? await db
        .select({ taskId: taskLabels.taskId, name: labels.name })
        .from(taskLabels)
        .innerJoin(labels, eq(labels.id, taskLabels.labelId))
        .where(inArray(taskLabels.taskId, ids))
    : []

  const filtered = rows.filter((row) =>
    label ? links.some((link) => link.taskId === row.id && link.name === label) : true,
  )

  return c.json({
    tasks: filtered.map((row) =>
      shapeTask(row, {
        prefix: access.workspace.prefix,
        labels: links.filter((link) => link.taskId === row.id).map((link) => link.name).sort(),
      }),
    ),
  })
})

workspaceTaskRoutes.post('/:id/tasks', async (c) => {
  const user = c.get('user')
  const access = await requireAccess(c.req.param('id'), user.id, 'member')
  const input = parse(bodySchema, await c.req.json().catch(() => ({})))

  let statusId = input.statusId ?? null
  if (!statusId) {
    const [first] = await db
      .select({ id: statuses.id })
      .from(statuses)
      .where(eq(statuses.workspaceId, access.workspace.id))
      .orderBy(asc(statuses.position))
      .limit(1)
    statusId = first?.id ?? null
  }
  await assertStatus(access.workspace.id, statusId)
  await assertAssignable(access.workspace.id, input.assigneeId ?? user.id)

  const row = await insertWithNumber(access, {
    title: input.title ?? 'Untitled task',
    description: input.description ?? '',
    statusId,
    assigneeId: input.assigneeId === undefined ? user.id : input.assigneeId,
    dueDate: input.dueDate ?? null,
    createdBy: user.id,
  })

  if (input.labels?.length) await syncLabels(access.workspace.id, row.id, input.labels)

  return c.json(
    {
      task: shapeTask(row, {
        prefix: access.workspace.prefix,
        labels: input.labels ?? [],
      }),
    },
    201,
  )
})

/* ── a single task ─────────────────────────────────────────────────────── */

export const taskRoutes = new Hono<AppEnv>()
taskRoutes.use('*', requireUser)

async function loadTask(taskId: string, userId: string, level: 'viewer' | 'member') {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!row) notFound('Task not found')
  const access =
    level === 'viewer'
      ? await loadAccess(row.workspaceId, userId)
      : await requireAccess(row.workspaceId, userId, 'member')
  return { task: row, access }
}

taskRoutes.get('/:id', async (c) => {
  const { task, access } = await loadTask(c.req.param('id'), c.get('user').id, 'viewer')
  const [labelNames, fileRows, commentRows] = await Promise.all([
    taskLabelNames(task.id),
    taskFiles(task.id),
    taskComments(task.id),
  ])

  return c.json({
    task: {
      ...shapeTask(task, {
        prefix: access.workspace.prefix,
        labels: labelNames,
        fileCount: fileRows.length,
        commentCount: commentRows.length,
      }),
      files: fileRows,
      comments: commentRows,
    },
  })
})

taskRoutes.patch('/:id', async (c) => {
  const { task, access } = await loadTask(c.req.param('id'), c.get('user').id, 'member')
  const input = parse(bodySchema, await c.req.json().catch(() => ({})))

  await assertStatus(access.workspace.id, input.statusId)
  await assertAssignable(access.workspace.id, input.assigneeId)

  const [row] = await db
    .update(tasks)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.statusId !== undefined ? { statusId: input.statusId } : {}),
      ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id))
    .returning()

  if (input.labels) await syncLabels(access.workspace.id, task.id, input.labels)

  const [labelNames, fileCount, commentCount] = await Promise.all([
    taskLabelNames(task.id),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(files)
      .where(and(eq(files.taskId, task.id), eq(files.state, 'ready'))),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(comments)
      .where(eq(comments.taskId, task.id)),
  ])

  return c.json({
    task: shapeTask(row!, {
      prefix: access.workspace.prefix,
      labels: labelNames,
      fileCount: Number(fileCount[0]?.total ?? 0),
      commentCount: Number(commentCount[0]?.total ?? 0),
    }),
  })
})

taskRoutes.delete('/:id', async (c) => {
  const { task } = await loadTask(c.req.param('id'), c.get('user').id, 'member')
  const keys = await db.select({ key: files.key }).from(files).where(eq(files.taskId, task.id))
  await db.delete(tasks).where(eq(tasks.id, task.id))
  await deleteObjects(keys.map((row) => row.key))
  return c.json({ ok: true })
})

taskRoutes.get('/:id/comments', async (c) => {
  const { task } = await loadTask(c.req.param('id'), c.get('user').id, 'viewer')
  return c.json({ comments: await taskComments(task.id) })
})

taskRoutes.post('/:id/comments', async (c) => {
  const user = c.get('user')
  const { task } = await loadTask(c.req.param('id'), user.id, 'member')
  const { body } = parse(
    z.object({ body: z.string().trim().min(1, 'Write something first').max(5000) }),
    await c.req.json().catch(() => ({})),
  )

  const [row] = await db
    .insert(comments)
    .values({ taskId: task.id, authorId: user.id, body })
    .returning()

  return c.json({ comment: shapeComment(row!, user) }, 201)
})

export { loadTask }
