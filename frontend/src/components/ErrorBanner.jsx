import { useApp } from '../state/useApp'

/**
 * Failures now have somewhere to land. The prototype could not fail — every
 * action was a state update — so there was nothing to show; a real server can
 * refuse, and silence would leave the screen simply not doing what was asked.
 */
export default function ErrorBanner() {
  const { state, actions } = useApp()
  if (!state.error) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-90 flex -translate-x-1/2 animate-pop-in items-center gap-3 rounded-[10px] border border-ink/14 bg-shell px-[15px] py-[11px] text-shell-ink shadow-[0_12px_34px_rgba(23,23,23,.28)]"
    >
      <span className="max-w-[420px] text-[12.5px] leading-[1.45]">{state.error}</span>
      <button
        type="button"
        onClick={actions.dismissError}
        aria-label="Dismiss"
        className="cursor-pointer bg-transparent text-[13px] text-shell-ink/55 hover:text-shell-ink"
      >
        ✕
      </button>
    </div>
  )
}
