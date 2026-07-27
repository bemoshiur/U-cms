import type { Payload, PayloadRequest } from 'payload'

import {
  buildRuleContext,
  type ColumnMeta,
  type Dictionaries,
  type DictDomain,
  type DictTerm,
  type DictWord,
  evaluateColumn,
  mapPgDataType,
  type RuleId,
} from '../standardization/rules'

/**
 * Live-schema introspection + conformance run (Phase 8, Task 8.1b; refs 1-66 +
 * 1-75). READ-ONLY: reads the physical schema from `information_schema.columns`
 * / `information_schema.tables` plus column comments via `pg_description`
 * (pg_catalog) — the physical→logical mapping. All queries are PARAMETERIZED,
 * scoped to the `public` schema and `BASE TABLE`s (cheap catalog reads, bounded
 * by the ~dozens of app tables), and run against the pool Payload already holds
 * (`payload.db.pool`). The dictionaries (term/word/domain) are loaded via the
 * Local API. Each physical column is then fed through the pure rule engine
 * (`src/standardization/rules.ts`) to get its per-rule SUCCESS/FAIL verdict.
 *
 * The meta-term inspection (1-66) surfaces four rules; the self-check (1-75)
 * counts eight — both share this one introspection + evaluation path.
 */

/** Postgres pool accessor (node-pg). The postgres adapter always exposes `.pool`. */
type PgPool = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

function getPool(payload: Payload): PgPool {
  const pool = (payload.db as unknown as { pool?: PgPool }).pool
  if (!pool) {
    throw new Error('[standardization] Postgres pool unavailable on payload.db.pool')
  }
  return pool
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Reads every column of every base table in `public` with its logical name
 * (comment). Parameterized: the schema is a bound parameter, and an optional
 * table allowlist is applied via `= ANY($2)` so the self-check can bound a run
 * to just the tables assigned to one standard source (ref 1-67).
 */
export async function introspectColumns(
  payload: Payload,
  opts: { onlyTables?: string[] } = {},
): Promise<ColumnMeta[]> {
  const pool = getPool(payload)
  const params: unknown[] = ['public']
  let tableFilter = ''
  if (opts.onlyTables) {
    // An explicit (possibly empty) allowlist — an empty list yields zero rows.
    params.push(opts.onlyTables)
    tableFilter = 'AND c.table_name = ANY($2)'
  }
  const text = `
    SELECT
      c.table_name        AS table_name,
      c.column_name       AS column_name,
      c.ordinal_position  AS ordinal_position,
      c.data_type         AS data_type,
      c.character_maximum_length AS char_max_length,
      c.numeric_precision AS numeric_precision,
      pgd.description     AS column_comment
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    JOIN pg_catalog.pg_class pgc
      ON pgc.relname = c.table_name AND pgc.relnamespace = ('"' || c.table_schema || '"')::regnamespace
    LEFT JOIN pg_catalog.pg_description pgd
      ON pgd.objoid = pgc.oid AND pgd.objsubid = c.ordinal_position
    WHERE c.table_schema = $1
      AND t.table_type = 'BASE TABLE'
      ${tableFilter}
    ORDER BY c.table_name, c.ordinal_position
  `
  const { rows } = await pool.query(text, params)
  return rows.map((r) => ({
    tableName: String(r.table_name ?? ''),
    columnName: String(r.column_name ?? ''),
    logicalName: r.column_comment == null ? '' : String(r.column_comment),
    pgDataType: String(r.data_type ?? ''),
    charMaxLength: toNum(r.char_max_length),
    numericPrecision: toNum(r.numeric_precision),
  }))
}

/** The distinct base-table names of the `public` schema (for table-standard settings sync). */
export async function introspectTableNames(payload: Payload): Promise<string[]> {
  const pool = getPool(payload)
  const { rows } = await pool.query(
    `SELECT c.relname AS table_name
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r'
      ORDER BY c.relname`,
    ['public'],
  )
  return rows.map((r) => String(r.table_name ?? '')).filter(Boolean)
}

/** Loads the three dictionaries, optionally filtered to one standard source. */
export async function loadDictionaries(
  payload: Payload,
  opts: { source?: string; req?: PayloadRequest } = {},
): Promise<Dictionaries> {
  const { source, req } = opts
  const where = source ? { standardSource: { equals: source } } : undefined
  const common = {
    pagination: false as const,
    depth: 0 as const,
    overrideAccess: true,
    req,
    limit: 100000,
  }

  const [termsRes, wordsRes, domainsRes] = await Promise.all([
    payload.find({ collection: 'standardTerms', ...(where ? { where } : {}), ...common }),
    payload.find({ collection: 'standardWords', ...(where ? { where } : {}), ...common }),
    payload.find({ collection: 'standardDomains', ...(where ? { where } : {}), ...common }),
  ])

  const domainsById = new Map<number | string, string>()
  const domains: DictDomain[] = domainsRes.docs.map((d) => {
    domainsById.set(d.id, String(d.domainName ?? ''))
    return {
      domainName: String(d.domainName ?? ''),
      dataType: String(d.dataType ?? ''),
      dataLength: toNum((d as { dataLength?: unknown }).dataLength),
    }
  })

  const terms: DictTerm[] = termsRes.docs.map((t) => {
    const bd = (t as { boundDomain?: unknown }).boundDomain
    const boundId =
      bd && typeof bd === 'object'
        ? (bd as { id?: number | string }).id
        : (bd as number | string | undefined)
    const boundDomainName = boundId != null ? (domainsById.get(boundId) ?? null) : null
    return {
      termAbbreviation: String(t.termAbbreviation ?? ''),
      termName: String(t.termName ?? ''),
      boundDomainName,
    }
  })

  const words: DictWord[] = wordsRes.docs.map((w) => ({
    abbreviation: String(w.abbreviation ?? ''),
  }))

  return { terms, words, domains }
}

/** One evaluated inspection row (the 1-66 grid + the 1-75 detail popup share this shape). */
export type InspectionRow = {
  tableName: string
  columnName: string
  logicalName: string
  dataType: string
  domain: string
  fails: Record<RuleId, boolean>
}

/** Runs the full introspection + rule evaluation, returning a row per column + per-rule counts. */
export async function inspectSchema(
  payload: Payload,
  opts: { source?: string; onlyTables?: string[]; req?: PayloadRequest } = {},
): Promise<{ rows: InspectionRow[]; counts: Record<RuleId, number> }> {
  const [columns, dict] = await Promise.all([
    introspectColumns(payload, opts.onlyTables ? { onlyTables: opts.onlyTables } : {}),
    loadDictionaries(payload, { source: opts.source, req: opts.req }),
  ])
  const ctx = buildRuleContext(dict)

  const counts: Record<RuleId, number> = {
    error1: 0,
    error2: 0,
    error3: 0,
    error4: 0,
    error5: 0,
    error6: 0,
    error7: 0,
    error8: 0,
  }
  const rows: InspectionRow[] = columns.map((col) => {
    const verdict = evaluateColumn(col, ctx)
    for (const key of Object.keys(counts) as RuleId[]) {
      if (verdict.fails[key]) counts[key] += 1
    }
    return {
      tableName: col.tableName,
      columnName: col.columnName,
      logicalName: col.logicalName,
      dataType: mapPgDataTypeDisplay(col),
      domain: verdict.domainName,
      fails: verdict.fails,
    }
  })
  return { rows, counts }
}

/** A compact `TYPE(length)` display, e.g. `VARCHAR(50)`, `NUMERIC(10)`, `TEXT`. */
function mapPgDataTypeDisplay(col: ColumnMeta): string {
  const canonical = mapPgDataType(col.pgDataType)
  const base = canonical === 'OTHER' ? col.pgDataType : canonical
  const len = col.charMaxLength ?? col.numericPrecision
  return len != null ? `${base}(${len})` : base
}
