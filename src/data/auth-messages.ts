/** Validation and user-facing messages for accounts. Kept free of React so it can be tested. */

export const MIN_PASSWORD_LENGTH = 8
/** Supabase hashes passwords with bcrypt, which only uses the first 72 bytes. */
export const MAX_PASSWORD_LENGTH = 72

export const MIN_USERNAME_LENGTH = 3
export const MAX_USERNAME_LENGTH = 20
/** Same rule as the check constraint in supabase/migrations/…_profiles.sql. */
const USERNAME_PATTERN = /^[a-z0-9_.]+$/

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** sign-in uses email + password; sign-up and reset only ask for the email (a link follows). */
export type AuthMode = 'sign-in' | 'sign-up' | 'reset'

export function validateEmail(email: string): string | null {
  if (email.trim() === '') return 'Enter your email address.'
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.'
  return null
}

/** `current`: signing in, anything non-empty. `new`: choosing a password, length rules apply. */
export function validatePassword(password: string, kind: 'current' | 'new'): string | null {
  if (password === '') return kind === 'new' ? 'Choose a password.' : 'Enter your password.'
  if (kind === 'new') {
    if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`
  }
  return null
}

/** Usernames are stored lowercase without surrounding spaces. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase()
}

export function validateUsername(input: string): string | null {
  const username = normalizeUsername(input)
  if (username === '') return 'Choose a username.'
  if (username.length < MIN_USERNAME_LENGTH) return `Use at least ${MIN_USERNAME_LENGTH} characters.`
  if (username.length > MAX_USERNAME_LENGTH) return `Use at most ${MAX_USERNAME_LENGTH} characters.`
  if (!USERNAME_PATTERN.test(username)) return 'Use only letters, numbers, _ and .'
  return null
}

interface AuthErrorLike {
  message: string
  status?: number
  code?: string
  name?: string
}

/** Turns Supabase auth errors into short, plain messages. */
export function friendlyAuthError(error: AuthErrorLike): string {
  const { code, status, name, message } = error
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) {
    return 'Too many attempts. Please wait a minute and try again.'
  }
  if (name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(message)) {
    return "Couldn't reach the server. Check your connection and try again."
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'Email or password is wrong.'
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Please confirm your email address first. Check your inbox for the link.'
  }
  if (code === 'weak_password') {
    return 'This password is too weak. Try a longer one.'
  }
  if (code === 'same_password') {
    return 'Choose a password that is different from your current one.'
  }
  if (code === 'session_not_found' || name === 'AuthSessionMissingError') {
    return 'Your session has expired. Please sign in again.'
  }
  if (code === 'reauthentication_needed') {
    return 'For security, please sign in again and then change your password.'
  }
  if (code === 'signup_disabled' || code === 'otp_disabled') {
    return 'New accounts are turned off for this app.'
  }
  if (code === 'email_address_invalid') {
    return 'This email address is not accepted. Try another one.'
  }
  return message
}
