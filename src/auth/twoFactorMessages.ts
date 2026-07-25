/**
 * Sentinel strings shared between the server-side 2FA login gate (`require2FA`
 * in `twoFactorHooks.ts`) and the browser login form (`LoginForm.tsx`).
 *
 * Kept in their own dependency-free module (no `otplib`/`qrcode`/`payload`
 * imports) precisely so the CLIENT login form can import the message strings
 * without pulling the TOTP/crypto libraries into the browser bundle. Payload
 * surfaces a thrown `APIError.message` in the login response's `errors[]`
 * array, so these strings are the machine-readable protocol the form matches
 * on to decide whether to reveal the code step or show an error.
 */
export const TWO_FACTOR_REQUIRED_MESSAGE = 'A one-time authentication code is required.'
export const TWO_FACTOR_INVALID_MESSAGE = 'The one-time authentication code is incorrect.'
export const TWO_FACTOR_ENROLL_REQUIRED_MESSAGE =
  'Two-factor authentication must be set up before you can sign in.'
