import { CircleAlert, MailOpen } from 'lucide-react'
import { useState } from 'react'
import type { IncomingInvitation } from '../data/social'
import { buttonGhost, buttonPrimary } from '../styles'

interface InvitationCardProps {
  invitation: IncomingInvitation
  onRespond: (invitation: IncomingInvitation, accept: boolean) => Promise<void>
}

/** "@anna invited you to Lake Garda 2026" with Accept and Decline. */
export function InvitationCard({ invitation, onRespond }: InvitationCardProps) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const answer = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline')
    setError(null)
    try {
      await onRespond(invitation, accept)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-3xl border border-line-strong bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-raised">
          <MailOpen className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="font-medium">
            {invitation.invitedBy ? `@${invitation.invitedBy}` : 'Someone'} invited you to{' '}
            <span className="font-semibold break-words">{invitation.tripName}</span>
          </p>
          <p className="mt-1 text-sm text-ink-muted">You'll join as {invitation.memberName}.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-2xl border border-ink p-3 text-sm font-medium">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => void answer(true)}
          disabled={busy !== null}
          className={`${buttonPrimary} disabled:cursor-wait disabled:opacity-60`}
        >
          {busy === 'accept' ? 'Joining…' : 'Accept'}
        </button>
        <button
          type="button"
          onClick={() => void answer(false)}
          disabled={busy !== null}
          className={`${buttonGhost} disabled:cursor-wait disabled:opacity-60`}
        >
          {busy === 'decline' ? 'Declining…' : 'Decline'}
        </button>
      </div>
    </div>
  )
}
