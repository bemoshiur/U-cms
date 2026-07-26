import { describe, expect, it } from 'vitest'

import type { CurrentMember } from '@/site/member'
import type { GuideMenu, NavMenu } from '@/site/nav'
import {
  buildBreadcrumb,
  buildNav,
  isBoardMenuAccessible,
  isMenuVisible,
  orderedGuideMenus,
  resolveGuideLink,
  resolveMenuLink,
  visibleFooterItems,
  visibleMenuIds,
} from '@/site/nav'

const LOGGED_OUT: CurrentMember = null
const MEMBER: CurrentMember = { id: 1 }

/** Builds a menu fixture with sensible defaults. */
function menu(partial: Partial<NavMenu> & { id: number | string; name: string }): NavMenu {
  return { contentType: 'placeholder', active: true, exposureCondition: 'always', ...partial }
}

describe('site nav helpers (Task 4A)', () => {
  describe('isMenuVisible', () => {
    it('hides inactive menus from the public nav', () => {
      expect(isMenuVisible(menu({ id: 1, name: 'X', active: false }), LOGGED_OUT)).toBe(false)
    })

    it('shows always/unset exposure to everyone', () => {
      expect(
        isMenuVisible(menu({ id: 1, name: 'X', exposureCondition: 'always' }), LOGGED_OUT),
      ).toBe(true)
      expect(isMenuVisible(menu({ id: 2, name: 'Y', exposureCondition: null }), MEMBER)).toBe(true)
    })

    it('shows loggedOutOnly to anonymous, hides from members', () => {
      const m = menu({ id: 1, name: 'X', exposureCondition: 'loggedOutOnly' })
      expect(isMenuVisible(m, LOGGED_OUT)).toBe(true)
      expect(isMenuVisible(m, MEMBER)).toBe(false)
    })

    it('shows loggedInOnly to members, hides from anonymous', () => {
      const m = menu({ id: 1, name: 'X', exposureCondition: 'loggedInOnly' })
      expect(isMenuVisible(m, LOGGED_OUT)).toBe(false)
      expect(isMenuVisible(m, MEMBER)).toBe(true)
    })
  })

  describe('resolveMenuLink', () => {
    it('resolves a content menu to /page/[menuNumber]', () => {
      expect(
        resolveMenuLink(menu({ id: 1, name: 'Home', contentType: 'content', menuNumber: 7 })),
      ).toEqual({ kind: 'link', href: '/page/7', external: false, newWindow: false })
    })

    it('resolves a board menu to /board/[bbsId] when populated', () => {
      const m = menu({
        id: 1,
        name: 'Notice',
        contentType: 'board',
        board: { id: 3, bbsId: 'B0000001' },
      })
      expect(resolveMenuLink(m)).toEqual({
        kind: 'link',
        href: '/board/B0000001',
        external: false,
        newWindow: false,
      })
    })

    it('is non-clickable for a board menu with no populated bbsId', () => {
      expect(
        resolveMenuLink(menu({ id: 1, name: 'Notice', contentType: 'board', board: 3 })),
      ).toEqual({
        kind: 'none',
      })
    })

    it('resolves an external link menu (honoring newWindow)', () => {
      const m = menu({
        id: 1,
        name: 'Ext',
        contentType: 'link',
        linkUrl: 'https://example.com',
        newWindow: true,
      })
      expect(resolveMenuLink(m)).toEqual({
        kind: 'link',
        href: 'https://example.com',
        external: true,
        newWindow: true,
      })
    })

    it('resolves a safe internal link menu', () => {
      const m = menu({ id: 1, name: 'Int', contentType: 'link', linkUrl: '/some/path' })
      expect(resolveMenuLink(m)).toEqual({
        kind: 'link',
        href: '/some/path',
        external: false,
        newWindow: false,
      })
    })

    it('is non-clickable for an unsafe/blank link value', () => {
      expect(
        resolveMenuLink(
          menu({ id: 1, name: 'Bad', contentType: 'link', linkUrl: 'javascript:alert(1)' }),
        ),
      ).toEqual({ kind: 'none' })
      expect(
        resolveMenuLink(menu({ id: 2, name: 'Proto', contentType: 'link', linkUrl: '//evil.com' })),
      ).toEqual({ kind: 'none' })
      expect(
        resolveMenuLink(menu({ id: 3, name: 'Empty', contentType: 'link', linkUrl: '' })),
      ).toEqual({ kind: 'none' })
    })

    it('is non-clickable for placeholder and program menus', () => {
      expect(resolveMenuLink(menu({ id: 1, name: 'P', contentType: 'placeholder' }))).toEqual({
        kind: 'none',
      })
      expect(resolveMenuLink(menu({ id: 2, name: 'Prog', contentType: 'program' }))).toEqual({
        kind: 'none',
      })
    })
  })

  describe('buildNav', () => {
    const menus: NavMenu[] = [
      menu({ id: 1, name: 'Home', contentType: 'content', menuNumber: 1, order: 1 }),
      menu({ id: 2, name: 'About', contentType: 'placeholder', order: 2 }),
      menu({ id: 3, name: 'Intro', contentType: 'content', menuNumber: 3, parent: 2, order: 2 }),
      menu({ id: 4, name: 'History', contentType: 'content', menuNumber: 4, parent: 2, order: 1 }),
      menu({
        id: 5,
        name: 'Hidden',
        contentType: 'content',
        menuNumber: 5,
        order: 3,
        active: false,
      }),
      menu({
        id: 6,
        name: 'MemberOnly',
        contentType: 'content',
        menuNumber: 6,
        order: 4,
        exposureCondition: 'loggedInOnly',
      }),
    ]

    it('returns top-level GNB nodes with nested LNB children, sorted by order', () => {
      const nav = buildNav(menus, { member: LOGGED_OUT })
      expect(nav.map((n) => n.menu.name)).toEqual(['Home', 'About'])
      const about = nav.find((n) => n.menu.name === 'About')!
      // children sorted by order: History (1) before Intro (2)
      expect(about.children.map((c) => c.menu.name)).toEqual(['History', 'Intro'])
    })

    it('hides inactive menus', () => {
      const nav = buildNav(menus, { member: LOGGED_OUT })
      expect(nav.map((n) => n.menu.name)).not.toContain('Hidden')
    })

    it('applies exposureCondition using member state', () => {
      expect(buildNav(menus, { member: LOGGED_OUT }).map((n) => n.menu.name)).not.toContain(
        'MemberOnly',
      )
      expect(buildNav(menus, { member: MEMBER }).map((n) => n.menu.name)).toContain('MemberOnly')
    })

    it('hides a whole branch when the parent is hidden', () => {
      const withHiddenParent: NavMenu[] = [
        menu({ id: 10, name: 'Section', active: false }),
        menu({ id: 11, name: 'Child', parent: 10, contentType: 'content', menuNumber: 11 }),
      ]
      const nav = buildNav(withHiddenParent, { member: LOGGED_OUT })
      expect(nav).toHaveLength(0)
    })

    it('attaches resolved links to each node', () => {
      const nav = buildNav(menus, { member: LOGGED_OUT })
      const home = nav.find((n) => n.menu.name === 'Home')!
      expect(home.link).toEqual({
        kind: 'link',
        href: '/page/1',
        external: false,
        newWindow: false,
      })
    })
  })

  describe('MEDIUM-1 direct-URL gate: visibleMenuIds + isBoardMenuAccessible', () => {
    it('visibleMenuIds includes only menus visible (self + ancestors) to the visitor', () => {
      const menus = [
        menu({ id: 1, name: 'Root' }),
        menu({ id: 2, name: 'Inactive', parent: 1, active: false }),
        menu({ id: 3, name: 'MembersOnly', parent: 1, exposureCondition: 'loggedInOnly' }),
        menu({ id: 4, name: 'Public', parent: 1 }),
        menu({ id: 5, name: 'HiddenParent', active: false }),
        menu({ id: 6, name: 'ChildOfHidden', parent: 5 }),
      ]
      const anon = visibleMenuIds(menus, LOGGED_OUT)
      expect(anon.has('1')).toBe(true)
      expect(anon.has('4')).toBe(true)
      expect(anon.has('2')).toBe(false) // inactive
      expect(anon.has('3')).toBe(false) // loggedInOnly, visitor is anon
      expect(anon.has('6')).toBe(false) // parent inactive → whole branch hidden

      const member = visibleMenuIds(menus, MEMBER)
      expect(member.has('3')).toBe(true) // loggedInOnly now visible to a member
    })

    it('isBoardMenuAccessible gates a board by its owning menu visibility', () => {
      const boardMenu = (id: number, bbsId: string, extra: Partial<NavMenu> = {}) =>
        menu({ id, name: `M${id}`, contentType: 'board', board: { id, bbsId }, ...extra })

      const menus = [
        boardMenu(1, 'B0000001'), // active always → accessible
        boardMenu(2, 'B0000002', { active: false }), // inactive → hidden
        boardMenu(3, 'B0000003', { exposureCondition: 'loggedInOnly' }), // member-only
      ]

      // Active menu → accessible to anyone.
      expect(isBoardMenuAccessible(menus, 'B0000001', LOGGED_OUT)).toBe(true)
      // Inactive owning menu → 404 for everyone.
      expect(isBoardMenuAccessible(menus, 'B0000002', LOGGED_OUT)).toBe(false)
      expect(isBoardMenuAccessible(menus, 'B0000002', MEMBER)).toBe(false)
      // loggedInOnly owning menu → hidden to anon, visible to a member.
      expect(isBoardMenuAccessible(menus, 'B0000003', LOGGED_OUT)).toBe(false)
      expect(isBoardMenuAccessible(menus, 'B0000003', MEMBER)).toBe(true)
      // No owning menu → directly addressable (not hidden for lacking a nav entry).
      expect(isBoardMenuAccessible(menus, 'B9999999', LOGGED_OUT)).toBe(true)
    })
  })

  describe('buildBreadcrumb', () => {
    const menus: NavMenu[] = [
      menu({ id: 1, name: 'About' }),
      menu({ id: 2, name: 'Team', parent: 1 }),
      menu({ id: 3, name: 'Alice', parent: 2, contentType: 'content', menuNumber: 9 }),
    ]

    it('returns the ancestry chain root → target', () => {
      const trail = buildBreadcrumb(menus, 3)
      expect(trail.map((t) => t.menu.name)).toEqual(['About', 'Team', 'Alice'])
    })

    it('returns [] for an unknown target', () => {
      expect(buildBreadcrumb(menus, 999)).toEqual([])
    })
  })

  describe('visibleFooterItems', () => {
    it('returns shown, non-empty items in order and drops hidden/blank ones', () => {
      const site = {
        footer: {
          orgName: { value: 'Org', show: true },
          addressLine1: { value: 'Addr', show: true },
          phone: { value: '02-000', show: false },
          fax: { value: '', show: true },
          copyright: { value: '© Org', show: true },
        },
      }
      expect(visibleFooterItems(site)).toEqual([
        { key: 'orgName', value: 'Org' },
        { key: 'addressLine1', value: 'Addr' },
        { key: 'copyright', value: '© Org' },
      ])
    })

    it('treats unset show as shown', () => {
      const site = { footer: { orgName: { value: 'Org' } } }
      expect(visibleFooterItems(site)).toEqual([{ key: 'orgName', value: 'Org' }])
    })

    it('returns [] when there is no footer', () => {
      expect(visibleFooterItems(null)).toEqual([])
      expect(visibleFooterItems({})).toEqual([])
    })
  })

  describe('guide menus', () => {
    it('resolves internal and external guide links, skips unsafe', () => {
      expect(
        resolveGuideLink({ id: 1, name: 'A', linkType: 'external', linkExternal: 'https://x.io' }),
      ).toEqual({ kind: 'link', href: 'https://x.io', external: true, newWindow: false })
      expect(
        resolveGuideLink({ id: 2, name: 'B', linkType: 'internal', linkInternal: '/help' }),
      ).toEqual({ kind: 'link', href: '/help', external: false, newWindow: false })
      expect(
        resolveGuideLink({ id: 3, name: 'C', linkType: 'internal', linkInternal: '//evil.com' }),
      ).toEqual({ kind: 'none' })
    })

    it('orders active guide menus by displayOrder and drops inactive', () => {
      const guides: GuideMenu[] = [
        { id: 1, name: 'Second', displayOrder: 2, active: true },
        { id: 2, name: 'First', displayOrder: 1, active: true },
        { id: 3, name: 'Off', displayOrder: 0, active: false },
      ]
      expect(orderedGuideMenus(guides).map((g) => g.name)).toEqual(['First', 'Second'])
    })
  })
})
