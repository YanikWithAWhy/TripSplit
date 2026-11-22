import { useId, type ReactNode } from 'react'

interface CardProps {
  title: string
  /** Small text on the right of the title, e.g. a count. */
  meta?: ReactNode
  children: ReactNode
}

export function Card({ title, meta, children }: CardProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {meta && <p className="text-sm text-ink-muted">{meta}</p>}
      </div>
      {children}
    </section>
  )
}
