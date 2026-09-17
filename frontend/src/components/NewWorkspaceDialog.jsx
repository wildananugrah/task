import { useState } from 'react'
import { useApp } from '../state/useApp'
import Dialog, { DialogFooter, DialogHeader, Field, inputClass } from './ui/Dialog'

const lettersOnly = (value) => value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()

export default function NewWorkspaceDialog() {
  const { actions } = useApp()
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [touched, setTouched] = useState(false)

  const valid = Boolean(name.trim()) && prefix.length === 3

  const hint =
    prefix.length === 3
      ? `Tasks will be numbered ${prefix}-101, ${prefix}-102, …`
      : 'Exactly 3 letters, e.g. PRF or TSK'

  return (
    <Dialog onClose={actions.closeNewWorkspace} width={440} label="New workspace">
      <DialogHeader title="New workspace">
        Every workspace keeps its own tasks, statuses and members.
      </DialogHeader>

      <div className="flex flex-col gap-4 px-[22px] py-[18px]">
        <Field label="Workspace name">
          <input
            value={name}
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
              // The prefix follows the name until someone types their own.
              if (!touched) setPrefix(lettersOnly(event.target.value))
            }}
            placeholder="e.g. Product Refresh"
            className={`${inputClass} text-sm`}
          />
        </Field>

        <Field label="Task prefix" hint={hint}>
          <input
            value={prefix}
            maxLength={3}
            onChange={(event) => {
              setTouched(true)
              setPrefix(lettersOnly(event.target.value))
            }}
            placeholder="PRF"
            className={`${inputClass} w-[120px] font-mono text-sm leading-none font-medium tracking-[.14em]`}
          />
        </Field>
      </div>

      <DialogFooter
        onCancel={actions.closeNewWorkspace}
        confirmLabel="Create workspace"
        enabled={valid}
        onConfirm={() => valid && actions.createWorkspace({ name, prefix })}
      />
    </Dialog>
  )
}
