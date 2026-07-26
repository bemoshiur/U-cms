import type { Payload, PayloadRequest } from 'payload'

import { toRelationId } from '../collections/utils'
import { resolveActorLabel, resolveIpAddress } from './helpers'

/**
 * The personal-info audit actions (feature-inventory ref 3-8 열람형태 / 1-36).
 * Legacy shows `열람` (view) and the edit-form open (`수정`); export is the
 * Excel-download event that ref 1-36 / 3-8 also record in this same log.
 */
export type PersonalInfoAction = 'view' | 'edit' | 'export'

/**
 * The view-purpose categories (ref 3-8 열람목적구분). The manual OBSERVES only
 * two values — `개인정보(조회)` (inquiry) and `개인정보(수정)` (modification) —
 * mapped here to `view`/`edit`; `export` is the ref-1-36 download-purpose. The
 * remaining three (`inquiry_response`/`complaint_handling`/`other`) are the
 * common operational reasons a privacy officer records when the touch isn't a
 * plain view/edit (documented in task-6A-report.md as additions beyond the two
 * legacy-observed categories). `other` expects a free `purposeDetail`.
 */
export type PersonalInfoPurposeCategory =
  'view' | 'edit' | 'export' | 'inquiry_response' | 'complaint_handling' | 'other'

/** A minimal shape of the member (PII subject) whose record was touched. */
export type SubjectMemberLike = {
  id?: unknown
  name?: unknown
  loginId?: unknown
  email?: unknown
  tenant?: unknown
}

export type RecordPersonalInfoAccessArgs = {
  /** The admin who accessed the PII; defaults to `req.user`. */
  viewer?: unknown
  /**
   * The member (PII subject). Either a populated member doc/shape OR an
   * explicit label + ids (for a bulk export where there is no single subject).
   */
  subjectMember?: SubjectMemberLike | null
  /** Overrides the derived subject label (e.g. "(bulk member export)"). */
  subjectLabel?: string
  /** Overrides the derived subject member id (e.g. "*" for a bulk export). */
  subjectMemberId?: string
  /** Overrides the derived subject site id (e.g. the export's tenant filter). */
  subjectSiteId?: string
  /** Which admin screen produced the access (e.g. "member-detail", "member-list-export"). */
  screen: string
  /** The request URL/path; defaults to `req.pathname`. */
  url?: string
  action: PersonalInfoAction
  /** The purpose category; defaults to the action when omitted. */
  purposeCategory?: PersonalInfoPurposeCategory
  /** The free-text reason (required by the export purpose-modal; ref 1-36 열람목적). */
  purposeDetail?: string
  /** Explicit client IP (else derived from `req`). */
  ipAddress?: string
  /** The originating request (optional; every derived field degrades safely). */
  req?: PayloadRequest
}

/** Builds the denormalized `name(loginId)` label for a member (PII subject). */
export function resolveSubjectLabel(
  subject: SubjectMemberLike | null | undefined,
): string | undefined {
  if (!subject || typeof subject !== 'object') {
    return undefined
  }
  const name =
    typeof subject.name === 'string' && subject.name.trim() ? subject.name.trim() : undefined
  const idToken =
    (typeof subject.loginId === 'string' && subject.loginId ? subject.loginId : undefined) ??
    (typeof subject.email === 'string' && subject.email ? subject.email : undefined) ??
    (subject.id !== undefined && subject.id !== null ? String(subject.id) : undefined)
  if (name && idToken) {
    return `${name}(${idToken})`
  }
  return name ?? idToken ?? undefined
}

/**
 * Writes one `personalInfoAccessLogs` row (Task 6A; refs 3-8, 1-36) — the CORE
 * of the privacy subsystem: EVERY touch of a member's personal information
 * produces one immutable audit row (who viewed/edited/exported whose PII, on
 * which screen/URL, for what purpose, from which IP, when).
 *
 * ## Contract: the audit must NEVER break the audited action
 *
 * Same two guarantees as `recordAccess` (see its doc comment):
 *  1. try/catch swallows every failure (the caller never sees a throw), and
 *  2. the write deliberately does NOT pass the caller's `req` to
 *     `payload.create`, so it runs in its OWN transaction on a separate
 *     connection — an `afterRead`/`afterChange` audit INSERT that shared the
 *     audited operation's transaction and failed would abort that transaction
 *     and break the very read/edit it audits. `personalInfoAccessLogs` shares no
 *     rows with `members`, so there is no lock/deadlock interaction. Identity is
 *     stored as denormalized TEXT (`viewerLabel`/`subjectLabel` + text ids),
 *     never an FK — the same deadlock lesson `accessLogs`/`errorLogs` learned.
 */
export async function recordPersonalInfoAccess(
  payload: Payload,
  args: RecordPersonalInfoAccessArgs,
): Promise<void> {
  try {
    const viewer = args.viewer ?? args.req?.user ?? undefined
    const viewerRawId = viewer ? toRelationId(viewer) : undefined

    const subject = args.subjectMember ?? undefined
    const subjectRawId = subject ? toRelationId(subject.id) : undefined
    const subjectTenantId = subject ? toRelationId(subject.tenant) : undefined
    const subjectSiteId =
      args.subjectSiteId ?? (subjectTenantId !== undefined ? String(subjectTenantId) : undefined)

    await payload.create({
      collection: 'personalInfoAccessLogs',
      data: {
        viewerLabel: resolveActorLabel(viewer),
        viewerId: viewerRawId !== undefined ? String(viewerRawId) : undefined,
        subjectLabel: args.subjectLabel ?? resolveSubjectLabel(subject),
        subjectMemberId:
          args.subjectMemberId ?? (subjectRawId !== undefined ? String(subjectRawId) : undefined),
        subjectSiteId,
        screen: args.screen,
        url: args.url ?? args.req?.pathname ?? '(local-api)',
        action: args.action,
        purposeCategory: args.purposeCategory ?? args.action,
        purposeDetail: args.purposeDetail,
        ipAddress: args.ipAddress ?? resolveIpAddress(args.req),
        occurredAt: new Date().toISOString(),
      },
      overrideAccess: true,
    })
  } catch (err) {
    payload?.logger?.error?.(
      { err },
      '[audit] recordPersonalInfoAccess failed — swallowed to protect the audited action',
    )
  }
}
