import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { files } from '../src/db/schema'
import { env } from '../src/lib/env'
import { scenario } from './helpers'

async function taskIn(world: Awaited<ReturnType<typeof scenario>>) {
  const created = await world.member.call('POST', `/workspaces/${world.workspace.id}/tasks`, {
    title: 'Attachments',
  })
  return created.body.task.id as string
}

describe('presigned uploads', () => {
  test('the URL is a PUT scoped to this workspace and task', async () => {
    const world = await scenario()
    const taskId = await taskIn(world)

    const result = await world.member.call('POST', `/tasks/${taskId}/files`, {
      name: 'TSD v3.pdf',
      size: 2048,
      contentType: 'application/pdf',
    })

    expect(result.status).toBe(201)
    expect(result.body.key).toStartWith(`ws/${world.workspace.id}/tasks/${taskId}/`)
    // The stored name is namespaced by the file id and stripped of spaces, so
    // two people uploading "report.pdf" cannot overwrite each other.
    expect(result.body.key).toEndWith(`${result.body.fileId}-TSD-v3.pdf`)

    const url = new URL(result.body.uploadUrl)
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy()
    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBe(env.uploadUrlTtl)
    // Only `host` is signed, so the browser is free to send its own
    // Content-Type and the object keeps it.
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
  })

  test('a file over the limit is refused before anything is written', async () => {
    const world = await scenario()
    const taskId = await taskIn(world)

    const result = await world.member.call('POST', `/tasks/${taskId}/files`, {
      name: 'huge.bin',
      size: env.maxUploadBytes + 1,
      contentType: 'application/octet-stream',
    })

    expect(result.status).toBe(413)
    const rows = await db.select().from(files).where(eq(files.taskId, taskId))
    expect(rows).toHaveLength(0)
  })
})

describe('an upload is invisible until it is confirmed', () => {
  test('a pending row appears nowhere and cannot be downloaded', async () => {
    const world = await scenario()
    const taskId = await taskIn(world)

    const presigned = await world.member.call('POST', `/tasks/${taskId}/files`, {
      name: 'half.txt',
      size: 10,
      contentType: 'text/plain',
    })

    const detail = await world.member.call('GET', `/tasks/${taskId}`)
    expect(detail.body.task.files).toHaveLength(0)

    const listed = await world.member.call('GET', `/workspaces/${world.workspace.id}/files`)
    expect(listed.body.files).toHaveLength(0)

    const url = await world.member.call('GET', `/files/${presigned.body.fileId}/url`)
    expect(url.status).toBe(404)
  })

  test('confirming makes it real, and it shows up on both screens', async () => {
    const world = await scenario()
    const taskId = await taskIn(world)

    const presigned = await world.member.call('POST', `/tasks/${taskId}/files`, {
      name: 'notes.md',
      size: 42,
      contentType: 'text/markdown',
    })
    const done = await world.member.call('POST', `/files/${presigned.body.fileId}/complete`)
    expect(done.status).toBe(200)
    expect(done.body.file.ext).toBe('MD')
    expect(done.body.file.uploadedBy.id).toBe(world.member.user.id)

    const detail = await world.member.call('GET', `/tasks/${taskId}`)
    expect(detail.body.task.files).toHaveLength(1)
    expect(detail.body.task.fileCount).toBe(1)

    const listed = await world.member.call('GET', `/workspaces/${world.workspace.id}/files`)
    expect(listed.body.files[0].taskRef).toBe(`${world.workspace.prefix}-101`)
  })
})

describe('download URLs', () => {
  test('inline for a preview, attachment for a download, both with the real name', async () => {
    const world = await scenario()
    const taskId = await taskIn(world)
    const presigned = await world.member.call('POST', `/tasks/${taskId}/files`, {
      name: 'quarterly report.pdf',
      size: 100,
      contentType: 'application/pdf',
    })
    await world.member.call('POST', `/files/${presigned.body.fileId}/complete`)

    const inline = await world.member.call('GET', `/files/${presigned.body.fileId}/url`)
    const attachment = await world.member.call(
      'GET',
      `/files/${presigned.body.fileId}/url?disposition=attachment`,
    )

    const dispositionOf = (value: string) =>
      new URL(value).searchParams.get('response-content-disposition')

    expect(dispositionOf(inline.body.url)).toBe('inline; filename="quarterly report.pdf"')
    expect(dispositionOf(attachment.body.url)).toBe(
      'attachment; filename="quarterly report.pdf"',
    )
  })

  test('a viewer may download but not delete', async () => {
    const world = await scenario()
    const taskId = await taskIn(world)
    const presigned = await world.member.call('POST', `/tasks/${taskId}/files`, {
      name: 'shared.txt',
      size: 5,
      contentType: 'text/plain',
    })
    await world.member.call('POST', `/files/${presigned.body.fileId}/complete`)

    expect((await world.viewer.call('GET', `/files/${presigned.body.fileId}/url`)).status).toBe(200)
    expect((await world.viewer.call('DELETE', `/files/${presigned.body.fileId}`)).status).toBe(403)
  })

  test('someone outside the workspace gets nothing', async () => {
    const world = await scenario()
    const outsider = await scenario()
    const taskId = await taskIn(world)
    const presigned = await world.member.call('POST', `/tasks/${taskId}/files`, {
      name: 'secret.txt',
      size: 5,
      contentType: 'text/plain',
    })
    await world.member.call('POST', `/files/${presigned.body.fileId}/complete`)

    expect((await outsider.admin.call('GET', `/files/${presigned.body.fileId}/url`)).status).toBe(404)
  })
})
