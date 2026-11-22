import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  hasAuthCode,
  LINK_FAILED_MESSAGE,
  markPasswordRecovery,
  removeAuthCode,
  setLinkError,
  takeAuthRedirectError,
  takeTokenHashLink,
} from './auth-flow'

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const key: string | undefined = import.meta.env.VITE_SUPABASE_KEY
const configured = Boolean(url && key)

// Read email-link details from the address bar before anything else touches it.
const redirectError = configured ? takeAuthRedirectError(window.location, window.history) : null
const tokenLink = configured ? takeTokenHashLink(window.location, window.history) : null
const cameWithCode = configured && hasAuthCode(window.location)
if (redirectError) setLinkError(redirectError)

/**
 * The Supabase client, or null when no project is configured in .env.local.
 * Without it the app works as before and saves to this browser only.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // PKCE puts the code from default email links in ?code=…, which doesn't clash with the #/ routes.
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

if (supabase) {
  // Subscribe right away: PASSWORD_RECOVERY fires once during startup.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') markPasswordRecovery(true)
    if (event === 'SIGNED_OUT') markPasswordRecovery(false)
  })

  if (tokenLink) {
    // Link from a customised template: works in any browser.
    void supabase.auth.verifyOtp({ token_hash: tokenLink.tokenHash, type: tokenLink.type }).then(({ error }) => {
      if (error) setLinkError(LINK_FAILED_MESSAGE)
    })
  } else if (cameWithCode) {
    // Link from a default template: supabase-js exchanges the code itself, but only in the browser that asked for it.
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setLinkError(LINK_FAILED_MESSAGE)
      removeAuthCode(window.location, window.history)
    })
  }
}
