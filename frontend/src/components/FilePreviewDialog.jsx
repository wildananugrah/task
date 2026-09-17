import { FILE_PREVIEW_LINES, FILE_PREVIEW_ROWS } from '../data/seed'
import { useApp } from '../state/useApp'
import Dialog from './ui/Dialog'

const IMAGE = ['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG']
const SHEET = ['XLS', 'XLSX', 'CSV']
const TEXT = ['MD', 'TXT', 'JSON', 'LOG', 'DOC', 'DOCX']

function kindOf(ext) {
  if (IMAGE.includes(ext)) return { key: 'image', label: 'Image' }
  if (ext === 'PDF') return { key: 'pdf', label: 'Document · 4 pages' }
  if (SHEET.includes(ext)) return { key: 'sheet', label: 'Spreadsheet · Sheet 1 of 2' }
  if (TEXT.includes(ext)) return { key: 'text', label: 'Text' }
  return { key: 'other', label: 'File' }
}

function Body({ file, kind }) {
  if (kind === 'image') {
    return (
      <div className="flex w-full max-w-[560px] flex-col items-center gap-2.5">
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-[10px] border border-ink/12 bg-[repeating-conic-gradient(#fff_0%_25%,#ebebe9_0%_50%)] bg-[length:22px_22px]">
          <span className="rounded-md bg-ink/82 px-3 py-2 font-mono text-[11.5px] leading-none font-medium text-white">
            image preview · {file.name}
          </span>
        </div>
        <span className="font-mono text-[11.5px] leading-none text-ink/45">
          1600 × 1200 · fit to width
        </span>
      </div>
    )
  }

  if (kind === 'pdf') {
    return (
      <div className="flex w-full max-w-[520px] flex-col items-center gap-3.5">
        <div className="flex aspect-[1/1.294] w-full flex-col gap-4 rounded border border-ink/12 bg-panel px-[46px] py-11 shadow-[0_4px_18px_rgba(23,23,23,.1)]">
          <span className="text-[17px] leading-[1.3] font-semibold">{file.taskTitle}</span>
          <span className="font-mono text-[11.5px] leading-none text-ink/45">
            {file.taskId} · draft
          </span>
          <div className="flex flex-col gap-[9px] pt-1.5">
            {FILE_PREVIEW_LINES.map((line, index) => (
              <span
                key={`${line}-${index}`}
                className="text-[12.5px] leading-[1.4] font-medium text-ink/70"
              >
                {line}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-[7px] pt-1">
            {['100%', '100%', '72%', '100%', '54%'].map((width, index) => (
              <span
                key={index}
                style={{ width }}
                className="h-[7px] rounded-[3px] bg-ink/9"
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
        <span className="font-mono text-[11.5px] leading-none text-ink/45">Page 1 of 4</span>
      </div>
    )
  }

  if (kind === 'sheet') {
    return (
      <div className="w-full max-w-[680px] overflow-hidden rounded-lg border border-ink/12 bg-panel">
        {FILE_PREVIEW_ROWS.map((cells, rowIndex) => (
          <div
            key={cells[0]}
            className={`grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-ink/8 ${
              rowIndex === 0 ? 'bg-canvas' : 'bg-panel'
            }`}
          >
            {cells.map((cell) => (
              <span
                key={cell}
                className={`border-r border-ink/7 px-3 py-2.5 text-[12.5px] leading-[1.3] text-ink/80 ${
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

  if (kind === 'text') {
    return (
      <div className="w-full max-w-[680px] rounded-lg border border-ink/12 bg-panel px-[22px] py-5 font-mono text-[12.5px] leading-[1.75] whitespace-pre-wrap text-ink/78">
        {`## ${file.taskTitle}

- owner: Iqbal
- status: in review
- linked: ${file.taskId}

Notes captured during the working session. Update before sign-off.`}
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-[9px] rounded-[10px] border border-ink/12 bg-panel px-6 py-11 text-center">
      <span className="text-sm leading-[1.3] font-semibold">No preview for .{file.ext}</span>
      <span className="text-[12.5px] leading-[1.55] text-ink/55">
        Download the file to open it in its own application.
      </span>
    </div>
  )
}

export default function FilePreviewDialog() {
  const { state, actions } = useApp()
  const file = state.preview
  const kind = kindOf(file.ext)

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
              {kind.label} · {file.meta}
            </span>
          </span>
          <button
            type="button"
            onClick={() => actions.revealTask(file.taskId)}
            className="cursor-pointer rounded-[7px] border border-ink/16 bg-panel px-[11px] py-[7px] text-xs leading-none font-medium hover:bg-canvas"
          >
            Open {file.taskId}
          </button>
          <button
            type="button"
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
          <Body file={file} kind={kind.key} />
        </div>
      </div>
    </Dialog>
  )
}
