'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { normalizePath } from '@/content/traffic'
import { resolveClientIp } from '@/security/adminIpEnforcement'
import { checkPublicRateLimit, PUBLIC_ENDPOINT_NAMES } from '@/security/rateLimit'
import { getActiveSite, getPayloadClient } from '@/site/rsc'
import { getCurrentMember } from '@/site/member'
import { SatisfactionError, submitSatisfactionRating } from '@/site/satisfaction'

/**
 * Satisfaction rating server action (Task 4E; refs 2-18/2-19). Reads the score +
 * page key + optional menu id from the form, resolves the active site + member +
 * a trustworthy client IP, rate-limits, and delegates to the hardened
 * {@link submitSatisfactionRating} (which gates on `site.satisfactionEnabled`,
 * validates the 1-5 score, server-forces every field, and dedups best-effort).
 * Redirects back to the rated page with a status flag (React escapes it on render).
 */
export async function submitSatisfactionAction(formData: FormData): Promise<void> {
  // `pageKey` is a site-relative path — normalize it to a safe path (leading `/`,
  // query stripped) so it can never become an open redirect.
  const pageKey = normalizePath(String(formData.get('pageKey') ?? '/'))
  const scoreRaw = String(formData.get('score') ?? '')
  const score = Number(scoreRaw)
  const menuRaw = formData.get('menuId')
  const menuId = typeof menuRaw === 'string' && menuRaw.length > 0 ? menuRaw : null

  const requestHeaders = await headers()
  const rl = checkPublicRateLimit(
    { headers: requestHeaders },
    PUBLIC_ENDPOINT_NAMES.satisfactionRate,
  )
  if (!rl.allowed) {
    redirect(
      `${pageKey}?rateError=` + encodeURIComponent('Too many requests. Please wait a while.'),
    )
  }

  const [site, member] = await Promise.all([getActiveSite(), getCurrentMember()])
  if (!site) {
    redirect(`${pageKey}?rateError=` + encodeURIComponent('Rating is not available.'))
  }
  const client = resolveClientIp(requestHeaders)
  const clientIp = client.trusted ? client.ip : null

  const payload = await getPayloadClient()
  let errorMessage: string | undefined
  try {
    await submitSatisfactionRating(
      payload,
      site as { id: string | number; satisfactionEnabled?: boolean | null },
      { pageKey, menuId, score },
      { member, clientIp },
    )
  } catch (e) {
    errorMessage =
      e instanceof SatisfactionError
        ? e.message
        : 'Your rating could not be recorded. Please try again.'
  }
  if (errorMessage) {
    redirect(`${pageKey}?rateError=` + encodeURIComponent(errorMessage))
  }
  redirect(`${pageKey}?rated=1`)
}
