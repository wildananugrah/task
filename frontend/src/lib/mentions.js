import { statusOf, memberOf } from './select'

/**
 * Autocomplete rows for the "@" and "/" tokens shared by the comment box and
 * the chat composer. Comments only offer tasks from the open workspace; chat
 * can point at any task the person can see, which is what global search
 * already knows.
 */
export function mentionItems(state, token, scope = 'workspace') {
  if (!token) return []
  const query = token.query

  if (token.type === '@') {
    return state.members
      .filter((member) => !query || member.name.toLowerCase().startsWith(query))
      .slice(0, 5)
      .map((member) => ({
        key: member.id,
        label: member.name,
        sub: member.email,
        init: member.initials,
        color: member.color,
        radius: '50%',
        insert: `@${member.name}`,
      }))
  }

  const pool = scope === 'all' ? [...state.tasks, ...state.searchResults] : state.tasks
  const seen = new Set()

  return pool
    .filter((task) => {
      if (seen.has(task.id)) return false
      if (query && !task.ref.toLowerCase().includes(query) && !task.title.toLowerCase().includes(query)) {
        return false
      }
      seen.add(task.id)
      return true
    })
    .slice(0, 5)
    .map((task) => ({
      key: task.id,
      label: `${task.ref} · ${task.title}`,
      sub: subtitleFor(state, task),
      init: '#',
      color: '#1f1f1f',
      radius: '6px',
      insert: `/${task.ref}`,
    }))
}

function subtitleFor(state, task) {
  // A search result carries its own status and workspace; a task from the open
  // workspace is resolved against the store instead.
  if (task.workspaceName) return `${task.workspaceName} · ${task.status?.name ?? ''}`.trim()
  return `${statusOf(state, task.statusId).name} · ${memberOf(state, task.assigneeId).name}`
}

export const mentionHeader = (token) => (token?.type === '/' ? 'Link a task' : 'Mention someone')
