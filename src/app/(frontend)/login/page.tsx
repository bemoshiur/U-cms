import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import { getCurrentMember } from '@/site/member'
import { loginAction } from './actions'

export const metadata = { title: 'Log in' }

const ERROR_MESSAGES: Record<string, string> = {
  '1': 'Incorrect login ID / email or password, or your account is not active.',
  rate: 'Too many attempts. Please wait a while before trying again.',
}

/**
 * Member login page (Task 4B). A no-JS `<form>` posting to the {@link loginAction}
 * server action. Already logged-in members are bounced to their profile.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; registered?: string }>
}) {
  const member = await getCurrentMember()
  if (member) {
    redirect('/profile')
  }
  const { error, registered } = await searchParams

  return (
    <div className="page auth">
      <h1 className="auth__title">Log in</h1>
      <p className="auth__lead">Sign in to your member account.</p>

      {registered && (
        <p className="auth__notice" role="status">
          {registered === 'pending'
            ? 'Your account was created and is awaiting administrator approval. You can log in once it is approved.'
            : 'Your account was created. You can now log in.'}
        </p>
      )}
      {error && ERROR_MESSAGES[error] && (
        <p className="auth__error" role="alert">
          {ERROR_MESSAGES[error]}
        </p>
      )}

      <form className="auth__form" action={loginAction}>
        <div className="field">
          <label className="field__label" htmlFor="identifier">
            Login ID or email
          </label>
          <input
            className="field__input"
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
          />
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
            autoComplete="current-password"
            required
          />
        </div>
        <div className="auth__actions">
          <button className="button auth__submit" type="submit">
            Log in
          </button>
        </div>
      </form>

      <p className="auth__alt">
        Don&rsquo;t have an account? <Link href="/signup">Sign up</Link>
        {' · '}
        <Link href="/recover">Forgot your ID or password?</Link>
      </p>
    </div>
  )
}
