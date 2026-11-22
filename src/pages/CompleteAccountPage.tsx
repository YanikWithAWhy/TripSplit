import type { SupabaseClient } from '@supabase/supabase-js'
import { CircleAlert, UserRound } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { FieldError } from '../components/FieldError'
import { PasswordField } from '../components/PasswordField'
import {
  friendlyAuthError,
  MAX_USERNAME_LENGTH,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from '../data/auth-messages'
import type { Profile } from '../data/useProfile'
import { buttonGhost, buttonPrimary, labelText } from '../styles'

interface CompleteAccountPageProps {
  client: SupabaseClient
  userId: string
  email: string
  /** Already saved in an earlier attempt: then only the password is still missing. */
  profile: Profile | null
  hasPassword: boolean
  onProfileSaved: (profile: Profile) => void
}

const TAKEN = 'This username is already taken.'

/**
 * Second step of signing up, after the confirmation link: choose a username and a password.
 * Saves the profile first (it can fail on a taken name), then the password.
 */
export function CompleteAccountPage({
  client,
  userId,
  email,
  profile,
  hasPassword,
  onProfileSaved,
}: CompleteAccountPageProps) {
  const baseId = useId()
  const usernameId = `${baseId}-username`
  const passwordId = `${baseId}-password`
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next = {
      username: profile ? undefined : (validateUsername(username) ?? undefined),
      password: hasPassword ? undefined : (validatePassword(password, 'new') ?? undefined),
    }
    setErrors(next)
    setFormError(null)
    if (next.username || next.password) {
      document.getElementById(next.username ? usernameId : passwordId)?.focus()
      return
    }

    setBusy(true)
    try {
      if (!profile) {
        const name = normalizeUsername(username)
        const check = await client.rpc('is_username_available', { p_username: name })
        if (check.error) throw check.error
        if (check.data === false) {
          setErrors({ username: TAKEN })
          document.getElementById(usernameId)?.focus()
          return
        }
        const insert = await client.from('profiles').insert({ id: userId, username: name })
        if (insert.error) {
          if (insert.error.code === '23505') {
            setErrors({ username: TAKEN })
            document.getElementById(usernameId)?.focus()
            return
          }
          throw insert.error
        }
        onProfileSaved({ username: name })
      }
      if (!hasPassword) {
        // has_password lets the app know the account is complete; the auth session alone can't tell.
        const { error } = await client.auth.updateUser({ password, data: { has_password: true } })
        if (error) throw error
      }
    } catch (error) {
      setFormError(friendlyAuthError(error as { message: string }))
    } finally {
      setBusy(false)
    }
  }

  const usernameErrorId = errors.username ? `${usernameId}-error` : undefined
  const usernameHintId = `${usernameId}-hint`

  return (
    <main className="animate-enter mx-auto flex min-h-[calc(100dvh-4rem)] max-w-sm flex-col justify-center px-4 py-12">
      <span className="grid size-14 place-items-center rounded-2xl border border-line bg-raised">
        <UserRound className="size-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <form onSubmit={submit} noValidate className="mt-6">
        <h1 className="text-3xl font-semibold tracking-[-0.02em]">Finish your account</h1>
        <p className="mt-2 text-ink-muted">
          <span className="font-medium text-ink">{email}</span> is confirmed. Choose a username and a password for
          signing in.
        </p>

        {/* Lets password managers save the email together with the new password. */}
        <input
          type="email"
          autoComplete="username"
          value={email}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />

        <div className="mt-8">
          <label htmlFor={usernameId} className={`block ${labelText}`}>
            Username
          </label>
          {profile ? (
            <p className="mt-2 flex h-12 items-center rounded-xl border border-line px-4 text-ink-muted">
              @{profile.username}
            </p>
          ) : (
            <>
              <div className="mt-2 flex items-center rounded-xl border border-line bg-raised pl-4 transition-colors duration-150 focus-within:border-ink has-aria-invalid:border-ink">
                <span className="text-ink-muted" aria-hidden="true">
                  @
                </span>
                <input
                  id={usernameId}
                  autoFocus
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={MAX_USERNAME_LENGTH + 5}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={errors.username ? true : undefined}
                  aria-describedby={usernameErrorId ?? usernameHintId}
                  className="h-12 w-full min-w-0 bg-transparent pr-4 pl-1 text-base text-ink outline-none"
                />
              </div>
              {!errors.username && (
                <p id={usernameHintId} className="mt-2 text-sm text-ink-muted">
                  3–20 characters: letters, numbers, _ and .
                </p>
              )}
              <FieldError id={usernameErrorId} message={errors.username} />
            </>
          )}
        </div>

        {!hasPassword && (
          <div className="mt-6">
            <PasswordField
              id={passwordId}
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              error={errors.password}
            />
          </div>
        )}

        {formError && (
          <p role="alert" className="mt-6 flex items-start gap-2 rounded-2xl border border-ink p-3 text-sm font-medium">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={`mt-6 w-full ${buttonPrimary} disabled:cursor-wait disabled:opacity-60`}
        >
          {busy ? 'Saving…' : 'Create account'}
        </button>
      </form>
      <div className="mt-4 flex justify-center">
        <button type="button" onClick={() => void client.auth.signOut()} className={buttonGhost}>
          Use a different email
        </button>
      </div>
    </main>
  )
}
