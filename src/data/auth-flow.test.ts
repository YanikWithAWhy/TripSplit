import { describe, expect, it, vi } from 'vitest'
import {
  hasAuthCode,
  LINK_FAILED_MESSAGE,
  markPasswordRecovery,
  removeAuthCode,
  setLinkError,
  takeAuthRedirectError,
  takeTokenHashLink,
} from './auth-flow'

function fakeLocation(search: string, hash = '') {
  const location = { search, hash, pathname: '/' } as Location
  const history = { state: null, replaceState: vi.fn() } as unknown as History
  return { location, history }
}

describe('takeAuthRedirectError', () => {
  it('does nothing for normal page loads', () => {
    const { location, history } = fakeLocation('', '#/trips/abc')
    expect(takeAuthRedirectError(location, history)).toBeNull()
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('explains an expired link and cleans the address bar', () => {
    const { location, history } = fakeLocation(
      '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )
    expect(takeAuthRedirectError(location, history)).toBe(LINK_FAILED_MESSAGE)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/#/')
  })

  it('also reads errors from the hash and keeps other query parameters', () => {
    const { location, history } = fakeLocation('?utm=mail', '#error=server_error&error_description=Something+broke')
    expect(takeAuthRedirectError(location, history)).toBe('Something broke')
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?utm=mail#/')
  })
})

describe('takeTokenHashLink', () => {
  it('reads sign-up and reset links and removes them from the address bar', () => {
    const signup = fakeLocation('?token_hash=abc123&type=email')
    expect(takeTokenHashLink(signup.location, signup.history)).toEqual({ tokenHash: 'abc123', type: 'email' })
    expect(signup.history.replaceState).toHaveBeenCalledWith(null, '', '/#/')

    const reset = fakeLocation('?token_hash=xyz&type=recovery', '#/trips/t1')
    expect(takeTokenHashLink(reset.location, reset.history)).toEqual({ tokenHash: 'xyz', type: 'recovery' })
    expect(reset.history.replaceState).toHaveBeenCalledWith(null, '', '/#/trips/t1')
  })

  it('ignores incomplete or unknown links', () => {
    for (const search of ['', '?token_hash=abc', '?type=email', '?token_hash=abc&type=hack']) {
      const { location, history } = fakeLocation(search)
      expect(takeTokenHashLink(location, history)).toBeNull()
      expect(history.replaceState).not.toHaveBeenCalled()
    }
  })
})

describe('auth codes from default links', () => {
  it('detects and removes ?code=…', () => {
    const { location, history } = fakeLocation('?code=123&x=1')
    expect(hasAuthCode(location)).toBe(true)
    removeAuthCode(location, history)
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?x=1#/')
  })
})

describe('auth flow store', () => {
  it('accepts repeated updates', () => {
    expect(() => {
      markPasswordRecovery(true)
      markPasswordRecovery(true)
      setLinkError('x')
      setLinkError(null)
      markPasswordRecovery(false)
    }).not.toThrow()
  })
})
