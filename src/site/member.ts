/**
 * Public-site MEMBER seam (Task 4A → wired in Task 4B).
 *
 * The public site distinguishes logged-in members from anonymous visitors —
 * menus carry an `exposureCondition` (always | loggedInOnly | loggedOutOnly),
 * and the top guide bar will swap Login/Sign-up for member links once sessions
 * exist. Member auth (a separate identity from the admin `users` collection)
 * is Task 4B, so this is the single, documented place that answers "who is the
 * current visitor?".
 *
 * ## Current behavior — always anonymous
 *
 * {@link getCurrentMember} returns `null` (no member). Every visibility
 * decision therefore treats the visitor as logged-out: `always` + `loggedOutOnly`
 * menus show, `loggedInOnly` menus hide (see `isMenuVisible` in `./nav.ts`).
 *
 * ## What Task 4B changes (and what does NOT move)
 *
 * T4B replaces the body of {@link getCurrentMember} with a real member-session
 * lookup (cookie/JWT → member record). Nothing else changes: `buildNav`,
 * `resolveMenuLink`, and the header already take a `CurrentMember` and branch
 * on `member != null`, so wiring the session in one function lights up the
 * whole site.
 */

/**
 * The minimal shape the nav/visibility layer needs from a member. T4B widens
 * this to the real member record; today only "is there one?" matters, so a
 * bare id is enough and keeps the pure helpers decoupled from the eventual
 * member collection's schema.
 */
export type CurrentMember = {
  id: number | string
} | null

/**
 * Resolves the current public-site member, or `null` when anonymous. See the
 * module docblock: this is the T4B seam and currently always returns `null`.
 * Async so T4B can await a session/DB lookup without changing any caller.
 */
export async function getCurrentMember(): Promise<CurrentMember> {
  return null
}
