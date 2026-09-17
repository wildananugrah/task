import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { statuses as statusesTable, workspaces } from '../src/db/schema'
import { DEFAULT_LABELS, DEFAULT_STATUSES } from '../src/lib/defaults'
import { callerFor, makeUser, scenario, tokenFor, unique } from './helpers'

async function freshCaller() {
  const user = await makeUser()
  return { user, call: callerFor(await tokenFor(user.id, user.email)) }
}

describe('creating a workspace', () => {
  test('arrives furnished: statuses, labels, an admin and a team room', async () => {
    const { user, call } = await freshCaller()

    const created = await call('POST', '/workspaces', { name: 'Product Refresh', prefix: 'prf' })
    expect(created.status).toBe(201)
    expect(created.body.workspace.prefix).toBe('PRF')
    expect(created.body.workspace.initials).toBe('PR')
    expect(created.body.workspace.role).toBe('admin')
    expect(created.body.statuses.map((status: any) => status.name)).toEqual(
      DEFAULT_STATUSES.map((status) => status.name),
    )
    expect(created.body.labels.map((label: any) => label.name).sort()).toEqual(
      [...DEFAULT_LABELS].sort(),
    )
    expect(created.body.tasks).toHaveLength(0)

    const conversations = await call('GET', '/conversations')
    expect(
      conversations.body.conversations.some(
        (conversation: any) => conversation.workspaceId === created.body.workspace.id,
      ),
    ).toBe(true)

    const cards = await call('GET', '/bootstrap')
    expect(cards.body.workspaces).toHaveLength(1)
    expect(cards.body.workspaces[0].people.map((person: any) => person.id)).toEqual([user.id])
  })

  test('a bad name or prefix is refused with the field named', async () => {
    const { call } = await freshCaller()
    expect((await call('POST', '/workspaces', { name: '', prefix: 'ABC' })).status).toBe(400)
    expect((await call('POST', '/workspaces', { name: 'Fine', prefix: 'AB' })).status).toBe(400)
    expect((await call('POST', '/workspaces', { name: 'Fine', prefix: 'A1C' })).status).toBe(400)
  })
})

describe('status order', () => {
  test('reordering rewrites positions and the list comes back in that order', async () => {
    const { workspace, statuses, admin } = await scenario()
    const reversed = [...statuses].reverse().map((status) => status.id)

    const result = await admin.call('POST', `/workspaces/${workspace.id}/statuses/reorder`, {
      ids: reversed,
    })
    expect(result.status).toBe(200)
    expect(result.body.statuses.map((status: any) => status.id)).toEqual(reversed)

    const payload = await admin.call('GET', `/workspaces/${workspace.id}`)
    expect(payload.body.statuses.map((status: any) => status.id)).toEqual(reversed)

    const rows = await db
      .select()
      .from(statusesTable)
      .where(eq(statusesTable.workspaceId, workspace.id))
    expect(rows.find((row) => row.id === reversed[0])!.position).toBe(0)
  })

  test('a partial reorder is refused rather than silently applied', async () => {
    const { workspace, statuses, admin } = await scenario()
    const result = await admin.call('POST', `/workspaces/${workspace.id}/statuses/reorder`, {
      ids: [statuses[0]!.id, statuses[1]!.id],
    })
    expect(result.status).toBe(400)
  })

  test('a new status lands at the end', async () => {
    const { workspace, statuses, admin } = await scenario()
    const created = await admin.call('POST', `/workspaces/${workspace.id}/statuses`, {
      name: 'Triage',
      color: '#2f6f9f',
    })
    expect(created.body.status.position).toBe(statuses.length)
  })
})

describe('labels', () => {
  test('the same label twice is a conflict, not a duplicate row', async () => {
    const { workspace, admin } = await scenario()
    const name = unique('Label')
    expect((await admin.call('POST', `/workspaces/${workspace.id}/labels`, { name })).status).toBe(201)
    const again = await admin.call('POST', `/workspaces/${workspace.id}/labels`, { name })
    expect(again.status).toBe(409)
    expect(again.body.error.detail.name).toBe(name)
  })

  test('deleting a label takes it off the tasks that used it', async () => {
    const { workspace, labels, admin, member } = await scenario()
    const docs = labels.find((label) => label.name === 'Docs')!

    const created = await member.call('POST', `/workspaces/${workspace.id}/tasks`, {
      title: 'Tagged',
      labels: ['Docs'],
    })
    expect(created.body.task.labels).toEqual(['Docs'])

    await admin.call('DELETE', `/labels/${docs.id}`)

    const after = await member.call('GET', `/tasks/${created.body.task.id}`)
    expect(after.body.task.labels).toEqual([])
  })
})

describe('archive and delete', () => {
  test('archiving hides the workspace from the list but keeps its rows', async () => {
    const { workspace, admin, member } = await scenario()
    await member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'Kept' })

    expect((await admin.call('POST', `/workspaces/${workspace.id}/archive`)).status).toBe(200)

    const cards = await admin.call('GET', '/bootstrap')
    expect(cards.body.workspaces.map((card: any) => card.id)).not.toContain(workspace.id)
    expect((await admin.call('GET', `/workspaces/${workspace.id}`)).status).toBe(404)

    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id))
    expect(row!.archivedAt).not.toBeNull()

    // An admin can put it back.
    expect((await admin.call('POST', `/workspaces/${workspace.id}/restore`)).status).toBe(200)
    const restored = await admin.call('GET', `/workspaces/${workspace.id}`)
    expect(restored.status).toBe(200)
    expect(restored.body.tasks).toHaveLength(1)
  })

  test('deleting really removes it, tasks and all', async () => {
    const { workspace, admin, member } = await scenario()
    await member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'Doomed' })

    expect((await admin.call('DELETE', `/workspaces/${workspace.id}`)).status).toBe(200)

    const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id))
    expect(rows).toHaveLength(0)
    expect((await admin.call('GET', `/workspaces/${workspace.id}`)).status).toBe(404)
  })
})
