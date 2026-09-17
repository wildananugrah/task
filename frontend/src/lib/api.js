/**
 * The one place that talks to the API. Every call sends the session cookie and
 * either returns parsed JSON or throws an ApiError carrying the server's own
 * code and message, so callers branch on `error.code` rather than on a string.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api'

export class ApiError extends Error {
  constructor(status, code, message, detail) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

async function request(method, path, body, options = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    })
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause
    throw new ApiError(0, 'offline', 'Cannot reach the server', cause)
  }

  if (response.status === 204) return null

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'internal',
      error?.message ?? `Request failed (${response.status})`,
      error?.detail,
    )
  }
  return payload
}

const get = (path, options) => request('GET', path, undefined, options)
const post = (path, body) => request('POST', path, body ?? {})
const patch = (path, body) => request('PATCH', path, body ?? {})
const del = (path) => request('DELETE', path)

const query = (params) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, value)
  }
  const string = search.toString()
  return string ? `?${string}` : ''
}

export const api = {
  /* — session — */
  authConfig: () => get('/auth/config'),
  me: () => get('/auth/me'),
  signInDev: (email) => post('/auth/dev', { email }),
  signOut: () => post('/auth/signout'),
  wsTicket: () => post('/auth/ws-ticket'),
  googleUrl: () => `${BASE}/auth/google`,

  /* — workspaces — */
  bootstrap: () => get('/bootstrap'),
  workspace: (id) => get(`/workspaces/${id}`),
  createWorkspace: (body) => post('/workspaces', body),
  updateWorkspace: (id, body) => patch(`/workspaces/${id}`, body),
  archiveWorkspace: (id) => post(`/workspaces/${id}/archive`),
  deleteWorkspace: (id) => del(`/workspaces/${id}`),
  presignLogo: (id, body) => post(`/workspaces/${id}/logo`, body),
  completeLogo: (id, key) => post(`/workspaces/${id}/logo/complete`, { key }),

  /* — statuses & labels — */
  createStatus: (workspaceId, body) => post(`/workspaces/${workspaceId}/statuses`, body),
  updateStatus: (id, body) => patch(`/statuses/${id}`, body),
  deleteStatus: (id, moveTo) => del(`/statuses/${id}${query({ moveTo })}`),
  reorderStatuses: (workspaceId, ids) => post(`/workspaces/${workspaceId}/statuses/reorder`, { ids }),
  createLabel: (workspaceId, name) => post(`/workspaces/${workspaceId}/labels`, { name }),
  deleteLabel: (id) => del(`/labels/${id}`),

  /* — members — */
  invite: (workspaceId, emails, role) => post(`/workspaces/${workspaceId}/members`, { emails, role }),
  setMemberRole: (memberId, role) => patch(`/members/${memberId}`, { role }),
  removeMember: (memberId) => del(`/members/${memberId}`),

  /* — tasks — */
  createTask: (workspaceId, body) => post(`/workspaces/${workspaceId}/tasks`, body),
  task: (id) => get(`/tasks/${id}`),
  updateTask: (id, body) => patch(`/tasks/${id}`, body),
  deleteTask: (id) => del(`/tasks/${id}`),
  addComment: (taskId, body) => post(`/tasks/${taskId}/comments`, { body }),

  /* — files — */
  workspaceFiles: (workspaceId, q) => get(`/workspaces/${workspaceId}/files${query({ q })}`),
  presignUpload: (taskId, body) => post(`/tasks/${taskId}/files`, body),
  completeUpload: (fileId) => post(`/files/${fileId}/complete`),
  fileUrl: (fileId, disposition) => get(`/files/${fileId}/url${query({ disposition })}`),
  deleteFile: (fileId) => del(`/files/${fileId}`),

  /* — search & chat — */
  search: (q, options) => get(`/search${query({ q })}`, options),
  conversations: () => get('/conversations'),
  messages: (id) => get(`/conversations/${id}/messages`),
  sendMessage: (id, body) => post(`/conversations/${id}/messages`, { body }),
  markRead: (id) => post(`/conversations/${id}/read`),
  openDm: (userId) => post('/conversations/dm', { userId }),
}

/**
 * Uploads go straight to the bucket on a presigned URL — the API never sees the
 * bytes — so this is a bare fetch rather than an api.* call.
 */
export async function putToStorage(uploadUrl, file) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'content-type': file.type || 'application/octet-stream' },
  })
  if (!response.ok) {
    throw new ApiError(response.status, 'upload_failed', 'The file could not be uploaded')
  }
}
