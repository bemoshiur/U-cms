/**
 * Public-data Standardization module — shared constants (Phase 8, Task 8.1a;
 * 공공데이터 표준화 관리, feature-inventory refs 1-60..1-65, 1-74; plan §2.2).
 *
 * The standardization dictionaries (domain / word / term) + the code
 * specification report are GLOBAL (non-tenant) admin capabilities, gated behind
 * a dedicated DBA role (`ROLE_DBA`). This module is the single source of truth
 * for the role id, the menu-grant keys, the admin nav group label, the shared
 * select-option sets, and the enacted-standard "no direct edit/delete" notice —
 * imported by the collections, the seed steps, the CSV endpoints, the custom
 * admin view, and the int tests, so there are no duplicated string literals.
 *
 * Task 8.1b (a later task) layers the DBA-approved edit/discard PROPOSAL
 * workflows, live-schema meta inspection, and self-check statistics ON TOP of
 * these dictionaries — hence the `enacted` lock hook's bypass seam
 * (`STANDARDIZATION_BYPASS_LOCK`) is defined here for 8.1b to reuse.
 */

/** The DBA role id (menu-grant model, NOT isSuper — like the privacy roles). */
export const ROLE_DBA = 'ROLE_DBA'

/** Top-level permission-tree group node for the whole standardization module. */
export const STANDARDIZATION_GROUP_MENU_KEY = 'standardization'

/** Menu-grant key gating the standard DOMAIN dictionary collection. */
export const STD_DOMAINS_MENU_KEY = 'standardization.domains'
/** Menu-grant key gating the standard WORD dictionary collection. */
export const STD_WORDS_MENU_KEY = 'standardization.words'
/** Menu-grant key gating the standard TERM dictionary collection. */
export const STD_TERMS_MENU_KEY = 'standardization.terms'
/** Menu-grant key gating the read-only Code Specification report + its CSV export. */
export const STD_CODE_SPEC_MENU_KEY = 'standardization.codeSpec'

/** Every leaf menuKey the DBA role grants (the whole module surface). */
export const STANDARDIZATION_MENU_KEYS: readonly string[] = [
  STD_DOMAINS_MENU_KEY,
  STD_WORDS_MENU_KEY,
  STD_TERMS_MENU_KEY,
  STD_CODE_SPEC_MENU_KEY,
]

/**
 * Payload admin nav `admin.group` label shared by the three dictionary
 * collections, so they cluster under one sidebar heading mirroring the legacy
 * menu path (시스템 관리 > 공공데이터 표준화 관리).
 */
export const STANDARDIZATION_NAV_GROUP = '공공데이터 표준화 관리 / Public Data Standardization'

/**
 * Per-request `req.context` flag that lets a trusted caller (the seed, and —
 * later — Task 8.1b's proposal-approval action) bypass the enacted-standard
 * write lock. Left here as the forward-compatible seam for 8.1b; nothing in
 * 8.1a sets it except via `overrideAccess`-style trusted paths.
 */
export const STANDARDIZATION_BYPASS_LOCK = 'standardizationBypassLock'

/**
 * The legacy notice shown on every dictionary (refs 1-61/1-63/1-65): enacted
 * public-data standard entries must NOT be directly edited or deleted — changes
 * go through the DBA-reviewed edit/discard proposal workflow (built in 8.1b).
 */
export const STANDARD_ENACTED_NOTICE =
  '공공데이터 표준 제정 내용은 수정·삭제 시 표준에 위배되므로, 제정 절차(수정/폐기 제안 → DBA 검토·승인)에 따라 처리하시기 바랍니다. ' +
  'Enacted public-data standard entries cannot be edited or deleted directly; changes go through the DBA-reviewed edit/discard proposal workflow (Task 8.1b).'

/** 표준출처 — MOIS baseline vs institution-registered. */
export const STANDARD_SOURCE_OPTIONS = [
  { label: '행정안전부 (MOIS)', value: 'mois' },
  { label: '기관 (Institution)', value: 'institution' },
] as const

/** 사용여부 — used vs unused. */
export const USE_STATUS_OPTIONS = [
  { label: '사용 (Used)', value: 'used' },
  { label: '미사용 (Unused)', value: 'unused' },
] as const

/** 승인여부 — mirrors the legacy APRV_CD set (Y=승인 / I=승인대기 / N=미승인, ref 1-74). */
export const APPROVAL_STATUS_OPTIONS = [
  { label: '승인 (Approved)', value: 'approved' },
  { label: '승인대기 (Pending)', value: 'pending' },
  { label: '미승인 (Rejected)', value: 'rejected' },
] as const

/** 자료유형 — the observed data types (N=NUMERIC, C=CHAR, V=VARCHAR, T=TEXT). */
export const DATA_TYPE_OPTIONS = [
  { label: 'NUMERIC', value: 'NUMERIC' },
  { label: 'CHAR', value: 'CHAR' },
  { label: 'VARCHAR', value: 'VARCHAR' },
  { label: 'TEXT', value: 'TEXT' },
] as const
