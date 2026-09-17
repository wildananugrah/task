import { useEffect, useRef, useState } from 'react'
import { formatShortWhen, initialsFrom } from '../lib/format'
import { mentionHeader, mentionItems } from '../lib/mentions'
import { replaceTrailingToken, trailingToken } from '../lib/text'
import { useApp } from '../state/useApp'
import MentionMenu from './MentionMenu'
import RichText from './RichText'
import Avatar from './ui/Avatar'

/**
 * A conversation is named after whoever else is in it. The server already
 * resolves that, so the client only has to pick the avatar — the other person
 * for a DM, the workspace initials for a team room.
 */
function identityFor(state, conversation) {
  const others = conversation.participants.filter((person) => person.id !== state.me?.id)
  const dm = conversation.kind === 'dm'
  const face = others[0]

  const online = dm
    ? Boolean(face && state.online.includes(face.id))
    : others.some((person) => state.online.includes(person.id))

  return {
    name: conversation.title,
    // A team room wears its workspace's initials — "Work workspace" is WW, the
    // way it reads everywhere else, not the first two letters of the string.
    init: dm ? (face?.initials ?? '??') : initialsFrom(conversation.title ?? 'Team'),
    color: dm ? (face?.color ?? '#8c8c8c') : '#1f7a5a',
    src: dm ? face?.avatarUrl : null,
    online,
    presence: dm
      ? online
        ? 'Active now'
        : 'Offline'
      : `${conversation.participants.length} members`,
  }
}

function ChatWindow({ conversation }) {
  const { state, actions } = useApp()
  const [text, setText] = useState('')
  const scroller = useRef(null)
  const lastTyping = useRef(0)

  const identity = identityFor(state, conversation)
  const messages = state.messages[conversation.id] ?? []
  const token = trailingToken(text)
  const items = mentionItems(state, token, 'all')
  // The store expires typing entries on a timer, so their presence is the whole
  // signal — reading a clock during render would make this unstable.
  const peerTyping = Boolean(state.typing[conversation.id])

  // Pinned to the newest message, the way a chat window is expected to open.
  useEffect(() => {
    const node = scroller.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages.length, peerTyping])

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    actions.sendMessage(conversation.id, trimmed)
    setText('')
  }

  const onType = (value) => {
    setText(value)
    // One typing frame per second is enough to keep the indicator alive.
    if (Date.now() - lastTyping.current > 1000) {
      lastTyping.current = Date.now()
      actions.notifyTyping(conversation.id)
    }
  }

  return (
    <div className="flex h-[430px] w-[328px] animate-pop-in flex-col overflow-hidden rounded-t-xl border border-ink/12 bg-panel shadow-[0_-4px_28px_rgba(23,23,23,.16)]">
      <div className="flex items-center gap-[9px] border-b border-ink/9 bg-subtle px-3 py-2.5">
        <span className="relative flex flex-none">
          <Avatar init={identity.init} color={identity.color} src={identity.src} size={26} />
          {identity.online && (
            <span
              aria-hidden="true"
              className="absolute -right-px -bottom-px size-[8px] rounded-full border-2 border-subtle bg-[#4fa373]"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[13px] leading-[1.2] font-semibold">{identity.name}</span>
          <span className="font-mono text-[10.5px] leading-none text-ink/50">
            {peerTyping ? 'typing…' : identity.presence}
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

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-label={`Conversation with ${identity.name}`}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-3.5"
      >
        {messages.length === 0 && (
          <span className="py-6 text-center text-[12.5px] leading-[1.5] text-ink/45">
            No messages yet. Say something — @ mentions and /TSK links both work here.
          </span>
        )}

        {messages.map((message) => {
          const mine = message.author?.id === state.me?.id
          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <span
                style={{
                  background: mine ? '#1f1f1f' : '#f2f2f1',
                  color: mine ? '#ededeb' : '#171717',
                  opacity: message.pending ? 0.6 : 1,
                }}
                className="max-w-[84%] rounded-xl px-[11px] py-[9px] text-[13px] leading-[1.55] text-pretty"
                title={message.pending ? 'Sending…' : undefined}
              >
                {!mine && conversation.kind === 'group' && (
                  <span className="mb-0.5 block text-[10.5px] leading-none font-semibold text-ink/50">
                    {message.author?.name ?? 'Someone'}
                  </span>
                )}
                <RichText text={message.body} onDark={mine} />
              </span>
            </div>
          )
        })}
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
          onChange={(event) => onType(event.target.value)}
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
  if (!state.me) return null

  const unread = state.conversations.reduce(
    (total, conversation) => total + (conversation.unread > 0 ? 1 : 0),
    0,
  )
  const open = state.conversations.filter((conversation) =>
    state.chatOpen.includes(conversation.id),
  )

  return (
    <div className="fixed right-[22px] bottom-0 z-40 flex items-end gap-3.5">
      {open.map((conversation) => (
        <ChatWindow key={conversation.id} conversation={conversation} />
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
          {/* The socket's state is worth showing: a dot that is not green means
              messages are going over HTTP instead of arriving live. */}
          <span
            aria-hidden="true"
            title={state.socketStatus === 'online' ? 'Live' : 'Reconnecting…'}
            style={{ background: state.socketStatus === 'online' ? '#4fa373' : '#8a6d1f' }}
            className="size-[6px] rounded-full"
          />
          <span aria-hidden="true" className="text-[11px] text-shell-ink/60">
            {state.dockOpen ? '⌄' : '⌃'}
          </span>
        </button>

        {state.dockOpen && (
          <div className="max-h-[296px] overflow-y-auto">
            {state.conversations.map((conversation) => {
              const identity = identityFor(state, conversation)
              const active = state.chatOpen.includes(conversation.id)
              const unreadHere = conversation.unread > 0

              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => actions.openThread(conversation.id)}
                  aria-label={`Open conversation: ${identity.name}`}
                  className={`flex w-full cursor-pointer items-center gap-2.5 border-b border-b-ink/6 px-[13px] py-[11px] text-left hover:bg-canvas ${
                    active ? 'bg-canvas' : 'bg-panel'
                  }`}
                >
                  <span className="relative flex flex-none">
                    <Avatar
                      init={identity.init}
                      color={identity.color}
                      src={identity.src}
                      size={30}
                    />
                    {identity.online && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-px -bottom-px size-[9px] rounded-full border-2 border-panel bg-[#4fa373]"
                      />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="flex items-baseline gap-1.5">
                      <span
                        className={`min-w-0 flex-1 truncate text-[12.5px] leading-[1.2] ${
                          unreadHere ? 'font-semibold' : 'font-normal'
                        }`}
                      >
                        {identity.name}
                      </span>
                      <span className="font-mono text-[10px] leading-none text-ink/40">
                        {formatShortWhen(conversation.lastMessage?.createdAt)}
                      </span>
                    </span>
                    <span
                      className={`truncate text-[11.5px] leading-[1.3] ${
                        unreadHere ? 'font-medium text-ink/75' : 'font-normal text-ink/50'
                      }`}
                    >
                      {conversation.lastMessage
                        ? `${
                            conversation.lastMessage.author?.id === state.me?.id
                              ? 'You: '
                              : conversation.kind === 'group'
                                ? `${conversation.lastMessage.author?.name ?? ''}: `
                                : ''
                          }${conversation.lastMessage.body}`
                        : 'No messages yet'}
                    </span>
                  </span>
                  {unreadHere && (
                    <span aria-hidden="true" className="size-[7px] flex-none rounded-full bg-ink" />
                  )}
                </button>
              )
            })}

            {state.conversations.length === 0 && (
              <div className="px-3.5 py-6 text-center text-[12.5px] leading-[1.5] text-ink/50">
                No conversations yet. Click a teammate in the sidebar to start one.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
