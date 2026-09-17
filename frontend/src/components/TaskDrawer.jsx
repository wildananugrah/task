import { useEffect, useRef, useState } from 'react'
import { ACCENT } from '../lib/config'
import { formatDue, formatWhen, fileMeta, isOverdue } from '../lib/format'
import { mentionHeader, mentionItems } from '../lib/mentions'
import { assignableMembers, canEdit, detailOf, memberOf, selectedTask } from '../lib/select'
import { replaceTrailingToken, trailingToken } from '../lib/text'
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

function FileDrop({ onFiles, busy }) {
  const [over, setOver] = useState(false)

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
        if (event.dataTransfer?.files?.length) onFiles(event.dataTransfer.files)
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
          if (event.target.files?.length) onFiles(event.target.files)
          event.target.value = ''
        }}
      />
      <span className="text-[13px] leading-none font-medium text-ink/70">
        {busy ? 'Uploading…' : 'Drop files here'}
      </span>
      <span className="font-mono text-[11.5px] leading-none text-ink/45">
        or click to browse · max 25 MB
      </span>
    </label>
  )
}

/** A popover list used by the assignee and label editors in the drawer. */
function Popover({ open, onClose, children, className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={`absolute z-30 w-[236px] overflow-hidden rounded-[10px] border border-ink/12 bg-panel shadow-[0_12px_30px_rgba(23,23,23,.18)] ${className}`}
    >
      {children}
    </div>
  )
}

function AssigneeField({ task, editable }) {
  const { state, actions } = useApp()
  const [open, setOpen] = useState(false)
  const assignee = memberOf(state, task.assigneeId)
  const options = assignableMembers(state)

  const pick = (userId) => {
    setOpen(false)
    actions.saveTask(task.id, { assigneeId: userId })
  }

  return (
    <span className="relative flex flex-col gap-[5px]">
      <FieldLabel>Assignee</FieldLabel>
      <button
        type="button"
        disabled={!editable}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Assignee: ${assignee.name}`}
        className={`-mx-1 flex items-center gap-2 rounded-md bg-transparent px-1 py-0.5 text-left text-[13px] leading-none ${
          editable ? 'cursor-pointer hover:bg-ink/6' : 'cursor-default'
        }`}
      >
        <Avatar
          init={assignee.initials}
          color={assignee.color}
          src={assignee.avatarUrl}
          size={22}
        />
        {assignee.name}
      </button>

      <Popover open={open} onClose={() => setOpen(false)} className="top-[52px] left-0">
        <button
          type="button"
          onClick={() => pick(null)}
          className="flex w-full cursor-pointer items-center gap-2 border-b border-b-ink/6 bg-transparent px-3 py-2.5 text-left text-[12.5px] leading-none font-medium hover:bg-canvas"
        >
          Unassigned
        </button>
        {options.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => pick(member.userId)}
            className={`flex w-full cursor-pointer items-center gap-2 border-b border-b-ink/6 px-3 py-2 text-left hover:bg-canvas ${
              member.userId === task.assigneeId ? 'bg-canvas' : 'bg-transparent'
            }`}
          >
            <Avatar
              init={member.initials}
              color={member.color}
              src={member.avatarUrl}
              size={22}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] leading-none font-medium">
              {member.name}
            </span>
            <span className="w-3 flex-none text-xs leading-none font-semibold">
              {member.userId === task.assigneeId ? '✓' : ''}
            </span>
          </button>
        ))}
      </Popover>
    </span>
  )
}

function DueField({ task, editable }) {
  const { actions } = useApp()
  const overdue = isOverdue(task.dueDate)

  if (!editable) {
    return (
      <span className="flex flex-col gap-[5px]">
        <FieldLabel>Due</FieldLabel>
        <span
          className="text-[13px] leading-none"
          style={{ color: overdue ? '#2e2e2e' : undefined }}
        >
          {formatDue(task.dueDate)}
        </span>
      </span>
    )
  }

  return (
    <span className="flex flex-col gap-[5px]">
      <FieldLabel>Due</FieldLabel>
      <span className="flex items-center gap-1.5">
        <input
          type="date"
          value={task.dueDate ?? ''}
          aria-label="Due date"
          onChange={(event) => actions.saveTask(task.id, { dueDate: event.target.value || null })}
          className="-mx-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-[12.5px] leading-none hover:border-ink/14 hover:bg-subtle"
          style={{ color: overdue ? '#2e2e2e' : undefined }}
        />
        {task.dueDate && (
          <button
            type="button"
            onClick={() => actions.saveTask(task.id, { dueDate: null })}
            aria-label="Clear due date"
            className="cursor-pointer bg-transparent text-[11px] text-ink/35 hover:text-ink"
          >
            ✕
          </button>
        )}
      </span>
    </span>
  )
}

function LabelsField({ task, editable }) {
  const { state, actions } = useApp()
  const [open, setOpen] = useState(false)

  const toggle = (name) => {
    const next = task.labels.includes(name)
      ? task.labels.filter((label) => label !== name)
      : [...task.labels, name]
    actions.saveTask(task.id, { labels: next })
  }

  return (
    <span className="relative flex flex-col gap-[5px]">
      <FieldLabel>Labels</FieldLabel>
      <span className="flex flex-wrap items-center gap-1.5">
        {task.labels.map((label) => (
          <span
            key={label}
            className="rounded bg-ink/7 px-[7px] py-1 font-mono text-[10.5px] leading-none font-medium text-ink/60"
          >
            {label}
          </span>
        ))}
        {editable && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label="Edit labels"
            className="cursor-pointer rounded border border-dashed border-ink/25 bg-transparent px-[7px] py-1 font-mono text-[10.5px] leading-none text-ink/45 hover:border-ink hover:text-ink"
          >
            ＋
          </button>
        )}
      </span>

      <Popover open={open} onClose={() => setOpen(false)} className="top-[52px] left-0">
        {state.labels.map((label) => {
          const on = task.labels.includes(label.name)
          return (
            <button
              key={label.id}
              type="button"
              onClick={() => toggle(label.name)}
              className={`flex w-full cursor-pointer items-center gap-2 border-b border-b-ink/6 px-3 py-2 text-left hover:bg-canvas ${
                on ? 'bg-canvas' : 'bg-transparent'
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] leading-none font-medium text-ink/70">
                {label.name}
              </span>
              <span className="w-3 flex-none text-xs leading-none font-semibold">
                {on ? '✓' : ''}
              </span>
            </button>
          )
        })}
        {state.labels.length === 0 && (
          <div className="px-3 py-3.5 text-center text-[12px] leading-[1.4] text-ink/50">
            No labels yet. Add them in workspace settings.
          </div>
        )}
      </Popover>
    </span>
  )
}

function CommentComposer({ taskId }) {
  const { state, actions } = useApp()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const token = trailingToken(text)
  const items = mentionItems(state, token, 'workspace')

  const submit = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setText('')
    await actions.addComment(taskId, body)
    setSending(false)
  }

  return (
    <div className="flex items-start gap-[11px]">
      <Avatar
        init={state.me?.initials ?? '??'}
        color={state.me?.color ?? '#8c8c8c'}
        src={state.me?.avatarUrl}
        size={28}
      />
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
            onClick={submit}
            disabled={sending}
            className="cursor-pointer rounded-[7px] bg-ink px-3.5 py-2 text-[12.5px] leading-none font-semibold text-white disabled:cursor-wait disabled:bg-ink/40"
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
  const detail = task ? detailOf(state, task.id) : null
  const editable = canEdit(state)

  const [draft, setDraft] = useState({ title: '', description: '' })
  const [draftFor, setDraftFor] = useState(null)
  const [uploading, setUploading] = useState(false)

  // Each time a different task enters edit mode the draft reloads from it.
  // Adjusting during render keeps the fields correct without a second pass.
  const editKey = task && editing ? task.id : null
  if (editKey !== draftFor) {
    setDraftFor(editKey)
    setDraft(
      editKey ? { title: task.title, description: task.description } : { title: '', description: '' },
    )
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') actions.closeTask()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [actions])

  if (!task) return null

  const files = detail?.files ?? []
  const comments = detail?.comments ?? []

  const upload = async (fileList) => {
    setUploading(true)
    await actions.uploadFiles(task.id, fileList)
    setUploading(false)
  }

  return (
    <>
      <div onClick={actions.closeTask} className="fixed inset-0 z-55 animate-fade-in bg-ink/28" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${task.ref} ${task.title}`}
        className="absolute inset-y-0 right-0 z-56 flex w-[min(620px,88%)] animate-slide-in flex-col border-l border-ink/12 bg-panel shadow-[-14px_0_44px_rgba(23,23,23,.16)]"
      >
        <div className="flex items-center gap-2.5 border-b border-ink/9 px-[18px] py-3.5">
          <span className="font-mono text-xs leading-none font-medium text-ink/45">{task.ref}</span>
          <span className="flex-1" />

          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  actions.saveTask(task.id, {
                    title: draft.title.trim() || task.title,
                    description: draft.description,
                  })
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
            editable && (
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
            )
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
                const on = status.id === task.statusId
                return (
                  <button
                    key={status.id}
                    type="button"
                    disabled={!editable}
                    onClick={() => actions.setTaskStatus(task.id, status.id)}
                    aria-pressed={on}
                    style={{
                      borderColor: on ? '#1f1f1f' : 'rgba(23,23,23,.14)',
                      background: on ? '#1f1f1f' : '#fff',
                      color: on ? '#fff' : 'rgba(23,23,23,.7)',
                    }}
                    className={`flex items-center gap-[7px] rounded-[20px] border px-[11px] py-1.5 text-xs leading-none font-medium ${
                      editable ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <StatusDot color={on ? '#fff' : status.color} />
                    {status.name}
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 rounded-[10px] border border-ink/9 bg-subtle px-3.5 py-[13px]">
              <AssigneeField task={task} editable={editable} />
              <DueField task={task} editable={editable} />
              <LabelsField task={task} editable={editable} />
            </div>
          </div>

          <div className="flex flex-col gap-[9px]">
            <FieldLabel>Description</FieldLabel>
            {editing ? (
              <textarea
                value={draft.description}
                rows={5}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                aria-label="Description"
                className="resize-y rounded-lg border border-ink/16 bg-subtle px-3 py-[11px] text-[13.5px] leading-[1.65]"
              />
            ) : (
              <p className="m-0 text-[13.5px] leading-[1.7] text-ink/75 text-pretty">
                {task.description || 'No description yet.'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-[9px]">
            <FieldLabel>Files · {files.length}</FieldLabel>
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-[11px] rounded-[9px] border border-ink/9 bg-panel px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() =>
                    actions.openPreview({ ...file, taskRef: task.ref, taskTitle: task.title })
                  }
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-[11px] bg-transparent text-left"
                >
                  <span className="flex size-[30px] flex-none items-center justify-center rounded-md bg-ink/6 font-mono text-[9px] leading-none font-semibold text-ink/55">
                    {file.ext}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[12.5px] leading-[1.2] font-medium">
                      {file.name}
                    </span>
                    <span className="font-mono text-[11px] leading-none text-ink/45">
                      {fileMeta(file)}
                    </span>
                  </span>
                </button>
                {editable && (
                  <button
                    type="button"
                    onClick={() => actions.removeTaskFile(task.id, file.id)}
                    aria-label={`Remove ${file.name}`}
                    className="cursor-pointer bg-transparent text-xs text-ink/35 hover:text-shell"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {editable && <FileDrop onFiles={upload} busy={uploading} />}
          </div>

          <div className="flex flex-col gap-3">
            <FieldLabel>Comments · {comments.length}</FieldLabel>
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-[11px]">
                <Avatar
                  init={comment.author?.initials ?? '??'}
                  color={comment.author?.color ?? '#8c8c8c'}
                  src={comment.author?.avatarUrl}
                  size={28}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[12.5px] leading-none font-semibold">
                      {comment.author?.name ?? 'Someone'}
                    </span>
                    <span className="font-mono text-[11px] leading-none text-ink/42">
                      {formatWhen(comment.createdAt)}
                    </span>
                  </span>
                  <span className="text-[13px] leading-[1.6] text-ink/78">
                    <RichText text={comment.body} />
                  </span>
                </span>
              </div>
            ))}

            {editable && <CommentComposer key={task.id} taskId={task.id} />}
          </div>
        </div>
      </div>
    </>
  )
}
