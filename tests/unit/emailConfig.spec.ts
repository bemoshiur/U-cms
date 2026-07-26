import { describe, expect, it, vi } from 'vitest'

import {
  buildEmailAdapter,
  createDisabledEmailAdapter,
  getSmtpPort,
  resolveEmailPosture,
} from '@/email/emailConfig'

/**
 * Task TR2 Part 3 — SMTP optional in production. The Phase-1 I-2 guard used to
 * THROW at boot in prod-without-SMTP (500-ing a bare demo). The new posture
 * DISABLES email (no-op logging transport) instead, while KEEPING the original
 * protection intent: prod never silently relays through localhost. Pure logic —
 * no Payload, no network (the transport branch is asserted at the posture level
 * so no nodemailer verify/connection is triggered here).
 */

type Env = NodeJS.ProcessEnv

const base = (overrides: Record<string, string | undefined> = {}): Env => ({ ...overrides }) as Env

describe('resolveEmailPosture', () => {
  it('prod + SMTP_HOST set → real transport (unchanged)', () => {
    const posture = resolveEmailPosture(
      base({ NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com' }),
    )
    expect(posture).toEqual({
      mode: 'transport',
      host: 'smtp.example.com',
      port: 1025,
      secure: false,
    })
  })

  it('prod + SMTP_HOST UNSET → DISABLED (no throw, never localhost in prod)', () => {
    const posture = resolveEmailPosture(base({ NODE_ENV: 'production' }))
    expect(posture).toEqual({ mode: 'disabled' })
  })

  it('prod BUILD PHASE + no SMTP → transport (localhost); build is not a real runtime', () => {
    const posture = resolveEmailPosture(
      base({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }),
    )
    expect(posture.mode).toBe('transport')
    if (posture.mode === 'transport') {
      expect(posture.host).toBe('localhost')
    }
  })

  it('dev (no SMTP) → Mailpit localhost:1025 (unchanged)', () => {
    const posture = resolveEmailPosture(base({ NODE_ENV: 'development' }))
    expect(posture).toEqual({ mode: 'transport', host: 'localhost', port: 1025, secure: false })
  })

  it('dev + SMTP_HOST set → that host', () => {
    const posture = resolveEmailPosture(base({ NODE_ENV: 'development', SMTP_HOST: 'mail.local' }))
    expect(posture.mode).toBe('transport')
    if (posture.mode === 'transport') {
      expect(posture.host).toBe('mail.local')
    }
  })

  it('carries SMTP auth + secure + custom port when fully set', () => {
    const posture = resolveEmailPosture(
      base({
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_SECURE: 'true',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
      }),
    )
    expect(posture).toEqual({
      mode: 'transport',
      host: 'smtp.example.com',
      port: 587,
      secure: true,
      auth: { user: 'u', pass: 'p' },
    })
  })

  it('THROWS on partial auth (only one of USER/PASS) — genuine misconfig, unchanged', () => {
    expect(() => resolveEmailPosture(base({ SMTP_USER: 'u' }))).toThrow(/both be set together/)
    expect(() => resolveEmailPosture(base({ SMTP_PASS: 'p' }))).toThrow(/both be set together/)
  })

  it('prod + no SMTP_HOST but partial auth still THROWS (auth check precedes disable)', () => {
    expect(() => resolveEmailPosture(base({ NODE_ENV: 'production', SMTP_USER: 'u' }))).toThrow()
  })
})

describe('getSmtpPort', () => {
  it('defaults to 1025 when unset/empty and throws on an invalid value', () => {
    expect(getSmtpPort(base())).toBe(1025)
    expect(getSmtpPort(base({ SMTP_PORT: '' }))).toBe(1025)
    expect(getSmtpPort(base({ SMTP_PORT: '2525' }))).toBe(2525)
    expect(() => getSmtpPort(base({ SMTP_PORT: '0' }))).toThrow()
    expect(() => getSmtpPort(base({ SMTP_PORT: '-1' }))).toThrow()
    expect(() => getSmtpPort(base({ SMTP_PORT: 'abc' }))).toThrow()
  })
})

describe('createDisabledEmailAdapter (no-op logging transport)', () => {
  it('logs the would-be send via payload.logger and resolves WITHOUT sending', async () => {
    const warn = vi.fn()
    const adapter = createDisabledEmailAdapter(base())
    const initialized = adapter({ payload: { logger: { warn } } as never })

    expect(initialized.name).toBe('noop-disabled')

    await expect(
      initialized.sendEmail({ to: 'victim@example.com', subject: 'Reset', html: '<p>x</p>' }),
    ).resolves.toMatchObject({ skipped: true })

    expect(warn).toHaveBeenCalledTimes(1)
    // The would-be recipient/subject are logged (visible in server logs).
    expect(warn.mock.calls[0]![0]).toMatchObject({ to: 'victim@example.com', subject: 'Reset' })
  })
})

describe('buildEmailAdapter', () => {
  it('prod without SMTP resolves to the no-op adapter and does NOT throw (the regression fix)', async () => {
    const warn = vi.fn()
    const adapter = await buildEmailAdapter(base({ NODE_ENV: 'production' }))
    const initialized = adapter({ payload: { logger: { warn } } as never })
    expect(initialized.name).toBe('noop-disabled')
  })
})
