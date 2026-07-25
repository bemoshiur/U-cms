'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Payload } from 'payload'

import { getPublicSiteId } from '@/site/config'
import { getPayloadClient } from '@/site/rsc'
import { checkPublicRateLimit } from '@/security/rateLimit'

/**
 * Member login server action (Task 4B Part 2). Deliberately a (frontend) server
 * action, NOT an `/api/*` route: member auth must never be subject to the admin
 * IP allowlist, and resolving a login ID → email server-side avoids leaking
 * account existence to the client.
 *
 * Accepts an identifier that is EITHER an email or a per-site login ID, resolves
 * it to the member's email on the active site, then performs the Payload login
 * (which runs the `blockInactiveMemberLogin` gate) and sets the auth cookie. All
 * failures redirect back with a single GENERIC error (no existence oracle).
 */

async function resolveMemberEmail(payload: Payload, identifier: string): Promise<string> {
  if (identifier.includes('@')) {
    return identifier
  }
  const sites = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: getPublicSiteId() } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const site = sites.docs[0]
  if (!site || site.isAdminSite) {
    return identifier
  }
  const members = await payload.find({
    collection: 'members',
    where: {
      and: [{ tenant: { equals: site.id } }, { loginId: { equals: identifier.toLowerCase() } }],
    },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return typeof members.docs[0]?.email === 'string' ? members.docs[0].email : identifier
}

export async function loginAction(formData: FormData): Promise<void> {
  const identifier = String(formData.get('identifier') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!identifier || !password) {
    redirect('/login?error=1')
  }

  const payload = await getPayloadClient()
  const requestHeaders = await headers()
  const rl = checkPublicRateLimit({ headers: requestHeaders }, 'member-login')
  if (!rl.allowed) {
    redirect('/login?error=rate')
  }

  const email = await resolveMemberEmail(payload, identifier)

  let token: string | undefined
  let exp: number | undefined
  try {
    const result = await payload.login({ collection: 'members', data: { email, password } })
    token = result.token
    exp = result.exp
  } catch {
    token = undefined
  }
  if (!token) {
    redirect('/login?error=1')
  }

  const cookieStore = await cookies()
  cookieStore.set(`${payload.config.cookiePrefix}-token`, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    // Secure only when the app is actually served over HTTPS (the configured
    // serverURL scheme) — NOT keyed on NODE_ENV, so a production build served
    // over plain HTTP (e.g. `next start` locally / in e2e) still stores the
    // cookie. Mirrors how a Secure cookie is dropped by browsers over HTTP.
    secure: payload.config.serverURL?.startsWith('https://') ?? false,
    ...(typeof exp === 'number' ? { expires: new Date(exp * 1000) } : {}),
  })
  redirect('/profile')
}
