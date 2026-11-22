import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'

export interface Profile {
  username: string
}

export type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile | null }
  | { status: 'failed'; message: string }

type Result = { userId: string; attempt: number } & ({ profile: Profile | null } | { error: string })

/** The signed-in user's profile (username). null means it hasn't been created yet. */
export function useProfile(client: SupabaseClient, userId: string | undefined) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    void client
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        setResult(
          error
            ? { userId, attempt, error: error.message }
            : { userId, attempt, profile: data ? { username: String(data.username) } : null },
        )
      })
    return () => {
      active = false
    }
  }, [client, userId, attempt])

  let state: ProfileState
  if (!result || result.userId !== userId || result.attempt !== attempt) state = { status: 'loading' }
  else if ('error' in result) state = { status: 'failed', message: result.error }
  else state = { status: 'ready', profile: result.profile }

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  const setProfile = useCallback(
    (profile: Profile) => {
      if (userId) setResult({ userId, attempt, profile })
    },
    [userId, attempt],
  )

  return { state, retry, setProfile }
}
