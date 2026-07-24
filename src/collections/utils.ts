import type { CollectionBeforeChangeHook, CollectionSlug } from 'payload'
import { APIError } from 'payload'

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

/**
 * Generic self-referential-tree cycle guard, extracted from Task 1B's
 * `Departments.ts`-local `preventParentCycle` per the Task 1C brief's "reuse
 * the shared helper" instruction — `AdminMenus.ts` needs the identical
 * rule (a self-relationship `parent` field must never point at the
 * document itself or at any of its own descendants).
 *
 * Rejects setting `parentField` to the document itself or to any of its own
 * descendants, which would otherwise create a cycle in the tree. Walks up
 * the ancestor chain starting at the proposed new parent: if that walk ever
 * reaches the document being updated, the proposed parent is either the
 * document itself (first iteration) or one of its descendants.
 *
 * Only relevant on `update` — on `create` the document has no ID yet, so it
 * cannot already appear as an ancestor of anything.
 */
export function preventSelfReferentialCycle(
  collection: CollectionSlug,
  parentField = 'parent',
): CollectionBeforeChangeHook {
  const hook: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
    if (operation !== 'update') {
      return data
    }

    const parentId = toRelationId(data[parentField])
    const currentId = originalDoc?.id
    if (parentId === undefined || currentId === undefined) {
      return data
    }

    const visited = new Set<string | number>()
    let ancestorId: string | number | undefined = parentId

    while (ancestorId !== undefined) {
      if (ancestorId === currentId) {
        throw new APIError(
          `Cannot set ${parentField}: a document cannot be its own parent or a descendant of itself (this would create a cycle).`,
          400,
        )
      }
      if (visited.has(ancestorId)) {
        // Defensive only: pre-existing corrupted data forming a cycle above
        // us. Stop walking rather than looping forever — the new parent
        // isn't `currentId`, so there's nothing left to reject here.
        break
      }
      visited.add(ancestorId)

      const ancestor = await req.payload.findByID({
        collection,
        id: ancestorId,
        req,
        overrideAccess: true,
        depth: 0,
      })

      ancestorId = toRelationId(
        (ancestor as unknown as Record<string, unknown> | null)?.[parentField],
      )
    }

    return data
  }

  return hook
}
