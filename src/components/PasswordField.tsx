import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../data/auth-messages'
import { iconButton, labelText } from '../styles'
import { FieldError } from './FieldError'

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  /** "new-password" shows the length hint and lets password managers suggest one. */
  autoComplete: 'current-password' | 'new-password'
  error?: string
}

/** Password input with a show/hide button. */
export function PasswordField({ id, label, value, onChange, autoComplete, error }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const isNew = autoComplete === 'new-password'
  const errorId = error ? `${id}-error` : undefined
  const hintId = isNew && !error ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className={`block ${labelText}`}>
        {label}
      </label>
      <div className="mt-2 flex items-center rounded-xl border border-line bg-raised pr-0.5 transition-colors duration-150 focus-within:border-ink has-aria-invalid:border-ink">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          maxLength={MAX_PASSWORD_LENGTH + 1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId ?? hintId}
          className="h-12 w-full min-w-0 bg-transparent px-4 text-base text-ink outline-none placeholder:text-ink-subtle"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className={iconButton}
        >
          {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
      </div>
      {hintId && (
        <p id={hintId} className="mt-2 text-sm text-ink-muted">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  )
}
