import { redirect } from 'next/navigation'
import type { PayloadRequest } from 'payload'
import React from 'react'

import { safeRedirect } from '@/security/safeRedirect'

import { Logo } from '../branding/Logo'
import { LoginForm } from './LoginForm'

/**
 * Custom admin login view (Task 2B Part 3), registered as
 * `admin.components.views.login` in `src/payload.config.ts`. Server component:
 * it receives the same `initPageResult` server props Payload hands its built-in
 * login view, redirects an already-authenticated visitor, resolves the
 * per-site "account applications enabled" toggle (ref 1-1), and renders the
 * branded two-step client form.
 *
 * The 2FA ENFORCEMENT is NOT here — it is the server-side `require2FA`
 * `beforeLogin` gate on the `users` collection. This view only provides the UI
 * that lets a user supply the OTP as a second step, plus the conditional
 * Account-Request / Find-ID / Find-PW links.
 */

type LoginViewProps = {
  initPageResult?: {
    req?: PayloadRequest
  }
  searchParams?: Record<string, string | string[] | undefined>
}

export async function LoginView(props: LoginViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const adminRoute = payload?.config?.routes?.admin || '/admin'

  if (req?.user) {
    redirect(safeRedirect(props.searchParams?.redirect, adminRoute))
  }

  let accountRequestEnabled = false
  if (payload) {
    try {
      const found = await payload.find({
        collection: 'sites',
        where: {
          and: [{ isAdminSite: { equals: true } }, { accountApplicationEnabled: { equals: true } }],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      accountRequestEnabled = found.docs.length > 0
    } catch {
      accountRequestEnabled = false
    }
  }

  return (
    <React.Fragment>
      <div className="login__brand" style={{ display: 'flex', justifyContent: 'center' }}>
        <Logo />
      </div>
      <LoginForm
        accountRequestEnabled={accountRequestEnabled}
        adminRoute={adminRoute}
        redirectTo={safeRedirect(props.searchParams?.redirect, adminRoute)}
      />
    </React.Fragment>
  )
}

export default LoginView
