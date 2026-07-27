import type { Access, FieldAccess, Payload, PayloadRequest } from 'payload'

import { toRelationId } from '../collections/utils'
import { isTwoFactorEnrolmentConfined } from './twoFactorConfinement'

/**
 * Menu-based access control (Task 1C; plan §2.2; feature-inventory refs
 * 1-10..1-13). Legacy roles (`ROLE_*`) each hold a set of admin-menu grants
 * (`roles.menuGrants` → `adminMenus`); a user's effective permission is the
 * union of every held role's grants, or unconditional if any held role has
 * `isSuper`. `adminMenus.menuKey` (e.g. `"system.sites"`) is the permanent,
 * stable permission key every gated collection checks against — see the
 * doc comment on that field in `src/collections/AdminMenus.ts`.
 *
 * ## Design decision: one shared predicate, two entry points
 *
 * Every collection's `access` config needs an *authoritative* check —
 * correctness matters more than latency, and `Access` functions may return
 * `Promise<boolean>` (see `node_modules/payload/dist/config/types.d.ts`
 * `Access<TData>`), so `hasMenuAccess()` below is async and always
 * resolves against the live database.
 *
 * `admin.hidden` (used to hide gated collections from the nav sidebar) is
 * different: its type is `(args: { user }) => boolean` — **not**
 * `Promise<boolean>` — and the one real caller,
 * `@payloadcms/ui/dist/utilities/getVisibleEntities.js`'s `isHidden()`,
 * calls it with no `await`. Returning a `Promise` there is a real bug, not
 * just a type mismatch: a `Promise` object is truthy, so
 * `!isHidden(...)` always evaluates to `false` and the item is *never*
 * hidden, for anyone. So a second, genuinely synchronous entry point
 * (`hasMenuAccessSync`) exists purely for `admin.hidden`.
 *
 * ## Why sync is possible at all: reading `req.user`, not decoding the JWT
 *
 * The brief's suggested design was "put role grants in the JWT via
 * `saveToJWT` and read them back synchronously." Reading
 * `node_modules/payload/dist/auth/strategies/jwt.js` shows that's not how
 * `req.user` is actually built: the JWT strategy decodes only `{ id,
 * collection, sid }` from the token and then does a **live**
 * `payload.findByID({ id, collection, depth: collectionConfig.auth.depth })`
 * on every single request — `saveToJWT` only controls what's exposed on the
 * *client-side* `ClientUser` (e.g. via `/api/users/me`), it has no bearing
 * on the server-side `req.user` object that `access` functions and
 * `admin.hidden` actually receive.
 *
 * That live re-fetch is what `hasMenuAccessSync` leans on instead:
 * `users.auth.depth` is set to `1` (see `src/collections/Users.ts`), so on
 * every real HTTP admin request `req.user.roles` arrives as fully populated
 * `Role` docs (with `isSuper` and `menuGrants` as raw `adminMenus` IDs —
 * depth 1 populates the role docs themselves; their own relationships stay
 * as IDs, which is all the sync check needs once it has looked up the
 * target menu's ID once — see the module-level cache below). Because
 * `req.user` is refetched fresh every request (not decoded from a
 * potentially-stale token), **role/menu-grant changes take effect on the
 * very next request, not "next login"** as the brief's literal wording
 * assumed — a strictly better outcome, verified by reading the strategy
 * source rather than trusted by default.
 *
 * `saveToJWT: true` is still set on `users.roles` (see Users.ts) — harmless,
 * and gives any future client-side component cheap access to the current
 * role IDs — but it is *not* the mechanism that makes access control work.
 *
 * ## The `adminMenus` menuKey→id cache
 *
 * `hasMenuAccessSync` cannot hit the database, so resolving a `menuKey`
 * string (e.g. `"system.sites"`) to the `adminMenus` document ID it needs
 * to compare against `role.menuGrants` requires an in-memory cache, warmed
 * once via `warmAdminMenuKeyCache()` in `payload.config.ts`'s `onInit`
 * (which fully resolves — `getPayload()` doesn't hand back a usable
 * instance until `onInit` completes — before any request can be served, so
 * there is no cold-cache race in practice). `menuKey` is documented as a
 * *permanent* identifier (see AdminMenus.ts), so the only realistic way the
 * cache could go stale is a brand-new `adminMenus` doc created after boot;
 * `hasMenuAccess` (the async, authoritative path) always resolves menu IDs
 * itself and self-heals the cache on every miss, so real access-control
 * decisions are never affected by cache staleness — only the nav-hiding
 * cosmetics could lag until the next server restart or next cache-filling
 * async call, and even that gap is bridged automatically the moment any
 * `hasMenuAccess()` call resolves that same menuKey.
 *
 * Crucially, `isSuper` bypasses the cache entirely (checked first, before
 * any menuKey lookup) — the seeded super-admin's nav is never at the mercy
 * of cache state, which matters for lockout safety.
 */

type RoleLike = {
  isSuper?: boolean | null
  menuGrants?: unknown
}

/** menuKey (e.g. "system.sites") -> adminMenus document ID. */
const menuKeyToAdminMenuId = new Map<string, string | number>()

/**
 * Warms the menuKey→id cache from the database. Called once from
 * `payload.config.ts`'s `onInit` so the cache is guaranteed warm before any
 * request is served (see the module doc comment above). Idempotent/safe to
 * call again (e.g. from tests) — simply replaces the cache contents.
 */
export async function warmAdminMenuKeyCache(payload: Payload): Promise<void> {
  const menus = await payload.find({
    collection: 'adminMenus',
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  menuKeyToAdminMenuId.clear()
  for (const menu of menus.docs) {
    menuKeyToAdminMenuId.set(menu.menuKey, menu.id)
  }
}

/** Test-only: clears the cache so tests can exercise cold-cache behavior. */
export function __resetAdminMenuKeyCacheForTests(): void {
  menuKeyToAdminMenuId.clear()
}

/**
 * Test-only: seeds the cache directly, without a DB round trip — lets unit
 * tests exercise `hasMenuAccessSync` (the exact function `admin.hidden`
 * calls in production) end-to-end without booting Payload.
 */
export function __setAdminMenuKeyCacheForTests(
  menuKey: string,
  adminMenuId: number | string,
): void {
  menuKeyToAdminMenuId.set(menuKey, adminMenuId)
}

/**
 * Resolves a menuKey to its `adminMenus` document ID, cache-first, falling
 * back to (and back-filling from) a live lookup on a miss. Used only by the
 * async/authoritative path — the sync path only ever reads the cache.
 */
async function resolveAdminMenuId(
  payload: Payload,
  menuKey: string,
): Promise<string | number | undefined> {
  const cached = menuKeyToAdminMenuId.get(menuKey)
  if (cached !== undefined) {
    return cached
  }

  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  const doc = found.docs[0]
  if (!doc) {
    return undefined
  }

  menuKeyToAdminMenuId.set(menuKey, doc.id)
  return doc.id
}

function isPopulatedRole(value: unknown): value is RoleLike {
  return typeof value === 'object' && value !== null && 'isSuper' in value
}

function extractRoles(user: unknown): unknown[] {
  if (!user || typeof user !== 'object') {
    return []
  }
  const roles = (user as { roles?: unknown }).roles
  return Array.isArray(roles) ? roles : []
}

function anySuper(roles: RoleLike[]): boolean {
  return roles.some((role) => role.isSuper === true)
}

function grantsMenu(roles: RoleLike[], targetMenuId: string | number | undefined): boolean {
  if (targetMenuId === undefined) {
    return false
  }
  return roles.some((role) => {
    const grants = Array.isArray(role.menuGrants) ? role.menuGrants : []
    return grants.some((grant) => toRelationId(grant) === targetMenuId)
  })
}

/**
 * Authoritative, async grant check — the single source of truth backing
 * every gated collection's `access` config (see `menuAccess`/
 * `menuAccessConfig` below). Always correct regardless of how deeply
 * `req.user.roles` happens to be populated (handles bare role IDs by
 * resolving them itself), which matters for Local API callers that pass a
 * shallow `user` object directly (not every caller goes through the JWT
 * strategy's `auth.depth`-driven population).
 *
 * Rules (per the brief): no user → false; any held role with `isSuper` →
 * true; else true iff any held role's `menuGrants` includes the
 * `adminMenus` doc with the given `menuKey`.
 */
export async function hasMenuAccess(req: PayloadRequest, menuKey: string): Promise<boolean> {
  const user = req.user
  if (!user) {
    return false
  }

  // Task 7D (P1): server-side 2FA-enrolment confinement. An un-enrolled `users`
  // principal under a 2FA-required back-office is denied every menu-gated
  // operation until it confirms a TOTP — the single chokepoint that closes the
  // direct-API bypass for the (many) collections gated through here. The 2FA
  // enrolment endpoints use `overrideAccess:true`, so they bypass this and keep
  // working; `users` self-access (selfOrMenuAccess's self-branch) never reaches
  // here. See src/access/twoFactorConfinement.ts.
  if (await isTwoFactorEnrolmentConfined(req)) {
    return false
  }

  const rawRoles = extractRoles(user)
  const populatedRoles = rawRoles.filter(isPopulatedRole)
  const unresolvedIds = rawRoles
    .filter((role) => !isPopulatedRole(role))
    .map(toRelationId)
    .filter((id): id is string | number => id !== undefined)

  let roles: RoleLike[] = populatedRoles

  if (unresolvedIds.length > 0) {
    const fetched = await req.payload.find({
      collection: 'roles',
      where: { id: { in: unresolvedIds } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    roles = [...roles, ...fetched.docs]
  }

  if (anySuper(roles)) {
    return true
  }

  const targetMenuId = await resolveAdminMenuId(req.payload, menuKey)
  return grantsMenu(roles, targetMenuId)
}

/**
 * True iff the user holds any `isSuper` role. Synchronous — relies on the
 * same populated-`req.user.roles` guarantee (`users.auth.depth = 1`) that
 * `hasMenuAccessSync` documents above. The single source of truth for "is
 * this a super-admin" across the app, reused by the tenant-access layer
 * (`src/access/tenantAccess.ts`) so super-admins bypass tenant scoping the
 * same way they bypass menu grants.
 */
export function isSuperUser(user: unknown): boolean {
  return anySuper(extractRoles(user).filter(isPopulatedRole))
}

/**
 * Synchronous, nav-visibility-only variant — see the module doc comment for
 * why this must exist and why it's safe. Not itself a security boundary:
 * a false negative here (e.g. an unresolvable role or a still-cold cache)
 * only hides a nav item unnecessarily, it never grants anything —
 * `hasMenuAccess()` above remains the sole authority behind every actual
 * create/read/update/delete decision, and `isSuper` bypasses this entirely
 * before the cache is even consulted.
 */
export function hasMenuAccessSync(user: unknown, menuKey: string): boolean {
  const roles = extractRoles(user).filter(isPopulatedRole)

  if (anySuper(roles)) {
    return true
  }

  const targetMenuId = menuKeyToAdminMenuId.get(menuKey)
  return grantsMenu(roles, targetMenuId)
}

/** A Payload `Access` function gated on a single menuKey (used for all four CRUD ops uniformly — this RBAC model doesn't distinguish read vs write per legacy ref 1-13). */
export function menuAccess(menuKey: string): Access {
  return async ({ req }) => hasMenuAccess(req, menuKey)
}

/**
 * Convenience: the same `menuAccess(menuKey)` function applied to all four
 * CRUD access keys, for collections with no row-level or self-access
 * carve-outs (i.e. everything except `users` — see
 * `src/collections/Users.ts` for the self-access override).
 */
export function menuAccessConfig(menuKey: string): {
  create: Access
  delete: Access
  read: Access
  update: Access
} {
  const access = menuAccess(menuKey)
  return { create: access, read: access, update: access, delete: access }
}

/**
 * Field-level counterpart to `menuAccess`, same underlying `hasMenuAccess`
 * predicate — needed because a collection's document-level `access.update`
 * (e.g. `users`' self-access override) only gates whether an update to the
 * document is allowed **at all**, not which individual fields within it may
 * be changed. Payload only enforces a field's own write access when
 * `field.access[operation]` is actually defined (confirmed by reading
 * `node_modules/payload/dist/fields/hooks/beforeValidate/promise.js`:
 * `if (field.access && field.access[operation]) { ... } ` — with no
 * field-level `access`, a field is writable by anyone who can write *any*
 * part of the document). `overrideAccess: true` (e.g. `registerFirstUser`)
 * bypasses field-level checks the same way it bypasses collection-level
 * ones, so first-user onboarding is unaffected.
 *
 * `FieldAccess` (unlike `Access`) can only return `boolean`, not `Where` —
 * `hasMenuAccess` never returns anything but a boolean anyway, so this is a
 * pure signature adapter, not new logic.
 */
export function menuFieldAccess(menuKey: string): FieldAccess {
  return async ({ req }) => hasMenuAccess(req, menuKey)
}
