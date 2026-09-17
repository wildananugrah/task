import { useRef, useState } from 'react'
import { PALETTE, ROLES, ROLE_DESC, ROLE_LABEL } from '../lib/constants'
import { canAdmin, currentWorkspace, statusCounts } from '../lib/select'
import { useApp } from '../state/useApp'
import Avatar from './ui/Avatar'

const TABS = [
  ['statuses', 'Statuses'],
  ['members', 'Members & roles'],
  ['general', 'Name & logo'],
  ['labels', 'Labels'],
  ['danger', 'Danger zone'],
]

function SectionHead({ title, children }) {
  return (
    <div className="mb-1 flex flex-col gap-1.5">
      <h2 className="m-0 text-[15px] leading-[1.3] font-semibold">{title}</h2>
      <p className="m-0 text-[13px] leading-[1.55] text-ink/55">{children}</p>
    </div>
  )
}

function ReadOnlyNotice() {
  return (
    <div className="rounded-[10px] border border-ink/12 bg-subtle px-3.5 py-3 text-[12.5px] leading-[1.5] text-ink/60">
      You have read-only access to this workspace. Ask an admin to make changes here.
    </div>
  )
}

function StatusesTab() {
  const { state, actions } = useApp()
  const [pickerFor, setPickerFor] = useState(null)
  const [dragId, setDragId] = useState(null)
  const counts = statusCounts(state)
  const admin = canAdmin(state)

  // The drag handle was in the design from the start; the order it produces is
  // now the board's column order, stored per status.
  const dropOn = (targetId) => {
    if (!dragId || dragId === targetId) return setDragId(null)
    const ids = state.statuses.map((status) => status.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ...ids.splice(from, 1))
    setDragId(null)
    actions.reorderStatuses(ids)
  }

  return (
    <>
      <SectionHead title="Task statuses">
        These become the board columns and the status options on every task. Drag to reorder, click
        a swatch to change its colour.
      </SectionHead>

      {!admin && <ReadOnlyNotice />}

      <div className="relative rounded-[11px] border border-ink/10 bg-panel">
        {state.statuses.map((status) => (
          <div
            key={status.id}
            draggable={admin}
            onDragStart={() => setDragId(status.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(event) => dragId && event.preventDefault()}
            onDrop={() => dropOn(status.id)}
            className={`relative flex items-center gap-3 border-b border-ink/6 px-3.5 py-3 ${
              dragId === status.id ? 'opacity-45' : ''
            }`}
          >
            <span
              aria-hidden="true"
              className={`text-xs text-ink/28 ${admin ? 'cursor-grab' : 'cursor-default'}`}
            >
              ⠿
            </span>
            <button
              type="button"
              disabled={!admin}
              onClick={() => setPickerFor(pickerFor === status.id ? null : status.id)}
              title="Change colour"
              aria-label={`Change ${status.name} colour`}
              className="flex size-[22px] flex-none cursor-pointer items-center justify-center rounded-md border border-ink/14 bg-panel p-0 hover:border-ink/40 disabled:cursor-default disabled:hover:border-ink/14"
            >
              <span
                style={{ background: status.color }}
                className="size-[13px] rounded-full"
                aria-hidden="true"
              />
            </button>

            {pickerFor === status.id && (
              <div className="absolute top-11 left-[38px] z-30 grid grid-cols-[repeat(5,22px)] gap-[9px] rounded-[10px] border border-ink/12 bg-panel p-3 shadow-[0_12px_30px_rgba(23,23,23,.18)]">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => {
                      actions.updateStatus(status.id, { color })
                      setPickerFor(null)
                    }}
                    style={{
                      background: color,
                      boxShadow:
                        color === status.color
                          ? '0 0 0 2px #fff, 0 0 0 4px rgba(23,23,23,.45)'
                          : 'none',
                    }}
                    className="size-[22px] cursor-pointer rounded-full p-0"
                  />
                ))}
              </div>
            )}

            <input
              value={status.name}
              readOnly={!admin}
              onChange={(event) => actions.updateStatus(status.id, { name: event.target.value })}
              aria-label="Status name"
              className="flex-1 rounded-md border border-transparent bg-transparent px-[9px] py-[7px] text-[13.5px] leading-none font-medium read-only:cursor-default hover:border-ink/14 hover:bg-subtle read-only:hover:border-transparent read-only:hover:bg-transparent"
            />
            <span className="font-mono text-[11.5px] leading-none text-ink/42">
              {counts[status.id] || 0} tasks
            </span>
            {admin && (
              <button
                type="button"
                onClick={() => actions.removeStatus(status.id)}
                aria-label={`Delete ${status.name}`}
                title="Tasks using it move to the first status"
                className="cursor-pointer bg-transparent text-[13px] text-ink/35 hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {admin && (
          <button
            type="button"
            onClick={actions.addStatus}
            className="w-full cursor-pointer rounded-b-[11px] bg-transparent px-3.5 py-3 text-left text-[13px] leading-none font-medium hover:bg-subtle"
          >
            ＋ Add status
          </button>
        )}
      </div>
    </>
  )
}

function MembersTab() {
  const { state, actions } = useApp()
  const [menuFor, setMenuFor] = useState(null)
  const admin = canAdmin(state)

  return (
    <>
      <SectionHead title="Members & roles">
        Admins can change statuses, labels and workspace settings.
      </SectionHead>

      {!admin && <ReadOnlyNotice />}

      <div className="relative rounded-[11px] border border-ink/10 bg-panel">
        {state.members.map((member) => {
          const pending = member.status === 'pending'
          return (
            <div
              key={member.id}
              className="relative flex items-center gap-3 border-b border-ink/6 px-3.5 py-[13px]"
            >
              <Avatar
                init={member.initials}
                color={member.color}
                src={member.avatarUrl}
                size={30}
                pending={pending}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13.5px] leading-[1.2] font-medium">{member.name}</span>
                <span className="truncate font-mono text-[11.5px] leading-none text-ink/45">
                  {member.email}
                </span>
              </span>

              <button
                type="button"
                disabled={!admin}
                onClick={() => setMenuFor(menuFor === member.id ? null : member.id)}
                aria-expanded={menuFor === member.id}
                className="cursor-pointer rounded-[20px] border border-ink/14 bg-subtle px-[11px] py-1.5 text-[11.5px] leading-none font-medium hover:border-ink/40 disabled:cursor-default disabled:hover:border-ink/14"
              >
                {ROLE_LABEL[member.role]} {admin && '⌄'}
              </button>

              {menuFor === member.id && (
                <div className="absolute top-[46px] right-3.5 z-30 w-[238px] overflow-hidden rounded-[10px] border border-ink/12 bg-panel shadow-[0_12px_30px_rgba(23,23,23,.18)]">
                  {ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        actions.setMemberRole(member.id, role)
                        setMenuFor(null)
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2.5 border-b border-b-ink/6 px-3 py-2.5 text-left hover:bg-canvas ${
                        member.role === role ? 'bg-canvas' : 'bg-transparent'
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="text-[12.5px] leading-[1.2] font-medium">
                          {ROLE_LABEL[role]}
                        </span>
                        <span className="text-[11px] leading-[1.3] text-ink/50">
                          {ROLE_DESC[role]}
                        </span>
                      </span>
                      <span className="w-3 flex-none text-xs leading-none font-semibold">
                        {member.role === role ? '✓' : ''}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      actions.removeMember(member.id)
                      setMenuFor(null)
                    }}
                    className="w-full cursor-pointer bg-transparent px-3 py-2.5 text-left text-[12.5px] leading-none font-medium text-shell hover:bg-canvas"
                  >
                    Remove from workspace
                  </button>
                </div>
              )}

              {pending && (
                <span className="rounded-[5px] bg-ink/7 px-2 py-[5px] font-mono text-[10.5px] leading-none font-medium tracking-[.06em] text-ink/55 uppercase">
                  Invited
                </span>
              )}
            </div>
          )
        })}

        {admin && (
          <button
            type="button"
            onClick={actions.openInvite}
            className="w-full cursor-pointer rounded-b-[11px] bg-transparent px-3.5 py-[13px] text-left text-[13px] leading-none font-medium hover:bg-subtle"
          >
            ＋ Invite people
          </button>
        )}
      </div>
    </>
  )
}

function GeneralTab() {
  const { state, actions } = useApp()
  const workspace = currentWorkspace(state)
  const admin = canAdmin(state)
  const logoInput = useRef(null)

  const nextNumber = state.tasks.reduce((max, task) => Math.max(max, task.number), 100) + 1
  const hint =
    workspace.prefix.length === 3
      ? `Three letters. New tasks become ${workspace.prefix}-${nextNumber}.`
      : 'Enter three letters to renumber this workspace.'

  return (
    <>
      <SectionHead title="Name & logo">Shown in the sidebar and on the workspace list.</SectionHead>

      {!admin && <ReadOnlyNotice />}

      <div className="flex items-start gap-[18px] rounded-[11px] border border-ink/10 bg-panel p-[18px]">
        <div className="flex flex-col items-center gap-2">
          <Avatar
            init={workspace.initials}
            color="#171717"
            src={workspace.logoUrl}
            size={58}
            radius="14px"
          />
          {admin && (
            <>
              <input
                ref={logoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) actions.uploadWorkspaceLogo(file)
                  event.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => logoInput.current?.click()}
                className="cursor-pointer bg-transparent text-[11.5px] leading-none font-medium"
              >
                Replace
              </button>
            </>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] leading-none font-medium tracking-[.04em] text-ink/50 uppercase">
              Workspace name
            </span>
            <input
              value={workspace.name}
              readOnly={!admin}
              onChange={(event) => actions.renameWorkspace(event.target.value)}
              className="rounded-[7px] border border-ink/14 bg-subtle px-3 py-2.5 text-[13.5px]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] leading-none font-medium tracking-[.04em] text-ink/50 uppercase">
              Task ID prefix
            </span>
            <input
              value={workspace.prefix}
              maxLength={3}
              readOnly={!admin}
              onChange={(event) =>
                actions.setWorkspacePrefix(
                  event.target.value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(),
                )
              }
              className="w-[120px] rounded-[7px] border border-ink/14 bg-subtle px-3 py-2.5 font-mono text-[13px] leading-none font-medium tracking-[.08em]"
            />
            <span className="font-mono text-[11.5px] leading-[1.4] text-ink/45">{hint}</span>
          </label>
        </div>
      </div>
    </>
  )
}

function LabelsTab() {
  const { state, actions } = useApp()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const admin = canAdmin(state)

  const commit = () => {
    actions.addLabel(draft)
    setDraft('')
    setAdding(false)
  }

  return (
    <>
      <SectionHead title="Labels">
        Free-form tags for filtering. Anyone can apply them. The number shows how many tasks use each
        label; deleting removes it from those tasks.
      </SectionHead>

      {!admin && <ReadOnlyNotice />}

      <div className="flex flex-wrap items-center gap-[9px] rounded-[11px] border border-ink/10 bg-panel p-[18px]">
        {state.labels.map((label) => (
          <span
            key={label.id}
            className="flex items-center gap-2 rounded-[20px] border border-ink/12 bg-subtle px-[11px] py-[7px] font-mono text-xs leading-none font-medium text-ink/70"
          >
            {label.name}
            <span className="font-mono text-[10.5px] leading-none text-ink/40">
              {state.tasks.filter((task) => task.labels.includes(label.name)).length}
            </span>
            {admin && (
              <button
                type="button"
                onClick={() => actions.removeLabel(label.id)}
                title="Delete label"
                aria-label={`Delete ${label.name}`}
                className="cursor-pointer bg-transparent p-0 text-[11px] text-ink/35 hover:text-ink"
              >
                ✕
              </button>
            )}
          </span>
        ))}

        {admin &&
          (adding ? (
            <span className="flex items-center gap-1.5 rounded-[20px] border border-ink/28 bg-panel py-1 pr-1.5 pl-2.5">
              <input
                value={draft}
                maxLength={18}
                autoFocus
                placeholder="label name"
                aria-label="New label"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    commit()
                  }
                  if (event.key === 'Escape') {
                    setAdding(false)
                    setDraft('')
                  }
                }}
                className="w-[104px] bg-transparent font-mono text-xs leading-none font-medium outline-none"
              />
              <button
                type="button"
                onClick={commit}
                className="cursor-pointer rounded-[14px] bg-ink px-[9px] py-[5px] text-[11px] leading-none font-semibold text-white"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false)
                  setDraft('')
                }}
                aria-label="Cancel"
                className="cursor-pointer bg-transparent px-1 text-[11px] text-ink/40"
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="cursor-pointer rounded-[20px] border border-dashed border-ink/25 bg-transparent px-[11px] py-[7px] font-mono text-xs leading-none font-medium text-ink/50 hover:border-ink hover:text-ink"
            >
              ＋ new label
            </button>
          ))}
      </div>
    </>
  )
}

function DangerTab() {
  const { state, actions } = useApp()
  const workspace = currentWorkspace(state)
  const total = state.tasks.length

  if (!canAdmin(state)) {
    return (
      <>
        <SectionHead title="Danger zone">
          Archiving and deleting a workspace are admin-only.
        </SectionHead>
        <ReadOnlyNotice />
      </>
    )
  }

  return (
    <>
      <SectionHead title="Danger zone">
        Archiving hides the workspace but keeps its tasks. Deleting cannot be undone.
      </SectionHead>

      <div className="flex flex-col gap-3 rounded-[11px] border border-ink/22 bg-[#f4f4f3] p-[18px]">
        <div className="flex items-center gap-3.5">
          <span className="flex-1 text-[13px] leading-[1.5] text-ink/70">
            Archive this workspace
          </span>
          <button
            type="button"
            onClick={() => actions.askConfirm('archive')}
            className="cursor-pointer rounded-[7px] border border-ink/18 bg-panel px-[13px] py-2 text-[12.5px] leading-none font-medium hover:bg-canvas"
          >
            Archive
          </button>
        </div>

        <div className="h-px bg-ink/12" />

        <div className="flex items-center gap-3.5">
          <span className="flex-1 text-[13px] leading-[1.5] text-ink/70">
            Delete “{workspace.name}” and all {total} tasks
          </span>
          <button
            type="button"
            onClick={() => actions.askConfirm('delete')}
            className="cursor-pointer rounded-[7px] bg-shell px-[13px] py-2 text-[12.5px] leading-none font-semibold text-white hover:bg-ink-strong"
          >
            Delete workspace
          </button>
        </div>
      </div>
    </>
  )
}

export default function SettingsScreen() {
  const { state, actions } = useApp()
  const workspace = currentWorkspace(state)

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="border-b border-ink/9 px-9 pt-[26px] pb-[18px]">
        <div className="mb-3.5 flex items-baseline gap-2.5">
          <h1 className="m-0 text-xl leading-[1.2] font-semibold tracking-[-.015em]">
            Workspace settings
          </h1>
          <span className="font-mono text-xs leading-none text-ink/45">{workspace.name}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => actions.setTab(key)}
              aria-current={state.tab === key ? 'page' : undefined}
              className={`cursor-pointer rounded-[7px] px-3 py-[7px] text-[12.5px] leading-none font-medium ${
                state.tab === key ? 'bg-shell text-white' : 'bg-ink/5 text-ink/62'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex max-w-[760px] flex-col gap-3.5 px-9 pt-[26px] pb-12">
        {state.tab === 'statuses' && <StatusesTab />}
        {state.tab === 'members' && <MembersTab />}
        {state.tab === 'general' && <GeneralTab />}
        {state.tab === 'labels' && <LabelsTab />}
        {state.tab === 'danger' && <DangerTab />}
      </div>
    </div>
  )
}
