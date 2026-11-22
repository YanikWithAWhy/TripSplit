import { LogOut, Trash2, UserPlus, X } from 'lucide-react'
import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react'
import { normalizeUsername } from '../data/auth-messages'
import { useSocial } from '../data/social'
import { buttonGhost, buttonPrimary, buttonSecondary, iconButton, labelText, textInput } from '../styles'
import {
  findMe,
  MAX_MEMBER_NAME_LENGTH,
  MAX_TRIP_NAME_LENGTH,
  memberUsage,
  newTripDraft,
  tripToDraft,
  validateTripDraft,
  type Me,
  type Trip,
  type TripDraft,
  type TripDraftMember,
} from '../trips'
import { Avatar } from './Avatar'
import { DialogHeader } from './Dialog'
import { FieldError } from './FieldError'
import { UsernameCombobox } from './UsernameCombobox'

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

function withoutInvite(member: TripDraftMember): TripDraftMember {
  const { inviteUsername: _dropped, ...rest } = member
  return rest
}

/**
 * Create a trip or change its name and people.
 * Signed in, people join by invitation (username); without an account they are just names.
 */
export function TripForm({ trip, me, onSubmit, onCancel, onDelete, onLeave }: TripFormProps) {
  const baseId = useId()
  const social = useSocial()
  const inviteMode = Boolean(me && social)
  const [draft, setDraft] = useState<TripDraft>(() =>
    trip ? tripToDraft(trip) : newTripDraft(() => crypto.randomUUID(), me),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // The "Invite person" panel
  const [inviting, setInviting] = useState(false)
  const [inviteText, setInviteText] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [targetId, setTargetId] = useState('')
  const [inviteError, setInviteError] = useState<string | undefined>()

  const errors = validateTripDraft(draft, trip, { invitePeople: inviteMode })
  const shown = showErrors ? errors : null
  const nameId = `${baseId}-name`
  const inviteId = `${baseId}-invite`
  const targetSelectId = `${baseId}-invite-target`
  const memberInputId = (id: string) => `${baseId}-member-${id}`
  const focus = (id: string) => document.getElementById(id)?.focus()

  const savedMember = (id: string) => trip?.members.find((m) => m.id === id)
  const savedInvitation = (id: string) => trip?.invitations?.find((i) => i.memberId === id)

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

  // People without an account from older trips. An invitation can take one of them over.
  const placeholders = inviteMode
    ? draft.members.filter((m) => !m.isNew && !m.userId && !m.inviteUsername && !savedInvitation(m.id))
    : []
  const invitedInDraft = draft.members.flatMap((m) => (m.inviteUsername ? [m.inviteUsername] : []))
  const search = useCallback(
    (query: string) => (social ? social.searchUsernames(query, trip?.id ?? null) : Promise.resolve([])),
    [social, trip?.id],
  )

  const resetInvite = () => {
    setInviteText('')
    setPicked(null)
    setTargetId('')
    setInviteError(undefined)
  }

  const openInvite = () => {
    setInviting(true)
    resetInvite()
    requestAnimationFrame(() => focus(inviteId))
  }

  const pickUsername = (username: string) => {
    setInviteText(username)
    setPicked(username)
    setInviteError(undefined)
    // Pre-select a person with the same name, e.g. "Ben" for @ben.
    setTargetId(placeholders.find((m) => m.name.trim().toLowerCase() === username)?.id ?? '')
  }

  const addInvite = () => {
    const username = picked && normalizeUsername(inviteText) === picked ? picked : null
    if (!username) {
      setInviteError('Choose a username from the suggestions.')
      focus(inviteId)
      return
    }
    if (invitedInDraft.includes(username)) {
      setInviteError(`@${username} is already on the list.`)
      return
    }
    setDraft((d) =>
      targetId
        ? { ...d, members: d.members.map((m) => (m.id === targetId ? { ...m, inviteUsername: username } : m)) }
        : { ...d, members: [...d.members, { id: crypto.randomUUID(), name: username, isNew: true, inviteUsername: username }] },
    )
    resetInvite()
    requestAnimationFrame(() => focus(inviteId))
  }

  /** Invited in this form: a new person is removed again, an existing one just isn't invited. */
  const undoInvite = (member: TripDraftMember) =>
    member.isNew
      ? removeMember(member.id)
      : setDraft((d) => ({ ...d, members: d.members.map((m) => (m.id === member.id ? withoutInvite(m) : m)) }))

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
  const inviteErrorId = inviteError ? `${inviteId}-error` : undefined

  const renderMember = (member: TripDraftMember, index: number) => {
    const usage = trip && !member.isNew ? memberUsage(trip, member.id) : 0
    const isMe = Boolean(me && member.userId === me.userId)
    const linkedToOther = Boolean(member.userId) && !isMe
    const invitation = savedInvitation(member.id)
    const inputId = memberInputId(member.id)
    const error = shown?.memberNames[member.id]
    const errorId = error ? `${inputId}-error` : undefined
    const label = member.name.trim() || `person ${index + 1}`

    // What the row shows and allows.
    let username: string | undefined
    let hint: string | null = null
    let control: ReactNode
    const removeButton = (ariaLabel: string, onClick: () => void, disabled = false) => (
      <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={iconButton}>
        <X className="size-5" aria-hidden="true" />
      </button>
    )

    if (isMe) {
      username = inviteMode ? (savedMember(member.id)?.username ?? me?.name) : undefined
      control = (
        <span className="grid w-11 shrink-0 place-items-center">
          <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-canvas">You</span>
        </span>
      )
    } else if (linkedToOther) {
      username = savedMember(member.id)?.username
      hint = inviteMode ? "Joined the trip, so can't be removed" : "Linked to an account, so can't be removed"
      control = removeButton(`Remove ${label}`, () => {}, true)
    } else if (member.inviteUsername) {
      username = member.inviteUsername
      hint = member.isNew
        ? 'Gets an invitation when you save'
        : `Gets an invitation when you save, and takes over ${member.name}`
      control = removeButton(`Don't invite @${member.inviteUsername}`, () => undoInvite(member))
    } else if (invitation) {
      username = invitation.username
      hint =
        usage > 0
          ? "Invited, waiting for an answer · part of expenses, so can't be removed"
          : 'Invited, waiting for an answer · removing them takes the invitation back'
      control = removeButton(
        `Remove @${invitation.username ?? label} and take back the invitation`,
        () => removeMember(member.id),
        usage > 0,
      )
    } else {
      // A plain name: always without an account, in older trips also with one.
      if (inviteMode) hint = usage > 0 ? "No account · part of expenses, so can't be removed" : 'No account'
      else if (usage > 0) hint = "Part of expenses, so can't be removed"
      control = removeButton(`Remove ${label}`, () => removeMember(member.id), usage > 0)
    }

    // With accounts, only plain names from older trips stay editable; everyone else is their username.
    const editable = !inviteMode || (!isMe && !linkedToOther && !member.inviteUsername && !invitation)

    return (
      <li key={member.id} className="animate-enter">
        <div className="flex items-center gap-2">
          <Avatar name={username ?? member.name} />
          {editable ? (
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
          ) : (
            <p className="flex h-12 min-w-0 flex-1 items-center rounded-xl border border-line px-4">
              <span className="truncate font-medium">@{username ?? member.name}</span>
            </p>
          )}
          {control}
        </div>
        {hint && <p className="mt-1 pl-11 text-xs text-ink-muted">{hint}</p>}
        <div className="pl-11">
          <FieldError id={errorId} message={error} />
        </div>
      </li>
    )
  }

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
          {inviteMode && (
            <p className="mt-2 text-sm text-ink-muted">
              Invite friends by their username. They join the trip once they accept.
            </p>
          )}
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
                  .filter((m) => (!m.userId && !m.inviteUsername) || m.userId === me?.userId)
                  .map((m, i) => (
                    <option key={m.id} value={m.id}>
                      {m.name.trim() || `Person ${i + 1}`}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <ul className="mt-3 space-y-2">{draft.members.map(renderMember)}</ul>

          {inviteMode ? (
            inviting ? (
              <div className="mt-3 animate-enter rounded-2xl border border-line p-4">
                <label htmlFor={inviteId} className={labelText}>
                  Username
                </label>
                <div className="mt-2">
                  <UsernameCombobox
                    id={inviteId}
                    value={inviteText}
                    onChange={(value) => {
                      setInviteText(value)
                      setInviteError(undefined)
                    }}
                    onSelect={pickUsername}
                    onEnter={addInvite}
                    search={search}
                    exclude={invitedInDraft}
                    invalid={Boolean(inviteError)}
                    describedBy={inviteErrorId}
                  />
                </div>
                <FieldError id={inviteErrorId} message={inviteError} />

                {placeholders.length > 0 && (
                  <div className="mt-4">
                    <label htmlFor={targetSelectId} className={labelText}>
                      Who are they in this trip?
                    </label>
                    <select
                      id={targetSelectId}
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      className={`mt-2 ${textInput}`}
                    >
                      <option value="">Someone new</option>
                      {placeholders.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-sm text-ink-muted">Pick a person without an account to keep their expenses.</p>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={addInvite} className={buttonSecondary}>
                    <UserPlus className="size-4" aria-hidden="true" />
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInviting(false)
                      resetInvite()
                    }}
                    className={buttonGhost}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={openInvite} className={`mt-3 ${buttonSecondary}`}>
                <UserPlus className="size-4" aria-hidden="true" />
                Invite person
              </button>
            )
          ) : (
            <button type="button" onClick={addMember} className={`mt-3 ${buttonSecondary}`}>
              <UserPlus className="size-4" aria-hidden="true" />
              Add person
            </button>
          )}
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
