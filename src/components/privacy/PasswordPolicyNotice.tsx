import type { Payload } from 'payload'
import React from 'react'

import { activePasswordPolicyText } from '@/collections/PasswordPolicies'

/**
 * Password-policy guidance notice (Task 6C Part 1; legacy ref 3-9). A SERVER
 * component mounted on the admin `users` document (create/edit) view via
 * `admin.components.edit.beforeDocumentControls` — the password-change surface
 * where an admin account's password is set. It DISPLAYS the current active
 * policy text (the most-recently-created active `passwordPolicies` version, the
 * same one the management view surfaces) so the composition guidance travels
 * with the password field.
 *
 * This is DISPLAY only. The rules actually enforced are fixed in code
 * (`src/auth/validatePassword.ts`); editing the policy text changes what is
 * shown here, not what is rejected — the Task 1D code-enforces / text-displays
 * split. Renders nothing when no active policy exists (nothing to show) or when
 * payload is unavailable.
 */

type NoticeProps = {
  payload?: Payload
}

export async function PasswordPolicyNotice(props: NoticeProps): Promise<React.ReactElement | null> {
  const payload = props.payload
  if (!payload) {
    return null
  }

  let text: string | null = null
  try {
    text = await activePasswordPolicyText(payload)
  } catch {
    text = null
  }
  if (!text) {
    return null
  }

  return (
    <aside
      style={{
        margin: '0 0 1rem',
        padding: '.75rem 1rem',
        border: '1px solid var(--theme-elevation-150, #d4d4d8)',
        borderLeft: '4px solid var(--theme-success-500, #198038)',
        borderRadius: 6,
        background: 'var(--theme-elevation-50, #fafafa)',
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Password composition rule</div>
      <div style={{ whiteSpace: 'pre-wrap', color: 'var(--theme-elevation-700, #3f3f46)' }}>
        {text}
      </div>
    </aside>
  )
}

export default PasswordPolicyNotice
