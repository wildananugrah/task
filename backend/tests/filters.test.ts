import { beforeAll, describe, expect, test } from 'bun:test'
import { scenario } from './helpers'

/** The list screen composes four filters and a search; they have to intersect. */
describe('task filters', () => {
  let world: Awaited<ReturnType<typeof scenario>>
  let list: (query: string) => Promise<any[]>

  const today = new Date()
  const iso = (offsetDays: number) => {
    const date = new Date(today)
    date.setDate(date.getDate() + offsetDays)
    return date.toISOString().slice(0, 10)
  }

  beforeAll(async () => {
    world = await scenario()
    const { workspace, statuses, member, admin, viewer } = world

    const make = (body: Record<string, unknown>) =>
      member.call('POST', `/workspaces/${workspace.id}/tasks`, body)

    await make({
      title: 'Overdue backlog doc',
      statusId: statuses[0]!.id,
      assigneeId: member.user.id,
      dueDate: iso(-3),
      labels: ['Docs'],
    })
    await make({
      title: 'Soon in progress bug',
      statusId: statuses[1]!.id,
      assigneeId: admin.user.id,
      dueDate: iso(3),
      labels: ['Bug'],
    })
    await make({
      title: 'Far away review doc',
      statusId: statuses[2]!.id,
      assigneeId: viewer.user.id,
      dueDate: iso(120),
      labels: ['Docs'],
    })
    await make({ title: 'No due date at all', statusId: statuses[0]!.id, assigneeId: member.user.id })

    list = async (query: string) => {
      const result = await member.call('GET', `/workspaces/${workspace.id}/tasks${query}`)
      expect(result.status).toBe(200)
      return result.body.tasks
    }
  })

  test('no filter returns everything, newest first', async () => {
    const tasks = await list('')
    expect(tasks).toHaveLength(4)
    expect(tasks[0].number).toBeGreaterThan(tasks[3].number)
  })

  test('status', async () => {
    const tasks = await list(`?status=${world.statuses[0]!.id}`)
    expect(tasks.map((task) => task.title).sort()).toEqual([
      'No due date at all',
      'Overdue backlog doc',
    ])
  })

  test('assignee', async () => {
    const tasks = await list(`?assignee=${world.admin.user.id}`)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Soon in progress bug')
  })

  test('label', async () => {
    const tasks = await list('?label=Docs')
    expect(tasks).toHaveLength(2)
    expect(tasks.every((task: any) => task.labels.includes('Docs'))).toBe(true)
  })

  test('due date buckets', async () => {
    expect((await list('?due=overdue')).map((task: any) => task.title)).toEqual([
      'Overdue backlog doc',
    ])
    expect((await list('?due=none')).map((task: any) => task.title)).toEqual(['No due date at all'])
    expect(await list('?due=set')).toHaveLength(3)
    // "within 7 days" includes what is already late — that is still due.
    expect((await list('?due=week')).length).toBe(2)
  })

  test('free text matches the title or the derived task id', async () => {
    expect((await list('?q=bug')).map((task: any) => task.title)).toEqual(['Soon in progress bug'])

    const all = await list('')
    const ref = all[0].ref
    const byRef = await list(`?q=${encodeURIComponent(ref)}`)
    expect(byRef).toHaveLength(1)
    expect(byRef[0].ref).toBe(ref)
  })

  test('filters intersect rather than accumulate', async () => {
    const tasks = await list(`?label=Docs&status=${world.statuses[0]!.id}`)
    expect(tasks.map((task: any) => task.title)).toEqual(['Overdue backlog doc'])

    const none = await list(`?label=Bug&status=${world.statuses[0]!.id}`)
    expect(none).toHaveLength(0)
  })
})
