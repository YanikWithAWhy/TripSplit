import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { changePassword, changeUsername, deleteAccount } from './account'

type Result = { error: { message: string; code?: string } | null }

function fakeClient({ signIn = { error: null }, update = { error: null }, rpc = { error: null } }: Partial<Record<'signIn' | 'update' | 'rpc', Result>> = {}) {
  const client = {
    auth: {
      signInWithPassword: vi.fn(async () => signIn),
      updateUser: vi.fn(async () => update),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async () => rpc),
  }
  return { client, typed: client as unknown as SupabaseClient }
}

const wrong = { error: { message: 'Invalid login credentials', code: 'invalid_credentials' } }

describe('changePassword', () => {
  it('checks the current password, then saves the new one', async () => {
    const { client, typed } = fakeClient()
    await changePassword(typed, 'a@example.com', 'old-pass', 'new-pass-123')
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'old-pass' })
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: 'new-pass-123', data: { has_password: true } })
  })

  it('stops when the current password is wrong', async () => {
    const { client, typed } = fakeClient({ signIn: wrong })
    await expect(changePassword(typed, 'a@example.com', 'nope', 'new-pass-123')).rejects.toThrow(
      'Your current password is wrong.',
    )
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })

  it('explains a rejected new password', async () => {
    const { typed } = fakeClient({ update: { error: { message: 'same', code: 'same_password' } } })
    await expect(changePassword(typed, 'a@example.com', 'old', 'old')).rejects.toThrow(/different from your current/)
  })
})

describe('changeUsername', () => {
  it('calls the database function and explains taken names', async () => {
    const ok = fakeClient()
    await changeUsername(ok.typed, 'new_name')
    expect(ok.client.rpc).toHaveBeenCalledWith('change_username', { p_username: 'new_name' })

    const taken = fakeClient({ rpc: { error: { message: 'duplicate key', code: '23505' } } })
    await expect(changeUsername(taken.typed, 'anna')).rejects.toThrow('This username is already taken.')
  })
})

describe('deleteAccount', () => {
  it('checks the password, deletes and signs out on this device', async () => {
    const { client, typed } = fakeClient()
    await deleteAccount(typed, 'a@example.com', 'secret-pass')
    expect(client.rpc).toHaveBeenCalledWith('delete_my_account')
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('removes the receipt photos of solo trips before the account is gone', async () => {
    const order: string[] = []
    const client = {
      auth: { signInWithPassword: vi.fn(async () => ({ error: null })), signOut: vi.fn(async () => ({ error: null })) },
      rpc: vi.fn(async (name: string) => {
        order.push(name)
        return { data: name === 'my_solo_trip_receipts' ? ['t1/e1/a.jpg'] : null, error: null }
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async (paths: string[]) => {
            order.push(`remove ${paths.join(',')}`)
            return { data: [], error: null }
          }),
        })),
      },
    }
    await deleteAccount(client as unknown as SupabaseClient, 'a@example.com', 'secret-pass')
    expect(order).toEqual(['my_solo_trip_receipts', 'remove t1/e1/a.jpg', 'delete_my_account'])
  })

  it('deletes nothing when the password is wrong', async () => {
    const { client, typed } = fakeClient({ signIn: wrong })
    await expect(deleteAccount(typed, 'a@example.com', 'nope')).rejects.toThrow('Your current password is wrong.')
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
