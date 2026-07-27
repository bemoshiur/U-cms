import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import { PasswordPolicyPublicNotice } from '@/components/public/PasswordPolicyPublicNotice'

/**
 * Task 7A #4 — the public password-policy guidance notice surfaced on the member
 * sign-up + profile change-password flows. RTL/jsdom are not available in this
 * project, so we call the async server component directly with a fake payload
 * and walk the returned React element tree for its text.
 */

/** Minimal payload whose `find` returns the given passwordPolicies docs. */
function fakePayload(docs: Array<{ ruleText?: string }>): Payload {
  return {
    find: async () => ({ docs }),
  } as unknown as Payload
}

/** Flattens the visible text of a React element tree (no DOM needed). */
function textOf(node: unknown): string {
  if (node == null || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('')
  }
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    return textOf((node as { props?: { children?: unknown } }).props?.children)
  }
  return ''
}

describe('PasswordPolicyPublicNotice (Task 7A #4)', () => {
  it('surfaces the active policy text when one exists', async () => {
    const el = await PasswordPolicyPublicNotice({
      payload: fakePayload([{ ruleText: 'Use at least 10 characters including a symbol.' }]),
    })
    expect(el).not.toBeNull()
    const text = textOf(el)
    expect(text).toContain('Password policy')
    expect(text).toContain('Use at least 10 characters including a symbol.')
  })

  it('renders nothing when there is no active policy', async () => {
    const el = await PasswordPolicyPublicNotice({ payload: fakePayload([]) })
    expect(el).toBeNull()
  })

  it('renders nothing (never throws) when the policy lookup fails', async () => {
    const throwing = {
      find: async () => {
        throw new Error('db down')
      },
    } as unknown as Payload
    const el = await PasswordPolicyPublicNotice({ payload: throwing })
    expect(el).toBeNull()
  })
})
