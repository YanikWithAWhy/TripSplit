import type { Member, MemberId } from './lib'

/**
 * How people are named in the UI. The signed-in user is "You" instead of their
 * name, with matching verbs ("You owe" vs. "Ben owes").
 */
export interface People {
  meId: MemberId | null
  isMe(id: MemberId): boolean
  /** The name as entered, also for you (e.g. for avatar initials). */
  realName(id: MemberId): string
  /** For labels and the start of a sentence: "You" or the name. */
  name(id: MemberId): string
  /** Inside a sentence: "you" or the name. */
  inline(id: MemberId): string
  /** Picks the verb form, e.g. verb(id, 'owes', 'owe'). */
  verb(id: MemberId, forOthers: string, forYou: string): string
}

export function createPeople(members: Member[], meId: MemberId | null): People {
  const names = new Map(members.map((m) => [m.id, m.name]))
  const realName = (id: MemberId) => names.get(id) ?? id
  const isMe = (id: MemberId) => meId !== null && id === meId
  return {
    meId,
    isMe,
    realName,
    name: (id) => (isMe(id) ? 'You' : realName(id)),
    inline: (id) => (isMe(id) ? 'you' : realName(id)),
    verb: (id, forOthers, forYou) => (isMe(id) ? forYou : forOthers),
  }
}
