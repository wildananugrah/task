import Avatar from './ui/Avatar'

export default function MentionMenu({ header, items, onPick, className = '' }) {
  if (!items.length) return null

  return (
    <div
      className={`overflow-hidden rounded-[9px] border border-ink/12 bg-panel shadow-[0_10px_28px_rgba(23,23,23,.16)] ${className}`}
    >
      <div className="bg-subtle px-[11px] py-[7px] font-mono text-[10px] leading-none font-medium tracking-[.08em] text-ink/42 uppercase">
        {header}
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onPick(item)}
          className="flex w-full cursor-pointer items-center gap-[9px] bg-transparent px-[11px] py-2 text-left hover:bg-canvas"
        >
          <Avatar init={item.init} color={item.color} radius={item.radius} size={22} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[12.5px] leading-[1.2] font-medium">{item.label}</span>
            <span className="truncate font-mono text-[10.5px] leading-none text-ink/45">
              {item.sub}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
