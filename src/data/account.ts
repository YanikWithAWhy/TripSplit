import type { SupabaseClient } from '@supabase/supabase-js'
import { friendlyAuthError } from './auth-messages'
import { createSupabaseReceipts } from './supabase-receipts'

/**
 * Account settings. Changing the password and deleting the account first check
 * the current password, so an unlocked phone alone isn't enough.
 * All functions throw an Error with a message meant for the user.
 */

const WRONG_PASSWORD = 'Your current password is wrong.'

async function verifyPassword(client: SupabaseClient, email: string, password: string) {
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (!error) return
  const wrong = error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message)
  throw new Error(wrong ? WRONG_PASSWORD : friendlyAuthError(error))
}

export async function changePassword(client: SupabaseClient, email: string, current: string, next: string) {
  await verifyPassword(client, email, current)
  const { error } = await client.auth.updateUser({ password: next, data: { has_password: true } })
  if (error) throw new Error(friendlyAuthError(error))
}

export async function changeUsername(client: SupabaseClient, username: string) {
  const { error } = await client.rpc('change_username', { p_username: username })
  if (error) throw new Error(error.code === '23505' ? 'This username is already taken.' : error.message)
}

/** Deletes the account (see delete_my_account in the migrations) and signs out on this device. */
export async function deleteAccount(client: SupabaseClient, email: string, password: string) {
  await verifyPassword(client, email, password)
  // Receipt photos of the trips that go with the account. Files can only be removed
  // through the Storage API, and only while the account still exists.
  const receipts = await client.rpc('my_solo_trip_receipts')
  if (receipts.error) throw new Error(receipts.error.message)
  await createSupabaseReceipts(client).remove((receipts.data as string[] | null) ?? [])
  const { error } = await client.rpc('delete_my_account')
  if (error) throw new Error(error.message)
  // The account is gone, so only the session stored in this browser needs to go.
  await client.auth.signOut({ scope: 'local' })
}
