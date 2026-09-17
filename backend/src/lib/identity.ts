/**
 * The near-monochrome UI leans on one saturated colour per person, so a new user
 * needs a stable colour and initials the moment they first appear. Both are
 * derived, never asked for.
 */

export const AVATAR_PALETTE = [
  '#8c8c8c',
  '#2f6f9f',
  '#1f7a5a',
  '#8a6d1f',
  '#b4531f',
  '#a5342f',
  '#7a4a9c',
  '#3f4a8a',
  '#4a5d3a',
  '#171717',
]

export function initialsFrom(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '??'
  const first = words[0]!
  const second = words[1] ? words[1][0]! : first[1] || first[0]!
  return (first[0]! + second).toUpperCase()
}

export function nameFromEmail(email: string) {
  const local = (email.split('@')[0] ?? '').replace(/[^A-Za-z]/g, ' ').trim()
  return local ? local[0]!.toUpperCase() + local.slice(1) : email
}

/** Same email always gets the same colour, on any machine, forever. */
export function colorFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0) return 'FILE'
  return fileName.slice(dot + 1, dot + 5).toUpperCase()
}

/** Keeps an uploaded name usable as part of an object key. */
export function safeFileName(name: string) {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/^[.-]+/, '')
      .slice(0, 120) || 'file'
  )
}
