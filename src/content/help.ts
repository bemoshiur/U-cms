/**
 * Pure site-help resolution (Task 3D Part 4; ref 1-80). No Payload runtime
 * dependency, so the precedence rule is unit-tested in isolation. Backs the ⓘ
 * help button: given the current screen context (`url` + optional `menuNumber`)
 * and the full set of help entries, `resolveHelp` picks the single entry to
 * show, honoring the legacy precedence.
 */

/** A help entry's binding, as stored on the `helpEntries` collection. */
export type HelpBinding = {
  /** How the entry is matched to a screen: by a menu number, or by a URL pattern. */
  bindType?: 'service' | 'menu' | null
  /** URL pattern (when `bindType === 'service'`); `*` is a wildcard. */
  urlPattern?: string | null
  /** Menu number (when `bindType === 'menu'`) — matched against the current menu's number. */
  menuNumber?: number | null
}

/** The current screen context help is being resolved for. */
export type HelpContext = {
  /** The screen URL (matched against a service entry's `urlPattern`). */
  url?: string | null
  /** The current menu's `menuNumber` (matched against a menu entry's `menuNumber`). */
  menuNumber?: number | null
}

/** Escapes a string for literal use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Whether `url` matches a service entry's `urlPattern`. A pattern containing
 * `*` is treated as a wildcard glob (each `*` → `.*`, anchored to the whole
 * string); a pattern with no `*` must match the URL exactly. Empty/absent
 * pattern never matches. Pure + tested.
 */
export function matchesUrlPattern(pattern: string | null | undefined, url: string): boolean {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return false
  }
  if (pattern.includes('*')) {
    const source = `^${pattern.split('*').map(escapeRegExp).join('.*')}$`
    try {
      return new RegExp(source).test(url)
    } catch {
      return false
    }
  }
  return url === pattern
}

/**
 * Resolves which help entry to show for a screen (ref 1-80 precedence).
 *
 * Precedence — **menu binding wins**: if the screen has a `menuNumber` and any
 * entry is menu-bound to that exact number, that entry is returned (even when a
 * URL-pattern entry would also match). Otherwise the first service entry whose
 * `urlPattern` matches the screen `url` is returned. If nothing matches,
 * `undefined`.
 *
 * Generic over the entry type so callers keep their full `HelpEntry` doc (with
 * its `content`) — this only reads the binding fields.
 */
export function resolveHelp<T extends HelpBinding>(
  entries: readonly T[],
  context: HelpContext,
): T | undefined {
  if (context.menuNumber !== null && context.menuNumber !== undefined) {
    const menuMatch = entries.find(
      (entry) =>
        entry.bindType === 'menu' &&
        entry.menuNumber !== null &&
        entry.menuNumber !== undefined &&
        entry.menuNumber === context.menuNumber,
    )
    if (menuMatch) {
      return menuMatch
    }
  }

  if (typeof context.url === 'string' && context.url.length > 0) {
    const url = context.url
    return entries.find(
      (entry) => entry.bindType === 'service' && matchesUrlPattern(entry.urlPattern, url),
    )
  }

  return undefined
}
