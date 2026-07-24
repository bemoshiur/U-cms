/**
 * Shared helpers for collection hooks. A relationship field's submitted
 * value can be either the raw ID or (when the caller already has a
 * populated doc in hand) an object containing one. Normalizes either shape
 * down to the bare ID, or `undefined` for null/empty.
 *
 * Used by both `Departments.ts` (parent-cycle prevention) and
 * `codes/Codes.ts` (parent/group cross-checks) — extracted here rather than
 * duplicated per review feedback on Task 1B.
 */
export function toRelationId(value: unknown): string | number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return (value as { id: string | number }).id
  }
  return value as string | number
}
