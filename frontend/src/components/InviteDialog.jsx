import { useState } from 'react'
import { ROLES, ROLE_HINT } from '../data/seed'
import { currentWorkspace } from '../lib/select'
import { emailsFrom } from '../lib/text'
import { useApp } from '../state/useApp'
import Dialog, { DialogFooter, DialogHeader, Field, inputClass } from './ui/Dialog'

export default function InviteDialog() {
  const { state, actions } = useApp()
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState('Member')
  const [note, setNote] = useState('')

  const workspace = currentWorkspace(state)
  const recipients = emailsFrom(emails)

  return (
    <Dialog onClose={actions.closeInvite} width={470} label="Invite people">
      <DialogHeader title={`Invite to ${workspace.name}`}>
        They get an email with a join link. Invites stay pending until accepted.
      </DialogHeader>

      <div className="flex flex-col gap-4 px-[22px] py-[18px]">
        <Field
          label="Email addresses"
          hint={`Separate with commas · ${recipients.length} recipient${
            recipients.length === 1 ? '' : 's'
          }`}
        >
          <textarea
            value={emails}
            rows={2}
            onChange={(event) => setEmails(event.target.value)}
            placeholder="rani@team.co, dimas@team.co"
            className={`${inputClass} resize-y leading-[1.6]`}
          />
        </Field>

        <div className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] leading-none font-medium tracking-[.04em] text-ink/50 uppercase">
            Role
          </span>
          <div className="flex flex-wrap gap-[7px]">
            {ROLES.map((option) => {
              const on = option === role
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRole(option)}
                  aria-pressed={on}
                  style={{
                    borderColor: on ? '#171717' : 'rgba(23,23,23,.16)',
                    background: on ? '#171717' : '#fff',
                    color: on ? '#fff' : 'rgba(23,23,23,.7)',
                  }}
                  className="cursor-pointer rounded-[20px] border px-[13px] py-[7px] text-xs leading-none font-medium"
                >
                  {option}
                </button>
              )
            })}
          </div>
          <span className="text-xs leading-[1.5] text-ink/55">{ROLE_HINT[role]}</span>
        </div>

        <Field label="Message" optional>
          <textarea
            value={note}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Short note about what they will be working on"
            className={`${inputClass} resize-y text-[13px] leading-[1.6]`}
          />
        </Field>
      </div>

      <DialogFooter
        onCancel={actions.closeInvite}
        confirmLabel="Send invites"
        enabled={recipients.length > 0}
        onConfirm={() => actions.inviteMembers(recipients, role)}
      />
    </Dialog>
  )
}
