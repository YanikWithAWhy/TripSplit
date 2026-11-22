import type { SupabaseClient } from '@supabase/supabase-js'
import { CircleAlert, CircleCheck, KeyRound } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { PasswordField } from '../components/PasswordField'
import { friendlyAuthError, validatePassword } from '../data/auth-messages'
import { buttonGhost, buttonPrimary } from '../styles'

interface SetNewPasswordPageProps {
  client: SupabaseClient
  email: string
  /** Called once the new password is saved and the user continues. */
  onDone: () => void
}

/** Shown after opening a password reset link: the user is signed in and picks a new password. */
export function SetNewPasswordPage({ client, email, onDone }: SetNewPasswordPageProps) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const problem = validatePassword(password, 'new') ?? undefined
    setFieldError(problem)
    setFormError(null)
    if (problem) {
      document.getElementById(id)?.focus()
      return
    }
    setBusy(true)
    const { error } = await client.auth.updateUser({ password, data: { has_password: true } })
    setBusy(false)
    if (error) {
      setFormError(friendlyAuthError(error))
      return
    }
    setSaved(true)
  }

  if (saved) {
    return (
      <main className="animate-enter mx-auto flex min-h-[calc(100dvh-4rem)] max-w-sm flex-col justify-center px-4 py-12 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-line bg-raised">
          <CircleCheck className="size-6" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Password changed</h1>
        <p className="mt-2 text-ink-muted">Use your new password the next time you sign in.</p>
        <button type="button" onClick={onDone} className={`mx-auto mt-8 ${buttonPrimary}`}>
          Continue to your trips
        </button>
      </main>
    )
  }

  return (
    <main className="animate-enter mx-auto flex min-h-[calc(100dvh-4rem)] max-w-sm flex-col justify-center px-4 py-12">
      <span className="grid size-14 place-items-center rounded-2xl border border-line bg-raised">
        <KeyRound className="size-6" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <form onSubmit={submit} noValidate className="mt-6">
        <h1 className="text-3xl font-semibold tracking-[-0.02em]">Choose a new password</h1>
        <p className="mt-2 text-ink-muted">
          For <span className="font-medium text-ink">{email}</span>.
        </p>

        <div className="mt-8">
          <PasswordField
            id={id}
            label="New password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            error={fieldError}
          />
        </div>

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
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
      <div className="mt-4 flex justify-center">
        <button type="button" onClick={() => void client.auth.signOut()} className={buttonGhost}>
          Sign out instead
        </button>
      </div>
    </main>
  )
}
