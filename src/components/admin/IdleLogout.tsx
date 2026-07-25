import React from 'react'

import { IdleLogoutClient } from './IdleLogoutClient'

/**
 * Idle auto-logout (Task 2C Part 3; feature-inventory refs 1-7 callout 10 /
 * 1-9). Registered as an `admin.components.actions` entry so it mounts once,
 * globally, on every authenticated admin view (actions render inside the
 * app shell, i.e. inside Payload's auth/config context — exactly what the
 * client watcher's `useAuth`/`useConfig` need — and NOT on the login view, so
 * the watcher only ever runs for a signed-in session).
 *
 * This thin server component exists solely to read the SERVER env
 * `ADMIN_IDLE_TIMEOUT_MIN` (a plain, non-`NEXT_PUBLIC_` var, per the brief) and
 * hand it to the client watcher as a prop. Default 30 minutes.
 *
 * The hard server-side session lifetime is SEPARATE from this UX layer — it is
 * Payload's own JWT/token expiry (`users.auth`); this component adds an
 * activity-based idle timeout on top and performs a real logout on expiry.
 */

const DEFAULT_IDLE_MINUTES = 30
const MAX_WARNING_SECONDS = 60

export function IdleLogout(): React.ReactElement {
  const raw = process.env.ADMIN_IDLE_TIMEOUT_MIN
  const parsed = raw !== undefined && raw.trim() !== '' ? Number(raw) : NaN
  const timeoutMinutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_IDLE_MINUTES

  // Warn during the final stretch: 20% of the window, capped at 60s, floored at
  // 5s — so a short (test) timeout still shows a usable countdown.
  const warningSeconds = Math.min(
    MAX_WARNING_SECONDS,
    Math.max(5, Math.floor(timeoutMinutes * 60 * 0.2)),
  )

  return <IdleLogoutClient timeoutMinutes={timeoutMinutes} warningSeconds={warningSeconds} />
}

export default IdleLogout
