// Derivations over app state. Kept as plain functions so components can read
// exactly what they need without the store growing a view model.

import { isOverdue, todayIso } from './format'

export const statusOf = (state, id) =>
  state.statuses.find((status) => status.id === id) || state.statuses[0] || FALLBACK_STATUS

const FALLBACK_STATUS = { id: null, name: 'No status', color: '#8c8c8c' }

const FALLBACK_MEMBER = { userId: null, name: 'Unassigned', initials: '··', color: '#c4c4c2' }

/** Members are addressed by the user they belong to; a pending invite has none. */
export const memberOf = (state, userId) =>
  state.members.find((member) => member.userId === userId) || FALLBACK_MEMBER

export const assignableMembers = (state) =>
  state.members.filter((member) => member.userId && member.status === 'active')

export const currentWorkspace = (state) => state.workspace

export const taskById = (state, id) => state.tasks.find((task) => task.id === id) || null

export const selectedTask = (state) => (state.selId ? taskById(state, state.selId) : null)

/** Files and comments arrive with the task detail, fetched when the drawer opens. */
export const detailOf = (state, taskId) => state.details[taskId] ?? null

export function statusCounts(state) {
  const counts = {}
  state.tasks.forEach((task) => {
    counts[task.statusId] = (counts[task.statusId] || 0) + 1
  })
  return counts
}

function matchesDue(task, dueFilter) {
  switch (dueFilter) {
    case 'overdue':
      return isOverdue(task.dueDate)
    case 'set':
      return Boolean(task.dueDate)
    case 'none':
      return !task.dueDate
    case 'week': {
      if (!task.dueDate) return false
      const end = new Date()
      end.setDate(end.getDate() + 7)
      return task.dueDate >= todayIso() && task.dueDate <= end.toISOString().slice(0, 10)
    }
    case 'month': {
      if (!task.dueDate) return false
      return task.dueDate.slice(0, 7) === todayIso().slice(0, 7)
    }
    default:
      return true
  }
}

export function filteredTasks(state) {
  const query = state.query.trim().toLowerCase()

  return state.tasks.filter((task) => {
    if (state.statusFilter && task.statusId !== state.statusFilter) return false
    if (state.assigneeFilter && task.assigneeId !== state.assigneeFilter) return false
    if (state.labelFilter && !task.labels.includes(state.labelFilter)) return false
    if (state.dueFilter && !matchesDue(task, state.dueFilter)) return false
    if (!query) return true
    return task.title.toLowerCase().includes(query) || task.ref.toLowerCase().includes(query)
  })
}

export const hasActiveFilter = (state) =>
  Boolean(
    state.statusFilter ||
      state.assigneeFilter ||
      state.labelFilter ||
      state.dueFilter ||
      state.query,
  )

export function workspaceFiles(state) {
  const query = state.fq.trim().toLowerCase()
  if (!query) return state.files
  return state.files.filter(
    (file) =>
      file.name.toLowerCase().includes(query) || file.ext.toLowerCase().includes(query),
  )
}

export const workspaceFileCount = (state) => state.files.length

/** A /TSK-104 token only becomes a link when it names a task we can actually open. */
export function taskByRef(state, ref) {
  return (
    state.tasks.find((task) => task.ref === ref) ||
    state.searchResults.find((task) => task.ref === ref) ||
    state.refIndex[ref] ||
    null
  )
}

/* — permissions, mirrored from the server so the UI hides what it must — */

const RANK = { viewer: 0, member: 1, admin: 2 }

export const can = (state, level) => RANK[state.workspace?.role ?? 'viewer'] >= RANK[level]

export const canEdit = (state) => can(state, 'member')
export const canAdmin = (state) => can(state, 'admin')

/** Workspace cards on the home screen: counts, share bars and member chips. */
export function workspaceSummary(card) {
  const total = card.counts.total || 1
  const share = (name) => `${Math.round(((card.counts.byStatus?.[name] ?? 0) / total) * 100)}%`

  return {
    open: card.counts.open,
    done: card.counts.done,
    empty: card.counts.total === 0,
    people: card.people,
    bars: [
      { key: 'progress', width: share('in progress'), color: '#171717' },
      { key: 'review', width: share('review'), color: '#575757' },
      { key: 'done', width: share('done'), color: '#a3a3a3' },
    ],
  }
}
