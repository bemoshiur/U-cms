import { NextResponse } from 'next/server'

/**
 * Member logout (Task 4B). A POST route handler (not `/api/*`, so never touched
 * by the admin IP guard) that clears the member auth cookie and redirects home.
 * POST-only so a cross-site GET can't force a logout. Member tokens are stateless
 * (`members.auth.useSessions: false`), so clearing the cookie fully ends the
 * session — no server-side session row to revoke.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL('/', request.url)
  const response = NextResponse.redirect(url, { status: 303 })
  // Default Payload cookie name (cookiePrefix defaults to "payload"). `secure`
  // tracks the request scheme so the clear also applies over plain HTTP.
  response.cookies.set('payload-token', '', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    expires: new Date(0),
  })
  return response
}
