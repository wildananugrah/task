// Fixed choices the UI offers. Everything else — statuses, labels, members —
// now comes from the server, because it is per workspace and editable.

export const PALETTE = [
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

/** Wire values are lower-case; the UI has always shown them capitalised. */
export const ROLES = ['admin', 'member', 'viewer']

export const ROLE_LABEL = { admin: 'Admin', member: 'Member', viewer: 'Viewer' }

export const ROLE_DESC = {
  admin: 'Full access, including settings',
  member: 'Create and edit tasks',
  viewer: 'Read-only access',
}

export const ROLE_HINT = {
  admin: 'Admins can change statuses, labels, members and workspace settings.',
  member: 'Members can create and edit tasks, upload files and comment.',
  viewer: 'Viewers can read tasks and comments but not edit them.',
}
