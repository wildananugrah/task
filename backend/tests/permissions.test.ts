import { describe, expect, test } from 'bun:test'
import { scenario } from './helpers'

/**
 * The UI hides what a viewer cannot do, but hiding a button is presentation.
 * These are the rules, checked where they are actually enforced.
 */
describe('roles', () => {
  test('a viewer can read everything and change nothing', async () => {
    const { workspace, statuses, viewer, member } = await scenario()
    const created = await member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'T' })
    const taskId = created.body.task.id

    expect((await viewer.call('GET', `/workspaces/${workspace.id}`)).status).toBe(200)
    expect((await viewer.call('GET', `/tasks/${taskId}`)).status).toBe(200)
    expect((await viewer.call('GET', `/workspaces/${workspace.id}/files`)).status).toBe(200)

    expect((await viewer.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'No' })).status).toBe(403)
    expect((await viewer.call('PATCH', `/tasks/${taskId}`, { title: 'No' })).status).toBe(403)
    expect((await viewer.call('DELETE', `/tasks/${taskId}`)).status).toBe(403)
    expect((await viewer.call('POST', `/tasks/${taskId}/comments`, { body: 'No' })).status).toBe(403)
    expect((await viewer.call('POST', `/tasks/${taskId}/files`, { name: 'a.txt', size: 1 })).status).toBe(403)
    expect((await viewer.call('PATCH', `/statuses/${statuses[0]!.id}`, { name: 'No' })).status).toBe(403)
  })

  test('a member owns the tasks but not the settings', async () => {
    const { workspace, statuses, labels, member } = await scenario()

    expect((await member.call('POST', `/workspaces/${workspace.id}/tasks`, { title: 'Yes' })).status).toBe(201)

    expect((await member.call('PATCH', `/workspaces/${workspace.id}`, { name: 'No' })).status).toBe(403)
    expect((await member.call('POST', `/workspaces/${workspace.id}/statuses`, {})).status).toBe(403)
    expect((await member.call('PATCH', `/statuses/${statuses[0]!.id}`, { name: 'No' })).status).toBe(403)
    expect((await member.call('DELETE', `/labels/${labels[0]!.id}`)).status).toBe(403)
    expect((await member.call('POST', `/workspaces/${workspace.id}/members`, { emails: ['x@y.co'] })).status).toBe(403)
    expect((await member.call('DELETE', `/workspaces/${workspace.id}`)).status).toBe(403)
  })

  test('an admin can do all of it', async () => {
    const { workspace, admin } = await scenario()
    expect((await admin.call('PATCH', `/workspaces/${workspace.id}`, { name: 'Renamed' })).status).toBe(200)
    expect((await admin.call('POST', `/workspaces/${workspace.id}/statuses`, {})).status).toBe(201)
    expect((await admin.call('POST', `/workspaces/${workspace.id}/labels`, { name: 'New' })).status).toBe(201)
  })
})

describe('workspace isolation', () => {
  test('a workspace you are not in is not found, not forbidden', async () => {
    const mine = await scenario()
    const theirs = await scenario()

    // 404 rather than 403 on purpose: membership is not something an outsider
    // gets to probe for by watching the status code change.
    const result = await mine.admin.call('GET', `/workspaces/${theirs.workspace.id}`)
    expect(result.status).toBe(404)
  })

  test("a task in someone else's workspace cannot be read or edited", async () => {
    const mine = await scenario()
    const theirs = await scenario()
    const created = await theirs.member.call('POST', `/workspaces/${theirs.workspace.id}/tasks`, {
      title: 'Private',
    })

    expect((await mine.admin.call('GET', `/tasks/${created.body.task.id}`)).status).toBe(404)
    expect((await mine.admin.call('PATCH', `/tasks/${created.body.task.id}`, { title: 'x' })).status).toBe(404)
  })

  test('global search only reaches workspaces you belong to', async () => {
    const mine = await scenario()
    const theirs = await scenario()
    await theirs.member.call('POST', `/workspaces/${theirs.workspace.id}/tasks`, {
      title: 'Zebra particular secret',
    })
    await mine.member.call('POST', `/workspaces/${mine.workspace.id}/tasks`, {
      title: 'Zebra particular mine',
    })

    const result = await mine.admin.call('GET', '/search?q=zebra%20particular')
    expect(result.status).toBe(200)
    expect(result.body.tasks).toHaveLength(1)
    expect(result.body.tasks[0].title).toBe('Zebra particular mine')
  })

  test('signing out and calling anything is a 401', async () => {
    const { workspace } = await scenario()
    const { callerFor } = await import('./helpers')
    const anonymous = callerFor('not-a-real-token')
    expect((await anonymous('GET', `/workspaces/${workspace.id}`)).status).toBe(401)
    expect((await anonymous('GET', '/bootstrap')).status).toBe(401)
  })
})

describe('a workspace keeps at least one admin', () => {
  test('the last admin cannot be demoted', async () => {
    const { admin } = await scenario()
    const result = await admin.call('PATCH', `/members/${admin.membershipId}`, { role: 'member' })
    expect(result.status).toBe(409)
  })

  test('the last admin cannot be removed', async () => {
    const { admin } = await scenario()
    const result = await admin.call('DELETE', `/members/${admin.membershipId}`)
    expect(result.status).toBe(409)
  })

  test('demotion is allowed once a second admin exists', async () => {
    const { workspace, admin, member } = await scenario()
    expect((await admin.call('PATCH', `/members/${member.membershipId}`, { role: 'admin' })).status).toBe(200)
    expect((await admin.call('PATCH', `/members/${admin.membershipId}`, { role: 'member' })).status).toBe(200)

    // And the demotion really took effect.
    expect((await admin.call('POST', `/workspaces/${workspace.id}/statuses`, {})).status).toBe(403)
  })
})

describe('a workspace keeps at least one status', () => {
  test('deleting the last status is refused', async () => {
    const { statuses, admin } = await scenario()
    for (const status of statuses.slice(0, -1)) {
      expect((await admin.call('DELETE', `/statuses/${status.id}`)).status).toBe(200)
    }
    const last = await admin.call('DELETE', `/statuses/${statuses.at(-1)!.id}`)
    expect(last.status).toBe(409)
  })
})
