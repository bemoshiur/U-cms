import type { CollectionAfterChangeHook, Payload } from 'payload'

import { extractRelationIds, resolveActorLabel, resolveIpAddress, sameId } from './helpers'

/**
 * Permission-change journals (Task 2A Part 4; refs 3-2, 3-3). Two `afterChange`
 * hooks that diff `previousDoc` vs `doc` and journal grants/revokes with actor
 * identity. Both handle `create` (everything is "added") and the no-op case
 * (nothing changed → no row). Both use the same never-throw / transaction-
 * isolated write contract as the other audit writers (no `req` passed to
 * `payload.create`, so a journal failure can't abort the role/user mutation).
 */

/** Fetches roleId labels for a set of role DB ids, as an id→label map. */
async function roleLabelsById(
  payload: Payload,
  ids: Array<number | string>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  if (ids.length === 0) {
    return labels
  }
  const found = await payload.find({
    collection: 'roles',
    where: { id: { in: ids } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const role of found.docs) {
    const label =
      (typeof role.roleId === 'string' && role.roleId) ||
      (typeof role.name === 'string' && role.name) ||
      String(role.id)
    labels.set(String(role.id), label)
  }
  return labels
}

/** Fetches display names for a set of adminMenu DB ids, as an id→label map. */
async function menuLabelsById(
  payload: Payload,
  ids: Array<number | string>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  if (ids.length === 0) {
    return labels
  }
  const found = await payload.find({
    collection: 'adminMenus',
    where: { id: { in: ids } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  for (const menu of found.docs) {
    const label =
      (typeof menu.name === 'string' && menu.name) ||
      (typeof menu.menuKey === 'string' && menu.menuKey) ||
      String(menu.id)
    labels.set(String(menu.id), label)
  }
  return labels
}

/**
 * Journals a change to a user's `roles` (ref 3-2 권한 변경 이력). Records the
 * affected user's identity, a before→after role summary
 * (`roles: [ROLE_AA] → [ROLE_AA, ROLE_BB]`), and the actor + IP.
 */
export const journalUserRoleChanges: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  try {
    const before =
      operation === 'create' ? [] : extractRelationIds((previousDoc as { roles?: unknown })?.roles)
    const after = extractRelationIds((doc as { roles?: unknown })?.roles)

    const added = after.filter((id) => !before.some((b) => sameId(b, id)))
    const removed = before.filter((id) => !after.some((a) => sameId(a, id)))
    if (added.length === 0 && removed.length === 0) {
      return doc
    }

    const labels = await roleLabelsById(req.payload, [...new Set([...before, ...after])])
    const fmt = (ids: Array<number | string>): string =>
      `[${ids.map((id) => labels.get(String(id)) ?? String(id)).join(', ')}]`
    const changeSummary = `roles: ${fmt(before)} → ${fmt(after)}`

    const target = doc as Record<string, unknown>
    await req.payload.create({
      collection: 'permissionChangeLogs',
      data: {
        targetUserLabel: resolveActorLabel(target),
        targetUserId: target.id !== undefined && target.id !== null ? String(target.id) : undefined,
        targetUserEmail: typeof target.email === 'string' ? target.email : undefined,
        changeSummary,
        actorLabel: resolveActorLabel(req.user),
        ipAddress: resolveIpAddress(req),
      },
      overrideAccess: true,
    })
  } catch (err) {
    req?.payload?.logger?.error?.(
      { err },
      '[audit] journalUserRoleChanges failed — swallowed to protect the user mutation',
    )
  }
  return doc
}

/** Fetches the actor-label snapshot of every user currently holding a role. */
async function roleMemberSnapshot(
  payload: Payload,
  roleId: number | string | undefined,
): Promise<string[]> {
  if (roleId === undefined || roleId === null) {
    return []
  }
  const found = await payload.find({
    collection: 'users',
    where: { roles: { in: [roleId] } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    limit: 1000,
  })
  return found.docs
    .map((user) => resolveActorLabel(user))
    .filter((label): label is string => typeof label === 'string')
}

/**
 * Journals a change to a role's `menuGrants` (ref 3-3 메뉴 권한 설정 이력).
 * Records the role, an itemized list of added/removed menu labels, a snapshot
 * of the role's members at change time, and the actor + IP.
 */
export const journalRoleMenuChanges: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  try {
    const before =
      operation === 'create'
        ? []
        : extractRelationIds((previousDoc as { menuGrants?: unknown })?.menuGrants)
    const after = extractRelationIds((doc as { menuGrants?: unknown })?.menuGrants)

    const addedIds = after.filter((id) => !before.some((b) => sameId(b, id)))
    const removedIds = before.filter((id) => !after.some((a) => sameId(a, id)))
    if (addedIds.length === 0 && removedIds.length === 0) {
      return doc
    }

    const labels = await menuLabelsById(req.payload, [...addedIds, ...removedIds])
    const label = (id: number | string): string => labels.get(String(id)) ?? String(id)

    const role = doc as Record<string, unknown>
    const members = await roleMemberSnapshot(req.payload, role.id as number | string | undefined)

    await req.payload.create({
      collection: 'menuPermissionLogs',
      data: {
        roleLabel: typeof role.name === 'string' ? role.name : undefined,
        roleId:
          (typeof role.roleId === 'string' && role.roleId) ||
          (role.id !== undefined && role.id !== null ? String(role.id) : undefined),
        addedMenus: addedIds.map(label),
        removedMenus: removedIds.map(label),
        roleMemberSnapshot: members,
        actorLabel: resolveActorLabel(req.user),
        ipAddress: resolveIpAddress(req),
      },
      overrideAccess: true,
    })
  } catch (err) {
    req?.payload?.logger?.error?.(
      { err },
      '[audit] journalRoleMenuChanges failed — swallowed to protect the role mutation',
    )
  }
  return doc
}
