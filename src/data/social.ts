import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

/** An invitation the signed-in user received, with what they need to decide. */
export interface IncomingInvitation {
  id: string
  tripId: string
  tripName: string
  /** Username of whoever invited them (if still visible). */
  invitedBy: string | null
  /** Who they will be in the trip. */
  memberName: string
  createdAt: string
}

/** Inviting friends by username. Only exists with accounts (Supabase). */
export interface SocialApi {
  /** Up to 5 usernames starting with `query`, leaving out people already in or invited to the trip. */
  searchUsernames(query: string, tripId: string): Promise<string[]>
  /** Invites `username` as an existing person (`memberId`) or as a new one (null). */
  invite(tripId: string, username: string, memberId: string | null): Promise<void>
  cancelInvitation(invitationId: string): Promise<void>
  myInvitations(): Promise<IncomingInvitation[]>
  /** Returns the trip id. */
  respond(invitationId: string, accept: boolean): Promise<string>
  leaveTrip(tripId: string): Promise<void>
}

function fail(error: PostgrestError): never {
  throw new Error(error.message)
}

export function createSocialApi(client: SupabaseClient): SocialApi {
  return {
    async searchUsernames(query, tripId) {
      const { data, error } = await client.rpc('search_usernames', { p_query: query, p_trip_id: tripId })
      if (error) fail(error)
      return (data as { username: string }[]).map((row) => row.username)
    },

    async invite(tripId, username, memberId) {
      const { error } = await client.rpc('invite_to_trip', {
        p_trip_id: tripId,
        p_username: username,
        ...(memberId ? { p_member_id: memberId } : {}),
      })
      if (error) fail(error)
    },

    async cancelInvitation(invitationId) {
      const { error } = await client.rpc('cancel_invitation', { p_invitation_id: invitationId })
      if (error) fail(error)
    },

    async myInvitations() {
      const { data, error } = await client.rpc('my_invitations')
      if (error) fail(error)
      return (
        data as {
          id: string
          trip_id: string
          trip_name: string
          invited_by_username: string | null
          member_name: string
          created_at: string
        }[]
      ).map((row) => ({
        id: row.id,
        tripId: row.trip_id,
        tripName: row.trip_name,
        invitedBy: row.invited_by_username,
        memberName: row.member_name,
        createdAt: row.created_at,
      }))
    },

    async respond(invitationId, accept) {
      const { data, error } = await client.rpc('respond_to_invitation', {
        p_invitation_id: invitationId,
        p_accept: accept,
      })
      if (error) fail(error)
      return data as string
    },

    async leaveTrip(tripId) {
      const { error } = await client.rpc('leave_trip', { p_trip_id: tripId })
      if (error) fail(error)
    },
  }
}

/** Null in browser-only mode, where there are no accounts to invite. */
export const SocialContext = createContext<SocialApi | null>(null)

export function useSocial(): SocialApi | null {
  return useContext(SocialContext)
}
