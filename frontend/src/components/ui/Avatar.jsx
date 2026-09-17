/**
 * Initials chip. Pending invites render as a dashed outline instead of a fill,
 * which is how the list tells "invited" from "joined" without a second label.
 * A `src` (a Google picture, or a workspace logo) replaces the initials.
 */
export default function Avatar({
  init,
  color,
  src,
  size = 22,
  radius = '50%',
  pending = false,
  title,
  className = '',
}) {
  return (
    <span
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: pending ? 'transparent' : color,
        border: pending ? '1.5px dashed rgba(23,23,23,.35)' : 'none',
        fontSize: Math.max(8, Math.round(size * 0.4)),
        color: pending ? 'rgba(23,23,23,.55)' : '#fff',
      }}
      className={`box-border flex flex-none items-center justify-center overflow-hidden font-mono leading-none font-semibold ${className}`}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        init
      )}
    </span>
  )
}
