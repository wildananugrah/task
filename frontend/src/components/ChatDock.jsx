import { useState } from 'react'
import { THREAD_IDENTITY } from '../data/seed'
import { mentionHeader, mentionItems } from '../lib/mentions'
import { memberOf } from '../lib/select'
import { replaceTrailingToken, trailingToken } from '../lib/text'
import { useApp } from '../state/useApp'
import MentionMenu from './MentionMenu'
import RichText from './RichText'
import Avatar from './ui/Avatar'

function identityFor(state, threadId) {
  const identity = THREAD_IDENTITY[threadId] || { memberId: threadId }
  const member = memberOf(state, identity.memberId)
  return {
    name: identity.name || member.name,
    init: identity.init || member.init,
    color: identity.color || member.color,
    presence: identity.presence || 'Active now',
  }
}

function ChatWindow({ threadId }) {
  const { state, actions } = useApp()
  const [text, setText] = useState('')
  const identity = identityFor(state, threadId)
  const token = trailingToken(text)
  const items = mentionItems(state, token, 'all')

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    actions.sendMessage(threadId, trimmed)
    setText('')
  }

  return (
    <div className="flex h-[430px] w-[328px] animate-pop-in flex-col overflow-hidden rounded-t-xl border border-ink/12 bg-panel shadow-[0_-4px_28px_rgba(23,23,23,.16)]">
      <div className="flex items-center gap-[9px] border-b border-ink/9 bg-subtle px-3 py-2.5">
        <Avatar init={identity.init} color={identity.color} size={26} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[13px] leading-[1.2] font-semibold">{identity.name}</span>
          <span className="font-mono text-[10.5px] leading-none text-ink/50">
            {identity.presence}
          </span>
        </span>
        <button
          type="button"
          onClick={actions.closeChat}
          aria-label="Close conversation"
          className="cursor-pointer bg-transparent text-[13px] text-ink/45 hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3.5">
        {(state.convos[threadId] || []).map((message, index) => (
          <div
            key={index}
            className={`flex ${message.me ? 'justify-end' : 'justify-start'}`}
          >
            <span
              style={{
                background: message.me ? '#1f1f1f' : '#f2f2f1',
                color: message.me ? '#ededeb' : '#171717',
              }}
              className="max-w-[84%] rounded-xl px-[11px] py-[9px] text-[13px] leading-[1.55] text-pretty"
            >
              <RichText text={message.text} onDark={message.me} />
            </span>
          </div>
        ))}
      </div>

      {token && items.length > 0 && (
        <MentionMenu
          header={mentionHeader(token)}
          items={items}
          onPick={(item) => setText(replaceTrailingToken(text, token.token, item.insert))}
          className="mx-2.5 shadow-[0_6px_20px_rgba(23,23,23,.12)]"
        />
      )}

      <div className="flex items-end gap-2 border-t border-ink/9 px-[11px] py-2.5">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              send()
            }
          }}
          placeholder="Write a message… @ or /"
          aria-label="Write a message"
          className="flex-1 rounded-[18px] border border-ink/14 bg-subtle px-[11px] py-[9px] text-[13px]"
        />
        <button
          type="button"
          onClick={send}
          aria-label="Send"
          className="size-[34px] flex-none cursor-pointer rounded-full bg-ink text-sm text-white hover:bg-ink-strong"
        >
          ↑
        </button>
      </div>
    </div>
  )
}

export default function ChatDock() {
  const { state, actions } = useApp()
  const unread = state.threads.filter((thread) => thread.unread).length

  return (
    <div className="fixed right-[22px] bottom-0 z-40 flex items-end gap-3.5">
      {state.chatOpen.map((threadId) => (
        <ChatWindow key={threadId} threadId={threadId} />
      ))}

      <div className="flex w-[300px] flex-col overflow-hidden rounded-t-xl border border-ink/12 bg-panel shadow-[0_-4px_24px_rgba(23,23,23,.12)]">
        <button
          type="button"
          onClick={actions.toggleDock}
          aria-expanded={state.dockOpen}
          className="flex cursor-pointer items-center gap-[9px] bg-shell px-[13px] py-[11px] text-left text-shell-ink"
        >
          <span aria-hidden="true" className="text-[13px]">
            ✉
          </span>
          <span className="flex-1 text-[13px] leading-none font-semibold">Messaging</span>
          {unread > 0 && (
            <span className="rounded-[9px] bg-shell-ink px-1.5 py-[3px] font-mono text-[10px] leading-none font-semibold text-ink">
              {unread}
            </span>
          )}
          <span aria-hidden="true" className="text-[11px] text-shell-ink/60">
            {state.dockOpen ? '⌄' : '⌃'}
          </span>
        </button>

        {state.dockOpen && (
          <div className="max-h-[296px] overflow-y-auto">
            {state.threads.map((thread) => {
              const identity = identityFor(state, thread.id)
              const open = state.chatOpen.includes(thread.id)
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => actions.openThread(thread.id)}
                  className={`flex w-full cursor-pointer items-center gap-2.5 border-b border-b-ink/6 px-[13px] py-[11px] text-left hover:bg-canvas ${
                    open ? 'bg-canvas' : 'bg-panel'
                  }`}
                >
                  <Avatar init={identity.init} color={identity.color} size={30} />
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex items-baseline gap-1.5">
                      <span
                        className={`min-w-0 flex-1 truncate text-[12.5px] leading-[1.2] ${
                          thread.unread ? 'font-semibold' : 'font-normal'
                        }`}
                      >
                        {identity.name}
                      </span>
                      <span className="font-mono text-[10px] leading-none text-ink/40">
                        {thread.when}
                      </span>
                    </span>
                    <span
                      className={`truncate text-[11.5px] leading-[1.3] ${
                        thread.unread ? 'font-medium text-ink/75' : 'font-normal text-ink/50'
                      }`}
                    >
                      {thread.preview}
                    </span>
                  </span>
                  {thread.unread && (
                    <span aria-hidden="true" className="size-[7px] flex-none rounded-full bg-ink" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
