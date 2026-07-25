/**
 * Pure web-content version-diff helpers (Task 3D Part 2; ref 2-4). No Payload
 * runtime dependency, so these are unit-testable in isolation (mirrors
 * `src/content/display.ts`) and reusable by the Phase-4 split/unified diff
 * RENDER UI. The admin diff ENDPOINT (`GET /api/webContents/:id/diff`) extracts
 * each version's fields to plain text (Lexical → text via
 * `extractLexicalText`) and calls `diffContent` — the endpoint is the only
 * Payload-aware layer; the diff computation itself lives here.
 *
 * The legacy hash-compare-against-an-external-JSP is DROPPED (plan §2.4 —
 * content lives in the DB only now, versioned by Payload). This is a straight
 * text diff between two stored versions.
 */

/** One line of a computed diff. */
export type DiffLineType = 'equal' | 'added' | 'removed'

export type DiffLine = {
  type: DiffLineType
  text: string
  /** 1-based line number in the "before" text (present for equal/removed). */
  beforeLine?: number
  /** 1-based line number in the "after" text (present for equal/added). */
  afterLine?: number
}

/**
 * Longest-common-subsequence line diff between two strings — the classic
 * Myers-style LCS backtrack, kept small and dependency-free. Splitting on `\n`
 * (a trailing newline yields a trailing empty line, which is preserved so the
 * diff round-trips) gives a line-granular diff suitable for the split/unified
 * render UI. Deterministic and pure, so it is unit-tested directly.
 *
 * Result ordering: removed lines are emitted before the added lines that
 * replace them at the same position (the conventional unified-diff order).
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const n = a.length
  const m = b.length

  // lcs[i][j] = length of the LCS of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'equal', text: a[i]!, beforeLine: i + 1, afterLine: j + 1 })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: 'removed', text: a[i]!, beforeLine: i + 1 })
      i++
    } else {
      out.push({ type: 'added', text: b[j]!, afterLine: j + 1 })
      j++
    }
  }
  while (i < n) {
    out.push({ type: 'removed', text: a[i]!, beforeLine: i + 1 })
    i++
  }
  while (j < m) {
    out.push({ type: 'added', text: b[j]!, afterLine: j + 1 })
    j++
  }
  return out
}

/** The plain-text projection of a web-content version the diff compares. */
export type WebContentSnapshot = {
  name?: string | null
  title?: string | null
  /** The page body, already flattened to text (Lexical → text before diffing). */
  content?: string | null
}

/** Per-field diff result (one entry per compared field). */
export type FieldDiff = {
  field: 'name' | 'title' | 'content'
  changed: boolean
  lines: DiffLine[]
}

/** The fields compared, in display order. */
const DIFFED_FIELDS: FieldDiff['field'][] = ['name', 'title', 'content']

/** Coerce a nullable field value to a string ('' for absent). */
function asText(value: string | null | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Field-level line diff between two web-content version snapshots (ref 2-4).
 * Returns one `FieldDiff` per compared field (`name`, `title`, `content`),
 * each with the full line diff and a `changed` flag (true iff any line is not
 * `equal`). Pure — the endpoint supplies the already-text-extracted snapshots.
 */
export function diffContent(before: WebContentSnapshot, after: WebContentSnapshot): FieldDiff[] {
  return DIFFED_FIELDS.map((field) => {
    const lines = diffLines(asText(before[field]), asText(after[field]))
    const changed = lines.some((line) => line.type !== 'equal')
    return { field, changed, lines }
  })
}
