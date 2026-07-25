import type { CollectionConfig, Payload, TextFieldSingleValidation, Validate } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../access/hasMenuAccess'
import { auditCollection } from '../audit/auditCollection'
import { isValidRulePattern } from '../security/ipMatch'
import { IP_ACCESS_MENU_KEY } from '../security/adminIpEnforcement'

/**
 * Legacy 관리자 IP 접속 제한 (Admin IP Access Control) — feature-inventory refs
 * 1-20 / 1-21. The default-deny allowlist that guards which client IPs may
 * reach the admin back-office. Each row registers an applicant (name /
 * affiliation / phone / memo — the legacy request-and-approve metadata) against
 * an IP pattern, an allow|block type, and a validity window.
 *
 * The rules are *data*; the enforcement is the Next.js proxy (`src/proxy.ts`)
 * calling `evaluateAdminIpRequest`, which matches the client IP against the
 * active-in-window rules via the default-deny guard (`src/security/*`). Config
 * changes here are audited (afterChange/afterDelete → accessLogs); denials are
 * audited by the guard.
 */

/** Config-change audit hooks (Task 2A backbone) for this collection's mutations. */
const ipRulesAudit = auditCollection(IP_ACCESS_MENU_KEY)

/**
 * A custom `validate` REPLACES Payload's default required-checking validator
 * entirely (see `validateSiteId` in src/collections/Sites.ts), so `required` is
 * threaded through `options.required` and enforced by hand. Accepts exact IPv4,
 * exact IPv6, IPv4 trailing-wildcard octets, or a bare `*` (see `ipMatch.ts`).
 */
const validateIpAddress: TextFieldSingleValidation = (value, { required }) => {
  if (required && (typeof value !== 'string' || value.trim().length === 0)) {
    return 'IP address is required.'
  }
  if (typeof value === 'string' && value.trim().length > 0 && !isValidRulePattern(value.trim())) {
    return 'Enter an exact IPv4/IPv6 address, an IPv4 trailing wildcard (e.g. "192.168.0.*", "10.*"), or "*" for all IPs.'
  }
  return true
}

/**
 * `validTo` must be strictly after `validFrom` (ref 1-21 validity window). Also
 * enforces required by hand (custom validate replaces the default).
 *
 * Review fix (Low): `validFrom` is read from the incoming payload
 * (`siblingData`/`data`) when present, but a PATCH that sets ONLY `validTo`
 * carries no `validFrom` — so on an update the validator falls back to fetching
 * the persisted `validFrom`, keeping `validTo > validFrom` enforced even on a
 * `validTo`-only edit.
 */
const validateValidTo: Validate = async (value, options) => {
  const { data, siblingData, req, id, operation } = options as {
    data?: { validFrom?: unknown }
    siblingData?: { validFrom?: unknown }
    req?: { payload?: Payload }
    id?: number | string
    operation?: string
  }
  if (!value) {
    return 'Valid-to date is required.'
  }

  let from: unknown = siblingData?.validFrom ?? data?.validFrom
  if (from === undefined && operation === 'update' && id != null && req?.payload) {
    try {
      const existing = await req.payload.findByID({
        collection: 'adminIpRules',
        id,
        depth: 0,
        overrideAccess: true,
      })
      from = (existing as { validFrom?: unknown })?.validFrom
    } catch {
      /* best-effort — if the existing doc can't be read, skip the comparison */
    }
  }

  if (from) {
    const fromMs = new Date(from as string).getTime()
    const toMs = new Date(value as string).getTime()
    if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs <= fromMs) {
      return 'Valid-to must be later than Valid-from.'
    }
  }
  return true
}

export const AdminIpRules: CollectionConfig = {
  slug: 'adminIpRules',
  admin: {
    group: 'System',
    useAsTitle: 'ipAddress',
    defaultColumns: [
      'applicantName',
      'affiliation',
      'ipAddress',
      'accessType',
      'validFrom',
      'validTo',
      'isActive',
    ],
    description:
      'Default-deny admin IP allowlist. While NO rules exist the admin stays open (bootstrap safety); once any rule exists, only IPs matched by an active in-window "allow" rule may reach the admin, and any matching "block" rule wins. Recovery: set ADMIN_IP_ENFORCEMENT=off.',
    hidden: ({ user }) => !hasMenuAccessSync(user, IP_ACCESS_MENU_KEY),
  },
  access: menuAccessConfig(IP_ACCESS_MENU_KEY),
  fields: [
    {
      name: 'applicantName',
      type: 'text',
      required: true,
      admin: { description: 'Who requested this access rule (legacy 신청자).' },
    },
    {
      name: 'affiliation',
      type: 'text',
      required: true,
      admin: { description: 'Applicant’s organization/department (legacy 소속).' },
    },
    {
      name: 'phone',
      type: 'text',
      required: true,
      admin: { description: 'Applicant’s contact number (legacy 연락처).' },
    },
    {
      name: 'memo',
      type: 'textarea',
      admin: { description: 'Optional note about this rule (legacy 비고).' },
    },
    {
      name: 'ipAddress',
      type: 'text',
      required: true,
      validate: validateIpAddress,
      admin: {
        description:
          'Exact IPv4/IPv6, an IPv4 trailing wildcard (e.g. "192.168.0.*", "10.*"), or "*". WARNING: a bare "*" matches ALL IPs — an active "*" allow rule disables IP restriction entirely.',
      },
    },
    {
      name: 'accessType',
      type: 'select',
      required: true,
      defaultValue: 'allow',
      options: [
        { label: 'Allow', value: 'allow' },
        { label: 'Block', value: 'block' },
      ],
      admin: {
        description:
          'Allow-list (default) or explicit block. Under default-deny, "block" wins over any "allow" match.',
      },
    },
    {
      name: 'validFrom',
      type: 'date',
      required: true,
      admin: { description: 'Rule takes effect from this date/time (legacy 시작일).' },
    },
    {
      name: 'validTo',
      type: 'date',
      required: true,
      validate: validateValidTo,
      admin: {
        description:
          'Rule expires after this date/time (legacy 종료일). Expired rules stop matching automatically — no cron needed.',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Inactive rules are ignored by the guard.' },
    },
    {
      name: 'siteId',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      // Default to the admin back-office site (legacy "bos") so a new rule
      // guards the admin by default. Async default resolves the admin site id.
      defaultValue: async ({ req }) => {
        try {
          const found = await req.payload.find({
            collection: 'sites',
            where: { isAdminSite: { equals: true } },
            limit: 1,
            pagination: false,
            depth: 0,
            overrideAccess: true,
          })
          return found.docs[0]?.id
        } catch {
          return undefined
        }
      },
      admin: {
        description: 'Which admin site this rule guards (defaults to the admin back-office).',
      },
    },
  ],
  hooks: {
    afterChange: [ipRulesAudit.afterChange],
    afterDelete: [ipRulesAudit.afterDelete],
  },
}
