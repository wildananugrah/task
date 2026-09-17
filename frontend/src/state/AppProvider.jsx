import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api, putToStorage } from '../lib/api'
import { createSocket } from '../lib/socket'
import { DEFAULT_VIEW } from '../lib/config'
import { PALETTE } from '../lib/constants'
import { initialsFrom } from '../lib/format'
import { AppContext } from './context'

/**
 * There is no URL routing, so a reload has nothing to restore from. Remembering
 * the workspace you were last in is the smallest thing that makes refresh stop
 * throwing away your place; it is a convenience, never a source of truth, so a
 * browser that refuses storage simply lands on the workspace list.
 */
const LAST_PLACE = 'taskspace:last-place'

function readLastPlace() {
  try {
    const raw = localStorage.getItem(LAST_PLACE)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeLastPlace(place) {
  try {
    if (place) localStorage.setItem(LAST_PLACE, JSON.stringify(place))
    else localStorage.removeItem(LAST_PLACE)
  } catch {
    // Private windows and blocked site data both land here. Nothing to do.
  }
}

/**
 * A failed Google sign-in comes back as a redirect to /?auth_error=<reason>.
 * Without this the app just renders the login screen again, which looks exactly
 * like never having tried — the failure is invisible to the person it happened
 * to, and to anyone they report it to.
 */
const AUTH_ERRORS = {
  no_code: 'Google did not return a sign-in code. Please try again.',
  bad_state: 'That sign-in attempt expired or was started in another tab. Please try again.',
  token_exchange: 'Google rejected the sign-in. The server’s client ID or secret looks wrong.',
  no_id_token: 'Google did not return an identity token. Please try again.',
  unverified_email: 'That Google account has no verified email address.',
  domain_not_allowed:
    'That email domain is not allowed to sign in here. Ask an admin about GOOGLE_ALLOWED_DOMAINS.',
}

function takeAuthError() {
  try {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('auth_error')
    if (!code) return null
    // Clear it so a reload does not show the same failure forever.
    params.delete('auth_error')
    const query = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    return AUTH_ERRORS[code] ?? `Sign-in failed (${code}).`
  } catch {
    return null
  }
}

function initialState() {
  return {
    /* — session — */
    screen: 'loading',
    me: null,
    providers: { google: false, dev: true },
    signingIn: false,
    authError: null,

    /* — data — */
    cards: [],
    wsId: null,
    workspace: null,
    statuses: [],
    labels: [],
    members: [],
    tasks: [],
    files: [],
    details: {},

    /* — browsing — */
    view: DEFAULT_VIEW,
    tab: 'statuses',
    query: '',
    statusFilter: null,
    assigneeFilter: null,
    labelFilter: null,
    dueFilter: null,
    fq: '',
    gq: '',
    gFocus: false,
    searchResults: [],
    // /TSK-104 in a comment or a message may name a task in a workspace that is
    // not open. Resolved refs are cached here so RichText can link them without
    // fetching during render.
    refIndex: {},

    /* — transient UI — */
    selId: null,
    editing: false,
    preview: null,
    inviteOpen: false,
    newWsOpen: false,
    confirm: null,
    loading: false,
    error: null,

    /* — messaging — */
    conversations: [],
    messages: {},
    chatOpen: [],
    dockOpen: true,
    online: [],
    typing: {},
    socketStatus: 'offline',
  }
}

export function AppProvider({ children }) {
  const [state, setState] = useState(initialState)
  const socketRef = useRef(null)
  const stateRef = useRef(state)
  stateRef.current = state

  const update = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  }, [])

  /**
   * Every action that writes goes through here: it surfaces the server's own
   * message rather than failing silently, which is the whole difference between
   * a prototype that always succeeds and a product that sometimes cannot.
   */
  const run = useCallback(
    async (work, { quiet = false } = {}) => {
      try {
        return await work()
      } catch (error) {
        if (error?.name === 'AbortError') return undefined
        if (error instanceof ApiError && error.status === 401) {
          update({ ...initialState(), screen: 'login' })
          return undefined
        }
        if (!quiet) {
          update({
            error:
              error instanceof ApiError
                ? error.message
                : 'Something went wrong. Please try again.',
          })
        }
        return undefined
      }
    },
    [update],
  )

  /* ── loading ─────────────────────────────────────────────────────────── */

  const loadWorkspace = useCallback(
    async (wsId, extra = {}) =>
      run(async () => {
        update({ loading: true })
        const [payload, files] = await Promise.all([
          api.workspace(wsId),
          api.workspaceFiles(wsId),
        ])
        update({
          loading: false,
          wsId,
          workspace: payload.workspace,
          statuses: payload.statuses,
          labels: payload.labels,
          members: payload.members,
          tasks: payload.tasks,
          files: files.files,
          details: {},
          ...extra,
        })
        return payload
      }),
    [run, update],
  )

  const refreshCards = useCallback(
    () =>
      run(async () => {
        const { workspaces } = await api.bootstrap()
        update({ cards: workspaces })
        return workspaces
      }),
    [run, update],
  )

  const refreshConversations = useCallback(
    () =>
      run(
        async () => {
          const { conversations } = await api.conversations()
          update({ conversations })
          return conversations
        },
        { quiet: true },
      ),
    [run, update],
  )

  const enterApp = useCallback(
    async (user) => {
      update({ me: user, screen: 'workspaces', signingIn: false })
      const [cards] = await Promise.all([refreshCards(), refreshConversations()])

      const place = readLastPlace()
      if (place?.wsId && cards?.some((card) => card.id === place.wsId)) {
        await loadWorkspace(place.wsId, {
          screen: place.screen === 'workspaces' ? 'tasks' : (place.screen ?? 'tasks'),
          view: place.view ?? DEFAULT_VIEW,
        })
      }
    },
    [loadWorkspace, refreshCards, refreshConversations, update],
  )

  /**
   * Resolves the /TSK-104 tokens in a batch of text against every workspace the
   * person belongs to. Chat crosses workspaces, so without this a link to
   * another board would render as plain text.
   */
  const resolveRefs = useCallback(
    async (texts) => {
      const refs = new Set()
      for (const text of texts) {
        for (const match of String(text ?? '').matchAll(/\/([A-Z]{3}-\d+)/g)) refs.add(match[1])
      }
      if (!refs.size) return

      const known = stateRef.current
      const missing = [...refs].filter(
        (ref) =>
          !known.refIndex[ref] &&
          !known.tasks.some((task) => task.ref === ref) &&
          !known.searchResults.some((task) => task.ref === ref),
      )
      if (!missing.length) return

      const found = await Promise.all(
        missing.slice(0, 12).map(async (ref) => {
          try {
            const { tasks } = await api.search(ref)
            return tasks.find((task) => task.ref === ref) ?? null
          } catch {
            return null
          }
        }),
      )

      const resolved = Object.fromEntries(found.filter(Boolean).map((task) => [task.ref, task]))
      if (Object.keys(resolved).length) {
        update((prev) => ({ refIndex: { ...prev.refIndex, ...resolved } }))
      }
    },
    [update],
  )

  /* ── first paint: who is this, and is Google configured ──────────────── */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let providers = { google: false, dev: true }
      try {
        const config = await api.authConfig()
        providers = config.providers
      } catch {
        // Config is a nicety; the login screen still works without it.
      }
      if (cancelled) return

      const authError = takeAuthError()

      try {
        const { user } = await api.me()
        if (cancelled) return
        update({ providers, authError })
        if (user) await enterApp(user)
        else update({ screen: 'login' })
      } catch {
        if (!cancelled) update({ screen: 'login', providers, authError })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enterApp, update])

  /* ── the chat socket lives as long as the session ────────────────────── */

  useEffect(() => {
    if (!state.me) return undefined

    const socket = createSocket({
      onStatus: (socketStatus) => {
        update({ socketStatus })
        // Postgres holds the durable copy, so a reconnect refetches rather than
        // trying to replay whatever arrived while the socket was down.
        if (socketStatus === 'online') refreshConversations()
      },
      onFrame: (frame) => {
        if (frame.t === 'ready') {
          update({ online: frame.online ?? [] })
          return
        }

        if (frame.t === 'presence') {
          update((prev) => ({
            online: frame.online
              ? [...new Set([...prev.online, frame.userId])]
              : prev.online.filter((id) => id !== frame.userId),
          }))
          return
        }

        if (frame.t === 'typing') {
          update((prev) => ({
            typing: { ...prev.typing, [frame.conversationId]: Date.now() },
          }))
          return
        }

        if (frame.t === 'message') {
          update((prev) => {
            const thread = prev.messages[frame.message.conversationId] ?? []
            // clientId identifies the optimistic bubble this frame confirms;
            // without it the sender would see its own message twice.
            const without = frame.clientId
              ? thread.filter((message) => message.clientId !== frame.clientId)
              : thread
            if (without.some((message) => message.id === frame.message.id)) return {}

            const open = prev.chatOpen.includes(frame.message.conversationId)
            return {
              messages: {
                ...prev.messages,
                [frame.message.conversationId]: [...without, frame.message],
              },
              conversations: prev.conversations.map((conversation) =>
                conversation.id === frame.message.conversationId
                  ? {
                      ...conversation,
                      lastMessage: frame.message,
                      unread:
                        open || frame.message.author?.id === prev.me?.id
                          ? 0
                          : conversation.unread + 1,
                    }
                  : conversation,
              ),
            }
          })

          if (stateRef.current.chatOpen.includes(frame.message.conversationId)) {
            socketRef.current?.send({ t: 'read', conversationId: frame.message.conversationId })
          }
          resolveRefs([frame.message.body])
          return
        }

        if (frame.t === 'error') {
          update({ error: frame.reason ?? 'The chat server refused that message' })
        }
      },
    })

    socketRef.current = socket
    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [state.me, refreshConversations, resolveRefs, update])

  /* ── typing indicators expire on their own ───────────────────────────── */

  useEffect(() => {
    if (!Object.keys(state.typing).length) return undefined
    const timer = setInterval(() => {
      update((prev) => {
        const fresh = Object.fromEntries(
          Object.entries(prev.typing).filter(([, at]) => Date.now() - at < 4000),
        )
        return Object.keys(fresh).length === Object.keys(prev.typing).length ? {} : { typing: fresh }
      })
    }, 1500)
    return () => clearInterval(timer)
  }, [state.typing, update])

  /* ── global search is debounced against the server ───────────────────── */

  useEffect(() => {
    const query = state.gq.trim()
    if (!state.gFocus || query.length === 0) {
      if (state.searchResults.length) update({ searchResults: [] })
      return undefined
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const { tasks } = await api.search(query, { signal: controller.signal })
        update({ searchResults: tasks })
      } catch {
        // A stale or aborted search is not worth an error banner.
      }
    }, 180)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // searchResults is written here, never read, so it stays out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.gq, state.gFocus, update])

  /* ── error banner clears itself ──────────────────────────────────────── */

  useEffect(() => {
    if (!state.error) return undefined
    const timer = setTimeout(() => update({ error: null }), 6000)
    return () => clearTimeout(timer)
  }, [state.error, update])

  const patchTask = useCallback(
    (id, change) =>
      update((prev) => ({
        tasks: prev.tasks.map((task) => (task.id === id ? { ...task, ...change } : task)),
      })),
    [update],
  )

  const actions = useMemo(() => {
    const closeDrawer = { selId: null, editing: false }

    const remember = (patch) => {
      const { wsId, screen, view } = stateRef.current
      if (wsId) writeLastPlace({ wsId, screen, view, ...patch })
    }

    async function loadDetail(taskId) {
      const payload = await run(() => api.task(taskId))
      if (!payload) return
      update((prev) => ({
        details: {
          ...prev.details,
          [taskId]: { files: payload.task.files, comments: payload.task.comments },
        },
        tasks: prev.tasks.map((task) => (task.id === taskId ? { ...task, ...payload.task } : task)),
      }))
      // The description carries the same /TSK-104 tokens a comment does, and
      // one may point at a task in a workspace that is not open.
      resolveRefs([payload.task.description, ...payload.task.comments.map((c) => c.body)])
    }

    return {
      /* — session — */
      signInWithGoogle: () => {
        update({ authError: null })
        window.location.href = api.googleUrl()
      },
      signInAs: async (email) => {
        update({ signingIn: true, error: null })
        const result = await run(() => api.signInDev(email))
        if (!result) return update({ signingIn: false })
        return enterApp(result.user)
      },
      signOut: async () => {
        writeLastPlace(null)
        await run(() => api.signOut(), { quiet: true })
        update({ ...initialState(), screen: 'login', providers: stateRef.current.providers })
      },
      dismissError: () => update({ error: null }),

      /* — navigation — */
      goWorkspaces: () => {
        writeLastPlace(null)
        refreshCards()
        update({ screen: 'workspaces', wsId: null, workspace: null, ...closeDrawer })
      },
      openWorkspace: (wsId) => {
        writeLastPlace({ wsId, screen: 'tasks', view: stateRef.current.view })
        return loadWorkspace(wsId, { screen: 'tasks', ...closeDrawer })
      },
      goTasks: (view) => {
        remember({ screen: 'tasks', view: view ?? stateRef.current.view })
        update(view ? { screen: 'tasks', view } : { screen: 'tasks' })
      },
      goFiles: () => {
        remember({ screen: 'files' })
        update({ screen: 'files', ...closeDrawer })
      },
      goSettings: (tab = 'statuses') => {
        remember({ screen: 'settings' })
        update({ screen: 'settings', tab, ...closeDrawer })
      },
      setView: (view) => {
        remember({ view })
        update({ view })
      },
      setTab: (tab) => update({ tab }),

      /* — browsing — */
      setQuery: (query) => update({ query }),
      setFilter: (key, value) => update({ [key]: value }),
      clearFilters: () =>
        update({
          query: '',
          statusFilter: null,
          assigneeFilter: null,
          labelFilter: null,
          dueFilter: null,
        }),
      toggleStatusFilter: (statusId) =>
        update((prev) => ({
          screen: 'tasks',
          statusFilter: prev.statusFilter === statusId ? null : statusId,
        })),
      setFileQuery: (fq) => update({ fq }),
      setGlobalQuery: (gq) => update({ gq, gFocus: true }),
      focusGlobal: () => update({ gFocus: true }),
      closeGlobal: () => update({ gFocus: false, gq: '', searchResults: [] }),

      /* — task drawer — */
      selectTask: (selId) => {
        update({ selId, editing: false })
        if (selId) loadDetail(selId)
      },
      closeTask: () => update(closeDrawer),
      setEditing: (editing) => update({ editing }),

      /**
       * Jump to a task from anywhere: a /TSK link, chat, or global search. The
       * workspace may not be the open one, so it is loaded first.
       */
      revealTask: async (taskIdOrRef) => {
        const matches = (task) => task.id === taskIdOrRef || task.ref === taskIdOrRef
        const prev = stateRef.current

        const local = prev.tasks.find(matches) ?? null
        if (local) {
          update({ screen: 'tasks', selId: local.id, editing: false, gFocus: false, gq: '' })
          loadDetail(local.id)
          return
        }

        // Every place a ref can already be resolved, in the same order
        // taskByRef uses. The two lists used to disagree: RichText links
        // anything taskByRef knows, including the refIndex cache, while this
        // searched only two of the three — so a ref that resolved through the
        // cache rendered as a link and then did nothing when clicked.
        let hit =
          prev.searchResults.find(matches) ?? Object.values(prev.refIndex).find(matches) ?? null

        // Cold cache: a page that opens straight onto the workspace list has no
        // tasks loaded, and a message can be rendered before resolveRefs has
        // run over it. Ask the server rather than doing nothing.
        if (!hit && /^[A-Z]{3}-\d+$/.test(taskIdOrRef)) {
          const found = await run(() => api.search(taskIdOrRef), { quiet: true })
          hit = found?.tasks.find(matches) ?? null
        }

        if (!hit) {
          update({
            error: `Could not open ${taskIdOrRef}. It may have been deleted, or be in a workspace you do not have access to.`,
          })
          return
        }

        await loadWorkspace(hit.workspaceId, {
          screen: 'tasks',
          selId: hit.id,
          editing: false,
          gFocus: false,
          gq: '',
          query: '',
          statusFilter: null,
        })
        loadDetail(hit.id)
      },

      /* — tasks — */
      createTask: async (statusId) => {
        const prev = stateRef.current
        if (!prev.wsId) return
        const result = await run(() =>
          api.createTask(prev.wsId, { title: 'Untitled task', statusId: statusId ?? undefined }),
        )
        if (!result) return
        update((current) => ({
          tasks: [result.task, ...current.tasks],
          details: { ...current.details, [result.task.id]: { files: [], comments: [] } },
          selId: result.task.id,
          editing: true,
          query: '',
          statusFilter: null,
        }))
        refreshCards()
      },

      saveTask: async (id, patch) => {
        const result = await run(() => api.updateTask(id, patch))
        if (!result) return
        patchTask(id, result.task)
        refreshCards()
      },

      setTaskStatus: async (id, statusId) => {
        const before = stateRef.current.tasks.find((task) => task.id === id)
        patchTask(id, { statusId }) // optimistic: a status chip should feel instant
        const result = await run(() => api.updateTask(id, { statusId }))
        if (!result) return patchTask(id, { statusId: before?.statusId ?? null })
        patchTask(id, result.task)
        refreshCards()
      },

      deleteTask: async (id) => {
        const result = await run(() => api.deleteTask(id))
        if (!result) return
        update((prev) => ({
          tasks: prev.tasks.filter((task) => task.id !== id),
          files: prev.files.filter((file) => file.taskId !== id),
          confirm: null,
          ...closeDrawer,
        }))
        refreshCards()
      },

      /**
       * Three steps, because the bytes never pass through the API: ask for a
       * presigned PUT, upload straight to the bucket, then confirm.
       */
      uploadFiles: async (taskId, fileList) => {
        const uploaded = []
        for (const file of Array.from(fileList ?? [])) {
          const presigned = await run(() =>
            api.presignUpload(taskId, {
              name: file.name,
              size: file.size,
              contentType: file.type || 'application/octet-stream',
            }),
          )
          if (!presigned) continue

          // Only a confirmed PUT may be completed. The row stays 'pending' and
          // invisible otherwise, which is the whole point of the three-step
          // upload; the sweep collects it later.
          if (!(await run(() => putToStorage(presigned.uploadUrl, file)))) continue

          const done = await run(() => api.completeUpload(presigned.fileId))
          if (done) uploaded.push(done.file)
        }
        if (!uploaded.length) return

        update((prev) => ({
          details: {
            ...prev.details,
            [taskId]: {
              ...(prev.details[taskId] ?? { comments: [] }),
              files: [...(prev.details[taskId]?.files ?? []), ...uploaded],
            },
          },
          tasks: prev.tasks.map((task) =>
            task.id === taskId ? { ...task, fileCount: task.fileCount + uploaded.length } : task,
          ),
          files: [
            ...uploaded.map((file) => ({
              ...file,
              taskId,
              taskRef: prev.tasks.find((task) => task.id === taskId)?.ref ?? null,
              taskTitle: prev.tasks.find((task) => task.id === taskId)?.title ?? null,
            })),
            ...prev.files,
          ],
        }))
      },

      removeTaskFile: async (taskId, fileId) => {
        const result = await run(() => api.deleteFile(fileId))
        if (!result) return
        update((prev) => ({
          details: {
            ...prev.details,
            [taskId]: {
              ...(prev.details[taskId] ?? { comments: [] }),
              files: (prev.details[taskId]?.files ?? []).filter((file) => file.id !== fileId),
            },
          },
          tasks: prev.tasks.map((task) =>
            task.id === taskId
              ? { ...task, fileCount: Math.max(0, task.fileCount - 1) }
              : task,
          ),
          files: prev.files.filter((file) => file.id !== fileId),
          preview: prev.preview?.id === fileId ? null : prev.preview,
        }))
      },

      addComment: async (taskId, body) => {
        const result = await run(() => api.addComment(taskId, body))
        if (!result) return
        update((prev) => ({
          details: {
            ...prev.details,
            [taskId]: {
              ...(prev.details[taskId] ?? { files: [] }),
              comments: [...(prev.details[taskId]?.comments ?? []), result.comment],
            },
          },
          tasks: prev.tasks.map((task) =>
            task.id === taskId ? { ...task, commentCount: task.commentCount + 1 } : task,
          ),
        }))
      },

      /* — statuses — */
      addStatus: async () => {
        const prev = stateRef.current
        const used = prev.statuses.map((status) => status.color)
        const free = PALETTE.find((color) => !used.includes(color)) ?? PALETTE[0]
        const result = await run(() =>
          api.createStatus(prev.wsId, { name: 'New status', color: free }),
        )
        if (!result) return
        update((current) => ({ statuses: [...current.statuses, result.status] }))
      },

      updateStatus: async (id, change) => {
        update((prev) => ({
          statuses: prev.statuses.map((status) =>
            status.id === id ? { ...status, ...change } : status,
          ),
        }))
        await run(() => api.updateStatus(id, change), { quiet: true })
      },

      removeStatus: async (id) => {
        const result = await run(() => api.deleteStatus(id))
        if (!result) return
        update((prev) => ({
          statuses: prev.statuses.filter((status) => status.id !== id),
          statusFilter: prev.statusFilter === id ? null : prev.statusFilter,
          tasks: prev.tasks.map((task) =>
            task.statusId === id ? { ...task, statusId: result.movedTo } : task,
          ),
        }))
        refreshCards()
      },

      reorderStatuses: async (ids) => {
        const before = stateRef.current.statuses
        update({
          statuses: ids
            .map((id) => before.find((status) => status.id === id))
            .filter(Boolean),
        })
        const result = await run(() => api.reorderStatuses(stateRef.current.wsId, ids))
        if (!result) return update({ statuses: before })
        update({ statuses: result.statuses })
      },

      /* — labels — */
      addLabel: async (raw) => {
        const name = raw.trim().slice(0, 18)
        if (!name) return
        const prev = stateRef.current
        if (prev.labels.some((label) => label.name === name)) return
        const result = await run(() => api.createLabel(prev.wsId, name))
        if (!result) return
        update((current) => ({
          labels: [...current.labels, result.label].sort((a, b) => a.name.localeCompare(b.name)),
        }))
      },

      removeLabel: async (id) => {
        const label = stateRef.current.labels.find((entry) => entry.id === id)
        const result = await run(() => api.deleteLabel(id))
        if (!result) return
        update((prev) => ({
          labels: prev.labels.filter((entry) => entry.id !== id),
          labelFilter: prev.labelFilter === label?.name ? null : prev.labelFilter,
          tasks: prev.tasks.map((task) => ({
            ...task,
            labels: task.labels.filter((name) => name !== label?.name),
          })),
        }))
      },

      /* — members — */
      setMemberRole: async (memberId, role) => {
        const result = await run(() => api.setMemberRole(memberId, role))
        if (!result) return
        update((prev) => ({
          members: prev.members.map((member) => (member.id === memberId ? result.member : member)),
          // Demoting yourself takes effect immediately, including in the UI.
          workspace:
            result.member.userId === prev.me?.id
              ? { ...prev.workspace, role: result.member.role }
              : prev.workspace,
        }))
      },

      removeMember: async (memberId) => {
        const result = await run(() => api.removeMember(memberId))
        if (!result) return
        update((prev) => ({
          members: prev.members.filter((member) => member.id !== memberId),
        }))
      },

      inviteMembers: async (emails, role) => {
        if (!emails.length) return
        const result = await run(() => api.invite(stateRef.current.wsId, emails, role))
        if (!result) return
        update((prev) => ({
          members: [...prev.members, ...result.members],
          inviteOpen: false,
          screen: 'settings',
          tab: 'members',
          ...closeDrawer,
        }))
      },

      /* — workspaces — */
      renameWorkspace: async (name) => {
        update((prev) => ({
          workspace: {
            ...prev.workspace,
            name,
            initials: name.trim() ? initialsFrom(name) : prev.workspace.initials,
          },
        }))
        await run(() => api.updateWorkspace(stateRef.current.wsId, { name }), { quiet: true })
      },

      /**
       * The prefix is the only thing stored; task ids are derived from it, so
       * the server renumbers the whole workspace and we take its answer back.
       */
      setWorkspacePrefix: async (prefix) => {
        update((prev) => ({ workspace: { ...prev.workspace, prefix } }))
        if (prefix.length !== 3) return
        const result = await run(() => api.updateWorkspace(stateRef.current.wsId, { prefix }))
        if (!result) return
        update((prev) => ({
          workspace: { ...prev.workspace, ...result.workspace },
          tasks: prev.tasks.map((task) => ({ ...task, ref: `${prefix}-${task.number}` })),
          files: prev.files.map((file) => ({
            ...file,
            taskRef: file.taskRef ? `${prefix}-${file.taskRef.split('-')[1]}` : null,
          })),
        }))
        refreshCards()
      },

      uploadWorkspaceLogo: async (file) => {
        const wsId = stateRef.current.wsId
        const presigned = await run(() =>
          api.presignLogo(wsId, { name: file.name, contentType: file.type }),
        )
        if (!presigned) return
        if (!(await run(() => putToStorage(presigned.uploadUrl, file)))) return
        const result = await run(() => api.completeLogo(wsId, presigned.key))
        if (!result) return
        update((prev) => ({ workspace: { ...prev.workspace, ...result.workspace } }))
        refreshCards()
      },

      createWorkspace: async ({ name, prefix }) => {
        const result = await run(() => api.createWorkspace({ name: name.trim(), prefix }))
        if (!result) return
        writeLastPlace({ wsId: result.workspace.id, screen: 'tasks', view: 'list' })
        update({
          newWsOpen: false,
          screen: 'tasks',
          wsId: result.workspace.id,
          workspace: result.workspace,
          statuses: result.statuses,
          labels: result.labels,
          members: result.members,
          tasks: result.tasks,
          files: [],
          details: {},
          view: 'list',
          query: '',
          statusFilter: null,
          ...closeDrawer,
        })
        refreshCards()
        refreshConversations()
      },

      /* — dialogs — */
      openInvite: () => update({ inviteOpen: true, gFocus: false }),
      closeInvite: () => update({ inviteOpen: false }),
      openNewWorkspace: () => update({ newWsOpen: true, gFocus: false }),
      closeNewWorkspace: () => update({ newWsOpen: false }),
      openPreview: (preview) => update({ preview }),
      closePreview: () => update({ preview: null }),
      askConfirm: (confirm) => update({ confirm }),
      cancelConfirm: () => update({ confirm: null }),

      runConfirm: async () => {
        const prev = stateRef.current
        const wsId = prev.wsId

        if (prev.confirm === 'task') {
          return actionsRef.current.deleteTask(prev.selId)
        }

        if (prev.confirm === 'archive') {
          const result = await run(() => api.archiveWorkspace(wsId))
          if (!result) return
        } else {
          const result = await run(() => api.deleteWorkspace(wsId))
          if (!result) return
        }

        writeLastPlace(null)
        update({ confirm: null, screen: 'workspaces', wsId: null, workspace: null, ...closeDrawer })
        refreshCards()
        refreshConversations()
      },

      /* — messaging — */
      toggleDock: () => update((prev) => ({ dockOpen: !prev.dockOpen })),

      openThread: async (id) => {
        update((prev) => ({
          chatOpen: [id],
          conversations: prev.conversations.map((conversation) =>
            conversation.id === id ? { ...conversation, unread: 0 } : conversation,
          ),
        }))
        const result = await run(() => api.messages(id), { quiet: true })
        if (result) {
          update((prev) => ({ messages: { ...prev.messages, [id]: result.messages } }))
          resolveRefs(result.messages.map((message) => message.body))
        }

        if (!socketRef.current?.send({ t: 'read', conversationId: id })) {
          run(() => api.markRead(id), { quiet: true })
        }
      },

      closeChat: () => update({ chatOpen: [] }),

      startDm: async (userId) => {
        const result = await run(() => api.openDm(userId))
        if (!result) return
        socketRef.current?.send({ t: 'refresh' })
        await refreshConversations()
        return actionsRef.current.openThread(result.conversationId)
      },

      notifyTyping: (conversationId) => {
        socketRef.current?.send({ t: 'typing', conversationId })
      },

      /**
       * Optimistic: the bubble appears immediately with a clientId, and the
       * socket's echo replaces it. If the socket is down the same write goes
       * over HTTP, so a flaky connection slows chat down rather than losing it.
       */
      sendMessage: async (conversationId, body) => {
        const text = body.trim()
        if (!text) return
        const clientId = crypto.randomUUID()
        const me = stateRef.current.me

        update((prev) => ({
          messages: {
            ...prev.messages,
            [conversationId]: [
              ...(prev.messages[conversationId] ?? []),
              {
                id: clientId,
                clientId,
                conversationId,
                body: text,
                createdAt: new Date().toISOString(),
                author: me,
                pending: true,
              },
            ],
          },
        }))

        const sent = socketRef.current?.send({ t: 'send', conversationId, body: text, clientId })
        if (sent) return

        const result = await run(() => api.sendMessage(conversationId, text))
        update((prev) => ({
          messages: {
            ...prev.messages,
            [conversationId]: (prev.messages[conversationId] ?? [])
              .filter((message) => message.clientId !== clientId)
              .concat(result ? [result.message] : []),
          },
        }))
      },
    }
  }, [enterApp, loadWorkspace, patchTask, refreshCards, refreshConversations, resolveRefs, run, update])

  // runConfirm and startDm call sibling actions; the ref keeps that from
  // rebuilding the whole action object on every render.
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const value = useMemo(() => ({ state, actions }), [state, actions])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
