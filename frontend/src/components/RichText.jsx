import { parseRichText } from '../lib/text'
import { useApp } from '../state/useApp'

/**
 * Renders comment and chat text with its @mentions highlighted and its
 * /TSK-104 references turned into links that open that task's drawer.
 */
export default function RichText({ text, onDark = false }) {
  const { state, actions } = useApp()
  const parts = parseRichText(text)

  return parts.map((part) => {
    const known = part.taskId ? state.tasks.some((task) => task.id === part.taskId) : false
    const token = part.isMention || known

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

    if (!known) {
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
        title={`Open ${part.taskId}`}
        onClick={(event) => {
          event.stopPropagation()
          actions.revealTask(part.taskId)
        }}
        style={style}
        className="cursor-pointer underline decoration-current underline-offset-2"
      >
        {part.value}
      </button>
    )
  })
}
