import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { toRelationId } from '../collections/utils'
import { aggregateSurvey, type SurveyQuestionLike } from '../content/survey'
import { loadSurveyQuestions, loadSurveyResponses } from '../site/survey'
import { findAccessibleDoc, notFoundResponse } from '../security/existenceOracle'

/**
 * Survey CSV exports (Task 4D Part 4 / ref 2-12) — TWO access-gated, tenant-scoped
 * collection endpoints on `surveys`, mirroring the T3D `boardExport` pattern:
 *
 *   GET /api/surveys/:id/export/summary    → per-question aggregate (counts + %)
 *   GET /api/surveys/:id/export/responses  → one row per raw response
 *
 * Access: the survey is resolved through {@link findAccessibleDoc} (existence
 * oracle) under the caller's OWN read access, so a missing survey, a cross-tenant
 * survey, and an anonymous/ungranted caller ALL collapse to the same 404 — the
 * export never confirms a survey id to someone who may not read it. Once the
 * survey is proven readable, its questions/responses are read with
 * `overrideAccess` (the access decision is already made). CSV (not XLSX) keeps
 * this dependency-free; the value formatter guards against CSV formula injection.
 */

/** Quotes a CSV cell and neutralizes leading formula characters (=,+,-,@). */
function csvCell(value: string): string {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${neutralized.replace(/"/g, '""')}"`
}

function csvDocument(rows: string[][]): string {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  // UTF-8 BOM so Excel opens Korean/Unicode content correctly.
  return `﻿${body}\r\n`
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

type SurveyLike = { id: string | number; title?: unknown; tenant?: unknown }

async function resolveSurvey(args: {
  payload: Payload
  user: unknown
  id: string | number | null | undefined
  req?: PayloadRequest
}): Promise<SurveyLike | null | 'bad-request'> {
  const { payload, user, req, id } = args
  if (id === null || id === undefined || id === '') {
    return 'bad-request'
  }
  return findAccessibleDoc<SurveyLike>({ payload, collection: 'surveys', id, user, req })
}

function safeFilename(title: unknown, id: string | number, suffix: string): string {
  const base = typeof title === 'string' && title ? title.replace(/[^\w.-]+/g, '_') : String(id)
  return `survey-${base}-${suffix}.csv`
}

/** Summary/aggregate export: per-question option counts + percentages. */
export async function handleSurveySummaryExport(args: {
  payload: Payload
  user: unknown
  id: string | number | null | undefined
  req?: PayloadRequest
}): Promise<Response> {
  const survey = await resolveSurvey(args)
  if (survey === 'bad-request') {
    return Response.json({ ok: false, message: 'A survey id is required.' }, { status: 400 })
  }
  if (!survey) {
    return notFoundResponse()
  }

  const [questions, responses] = await Promise.all([
    loadSurveyQuestions(args.payload, survey.id),
    loadSurveyResponses(args.payload, survey.id),
  ])
  const agg = aggregateSurvey(questions, responses)

  const rows: string[][] = [
    ['Total responses', String(agg.totalResponses)],
    [],
    ['Question', 'Option', 'Count', 'Percentage (%)'],
  ]
  for (const q of agg.questions) {
    if (q.type === 'single' || q.type === 'multi') {
      for (const opt of q.options) {
        rows.push([q.text, opt.label, String(opt.count), String(opt.percentage)])
      }
      for (const other of q.otherTexts) {
        rows.push([q.text, `(other) ${other}`, '', ''])
      }
    } else {
      rows.push([q.text, '(free text)', String(q.answeredCount), ''])
      for (const text of q.textAnswers) {
        rows.push([q.text, text, '', ''])
      }
    }
  }

  return csvResponse(csvDocument(rows), safeFilename(survey.title, survey.id, 'summary'))
}

/** Raw export: one row per response, one column per question. */
export async function handleSurveyResponsesExport(args: {
  payload: Payload
  user: unknown
  id: string | number | null | undefined
  req?: PayloadRequest
}): Promise<Response> {
  const survey = await resolveSurvey(args)
  if (survey === 'bad-request') {
    return Response.json({ ok: false, message: 'A survey id is required.' }, { status: 400 })
  }
  if (!survey) {
    return notFoundResponse()
  }

  const [questions, responses] = await Promise.all([
    loadSurveyQuestions(args.payload, survey.id),
    loadSurveyResponses(args.payload, survey.id),
  ])
  const sortedQuestions = (questions as SurveyQuestionLike[])
    .filter((q) => typeof q.order === 'number')
    .sort((a, b) => (a.order as number) - (b.order as number))

  // value→label lookup per question for readable cells.
  const labelByQuestionValue = new Map<string, Map<string, string>>()
  for (const q of sortedQuestions) {
    const m = new Map<string, string>()
    for (const o of q.options ?? []) {
      m.set(String(o?.value), o?.label || String(o?.value))
    }
    labelByQuestionValue.set(String(q.id), m)
  }

  const header = [
    'Response #',
    'Submitted at',
    'Respondent',
    ...sortedQuestions.map((q) => q.text || ''),
  ]
  const rows: string[][] = [header]

  responses.forEach((response, i) => {
    const answersByQ = new Map<
      string,
      { optionValues?: string[] | null; textValue?: string | null }
    >()
    for (const a of response.answers ?? []) {
      const qid = toRelationId(a?.question)
      if (qid !== undefined) {
        answersByQ.set(String(qid), a)
      }
    }
    const respondentId = toRelationId(response.respondent)
    const cells = [
      String(i + 1),
      typeof response.submittedAt === 'string' ? response.submittedAt : '',
      respondentId !== undefined ? String(respondentId) : '(anonymous)',
    ]
    for (const q of sortedQuestions) {
      const a = answersByQ.get(String(q.id))
      if (!a) {
        cells.push('')
        continue
      }
      const labels = labelByQuestionValue.get(String(q.id)) ?? new Map()
      const parts: string[] = (a.optionValues ?? []).map((v) => labels.get(String(v)) ?? String(v))
      if (typeof a.textValue === 'string' && a.textValue.length > 0) {
        parts.push(a.textValue)
      }
      cells.push(parts.join('; '))
    }
    rows.push(cells)
  })

  return csvResponse(csvDocument(rows), safeFilename(survey.title, survey.id, 'responses'))
}

export const surveyExportEndpoints: Endpoint[] = [
  {
    path: '/:id/export/summary',
    method: 'get',
    handler: async (req) =>
      handleSurveySummaryExport({
        payload: req.payload,
        user: req.user,
        req,
        id: req.routeParams?.id as string | undefined,
      }),
  },
  {
    path: '/:id/export/responses',
    method: 'get',
    handler: async (req) =>
      handleSurveyResponsesExport({
        payload: req.payload,
        user: req.user,
        req,
        id: req.routeParams?.id as string | undefined,
      }),
  },
]
