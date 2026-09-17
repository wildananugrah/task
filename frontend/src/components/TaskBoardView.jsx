import { useState } from 'react'
import { canEdit, memberOf } from '../lib/select'
import { useApp } from '../state/useApp'
import Avatar from './ui/Avatar'
import StatusDot from './ui/StatusDot'
import { NoMatches } from './TaskListView'

export default function TaskBoardView({ tasks, noMatches }) {
  const { state, actions } = useApp()
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const editable = canEdit(state)

  const drop = (statusId) => {
    setOver(null)
    const taskId = dragging
    setDragging(null)
    if (!taskId) return
    const task = state.tasks.find((candidate) => candidate.id === taskId)
    if (!task || task.statusId === statusId) return
    actions.setTaskStatus(taskId, statusId)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-7 pt-[18px] pb-7">
      {noMatches && <NoMatches padding="py-12" />}

      <div className="flex min-h-full items-start gap-3.5">
        {state.statuses.map((status) => {
          const items = tasks.filter((task) => task.statusId === status.id)

          return (
            <div
              key={status.id}
              onDragOver={(event) => {
                if (!editable || !dragging) return
                event.preventDefault()
                setOver(status.id)
              }}
              onDragLeave={() => setOver((current) => (current === status.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault()
                drop(status.id)
              }}
              className={`flex w-[266px] flex-none flex-col gap-2.5 rounded-xl p-1 ${
                over === status.id ? 'bg-ink/5 outline-[1.5px] outline-dashed outline-ink/25' : ''
              }`}
            >
              <div className="flex items-center gap-2 px-1">
                <StatusDot color={status.color} />
                <span className="flex-1 text-[12.5px] leading-none font-semibold">
                  {status.name}
                </span>
                <span className="font-mono text-[11px] leading-none font-medium text-ink/42">
                  {items.length}
                </span>
              </div>

              <div className="flex flex-col gap-[9px]">
                {items.map((task) => {
                  const assignee = memberOf(state, task.assigneeId)
                  return (
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      draggable={editable}
                      onDragStart={() => setDragging(task.id)}
                      onDragEnd={() => {
                        setDragging(null)
                        setOver(null)
                      }}
                      onClick={() => actions.selectTask(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          actions.selectTask(task.id)
                        }
                      }}
                      aria-label={`${task.ref}: ${task.title}`}
                      className={`flex cursor-pointer flex-col gap-2.5 rounded-[10px] border border-ink/9 bg-panel p-3 shadow-[0_1px_2px_rgba(23,23,23,.04)] transition-shadow hover:border-ink/45 hover:shadow-[0_5px_14px_rgba(23,23,23,.07)] ${
                        dragging === task.id ? 'opacity-45' : ''
                      }`}
                    >
                      <span className="text-[13px] leading-[1.4] font-medium text-pretty">
                        {task.title}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10.5px] leading-none font-medium text-ink/42">
                          {task.ref}
                        </span>
                        {task.labels.map((label) => (
                          <span
                            key={label}
                            className="rounded bg-ink/6 px-[5px] py-[3px] font-mono text-[9.5px] leading-none font-medium text-ink/55"
                          >
                            {label}
                          </span>
                        ))}
                        <span className="flex-1" />
                        <Avatar
                          init={assignee.initials}
                          color={assignee.color}
                          src={assignee.avatarUrl}
                          size={20}
                          title={assignee.name}
                          pending={assignee.status === 'pending'}
                        />
                      </span>
                    </div>
                  )
                })}

                {editable && (
                  <button
                    type="button"
                    onClick={() => actions.createTask(status.id)}
                    className="cursor-pointer rounded-[9px] border border-dashed border-ink/20 bg-transparent p-[9px] text-xs leading-none text-ink/45 hover:border-ink hover:text-ink"
                  >
                    ＋ Add task
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
