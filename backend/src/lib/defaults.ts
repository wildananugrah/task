/** What a brand-new workspace starts with, matching the design's default board. */
export const DEFAULT_STATUSES = [
  { name: 'Backlog', color: '#8c8c8c' },
  { name: 'In Progress', color: '#2f6f9f' },
  { name: 'Review', color: '#8a6d1f' },
  { name: 'Blocked', color: '#a5342f' },
  { name: 'Done', color: '#1f7a5a' },
]

export const DEFAULT_LABELS = ['Docs', 'Bug', 'Design', 'Infra', 'Ops']

/** Task numbers start here so an empty workspace promises PREFIX-101. */
export const FIRST_TASK_NUMBER = 101
