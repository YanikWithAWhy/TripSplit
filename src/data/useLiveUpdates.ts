import { useEffect, useRef, useState } from 'react'
import { debounce, LIVE_DEBOUNCE_MS, type LiveStatus } from './live'
import type { SocialApi } from './social'

/**
 * Listens for changes other people make to the user's trips and calls
 * `onChange` (debounced) so the screen can reload. Null without accounts.
 */
export function useLiveUpdates(social: SocialApi | null, onChange: () => void): LiveStatus | null {
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!social) return
    const changed = debounce(() => onChangeRef.current(), LIVE_DEBOUNCE_MS)
    const stop = social.watchChanges(changed, setStatus)
    return () => {
      changed.cancel()
      stop()
    }
  }, [social])

  return social ? status : null
}
