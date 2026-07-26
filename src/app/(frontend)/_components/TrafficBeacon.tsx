'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Client-side traffic beacon (Task 4E; TODO 4.9). Fires a one-shot
 * `navigator.sendBeacon` to the `/track` route on the initial load and on every
 * client-side navigation (keyed on the pathname), so the RSC render is NEVER
 * blocked by the capture. Sends only the current PATH + referrer — the server
 * derives the coarse device class and a rotating salted session hash and stores
 * NO PII (see `src/site/traffic.ts`). Degrades gracefully: if the beacon fails
 * or JS is off, navigation is entirely unaffected (analytics is best-effort).
 */
export function TrafficBeacon() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const payload = JSON.stringify({ path: pathname, referrer: document.referrer || '' })
    try {
      if (typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/track', new Blob([payload], { type: 'application/json' }))
      } else {
        void fetch('/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        })
      }
    } catch {
      // best-effort — never surface a capture error to the visitor
    }
  }, [pathname])

  return null
}
