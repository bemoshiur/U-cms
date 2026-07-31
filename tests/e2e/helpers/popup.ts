import type { Page } from '@playwright/test'

/**
 * Closes every currently-visible site-wide popup (Task 4E `PopupLayer`), if
 * any. The demo site's seeded popup renders on EVERY page (by design — it
 * mirrors the legacy always-on-until-dismissed 팝업 behavior) and is a
 * fixed-position overlay that can sit on top of header/content elements other
 * specs click. Call this right after `page.goto(...)` in any spec that clicks
 * something near the top-left of the viewport, so the popup never causes a
 * flaky "element is obscured" actionability failure. A no-op when no popup is
 * live (most specs don't need to call this at all).
 */
export async function dismissPopups(page: Page): Promise<void> {
  const closeButtons = page.locator('.popup-window .popup-window__close')
  // Re-query the live count each iteration (rather than a fixed upfront
  // count): the popup only mounts client-side (`PopupLayer` reads
  // `localStorage` via `useSyncExternalStore`), so the FIRST click right
  // after `page.goto()` can race React hydration attaching the handler. A
  // bounded retry loop absorbs that without a fixed sleep.
  for (let attempt = 0; attempt < 10; attempt++) {
    const count = await closeButtons.count()
    if (count === 0) {
      return
    }
    await closeButtons
      .first()
      .click({ timeout: 5_000 })
      .catch(() => {
        // best-effort — the next iteration re-checks the count and retries
      })
  }
}
