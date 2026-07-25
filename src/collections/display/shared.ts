import type { Field, TextFieldSingleValidation } from 'payload'

import { isHttpUrl, isSafeInternalLink } from '../../content/display'

/**
 * Shared field-set for the per-site display collections (Task 3C:
 * notification areas, popups, banners). Per the brief these share an image, a
 * title, an exposure window (start/end with hour precision), a use/active
 * toggle, a 4-way display order, and an internal-or-external link — so the
 * common shape lives here (DRY) while each collection stays its own table with
 * its own extra fields (geometry, representative flag, …). The pure `isLive` /
 * `reorder` / `isHttpUrl` helpers live in `src/content/display.ts`.
 */

/** internal (picker) vs external (absolute http URL) link, shared by every link field-set. */
export const DISPLAY_LINK_TYPES = ['internal', 'external'] as const

/**
 * Validator for a shared `linkExternal` field: when the sibling `linkType` is
 * `external`, the value is required and must be an absolute http(s) URL (ref
 * 1-46/1-52/1-53). A custom `validate` REPLACES Payload's default, so the
 * not-required (internal) case is handled explicitly — see the identical note
 * on `validateAllowedExtensions` in `Boards.ts`.
 */
export const validateExternalLink: TextFieldSingleValidation = (value, options) => {
  const linkType = (options?.siblingData as { linkType?: unknown } | undefined)?.linkType
  if (linkType !== 'external') {
    return true
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return 'An external link URL is required when the link type is External.'
  }
  if (!isHttpUrl(value)) {
    return 'External links must be an absolute URL starting with http:// or https://.'
  }
  return true
}

/**
 * Validator for a shared `linkInternal` field: when the sibling `linkType` is
 * `internal`, a NON-EMPTY value must be a genuine site-relative internal link
 * (`/path` or `?menuSn=…`) — see `isSafeInternalLink`. Empty is allowed (a
 * display item need not carry a link). This closes the stored-XSS /
 * open-redirect hole where a tenant-scoped editor could store `javascript:…`,
 * `data:…`, `//evil.com`, or an off-site URL under the "internal" label (Phase
 * 4 renders it as a clickable href). A custom `validate` REPLACES Payload's
 * default, so the empty/other-linkType cases are handled explicitly here.
 */
export const validateInternalLink: TextFieldSingleValidation = (value, options) => {
  const linkType = (options?.siblingData as { linkType?: unknown } | undefined)?.linkType
  if (linkType !== 'internal') {
    return true
  }
  if (value === undefined || value === null || value === '') {
    return true
  }
  if (!isSafeInternalLink(value)) {
    return 'Internal links must be a site-relative path starting with "/" (e.g. /bos/home) or a "?menuSn=…" reference — no external URLs, schemes, or protocol-relative values.'
  }
  return true
}

/** Single web image → media (ref 1-46/1-48/1-52: jpg/jpeg/png/gif, max 1). */
export function imageField(recommendedSize: string, required = true): Field {
  return {
    name: 'image',
    type: 'upload',
    relationTo: 'media',
    required,
    admin: {
      description: `Display image (uploads to Media). Recommended size ${recommendedSize} px; allowed types jpg/jpeg/png/gif (legacy note).`,
    },
  }
}

/** Required display title (제목), used as the collection's `useAsTitle`. */
export function titleField(): Field {
  return { name: 'title', type: 'text', required: true }
}

/**
 * Use/active toggle (사용여부, default 사용). An inactive item stays in the
 * admin list but never renders (`isLive` returns false). The legacy inline
 * list toggle is a Phase-4 UI concern — the field itself is a plain checkbox.
 */
export function activeField(): Field {
  return {
    name: 'active',
    type: 'checkbox',
    defaultValue: true,
    admin: {
      description:
        'Use/expose toggle (사용여부). Inactive items remain in the admin list but never render. Inline list toggling is a Phase-4 UI concern.',
    },
  }
}

/**
 * Exposure order (노출순서). Lower renders first. The 4-way (top/up/down/bottom)
 * drag/button UI is deferred to Phase 4 — see `reorder` in content/display.ts
 * for the underlying data move.
 */
export function displayOrderField(): Field {
  return {
    name: 'displayOrder',
    type: 'number',
    defaultValue: 0,
    admin: {
      description:
        'Exposure order (노출순서) — lower shows first. The 4-way drag UI is deferred to Phase 4.',
    },
  }
}

/**
 * Exposure window (노출기간) with hour precision (ref 1-46/1-48/1-52). Stored as
 * full timestamps; the `dayAndTime` picker gives the legacy date + hour UI.
 * Empty bounds mean "no lower / no upper bound" (see `isLive`).
 */
export function exposureWindowFields(): Field[] {
  return [
    {
      name: 'exposeFrom',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' },
        description: 'Exposure start (hour precision). Empty = no lower bound.',
      },
    },
    {
      name: 'exposeTo',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' },
        description:
          'Exposure end (hour precision). Empty = no upper bound. Outside the window the item is not live.',
      },
    },
  ]
}

/**
 * Internal-or-external link field-set (ref 1-46/1-52). `linkInternal` stores a
 * path for now (the menu/program picker popup is a Phase-4 UI concern);
 * `linkExternal` must be an absolute http(s) URL. `includeNewWindow` adds the
 * link-mode toggle (링크 방식: 새창 vs 현재창) — notification areas & banners have
 * it; popups (which open in their own geometry-controlled window) do not.
 */
export function linkFields(options: { includeNewWindow?: boolean } = {}): Field[] {
  const fields: Field[] = [
    {
      name: 'linkType',
      type: 'select',
      defaultValue: 'internal',
      options: [
        { label: 'Internal (내부)', value: 'internal' },
        { label: 'External (외부)', value: 'external' },
      ],
    },
    {
      name: 'linkInternal',
      type: 'text',
      validate: validateInternalLink,
      admin: {
        condition: (_data, sibling) => sibling?.linkType === 'internal',
        description:
          'Internal site-relative link — a path like /bos/… or a ?menuSn=… reference (no external URLs or schemes). The menu/program picker popup is deferred to Phase 4 — a text path is stored for now.',
      },
    },
    {
      name: 'linkExternal',
      type: 'text',
      validate: validateExternalLink,
      admin: {
        condition: (_data, sibling) => sibling?.linkType === 'external',
        description: 'External URL — must start with http:// or https://.',
      },
    },
  ]
  if (options.includeNewWindow) {
    fields.push({
      name: 'newWindow',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Link mode (링크 방식): open in a new window (새창/Y) vs the current page (N).',
      },
    })
  }
  return fields
}
