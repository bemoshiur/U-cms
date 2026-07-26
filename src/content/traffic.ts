/**
 * Public traffic-capture domain helpers (Task 4E; TODO 4.9, feeds Phase 5's
 * statistics — refs 2-17/2-20). Pure of any Payload/Node-crypto runtime so the
 * device-class + referrer rules are unit-testable and shared by the capture
 * seam and (Phase 5) the aggregation.
 *
 * ## Privacy posture (Phase-6-ready — NO PII in traffic logs)
 *
 * The rebuild's traffic log deliberately stores NO raw IP and NO full URLs with
 * query strings. It keeps only:
 *  - the request `path` (no query string — stripped by {@link normalizePath}),
 *  - a coarse `deviceType` (mobile | desktop) derived from the UA string,
 *  - the referrer HOST only (never the full referring URL — {@link referrerHost}),
 *  - a rotating, salted `sessionKey` HASH (computed in `src/site/traffic.ts`,
 *    never here) that cannot be reversed to an IP.
 * This satisfies the Phase-6 privacy subsystem's "no PII in traffic logs" rule
 * (unlike the legacy 사이트 접속 이력 in ref 2-20, which logged the raw IP).
 */

/**
 * Coarse device class from a User-Agent string (ref 2-17's PC/모바일 split).
 * A conservative substring match on the common mobile tokens; everything else
 * (incl. an empty/unknown UA) is `desktop`. Intentionally low-cardinality — no
 * OS/browser/version is derived or stored, so nothing here fingerprints a user.
 */
export function deviceTypeFromUserAgent(
  userAgent: string | null | undefined,
): 'mobile' | 'desktop' {
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    return 'desktop'
  }
  return /Mobi|Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(
    userAgent,
  )
    ? 'mobile'
    : 'desktop'
}

/**
 * The HOST of a referrer URL (e.g. `search.example.com`), or `null` when the
 * referrer is absent, same-origin-omitted, or unparseable. Deliberately DROPS
 * the referrer's path + query so a visitor's prior browsing detail is never
 * stored — only the coarse "came from which site" dimension survives.
 */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (typeof referrer !== 'string' || referrer.trim() === '') {
    return null
  }
  try {
    const host = new URL(referrer.trim()).host
    return host.length > 0 ? host.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * A path segment that carries a secret token collapses to this stable, tokenless
 * label so the raw token never lands in the (admin-readable, exportable)
 * `pageViews.path`. Currently only the member password-reset link
 * (`/reset-password/<token>`) is token-bearing; ADD any future token-in-path
 * route to {@link collapseTokenBearingPath}.
 */
export const RESET_PASSWORD_PATH_LABEL = '/reset-password/[token]'

/**
 * B2 (security): collapse a token-bearing auth path to a stable label. The
 * member password-reset link places a single-use, ~1h account-takeover token in
 * the URL path; captured verbatim it would persist a live credential into the
 * traffic log. `/reset-password/<anything>` (with or without trailing segments)
 * → `/reset-password/[token]`; a bare `/reset-password` is left untouched.
 */
function collapseTokenBearingPath(path: string): string {
  return path.replace(/^\/reset-password\/[^/]+.*$/i, RESET_PASSWORD_PATH_LABEL)
}

/**
 * Normalizes a captured path: keeps only the pathname portion (drops any query
 * string / fragment — those can carry identifiers), forces a single-slash root
 * (never a protocol-relative `//host` — see D8), collapses token-bearing auth
 * paths to a tokenless label (never store a reset-password token — see B2), and
 * caps the length. Accepts a full URL or a bare path.
 */
export function normalizePath(rawPath: string | null | undefined): string {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    return '/'
  }
  let path = rawPath.trim()
  // If a full URL was supplied, reduce to its pathname.
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname
    }
  } catch {
    // fall through and treat the raw value as a path
  }
  // Strip a query string / fragment from a bare path.
  const q = path.search(/[?#]/)
  if (q >= 0) {
    path = path.slice(0, q)
  }
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  // D8 (security): collapse an authority-introducing leading `//` or `/\`
  // (browsers normalize a backslash to a forward slash) down to a single `/`, so
  // the result can NEVER be a protocol-relative `//evil.com` value. This path is
  // reused as a `redirect()` target by `satisfactionActions.ts`, so a
  // protocol-relative leak here would be an open redirect.
  path = path.replace(/^[/\\]+/, '/')
  // B2 (security): never store a token-bearing auth path verbatim.
  path = collapseTokenBearingPath(path)
  // Guard against pathological lengths (defense in depth against a crafted body).
  return path.slice(0, 512)
}

/**
 * Extracts the per-site menu number from a `/page/{menuNumber}` public path, so
 * the capture can attach the owning `menu` relationship for the ref-2-17
 * per-menu traffic dimension. Returns `null` for any other path (board/post/etc.
 * are attributed by `path` only in this phase). Pure — the DB lookup happens in
 * the capture seam.
 */
export function menuNumberFromPath(path: string): number | null {
  const m = /^\/page\/(\d+)(?:\/|$)/.exec(path)
  if (!m) {
    return null
  }
  const n = Number(m[1])
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Coarse OS family from a User-Agent string (Task 5A — the ref-2-17 OS
 * statistics tab). Deliberately LOW-CARDINALITY: exactly one of a small fixed
 * set of families, and NEVER a version number. This is the privacy line — an OS
 * *family* ("Windows") is a coarse aggregate dimension shared by millions of
 * visitors and does not fingerprint anyone, whereas an OS *version*
 * ("Windows 10.0.19045") narrows the crowd and starts to identify. Order
 * matters: iOS/Android are checked before macOS/Linux because their UAs also
 * contain the desktop-kernel tokens ("like Mac OS X", "Linux; Android").
 */
export const OS_FAMILIES = ['windows', 'macos', 'ios', 'android', 'linux', 'other'] as const
export type OsFamily = (typeof OS_FAMILIES)[number]

export function osFamilyFromUserAgent(userAgent: string | null | undefined): OsFamily {
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    return 'other'
  }
  const ua = userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'ios'
  }
  if (/Android/i.test(ua)) {
    return 'android'
  }
  if (/Windows/i.test(ua)) {
    return 'windows'
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return 'macos'
  }
  if (/Linux|X11|CrOS/i.test(ua)) {
    return 'linux'
  }
  return 'other'
}

/**
 * Coarse browser family from a User-Agent string (Task 5A — the ref-2-17
 * browser statistics tab). Same privacy line as {@link osFamilyFromUserAgent}:
 * a browser *family* only, never a version. Order matters because browser UAs
 * are nested — Edge/Opera/Samsung UAs also contain the `Chrome` token, and
 * Chrome's UA contains `Safari`, so the more specific brands are matched first
 * and generic `Safari` (real Apple Safari) / `Chrome` last.
 */
export const BROWSER_FAMILIES = [
  'chrome',
  'safari',
  'firefox',
  'edge',
  'opera',
  'samsung',
  'ie',
  'other',
] as const
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number]

export function browserFamilyFromUserAgent(userAgent: string | null | undefined): BrowserFamily {
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    return 'other'
  }
  const ua = userAgent
  if (/Edg[eiA]?\//i.test(ua)) {
    return 'edge'
  }
  if (/OPR\/|Opera/i.test(ua)) {
    return 'opera'
  }
  if (/SamsungBrowser/i.test(ua)) {
    return 'samsung'
  }
  if (/Firefox\/|FxiOS/i.test(ua)) {
    return 'firefox'
  }
  if (/MSIE |Trident\//i.test(ua)) {
    return 'ie'
  }
  if (/Chrome\/|CriOS|Chromium/i.test(ua)) {
    return 'chrome'
  }
  if (/Safari\/|Version\/.*Safari/i.test(ua)) {
    return 'safari'
  }
  return 'other'
}

/**
 * The single bucket every UNKNOWN / attacker-chosen path collapses to (Task 5A
 * Part 0 — the carried Phase-4 review D6 hardening). Because the `/track` beacon
 * body is attacker-controlled, a distinct `path` string stored per request would
 * let an attacker mint UNBOUNDED fake pages and pollute the "top pages" stats
 * (and bloat the raw log). Capturing this single sentinel for anything that does
 * not resolve to a REAL site route keeps the stored path set bounded.
 */
export const OTHER_PATH_BUCKET = '__other__'

/**
 * The bounded set of EXACT static public routes (see the `(frontend)` route
 * tree). Anything not here, not a valid `/page/{n}`/`/board/{bbsId}`, and not an
 * id-collapsed template below, is bucketed to {@link OTHER_PATH_BUCKET}.
 */
const STATIC_PUBLIC_ROUTES = new Set<string>([
  '/',
  '/login',
  '/logout',
  '/signup',
  '/recover',
  '/profile',
  '/sitemap',
  '/survey',
  RESET_PASSWORD_PATH_LABEL,
])

/**
 * The classification of a captured (already-{@link normalizePath}d) path into a
 * BOUNDED canonical route (Task 5A Part 0 / D6). Discriminated so the capture
 * seam knows which cases still need a per-site DB existence check:
 *  - `known`  — a static route or an id-collapsed template; store `path` as-is.
 *  - `page`   — `/page/{menuNumber}`; the seam must confirm the menu EXISTS on
 *               the site (else → other), and attaches the `menu` relationship.
 *  - `board`  — `/board/{bbsId}` (post detail collapsed to its board); the seam
 *               must confirm the board EXISTS on the site (else → other).
 *  - `other`  — unknown/unmatched → {@link OTHER_PATH_BUCKET}.
 * Pure: the two existence checks happen in `src/site/traffic.ts`, not here.
 */
export type PathClassification =
  | { kind: 'known'; path: string }
  | { kind: 'page'; menuNumber: number; path: string }
  | { kind: 'board'; bbsId: string; path: string }
  | { kind: 'other' }

/** A board id shape (`B` + digits, e.g. `B0000001`) — see boards/defaults.ts. */
const BBS_ID_RE = /^B\d+$/

/**
 * Classifies a normalized path into its bounded canonical route (Task 5A Part 0
 * / D6). Dynamic id-bearing routes with UNBOUNDED ids are collapsed to a stable
 * template (`/survey/{id}` → `/survey/[id]`, `/terms/{cat}` → `/terms/[category]`,
 * `/s/{code}` → `/s/[code]`) so a distinct id can't inflate the page set;
 * `/page/{n}` and `/board/{bbsId}` are kept concrete but flagged for a per-site
 * existence check by the caller (a non-existent menu/board → `other`), which is
 * what actually bounds them to the site's real menus/boards. Everything else →
 * `other`. Pass an already-`normalizePath`d value.
 */
export function classifyPath(path: string): PathClassification {
  if (STATIC_PUBLIC_ROUTES.has(path)) {
    return { kind: 'known', path }
  }
  // Token-bearing reset path (normalizePath already collapses the token, but be
  // robust if a raw value slips through).
  if (/^\/reset-password(\/|$)/i.test(path)) {
    return { kind: 'known', path: RESET_PASSWORD_PATH_LABEL }
  }
  // Real per-site content page — keep concrete, needs a menu existence check.
  const menuNumber = menuNumberFromPath(path)
  if (menuNumber !== null) {
    return { kind: 'page', menuNumber, path: `/page/${menuNumber}` }
  }
  // Board list or post detail — collapse the (optional) post id to the board,
  // keep the board concrete, needs a board existence check.
  const board = /^\/board\/([^/]+)(?:\/|$)/.exec(path)
  if (board && board[1]) {
    const bbsId = decodeURIComponent(board[1])
    if (BBS_ID_RE.test(bbsId)) {
      return { kind: 'board', bbsId, path: `/board/${bbsId}` }
    }
    return { kind: 'other' }
  }
  // Id-collapsed templates (bounded to one bucket each regardless of the id).
  if (/^\/survey\/[^/]+/i.test(path)) {
    return { kind: 'known', path: '/survey/[id]' }
  }
  if (/^\/terms\/[^/]+/i.test(path)) {
    return { kind: 'known', path: '/terms/[category]' }
  }
  if (/^\/s\/[^/]+/i.test(path)) {
    return { kind: 'known', path: '/s/[code]' }
  }
  return { kind: 'other' }
}
