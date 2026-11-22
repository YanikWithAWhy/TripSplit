import { CircleAlert, CircleCheck, Send } from 'lucide-react'
import { useCallback, useId, useState, type FormEvent } from 'react'
import { normalizeUsername, validateUsername } from '../data/auth-messages'
import type { SocialApi } from '../data/social'
import { stagger } from '../motion'
import { buttonGhost, buttonPrimary, buttonSecondary, labelText, textInput } from '../styles'
import type { Trip } from '../trips'
import { DialogHeader } from './Dialog'
import { FieldError } from './FieldError'
import { UsernameCombobox } from './UsernameCombobox'

interface InviteFormProps {
  trip: Trip
  social: SocialApi
  /** Reload the trip after sending or cancelling, so the list below is current. */
  onChanged: () => void
  onClose: () => void
}

/** Invite friends by username. They join the trip once they accept. */
export function InviteForm({ trip, social, onChanged, onClose }: InviteFormProps) {
  const baseId = useId()
  const usernameId = `${baseId}-username`
  const personId = `${baseId}-person`
  const [text, setText] = useState('')
  const [memberId, setMemberId] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const invitations = trip.invitations ?? []
  // People in the trip who could be the friend: not linked to an account, not invited yet.
  const candidates = trip.members.filter((m) => !m.userId && !invitations.some((i) => i.memberId === m.id))
  const nameOf = (id: string) => trip.members.find((m) => m.id === id)?.name ?? ''
  const search = useCallback((query: string) => social.searchUsernames(query, trip.id), [social, trip.id])

  const selectUsername = (username: string) => {
    setText(username)
    setFieldError(undefined)
    // Pre-select a person with the same name, e.g. "Ben" for @ben.
    const sameName = candidates.find((m) => m.name.trim().toLowerCase() === username)
    setMemberId(sameName?.id ?? '')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const username = normalizeUsername(text).replace(/^@/, '')
    const problem = validateUsername(username) ?? undefined
    setFieldError(problem)
    setFormError(null)
    setSentTo(null)
    if (problem) {
      document.getElementById(usernameId)?.focus()
      return
    }
    setBusy(true)
    try {
      await social.invite(trip.id, username, memberId || null)
      setSentTo(username)
      setText('')
      setMemberId('')
      onChanged()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async (invitationId: string) => {
    setCancelling(invitationId)
    setFormError(null)
    try {
      await social.cancelInvitation(invitationId)
      onChanged()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setCancelling(null)
    }
  }

  const fieldErrorId = fieldError ? `${usernameId}-error` : undefined

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title="Invite friends" onClose={onClose} />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-6">
        <p className="text-ink-muted">
          Friends with a Tripsplit account can join this trip. They see your invitation and join once they accept.
        </p>

        <div>
          <label htmlFor={usernameId} className={labelText}>
            Username
          </label>
          <div className="mt-2">
            <UsernameCombobox
              id={usernameId}
              value={text}
              onChange={(value) => {
                setText(value)
                setSentTo(null)
              }}
              onSelect={selectUsername}
              search={search}
              invalid={Boolean(fieldError)}
              describedBy={fieldErrorId}
            />
          </div>
          <FieldError id={fieldErrorId} message={fieldError} />
        </div>

        {candidates.length > 0 && (
          <div>
            <label htmlFor={personId} className={labelText}>
              Who are they in this trip?
            </label>
            <select
              id={personId}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className={`mt-2 ${textInput}`}
            >
              <option value="">Add them as a new person</option>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-ink-muted">
              Pick an existing person to keep their expenses. They take over that person when they join.
            </p>
          </div>
        )}

        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-ink p-3 text-sm font-medium">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {formError}
          </p>
        )}
        {sentTo && (
          <p role="status" className="flex animate-enter items-center gap-2 rounded-2xl bg-raised p-3 text-sm font-medium">
            <CircleCheck className="size-4 shrink-0 animate-pop" aria-hidden="true" />
            Invitation sent to @{sentTo}.
          </p>
        )}

        {invitations.length > 0 && (
          <div>
            <h3 className={labelText}>Waiting for an answer</h3>
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
              {invitations.map((invitation, index) => (
                <li
                  key={invitation.id}
                  className="flex animate-enter items-center gap-3 py-1.5 pr-2 pl-4"
                  style={stagger(index)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">@{invitation.username ?? 'unknown'}</p>
                    <p className="truncate text-sm text-ink-muted">as {nameOf(invitation.memberId)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void cancel(invitation.id)}
                    disabled={cancelling === invitation.id}
                    aria-label={`Cancel invitation for @${invitation.username ?? 'unknown'}`}
                    className={buttonGhost}
                  >
                    {cancelling === invitation.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
        <div className="hidden sm:block">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Done
          </button>
        </div>
        <button type="submit" disabled={busy} className={`${buttonPrimary} disabled:cursor-wait disabled:opacity-60`}>
          <Send className="size-4" aria-hidden="true" />
          {busy ? 'Sending…' : 'Send invitation'}
        </button>
      </div>
    </form>
  )
}
