import { useCallback, useMemo, useState } from 'react'
import {
  CONVERSATIONS,
  CURRENT_USER,
  LABELS,
  MEMBERS,
  PALETTE,
  STATUSES,
  THREADS,
  WORKSPACES,
  seedTasks,
} from '../data/seed'
import { DEFAULT_VIEW } from '../lib/config'
import { initialsFrom, nameFromEmail } from '../lib/text'
import { nextTaskNumber } from '../lib/select'
import { AppContext } from './context'

function createInitialState() {
  return {
    screen: 'login',
    wsId: null,
    view: DEFAULT_VIEW,
    tab: 'statuses',

    tasks: seedTasks(),
    statuses: STATUSES.map((status) => ({ ...status })),
    members: MEMBERS.map((member) => ({ ...member })),
    workspaces: WORKSPACES.map((workspace) => ({ ...workspace })),
    labels: [...LABELS],
    archived: [],

    query: '',
    statusFilter: null,
    assigneeFilter: null,
    labelFilter: null,
    dueFilter: null,
    fq: '',
    gq: '',
    gFocus: false,

    selId: null,
    editing: false,
    preview: null,
    inviteOpen: false,
    newWsOpen: false,
    confirm: null,

    threads: THREADS.map((thread) => ({ ...thread })),
    convos: CONVERSATIONS,
    chatOpen: [],
    dockOpen: true,
  }
}

export function AppProvider({ children }) {
  const [state, setState] = useState(createInitialState)

  const update = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  }, [])

  const patchTask = useCallback(
    (id, change) => {
      update((prev) => ({
        tasks: prev.tasks.map((task) => (task.id === id ? { ...task, ...change(task) } : task)),
      }))
    },
    [update],
  )

  const actions = useMemo(() => {
    const closeDrawer = { selId: null, editing: false }

    return {
      /* — session — */
      signIn: () => update({ screen: 'workspaces' }),
      signOut: () => update({ screen: 'login', wsId: null, chatOpen: [], ...closeDrawer }),

      /* — navigation — */
      goWorkspaces: () => update({ screen: 'workspaces', ...closeDrawer }),
      openWorkspace: (wsId) => update({ screen: 'tasks', wsId, ...closeDrawer }),
      goTasks: (view) => update(view ? { screen: 'tasks', view } : { screen: 'tasks' }),
      goFiles: () => update({ screen: 'files', ...closeDrawer }),
      goSettings: (tab = 'statuses') => update({ screen: 'settings', tab, ...closeDrawer }),
      setView: (view) => update({ view }),
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
      closeGlobal: () => update({ gFocus: false, gq: '' }),

      /* — task drawer — */
      selectTask: (selId) => update({ selId, editing: false }),
      closeTask: () => update(closeDrawer),
      setEditing: (editing) => update({ editing }),

      /** Jump to a task from anywhere: a /TSK link, chat or global search. */
      revealTask: (taskId) =>
        update((prev) => {
          const task = prev.tasks.find((candidate) => candidate.id === taskId)
          if (!task) return {}
          return {
            screen: 'tasks',
            wsId: task.ws,
            selId: task.id,
            editing: false,
            gFocus: false,
            gq: '',
            query: '',
            statusFilter: null,
          }
        }),

      /* — tasks — */
      createTask: (statusId) =>
        update((prev) => {
          const wsId = prev.wsId || 'work'
          const workspace = prev.workspaces.find((w) => w.id === wsId) || prev.workspaces[0]
          const num = nextTaskNumber(prev.tasks.filter((task) => task.ws === wsId))
          const task = {
            ws: wsId,
            num,
            id: `${workspace.prefix}-${num}`,
            title: 'Untitled task',
            status: statusId || prev.statuses[0].id,
            assignee: CURRENT_USER.id,
            labels: [],
            desc: 'Add a description so the rest of the team knows what done looks like.',
            due: '—',
            overdue: false,
            files: [],
            comments: [],
          }
          return {
            tasks: [task, ...prev.tasks],
            selId: task.id,
            editing: true,
            query: '',
            statusFilter: null,
          }
        }),

      saveTask: (id, { title, desc }) =>
        patchTask(id, (task) => ({ title: title || task.title, desc })),

      setTaskStatus: (id, status) => patchTask(id, () => ({ status })),

      addTaskFiles: (id, names) =>
        patchTask(id, (task) => ({
          files: [...task.files, ...names],
        })),

      removeTaskFile: (id, index) =>
        patchTask(id, (task) => ({ files: task.files.filter((_, i) => i !== index) })),

      addComment: (id, text) =>
        patchTask(id, (task) => ({
          comments: [
            ...task.comments,
            {
              who: CURRENT_USER.name,
              init: CURRENT_USER.init,
              color: CURRENT_USER.color,
              when: 'just now',
              text,
            },
          ],
        })),

      /* — statuses — */
      addStatus: () =>
        update((prev) => {
          const used = prev.statuses.map((status) => status.color)
          const free = PALETTE.filter((color) => !used.includes(color))
          return {
            statuses: [
              ...prev.statuses,
              { id: `s${Date.now()}`, name: 'New status', color: free[0] || PALETTE[0] },
            ],
          }
        }),
      updateStatus: (id, change) =>
        update((prev) => ({
          statuses: prev.statuses.map((status) =>
            status.id === id ? { ...status, ...change } : status,
          ),
        })),
      removeStatus: (id) =>
        update((prev) => ({ statuses: prev.statuses.filter((status) => status.id !== id) })),

      /* — labels — */
      addLabel: (raw) =>
        update((prev) => {
          const name = raw.trim().slice(0, 18)
          if (!name || prev.labels.includes(name)) return {}
          return { labels: [...prev.labels, name] }
        }),
      removeLabel: (name) =>
        update((prev) => ({
          labels: prev.labels.filter((label) => label !== name),
          tasks: prev.tasks.map((task) => ({
            ...task,
            labels: task.labels.filter((label) => label !== name),
          })),
        })),

      /* — members — */
      setMemberRole: (id, role) =>
        update((prev) => ({
          members: prev.members.map((member) => (member.id === id ? { ...member, role } : member)),
        })),
      inviteMembers: (emails, role) =>
        update((prev) => {
          if (!emails.length) return {}
          const added = emails.map((email, i) => {
            const name = nameFromEmail(email)
            return {
              id: `inv${Date.now()}${i}`,
              name,
              email,
              role,
              pending: true,
              init: initialsFrom(name),
              color: PALETTE[(prev.members.length + i) % PALETTE.length],
            }
          })
          return {
            members: [...prev.members, ...added],
            inviteOpen: false,
            screen: 'settings',
            tab: 'members',
            ...closeDrawer,
          }
        }),

      /* — workspaces — */
      renameWorkspace: (name) =>
        update((prev) => ({
          workspaces: prev.workspaces.map((workspace) =>
            workspace.id === (prev.wsId || 'work')
              ? { ...workspace, name, init: name.trim() ? initialsFrom(name) : workspace.init }
              : workspace,
          ),
        })),

      /** Three letters renumbers every task id in the workspace. */
      setWorkspacePrefix: (prefix) =>
        update((prev) => {
          const wsId = prev.wsId || 'work'
          const next = {
            workspaces: prev.workspaces.map((workspace) =>
              workspace.id === wsId ? { ...workspace, prefix } : workspace,
            ),
            selId: null,
          }
          if (prefix.length === 3) {
            next.tasks = prev.tasks.map((task) =>
              task.ws === wsId ? { ...task, id: `${prefix}-${task.num}` } : task,
            )
          }
          return next
        }),

      createWorkspace: ({ name, prefix }) =>
        update((prev) => {
          const workspace = {
            id: `ws${Date.now()}`,
            name: name.trim(),
            init: initialsFrom(name),
            prefix,
            color: '#4a4a4a',
            desc: 'Created just now',
            role: 'Admin',
            people: [0],
          }
          return {
            workspaces: [...prev.workspaces, workspace],
            newWsOpen: false,
            screen: 'tasks',
            wsId: workspace.id,
            view: 'list',
            query: '',
            statusFilter: null,
            ...closeDrawer,
          }
        }),

      /* — dialogs — */
      openInvite: () => update({ inviteOpen: true, gFocus: false }),
      closeInvite: () => update({ inviteOpen: false }),
      openNewWorkspace: () => update({ newWsOpen: true, gFocus: false }),
      closeNewWorkspace: () => update({ newWsOpen: false }),
      openPreview: (preview) => update({ preview }),
      closePreview: () => update({ preview: null }),
      askConfirm: (confirm) => update({ confirm }),
      cancelConfirm: () => update({ confirm: null }),

      runConfirm: () =>
        update((prev) => {
          const wsId = prev.wsId || 'work'

          if (prev.confirm === 'task') {
            return {
              tasks: prev.tasks.filter((task) => task.id !== prev.selId),
              confirm: null,
              ...closeDrawer,
            }
          }

          if (prev.confirm === 'archive') {
            return {
              archived: [...prev.archived, wsId],
              workspaces: prev.workspaces.filter((workspace) => workspace.id !== wsId),
              confirm: null,
              screen: 'workspaces',
              wsId: null,
              ...closeDrawer,
            }
          }

          return {
            workspaces: prev.workspaces.filter((workspace) => workspace.id !== wsId),
            tasks: prev.tasks.filter((task) => task.ws !== wsId),
            confirm: null,
            screen: 'workspaces',
            wsId: null,
            ...closeDrawer,
          }
        }),

      /* — messaging — */
      toggleDock: () => update((prev) => ({ dockOpen: !prev.dockOpen })),
      openThread: (id) =>
        update((prev) => ({
          chatOpen: [id],
          threads: prev.threads.map((thread) =>
            thread.id === id ? { ...thread, unread: false } : thread,
          ),
        })),
      closeChat: () => update({ chatOpen: [] }),
      sendMessage: (id, text) =>
        update((prev) => ({
          convos: { ...prev.convos, [id]: [...(prev.convos[id] || []), { me: true, text }] },
        })),
    }
  }, [update, patchTask])

  const value = useMemo(() => ({ state, actions }), [state, actions])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
