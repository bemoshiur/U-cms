'use client'

import type { DefaultCellComponentProps } from 'payload'

import React from 'react'

import { maskId, maskLabel, maskName } from '@/lib/mask'

/**
 * Display-only PII masking for audit-log list-view cells (Task 2A Part 5;
 * feature-inventory ref 3-7 `ha***g`). The real identity is always stored on
 * the row (non-repudiation); this Cell masks it purely at render time in the
 * admin list. The masking strategy is chosen from the field name it is wired
 * onto, so one component serves all three masked columns:
 *
 *  - `loginId`                          → {@link maskId}   (e.g. `ha***g`)
 *  - `actorLabel`/`viewerLabel`/`subjectLabel` (`name(id)`) → {@link maskLabel} (e.g. `강*아(ha***g)`)
 *  - anything else (userLabel)          → {@link maskName} (e.g. `강*아`)
 *
 * A client component (`admin.components.Cell`), registered in the admin
 * import map like the branding graphics.
 */
export const MaskedCell: React.FC<DefaultCellComponentProps> = ({ cellData, field }) => {
  const raw = cellData === null || cellData === undefined ? '' : String(cellData)
  const fieldName = (field as { name?: string } | undefined)?.name

  let masked: string
  if (fieldName === 'loginId') {
    masked = maskId(raw)
  } else if (
    fieldName === 'actorLabel' ||
    fieldName === 'viewerLabel' ||
    fieldName === 'subjectLabel'
  ) {
    masked = maskLabel(raw)
  } else {
    masked = maskName(raw)
  }

  return <span>{masked}</span>
}

export default MaskedCell
