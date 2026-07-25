'use client'

import { useAuth, useConfig } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { branding } from '../../branding'

/**
 * Client half of the idle auto-logout (Task 2C Part 3). Tracks user activity
 * (mouse/key/scroll/touch/tab-visibility), and when the session has been idle
 * for all but the final `warningSeconds` it raises an accessible countdown
 * dialog with two choices:
 *   - "Stay signed in" → resets the timer AND pings `refresh-token` to keep the
 *     Payload session warm (so extending the UX timer also extends the real
 *     session), then dismisses the dialog.
 *   - "Log out now" / timeout → performs a REAL logout (POST logout +
 *     `useAuth().logOut()`) and redirects to the login screen.
 *
 * Once the warning is showing, passive activity (an idle mouse drift) does NOT
 * silently extend the session — the user must make an explicit choice — which
 * keeps the countdown from flickering and matches the legacy quick-menu
 * behavior (ref 1-9).
 */

type Props = {
  timeoutMinutes: number
  warningSeconds: number
}

const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'visibilitychange',
] as const

export function IdleLogoutClient({
  timeoutMinutes,
  warningSeconds,
}: Props): React.ReactElement | null {
  const { user, logOut } = useAuth()
  const { config } = useConfig()

  const routes = (config as { routes?: { admin?: string; api?: string } } | undefined)?.routes
  const adminRoute = routes?.admin || '/admin'
  const apiRoute = routes?.api || '/api'
  const userSlug = (config as { admin?: { user?: string } } | undefined)?.admin?.user || 'users'

  const timeoutMs = Math.max(1, timeoutMinutes) * 60_000
  const warningMs = Math.min(Math.max(1, warningSeconds) * 1000, timeoutMs - 1000)

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  // Initialized to 0 (not `Date.now()`, which would be an impure render call);
  // the activity effect stamps the real start time before the tick begins.
  const lastActivityRef = useRef(0)
  const warningActiveRef = useRef(false)
  const loggingOutRef = useRef(false)
  const extendButtonRef = useRef<HTMLButtonElement | null>(null)

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
    warningActiveRef.current = false
    setSecondsLeft(null)
  }, [])

  const doLogout = useCallback(async () => {
    if (loggingOutRef.current) {
      return
    }
    loggingOutRef.current = true
    try {
      await fetch(`${apiRoute}/${userSlug}/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      /* best-effort — redirect below still clears the client */
    }
    try {
      if (typeof logOut === 'function') {
        await logOut()
      }
    } catch {
      /* ignore */
    }
    window.location.assign(`${adminRoute}/login`)
  }, [apiRoute, userSlug, logOut, adminRoute])

  const extendSession = useCallback(async () => {
    resetTimer()
    try {
      await fetch(`${apiRoute}/${userSlug}/refresh-token`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      /* keep-warm is best-effort; the UX timer is already reset */
    }
  }, [resetTimer, apiRoute, userSlug])

  // Activity tracking + the 1s tick. Only runs for an authenticated session.
  useEffect(() => {
    if (!user) {
      return
    }
    // Stamp start + clear warning via refs (not setState) so the effect body
    // doesn't trigger a synchronous re-render; `secondsLeft` already starts null.
    lastActivityRef.current = Date.now()
    warningActiveRef.current = false

    const onActivity = () => {
      // While the warning is up, require an explicit choice — ignore passive
      // activity so the countdown doesn't reset itself.
      if (!warningActiveRef.current) {
        lastActivityRef.current = Date.now()
      }
    }
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, onActivity, { passive: true })
    }

    const interval = window.setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      if (idle >= timeoutMs) {
        window.clearInterval(interval)
        void doLogout()
      } else if (idle >= timeoutMs - warningMs) {
        warningActiveRef.current = true
        setSecondsLeft(Math.ceil((timeoutMs - idle) / 1000))
      } else if (warningActiveRef.current) {
        warningActiveRef.current = false
        setSecondsLeft(null)
      }
    }, 1000)

    return () => {
      window.clearInterval(interval)
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, onActivity)
      }
    }
  }, [user, timeoutMs, warningMs, doLogout])

  // Move focus to the primary action when the dialog appears.
  useEffect(() => {
    if (secondsLeft !== null) {
      extendButtonRef.current?.focus()
    }
  }, [secondsLeft])

  if (!user || secondsLeft === null || typeof document === 'undefined') {
    return null
  }

  const overlay = (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="idle-logout-title"
      aria-describedby="idle-logout-desc"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '90%',
          background: 'var(--theme-elevation-0, #fff)',
          color: 'var(--theme-elevation-800, #18181b)',
          borderRadius: 8,
          padding: '24px 26px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h2 id="idle-logout-title" style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>
          Still there?
        </h2>
        <p id="idle-logout-desc" style={{ margin: '0 0 20px', lineHeight: 1.5 }}>
          You’ve been inactive for a while. For your security you’ll be signed out in{' '}
          <strong aria-live="assertive">{secondsLeft}</strong> second{secondsLeft === 1 ? '' : 's'}.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => void doLogout()}
            style={{
              padding: '9px 16px',
              borderRadius: 4,
              border: '1px solid var(--theme-elevation-150, #d4d4d8)',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Log out now
          </button>
          <button
            ref={extendButtonRef}
            type="button"
            onClick={() => void extendSession()}
            style={{
              padding: '9px 16px',
              borderRadius: 4,
              border: 'none',
              background: branding.colors.primary,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

export default IdleLogoutClient
