'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { MemberSignupError, submitMemberSignup } from '@/members/signup'
import { getPublicSiteId } from '@/site/config'
import { getPayloadClient } from '@/site/rsc'
import { checkPublicRateLimit } from '@/security/rateLimit'

/**
 * Member sign-up server action (Task 4B Part 2). Delegates to the security-
 * hardened {@link submitMemberSignup} (which force-sets tenant + status and never
 * reads client tenant/status/roles). Rate-limited; a corrective error is passed
 * back via the query string (React escapes it on render). On success, redirects
 * to login with a flag noting whether the account is active or awaiting approval.
 */
export async function signupAction(formData: FormData): Promise<void> {
  const payload = await getPayloadClient()
  const requestHeaders = await headers()
  const rl = checkPublicRateLimit({ headers: requestHeaders }, 'member-signup')
  if (!rl.allowed) {
    redirect('/signup?error=' + encodeURIComponent('Too many requests. Please wait a while.'))
  }

  const input = {
    loginId: formData.get('loginId'),
    email: formData.get('email'),
    name: formData.get('name'),
    mobile: formData.get('mobile'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    marketingConsent: formData.get('marketingConsent'),
    agreeService: formData.get('agreeService'),
    agreePrivacy: formData.get('agreePrivacy'),
  }

  let status: string | undefined
  let errorMessage: string | undefined
  try {
    const result = await submitMemberSignup(payload, input, { siteId: getPublicSiteId() })
    status = result.status
  } catch (e) {
    errorMessage =
      e instanceof MemberSignupError
        ? e.message
        : 'Sign-up could not be completed. Please try again.'
  }
  if (errorMessage) {
    redirect('/signup?error=' + encodeURIComponent(errorMessage))
  }
  redirect('/login?registered=' + (status === 'pending' ? 'pending' : '1'))
}
