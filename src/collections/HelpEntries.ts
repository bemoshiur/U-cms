import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../access/hasMenuAccess'
import { auditCollection } from '../audit/auditCollection'
import { preventSelfReferentialCycle } from './utils'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const HELP_MENU_KEY = 'content.help'

const helpAudit = auditCollection(HELP_MENU_KEY)

/**
 * Legacy 사이트 도움말 관리 (Site Help Management — ref 1-80). The help content
 * shown by the ⓘ button, organized as a self-relational tree. GLOBAL (not
 * tenant-scoped): legacy help is admin-SYSTEM help shared across sites (plan
 * §2.1), gated on `content.help`.
 *
 * ## Binding + precedence (ref 1-80)
 *
 * Each entry binds to a screen either by `menu` (a `menuNumber`) or by
 * `service` (a `urlPattern` matched against the screen URL). When resolving
 * which help to show, **menu binding wins**: a menu-number match beats a
 * URL-pattern match. The pure precedence rule (`resolveHelp`) lives in
 * `src/content/help.ts` and is unit-tested; the ⓘ button UI is Phase 4.
 */
export const HelpEntries: CollectionConfig = {
  slug: 'helpEntries',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'bindType', 'urlPattern', 'menuNumber', 'parent', 'order'],
    hidden: ({ user }) => !hasMenuAccessSync(user, HELP_MENU_KEY),
  },
  access: menuAccessConfig(HELP_MENU_KEY),
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'helpEntries',
      admin: { description: 'Parent help node. Leave empty for a top-level entry.' },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Sibling display order (lower first).' },
    },
    {
      name: 'content',
      type: 'richText',
      admin: { description: 'The help body shown by the ⓘ button.' },
    },
    {
      name: 'bindType',
      type: 'select',
      defaultValue: 'service',
      options: [
        { label: 'Service (URL pattern)', value: 'service' },
        { label: 'Menu (menu number)', value: 'menu' },
      ],
      admin: {
        description:
          'How this help is matched to a screen. Menu binding wins over service when both match (ref 1-80).',
      },
    },
    {
      name: 'urlPattern',
      type: 'text',
      admin: {
        condition: (_data, sibling) => sibling?.bindType === 'service',
        description:
          'Screen URL to match (when Service). Supports a "*" wildcard, e.g. /bos/board/*.',
      },
    },
    {
      name: 'menuNumber',
      type: 'number',
      admin: {
        condition: (_data, sibling) => sibling?.bindType === 'menu',
        description: 'The menu number to bind to (when Menu) — matched against the current menu.',
      },
    },
  ],
  hooks: {
    beforeChange: [preventSelfReferentialCycle('helpEntries')],
    afterChange: [helpAudit.afterChange],
    afterDelete: [helpAudit.afterDelete],
  },
}
