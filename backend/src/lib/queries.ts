/**
 * The read side. Each function answers one screen in as few round-trips as the
 * shape allows — the task list is one query plus two aggregate joins rather than
 * a query per task, because a 40-task board should not be 120 statements.
 */
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client'
import {
  comments,
  files,
  labels,
  statuses,
  taskLabels,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '../db/schema'
import {
  shapeComment,
  shapeFile,
  shapeLabel,
  shapeMember,
  shapeStatus,
  shapeTask,
  shapeUser,
  taskRef,
} from './shape'
import { presignDownload } from './s3'

export async function listWorkspaceCards(userId: string) {
  const rows = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, 'active'),
      ),
    )
    .where(isNull(workspaces.archivedAt))
    .orderBy(asc(workspaces.createdAt))

  if (!rows.length) return []
  const ids = rows.map((row) => row.workspace.id)

  // Counts per status bucket for the share bars, in one pass over the tasks.
  const taskRows = await db
    .select({
      workspaceId: tasks.workspaceId,
      statusName: statuses.name,
      total: count(),
    })
    .from(tasks)
    .leftJoin(statuses, eq(statuses.id, tasks.statusId))
    .where(inArray(tasks.workspaceId, ids))
    .groupBy(tasks.workspaceId, statuses.name)

  const peopleRows = await db
    .select({ workspaceId: workspaceMembers.workspaceId, user: users })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(inArray(workspaceMembers.workspaceId, ids), eq(workspaceMembers.status, 'active')),
    )
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.email))

  return rows.map((row) => {
    const own = taskRows.filter((task) => task.workspaceId === row.workspace.id)
    const byStatus: Record<string, number> = {}
    let total = 0
    for (const bucket of own) {
      byStatus[(bucket.statusName ?? 'None').toLowerCase()] = bucket.total
      total += bucket.total
    }
    const done = byStatus.done ?? 0

    return {
      id: row.workspace.id,
      name: row.workspace.name,
      initials: row.workspace.initials,
      prefix: row.workspace.prefix,
      color: row.workspace.color,
      description: row.workspace.description,
      logoUrl: row.workspace.logoKey
        ? presignDownload(row.workspace.logoKey, 'logo', 'inline')
        : null,
      role: row.role,
      counts: { total, done, open: total - done, byStatus },
      people: peopleRows
        .filter((person) => person.workspaceId === row.workspace.id)
        .map((person) => shapeUser(person.user)),
    }
  })
}

/** Everything the tasks / files / settings screens read for one workspace. */
export async function workspacePayload(workspaceId: string, prefix: string) {
  const [statusRows, labelRows, memberRows, taskRows, labelLinks, fileCounts, commentCounts] =
    await Promise.all([
      db
        .select()
        .from(statuses)
        .where(eq(statuses.workspaceId, workspaceId))
        .orderBy(asc(statuses.position), asc(statuses.createdAt)),
      db.select().from(labels).where(eq(labels.workspaceId, workspaceId)).orderBy(asc(labels.name)),
      db
        .select({ member: workspaceMembers, user: users })
        .from(workspaceMembers)
        .leftJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.email)),
      db
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, workspaceId))
        .orderBy(desc(tasks.number)),
      db
        .select({ taskId: taskLabels.taskId, name: labels.name })
        .from(taskLabels)
        .innerJoin(labels, eq(labels.id, taskLabels.labelId))
        .innerJoin(tasks, eq(tasks.id, taskLabels.taskId))
        .where(eq(tasks.workspaceId, workspaceId)),
      db
        .select({ taskId: files.taskId, total: count() })
        .from(files)
        .where(and(eq(files.workspaceId, workspaceId), eq(files.state, 'ready')))
        .groupBy(files.taskId),
      db
        .select({ taskId: comments.taskId, total: count() })
        .from(comments)
        .innerJoin(tasks, eq(tasks.id, comments.taskId))
        .where(eq(tasks.workspaceId, workspaceId))
        .groupBy(comments.taskId),
    ])

  const labelsByTask = new Map<string, string[]>()
  for (const link of labelLinks) {
    const list = labelsByTask.get(link.taskId) ?? []
    list.push(link.name)
    labelsByTask.set(link.taskId, list)
  }
  const filesByTask = new Map(fileCounts.map((row) => [row.taskId ?? '', row.total]))
  const commentsByTask = new Map(commentCounts.map((row) => [row.taskId, row.total]))

  return {
    statuses: statusRows.map(shapeStatus),
    labels: labelRows.map(shapeLabel),
    members: memberRows.map((row) => shapeMember(row.member, row.user)),
    tasks: taskRows.map((task) =>
      shapeTask(task, {
        prefix,
        labels: (labelsByTask.get(task.id) ?? []).sort(),
        fileCount: filesByTask.get(task.id) ?? 0,
        commentCount: commentsByTask.get(task.id) ?? 0,
      }),
    ),
  }
}

export async function taskComments(taskId: string) {
  const rows = await db
    .select({ comment: comments, author: users })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.createdAt))
  return rows.map((row) => shapeComment(row.comment, row.author))
}

export async function taskFiles(taskId: string) {
  const rows = await db
    .select({ file: files, uploader: users })
    .from(files)
    .leftJoin(users, eq(users.id, files.uploadedBy))
    .where(and(eq(files.taskId, taskId), eq(files.state, 'ready')))
    .orderBy(asc(files.createdAt))
  return rows.map((row) => shapeFile(row.file, { uploader: row.uploader }))
}

export async function taskLabelNames(taskId: string) {
  const rows = await db
    .select({ name: labels.name })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(eq(taskLabels.taskId, taskId))
  return rows.map((row) => row.name).sort()
}

export async function workspaceFiles(workspaceId: string, prefix: string, query?: string) {
  const needle = query?.trim().toLowerCase()
  const rows = await db
    .select({ file: files, uploader: users, task: tasks })
    .from(files)
    .leftJoin(users, eq(users.id, files.uploadedBy))
    .leftJoin(tasks, eq(tasks.id, files.taskId))
    .where(and(eq(files.workspaceId, workspaceId), eq(files.state, 'ready')))
    .orderBy(desc(files.createdAt))

  return rows
    .filter((row) =>
      needle
        ? row.file.name.toLowerCase().includes(needle) ||
          row.file.ext.toLowerCase().includes(needle)
        : true,
    )
    .map((row) =>
      shapeFile(row.file, {
        uploader: row.uploader,
        taskRef: row.task ? taskRef(prefix, row.task.number) : null,
        taskTitle: row.task?.title ?? null,
      }),
    )
}

/** Global search: every workspace the person actually belongs to, nothing else. */
export async function searchTasks(userId: string, query: string, limit = 20) {
  const needle = `%${query.trim().toLowerCase()}%`

  const rows = await db
    .select({ task: tasks, workspace: workspaces, status: statuses, assignee: users })
    .from(tasks)
    .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.status, 'active'),
      ),
    )
    .leftJoin(statuses, eq(statuses.id, tasks.statusId))
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .where(
      and(
        isNull(workspaces.archivedAt),
        sql`(lower(${tasks.title}) like ${needle} or lower(${workspaces.prefix} || '-' || ${tasks.number}) like ${needle})`,
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.task.id,
    ref: taskRef(row.workspace.prefix, row.task.number),
    title: row.task.title,
    workspaceId: row.workspace.id,
    workspaceName: row.workspace.name,
    status: row.status ? shapeStatus(row.status) : null,
    assignee: row.assignee ? shapeUser(row.assignee) : null,
  }))
}
