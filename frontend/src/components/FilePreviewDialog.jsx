import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { fileMeta } from '../lib/format'
import { useApp } from '../state/useApp'
import Dialog from './ui/Dialog'

const IMAGE = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'AVIF', 'BMP']
const TEXT = ['MD', 'TXT', 'JSON', 'LOG', 'CSV', 'YML', 'YAML', 'XML', 'SQL']

function kindOf(file) {
  const ext = file.ext?.toUpperCase() ?? ''
  if (IMAGE.includes(ext) || file.contentType?.startsWith('image/')) {
    return { key: 'image', label: 'Image' }
  }
  if (ext === 'PDF' || file.contentType === 'application/pdf') {
    return { key: 'pdf', label: 'Document' }
  }
  if (ext === 'CSV') return { key: 'csv', label: 'Spreadsheet' }
  if (TEXT.includes(ext) || file.contentType?.startsWith('text/')) {
    return { key: 'text', label: 'Text' }
  }
  return { key: 'other', label: 'File' }
}

/** Anything larger is offered as a download rather than fetched into the page. */
const TEXT_PREVIEW_LIMIT = 512 * 1024

function Fallback({ children }) {
  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-[9px] rounded-[10px] border border-ink/12 bg-panel px-6 py-11 text-center">
      {children}
    </div>
  )
}

function CsvTable({ text }) {
  // Deliberately simple: a preview, not a parser. Quoted commas are rare in the
  // files this shows and getting them wrong costs a misaligned cell, not data.
  const rows = text
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, 60)
    .map((line) => line.split(','))

  return (
    <div className="w-full max-w-[680px] overflow-x-auto rounded-lg border border-ink/12 bg-panel">
      {rows.map((cells, rowIndex) => (
        <div
          key={rowIndex}
          className={`flex border-b border-ink/8 ${rowIndex === 0 ? 'bg-canvas' : 'bg-panel'}`}
        >
          {cells.map((cell, cellIndex) => (
            <span
              key={cellIndex}
              className={`min-w-[120px] flex-1 border-r border-ink/7 px-3 py-2.5 text-[12.5px] leading-[1.3] text-ink/80 ${
                rowIndex === 0 ? 'font-semibold' : 'font-normal'
              }`}
            >
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Real previews of the real object, on a short-lived presigned URL. The
 * prototype drew a picture of each file type; this fetches it.
 */
function Body({ file, kind, url, text, failed }) {
  if (failed) {
    return (
      <Fallback>
        <span className="text-sm leading-[1.3] font-semibold">Preview unavailable</span>
        <span className="text-[12.5px] leading-[1.55] text-ink/55">
          The file could not be loaded. Downloading it may still work.
        </span>
      </Fallback>
    )
  }

  if (!url) {
    return (
      <Fallback>
        <span className="font-mono text-[11.5px] leading-none text-ink/45">loading preview…</span>
      </Fallback>
    )
  }

  if (kind === 'image') {
    return (
      <div className="flex w-full max-w-[720px] flex-col items-center gap-2.5">
        <img
          src={url}
          alt={file.name}
          className="max-h-[68vh] w-auto max-w-full rounded-[10px] border border-ink/12 bg-[repeating-conic-gradient(#fff_0%_25%,#ebebe9_0%_50%)] bg-[length:22px_22px] object-contain"
        />
      </div>
    )
  }

  if (kind === 'pdf') {
    return (
      <iframe
        src={url}
        title={file.name}
        className="h-[68vh] w-full max-w-[720px] rounded border border-ink/12 bg-panel"
      />
    )
  }

  if (kind === 'csv' && text !== null) return <CsvTable text={text} />

  if ((kind === 'text' || kind === 'csv') && text !== null) {
    return (
      <div className="w-full max-w-[680px] rounded-lg border border-ink/12 bg-panel px-[22px] py-5 font-mono text-[12.5px] leading-[1.75] whitespace-pre-wrap text-ink/78">
        {text}
      </div>
    )
  }

  return (
    <Fallback>
      <span className="text-sm leading-[1.3] font-semibold">No preview for .{file.ext}</span>
      <span className="text-[12.5px] leading-[1.55] text-ink/55">
        Download the file to open it in its own application.
      </span>
    </Fallback>
  )
}

export default function FilePreviewDialog() {
  const { state, actions } = useApp()
  const file = state.preview
  const kind = kindOf(file)

  const [preview, setPreview] = useState({ for: null, url: null, text: null, failed: false })

  // Opening a different file resets during render rather than in an effect, so
  // the previous file's image is never painted under the new file's name.
  if (preview.for !== file.id) {
    setPreview({ for: file.id, url: null, text: null, failed: false })
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const signed = await api.fileUrl(file.id, 'inline')
        if (cancelled) return
        setPreview((prev) => ({ ...prev, for: file.id, url: signed.url }))

        if ((kind.key === 'text' || kind.key === 'csv') && file.size <= TEXT_PREVIEW_LIMIT) {
          const response = await fetch(signed.url)
          const body = await response.text()
          if (!cancelled) setPreview((prev) => ({ ...prev, for: file.id, text: body }))
        }
      } catch {
        if (!cancelled) setPreview((prev) => ({ ...prev, for: file.id, failed: true }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file.id, file.size, kind.key])

  const { url, text, failed } = preview

  /**
   * The bucket is a different origin and the sandbox blocks a plain link, so a
   * download is fetch → blob → a[download]: the filename survives and the bytes
   * still never pass through the API.
   */
  const download = async () => {
    try {
      const signed = await api.fileUrl(file.id, 'attachment')
      const response = await fetch(signed.url)
      const blob = await response.blob()
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = file.name
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(href)
    } catch {
      setPreview((prev) => ({ ...prev, failed: true }))
    }
  }

  return (
    <Dialog onClose={actions.closePreview} width={820} scrim={46} zIndex={80} label={file.name}>
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex items-center gap-3 border-b border-ink/9 bg-subtle px-4 py-[13px]">
          <span className="flex size-8 flex-none items-center justify-center rounded-[7px] bg-ink/7 font-mono text-[9.5px] leading-none font-semibold text-ink/60">
            {file.ext}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="truncate text-[13.5px] leading-[1.25] font-semibold">{file.name}</span>
            <span className="font-mono text-[11px] leading-none text-ink/45">
              {kind.label} · {fileMeta(file)}
            </span>
          </span>
          {file.taskId && (
            <button
              type="button"
              onClick={() => {
                actions.closePreview()
                actions.revealTask(file.taskId)
              }}
              className="cursor-pointer rounded-[7px] border border-ink/16 bg-panel px-[11px] py-[7px] text-xs leading-none font-medium hover:bg-canvas"
            >
              Open {file.taskRef ?? 'task'}
            </button>
          )}
          <button
            type="button"
            onClick={download}
            className="cursor-pointer rounded-[7px] bg-ink px-[11px] py-[7px] text-xs leading-none font-semibold text-white"
          >
            Download
          </button>
          <button
            type="button"
            onClick={actions.closePreview}
            aria-label="Close preview"
            className="size-7 cursor-pointer rounded-[7px] bg-transparent text-sm text-ink/50 hover:bg-canvas"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-canvas p-[22px]">
          <Body file={file} kind={kind.key} url={url} text={text} failed={failed} />
        </div>
      </div>
    </Dialog>
  )
}
