import { parseRichText } from '../lib/text'
import { taskByRef } from '../lib/select'
import { useApp } from '../state/useApp'

/**
 * Renders comment and chat text with its @mentions highlighted and its
 * /TSK-104 references turned into links that open that task's drawer. A
 * reference only becomes a link when it names a task we can actually reach.
 */
export default function RichText({ text, onDark = false }) {
  const { state, actions } = useApp()
  const parts = parseRichText(text)

  return parts.map((part) => {
    // A link is the one token whose target is outside the app, so it opens in a
    // new tab and carries noopener: the page it opens must not get a handle on
    // this one through window.opener. nofollow because the text is user-written.
    if (part.url) {
      return (
        <a
          key={part.key}
          href={part.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(event) => event.stopPropagation()}
          title={part.url}
          style={{ color: onDark ? '#d4d4d4' : '#171717' }}
          className="font-medium break-all underline decoration-current underline-offset-2 hover:decoration-2"
        >
          {part.value}
        </a>
      )
    }

    const target = part.taskRef ? taskByRef(state, part.taskRef) : null
    const token = part.isMention || target

    if (!token) {
      return (
        <span key={part.key} style={onDark ? { color: '#ededeb' } : undefined}>
          {part.value}
        </span>
      )
    }

    const style = {
      color: onDark ? '#d4d4d4' : '#000000',
      fontWeight: 600,
      background: onDark ? 'rgba(237,237,235,.14)' : 'rgba(23,23,23,.1)',
      borderRadius: 4,
      padding: '1px 4px',
    }

    if (!target) {
      return (
        <span key={part.key} style={style}>
          {part.value}
        </span>
      )
    }

    return (
      <button
        key={part.key}
        type="button"
        title={`Open ${part.taskRef}`}
        onClick={(event) => {
          event.stopPropagation()
          actions.revealTask(target.id)
        }}
        style={style}
        className="cursor-pointer underline decoration-current underline-offset-2"
      >
        {part.value}
      </button>
    )
  })
}
