'use client'

import React, { useState } from 'react'

import { branding } from '../../branding'
import {
  TWO_FACTOR_ENROLL_REQUIRED_MESSAGE,
  TWO_FACTOR_INVALID_MESSAGE,
  TWO_FACTOR_REQUIRED_MESSAGE,
} from '../../auth/twoFactorMessages'

/**
 * Branded two-step admin login form (Task 2B Part 3). Client component.
 *
 * Step 1 posts `{ email, password }` to `/api/users/login`. The server-side
 * `require2FA` gate decides what happens next and signals it back via the
 * error message (Payload surfaces a thrown `APIError.message` in `errors[]`):
 *   - success (2FA off, or user not yet enrolled) → redirect into the admin.
 *   - `TWO_FACTOR_REQUIRED_MESSAGE` → reveal the 6-digit code step; step 2
 *     re-posts `{ email, password, otp }` and the same gate verifies the code
 *     before Payload issues the session.
 * The password is re-sent with the OTP because Payload mints the real session
 * itself only when BOTH factors pass in one login call — no bespoke pre-auth
 * token or session-minting code (the safest design; see task-2B-report.md).
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

export function LoginForm({
  accountRequestEnabled,
  adminRoute,
  redirectTo,
}: LoginFormProps): React.ReactElement {
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
        window.location.assign(redirectTo)
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

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault()
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
      ) : (
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
        {loading ? 'Signing in…' : step === 'otp' ? 'Verify code' : 'Sign in'}
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
