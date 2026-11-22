import type { SupabaseClient } from '@supabase/supabase-js'
import { CircleAlert, Mail } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { FieldError } from '../components/FieldError'
import { PasswordField } from '../components/PasswordField'
import { SegmentPill } from '../components/SegmentPill'
import { friendlyAuthError, validateEmail, validatePassword, type AuthMode } from '../data/auth-messages'
import { buttonGhost, buttonPrimary, buttonSecondary, labelText, textInput } from '../styles'

const copy: Record<AuthMode, { title: string; text: string; submit: string; busy: string }> = {
  'sign-in': {
    title: 'Sign in',
    text: 'Welcome back. Sign in to open your trips on any device.',
    submit: 'Sign in',
    busy: 'Signing in…',
  },
  'sign-up': {
    title: 'Create account',
    text: "Enter your email. We'll send you a link to confirm it, then you choose a username and password.",
    submit: 'Send confirmation link',
    busy: 'Sending…',
  },
  reset: {
    title: 'Reset password',
    text: "Enter your email and we'll send you a link to choose a new password.",
    submit: 'Send reset link',
    busy: 'Sending…',
  },
}

type Sent = { kind: 'sign-up' | 'reset'; email: string }

interface SignInPageProps {
  client: SupabaseClient
  /** Problem with an email link the user just opened (expired, used, other browser). */
  linkError: string | null
  onDismissLinkError: () => void
}

/**
 * Sign in with email + password. New accounts start with the email only:
 * the link in the confirmation email leads to choosing a username and password.
 */
export function SignInPage({ client, linkError, onDismissLinkError }: SignInPageProps) {
  const baseId = useId()
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Sent | null>(null)

  const emailId = `${baseId}-email`
  const passwordId = `${baseId}-password`
  const text = copy[mode]
  const shownError = formError ?? linkError

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setFieldErrors({})
    setFormError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    const errors = {
      email: validateEmail(address) ?? undefined,
      password: mode === 'sign-in' ? (validatePassword(password, 'current') ?? undefined) : undefined,
    }
    setFieldErrors(errors)
    setFormError(null)
    onDismissLinkError()
    if (errors.email || errors.password) {
      document.getElementById(errors.email ? emailId : passwordId)?.focus()
      return
    }

    setBusy(true)
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    try {
      if (mode === 'sign-in') {
        const { error } = await client.auth.signInWithPassword({ email: address, password })
        if (error) throw error
        // Success: the session listener in App takes over.
      } else if (mode === 'sign-up') {
        const { error } = await client.auth.signInWithOtp({
          email: address,
          options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
        })
        if (error) throw error
        setSent({ kind: 'sign-up', email: address })
      } else {
        const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo })
        if (error) throw error
        setSent({ kind: 'reset', email: address })
      }
    } catch (error) {
      setFormError(friendlyAuthError(error as { message: string }))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <main className="animate-enter mx-auto flex min-h-[calc(100dvh-4rem)] max-w-sm flex-col justify-center px-4 py-12 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-line bg-raised">
          <Mail className="size-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-ink-muted">
          {sent.kind === 'sign-up' ? (
            <>
              We sent a link to <span className="font-medium text-ink">{sent.email}</span>.
            </>
          ) : (
            <>
              If there is an account for <span className="font-medium text-ink">{sent.email}</span>, we sent it a link
              to choose a new password.
            </>
          )}
        </p>
        <p className="mt-3 text-sm text-ink-muted">Nothing there? Check your spam folder or try again in a minute.</p>
        <button
          type="button"
          onClick={() => {
            setSent(null)
            switchMode('sign-in')
          }}
          className={`mx-auto mt-8 ${buttonSecondary}`}
        >
          Back to sign in
        </button>
      </main>
    )
  }

  return (
    <main className="animate-enter mx-auto flex min-h-[calc(100dvh-4rem)] max-w-sm flex-col justify-center px-4 py-12">
      {mode !== 'reset' && (
        <div className="relative mb-8 grid grid-cols-2 gap-1 rounded-full border border-line bg-raised p-1">
          <SegmentPill index={mode === 'sign-up' ? 1 : 0} count={2} />
          {(['sign-in', 'sign-up'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => switchMode(m)}
              className={`relative h-11 rounded-full text-sm font-semibold transition-colors duration-300 ${
                mode === m ? 'text-canvas' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {copy[m].title}
            </button>
          ))}
        </div>
      )}

      <form key={mode} onSubmit={submit} noValidate className="animate-enter">
        <h1 className="text-3xl font-semibold tracking-[-0.02em]">{text.title}</h1>
        <p className="mt-2 text-ink-muted">{text.text}</p>

        <label htmlFor={emailId} className={`mt-8 block ${labelText}`}>
          Email
        </label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete={mode === 'sign-up' ? 'email' : 'username'}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? `${emailId}-error` : undefined}
          className={`mt-2 ${textInput}`}
        />
        <FieldError id={fieldErrors.email ? `${emailId}-error` : undefined} message={fieldErrors.email} />

        {mode === 'sign-in' && (
          <div className="mt-6">
            <PasswordField
              id={passwordId}
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              error={fieldErrors.password}
            />
          </div>
        )}

        {shownError && (
          <p role="alert" className="mt-6 flex items-start gap-2 rounded-2xl border border-ink p-3 text-sm font-medium">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {shownError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className={`mt-6 w-full ${buttonPrimary} disabled:cursor-wait disabled:opacity-60`}
        >
          {busy ? text.busy : text.submit}
        </button>
      </form>

      <div className="mt-4 flex justify-center">
        {mode === 'reset' ? (
          <button type="button" onClick={() => switchMode('sign-in')} className={buttonGhost}>
            Back to sign in
          </button>
        ) : (
          mode === 'sign-in' && (
            <button type="button" onClick={() => switchMode('reset')} className={buttonGhost}>
              Forgot your password?
            </button>
          )
        )}
      </div>
    </main>
  )
}
