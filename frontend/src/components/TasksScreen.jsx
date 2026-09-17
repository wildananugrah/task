import { currentWorkspace, filteredTasks, hasActiveFilter, workspaceTasks } from '../lib/select'
import { useApp } from '../state/useApp'
import FilterBar from './FilterBar'
import TaskBoardView from './TaskBoardView'
import TaskListView from './TaskListView'

function ViewToggle() {
  const { state, actions } = useApp()

  return (
    <div className="flex rounded-lg border border-ink/12 bg-panel p-0.5">
      {['list', 'board'].map((view) => {
        const active = state.view === view
        return (
          <button
            key={view}
            type="button"
            onClick={() => actions.setView(view)}
            aria-pressed={active}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] leading-none font-medium capitalize ${
              active ? 'bg-shell text-white' : 'bg-transparent text-ink/60'
            }`}
          >
            {view}
          </button>
        )
      })}
    </div>
  )
}

export default function TasksScreen() {
  const { state, actions } = useApp()
  const workspace = currentWorkspace(state)
  const tasks = filteredTasks(state)
  const all = workspaceTasks(state)

  const workspaceEmpty = all.length === 0 && !state.query
  const noMatches = tasks.length === 0 && !workspaceEmpty && hasActiveFilter(state)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3.5 border-b border-ink/9 bg-canvas px-7 pt-5 pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-2.5">
            <h1 className="m-0 text-xl leading-[1.2] font-semibold tracking-[-.015em]">Tasks</h1>
            <span className="font-mono text-xs leading-none text-ink/45">
              {workspace.name} · {tasks.length} shown
            </span>
          </div>
          <div className="flex items-center gap-[9px]">
            <ViewToggle />
            <button
              type="button"
              onClick={() => actions.createTask(null)}
              className="cursor-pointer rounded-lg bg-ink px-3.5 py-2 text-[12.5px] leading-none font-semibold text-white hover:bg-ink-strong"
            >
              ＋ New task
            </button>
          </div>
        </div>

        <FilterBar />
      </header>

      {state.view === 'list' ? (
        <TaskListView tasks={tasks} workspaceEmpty={workspaceEmpty} noMatches={noMatches} />
      ) : (
        <TaskBoardView tasks={tasks} noMatches={noMatches} />
      )}
    </div>
  )
}
