const sizes = {
  sm: 'size-8 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-16 text-2xl',
}

const bubble = 'grid shrink-0 place-items-center rounded-full border border-line-strong bg-raised font-semibold text-ink'

/** Round initial. Decorative: the name is always shown as text next to it. */
export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof sizes }) {
  return (
    <span aria-hidden="true" className={`${bubble} ${sizes[size]}`}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/** Overlapping initials, with "+N" when there are more than `max` people. */
export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.length > max ? names.slice(0, max - 1) : names
  const hidden = names.length - shown.length
  return (
    <span aria-hidden="true" className="flex -space-x-2">
      {shown.map((name, index) => (
        <span key={`${name}-${index}`} className="rounded-full ring-2 ring-canvas">
          <Avatar name={name} size="sm" />
        </span>
      ))}
      {hidden > 0 && (
        <span className="rounded-full ring-2 ring-canvas">
          <span className={`${bubble} ${sizes.sm}`}>+{hidden}</span>
        </span>
      )}
    </span>
  )
}
