import type { CollectionBeforeChangeHook } from 'payload'
import { APIError } from 'payload'

import { SELF_CHECK_HISTORICAL_BYPASS } from '../../standardization/constants'
import { currentYearMonth } from '../../standardization/yearMonth'

/**
 * Current-year-month write guard for self-check snapshots (Phase 8, Task 8.1b;
 * ref 1-75). The manual's red-text rule: running the standardization check
 * re-computes and (over)writes ONLY the current check year-month; earlier months
 * are reference-only. This hook enforces that at the data layer — any create or
 * update whose `checkYearMonth` is not the current YM is rejected, so a DBA can
 * never tamper with a historical snapshot through the admin UI or the API.
 *
 * The seed (which preloads 2-3 historical reference months so 1-75/1-76 render
 * non-empty like the manual) signals its intent to write a past month via
 * `req.context[SELF_CHECK_HISTORICAL_BYPASS] = true`. The Run-Check endpoint
 * never needs the bypass — it always writes the current YM, which is permitted
 * unconditionally.
 */
export const enforceCurrentYearMonthOnly: CollectionBeforeChangeHook = ({ data, req }) => {
  const ctx = req?.context as Record<string, unknown> | undefined
  if (ctx?.[SELF_CHECK_HISTORICAL_BYPASS] === true) {
    return data
  }
  const target = (data as { checkYearMonth?: string }).checkYearMonth
  if (target && target !== currentYearMonth()) {
    throw new APIError(
      `Only the current check year-month (${currentYearMonth()}) may be written; ` +
        `earlier months are reference-only (해당년월 이전의 내용은 참고용으로만 사용한다).`,
      403,
    )
  }
  return data
}
