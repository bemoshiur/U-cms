import type { Menu } from '@/payload-types'

/**
 * Finds the id of the `board`-type menu that opens the board with `bbsId`, so a
 * board page can render a breadcrumb from the menu ancestry. Menus are loaded
 * depth-1, so `menu.board` is the populated board carrying its `bbsId`. Returns
 * `undefined` when no menu points at that board (the board is still reachable
 * by URL — the breadcrumb just falls back to Home).
 */
export function menuIdForBoard(menus: Menu[], bbsId: string): number | undefined {
  for (const menu of menus) {
    if (menu.contentType !== 'board') {
      continue
    }
    const board = menu.board
    if (board && typeof board === 'object' && board.bbsId === bbsId) {
      return menu.id
    }
  }
  return undefined
}
