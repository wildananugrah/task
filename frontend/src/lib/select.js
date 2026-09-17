// Derivations over app state. Kept as plain functions so components can read
// exactly what they need without the store growing a view model.

export const statusOf = (state, id) =>
  state.statuses.find((status) => status.id === id) || state.statuses[0]

export const memberOf = (state, id) =>
  state.members.find((member) => member.id === id) || state.members[0]

export const workspaceOf = (state, id) =>
  state.workspaces.find((workspace) => workspace.id === id) || state.workspaces[0]

export const currentWorkspace = (state) => workspaceOf(state, state.wsId)

export const workspaceTasks = (state) => {
  const wsId = state.wsId || 'work'
  return state.tasks.filter((task) => task.ws === wsId)
}

export const taskById = (state, id) => state.tasks.find((task) => task.id === id) || null

export const selectedTask = (state) => (state.selId ? taskById(state, state.selId) : null)

export function statusCounts(state) {
  const counts = {}
  workspaceTasks(state).forEach((task) => {
    counts[task.status] = (counts[task.status] || 0) + 1
  })
  return counts
}

function matchesDue(task, dueFilter) {
  switch (dueFilter) {
    case 'overdue':
      return task.overdue
    case 'set':
      return task.due !== '—'
    case 'none':
      return task.due === '—'
    case 'sep':
      return task.due.startsWith('Sep')
    case 'oct':
      return task.due.startsWith('Oct')
    default:
      return true
  }
}

export function filteredTasks(state) {
  const query = state.query.trim().toLowerCase()

  return workspaceTasks(state).filter((task) => {
    if (state.statusFilter && task.status !== state.statusFilter) return false
    if (state.assigneeFilter && task.assignee !== state.assigneeFilter) return false
    if (state.labelFilter && !task.labels.includes(state.labelFilter)) return false
    if (state.dueFilter && !matchesDue(task, state.dueFilter)) return false
    if (!query) return true
    return task.title.toLowerCase().includes(query) || task.id.toLowerCase().includes(query)
  })
}

export const hasActiveFilter = (state) =>
  Boolean(
    state.statusFilter || state.assigneeFilter || state.labelFilter || state.dueFilter || state.query,
  )

export function workspaceFiles(state) {
  const query = state.fq.trim().toLowerCase()
  const files = []

  workspaceTasks(state).forEach((task) => {
    task.files.forEach((file, index) => {
      if (query && !file.name.toLowerCase().includes(query) && !file.ext.toLowerCase().includes(query)) {
        return
      }
      files.push({ ...file, index, taskId: task.id, taskTitle: task.title })
    })
  })

  return files
}

export const workspaceFileCount = (state) =>
  workspaceTasks(state).reduce((total, task) => total + task.files.length, 0)

export function globalMatches(state) {
  const query = state.gq.trim().toLowerCase()
  if (!query) return []
  return state.tasks.filter(
    (task) => task.id.toLowerCase().includes(query) || task.title.toLowerCase().includes(query),
  )
}

export function nextTaskNumber(tasks) {
  if (!tasks.length) return 101
  return Math.max(...tasks.map((task) => task.num)) + 1
}

/** Workspace cards on the home screen: counts, share bars and member chips. */
export function workspaceSummary(state, workspace, members) {
  const own = state.tasks.filter((task) => task.ws === workspace.id)
  const open = own.filter((task) => task.status !== 'done').length
  const done = own.filter((task) => task.status === 'done').length
  const total = own.length || 1
  const share = (statusId) =>
    `${Math.round((own.filter((task) => task.status === statusId).length / total) * 100)}%`

  return {
    open,
    done,
    empty: own.length === 0,
    people: workspace.people.map((index) => members[index]).filter(Boolean),
    bars: [
      { width: share('progress'), color: '#171717' },
      { width: share('review'), color: '#575757' },
      { width: share('done'), color: '#a3a3a3' },
    ],
  }
}
