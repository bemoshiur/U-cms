import type { Payload } from 'payload'
import React from 'react'

import { activePasswordPolicyText } from '@/collections/PasswordPolicies'

/**
 * Public-site password-policy guidance notice (Task 7A #4). Surfaces the same
 * active `passwordPolicies` text the admin `users` edit view shows
 * (`PasswordPolicyNotice`) on the PUBLIC password-entry flows where a member
 * SETS a password — sign-up and profile password-change — so the published
 * composition guidance travels with the password field there too, not only in
 * the admin panel.
 *
 * DISPLAY only (the code-enforces / text-displays split, Task 1D): what is
 * actually rejected lives in `src/auth/validateMemberPassword.ts`; this shows the
 * site's published policy text. Renders nothing when no active policy exists.
 *
 * `payload` is optional: the public RSC pages pass their already-resolved client;
 * when omitted the component lazy-loads it (so it can be dropped in anywhere).
 * Passing the client explicitly keeps it unit-testable without pulling Next.
 */
export async function PasswordPolicyPublicNotice({
  payload,
}: {
  payload?: Payload
}): Promise<React.ReactElement | null> {
  let client = payload
  if (!client) {
    try {
      const { getPayloadClient } = await import('@/site/rsc')
      client = await getPayloadClient()
    } catch {
      return null
    }
  }

  let text: string | null = null
  try {
    text = await activePasswordPolicyText(client)
  } catch {
    text = null
  }
  if (!text) {
    return null
  }

  return (
    <aside
      className="auth__policy"
      role="note"
      aria-label="Password policy"
      style={{
        margin: '0 0 1rem',
        padding: '.6rem .8rem',
        borderLeft: '4px solid currentColor',
        borderRadius: 4,
        fontSize: 13,
        lineHeight: 1.5,
        opacity: 0.85,
      }}
    >
      <strong className="auth__policy-title" style={{ display: 'block', marginBottom: 2 }}>
        Password policy
      </strong>
      <span className="auth__policy-text" style={{ whiteSpace: 'pre-wrap' }}>
        {text}
      </span>
    </aside>
  )
}

export default PasswordPolicyPublicNotice
