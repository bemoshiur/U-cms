'use client'

import React, { useState } from 'react'

import { branding } from '../../branding'
import {
  TWO_FACTOR_ENROLL_REQUIRED_MESSAGE,
  TWO_FACTOR_INVALID_MESSAGE,
  TWO_FACTOR_LOCKED_MESSAGE,
  TWO_FACTOR_REQUIRED_MESSAGE,
} from '../../auth/twoFactorMessages'

/**
 * Branded three-step admin login form (Task 2B Part 3; enrolment UI added in
 * the Audit Fix 1 pass). Client component.
 *
 * Step 1 posts `{ email, password }` to `/api/users/login`. The server-side
 * `require2FA` gate decides what happens next and signals it back via the
 * error message (Payload surfaces a thrown `APIError.message` in `errors[]`):
 *   - success → the meaning depends on whether this was a plain password
 *     submission or the OTP-verification submission (see below).
 *   - `TWO_FACTOR_REQUIRED_MESSAGE` → reveal the 6-digit code step; step 2
 *     re-posts `{ email, password, otp }` and the same gate verifies the code
 *     before Payload issues the session.
 * The password is re-sent with the OTP because Payload mints the real session
 * itself only when BOTH factors pass in one login call — no bespoke pre-auth
 * token or session-minting code (the safest design; see task-2B-report.md).
 *
 * `require2FA` lets a password-only login through even when the site
 * requires 2FA, as long as the account has not yet enrolled a device (ref
 * 1-6: the QR must be shown once on first login) — the resulting session is
 * then CONFINED server-side (`isTwoFactorEnrolmentConfined`) until enrolment
 * completes. So after a successful *password-only* login (never after the
 * OTP-verification submission, which only ever succeeds for an
 * already-enrolled account) this form speculatively calls
 * `POST /api/2fa/enroll`. That endpoint is safe to call unconditionally: it
 * no-ops (400) when the site doesn't require 2FA, no-ops (`alreadyEnrolled`)
 * when the account is already enrolled, and only returns a QR + secret when
 * enrolment is genuinely required — which is exactly the signal this form
 * needs to reveal the `'enroll'` step instead of redirecting into a confined
 * session with no way to complete setup through the browser.
 */

type LoginFormProps = {
  accountRequestEnabled: boolean
  adminRoute: string
  redirectTo: string
}

type LoginResponse = {
  user?: unknown
  errors?: { message?: string }[]
  message?: string
}

type EnrollResponse = {
  ok?: boolean
  alreadyEnrolled?: boolean
  qrDataUrl?: string
  secret?: string
  message?: string
}

type VerifyEnrollResponse = {
  ok?: boolean
  message?: string
}

export function LoginForm({
  accountRequestEnabled,
  adminRoute,
  redirectTo,
}: LoginFormProps): React.ReactElement {
  const [step, setStep] = useState<'credentials' | 'otp' | 'enroll'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [enrollQrDataUrl, setEnrollQrDataUrl] = useState<string | null>(null)
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null)
  const [enrollCode, setEnrollCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /**
   * Speculatively checks whether the just-logged-in (password-only) session
   * still needs to enrol a 2FA device, and reveals the `'enroll'` step if so.
   * Called only after a successful password-only login — see the file-level
   * comment for why this is safe to call unconditionally.
   */
  async function checkEnrollmentThenRedirect(): Promise<void> {
    try {
      const res = await fetch('/api/2fa/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })

      if (res.status === 400) {
        // Two-factor authentication is not enabled for this site.
        window.location.assign(redirectTo)
        return
      }

      const data = (await res.json().catch(() => ({}))) as EnrollResponse

      if (data.ok && data.alreadyEnrolled) {
        // Defensive — shouldn't normally be reachable from this step, since an
        // already-enrolled account would have hit the OTP step instead.
        window.location.assign(redirectTo)
        return
      }

      if (data.ok && data.qrDataUrl) {
        setEnrollQrDataUrl(data.qrDataUrl)
        setEnrollSecret(typeof data.secret === 'string' ? data.secret : null)
        setStep('enroll')
        return
      }

      // Any other/error response — don't redirect into a broken confined
      // session; let the admin retry the login instead.
      setError('Unable to start two-factor enrolment. Please try again.')
    } catch {
      setError('A network error occurred while starting two-factor enrolment. Please try again.')
    }
  }

  async function attemptLogin(includeOtp: boolean): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(includeOtp ? { otp: otp.trim() } : {}),
        }),
      })
      const data = (await res.json().catch(() => ({}))) as LoginResponse

      if (res.ok && data.user) {
        if (includeOtp) {
          // This was the OTP-verification step — only ever succeeds for an
          // already-enrolled admin. Redirect immediately, as today.
          window.location.assign(redirectTo)
          return
        }
        // Password-only success: before redirecting, check whether this
        // account still needs to enrol a 2FA device.
        await checkEnrollmentThenRedirect()
        return
      }

      const message = data.errors?.[0]?.message || data.message || 'Unable to sign in.'

      if (message === TWO_FACTOR_REQUIRED_MESSAGE) {
        setStep('otp')
        setError(null)
        return
      }
      if (message === TWO_FACTOR_INVALID_MESSAGE) {
        setStep('otp')
        setError('That code is not valid. Check your authenticator app and try again.')
        return
      }
      if (message === TWO_FACTOR_LOCKED_MESSAGE) {
        setStep('otp')
        setError(message)
        return
      }
      if (message === TWO_FACTOR_ENROLL_REQUIRED_MESSAGE) {
        setError(message)
        return
      }
      setError(message)
    } catch {
      setError('A network error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function submitEnrollCode(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/2fa/verify-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: enrollCode.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as VerifyEnrollResponse

      if (res.ok && data.ok) {
        // Enrolment confirmed — the session is now fully enrolled + confirmed;
        // confinement lifts on the next request.
        window.location.assign(redirectTo)
        return
      }

      // Keep the QR/secret in place (the enroll endpoint reuses the same
      // unconfirmed secret) so the admin can simply retry the code.
      setError(
        data.message || 'That code is not valid. Check your authenticator app and try again.',
      )
    } catch {
      setError('A network error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault()
    if (step === 'enroll') {
      void submitEnrollCode()
      return
    }
    void attemptLogin(step === 'otp')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    marginTop: 6,
    border: '1px solid var(--theme-elevation-150, #d4d4d8)',
    borderRadius: 4,
    background: 'var(--theme-input-bg, #fff)',
    color: 'var(--theme-elevation-800, #18181b)',
    boxSizing: 'border-box',
    fontSize: 15,
  }
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 16, fontSize: 14 }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 360, margin: '0 auto', width: '100%' }}>
      {step === 'credentials' ? (
        <React.Fragment>
          <label style={labelStyle} htmlFor="field-email">
            Email
            <input
              id="field-email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle} htmlFor="field-password">
            Password
            <input
              id="field-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </label>
        </React.Fragment>
      ) : step === 'otp' ? (
        <label style={labelStyle} htmlFor="field-otp">
          Authentication code
          <input
            id="field-otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            style={inputStyle}
          />
          <span style={{ display: 'block', marginTop: 6, fontSize: 13, opacity: 0.75 }}>
            Enter the 6-digit code from your authenticator app.
          </span>
        </label>
      ) : (
        <div>
          <h2
            style={{
              fontSize: 17,
              margin: '0 0 6px',
              color: 'var(--theme-elevation-800, #18181b)',
            }}
          >
            Set up two-factor authentication
          </h2>
          <p style={{ fontSize: 14, opacity: 0.85, margin: '0 0 16px' }}>
            This site requires a second sign-in factor. Scan the QR code below with an authenticator
            app, then enter the 6-digit code it shows to finish setup.
          </p>

          {enrollQrDataUrl ? (
            <img
              src={enrollQrDataUrl}
              alt="Scan with your authenticator app"
              style={{
                display: 'block',
                width: 200,
                height: 200,
                maxWidth: '100%',
                margin: '0 auto 16px',
                border: '1px solid var(--theme-elevation-150, #d4d4d8)',
                borderRadius: 4,
              }}
            />
          ) : null}

          {enrollSecret ? (
            <p style={{ fontSize: 13, margin: '0 0 16px' }}>
              Or enter this key manually:
              <br />
              <code
                id="enroll-secret"
                style={{
                  display: 'inline-block',
                  marginTop: 4,
                  padding: '4px 8px',
                  background: 'var(--theme-elevation-100, #f4f4f5)',
                  borderRadius: 4,
                  fontSize: 13,
                  wordBreak: 'break-all',
                }}
              >
                {enrollSecret}
              </code>
            </p>
          ) : null}

          <p style={{ fontSize: 13, margin: '0 0 16px' }}>
            <a
              href="/api/2fa/guide"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: branding.colors.primaryDark }}
            >
              How do I install Google Authenticator?
            </a>
          </p>

          <label style={labelStyle} htmlFor="field-enroll-code">
            Authentication code
            <input
              id="field-enroll-code"
              name="enrollCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              autoFocus
              required
              value={enrollCode}
              onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ''))}
              style={inputStyle}
            />
            <span style={{ display: 'block', marginTop: 6, fontSize: 13, opacity: 0.75 }}>
              Enter the 6-digit code from your authenticator app.
            </span>
          </label>
        </div>
      )}

      {error ? (
        <p role="alert" style={{ color: branding.colors.error, fontSize: 14, marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%',
          padding: '11px 16px',
          border: 'none',
          borderRadius: 4,
          background: branding.colors.primary,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading
          ? step === 'enroll'
            ? 'Verifying…'
            : 'Signing in…'
          : step === 'otp'
            ? 'Verify code'
            : step === 'enroll'
              ? 'Confirm & finish setup'
              : 'Sign in'}
      </button>

      {step === 'otp' ? (
        <button
          type="button"
          onClick={() => {
            setStep('credentials')
            setOtp('')
            setError(null)
          }}
          style={{
            width: '100%',
            marginTop: 10,
            padding: '8px',
            border: 'none',
            background: 'none',
            color: 'var(--theme-elevation-600, #52525b)',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Back
        </button>
      ) : step === 'enroll' ? (
        <a
          href={`${adminRoute}/logout`}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 10,
            padding: '8px',
            textAlign: 'center',
            color: 'var(--theme-elevation-600, #52525b)',
            fontSize: 14,
          }}
        >
          Log out
        </a>
      ) : (
        <nav
          style={{
            marginTop: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            textAlign: 'center',
            fontSize: 14,
          }}
        >
          <a href={`${adminRoute}/forgot`} style={{ color: branding.colors.primaryDark }}>
            Forgot your password?
          </a>
          <a href={`${adminRoute}/find-id`} style={{ color: branding.colors.primaryDark }}>
            Find your ID
          </a>
          {accountRequestEnabled ? (
            <a
              href={`${adminRoute}/account-request`}
              style={{ color: branding.colors.primaryDark }}
            >
              Request an account
            </a>
          ) : null}
        </nav>
      )}
    </form>
  )
}

export default LoginForm
