import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import { getCurrentMember } from '@/site/member'
import { PasswordPolicyPublicNotice } from '@/components/public/PasswordPolicyPublicNotice'
import { signupAction } from './actions'

export const metadata = { title: 'Sign up' }

/**
 * Member sign-up page (Task 4B). No-JS `<form>` posting to {@link signupAction}.
 * The two required terms agreements are `required` checkboxes; the marketing
 * opt-in is optional. Already logged-in members are bounced to their profile.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const member = await getCurrentMember()
  if (member) {
    redirect('/profile')
  }
  const { error } = await searchParams

  return (
    <div className="page auth">
      <h1 className="auth__title">Create your account</h1>
      <p className="auth__lead">Sign up to become a member of this site.</p>

      {error && (
        <p className="auth__error" role="alert">
          {error}
        </p>
      )}

      <form className="auth__form" action={signupAction}>
        <div className="field">
          <label className="field__label" htmlFor="loginId">
            Login ID
          </label>
          <input
            className="field__input"
            id="loginId"
            name="loginId"
            type="text"
            autoComplete="username"
            required
          />
          <span className="field__hint">
            At least 4 characters: lowercase letters, digits, and . _ - (unique on this site).
          </span>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="email">
            Email
          </label>
          <input
            className="field__input"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="name">
            Name
          </label>
          <input className="field__input" id="name" name="name" type="text" required />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="mobile">
            Mobile (optional)
          </label>
          <input className="field__input" id="mobile" name="mobile" type="tel" autoComplete="tel" />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="password">
            Password
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
            Confirm password
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

        {/* Task 7A #4: surface the published password policy on this set-password flow. */}
        <PasswordPolicyPublicNotice />

        <div className="field field--check">
          <input id="agreeService" name="agreeService" type="checkbox" value="on" required />
          <label className="field__label" htmlFor="agreeService">
            I agree to the{' '}
            <Link href="/terms/termsOfUse" target="_blank" rel="noopener">
              Terms of Use
            </Link>{' '}
            (required)
          </label>
        </div>
        <div className="field field--check">
          <input id="agreePrivacy" name="agreePrivacy" type="checkbox" value="on" required />
          <label className="field__label" htmlFor="agreePrivacy">
            I agree to the{' '}
            <Link href="/terms/personalInfoProcessing" target="_blank" rel="noopener">
              Privacy Policy
            </Link>{' '}
            (required)
          </label>
        </div>
        <div className="field field--check">
          <input id="marketingConsent" name="marketingConsent" type="checkbox" value="on" />
          <label className="field__label" htmlFor="marketingConsent">
            I agree to receive marketing messages (optional)
          </label>
        </div>

        <div className="auth__actions">
          <button className="button auth__submit" type="submit">
            Sign up
          </button>
        </div>
      </form>

      <p className="auth__alt">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </div>
  )
}
