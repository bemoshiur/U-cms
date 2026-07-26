import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { auditLogAccess, readOnly, rejectLogUpdate } from './logCollection'

/**
 * Legacy 로그인 이력 (Login History) — feature-inventory refs 3-5, 3-6, 3-7.
 * ONE append-only collection backs all three legacy screens; the "overseas
 * login attempt history" (3-5), "mobile login history" (3-5 sibling), and
 * "login failure history" (3-6) are NOT separate tables — they are just
 * pre-filtered views of this one collection:
 *
 *  - Overseas view  → `where[isOverseas][equals]=true`
 *  - Mobile view    → `where[isMobile][equals]=true`
 *  - Failure view   → `where[success][equals]=false`
 *
 * In the admin these are the collection's list view with a saved filter (or a
 * bookmarked `?where=...` URL); no custom collections needed. See
 * task-2A-report.md for the exact query params.
 *
 * Populated by the auth hooks (`recordLoginSuccessAudit` on `afterLogin`,
 * `recordLoginFailure` on `afterError`). `isOverseas` comes from the pluggable
 * `geoLookup` seam (default domestic) and `isMobile` from UA parsing.
 *
 * Immutable and gated on `privacy.loginHistory` (see `logCollection.ts`).
 */
export const LoginHistory: CollectionConfig = {
  slug: 'loginHistory',
  admin: {
    group: 'Privacy Protection System',
    useAsTitle: 'loginId',
    defaultColumns: [
      'createdAt',
      'userLabel',
      'loginId',
      'success',
      'ipAddress',
      'isOverseas',
      'isMobile',
    ],
    hidden: ({ user }) => !hasMenuAccessSync(user, 'privacy.loginHistory'),
  },
  defaultSort: '-createdAt',
  access: auditLogAccess('privacy.loginHistory'),
  hooks: {
    beforeChange: [rejectLogUpdate],
  },
  fields: [
    readOnly({
      name: 'userLabel',
      type: 'text',
      admin: {
        description: 'The user display name (legacy 이름). Masked in the list view.',
        // Display-only PII masking (real value stored).
        components: {
          Cell: '/components/audit/MaskedCell#MaskedCell',
        },
      },
    }),
    readOnly({
      name: 'loginId',
      type: 'text',
      admin: {
        description:
          'The attempted/real login identifier (legacy 아이디). Masked in the list view.',
        components: {
          Cell: '/components/audit/MaskedCell#MaskedCell',
        },
      },
    }),
    readOnly({
      name: 'success',
      type: 'checkbox',
      index: true,
      admin: {
        description:
          'Whether the login succeeded (legacy 로그인 성공여부). Failure view filters on false.',
      },
    }),
    readOnly({
      name: 'failReason',
      type: 'text',
      admin: {
        description: 'Reason a failed login was rejected, if known.',
      },
    }),
    readOnly({
      name: 'ipAddress',
      type: 'text',
      admin: {
        description: 'Raw client IP (IPv4/IPv6), captured as-is.',
      },
    }),
    readOnly({
      name: 'isOverseas',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        description:
          'Geo-IP overseas flag (legacy 해외여부). Default domestic until a GeoIP provider is wired.',
      },
    }),
    readOnly({
      name: 'isMobile',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        description: 'Mobile-device flag (legacy 모바일여부), from User-Agent parsing.',
      },
    }),
    readOnly({
      name: 'userAgent',
      type: 'text',
    }),
  ],
}
