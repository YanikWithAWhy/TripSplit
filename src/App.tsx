import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dialog } from './components/Dialog'
import { Header } from './components/Header'
import { AccountMenu, LiveIndicator, LoadErrorView, LoadingView, SyncErrorBanner } from './components/StatusViews'
import { TripForm } from './components/TripForm'
import type { TripBackend } from './data/backend'
import { createLocalBackend } from './data/local-backend'
import { markPasswordRecovery, setLinkError, useAuthFlow } from './data/auth-flow'
import { createSocialApi, SocialContext, useSocial, type IncomingInvitation } from './data/social'
import { createSupabaseBackend } from './data/supabase-backend'
import { supabase } from './data/supabase-client'
import { useProfile } from './data/useProfile'
import { useSession } from './data/useSession'
import { useLiveUpdates } from './data/useLiveUpdates'
import { useTripStore } from './data/useTripStore'
import { CompleteAccountPage } from './pages/CompleteAccountPage'
import { SetNewPasswordPage } from './pages/SetNewPasswordPage'
import { SignInPage } from './pages/SignInPage'
import { TripListPage } from './pages/TripListPage'
import { TripPage } from './pages/TripPage'
import { homeHref, navigate, tripHref, useRoute } from './router'
import { buttonSecondary } from './styles'
import { applyTripDraft, demoTrip, draftInvites, remapIds, type Me, type TripDraft } from './trips'

const localBackend = createLocalBackend()

/**
 * With a Supabase project in .env.local: sign-in, data in the account.
 * Without: everything stays in this browser, like before.
 */
export default function App() {
  if (supabase) return <AccountApp client={supabase} />
  return (
    <TripApp
      backend={localBackend}
      me={null}
      headerRight={<span className="text-xs text-ink-subtle">Saved in this browser</span>}
    />
  )
}

/**
 * Signed out → sign-in page. Reset link → new password. Confirmed email without
 * username/password yet → finish the account. Otherwise → the trips.
 */
function AccountApp({ client }: { client: SupabaseClient }) {
  const session = useSession(client)
  const { recovering, linkError } = useAuthFlow()
  const profile = useProfile(client, session?.user.id)
  const backend = useMemo(() => createSupabaseBackend(client), [client])
  const social = useMemo(() => createSocialApi(client), [client])
  const signOut = () => void client.auth.signOut()

  let content: ReactNode
  if (session === undefined) {
    content = <LoadingView />
  } else if (session === null) {
    content = <SignInPage client={client} linkError={linkError} onDismissLinkError={() => setLinkError(null)} />
  } else if (recovering) {
    content = (
      <SetNewPasswordPage client={client} email={session.user.email ?? ''} onDone={() => markPasswordRecovery(false)} />
    )
  } else if (profile.state.status === 'loading') {
    content = <LoadingView />
  } else if (profile.state.status === 'failed') {
    content = <LoadErrorView title="Couldn't load your account" message={profile.state.message} onRetry={profile.retry} />
  } else {
    const hasPassword = session.user.user_metadata?.has_password === true
    const { profile: saved } = profile.state
    if (!saved || !hasPassword) {
      content = (
        <CompleteAccountPage
          client={client}
          userId={session.user.id}
          email={session.user.email ?? ''}
          profile={saved}
          hasPassword={hasPassword}
          onProfileSaved={profile.setProfile}
        />
      )
    } else {
      return (
        <SocialContext.Provider value={social}>
          <TripApp
            key={session.user.id}
            backend={backend}
            me={{ userId: session.user.id, name: saved.username }}
            headerRight={<AccountMenu label={`@${saved.username}`} onSignOut={signOut} />}
          />
        </SocialContext.Provider>
      )
    }
  }

  return (
    <>
      <Header />
      {content}
    </>
  )
}

interface TripAppProps {
  backend: TripBackend
  /** The signed-in user, or null in browser-only mode. */
  me: Me | null
  headerRight: ReactNode
}

function TripApp({ backend, me, headerRight }: TripAppProps) {
  const route = useRoute()
  const { trips, loadState, syncError, dispatch, reload, refresh } = useTripStore(backend)
  const [creatingTrip, setCreatingTrip] = useState(false)
  const social = useSocial()
  const [invitations, setInvitations] = useState<IncomingInvitation[]>([])

  const loadInvitations = useCallback(() => {
    social?.myInvitations().then(setInvitations, () => {
      // Keep the last known invitations when offline.
    })
  }, [social])

  /** Picks up changes made by others or outside the store. */
  const syncFromServer = useCallback(() => {
    void refresh()
    loadInvitations()
  }, [refresh, loadInvitations])

  useEffect(() => {
    loadInvitations()
  }, [loadInvitations])

  // Someone else changed something in one of the trips: reload in the background.
  const live = useLiveUpdates(social, syncFromServer)

  // Coming back to the app (other tab, phone unlocked): show what friends changed meanwhile.
  useEffect(() => {
    if (!social) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncFromServer()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [social, syncFromServer])

  const respondToInvitation = async (invitation: IncomingInvitation, accept: boolean) => {
    if (!social) return
    const tripId = await social.respond(invitation.id, accept)
    setInvitations((list) => list.filter((i) => i.id !== invitation.id))
    if (accept) {
      await refresh()
      navigate(tripHref(tripId))
    }
  }

  const trip = route.name === 'trip' ? trips.find((t) => t.id === route.tripId) : undefined
  const title = trip ? `${trip.name} · Tripsplit` : 'Tripsplit'

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  useEffect(() => {
    document.title = title
  }, [title])

  const now = () => new Date().toISOString()

  const createTrip = (draft: TripDraft) => {
    const draftTrip = applyTripDraft(draft, null, { id: crypto.randomUUID(), now: now() })
    // The database sets the owner itself; this keeps the screen right until the next reload.
    const created = me ? { ...draftTrip, createdBy: me.userId } : draftTrip
    const invites = draftInvites(draft)
    dispatch({ type: 'createTrip', trip: created, invites })
    setCreatingTrip(false)
    navigate(tripHref(created.id))
    if (invites.length > 0) syncFromServer()
  }

  // Only offered without accounts: a real account has no use for made-up people.
  const addDemoTrip = () =>
    dispatch({ type: 'createTrip', trip: remapIds(demoTrip('', now()), () => crypto.randomUUID()) })

  let content: ReactNode
  if (loadState === 'failed' && trips.length === 0) {
    content = <LoadErrorView message={syncError ?? 'Unknown error.'} onRetry={() => void reload()} />
  } else if (loadState === 'loading' && trips.length === 0) {
    content = <LoadingView label="Loading trips…" />
  } else if (route.name === 'trips') {
    content = (
      <TripListPage
        trips={trips}
        userId={me?.userId ?? null}
        invitations={invitations}
        onRespond={respondToInvitation}
        onNewTrip={() => setCreatingTrip(true)}
        onAddDemo={me ? undefined : addDemoTrip}
      />
    )
  } else if (trip) {
    content = <TripPage key={trip.id} trip={trip} dispatch={dispatch} me={me} onRemoteChange={syncFromServer} />
  } else {
    content = <TripNotFound />
  }

  return (
    <>
      <Header
        right={
          <div className="flex min-w-0 items-center gap-3">
            {live && <LiveIndicator status={live} />}
            {headerRight}
          </div>
        }
      />
      {content}
      {syncError && loadState === 'ready' && <SyncErrorBanner message={syncError} onReload={() => void reload()} />}

      <Dialog open={creatingTrip} onClose={() => setCreatingTrip(false)} label="New trip">
        <TripForm me={me} onSubmit={createTrip} onCancel={() => setCreatingTrip(false)} />
      </Dialog>
    </>
  )
}

function TripNotFound() {
  return (
    <main className="animate-enter mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 pt-24 text-center sm:px-6">
      <h1 className="text-2xl font-semibold">Trip not found</h1>
      <p className="text-ink-muted">It may have been deleted, or you don't have access to it.</p>
      <a href={homeHref} className={`mt-3 ${buttonSecondary}`}>
        Back to all trips
      </a>
    </main>
  )
}
