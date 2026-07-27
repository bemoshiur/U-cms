/**
 * Standardization conformance rule engine (Phase 8, Task 8.1b; refs 1-66 + 1-75).
 *
 * A PURE, side-effect-free evaluator: given a physical column's metadata and the
 * three standard dictionaries (term / word / domain), it computes a SUCCESS/FAIL
 * verdict per error rule. This is the shared core of BOTH the meta-term
 * inspection (ref 1-66, four rules) and the monthly self-check (ref 1-75, eight
 * rules) — the introspection layer (`src/site/standardizationIntrospection.ts`)
 * reads the live schema and feeds each column through here; the endpoints/views
 * only format the result. Keeping it pure means the exact SUCCESS/FAIL logic is
 * unit-tested against a hand-built fixture, independent of any live database.
 *
 * ## The eight rule predicates (ref 1-75 legend; the manual's legend text is
 * partially truncated, so each is given a precise, documented definition here):
 *
 *  - error1 physLogicalMismatch  — the column's physical name matches a standard
 *    term's abbreviation, but the column's logical name (comment) differs from
 *    that term's name. (ref 1-66 오류1 / 1-75 오류1)
 *  - error2 logicalPhysMismatch  — the column's logical name (comment) matches a
 *    standard term's name, but the column's physical name differs from that
 *    term's abbreviation. (1-66 오류2 / 1-75 오류2)
 *  - error3 columnTokenUnknown   — a word token inside the physical COLUMN name is
 *    absent from the word dictionary. (1-66 오류3 / 1-75 오류3)
 *  - error4 tableTokenUnknown    — a word token inside the physical TABLE name is
 *    absent from the word dictionary. (1-75 오류4 — the table-name check that
 *    extends 1-66)
 *  - error5 noDomain             — the column matches a standard term, but that
 *    term has no bound domain. (1-66 오류4 "no domain" / 1-75 오류5)
 *  - error6 danglingDomain       — the matched term names a bound domain that does
 *    not exist in the domain dictionary. (1-75 오류6)
 *  - error7 domainTypeDiffers    — the matched term's bound domain exists, but its
 *    data type differs from the column's actual (physical) data type. (1-75 오류7,
 *    "column matches but domain differs")
 *  - error8 domainLengthViolation— the matched term's bound domain defines a length
 *    that the column's actual length violates. (1-75 오류8, per-column domain
 *    definition lookup)
 *
 * A rule for which there is no applicable comparison (e.g. a column that matches
 * no term) is a SUCCESS (no violation) — mirroring the manual, which shows a
 * per-rule SUCCESS/FAIL for every column with no N/A state.
 */

export type RuleId =
  'error1' | 'error2' | 'error3' | 'error4' | 'error5' | 'error6' | 'error7' | 'error8'

/** One physical column's introspected metadata (physical ↔ logical mapping). */
export type ColumnMeta = {
  tableName: string
  columnName: string
  /** The column comment = the logical name (용어명). May be an empty string. */
  logicalName: string
  /** Raw Postgres data type, e.g. 'character varying', 'integer', 'numeric'. */
  pgDataType: string
  /** character_maximum_length (for char/varchar), else null. */
  charMaxLength: number | null
  /** numeric_precision (for numeric/int), else null. */
  numericPrecision: number | null
}

export type DictTerm = {
  termAbbreviation: string
  termName: string
  boundDomainName: string | null
}
export type DictWord = { abbreviation: string }
export type DictDomain = {
  domainName: string
  /** Canonical data type: NUMERIC / CHAR / VARCHAR / TEXT. */
  dataType: string
  dataLength: number | null
}

export type Dictionaries = {
  terms: DictTerm[]
  words: DictWord[]
  domains: DictDomain[]
}

/** Canonical data-type buckets the dictionaries use. */
export type CanonicalType = 'NUMERIC' | 'CHAR' | 'VARCHAR' | 'TEXT' | 'OTHER'

/** Maps a raw Postgres `data_type` to the dictionary's canonical bucket. */
export function mapPgDataType(pg: string): CanonicalType {
  const t = (pg ?? '').trim().toLowerCase()
  if (
    t === 'integer' ||
    t === 'bigint' ||
    t === 'smallint' ||
    t === 'numeric' ||
    t === 'decimal' ||
    t === 'double precision' ||
    t === 'real'
  ) {
    return 'NUMERIC'
  }
  if (t === 'character') {
    return 'CHAR'
  }
  if (t === 'character varying') {
    return 'VARCHAR'
  }
  if (t === 'text') {
    return 'TEXT'
  }
  return 'OTHER'
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/** Splits a physical name into its underscore-delimited word tokens. */
export function tokenize(name: string): string[] {
  return (name ?? '')
    .split('_')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** Precomputed lookup maps over the dictionaries (built once per inspection run). */
export type RuleContext = {
  termByAbbr: Map<string, DictTerm>
  termByLogical: Map<string, DictTerm>
  wordSet: Set<string>
  domainByName: Map<string, DictDomain>
}

export function buildRuleContext(dict: Dictionaries): RuleContext {
  const termByAbbr = new Map<string, DictTerm>()
  const termByLogical = new Map<string, DictTerm>()
  for (const t of dict.terms) {
    if (t.termAbbreviation) termByAbbr.set(norm(t.termAbbreviation), t)
    if (t.termName) {
      const key = norm(t.termName)
      if (!termByLogical.has(key)) termByLogical.set(key, t)
    }
  }
  const wordSet = new Set<string>()
  for (const w of dict.words) {
    if (w.abbreviation) wordSet.add(norm(w.abbreviation))
  }
  const domainByName = new Map<string, DictDomain>()
  for (const d of dict.domains) {
    if (d.domainName) domainByName.set(d.domainName.trim(), d)
  }
  return { termByAbbr, termByLogical, wordSet, domainByName }
}

/** The full evaluation of one column against all eight rules + display domain. */
export type ColumnVerdict = {
  fails: Record<RuleId, boolean>
  /** The domain name derived from the matched term (for the grid's 도메인명 column). */
  domainName: string
}

function columnLength(col: ColumnMeta): number | null {
  return col.charMaxLength ?? col.numericPrecision ?? null
}

/** Evaluates a single column against all eight rule predicates. */
export function evaluateColumn(col: ColumnMeta, ctx: RuleContext): ColumnVerdict {
  const termByAbbr = ctx.termByAbbr.get(norm(col.columnName))
  const termByLogical = norm(col.logicalName)
    ? ctx.termByLogical.get(norm(col.logicalName))
    : undefined
  const boundDomainName = termByAbbr?.boundDomainName ?? null
  const boundDomain = boundDomainName ? ctx.domainByName.get(boundDomainName.trim()) : undefined

  // error1 — physical matches a term abbr, but logical (comment) differs.
  const error1 = !!termByAbbr && norm(termByAbbr.termName) !== norm(col.logicalName)

  // error2 — logical matches a term name, but physical differs from its abbr.
  const error2 = !!termByLogical && norm(termByLogical.termAbbreviation) !== norm(col.columnName)

  // error3 — a token in the physical COLUMN name is not a known word.
  const error3 = tokenize(col.columnName).some((tok) => !ctx.wordSet.has(norm(tok)))

  // error4 — a token in the physical TABLE name is not a known word.
  const error4 = tokenize(col.tableName).some((tok) => !ctx.wordSet.has(norm(tok)))

  // error5 — matched a term, but that term has no bound domain (no domain exists).
  const error5 = !!termByAbbr && !boundDomainName

  // error6 — matched term names a bound domain absent from the domain dictionary.
  const error6 = !!termByAbbr && !!boundDomainName && !boundDomain

  // error7 — bound domain exists but its data type differs from the column's.
  const colType = mapPgDataType(col.pgDataType)
  const error7 = !!boundDomain && colType !== 'OTHER' && boundDomain.dataType !== colType

  // error8 — bound domain defines a length the column's actual length violates.
  const colLen = columnLength(col)
  const error8 =
    !!boundDomain &&
    boundDomain.dataLength != null &&
    colLen != null &&
    colLen !== boundDomain.dataLength

  return {
    fails: { error1, error2, error3, error4, error5, error6, error7, error8 },
    domainName: boundDomainName ?? '',
  }
}
