import Link from 'next/link'
import React from 'react'

import { findIdAction, findPasswordAction } from './actions'

export const metadata = { title: 'Recover your account' }

/**
 * Member ID / password recovery page (Task 4B). Two no-JS forms posting to the
 * recovery server actions. The response is always generic (a member is never
 * told whether an account matched), shown via the `done` flag.
 */
export default async function RecoverPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>
}) {
  const { done } = await searchParams

  return (
    <div className="page auth">
      <h1 className="auth__title">Recover your account</h1>

      {done && (
        <p className="auth__notice" role="status">
          {done === 'id'
            ? 'If an active member matches the name and email provided, its login ID has been emailed to that address.'
            : 'If an active member matches the details provided, a password reset link has been emailed to that address.'}
        </p>
      )}

      <section className="profile__section" aria-labelledby="find-id-heading">
        <h2 id="find-id-heading">Find your login ID</h2>
        <form className="auth__form" action={findIdAction}>
          <div className="field">
            <label className="field__label" htmlFor="fid-name">
              Name
            </label>
            <input className="field__input" id="fid-name" name="name" type="text" required />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="fid-email">
              Email
            </label>
            <input className="field__input" id="fid-email" name="email" type="email" required />
          </div>
          <div className="auth__actions">
            <button className="button auth__submit" type="submit">
              Email my login ID
            </button>
          </div>
        </form>
      </section>

      <section className="profile__section" aria-labelledby="find-pw-heading">
        <h2 id="find-pw-heading">Reset your password</h2>
        <form className="auth__form" action={findPasswordAction}>
          <div className="field">
            <label className="field__label" htmlFor="fpw-loginId">
              Login ID (optional)
            </label>
            <input className="field__input" id="fpw-loginId" name="loginId" type="text" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="fpw-email">
              Email
            </label>
            <input className="field__input" id="fpw-email" name="email" type="email" required />
          </div>
          <div className="auth__actions">
            <button className="button auth__submit" type="submit">
              Email a reset link
            </button>
          </div>
        </form>
      </section>

      <p className="auth__alt">
        <Link href="/login">Back to login</Link>
      </p>
    </div>
  )
}
