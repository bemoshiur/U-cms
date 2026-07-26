import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

import { postAttachmentRefIds } from '../content/attachmentRefs'

// Task 6D (round-5): backfill the §3 flag onto attachments EMBEDDED in existing
// security-doc posts' richText (content/answer). The round-3 migration already
// backfilled attachments referenced via the `attachments[]` array (the
// `posts_attachments` join), but an inline richText upload id lives in the
// Lexical JSON, not the join table, so it needs a JS walk. Data-only: the
// `attachments.security_doc` column is owned by the round-3 migration; this only
// sets rows. Idempotent (re-running sets the same rows true) and a no-op on a
// fresh DB (seeded §3 posts embed no uploads). Runs with a booted payload.
export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const secure = await payload.find({
    collection: 'posts',
    where: { securityDoc: { equals: true } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const ids = new Set<number | string>()
  for (const post of secure.docs) {
    for (const id of postAttachmentRefIds(post as never)) {
      ids.add(id)
    }
  }
  if (ids.size === 0) {
    return
  }

  await payload.update({
    collection: 'attachments',
    where: { id: { in: [...ids] } },
    data: { securityDoc: true } as never,
    overrideAccess: true,
    req,
  })
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Data-only backfill (no schema change — the column is owned by the round-3
  // migration). Prior per-row values are unknown, so it is not reversible; no-op.
}
