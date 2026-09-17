import { statusOf, memberOf, workspaceTasks } from './select'

/**
 * Autocomplete rows for the "@" and "/" tokens shared by the comment box and
 * the chat composer. Comments only offer tasks from the open workspace; chat
 * can point at any task the person can see.
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
        init: member.init,
        color: member.color,
        radius: '50%',
        insert: `@${member.name}`,
      }))
  }

  const pool = scope === 'all' ? state.tasks : workspaceTasks(state)

  return pool
    .filter(
      (task) =>
        !query || task.id.toLowerCase().includes(query) || task.title.toLowerCase().includes(query),
    )
    .slice(0, 5)
    .map((task) => ({
      key: task.id,
      label: `${task.id} · ${task.title}`,
      sub: `${statusOf(state, task.status).name} · ${memberOf(state, task.assignee).name}`,
      init: '#',
      color: '#1f1f1f',
      radius: '6px',
      insert: `/${task.id}`,
    }))
}

export const mentionHeader = (token) => (token?.type === '/' ? 'Link a task' : 'Mention someone')
