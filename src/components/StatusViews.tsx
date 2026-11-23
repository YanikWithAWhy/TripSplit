import { LoaderCircle, LogOut, RefreshCw, TriangleAlert, UserRound } from 'lucide-react'
import { accountHref } from '../router'
import { buttonGhost, buttonSecondary } from '../styles'

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="animate-enter flex min-h-[calc(100dvh-4rem)] items-center justify-center gap-3 text-ink-muted" aria-live="polite">
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      {label}
    </main>
  )
}

interface LoadErrorViewProps {
  title?: string
  message: string
  onRetry: () => void
}

export function LoadErrorView({ title = "Couldn't load your trips", message, onRetry }: LoadErrorViewProps) {
  return (
    <main className="animate-enter mx-auto flex max-w-md flex-col items-center gap-3 px-4 pt-24 text-center">
      <TriangleAlert className="size-6" strokeWidth={1.75} aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-ink-muted">{message}</p>
      <button type="button" onClick={onRetry} className={`mt-3 ${buttonSecondary}`}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Try again
      </button>
    </main>
  )
}

/** Shown when a change couldn't be saved. Reloading shows what is actually stored. */
export function SyncErrorBanner({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <div
      role="alert"
      className="fixed inset-x-4 top-20 z-30 mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-ink bg-surface p-4 shadow-2xl"
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Couldn't save your last change</p>
        <p className="mt-0.5 text-ink-muted">{message}</p>
      </div>
      <button type="button" onClick={onReload} className={buttonSecondary}>
        Reload
      </button>
    </div>
  )
}

/**
 * Who is signed in (e.g. "@anna", links to the account settings) and a sign-out button.
 * On phones "Sign out" is only an icon, so the header fits next to the logo.
 */
export function AccountMenu({ label, onSignOut }: { label: string; onSignOut: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <a
        href={accountHref}
        aria-label={`Account settings for ${label}`}
        className="inline-flex h-11 min-w-0 items-center gap-2 rounded-full px-3 text-sm font-medium text-ink-muted transition-colors duration-150 hover:bg-raised hover:text-ink"
      >
        <UserRound className="size-4 shrink-0" aria-hidden="true" />
        <span className="max-w-40 truncate sm:max-w-56">{label}</span>
      </a>
      <button type="button" onClick={onSignOut} aria-label="Sign out" className={`-mr-2 ${buttonGhost}`}>
        <LogOut className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  )
}
