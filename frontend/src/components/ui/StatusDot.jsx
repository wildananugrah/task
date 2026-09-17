/** The 9px ring that carries a status colour everywhere it appears. */
export default function StatusDot({ color, size = 9 }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: color, border: `2px solid ${color}` }}
      className="box-border flex-none rounded-full"
    />
  )
}
