import { ROW_PADDING } from '../lib/config'
import { currentWorkspace, memberOf, statusOf } from '../lib/select'
import { useApp } from '../state/useApp'
import Avatar from './ui/Avatar'
import StatusDot from './ui/StatusDot'

const GRID = 'grid grid-cols-[74px_minmax(0,1fr)_118px_40px_68px_52px] items-center'

function EmptyWorkspace() {
  const { state, actions } = useApp()
  const workspace = currentWorkspace(state)

  return (
    <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
      <span className="text-[15px] leading-[1.3] font-semibold">No tasks in {workspace.name} yet</span>
      <span className="max-w-[340px] text-[13px] leading-[1.55] text-ink/55 text-pretty">
        The first task here will be numbered {workspace.prefix}-101. Statuses and labels are already
        set up.
      </span>
      <button
        type="button"
        onClick={() => actions.createTask(null)}
        className="mt-0.5 cursor-pointer rounded-lg bg-ink px-[15px] py-[9px] text-[12.5px] leading-none font-semibold text-white hover:bg-ink-strong"
      >
        ＋ New task
      </button>
    </div>
  )
}

export function NoMatches({ padding = 'py-15' }) {
  const { actions } = useApp()

  return (
    <div className={`flex flex-col items-center gap-2.5 px-5 text-center ${padding}`}>
      <span className="text-sm leading-[1.5] text-ink/50">
        No tasks match the current search and filters.
      </span>
      <button
        type="button"
        onClick={actions.clearFilters}
        className="cursor-pointer rounded-lg border border-ink/18 bg-panel px-[13px] py-2 text-[12.5px] leading-none font-medium"
      >
        Clear all
      </button>
    </div>
  )
}

export default function TaskListView({ tasks, workspaceEmpty, noMatches }) {
  const { state, actions } = useApp()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-10">
      <div
        className={`${GRID} sticky top-0 z-1 gap-0 border-b border-ink/9 bg-canvas px-3 py-[11px] font-mono text-[10px] leading-none font-medium tracking-[.09em] text-ink/42 uppercase`}
      >
        <span>ID</span>
        <span>Task</span>
        <span>Status</span>
        <span />
        <span>Due</span>
        <span className="text-right">Meta</span>
      </div>

      {tasks.map((task) => {
        const status = statusOf(state, task.status)
        const assignee = memberOf(state, task.assignee)
        const selected = task.id === state.selId

        return (
          <div
            key={task.id}
            role="button"
            tabIndex={0}
            onClick={() => actions.selectTask(task.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                actions.selectTask(task.id)
              }
            }}
            aria-label={`${task.id}: ${task.title}`}
            style={{ paddingTop: ROW_PADDING, paddingBottom: ROW_PADDING }}
            className={`${GRID} cursor-pointer gap-0 border-b border-ink/6 px-3 hover:bg-panel ${
              selected ? 'bg-panel' : 'bg-transparent'
            }`}
          >
            <span className="font-mono text-[11.5px] leading-none font-medium text-ink/45">
              {task.id}
            </span>
            <span className="flex min-w-0 items-center gap-[9px] pr-4">
              <span className="truncate text-[13.5px] leading-[1.35] font-medium">{task.title}</span>
              {task.labels.map((label) => (
                <span
                  key={label}
                  className="flex-none rounded bg-ink/6 px-1.5 py-[3px] font-mono text-[10px] leading-none font-medium text-ink/55"
                >
                  {label}
                </span>
              ))}
            </span>
            <span className="flex items-center gap-[7px] text-xs leading-none font-medium text-ink/80">
              <StatusDot color={status.color} />
              {status.name}
            </span>
            <span className="flex items-center">
              <Avatar
                init={assignee.init}
                color={assignee.color}
                size={22}
                title={assignee.name}
                pending={assignee.pending}
              />
            </span>
            <span
              className="font-mono text-xs leading-none"
              style={{ color: task.overdue ? '#2e2e2e' : 'rgba(23,23,23,.55)' }}
            >
              {task.due}
            </span>
            <span className="flex items-center justify-end gap-[9px] font-mono text-[11px] leading-none text-ink/42">
              {task.files.length > 0 && <span title="Files">◫{task.files.length}</span>}
              {task.comments.length > 0 && <span title="Comments">◌{task.comments.length}</span>}
            </span>
          </div>
        )
      })}

      {workspaceEmpty && <EmptyWorkspace />}
      {noMatches && <NoMatches />}
    </div>
  )
}
