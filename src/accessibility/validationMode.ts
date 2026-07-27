import type { ValidationMode } from './constants'

/**
 * Validation-mode semantics for the public-site accessibility toggle (Phase 8,
 * Task 8.2 / TODO 8.3; ref 1-74 ACS_VLD_USE_CD). The `sites`
 * `accessibilityValidation` select carries one of off / popup / db / popup_db;
 * this pure resolver turns that into the two independent actions the public-site
 * component + the DB-store endpoint key off:
 *
 *   off        → nothing (the component no-ops; the endpoint writes nothing)
 *   popup      → 새창알림: run the client-side axe check + show a popup/notice
 *   db         → DB저장: POST results to the DB-store endpoint (no popup)
 *   popup_db   → both
 *
 * Kept pure so the mode→behavior contract is unit-tested exhaustively and shared
 * verbatim by the client component (popup + POST gating) and the server endpoint
 * (write gating) — they can never drift.
 */

export type ValidationActions = {
  /** Whether to run the client-side axe check and surface the popup/notice. */
  showPopup: boolean
  /** Whether to POST the results to the DB-store endpoint. */
  storeToDb: boolean
}

const VALID_MODES: ReadonlySet<string> = new Set(['off', 'popup', 'db', 'popup_db'])

/** Coerces an arbitrary/nullish value to a known {@link ValidationMode} (default off). */
export function parseValidationMode(raw: unknown): ValidationMode {
  return typeof raw === 'string' && VALID_MODES.has(raw) ? (raw as ValidationMode) : 'off'
}

/** Resolves a validation mode into its two independent actions. */
export function validationModeActions(mode: ValidationMode): ValidationActions {
  return {
    showPopup: mode === 'popup' || mode === 'popup_db',
    storeToDb: mode === 'db' || mode === 'popup_db',
  }
}

/** True iff the mode does anything at all (i.e. the component should mount work). */
export function isValidationActive(mode: ValidationMode): boolean {
  const { showPopup, storeToDb } = validationModeActions(mode)
  return showPopup || storeToDb
}
