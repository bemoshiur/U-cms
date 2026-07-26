'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { TypedUser } from 'payload'

import { getPayloadClient } from '@/site/rsc'

/**
 * Member profile server actions (Task 4B Part 2). A logged-in member may change
 * name / mobile / marketingConsent and (separately, with re-auth) their password
 * — NEVER status, tenant, or loginId. Those fields carry field-level access
 * gated on `members.manage`, so the update runs with the member as `user` +
 * `overrideAccess: false`; even an injected `status`/`tenant`/`loginId` is
 * stripped. Two distinct forms/actions so saving one never clobbers the other.
 */

/** Resolves the current member from the session, or redirects to login. */
async function requireMember(): Promise<TypedUser> {
  const payload = await getPayloadClient()
  const requestHeaders = await headers()
  const { user } = await payload.auth({ headers: requestHeaders })
  if (!user || user.collection !== 'members') {
    redirect('/login')
  }
  return user
}

/** Updates name / mobile / marketing opt-in (never privilege fields). */
export async function updateProfileAction(formData: FormData): Promise<void> {
  const user = await requireMember()
  const payload = await getPayloadClient()

  const name = String(formData.get('name') ?? '').trim()
  const mobile = String(formData.get('mobile') ?? '').trim()
  const marketingConsent = formData.get('marketingConsent') === 'on'
  if (!name) {
    redirect('/profile?error=' + encodeURIComponent('Name is required.'))
  }

  let errorMessage: string | undefined
  try {
    await payload.update({
      collection: 'members',
      id: user.id,
      data: { name, mobile: mobile || null, marketingConsent },
      user,
      overrideAccess: false,
    })
  } catch (e) {
    errorMessage = (e as { message?: string })?.message ?? 'Could not save your changes.'
  }
  if (errorMessage) {
    redirect('/profile?error=' + encodeURIComponent(errorMessage))
  }
  redirect('/profile?saved=1')
}

/** Changes the member password after re-authenticating with the current one. */
export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await requireMember()
  const payload = await getPayloadClient()

  const currentPassword = String(formData.get('currentPassword') ?? '')
  const newPassword = String(formData.get('newPassword') ?? '')
  if (!newPassword) {
    redirect('/profile?error=' + encodeURIComponent('A new password is required.'))
  }

  let reauthOk = false
  try {
    await payload.login({
      collection: 'members',
      data: { email: (user as { email: string }).email, password: currentPassword },
    })
    reauthOk = true
  } catch {
    reauthOk = false
  }
  if (!reauthOk) {
    redirect('/profile?error=' + encodeURIComponent('Your current password is incorrect.'))
  }

  let errorMessage: string | undefined
  try {
    await payload.update({
      collection: 'members',
      id: user.id,
      data: { password: newPassword },
      user,
      overrideAccess: false,
    })
  } catch (e) {
    errorMessage = (e as { message?: string })?.message ?? 'Could not change your password.'
  }
  if (errorMessage) {
    redirect('/profile?error=' + encodeURIComponent(errorMessage))
  }
  redirect('/profile?saved=1')
}
