import { authenticator } from 'otplib'
import { describe, expect, it } from 'vitest'

import {
  buildOtpauthUri,
  buildQrDataUrl,
  generateTotpSecret,
  TOTP_ISSUER,
  verifyTotp,
} from '@/auth/twoFactor'

describe('TOTP helpers (Task 2B)', () => {
  describe('generateTotpSecret', () => {
    it('produces a non-empty base32 secret, unique per call', () => {
      const a = generateTotpSecret()
      const b = generateTotpSecret()
      expect(a).toMatch(/^[A-Z2-7]+$/) // RFC 4648 base32 alphabet
      expect(a.length).toBeGreaterThanOrEqual(16)
      expect(a).not.toBe(b)
    })
  })

  describe('verifyTotp', () => {
    it('accepts the current code generated from the same secret', () => {
      const secret = generateTotpSecret()
      const token = authenticator.generate(secret)
      expect(verifyTotp(token, secret)).toBe(true)
    })

    it('rejects a wrong code', () => {
      const secret = generateTotpSecret()
      const valid = authenticator.generate(secret)
      // A guaranteed-different 6-digit code (adjacent numeric value is not in
      // the ±1 time window).
      const wrong = String((Number(valid) + 1) % 1_000_000).padStart(6, '0')
      expect(verifyTotp(wrong, secret)).toBe(false)
    })

    it('rejects empty / malformed input without throwing', () => {
      const secret = generateTotpSecret()
      expect(verifyTotp('', secret)).toBe(false)
      expect(verifyTotp('   ', secret)).toBe(false)
      expect(verifyTotp('not-a-code', secret)).toBe(false)
      expect(verifyTotp('123456', 'not-base32-$$$')).toBe(false)
    })
  })

  describe('buildOtpauthUri', () => {
    it('encodes the issuer, account label and secret', () => {
      const secret = generateTotpSecret()
      const uri = buildOtpauthUri('alice@example.com', secret)
      expect(uri.startsWith('otpauth://totp/')).toBe(true)
      expect(uri).toContain(`secret=${secret}`)
      expect(uri).toContain(`issuer=${encodeURIComponent(TOTP_ISSUER)}`)
      expect(decodeURIComponent(uri)).toContain('alice@example.com')
    })
  })

  describe('buildQrDataUrl', () => {
    it('renders an otpauth URI to a PNG data URL', async () => {
      const secret = generateTotpSecret()
      const uri = buildOtpauthUri('bob@example.com', secret)
      const dataUrl = await buildQrDataUrl(uri)
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
      expect(dataUrl.length).toBeGreaterThan(100)
    })
  })
})
