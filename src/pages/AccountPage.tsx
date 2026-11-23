import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronLeft, CircleAlert, CircleCheck, LogOut, Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Card } from '../components/Card'
import { FieldError } from '../components/FieldError'
import { PasswordField } from '../components/PasswordField'
import { changePassword, changeUsername, deleteAccount } from '../data/account'
import { MAX_USERNAME_LENGTH, normalizeUsername, validatePassword, validateUsername } from '../data/auth-messages'
import { homeHref } from '../router'
import { buttonGhost, buttonPrimary, buttonSecondary, labelText } from '../styles'

interface AccountPageProps {
  client: SupabaseClient
  email: string
  username: string
  onUsernameChanged: (username: string) => void
  /** Called after the account was deleted (the session is already gone). */
  onDeleted: () => void
  onSignOut: () => void
}

/** Account settings: change username and password, delete the account. */
export function AccountPage({ client, email, username, onUsernameChanged, onDeleted, onSignOut }: AccountPageProps) {
  return (
    <main className="mx-auto max-w-2xl animate-enter px-4 pt-4 pb-10 sm:px-6 sm:pt-6">
      <a href={homeHref} className={`-ml-3 ${buttonGhost}`}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        All trips
      </a>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">Account</h1>
      <p className="mt-2 break-all text-ink-muted">{email}</p>

      <div className="mt-8 grid grid-cols-1 gap-4">
        <UsernameForm client={client} username={username} onChanged={onUsernameChanged} />
        <PasswordForm client={client} email={email} />
        <Card title="Sign out">
          <p className="text-sm text-ink-muted">Signs you out on this device. Your trips stay in your account.</p>
          <button type="button" onClick={onSignOut} className={`mt-4 ${buttonSecondary}`}>
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </Card>
        <DeleteAccountForm client={client} email={email} onDeleted={onDeleted} />
      </div>
    </main>
  )
}

function Success({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mt-4 flex items-center gap-2 text-sm font-medium">
      <CircleCheck className="size-4 shrink-0 animate-pop" aria-hidden="true" />
      {children}
    </p>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-ink p-3 text-sm font-medium">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}

function UsernameForm({
  client,
  username,
  onChanged,
}: {
  client: SupabaseClient
  username: string
  onChanged: (username: string) => void
}) {
  const id = useId()
  const [value, setValue] = useState(username)
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    setFormError(null)
    const problem = validateUsername(value) ?? undefined
    setFieldError(problem)
    if (problem) {
      document.getElementById(id)?.focus()
      return
    }
    const next = normalizeUsername(value)
    if (next === username) {
      setFieldError('That is already your username.')
      return
    }
    setBusy(true)
    try {
      await changeUsername(client, next)
      setValue(next)
      setSaved(true)
      onChanged(next)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      if (/taken/.test(message)) setFieldError(message)
      else setFormError(message)
    } finally {
      setBusy(false)
    }
  }

  const errorId = fieldError ? `${id}-error` : undefined
  return (
    <Card title="Profile">
      <form onSubmit={submit} noValidate>
        <label htmlFor={id} className={`block ${labelText}`}>
          Username
        </label>
        <div className="mt-2 flex items-center rounded-xl border border-line bg-raised pl-4 transition-colors duration-150 focus-within:border-ink has-aria-invalid:border-ink">
          <span className="text-ink-muted" aria-hidden="true">
            @
          </span>
          <input
            id={id}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={MAX_USERNAME_LENGTH + 5}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setSaved(false)
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={errorId ?? `${id}-hint`}
            className="h-12 w-full min-w-0 bg-transparent pr-4 pl-1 text-base text-ink outline-none"
          />
        </div>
        {!fieldError && (
          <p id={`${id}-hint`} className="mt-2 text-sm text-ink-muted">
            3–20 characters: letters, numbers, _ and . Your friends see the new name in shared trips.
          </p>
        )}
        <FieldError id={errorId} message={fieldError} />
        <FormError message={formError} />
        {saved && <Success>Username changed.</Success>}
        <button type="submit" disabled={busy} className={`mt-4 ${buttonPrimary} disabled:cursor-wait disabled:opacity-60`}>
          {busy ? 'Saving…' : 'Save username'}
        </button>
      </form>
    </Card>
  )
}

function PasswordForm({ client, email }: { client: SupabaseClient; email: string }) {
  const id = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    setFormError(null)
    const problems = {
      current: validatePassword(current, 'current') ?? undefined,
      next: validatePassword(next, 'new') ?? undefined,
    }
    setErrors(problems)
    if (problems.current || problems.next) {
      document.getElementById(problems.current ? `${id}-current` : `${id}-next`)?.focus()
      return
    }
    setBusy(true)
    try {
      await changePassword(client, email, current, next)
      setCurrent('')
      setNext('')
      setSaved(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      if (/current password/.test(message)) setErrors({ current: message })
      else setFormError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Password">
      <form onSubmit={submit} noValidate>
        {/* Lets password managers update the saved password for this email. */}
        <input type="email" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
        <PasswordField
          id={`${id}-current`}
          label="Current password"
          value={current}
          onChange={(value) => {
            setCurrent(value)
            setSaved(false)
          }}
          autoComplete="current-password"
          error={errors.current}
        />
        <div className="mt-5">
          <PasswordField
            id={`${id}-next`}
            label="New password"
            value={next}
            onChange={(value) => {
              setNext(value)
              setSaved(false)
            }}
            autoComplete="new-password"
            error={errors.next}
          />
        </div>
        <FormError message={formError} />
        {saved && <Success>Password changed.</Success>}
        <button type="submit" disabled={busy} className={`mt-4 ${buttonPrimary} disabled:cursor-wait disabled:opacity-60`}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </Card>
  )
}

function DeleteAccountForm({
  client,
  email,
  onDeleted,
}: {
  client: SupabaseClient
  email: string
  onDeleted: () => void
}) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    const problem = validatePassword(password, 'current') ?? undefined
    setFieldError(problem)
    if (problem) {
      document.getElementById(id)?.focus()
      return
    }
    // Two steps: the first click only asks for confirmation.
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      await deleteAccount(client, email, password)
      onDeleted()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      if (/current password/.test(message)) setFieldError(message)
      else setFormError(message)
      setConfirming(false)
      setBusy(false)
    }
  }

  return (
    <Card title="Delete account">
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-muted">
        <li>Trips you share with others go to the person who joined first.</li>
        <li>Trips only you use are deleted, with everything in them.</li>
        <li>In other people's trips you stay as a plain name, so their balances stay correct.</li>
        <li>This can't be undone.</li>
      </ul>
      <form onSubmit={submit} noValidate className="mt-5">
        <PasswordField
          id={id}
          label="Confirm with your password"
          value={password}
          onChange={(value) => {
            setPassword(value)
            setConfirming(false)
          }}
          autoComplete="current-password"
          error={fieldError}
        />
        <FormError message={formError} />
        {confirming && (
          <p role="alert" className="mt-4 text-sm font-medium">
            Are you sure? Your account and your solo trips will be deleted for good.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className={`${confirming ? buttonPrimary : buttonSecondary} disabled:cursor-wait disabled:opacity-60`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {busy ? 'Deleting…' : confirming ? 'Delete for good' : 'Delete account'}
          </button>
          {confirming && !busy && (
            <button type="button" onClick={() => setConfirming(false)} className={buttonGhost}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </Card>
  )
}
