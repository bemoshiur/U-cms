import type { ServerProps } from 'payload'
import React from 'react'

import { resolveMemberWatermark } from '@/members/watermark'

/**
 * Member-detail WATERMARK overlay (Task 6B Part 1; feature-inventory ref 1-37).
 * Mounted on the members EDIT/detail view via
 * `admin.components.edit.beforeDocumentControls` — the same confirm-gated,
 * audited full-PII screen Task 6A produced. It paints a diagonal, repeated,
 * semi-transparent overlay of `viewer · timestamp · management#` across the
 * content, so a screenshot or printout of the member's personal information
 * carries, indelibly, WHO viewed it and WHEN.
 *
 * ## Server component — non-spoofable + no client JS
 *
 * This is an ASYNC SERVER component: the watermark text is computed on the
 * server from `req.user` (viewer), the immutable `personalInfoAccessLogs` row
 * for this view (timestamp + management#), and server time — see
 * `src/members/watermark.ts`. Nothing is derived on the client, so a user cannot
 * tamper with the identity/time/tracking-number baked into the rendered HTML.
 * The overlay is pure static markup (a repeated `<span>` grid) — no
 * interactivity, `pointer-events: none` — so it never interferes with editing
 * and produces no hydration surface. Screen + print styling lives in
 * `src/app/(payload)/custom.scss` (`.pii-watermark*`, incl. an `@media print`
 * block so it is NOT trivially removed by printing).
 *
 * Renders NOTHING on the "create new member" view (no `id`) or when there is no
 * authenticated viewer — there is no PII on screen to watermark in those cases.
 */

/** How many tiles to lay down; enough to blanket a large viewport at any zoom. */
const TILE_COUNT = 60

export async function MemberDetailWatermark(
  props: ServerProps,
): Promise<React.ReactElement | null> {
  const { payload, user, id } = props
  if (!payload || !user || id === undefined || id === null || id === '') {
    return null
  }

  const data = await resolveMemberWatermark(payload, { viewer: user, memberId: id })

  return (
    <div className="pii-watermark" aria-hidden="true" data-mgmt-no={data.mgmtNo}>
      <div className="pii-watermark__tiles">
        {Array.from({ length: TILE_COUNT }).map((_, i) => (
          <span className="pii-watermark__tile" key={i}>
            {data.text}
          </span>
        ))}
      </div>
    </div>
  )
}

export default MemberDetailWatermark
