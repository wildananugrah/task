import { useState } from 'react'
import { ROLES, ROLE_HINT, ROLE_LABEL } from '../lib/constants'
import { currentWorkspace } from '../lib/select'
import { emailsFrom } from '../lib/format'
import { useApp } from '../state/useApp'
import Dialog, { DialogFooter, DialogHeader, Field, inputClass } from './ui/Dialog'

export default function InviteDialog() {
  const { state, actions } = useApp()
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState('member')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const workspace = currentWorkspace(state)
  const recipients = emailsFrom(emails)

  const send = async () => {
    if (!recipients.length || sending) return
    setSending(true)
    await actions.inviteMembers(recipients, role)
    setSending(false)
  }

  return (
    <Dialog onClose={actions.closeInvite} width={470} label="Invite people">
      <DialogHeader title={`Invite to ${workspace.name}`}>
        The invite waits under their email address. It becomes membership the first time they sign
        in with it.
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
                  {ROLE_LABEL[option]}
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
        confirmLabel={sending ? 'Sending…' : 'Send invites'}
        enabled={recipients.length > 0 && !sending}
        onConfirm={send}
      />
    </Dialog>
  )
}
