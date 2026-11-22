import { describe, expect, it } from 'vitest'
import { friendlyAuthError, normalizeUsername, validateEmail, validatePassword, validateUsername } from './auth-messages'

describe('validateEmail', () => {
  it('accepts normal addresses, also with spaces around them', () => {
    expect(validateEmail('anna@example.com')).toBeNull()
    expect(validateEmail('  anna@example.com ')).toBeNull()
  })

  it('explains missing or broken addresses', () => {
    expect(validateEmail('')).toBe('Enter your email address.')
    expect(validateEmail('anna@')).toBe('Enter a valid email address.')
    expect(validateEmail('anna example.com')).toBe('Enter a valid email address.')
  })
})

describe('validatePassword', () => {
  it('only asks for something when signing in', () => {
    expect(validatePassword('', 'current')).toBe('Enter your password.')
    expect(validatePassword('short', 'current')).toBeNull()
  })

  it('checks the length of new passwords', () => {
    expect(validatePassword('', 'new')).toBe('Choose a password.')
    expect(validatePassword('1234567', 'new')).toBe('Use at least 8 characters.')
    expect(validatePassword('12345678', 'new')).toBeNull()
    expect(validatePassword('x'.repeat(73), 'new')).toBe('Use at most 72 characters.')
  })
})

describe('usernames', () => {
  it('are stored lowercase without spaces around them', () => {
    expect(normalizeUsername('  Anna.K ')).toBe('anna.k')
  })

  it('accept letters, numbers, _ and . with 3–20 characters', () => {
    for (const ok of ['ann', 'Anna_K.2', 'x'.repeat(20)]) expect(validateUsername(ok)).toBeNull()
  })

  it('explain what is wrong', () => {
    expect(validateUsername('  ')).toBe('Choose a username.')
    expect(validateUsername('an')).toBe('Use at least 3 characters.')
    expect(validateUsername('x'.repeat(21))).toBe('Use at most 20 characters.')
    expect(validateUsername('anna k')).toBe('Use only letters, numbers, _ and .')
    expect(validateUsername('émile')).toBe('Use only letters, numbers, _ and .')
  })
})

describe('friendlyAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'Email or password is wrong.'],
    [{ code: 'email_not_confirmed', message: 'Email not confirmed' }, /confirm your email/],
    [{ code: 'weak_password', message: 'Password is known to be weak' }, /too weak/],
    [{ status: 429, message: 'email rate limit exceeded' }, /wait a minute/],
    [{ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, /Couldn't reach the server/],
    [{ code: 'same_password', message: 'New password should be different' }, /different from your current/],
    [{ name: 'AuthSessionMissingError', message: 'Auth session missing!' }, /sign in again/],
    [{ code: 'otp_disabled', message: 'Signups not allowed for otp' }, /turned off/],
  ])('translates %o', (error, expected) => {
    expect(friendlyAuthError(error)).toMatch(expected)
  })

  it('falls back to the original message', () => {
    expect(friendlyAuthError({ message: 'Something unusual' })).toBe('Something unusual')
  })
})
