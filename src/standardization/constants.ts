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

/* ── Task 8.1b engine menu keys (all under the same `standardization` group) ── */

/** Menu-grant key gating the DBA proposal workflow collection (refs 1-68..1-73). */
export const STD_PROPOSALS_MENU_KEY = 'standardization.proposals'
/** Menu-grant key gating the Table Standard Settings collection + view (ref 1-67). */
export const STD_TABLE_SETTINGS_MENU_KEY = 'standardization.tableSettings'
/** Menu-grant key gating the read-only Meta Term Inspection view + endpoints (ref 1-66). */
export const STD_META_INSPECTION_MENU_KEY = 'standardization.metaInspection'
/** Menu-grant key gating the Standardization Self-Check results collection + view (ref 1-75). */
export const STD_SELF_CHECK_MENU_KEY = 'standardization.selfCheck'
/** Menu-grant key gating the Self-Check Statistics view + endpoint (ref 1-76). */
export const STD_SELF_CHECK_STATS_MENU_KEY = 'standardization.selfCheckStats'

/** Every leaf menuKey the DBA role grants (the whole module surface). */
export const STANDARDIZATION_MENU_KEYS: readonly string[] = [
  STD_DOMAINS_MENU_KEY,
  STD_WORDS_MENU_KEY,
  STD_TERMS_MENU_KEY,
  STD_CODE_SPEC_MENU_KEY,
  STD_PROPOSALS_MENU_KEY,
  STD_TABLE_SETTINGS_MENU_KEY,
  STD_META_INSPECTION_MENU_KEY,
  STD_SELF_CHECK_MENU_KEY,
  STD_SELF_CHECK_STATS_MENU_KEY,
]

/**
 * Payload admin nav `admin.group` label shared by the three dictionary
 * collections, so they cluster under one sidebar heading mirroring the legacy
 * menu path (시스템 관리 > 공공데이터 표준화 관리).
 */
export const STANDARDIZATION_NAV_GROUP = '공공데이터 표준화 관리 / Public Data Standardization'

/**
 * Nav group for the DBA proposal-management collections (제안 관리 sub-menu): the
 * proposal workflow (1-68..1-73) + table standard settings (1-67). Kept separate
 * from the dictionary group so the sidebar mirrors the legacy menu nesting
 * (표준화 관리 > 공공데이터 표준화 제안관리).
 */
export const STANDARDIZATION_PROPOSAL_NAV_GROUP =
  '공공데이터 표준화 제안관리 / Standardization Proposal Management'

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

/* ── Task 8.1b engine option sets + contexts ─────────────────────────────── */

/**
 * Per-request `req.context` flag letting the seed write a self-check snapshot
 * for a NON-current year-month (historical reference data, ref 1-75's rule that
 * only the current YM is (re)writable). The Run-Check endpoint never needs it —
 * it always writes the current YM, which the guard permits unconditionally.
 */
export const SELF_CHECK_HISTORICAL_BYPASS = 'standardizationSelfCheckHistoricalBypass'

/** 제안구분 (Proposal Kind) — register / edit / discard·delete (refs 1-68/1-72). */
export const PROPOSAL_KIND_OPTIONS = [
  { label: '등록제안 (Register)', value: 'register' },
  { label: '수정제안 (Edit)', value: 'edit' },
  { label: '폐기제안 (Discard)', value: 'discard' },
] as const

/** Proposal target dictionary — domain / word / term (one polymorphic queue). */
export const PROPOSAL_TARGET_OPTIONS = [
  { label: '도메인 (Domain)', value: 'domain' },
  { label: '단어 (Word)', value: 'word' },
  { label: '용어 (Term)', value: 'term' },
] as const

/** The three dictionary collection slugs a proposal can target. */
export type DictionaryCollectionSlug = 'standardDomains' | 'standardWords' | 'standardTerms'

/** Maps a proposal `target` to the dictionary collection slug it applies to. */
export const PROPOSAL_TARGET_COLLECTION: Record<string, DictionaryCollectionSlug> = {
  domain: 'standardDomains',
  word: 'standardWords',
  term: 'standardTerms',
}

/**
 * 표준출처 for a table's standardization assignment (ref 1-67): MOIS baseline,
 * institution, excluded from checking, or unassigned. Extends the two-value
 * dictionary source set with 제외/미지정.
 */
export const TABLE_SOURCE_OPTIONS = [
  { label: '행정안전부 (MOIS)', value: 'mois' },
  { label: '기관 (Institution)', value: 'institution' },
  { label: '제외 (Excluded)', value: 'excluded' },
  { label: '미지정 (Unassigned)', value: 'unassigned' },
] as const

/**
 * The eight self-check error types (ref 1-75). Each `id` maps to a
 * `standardizationSelfChecks.error<N>Count` column and a rule predicate in
 * `src/standardization/rules.ts`. The meta-term inspection (ref 1-66) uses only
 * the FIRST FOUR conceptually (physical/logical + column-token + no-domain — see
 * `META_INSPECTION_RULE_IDS`).
 */
export const SELF_CHECK_ERROR_TYPES = [
  {
    id: 'error1',
    label: '오류1',
    description: '컬럼 물리명이 표준용어와 일치하나 논리명(주석)이 다름',
  },
  {
    id: 'error2',
    label: '오류2',
    description: '논리명(주석)이 표준용어명과 일치하나 컬럼 물리명이 다름',
  },
  { id: 'error3', label: '오류3', description: '컬럼 물리명의 단어가 단어사전에 없음' },
  { id: 'error4', label: '오류4', description: '테이블 물리명의 단어가 단어사전에 없음' },
  { id: 'error5', label: '오류5', description: '표준용어와 일치하나 바인딩된 도메인이 없음' },
  { id: 'error6', label: '오류6', description: '바인딩된 도메인이 도메인사전에 존재하지 않음' },
  {
    id: 'error7',
    label: '오류7',
    description: '컬럼은 표준용어와 일치하나 도메인 자료유형이 다름',
  },
  { id: 'error8', label: '오류8', description: '컬럼의 도메인 길이가 도메인 정의와 불일치' },
] as const

/** The four rule ids surfaced by the meta-term inspection grid (ref 1-66). */
export const META_INSPECTION_RULE_IDS = ['error1', 'error2', 'error3', 'error5'] as const
