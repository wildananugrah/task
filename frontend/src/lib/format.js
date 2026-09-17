/**
 * Display formatting for the values the server sends as data: calendar dates,
 * byte counts and timestamps. The API deals in ISO strings and integers; the
 * shortening to "Sep 15" and "2.4 MB" belongs here.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const EM_DASH = '—'

/** 'YYYY-MM-DD' → 'Sep 15'. A year is only shown when it is not this one. */
export function formatDue(dueDate) {
  if (!dueDate) return EM_DASH
  const [year, month, day] = dueDate.split('-').map(Number)
  if (!year || !month || !day) return EM_DASH
  const label = `${MONTHS[month - 1]} ${day}`
  return year === new Date().getFullYear() ? label : `${label} ${year}`
}

export const todayIso = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** Overdue is a comparison of calendar days, never of instants. */
export const isOverdue = (dueDate) => Boolean(dueDate) && dueDate < todayIso()

export function formatSize(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${Math.round(kb)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

/** Relative for the first day, then a date — the way a comment thread reads. */
export function formatWhen(timestamp) {
  if (!timestamp) return ''
  const then = new Date(timestamp)
  const seconds = Math.round((Date.now() - then.getTime()) / 1000)

  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  if (seconds < 172800) return 'yesterday'
  return `${MONTHS[then.getMonth()]} ${then.getDate()}`
}

/** The compact form the message dock shows beside a conversation. */
export function formatShortWhen(timestamp) {
  if (!timestamp) return ''
  const then = new Date(timestamp)
  const seconds = Math.round((Date.now() - then.getTime()) / 1000)
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d`
  return `${MONTHS[then.getMonth()]} ${then.getDate()}`
}

export const fileMeta = (file) =>
  [formatSize(file.size), file.uploadedBy?.name, formatWhen(file.createdAt)]
    .filter(Boolean)
    .join(' · ')

export function extensionOf(fileName) {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return 'FILE'
  return fileName.slice(dot + 1, dot + 5).toUpperCase()
}

export function initialsFrom(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '??'
  const second = words[1] ? words[1][0] : words[0][1] || words[0][0]
  return (words[0][0] + second).toUpperCase()
}

export function emailsFrom(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .filter((entry) => entry.indexOf('@') > 0)
}
