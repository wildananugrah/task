import { useState } from 'react'
import { currentWorkspace, selectedTask, workspaceTasks } from '../lib/select'
import { useApp } from '../state/useApp'
import Dialog, { DialogFooter, Field, inputClass } from './ui/Dialog'

export default function ConfirmDialog() {
  const { state, actions } = useApp()
  const [typed, setTyped] = useState('')

  const kind = state.confirm
  const workspace = currentWorkspace(state)
  const task = selectedTask(state)
  const total = workspaceTasks(state).length

  const copy = {
    task: {
      title: `Delete ${task?.id ?? ''}?`,
      body: `“${task?.title ?? ''}” will be removed along with its ${task?.files.length ?? 0} files and ${
        task?.comments.length ?? 0
      } comments. This cannot be undone.`,
      cta: 'Delete task',
    },
    archive: {
      title: `Archive ${workspace.name}?`,
      body: `The workspace and its ${total} tasks are hidden from everyone. An admin can restore it later.`,
      cta: 'Archive workspace',
    },
    delete: {
      title: `Delete ${workspace.name}?`,
      body: `This permanently removes the workspace, its ${total} tasks, their files and comments. This cannot be undone.`,
      cta: 'Delete workspace',
    },
  }[kind]

  const close = () => {
    setTyped('')
    actions.cancelConfirm()
  }

  const enabled = kind !== 'delete' || typed.trim() === workspace.name

  return (
    <Dialog onClose={close} width={420} scrim={40} zIndex={74} label={copy.title}>
      <div className="flex flex-col gap-[7px] px-[22px] pt-5 pb-4">
        <h2 className="m-0 text-[16.5px] leading-[1.25] font-semibold tracking-[-.015em]">
          {copy.title}
        </h2>
        <p className="m-0 text-[13px] leading-[1.6] text-ink/60 text-pretty">{copy.body}</p>
      </div>

      {kind === 'delete' && (
        <div className="px-[22px] pb-[18px]">
          <Field label="Type the workspace name to confirm">
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={workspace.name}
              className={inputClass}
            />
          </Field>
        </div>
      )}

      <DialogFooter
        onCancel={close}
        confirmLabel={copy.cta}
        enabled={enabled}
        onConfirm={() => {
          if (!enabled) return
          setTyped('')
          actions.runConfirm()
        }}
      />
    </Dialog>
  )
}
