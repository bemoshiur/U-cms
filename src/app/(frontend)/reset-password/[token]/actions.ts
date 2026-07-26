'use server'

import { redirect } from 'next/navigation'

import { validateMemberPassword } from '@/auth/validateMemberPassword'
import { getPayloadClient } from '@/site/rsc'

/**
 * Member password-reset server action (Task 4B Part 2). Consumes the token from
 * the emailed reset link and sets a new password via Payload's `resetPassword`.
 * The member password policy is enforced HERE (the sanctioned member reset
 * entry point); Payload's built-in `/api/members/reset-password` route is not
 * used by the public flow (documented minor deferral — see task-4B-report.md).
 */
export async function resetPasswordAction(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  if (!token) {
    redirect('/login')
  }

  const back = (message: string) =>
    redirect(`/reset-password/${encodeURIComponent(token)}?error=` + encodeURIComponent(message))

  if (!password || password !== confirmPassword) {
    back('The two passwords do not match.')
  }
  const policy = validateMemberPassword(password)
  if (policy !== true) {
    back(policy)
  }

  const payload = await getPayloadClient()
  let errorMessage: string | undefined
  try {
    await payload.resetPassword({
      collection: 'members',
      data: { token, password },
      overrideAccess: true,
    })
  } catch {
    errorMessage = 'This reset link is invalid or has expired. Please request a new one.'
  }
  if (errorMessage) {
    back(errorMessage)
  }
  redirect('/login?registered=1')
}
