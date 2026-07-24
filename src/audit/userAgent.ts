/**
 * Mobile-device classification from the User-Agent string (Task 2A Part 3;
 * feature-inventory ref 3-5 모바일여부 / "Mobile Y/N"). The legacy Privacy
 * system flags each login as mobile or not; the "mobile login history" screen
 * is a filtered view of `loginHistory` on this flag.
 *
 * A simple, dependency-free UA regex (documented as a deliberate
 * approximation — a full UA-parsing library is overkill for a boolean flag and
 * would add a dependency). Covers the common mobile tokens; unknown/empty UAs
 * default to non-mobile.
 */
const MOBILE_UA = /Mobi|Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini|IEMobile/i

export function isMobileUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) {
    return false
  }
  return MOBILE_UA.test(userAgent)
}
