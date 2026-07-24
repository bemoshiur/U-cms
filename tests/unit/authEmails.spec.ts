import { describe, expect, it } from 'vitest'

import { renderForgotPasswordEmail } from '@/email/authEmails'

/**
 * Regression test for I-1 (`.superpowers/sdd/TODO/phase1-final-review.md`)
 * — CWE-640 host/reset-link poisoning. `renderForgotPasswordEmail` builds
 * the password-reset link from `req.payload.config.serverURL`; it must
 * NEVER fall back to the caller-controllable `Origin` request header, since
 * `req` here is the *caller's* request to the public
 * `POST /api/find-password` endpoint (Payload passes it straight into
 * `generateEmailHTML` — see `payload/dist/auth/operations/forgotPassword.js`).
 * An attacker who controls `Origin` must not be able to steer the host
 * embedded in a genuine reset email sent to a victim.
 */
describe('renderForgotPasswordEmail (I-1 regression)', () => {
  it('builds the reset link from config.serverURL, ignoring a spoofed Origin header', () => {
    const html = renderForgotPasswordEmail({
      req: {
        payload: {
          config: { serverURL: 'https://cms.publicpulse.com.bd' },
        },
        // A spoofed Origin header, as an attacker could send on the public
        // find-password endpoint.
        headers: new Headers({ origin: 'https://evil.example' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal PayloadRequest stub for this pure function
      } as any,
      token: 'test-token-123',
    })

    expect(html).toContain('https://cms.publicpulse.com.bd/admin/reset/test-token-123')
    expect(html).not.toContain('evil.example')
  })

  it('falls back to the PAYLOAD_PUBLIC_SERVER_URL env var (not Origin) when config.serverURL is absent', () => {
    const originalEnv = process.env.PAYLOAD_PUBLIC_SERVER_URL
    process.env.PAYLOAD_PUBLIC_SERVER_URL = 'https://fallback.example'

    try {
      const html = renderForgotPasswordEmail({
        req: {
          payload: { config: {} },
          headers: new Headers({ origin: 'https://evil.example' }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal PayloadRequest stub for this pure function
        } as any,
        token: 'test-token-456',
      })

      expect(html).toContain('https://fallback.example/admin/reset/test-token-456')
      expect(html).not.toContain('evil.example')
    } finally {
      if (originalEnv === undefined) {
        delete process.env.PAYLOAD_PUBLIC_SERVER_URL
      } else {
        process.env.PAYLOAD_PUBLIC_SERVER_URL = originalEnv
      }
    }
  })

  it('ignores the Origin header entirely, even with no req at all', () => {
    const html = renderForgotPasswordEmail({ token: 'test-token-789' })
    expect(html).not.toContain('evil.example')
  })
})
