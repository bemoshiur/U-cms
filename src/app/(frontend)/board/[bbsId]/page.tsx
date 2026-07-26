import { notFound } from 'next/navigation'
import React from 'react'

import { listColumns } from '@/content/boardList'
import { textSearchableFieldKeys } from '@/content/boardSearch'
import type { PostSearchParams } from '@/content/boardSearch'
import {
  boardKind,
  loadAllBoardPosts,
  loadBoardCategoryOptions,
  loadBoardDetail,
  loadBoardListPage,
  loadGalleryPosts,
} from '@/site/board'
import { getCurrentMember } from '@/site/member'
import { buildBreadcrumb, isBoardMenuAccessible } from '@/site/nav'
import { getActiveSite, getActiveSiteMenus, getPayloadClient } from '@/site/rsc'
import { Breadcrumb } from '../../_components/Breadcrumb'
import { AdminHtml } from '../../_components/AdminHtml'
import { menuIdForBoard } from '../../_components/resolveBreadcrumbMenu'
import { FaqAccordion } from '../../_components/board/FaqAccordion'
import { GalleryGrid } from '../../_components/board/GalleryGrid'
import { Pager } from '../../_components/board/Pager'
import { PostListTable } from '../../_components/board/PostListTable'
import { QnaList } from '../../_components/board/QnaList'
import { SearchForm } from '../../_components/board/SearchForm'
import type { SearchValues } from '../../_components/board/SearchForm'

type RawSearch = Record<string, string | string[] | undefined>

function str(raw: RawSearch, key: string): string | undefined {
  const v = raw[key]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.length > 0 ? s : undefined
}

function toSearchParams(raw: RawSearch): PostSearchParams {
  return {
    keyword: str(raw, 'keyword') ?? null,
    field: str(raw, 'field') ?? null,
    category1: str(raw, 'category1') ?? null,
    category2: str(raw, 'category2') ?? null,
    category3: str(raw, 'category3') ?? null,
    periodFrom: str(raw, 'periodFrom') ?? null,
    periodTo: str(raw, 'periodTo') ?? null,
  }
}

/** Only the criteria keys are preserved across pagination (not askError/asked). */
function preservedQuery(raw: RawSearch): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of [
    'keyword',
    'field',
    'category1',
    'category2',
    'category3',
    'periodFrom',
    'periodTo',
  ]) {
    const v = str(raw, key)
    if (v !== undefined) {
      out[key] = v
    }
  }
  return out
}

/**
 * Board list route (`/board/[bbsId]`, Task 4C — refs 2-5..2-8). Resolves the
 * board on the active site, 404ing on unknown / cross-site AND on a hidden
 * owning menu (MEDIUM-1). Renders per board kind: standard/notice LIST (columns +
 * pinned notices + search + pagination + sanitized top/bottom/header HTML),
 * photo GALLERY, FAQ accordion, or Q&A list with a member ask form.
 */
export default async function BoardListPage({
  params,
  searchParams,
}: {
  params: Promise<{ bbsId: string }>
  searchParams: Promise<RawSearch>
}) {
  const { bbsId } = await params
  const raw = await searchParams

  const [site, menus, member] = await Promise.all([
    getActiveSite(),
    getActiveSiteMenus(),
    getCurrentMember(),
  ])
  if (!site) {
    notFound()
  }

  const payload = await getPayloadClient()
  const board = await loadBoardDetail(payload, site.id, bbsId)
  if (!board || !isBoardMenuAccessible(menus, bbsId, member)) {
    notFound()
  }

  const menuId = menuIdForBoard(menus, bbsId)
  const trail = menuId !== undefined ? buildBreadcrumb(menus, menuId) : []
  const kind = boardKind(board)
  const basePath = `/board/${bbsId}`

  let body: React.ReactNode
  if (kind === 'qna') {
    const posts = await loadAllBoardPosts(payload, board)
    body = (
      <QnaList
        bbsId={bbsId}
        posts={posts}
        canAsk={board.userPostAllowed === true}
        isMember={member != null}
        askError={str(raw, 'askError')}
        asked={str(raw, 'asked') === '1'}
      />
    )
  } else if (kind === 'faq') {
    const posts = await loadAllBoardPosts(payload, board)
    body = <FaqAccordion posts={posts} />
  } else if (kind === 'photo' || board.boardForm === 'thumbnail') {
    const page = Number(str(raw, 'page') ?? '1') || 1
    const { posts, pagination } = await loadGalleryPosts(payload, board, page)
    body = (
      <>
        <GalleryGrid bbsId={bbsId} posts={posts} />
        <Pager pagination={pagination} basePath={basePath} query={preservedQuery(raw)} />
      </>
    )
  } else {
    // Standard / notice list.
    const page = Number(str(raw, 'page') ?? '1') || 1
    const searchParamsParsed = toSearchParams(raw)
    const [{ notices, posts, pagination }, categories] = await Promise.all([
      loadBoardListPage(payload, board, searchParamsParsed, page),
      loadBoardCategoryOptions(payload, board),
    ])
    const columns = listColumns(board)
    const boardFields = Array.isArray(board.fields) ? board.fields : []
    const fieldOptions = textSearchableFieldKeys(board).map((key) => {
      const f = boardFields.find((row) => row?.fieldKey === key)
      return { key, label: (typeof f?.label === 'string' && f.label) || key }
    })
    const values: SearchValues = {
      keyword: str(raw, 'keyword'),
      field: str(raw, 'field'),
      periodFrom: str(raw, 'periodFrom'),
      periodTo: str(raw, 'periodTo'),
      category1: str(raw, 'category1'),
      category2: str(raw, 'category2'),
      category3: str(raw, 'category3'),
    }
    body = (
      <>
        <AdminHtml className="board-header-notice" html={board.headerNotice} />
        <AdminHtml className="board-top" html={board.topContent} />
        <SearchForm
          basePath={basePath}
          fieldOptions={fieldOptions}
          categories={categories}
          values={values}
        />
        <PostListTable
          bbsId={bbsId}
          columns={columns}
          notices={notices}
          posts={posts}
          startNumber={pagination.offset + 1}
          newIconWindow={board.newIconWindow}
        />
        <Pager pagination={pagination} basePath={basePath} query={preservedQuery(raw)} />
        <AdminHtml className="board-bottom" html={board.bottomContent} />
      </>
    )
  }

  return (
    <div className="page page--board">
      <Breadcrumb trail={trail} currentLabel={board.name} />
      <h1 className="page__title">{board.name}</h1>
      {body}
    </div>
  )
}
