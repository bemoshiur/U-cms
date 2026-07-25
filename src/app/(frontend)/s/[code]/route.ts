import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { handleShortUrlRedirect } from '../../../../endpoints/shortUrlRedirect'

/**
 * Public short-URL redirect at the pretty path `GET /s/:code` (Task 3D Part 3;
 * refs 1-42/1-43). Lives in the `(frontend)` route group, so it is OUTSIDE the
 * proxy `matcher` (`/admin/*`, `/api/*`) and therefore never IP-guarded — it is
 * public by construction (an anonymous visitor must be able to follow a short
 * link). Delegates to the shared, re-validating core so the same redirect logic
 * backs this route and the `/api/s/:code` config endpoint. Never an open
 * redirect: the core re-validates the stored target before issuing the 302.
 */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> => {
  const { code } = await params
  const payload = await getPayload({ config: configPromise })
  return handleShortUrlRedirect({ payload, code })
}
