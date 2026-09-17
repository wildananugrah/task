import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { files, tasks, users } from '../db/schema'
import { loadAccess, requireAccess } from '../lib/access'
import { env } from '../lib/env'
import { badRequest, fail, notFound } from '../lib/errors'
import { extensionOf, safeFileName } from '../lib/identity'
import { deleteObjects, objectKey, presignDownload, presignUpload } from '../lib/s3'
import { shapeFile } from '../lib/shape'
import { parse } from '../lib/validate'
import { requireUser, type AppEnv } from '../middleware/session'

/** Attaching to a task: presign → browser PUTs the bytes → confirm. */
export const taskFileRoutes = new Hono<AppEnv>()
taskFileRoutes.use('*', requireUser)

taskFileRoutes.post('/:id/files', async (c) => {
  const user = c.get('user')
  const [task] = await db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).limit(1)
  if (!task) notFound('Task not found')
  const access = await requireAccess(task.workspaceId, user.id, 'member')

  const input = parse(
    z.object({
      name: z.string().trim().min(1).max(200),
      size: z.number().int().nonnegative(),
      contentType: z.string().trim().min(1).max(160).default('application/octet-stream'),
    }),
    await c.req.json().catch(() => ({})),
  )

  if (input.size > env.maxUploadBytes) {
    fail(
      'payload_too_large',
      `That file is larger than the ${Math.round(env.maxUploadBytes / 1024 / 1024)} MB limit`,
    )
  }

  const fileId = crypto.randomUUID()
  const key = objectKey(access.workspace.id, task.id, fileId, safeFileName(input.name))

  // The row lands as 'pending' and is invisible to every read until the browser
  // confirms the PUT. A failed upload therefore never becomes a broken file row.
  const [row] = await db
    .insert(files)
    .values({
      id: fileId,
      workspaceId: access.workspace.id,
      taskId: task.id,
      key,
      name: input.name,
      ext: extensionOf(input.name),
      size: input.size,
      contentType: input.contentType,
      uploadedBy: user.id,
      state: 'pending',
    })
    .returning()

  return c.json({ fileId: row!.id, key, uploadUrl: presignUpload(key) }, 201)
})

export const fileRoutes = new Hono<AppEnv>()
fileRoutes.use('*', requireUser)

async function loadFile(fileId: string, userId: string, level: 'viewer' | 'member') {
  const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1)
  if (!row) notFound('File not found')
  const access =
    level === 'viewer'
      ? await loadAccess(row.workspaceId, userId)
      : await requireAccess(row.workspaceId, userId, 'member')
  return { file: row, access }
}

fileRoutes.post('/:id/complete', async (c) => {
  const user = c.get('user')
  const { file } = await loadFile(c.req.param('id'), user.id, 'member')
  if (file.uploadedBy !== user.id) badRequest('That upload belongs to someone else')

  const [row] = await db
    .update(files)
    .set({ state: 'ready' })
    .where(and(eq(files.id, file.id), eq(files.state, 'pending')))
    .returning()

  const ready = row ?? file
  const [uploader] = await db.select().from(users).where(eq(users.id, user.id)).limit(1)
  return c.json({ file: shapeFile(ready, { uploader: uploader ?? null }) })
})

fileRoutes.get('/:id/url', async (c) => {
  const { file } = await loadFile(c.req.param('id'), c.get('user').id, 'viewer')
  if (file.state !== 'ready') notFound('That file has not finished uploading')

  const disposition = c.req.query('disposition') === 'attachment' ? 'attachment' : 'inline'
  return c.json({
    url: presignDownload(file.key, file.name, disposition),
    expiresIn: env.downloadUrlTtl,
    contentType: file.contentType,
    name: file.name,
    size: file.size,
  })
})

fileRoutes.delete('/:id', async (c) => {
  const { file } = await loadFile(c.req.param('id'), c.get('user').id, 'member')
  await db.delete(files).where(eq(files.id, file.id))
  await deleteObjects([file.key])
  return c.json({ ok: true })
})
