import { describe, expect, test } from 'bun:test'
import { and, eq } from 'drizzle-orm'
import { db } from '../src/db/client'
import { tasks, workspaces } from '../src/db/schema'
import { scenario } from './helpers'

describe('task numbering', () => {
  test('starts at 101 and increments per workspace', async () => {
    const { workspace, member } = await scenario()

    const first = await member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'One' })
    const second = await member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'Two' })

    expect(first.body.task.number).toBe(101)
    expect(second.body.task.number).toBe(102)
    expect(first.body.task.ref).toBe(`${workspace.prefix}-101`)
  })

  test('numbers are per workspace, not global', async () => {
    const a = await scenario()
    const b = await scenario()

    await a.member.call('POST', `/workspaces/${a.workspace.id}/tasks`, { title: 'A' })
    const inB = await b.member.call('POST', `/workspaces/${b.workspace.id}/tasks`, { title: 'B' })

    expect(inB.body.task.number).toBe(101)
  })

  /**
   * The allocation reads max()+1 outside a lock, so simultaneous creates can
   * pick the same number; the unique index rejects the loser and the insert
   * retries. This is the test that the retry actually works.
   */
  test('concurrent creates never collide or skip', async () => {
    const { workspace, member } = await scenario()

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: `Race ${index}` }),
      ),
    )

    expect(results.every((result) => result.status === 201)).toBe(true)
    const numbers = results.map((result) => result.body.task.number).sort((a, b) => a - b)
    expect(new Set(numbers).size).toBe(12)
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, index) => 101 + index))
  })
})

describe('task ids follow the workspace prefix', () => {
  test('changing the prefix renumbers every task without touching a row', async () => {
    const { workspace, admin, member } = await scenario()
    const created = await member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'X' })
    expect(created.body.task.ref).toBe(`${workspace.prefix}-101`)

    await admin.call('PATCH', `/workspaces/${workspace.id}`, { prefix: 'ZZZ' })

    const after = await member.call('GET', `/workspaces/${workspace.id}`)
    expect(after.body.tasks[0].ref).toBe('ZZZ-101')

    // The stored row still only knows its number; the id is derived.
    const [row] = await db.select().from(tasks).where(eq(tasks.id, created.body.task.id))
    expect(row!.number).toBe(101)
    expect(Object.keys(row!)).not.toContain('ref')
  })

  test('a prefix that is not three letters is refused', async () => {
    const { workspace, admin } = await scenario()
    const result = await admin.call('PATCH', `/workspaces/${workspace.id}`, { prefix: 'TOOLONG' })
    expect(result.status).toBe(400)

    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id))
    expect(row!.prefix).toBe(workspace.prefix)
  })
})

describe('task edits', () => {
  test('labels are created on demand and replaced wholesale', async () => {
    const { workspace, member } = await scenario()
    const created = await member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'L' })
    const id = created.body.task.id

    const withLabels = await member.call('PATCH', `/tasks/${id}`, { labels: ['Docs', 'Brand new'] })
    expect(withLabels.body.task.labels).toEqual(['Brand new', 'Docs'])

    const fewer = await member.call('PATCH', `/tasks/${id}`, { labels: ['Docs'] })
    expect(fewer.body.task.labels).toEqual(['Docs'])
  })

  test('a due date stays a calendar day, not an instant', async () => {
    const { workspace, member } = await scenario()
    const created = await member.call('POST', `/workspaces/${workspace.id}/tasks`, {
      title: 'Due',
      dueDate: '2027-01-01',
    })
    expect(created.body.task.dueDate).toBe('2027-01-01')

    const reread = await member.call('GET', `/tasks/${created.body.task.id}`)
    expect(reread.body.task.dueDate).toBe('2027-01-01')
  })

  test('an assignee from another workspace is refused', async () => {
    const a = await scenario()
    const b = await scenario()
    const created = await a.member.call('POST', `/workspaces/${a.workspace.id}/tasks`, { title: 'A' })

    const result = await a.member.call('PATCH', `/tasks/${created.body.task.id}`, {
      assigneeId: b.member.user.id,
    })
    expect(result.status).toBe(400)
  })

  test('deleting a status moves its tasks rather than orphaning them', async () => {
    const { workspace, statuses: columns, admin, member } = await scenario()
    const created = await member.call('POST', `/workspaces/${workspace.id}/tasks`, {
      title: 'Homeless',
      statusId: columns[2]!.id,
    })

    const removed = await admin.call('DELETE', `/statuses/${columns[2]!.id}`)
    expect(removed.status).toBe(200)

    const [row] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, created.body.task.id)))
    expect(row!.statusId).toBe(removed.body.movedTo)
    expect(row!.statusId).not.toBeNull()
  })
})
