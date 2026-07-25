import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import React from 'react'

import type { Member } from '@/payload-types'
import { getPayloadClient } from '@/site/rsc'
import { changePasswordAction, updateProfileAction } from './actions'

export const metadata = { title: 'My profile' }

/**
 * Member profile page (Task 4B). Loads the current member from the session and
 * renders an editable profile form (name / mobile / marketing opt-in) plus a
 * separate password-change form. Read-only identity fields (login ID, email,
 * status) are shown but never editable here — they are field-access-locked.
 * Anonymous visitors are redirected to login.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const requestHeaders = await headers()
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: requestHeaders })
  if (!user || user.collection !== 'members') {
    redirect('/login')
  }
  const me = user as Member
  const { saved, error } = await searchParams

  return (
    <div className="page auth">
      <h1 className="auth__title">My profile</h1>

      {saved && (
        <p className="auth__notice" role="status">
          Your changes have been saved.
        </p>
      )}
      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      <section className="profile__section" aria-labelledby="identity-heading">
        <h2 id="identity-heading">Account</h2>
        <dl>
          <dt className="field__label">Login ID</dt>
          <dd>{me.loginId}</dd>
          <dt className="field__label">Email</dt>
          <dd>{me.email}</dd>
          <dt className="field__label">Status</dt>
          <dd>{me.status}</dd>
        </dl>
      </section>

      <section className="profile__section" aria-labelledby="details-heading">
        <h2 id="details-heading">Profile details</h2>
        <form className="auth__form" action={updateProfileAction}>
          <div className="field">
            <label className="field__label" htmlFor="name">
              Name
            </label>
            <input
              className="field__input"
              id="name"
              name="name"
              type="text"
              defaultValue={me.name ?? ''}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="mobile">
              Mobile
            </label>
            <input
              className="field__input"
              id="mobile"
              name="mobile"
              type="tel"
              defaultValue={me.mobile ?? ''}
            />
          </div>
          <div className="field field--check">
            <input
              id="marketingConsent"
              name="marketingConsent"
              type="checkbox"
              value="on"
              defaultChecked={Boolean(me.marketingConsent)}
            />
            <label className="field__label" htmlFor="marketingConsent">
              Receive marketing messages
            </label>
          </div>
          <div className="auth__actions">
            <button className="button auth__submit" type="submit">
              Save changes
            </button>
          </div>
        </form>
      </section>

      <section className="profile__section" aria-labelledby="password-heading">
        <h2 id="password-heading">Change password</h2>
        <form className="auth__form" action={changePasswordAction}>
          <div className="field">
            <label className="field__label" htmlFor="currentPassword">
              Current password
            </label>
            <input
              className="field__input"
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="newPassword">
              New password
            </label>
            <input
              className="field__input"
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
            />
            <span className="field__hint">
              At least 8 characters, using at least two of: letters, numbers, symbols.
            </span>
          </div>
          <div className="auth__actions">
            <button className="button auth__submit" type="submit">
              Update password
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
