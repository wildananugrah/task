import { currentWorkspace, workspaceFileCount, workspaceFiles } from '../lib/select'
import { useApp } from '../state/useApp'
import SearchField from './ui/SearchField'

export default function FilesScreen() {
  const { state, actions } = useApp()
  const workspace = currentWorkspace(state)
  const files = workspaceFiles(state)
  const searching = state.fq.trim().length > 0

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex flex-col gap-[7px] border-b border-ink/9 px-9 pt-[26px] pb-[18px]">
        <div className="flex items-baseline gap-2.5">
          <h1 className="m-0 text-xl leading-[1.2] font-semibold tracking-[-.015em]">Files</h1>
          <span className="font-mono text-xs leading-none text-ink/45">
            {workspace.name} · {workspaceFileCount(state)} files
          </span>
        </div>
        <p className="m-0 text-[13px] leading-[1.5] text-ink/55">
          Everything attached to a task in this workspace. Uploads happen inside the task.
        </p>
        <SearchField
          value={state.fq}
          onChange={actions.setFileQuery}
          onClear={() => actions.setFileQuery('')}
          placeholder="Search files by name or type"
          className="mt-1.5 max-w-[400px]"
        />
      </header>

      <div className="flex max-w-[900px] flex-col gap-[9px] px-9 pt-5 pb-11">
        {files.map((file) => (
          <button
            key={`${file.taskId}-${file.index}`}
            type="button"
            onClick={() => actions.openPreview(file)}
            className="flex cursor-pointer items-center gap-[13px] rounded-[10px] border border-ink/9 bg-panel px-3.5 py-3 text-left hover:border-ink/28"
          >
            <span className="flex size-[34px] flex-none items-center justify-center rounded-[7px] bg-ink/6 font-mono text-[9.5px] leading-none font-semibold text-ink/55">
              {file.ext}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate text-[13px] leading-[1.25] font-medium">{file.name}</span>
              <span className="font-mono text-[11px] leading-none text-ink/45">{file.meta}</span>
            </span>
            <span className="flex max-w-[280px] flex-none items-center gap-2">
              <span className="font-mono text-[11px] leading-none font-medium text-ink/45">
                {file.taskId}
              </span>
              <span className="truncate text-[12.5px] leading-[1.2] text-ink/60">
                {file.taskTitle}
              </span>
            </span>
          </button>
        ))}

        {files.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            {searching ? (
              <>
                <span className="text-[14.5px] leading-[1.3] font-semibold">
                  No files match “{state.fq}”
                </span>
                <button
                  type="button"
                  onClick={() => actions.setFileQuery('')}
                  className="mt-1 cursor-pointer rounded-lg border border-ink/18 bg-panel px-[13px] py-2 text-[12.5px] leading-none font-medium"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <span className="text-[14.5px] leading-[1.3] font-semibold">No files yet</span>
                <span className="max-w-[320px] text-[13px] leading-[1.55] text-ink/55 text-pretty">
                  Open a task and drop files into its Files section — they show up here.
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
