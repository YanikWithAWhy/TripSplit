import { describe, expect, it } from 'vitest'
import { describeSplit } from './format'
import { createPeople } from './people'

const members = [
  { id: 'anna', name: 'Anna', userId: 'u1' },
  { id: 'ben', name: 'Ben' },
  { id: 'clara', name: 'Clara' },
]

describe('createPeople', () => {
  it('calls the signed-in user "You" and picks matching verbs', () => {
    const people = createPeople(members, 'anna')
    expect(people.name('anna')).toBe('You')
    expect(people.inline('anna')).toBe('you')
    expect(people.verb('anna', 'owes', 'owe')).toBe('owe')
    expect(people.name('ben')).toBe('Ben')
    expect(people.verb('ben', 'owes', 'owe')).toBe('owes')
  })

  it('uses plain names without a signed-in user', () => {
    const people = createPeople(members, null)
    expect(people.name('anna')).toBe('Anna')
    expect(people.isMe('anna')).toBe(false)
  })
})

describe('describeSplit with you', () => {
  const people = createPeople(members, 'anna')

  it('reads naturally', () => {
    expect(describeSplit({ type: 'equal', memberIds: ['anna', 'ben', 'clara'] }, members, people)).toBe('Split equally')
    expect(describeSplit({ type: 'equal', memberIds: ['anna', 'ben'] }, members, people)).toBe('Split between you and Ben')
    expect(describeSplit({ type: 'equal', memberIds: ['anna'] }, members, people)).toBe('For you')
    expect(
      describeSplit({ type: 'shares', shares: [{ memberId: 'anna', weight: 2 }, { memberId: 'ben', weight: 1 }] }, members, people),
    ).toBe('By shares: you 2, Ben 1')
  })
})
