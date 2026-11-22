import { LogOut, Trash2, UserPlus, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { buttonGhost, buttonPrimary, buttonSecondary, iconButton, labelText, textInput } from '../styles'
import {
  MAX_MEMBER_NAME_LENGTH,
  MAX_TRIP_NAME_LENGTH,
  memberUsage,
  newTripDraft,
  tripToDraft,
  validateTripDraft,
  findMe,
  type Me,
  type Trip,
  type TripDraft,
} from '../trips'
import { Avatar } from './Avatar'
import { DialogHeader } from './Dialog'
import { FieldError } from './FieldError'

interface TripFormProps {
  /** The trip to edit. Leave out to create a new one. */
  trip?: Trip
  /** The signed-in user: first person of a new trip, shown as "You". */
  me?: Me | null
  onSubmit: (draft: TripDraft) => void
  onCancel: () => void
  /** Only for the trip's owner (or without accounts). */
  onDelete?: () => void
  /** For invited people: leave the trip instead of deleting it. */
  onLeave?: () => void
}

/** Create a trip or change its name and people. */
export function TripForm({ trip, me, onSubmit, onCancel, onDelete, onLeave }: TripFormProps) {
  const baseId = useId()
  const [draft, setDraft] = useState<TripDraft>(() =>
    trip ? tripToDraft(trip) : newTripDraft(() => crypto.randomUUID(), me),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const errors = validateTripDraft(draft, trip)
  const shown = showErrors ? errors : null
  const nameId = `${baseId}-name`
  const memberInputId = (id: string) => `${baseId}-member-${id}`
  const focus = (id: string) => document.getElementById(id)?.focus()

  const updateMember = (id: string, name: string) =>
    setDraft((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, name } : m)) }))

  const removeMember = (id: string) => setDraft((d) => ({ ...d, members: d.members.filter((m) => m.id !== id) }))

  // Trips saved without a link to you (e.g. created before accounts) ask once which person you are.
  const askWhoIsMe = Boolean(me && trip && !findMe(trip, me.userId))
  const chosenMeId = draft.members.find((m) => me && m.userId === me.userId)?.id ?? ''
  const chooseMe = (id: string) =>
    me &&
    setDraft((d) => ({
      ...d,
      members: d.members.map((m) => {
        if (m.id === id) return { ...m, userId: me.userId }
        if (m.userId !== me.userId) return m
        const { userId: _unlinked, ...rest } = m
        return rest
      }),
    }))

  const addMember = () => {
    const id = crypto.randomUUID()
    setDraft((d) => ({ ...d, members: [...d.members, { id, name: '', isNew: true }] }))
    requestAnimationFrame(() => focus(memberInputId(id)))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!errors) {
      onSubmit(draft)
      return
    }
    setShowErrors(true)
    const firstBadMember = draft.members.find((m) => errors.memberNames[m.id])
    if (errors.name) focus(nameId)
    else if (firstBadMember) focus(memberInputId(firstBadMember.id))
  }

  const nameErrorId = shown?.name ? `${nameId}-error` : undefined
  const membersErrorId = shown?.members ? `${baseId}-members-error` : undefined

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title={trip ? 'Trip settings' : 'New trip'} onClose={onCancel} />

      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-6">
        <div>
          <label htmlFor={nameId} className={labelText}>
            Trip name
          </label>
          <input
            id={nameId}
            data-autofocus={trip ? undefined : true}
            type="text"
            autoComplete="off"
            maxLength={MAX_TRIP_NAME_LENGTH}
            placeholder="e.g. Lake Garda 2026"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            aria-invalid={shown?.name ? true : undefined}
            aria-describedby={nameErrorId}
            className={`mt-2 ${textInput}`}
          />
          <FieldError id={nameErrorId} message={shown?.name} />
        </div>

        <fieldset aria-describedby={membersErrorId}>
          <legend className={labelText}>People</legend>
          {askWhoIsMe && (
            <div className="mt-2 mb-4 rounded-2xl border border-line p-4">
              <label htmlFor={`${baseId}-me`} className="font-medium">
                Which one is you?
              </label>
              <p className="mt-1 text-sm text-ink-muted">
                Links you to this person, so you see your own balance and can settle up.
              </p>
              <select
                id={`${baseId}-me`}
                value={chosenMeId}
                onChange={(e) => chooseMe(e.target.value)}
                className={`mt-3 ${textInput}`}
              >
                <option value="">Choose…</option>
                {draft.members
                  .filter((m) => !m.userId || m.userId === me?.userId)
                  .map((m, i) => (
                    <option key={m.id} value={m.id}>
                      {m.name.trim() || `Person ${i + 1}`}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <ul className="mt-2 space-y-2">
            {draft.members.map((member, index) => {
              const usage = trip && !member.isNew ? memberUsage(trip, member.id) : 0
              const isMe = Boolean(me && member.userId === me.userId)
              const linkedToOther = Boolean(member.userId) && !isMe
              const saved = trip?.members.find((m) => m.id === member.id)
              const invitation = trip?.invitations?.find((i) => i.memberId === member.id)
              const inputId = memberInputId(member.id)
              const error = shown?.memberNames[member.id]
              const errorId = error ? `${inputId}-error` : undefined
              const label = member.name.trim() || `person ${index + 1}`
              const hint = linkedToOther
                ? saved?.username
                  ? `@${saved.username} · linked to an account, so can't be removed`
                  : "Linked to an account, so can't be removed"
                : invitation
                  ? `Invited @${invitation.username ?? 'unknown'} · removing them cancels the invitation`
                  : !isMe && usage > 0
                    ? "Part of expenses, so can't be removed"
                    : null
              return (
                <li key={member.id}>
                  <div className="flex items-center gap-2">
                    <Avatar name={member.name} />
                    <input
                      id={inputId}
                      type="text"
                      autoComplete="off"
                      maxLength={MAX_MEMBER_NAME_LENGTH}
                      placeholder={`Person ${index + 1}`}
                      aria-label={isMe ? 'Your name in this trip' : `Name of person ${index + 1}`}
                      value={member.name}
                      onChange={(e) => updateMember(member.id, e.target.value)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={errorId}
                      className={`min-w-0 flex-1 ${textInput}`}
                    />
                    {isMe ? (
                      <span className="grid w-11 shrink-0 place-items-center">
                        <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-canvas">You</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeMember(member.id)}
                        disabled={usage > 0 || linkedToOther}
                        aria-label={`Remove ${label}`}
                        className={iconButton}
                      >
                        <X className="size-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {hint && <p className="mt-1 pl-11 text-xs text-ink-muted">{hint}</p>}
                  <div className="pl-11">
                    <FieldError id={errorId} message={error} />
                  </div>
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={addMember} className={`mt-3 ${buttonSecondary}`}>
            <UserPlus className="size-4" aria-hidden="true" />
            Add person
          </button>
          <FieldError id={membersErrorId} message={shown?.members} />
        </fieldset>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
        {(onDelete ?? onLeave) &&
          (confirmingDelete ? (
            <button type="button" onClick={onDelete ?? onLeave} className={buttonSecondary}>
              {onDelete ? <Trash2 className="size-4" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
              {onDelete ? 'Delete for good' : 'Leave for good'}
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className={`-ml-2 ${buttonGhost}`}>
              {onDelete ? <Trash2 className="size-4" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
              {onDelete ? 'Delete trip' : 'Leave trip'}
            </button>
          ))}
        <div className="ml-auto flex gap-2">
          <div className="hidden sm:block">
            <button type="button" onClick={onCancel} className={buttonSecondary}>
              Cancel
            </button>
          </div>
          <button type="submit" className={buttonPrimary}>
            {trip ? 'Save' : 'Create trip'}
          </button>
        </div>
      </div>
    </form>
  )
}
