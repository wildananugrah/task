import { useApp } from '../state/useApp'
import StatusDot from './ui/StatusDot'

/** Results panel anchored under the sidebar search field, served by the API. */
export default function GlobalSearch() {
  const { state, actions } = useApp()
  const matches = state.searchResults

  return (
    <>
      <div onClick={actions.closeGlobal} className="fixed inset-0 z-60" />
      <div className="fixed top-[92px] left-[264px] z-61 w-[min(460px,calc(100vw-290px))] animate-pop-in overflow-hidden rounded-[11px] border border-ink/14 bg-panel shadow-[0_14px_40px_rgba(23,23,23,.18)]">
        <div className="flex items-center justify-between border-b border-ink/8 bg-subtle px-[13px] py-[9px]">
          <span className="font-mono text-[10px] leading-none font-medium tracking-[.09em] text-ink/45 uppercase">
            Tasks
          </span>
          <span className="font-mono text-[10.5px] leading-none text-ink/42">
            {matches.length} match
          </span>
        </div>

        <div className="max-h-[340px] overflow-y-auto">
          {matches.slice(0, 8).map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => actions.revealTask(task.id)}
              className="flex w-full cursor-pointer items-center gap-[11px] border-b border-b-ink/6 bg-transparent px-[13px] py-[11px] text-left hover:bg-canvas"
            >
              <span className="flex-none font-mono text-[11px] leading-none font-medium text-ink/45">
                {task.ref}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="truncate text-[13px] leading-[1.25] font-medium">{task.title}</span>
                <span className="truncate font-mono text-[11px] leading-none text-ink/45">
                  {task.workspaceName}
                  {task.assignee ? ` · ${task.assignee.name}` : ''}
                </span>
              </span>
              {task.status && (
                <span className="flex flex-none items-center gap-1.5 text-[11.5px] leading-none font-medium text-ink/65">
                  <StatusDot color={task.status.color} />
                  {task.status.name}
                </span>
              )}
            </button>
          ))}

          {matches.length === 0 && (
            <div className="px-3.5 py-[26px] text-center text-[13px] leading-[1.5] text-ink/50">
              Nothing matches “{state.gq}”.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
