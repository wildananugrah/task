import { CURRENT_USER } from '../data/seed'
import { currentWorkspace, statusCounts, workspaceFileCount, workspaceTasks } from '../lib/select'
import { useApp } from '../state/useApp'
import Avatar from './ui/Avatar'
import SearchField from './ui/SearchField'
import StatusDot from './ui/StatusDot'

function SectionLabel({ children }) {
  return (
    <span className="px-2 pb-[7px] font-mono text-[10px] leading-none font-medium tracking-[.1em] text-shell-ink/36 uppercase">
      {children}
    </span>
  )
}

function GhostAction({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 flex cursor-pointer items-center gap-[7px] rounded-lg bg-transparent px-[9px] py-1.5 text-left text-xs leading-none font-normal text-shell-ink/50 hover:text-shell-ink"
    >
      {children}
    </button>
  )
}

function WorkspaceNav() {
  const { state, actions } = useApp()
  const workspace = currentWorkspace(state)
  const counts = statusCounts(state)
  const tasks = workspaceTasks(state)

  const nav = [
    { key: 'tasks', label: 'Tasks', icon: '☰', count: tasks.length },
    { key: 'board', label: 'Board', icon: '▤', count: '' },
    { key: 'files', label: 'Files', icon: '◫', count: workspaceFileCount(state) },
    { key: 'settings', label: 'Workspace settings', icon: '⚙', count: '' },
  ]

  const isActive = (key) =>
    (key === 'tasks' && state.screen === 'tasks' && state.view === 'list') ||
    (key === 'board' && state.screen === 'tasks' && state.view === 'board') ||
    (key === 'files' && state.screen === 'files') ||
    (key === 'settings' && state.screen === 'settings')

  const go = (key) => {
    if (key === 'settings') actions.goSettings()
    else if (key === 'files') actions.goFiles()
    else actions.goTasks(key === 'board' ? 'board' : 'list')
  }

  return (
    <>
      <div className="border-b border-shell-ink/10 px-3.5 pt-3.5 pb-3">
        <button
          type="button"
          onClick={actions.goWorkspaces}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border border-shell-ink/14 bg-shell-ink/5 px-2.5 py-[9px] text-left hover:bg-shell-ink/10"
        >
          <div className="flex size-[26px] flex-none items-center justify-center rounded-[7px] bg-ink font-mono text-xs leading-none font-bold text-white">
            {workspace.init}
          </div>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] leading-[1.2] font-semibold text-shell-ink">
              {workspace.name}
            </span>
            <span className="font-mono text-[10.5px] leading-none text-shell-ink/45">
              switch workspace
            </span>
          </span>
          <span aria-hidden="true" className="text-xs leading-none text-shell-ink/45">
            ⇄
          </span>
        </button>
      </div>

      <GlobalSearchField />

      <nav className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-2.5 py-4">
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Work</SectionLabel>
          {nav.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => go(item.key)}
              aria-current={isActive(item.key) ? 'page' : undefined}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-[9px] py-2 text-left text-[13px] leading-none font-medium hover:bg-shell-ink/9 ${
                isActive(item.key) ? 'bg-shell-ink/12 text-shell-ink' : 'bg-transparent text-shell-ink/66'
              }`}
            >
              <span aria-hidden="true" className="w-[15px] text-center text-[12.5px] opacity-80">
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.count !== '' && (
                <span className="font-mono text-[10.5px] leading-none font-medium text-shell-ink/50">
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-0.5">
          <SectionLabel>Statuses</SectionLabel>
          {state.statuses.map((status) => (
            <button
              key={status.id}
              type="button"
              onClick={() => actions.toggleStatusFilter(status.id)}
              aria-pressed={state.statusFilter === status.id}
              className={`flex cursor-pointer items-center gap-[9px] rounded-lg px-[9px] py-1.5 text-left hover:bg-shell-ink/9 ${
                state.statusFilter === status.id ? 'bg-shell-ink/12' : 'bg-transparent'
              }`}
            >
              <StatusDot color={status.color} />
              <span className="flex-1 text-[12.5px] leading-none text-shell-ink/82">
                {status.name}
              </span>
              <span className="font-mono text-[10.5px] leading-none text-shell-ink/40">
                {counts[status.id] || 0}
              </span>
            </button>
          ))}
          <GhostAction onClick={() => actions.goSettings('statuses')}>
            ＋ Configure statuses
          </GhostAction>
        </div>

        <div className="flex flex-col gap-0.5">
          <SectionLabel>Members</SectionLabel>
          {state.members.map((member) => (
            <div key={member.id} className="flex items-center gap-[9px] px-[9px] py-1.5">
              <span
                style={{
                  background: member.pending ? 'transparent' : member.color,
                  border: member.pending ? '1.5px dashed rgba(237,237,235,.4)' : 'none',
                }}
                className="box-border flex size-5 flex-none items-center justify-center rounded-full font-mono text-[9px] leading-none font-semibold text-shell-ink"
              >
                {member.init}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-[12.5px] leading-none ${
                  member.pending ? 'text-shell-ink/55' : 'text-shell-ink/82'
                }`}
              >
                {member.name}
              </span>
              <span className="font-mono text-[10px] leading-none text-shell-ink/40">
                {member.pending ? 'Pending' : member.role}
              </span>
            </div>
          ))}
          <GhostAction onClick={actions.openInvite}>＋ Invite people</GhostAction>
        </div>
      </nav>
    </>
  )
}

function HomeNav() {
  const { state, actions } = useApp()

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-shell-ink/10 px-4 pt-[18px] pb-4">
        <div className="flex size-[26px] items-center justify-center rounded-[7px] bg-ink text-[13px] leading-none font-bold text-white">
          T
        </div>
        <span className="text-[14.5px] leading-none font-semibold tracking-[-.01em]">Taskspace</span>
      </div>

      <GlobalSearchField />

      <nav className="flex flex-1 flex-col gap-[22px] overflow-y-auto px-2.5 py-4">
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Home</SectionLabel>
          <div className="flex items-center gap-2.5 rounded-lg bg-shell-ink/10 px-[9px] py-2 text-[13px] leading-none font-medium">
            <span aria-hidden="true" className="w-[15px] text-center text-[12.5px] opacity-80">
              ▦
            </span>
            All workspaces
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          <SectionLabel>Your workspaces</SectionLabel>
          {state.workspaces.map((workspace) => {
            const open = state.tasks.filter(
              (task) => task.ws === workspace.id && task.status !== 'done',
            ).length
            return (
              <button
                key={workspace.id}
                type="button"
                onClick={() => actions.openWorkspace(workspace.id)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg bg-transparent px-[9px] py-[7px] text-left hover:bg-shell-ink/9"
              >
                <Avatar init={workspace.init} color={workspace.color} size={20} radius="6px" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] leading-[1.2] text-shell-ink/82">
                  {workspace.name}
                </span>
                <span className="font-mono text-[10.5px] leading-none text-shell-ink/40">
                  {open}
                </span>
              </button>
            )
          })}
          <GhostAction onClick={actions.openNewWorkspace}>＋ New workspace</GhostAction>
        </div>
      </nav>
    </>
  )
}

function GlobalSearchField() {
  const { state, actions } = useApp()

  return (
    <div className="px-3.5 pt-3">
      <SearchField
        dark
        value={state.gq}
        onChange={actions.setGlobalQuery}
        onFocus={actions.focusGlobal}
        onClear={actions.closeGlobal}
        placeholder="Search all tasks"
      />
    </div>
  )
}

export default function Sidebar() {
  const { state, actions } = useApp()
  const inWorkspace = ['tasks', 'settings', 'files'].includes(state.screen)

  return (
    <aside className="flex w-[250px] flex-none flex-col overflow-hidden bg-shell text-shell-ink">
      {inWorkspace ? <WorkspaceNav /> : <HomeNav />}

      <div className="flex items-center gap-[9px] border-t border-shell-ink/10 p-2.5">
        <Avatar init={CURRENT_USER.init} color={CURRENT_USER.color} size={26} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-[12.5px] leading-[1.2] font-medium">{CURRENT_USER.name}</span>
          <span className="font-mono text-[10.5px] leading-none text-shell-ink/42">
            {CURRENT_USER.email}
          </span>
        </span>
        <button
          type="button"
          onClick={actions.signOut}
          title="Sign out"
          aria-label="Sign out"
          className="cursor-pointer bg-transparent text-[13px] text-shell-ink/45 hover:text-shell-ink"
        >
          ⏻
        </button>
      </div>
    </aside>
  )
}
