'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { MemberAskError, submitMemberQuestion } from '@/members/ask'
import { checkPublicRateLimit } from '@/security/rateLimit'
import { getCurrentMember } from '@/site/member'
import { getPayloadClient } from '@/site/rsc'

/**
 * Member Q&A "ask" server action (Task 4C Part 3). Reads only `title`/`content`
 * from the form and delegates to the security-hardened {@link submitMemberQuestion}
 * (which server-forces board/tenant/author and never sets isNotice/isSecret/
 * answer). Requires a member session, is rate-limited, and passes a corrective
 * error back via the query string (React escapes it on render). `bbsId` comes
 * from a hidden field — safe because `submitMemberQuestion` independently
 * verifies the board is a userPost-enabled Q&A board on the MEMBER's own site.
 */
export async function askQuestionAction(formData: FormData): Promise<void> {
  const bbsId = String(formData.get('bbsId') ?? '')
  const boardPath = `/board/${encodeURIComponent(bbsId)}`

  const member = await getCurrentMember()
  if (!member) {
    redirect('/login?next=' + encodeURIComponent(boardPath))
  }

  const requestHeaders = await headers()
  const rl = checkPublicRateLimit({ headers: requestHeaders }, 'member-ask')
  if (!rl.allowed) {
    redirect(
      `${boardPath}?askError=` + encodeURIComponent('Too many requests. Please wait a while.'),
    )
  }

  const payload = await getPayloadClient()
  let errorMessage: string | undefined
  try {
    await submitMemberQuestion(
      payload,
      { title: formData.get('title'), content: formData.get('content') },
      { member, bbsId },
    )
  } catch (e) {
    errorMessage =
      e instanceof MemberAskError
        ? e.message
        : 'Your question could not be posted. Please try again.'
  }
  if (errorMessage) {
    redirect(`${boardPath}?askError=` + encodeURIComponent(errorMessage))
  }
  redirect(`${boardPath}?asked=1`)
}
