/** The bordered ⌕ field used by the task list, the files screen and the sidebar. */
export default function SearchField({
  value,
  onChange,
  onFocus,
  placeholder,
  onClear,
  dark = false,
  className = '',
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-[11px] py-2 ${
        dark ? 'border-shell-ink/16 bg-shell-ink/6' : 'border-ink/14 bg-panel'
      } ${className}`}
    >
      <span aria-hidden="true" className={`text-xs ${dark ? 'text-shell-ink/50' : 'text-ink/40'}`}>
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden ${
          dark ? 'text-[12.5px] leading-none text-shell-ink' : 'text-[13px]'
        }`}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className={`cursor-pointer bg-transparent text-[13px] ${
            dark ? 'text-shell-ink/50' : 'text-ink/40'
          }`}
        >
          ✕
        </button>
      )}
    </div>
  )
}
