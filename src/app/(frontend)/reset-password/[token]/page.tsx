import React from 'react'

import { resetPasswordAction } from './actions'

export const metadata = { title: 'Reset your password' }

/**
 * Member password-reset page (Task 4B). Rendered from the emailed link
 * `/reset-password/<token>`; a no-JS form posting the token + new password to the
 * {@link resetPasswordAction} server action.
 */
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const { error } = await searchParams

  return (
    <div className="page auth">
      <h1 className="auth__title">Reset your password</h1>
      <p className="auth__lead">Choose a new password for your member account.</p>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      <form className="auth__form" action={resetPasswordAction}>
        <input type="hidden" name="token" value={token} />
        <div className="field">
          <label className="field__label" htmlFor="password">
            New password
          </label>
          <input
            className="field__input"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
          <span className="field__hint">
            At least 8 characters, using at least two of: letters, numbers, symbols.
          </span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="confirmPassword">
            Confirm new password
          </label>
          <input
            className="field__input"
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="auth__actions">
          <button className="button auth__submit" type="submit">
            Set new password
          </button>
        </div>
      </form>
    </div>
  )
}
