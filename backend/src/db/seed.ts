/**
 * Demo content, so a fresh database looks like the prototype did rather than
 * like an empty product. Idempotent: running it twice resets the demo data and
 * leaves anything else alone.
 *
 *   bun run db:seed
 */
import { and, eq, inArray } from 'drizzle-orm'
import { db, sql as rawSql } from './client'
import {
  comments,
  conversationMembers,
  conversations,
  labels as labelsTable,
  messages,
  statuses as statusesTable,
  tasks as tasksTable,
  taskLabels,
  users as usersTable,
  workspaceMembers,
  workspaces as workspacesTable,
} from './schema'
import { DEFAULT_LABELS, DEFAULT_STATUSES, FIRST_TASK_NUMBER } from '../lib/defaults'
import { colorFor, initialsFrom } from '../lib/identity'

const PEOPLE = [
  { email: 'iqbal@team.co', name: 'Iqbal' },
  { email: 'welby@team.co', name: 'Welby' },
  { email: 'shauma@team.co', name: 'Shauma' },
]

const WORKSPACES = [
  {
    key: 'work',
    name: 'Work workspace',
    prefix: 'TSK',
    color: '#171717',
    description: 'Day-to-day team tasks and delivery',
    roles: ['admin', 'admin', 'member'] as const,
  },
  {
    key: 'client',
    name: 'Client Delivery',
    prefix: 'CLD',
    color: '#4a4a4a',
    description: 'Scoped work for external accounts',
    roles: ['admin', 'admin', 'member'] as const,
  },
  {
    key: 'ops',
    name: 'Internal Ops',
    prefix: 'OPS',
    color: '#6e6e6e',
    description: 'Hiring, finance and admin',
    roles: ['member', 'admin', 'member'] as const,
  },
  {
    key: 'lab',
    name: 'Product Lab',
    prefix: 'PRF',
    color: '#8c8c8c',
    description: 'Experiments that are not committed yet',
    roles: ['viewer', 'admin', 'member'] as const,
  },
]

const TITLES = [
  'Buat document TSD',
  'Review API contract pembayaran',
  'Fix login redirect loop',
  'Setup staging environment',
  'Update onboarding copy',
  'Migrasi database ke Postgres 16',
  'Audit dependency vulnerabilities',
  'Design empty states for task list',
  'Write release notes v1.4',
  'Refactor auth middleware',
  'Add file upload size limit',
  'Integrasi Slack notification',
  'QA regression checklist',
  'Buat wireframe workspace settings',
  'Optimize task list query',
  'Set up error monitoring',
  'Draft privacy policy update',
  'Remove legacy export endpoint',
  'Add keyboard shortcuts',
  'Buat template email invite',
  'Cleanup unused feature flags',
  'Weekly metrics dashboard',
  'Fix timezone bug on due dates',
  'Rate limit comment endpoint',
  'Improve search relevance',
  'Buat SOP handover project',
  'Add bulk status update',
  'Compress uploaded images',
  'Document deployment steps',
  'Review vendor contract',
  'Add mention notifications',
  'Fix drag ghost on board',
  'Sprint planning Q4',
  'Buat laporan bulanan tim',
  'Archive completed workspaces',
  'Add CSV import for tasks',
  'Test restore from backup',
  'Update brand colors in app',
  'Accessibility pass on forms',
  'Retro notes September',
]

const DESCRIPTIONS = [
  'Draft the technical solution document so engineering and QA work from the same spec. Cover data model, endpoints, and rollout steps.',
  'Check the request and response shapes against what the vendor documented, then note anything that would break our current client.',
  'Reproduce on a clean profile first. Likely the session cookie is being set before the redirect resolves.',
  'Mirror production config with smaller instances. Seed with anonymised data so the team can click around safely.',
]

const STATUS_SEQUENCE = [
  1, 0, 2, 0, 4, 3, 0, 1, 4, 2, 0, 1, 3, 0, 1, 4, 0, 2, 1, 0, 4, 1, 3, 0, 2, 1, 0, 4, 2, 0, 1, 3, 1,
  0, 4, 0, 2, 1, 0, 4,
]

const COMMENT_BODIES = [
  'Draft is up in the files — @Welby can you check section 4?',
  'Blocked until /TSK-104 lands, then I will pick this back up.',
  'Updated the copy. Kept it short as discussed.',
]

/** Due dates relative to today, so the demo never reads as stale. */
function dueIn(days: number | null) {
  if (days === null) return null
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const DUE_OFFSETS = [-4, 2, 5, 9, 15, 22, null]

async function main() {
  console.log('seeding…')

  const people = []
  for (const person of PEOPLE) {
    const [row] = await db
      .insert(usersTable)
      .values({
        email: person.email,
        name: person.name,
        initials: initialsFrom(person.name),
        color: colorFor(person.email),
      })
      .onConflictDoUpdate({ target: usersTable.email, set: { name: person.name } })
      .returning()
    people.push(row!)
  }

  // Idempotent: drop the demo workspaces and rebuild them, leaving any real
  // workspace on this database untouched.
  const existing = await db
    .select({ id: workspacesTable.id })
    .from(workspacesTable)
    .where(
      inArray(
        workspacesTable.name,
        WORKSPACES.map((workspace) => workspace.name),
      ),
    )
  if (existing.length) {
    await db.delete(workspacesTable).where(
      inArray(
        workspacesTable.id,
        existing.map((row) => row.id),
      ),
    )
  }

  let index = 0

  for (const [workspaceIndex, definition] of WORKSPACES.entries()) {
    const [workspace] = await db
      .insert(workspacesTable)
      .values({
        name: definition.name,
        initials: initialsFrom(definition.name),
        prefix: definition.prefix,
        color: definition.color,
        description: definition.description,
        createdBy: people[0]!.id,
      })
      .returning()

    await db.insert(workspaceMembers).values(
      people.map((person, personIndex) => ({
        workspaceId: workspace!.id,
        userId: person.id,
        email: person.email,
        role: definition.roles[personIndex]!,
        status: 'active' as const,
      })),
    )

    const statusRows = await db
      .insert(statusesTable)
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
      .insert(labelsTable)
      .values(DEFAULT_LABELS.map((name) => ({ workspaceId: workspace!.id, name })))
      .returning()

    const titles = [
      TITLES,
      TITLES.slice(1, 13),
      TITLES.slice(16, 25),
      TITLES.slice(26, 33),
    ][workspaceIndex]!

    for (const [i, title] of titles.entries()) {
      const k = i + workspaceIndex * 3
      const status = statusRows[STATUS_SEQUENCE[k % 40] ?? 0]!
      const [task] = await db
        .insert(tasksTable)
        .values({
          workspaceId: workspace!.id,
          number: FIRST_TASK_NUMBER + i,
          title,
          description: DESCRIPTIONS[k % DESCRIPTIONS.length]!,
          statusId: status.id,
          assigneeId: people[k % people.length]!.id,
          dueDate: dueIn(DUE_OFFSETS[k % DUE_OFFSETS.length]!),
          createdBy: people[0]!.id,
        })
        .returning()

      if (k % 3 === 0) {
        await db
          .insert(taskLabels)
          .values({ taskId: task!.id, labelId: labelRows[k % labelRows.length]!.id })
      }

      const commentCount = k % 5 === 0 ? 3 : k % 2 === 0 ? 1 : 0
      for (let j = 0; j < commentCount; j += 1) {
        await db.insert(comments).values({
          taskId: task!.id,
          authorId: people[(k + j) % people.length]!.id,
          body: COMMENT_BODIES[j % COMMENT_BODIES.length]!,
        })
      }

      index += 1
    }

    const [room] = await db
      .insert(conversations)
      .values({ workspaceId: workspace!.id, kind: 'group', title: workspace!.name })
      .returning()
    await db
      .insert(conversationMembers)
      .values(people.map((person) => ({ conversationId: room!.id, userId: person.id })))

    if (workspaceIndex === 0) {
      await db.insert(messages).values([
        { conversationId: room!.id, authorId: people[1]!.id, body: 'Retro moved to Friday 4pm.' },
        {
          conversationId: room!.id,
          authorId: people[0]!.id,
          body: 'Works. I will bring notes from /TSK-140.',
        },
      ])
    }
  }

  // Rebuilt from scratch alongside the workspaces, or a second run would leave
  // the dock showing the same conversation twice.
  const demoDms = await db
    .selectDistinct({ id: conversations.id })
    .from(conversations)
    .innerJoin(conversationMembers, eq(conversationMembers.conversationId, conversations.id))
    .where(
      and(
        eq(conversations.kind, 'dm'),
        inArray(
          conversationMembers.userId,
          people.map((person) => person.id),
        ),
      ),
    )
  if (demoDms.length) {
    await db.delete(conversations).where(
      inArray(
        conversations.id,
        demoDms.map((row) => row.id),
      ),
    )
  }

  // Two DMs, so the messaging dock has something in it on first run.
  await seedDm(people[0]!.id, people[1]!.id, [
    [people[1]!.id, 'Can you look at /TSK-104 before standup?'],
    [people[0]!.id, 'Yes, reading it now. The staging box is up.'],
    [people[1]!.id, 'Nice. @Shauma also needs the diagram from there.'],
  ])
  await seedDm(people[0]!.id, people[2]!.id, [
    [people[2]!.id, 'Sent the wireframes, @Iqbal'],
    [people[0]!.id, 'Got them. Attaching to /TSK-114 so they do not get lost.'],
  ])

  console.log(`seeded ${WORKSPACES.length} workspaces, ${index} tasks, ${people.length} people`)
  console.log(`sign in as: ${PEOPLE.map((person) => person.email).join(', ')}`)
  await rawSql.close()
}

async function seedDm(a: string, b: string, lines: [string, string][]) {
  const [conversation] = await db.insert(conversations).values({ kind: 'dm' }).returning()
  await db.insert(conversationMembers).values([
    { conversationId: conversation!.id, userId: a },
    { conversationId: conversation!.id, userId: b },
  ])
  for (const [authorId, body] of lines) {
    await db.insert(messages).values({ conversationId: conversation!.id, authorId, body })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
