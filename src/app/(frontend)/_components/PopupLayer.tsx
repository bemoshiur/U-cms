'use client'

import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

import type { ResolvedLink } from '@/site/nav'
import { NavLink } from './NavLink'

/**
 * Plain-data shape the SERVER (`layout.tsx`) maps live `popups` docs to before
 * passing them across the server/client boundary — only what rendering needs,
 * already tenant-scoped / live-filtered / link-validated upstream.
 */
export type PopupItem = {
  id: number | string
  title: string
  imageUrl: string
  imageAlt: string
  link: ResolvedLink
  width: number
  height: number
  top: number
  left: number
  showScrollbar: boolean
  closeForDay: boolean
}

const DISMISS_KEY_PREFIX = 'ucms-popup-dismissed-'
/** "Close for a day" (하루닫기) suppression window. */
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000
/**
 * Per-popup cascade so simultaneous popups don't visually overlap. Larger
 * than the collection's default stored geometry (`Popups.ts`'s
 * `geometryField` defaults width/height to 400/300px, top/left to 100px), so
 * two popups left at their defaults — the common case, since most operators
 * never reposition a popup expecting only one to show at a time — land in
 * genuinely disjoint screen regions. A small offset (e.g. 28px) is not enough
 * to prevent overlap between two ~400x300 boxes started at nearly the same
 * position, which previously let one popup's image intercept clicks meant for
 * another popup's close button underneath.
 */
const CASCADE_OFFSET_PX = 440

/**
 * Ids closed THIS SESSION (button click without necessarily persisting a
 * day-long suppression) — module-level so it survives this component
 * re-rendering, matching the legacy "closed until you reload/revisit" popup
 * behavior for a close that isn't "for a day". Cleared on a real page load.
 */
const sessionClosed = new Set<string>()

/** Tiny external-store pub/sub: `close()` notifies, `useSyncExternalStore` re-reads. */
const listeners = new Set<() => void>()
function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function dismissKey(id: string): string {
  return `${DISMISS_KEY_PREFIX}${id}`
}

/** The epoch ms a popup's suppression expires, or `0` (never dismissed / unreadable storage). */
function readDismissedUntil(id: string): number {
  try {
    const raw = window.localStorage.getItem(dismissKey(id))
    const until = raw ? Number(raw) : NaN
    return Number.isFinite(until) ? until : 0
  } catch {
    return 0
  }
}

function writeDismissedUntil(id: string, untilMs: number): void {
  try {
    window.localStorage.setItem(dismissKey(id), String(untilMs))
  } catch {
    // best-effort (private mode / quota) — the popup just reappears next load.
  }
}

/** Closes a popup: always suppresses for the rest of this session; persists a 24h suppression too when `closeForDay`. */
function close(popup: PopupItem): void {
  const id = String(popup.id)
  sessionClosed.add(id)
  if (popup.closeForDay) {
    writeDismissedUntil(id, Date.now() + DISMISS_TTL_MS)
  }
  notify()
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/**
 * Site-wide popup layer (Task 4E; refs 1-47/1-48, 2-1). Mounted once in the
 * root layout (alongside `TrafficBeacon`) so popups appear on every page load
 * until dismissed, matching the legacy 팝업 behavior. The SERVER has already
 * resolved the LIVE popups for the active site (`getActivePopups`) and mapped
 * them to `PopupItem[]`; this CLIENT component's only job is the per-browser
 * "close for a day" (`closeForDay`) UI state — everything else is
 * presentational (mirrors the `TrafficBeacon`/`SatisfactionWidget` server ↔
 * client split already established in this codebase).
 *
 * Dismiss mechanism: `localStorage`, keyed per popup id, storing the epoch ms
 * the suppression EXPIRES (not a boolean flag) so the 24h TTL is exact and
 * self-expiring without a cleanup step. Chosen over a cookie because this is
 * pure client-side UI state the server never needs to read back — nothing
 * about it belongs in a request header, so there is no reason to grow the
 * `Cookie` sent with every request for it.
 *
 * The visible set is read via `useSyncExternalStore` rather than
 * `useState`/`useEffect` — the sanctioned way to read external, time-dependent
 * state (localStorage + wall-clock) during render: `getServerSnapshot` returns
 * "show everything" (nothing can be known dismissed on the server, and that
 * matches the legacy no-JS behavior), and the client re-syncs to the real
 * suppressed set right after hydration, with no `setState`-in-`useEffect`
 * anti-pattern and no render-phase `Date.now()` call. Multiple simultaneous
 * popups cascade by a fixed per-index offset (`CASCADE_OFFSET_PX`) so
 * overlapping stored geometries stay legible. Escape closes the topmost
 * (last-rendered) popup; closing is also reachable via a focusable button —
 * no keyboard trap.
 */
export function PopupLayer({ popups }: { popups: PopupItem[] }) {
  const ids = useMemo(() => popups.map((popup) => String(popup.id)), [popups])
  const cacheRef = useRef<{ ids: readonly string[]; result: readonly string[] } | null>(null)

  const getSnapshot = useCallback((): readonly string[] => {
    const now = Date.now()
    const next = ids.filter((id) => !sessionClosed.has(id) && now >= readDismissedUntil(id))
    const cached = cacheRef.current
    if (cached && sameIds(cached.ids, ids) && sameIds(cached.result, next)) {
      return cached.result
    }
    cacheRef.current = { ids, result: next }
    return next
  }, [ids])

  const getServerSnapshot = useCallback((): readonly string[] => ids, [ids])

  const visibleIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const visible = popups.filter((popup) => visibleIds.includes(String(popup.id)))

  useEffect(() => {
    if (visible.length === 0) {
      return
    }
    const topmost = visible[visible.length - 1]
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && topmost) {
        close(topmost)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible])

  if (visible.length === 0) {
    return null
  }

  return (
    <div className="popup-layer">
      {visible.map((popup, index) => {
        // The FIRST popup keeps its admin-configured position (the common,
        // legacy-matching single-popup case). Every subsequent popup cascades
        // by a fixed, generously-sized offset (see CASCADE_OFFSET_PX) so it
        // lands clear of the popups before it.
        const style: React.CSSProperties = {
          top: popup.top + index * CASCADE_OFFSET_PX,
          left: popup.left + index * CASCADE_OFFSET_PX,
          width: popup.width,
          height: popup.height,
          zIndex: 1000 + index,
          overflow: popup.showScrollbar ? 'auto' : 'hidden',
        }
        const image = (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin CMS asset
          <img className="popup-window__img" src={popup.imageUrl} alt={popup.imageAlt} />
        )
        return (
          <div
            key={popup.id}
            className="popup-window"
            style={style}
            role="region"
            aria-label={popup.title}
          >
            <div className="popup-window__body">
              {popup.link.kind === 'link' ? (
                <NavLink link={popup.link} className="popup-window__link">
                  {image}
                </NavLink>
              ) : (
                image
              )}
            </div>
            <div className="popup-window__footer">
              <button
                type="button"
                className="popup-window__close"
                onClick={() => close(popup)}
                aria-label={`Close ${popup.title} popup`}
              >
                Close
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
