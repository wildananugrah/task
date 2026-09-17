import { workspaceSummary } from '../lib/select'
import { ROLE_LABEL } from '../lib/constants'
import { useApp } from '../state/useApp'
import Avatar from './ui/Avatar'

export default function WorkspacesScreen() {
  const { state, actions } = useApp()
  const adminCount = state.cards.filter((card) => card.role === 'admin').length

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex flex-wrap items-end justify-between gap-6 px-10 pt-[34px] pb-6">
        <div className="flex flex-col gap-[7px]">
          <h1 className="m-0 text-[27px] leading-[1.15] font-semibold tracking-[-.02em]">
            Workspaces
          </h1>
          <p className="m-0 text-[13.5px] leading-[1.5] text-ink/55">
            Pick a workspace to see its tasks. You are an admin in {adminCount} of them.
          </p>
        </div>
        <button
          type="button"
          onClick={actions.openNewWorkspace}
          className="cursor-pointer rounded-lg border border-dashed border-ink/28 bg-transparent px-[15px] py-2.5 text-[13px] leading-none font-medium hover:border-ink"
        >
          ＋ New workspace
        </button>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 px-10 pb-10">
        {state.cards.map((card) => {
          const summary = workspaceSummary(card)
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => actions.openWorkspace(card.id)}
              className="flex cursor-pointer flex-col gap-4 rounded-xl border border-ink/10 bg-panel p-[18px] text-left shadow-[0_1px_2px_rgba(23,23,23,.04)] transition-shadow hover:border-ink/45 hover:shadow-[0_6px_18px_rgba(23,23,23,.08)]"
            >
              <div className="flex items-start gap-3">
                <Avatar
                  init={card.initials}
                  color={card.color}
                  src={card.logoUrl}
                  size={38}
                  radius="10px"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[15px] leading-[1.25] font-semibold tracking-[-.01em]">
                    {card.name}
                  </span>
                  <span className="text-[12.5px] leading-[1.45] text-ink/55">
                    {card.description}
                  </span>
                  <span className="pt-0.5 font-mono text-[10.5px] leading-none font-medium text-ink/42">
                    {card.prefix}-101 →
                  </span>
                </span>
                <span className="rounded-[5px] bg-ink/6 px-[7px] py-1 font-mono text-[10px] leading-none font-medium tracking-[.06em] text-ink/55 uppercase">
                  {ROLE_LABEL[card.role]}
                </span>
              </div>

              <div className="flex flex-col gap-[7px]">
                <div className="flex h-[5px] overflow-hidden rounded-[3px] bg-ink/7">
                  {summary.bars.map((bar) => (
                    <span
                      key={bar.key}
                      style={{ width: bar.width, background: bar.color }}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11.5px] leading-none text-ink/50">
                    {summary.open} open · {summary.done} done
                  </span>
                  <span className="flex">
                    {summary.people.slice(0, 4).map((person) => (
                      <Avatar
                        key={person.id}
                        init={person.initials}
                        color={person.color}
                        src={person.avatarUrl}
                        size={22}
                        className="-ml-[7px] border-2 border-panel"
                      />
                    ))}
                  </span>
                </div>
              </div>
            </button>
          )
        })}

        {state.cards.length === 0 && (
          <div className="col-span-full flex flex-col items-center gap-2.5 px-5 py-16 text-center">
            <span className="text-[15px] leading-[1.3] font-semibold">No workspaces yet</span>
            <span className="max-w-[340px] text-[13px] leading-[1.55] text-ink/55 text-pretty">
              Create one to get a board, statuses and a team room of its own, or wait for an admin
              to invite you to theirs.
            </span>
            <button
              type="button"
              onClick={actions.openNewWorkspace}
              className="mt-0.5 cursor-pointer rounded-lg bg-ink px-[15px] py-[9px] text-[12.5px] leading-none font-semibold text-white hover:bg-ink-strong"
            >
              ＋ New workspace
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
