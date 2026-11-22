/** Shared Tailwind class strings, so buttons and inputs look the same everywhere. */

/** Colors fade, and the button shrinks slightly while pressed (scale doesn't move the layout). */
const press =
  'transition-[color,background-color,border-color,scale] duration-150 ease-out active:scale-[0.97] disabled:active:scale-100'

const button = `inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full text-sm ${press}`

/** White button, the main action on a screen. */
export const buttonPrimary = `${button} bg-ink px-5 font-semibold text-canvas hover:bg-ink/85 active:bg-ink/70`

/** Outlined button for secondary actions. */
export const buttonSecondary = `${button} border border-line-strong px-5 font-medium text-ink hover:border-ink-subtle hover:bg-raised active:bg-raised/60`

/** Text-only button for low-emphasis actions. */
export const buttonGhost = `${button} px-4 font-medium text-ink-muted hover:bg-raised hover:text-ink`

/** Round 44 px icon button. Always give it an aria-label. */
export const iconButton = `grid size-11 shrink-0 place-items-center rounded-full text-ink-muted ${press} hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`

export const labelText = 'text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase'

export const textInput =
  'h-12 w-full rounded-xl border border-line bg-raised px-4 text-base text-ink outline-none transition-colors duration-150 placeholder:text-ink-subtle focus:border-ink aria-invalid:border-ink'
