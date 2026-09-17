import { useEffect } from 'react'

/** Scrim + centred panel. Escape and a scrim click both dismiss. */
export default function Dialog({ onClose, width = 420, scrim = 34, zIndex = 70, children, label }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div
        onClick={onClose}
        style={{ background: `rgba(23,23,23,.${scrim})`, zIndex }}
        className="fixed inset-0 animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ width: `min(${width}px, 92vw)`, zIndex: zIndex + 1 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pop-in overflow-hidden rounded-[14px] border border-ink/12 bg-panel shadow-[0_22px_60px_rgba(23,23,23,.24)]"
      >
        {children}
      </div>
    </>
  )
}

export function DialogHeader({ title, children, bordered = true }) {
  return (
    <div
      className={`flex flex-col gap-1.5 px-[22px] pt-5 pb-4 ${
        bordered ? 'border-b border-ink/8' : ''
      }`}
    >
      <h2 className="m-0 text-[17px] leading-[1.25] font-semibold tracking-[-.015em]">{title}</h2>
      {children && (
        <p className="m-0 text-[13px] leading-[1.55] text-ink/55 text-pretty">{children}</p>
      )}
    </div>
  )
}

export function DialogFooter({ onCancel, cancelLabel = 'Cancel', confirmLabel, onConfirm, enabled = true }) {
  return (
    <div className="flex justify-end gap-[9px] border-t border-ink/8 bg-subtle px-[22px] py-3.5">
      <button
        type="button"
        onClick={onCancel}
        className="cursor-pointer rounded-lg border border-ink/16 bg-panel px-3.5 py-[9px] text-[12.5px] leading-none font-medium"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={!enabled}
        style={{ background: enabled ? '#171717' : 'rgba(23,23,23,.3)' }}
        className={`rounded-lg px-4 py-[9px] text-[12.5px] leading-none font-semibold text-white ${
          enabled ? 'cursor-pointer' : 'cursor-not-allowed'
        }`}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

export function Field({ label, hint, optional, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] leading-none font-medium tracking-[.04em] text-ink/50 uppercase">
        {label}
        {optional && <span className="tracking-normal text-ink/38 normal-case"> optional</span>}
      </span>
      {children}
      {hint && <span className="font-mono text-[11.5px] leading-[1.45] text-ink/45">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'rounded-lg border border-ink/16 bg-subtle px-3 py-[11px] text-[13.5px] outline-none'
