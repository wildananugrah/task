import { useEffect, useState } from 'react'
import { ACCENT } from '../lib/config'
import { mentionHeader, mentionItems } from '../lib/mentions'
import { memberOf, selectedTask } from '../lib/select'
import { extensionOf, replaceTrailingToken, trailingToken } from '../lib/text'
import { CURRENT_USER } from '../data/seed'
import { useApp } from '../state/useApp'
import MentionMenu from './MentionMenu'
import RichText from './RichText'
import Avatar from './ui/Avatar'
import StatusDot from './ui/StatusDot'

function FieldLabel({ children }) {
  return (
    <span className="font-mono text-[11px] leading-none font-semibold tracking-[.09em] text-ink/45 uppercase">
      {children}
    </span>
  )
}

function FileDrop({ onFiles }) {
  const [over, setOver] = useState(false)

  const namesFrom = (list) => Array.from(list || []).map((file) => file.name)

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const names = namesFrom(event.dataTransfer?.files)
        onFiles(names.length ? names : ['dropped-file.pdf'])
      }}
      style={{
        borderColor: over ? ACCENT : 'rgba(23,23,23,.22)',
        background: over ? 'rgba(23,23,23,.05)' : '#fafafa',
      }}
      className="flex cursor-pointer flex-col items-center gap-[5px] rounded-[10px] border-[1.5px] border-dashed p-[22px] transition-colors"
    >
      <input
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          onFiles(namesFrom(event.target.files))
          event.target.value = ''
        }}
      />
      <span className="text-[13px] leading-none font-medium text-ink/70">Drop files here</span>
      <span className="font-mono text-[11.5px] leading-none text-ink/45">
        or click to browse · max 25 MB
      </span>
    </label>
  )
}

function CommentComposer({ taskId }) {
  const { state, actions } = useApp()
  const [text, setText] = useState('')
  const token = trailingToken(text)
  const items = mentionItems(state, token, 'workspace')

  return (
    <div className="flex items-start gap-[11px]">
      <Avatar init={CURRENT_USER.init} color={CURRENT_USER.color} size={28} />
      <div className="relative flex flex-1 flex-col gap-2">
        {token && items.length > 0 && (
          <MentionMenu
            header={mentionHeader(token)}
            items={items}
            onPick={(item) => setText(replaceTrailingToken(text, token.token, item.insert))}
            className="absolute right-0 bottom-[calc(100%+6px)] left-0 z-5"
          />
        )}
        <textarea
          value={text}
          rows={2}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write a comment… @ to mention, / to link a task"
          aria-label="Write a comment"
          className="resize-y rounded-lg border border-ink/16 bg-subtle px-3 py-2.5 text-[13px] leading-[1.6]"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (!text.trim()) return
              actions.addComment(taskId, text.trim())
              setText('')
            }}
            className="cursor-pointer rounded-[7px] bg-ink px-3.5 py-2 text-[12.5px] leading-none font-semibold text-white"
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TaskDrawer() {
  const { state, actions } = useApp()
  const task = selectedTask(state)
  const editing = state.editing
  const [draft, setDraft] = useState({ title: '', desc: '' })
  const [draftFor, setDraftFor] = useState(null)

  // Each time a different task enters edit mode the draft reloads from it.
  // Adjusting during render keeps the fields correct without a second pass.
  const editKey = task && editing ? task.id : null
  if (editKey !== draftFor) {
    setDraftFor(editKey)
    setDraft(editKey ? { title: task.title, desc: task.desc } : { title: '', desc: '' })
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') actions.closeTask()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])

  if (!task) return null

  const assignee = memberOf(state, task.assignee)

  return (
    <>
      <div
        onClick={actions.closeTask}
        className="fixed inset-0 z-55 animate-fade-in bg-ink/28"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${task.id} ${task.title}`}
        className="absolute inset-y-0 right-0 z-56 flex w-[min(620px,88%)] animate-slide-in flex-col border-l border-ink/12 bg-panel shadow-[-14px_0_44px_rgba(23,23,23,.16)]"
      >
        <div className="flex items-center gap-2.5 border-b border-ink/9 px-[18px] py-3.5">
          <span className="font-mono text-xs leading-none font-medium text-ink/45">{task.id}</span>
          <span className="flex-1" />

          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  actions.saveTask(task.id, draft)
                  actions.setEditing(false)
                }}
                className="cursor-pointer rounded-[7px] bg-ink px-[13px] py-[7px] text-xs leading-none font-semibold text-white"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => actions.setEditing(false)}
                className="cursor-pointer rounded-[7px] border border-ink/16 bg-panel px-[11px] py-[7px] text-xs leading-none font-medium"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => actions.setEditing(true)}
                className="cursor-pointer rounded-[7px] border border-ink/16 bg-panel px-[11px] py-[7px] text-xs leading-none font-medium hover:bg-subtle"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => actions.askConfirm('task')}
                className="cursor-pointer rounded-[7px] border border-ink/22 bg-panel px-[11px] py-[7px] text-xs leading-none font-medium text-shell hover:bg-[#f4f4f3]"
              >
                Delete
              </button>
            </>
          )}

          <button
            type="button"
            onClick={actions.closeTask}
            aria-label="Close task"
            className="size-7 cursor-pointer rounded-[7px] bg-transparent text-sm text-ink/50 hover:bg-canvas"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-[22px] pb-7">
          <div className="flex flex-col gap-3">
            {editing ? (
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                aria-label="Task title"
                className="rounded-lg border border-ink/16 bg-subtle px-3 py-2.5 text-[19px] leading-[1.3] font-semibold"
              />
            ) : (
              <h2 className="m-0 text-xl leading-[1.3] font-semibold tracking-[-.015em] text-pretty">
                {task.title}
              </h2>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {state.statuses.map((status) => {
                const on = status.id === task.status
                return (
                  <button
                    key={status.id}
                    type="button"
                    onClick={() => actions.setTaskStatus(task.id, status.id)}
                    aria-pressed={on}
                    style={{
                      borderColor: on ? '#1f1f1f' : 'rgba(23,23,23,.14)',
                      background: on ? '#1f1f1f' : '#fff',
                      color: on ? '#fff' : 'rgba(23,23,23,.7)',
                    }}
                    className="flex cursor-pointer items-center gap-[7px] rounded-[20px] border px-[11px] py-1.5 text-xs leading-none font-medium"
                  >
                    <StatusDot color={on ? '#fff' : status.color} />
                    {status.name}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 rounded-[10px] border border-ink/9 bg-subtle px-3.5 py-[13px]">
              <span className="flex flex-col gap-[5px]">
                <FieldLabel>Assignee</FieldLabel>
                <span className="flex items-center gap-2 text-[13px] leading-none">
                  <Avatar init={assignee.init} color={assignee.color} size={22} />
                  {assignee.name}
                </span>
              </span>
              <span className="flex flex-col gap-[5px]">
                <FieldLabel>Due</FieldLabel>
                <span className="text-[13px] leading-none">{task.due}</span>
              </span>
              <span className="flex flex-col gap-[5px]">
                <FieldLabel>Labels</FieldLabel>
                <span className="flex flex-wrap gap-1.5">
                  {task.labels.map((label) => (
                    <span
                      key={label}
                      className="rounded bg-ink/7 px-[7px] py-1 font-mono text-[10.5px] leading-none font-medium text-ink/60"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-[9px]">
            <FieldLabel>Description</FieldLabel>
            {editing ? (
              <textarea
                value={draft.desc}
                rows={5}
                onChange={(event) => setDraft({ ...draft, desc: event.target.value })}
                aria-label="Description"
                className="resize-y rounded-lg border border-ink/16 bg-subtle px-3 py-[11px] text-[13.5px] leading-[1.65]"
              />
            ) : (
              <p className="m-0 text-[13.5px] leading-[1.7] text-ink/75 text-pretty">{task.desc}</p>
            )}
          </div>

          <div className="flex flex-col gap-[9px]">
            <FieldLabel>Files · {task.files.length}</FieldLabel>
            {task.files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-[11px] rounded-[9px] border border-ink/9 bg-panel px-3 py-2.5"
              >
                <span className="flex size-[30px] flex-none items-center justify-center rounded-md bg-ink/6 font-mono text-[9px] leading-none font-semibold text-ink/55">
                  {file.ext}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[12.5px] leading-[1.2] font-medium">{file.name}</span>
                  <span className="font-mono text-[11px] leading-none text-ink/45">
                    {file.meta}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => actions.removeTaskFile(task.id, index)}
                  aria-label={`Remove ${file.name}`}
                  className="cursor-pointer bg-transparent text-xs text-ink/35 hover:text-shell"
                >
                  ✕
                </button>
              </div>
            ))}

            <FileDrop
              onFiles={(names) =>
                actions.addTaskFiles(
                  task.id,
                  names.map((name) => ({
                    name,
                    ext: extensionOf(name),
                    meta: `just now · ${CURRENT_USER.name}`,
                  })),
                )
              }
            />
          </div>

          <div className="flex flex-col gap-3">
            <FieldLabel>Comments · {task.comments.length}</FieldLabel>
            {task.comments.map((comment, index) => (
              <div key={`${comment.who}-${index}`} className="flex gap-[11px]">
                <Avatar init={comment.init} color={comment.color} size={28} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[12.5px] leading-none font-semibold">{comment.who}</span>
                    <span className="font-mono text-[11px] leading-none text-ink/42">
                      {comment.when}
                    </span>
                  </span>
                  <span className="text-[13px] leading-[1.6] text-ink/78">
                    <RichText text={comment.text} />
                  </span>
                </span>
              </div>
            ))}

            <CommentComposer key={task.id} taskId={task.id} />
          </div>
        </div>
      </div>
    </>
  )
}
