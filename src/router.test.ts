import { describe, expect, it } from 'vitest'
import { accountHref, parseRoute, tripHref } from './router'

describe('parseRoute', () => {
  it('shows the trip list by default', () => {
    expect(parseRoute('')).toEqual({ name: 'trips' })
    expect(parseRoute('#/')).toEqual({ name: 'trips' })
    expect(parseRoute('#/unknown/page')).toEqual({ name: 'trips' })
  })

  it('reads the trip id', () => {
    expect(parseRoute('#/trips/abc-123')).toEqual({ name: 'trip', tripId: 'abc-123' })
    expect(parseRoute('#/trips/abc-123/')).toEqual({ name: 'trip', tripId: 'abc-123' })
  })

  it('round-trips ids with special characters', () => {
    expect(parseRoute(tripHref('a b/c'))).toEqual({ name: 'trip', tripId: 'a b/c' })
  })

  it('ignores malformed ids', () => {
    expect(parseRoute('#/trips/%E0%A4%A')).toEqual({ name: 'trips' })
  })
})

describe('account page', () => {
  it('reads the account settings address', () => {
    expect(parseRoute(accountHref)).toEqual({ name: 'account' })
    expect(parseRoute(`${accountHref}/`)).toEqual({ name: 'account' })
    expect(parseRoute('#/accounts')).toEqual({ name: 'trips' })
  })
})
