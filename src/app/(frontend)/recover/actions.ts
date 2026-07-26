'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { findMemberId, findMemberPassword } from '@/members/recovery'
import { getPublicSiteId } from '@/site/config'
import { getPayloadClient } from '@/site/rsc'
import { checkPublicRateLimit } from '@/security/rateLimit'

/**
 * Member ID / password recovery server actions (Task 4B Part 2). Both are
 * rate-limited and ALWAYS redirect to the same generic "done" state regardless
 * of whether an account matched — no account-existence oracle. The heavy lifting
 * (active-only, site-scoped, generic) is in `src/members/recovery.ts`.
 */

export async function findIdAction(formData: FormData): Promise<void> {
  const payload = await getPayloadClient()
  const requestHeaders = await headers()
  if (checkPublicRateLimit({ headers: requestHeaders }, 'member-find-id').allowed) {
    await findMemberId(
      payload,
      { name: formData.get('name'), email: formData.get('email') },
      { siteId: getPublicSiteId() },
    )
  }
  redirect('/recover?done=id')
}

export async function findPasswordAction(formData: FormData): Promise<void> {
  const payload = await getPayloadClient()
  const requestHeaders = await headers()
  if (checkPublicRateLimit({ headers: requestHeaders }, 'member-find-password').allowed) {
    await findMemberPassword(
      payload,
      { loginId: formData.get('loginId'), email: formData.get('email') },
      { siteId: getPublicSiteId() },
    )
  }
  redirect('/recover?done=pw')
}
