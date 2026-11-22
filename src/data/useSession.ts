import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

/** The current Supabase session: undefined while checking, null when signed out. */
export function useSession(client: SupabaseClient): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    void client.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [client])

  return session
}
