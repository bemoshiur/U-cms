# Audit Fix 5 — survey admin results view (ref 2-12)

## What was built

1. **`src/endpoints/surveyResults.ts`** — new, read-only, access-gated JSON
   endpoint on the `surveys` collection:
   `GET /api/surveys/:id/results` → `{ ok, survey: { id, title }, aggregate }`.
   Gated identically to the existing CSV exports (`surveyExport.ts`): resolves
   the survey via `findAccessibleDoc` (existence-oracle — missing / cross-tenant
   / forbidden / anonymous all collapse to the same 404, never confirming a
   survey id to a caller who can't read it), then loads questions + responses
   via the existing `src/site/survey.ts` loaders and computes
   `aggregateSurvey(questions, responses)` with the DEFAULT `audience: 'admin'`
   (full verbatim free-text, unlike the public results page). Wired into
   `Surveys.ts`'s `endpoints` array alongside `surveyExportEndpoints`.

2. **`src/collections/surveys/Surveys.ts`** — added
   `admin.components.edit.beforeDocumentControls: ['/components/surveys/SurveyResultsPanel#SurveyResultsPanel']`,
   mirroring the exact syntax `Users.ts` (`PasswordPolicyNotice`) and
   `Members.ts` (`MemberDetailWatermark`) use. `payload.config.ts` was **not**
   touched (confirmed via `git diff` before committing) — no
   `views`/`afterNavLinks` registration, per the brief's conflict-avoidance
   constraint.

3. **`src/components/surveys/SurveyResultsPanel.tsx`** — new client component
   mounted on the survey EDIT screen. A click-to-load "View results" toggle
   (no auto-fetch on mount, so opening the edit screen never fires an extra
   request) that reads `id` via `useDocumentInfo()` and the API base via
   `useConfig()` (same pattern as the existing `MemberExportButton.tsx`),
   fetches the new endpoint, and renders the result.

4. **`src/app/(payload)/admin/importMap.js`** — added the manual import-map
   entry for `SurveyResultsPanel`, following this project's established
   hand-maintained convention (visible from the existing entries' non-generator
   hash suffixes, e.g. `_8a1a0001`). `pnpm generate:importmap` (and
   `pnpm migrate` / `pnpm seed` via the plain `tsx` CLI) fail in this sandbox
   with a pre-existing `payload`/`@next/env` CJS-ESM interop error
   (`Cannot destructure property 'loadEnvConfig' of 'import_env.default' as it
   is undefined`, from `payload/dist/bin/loadEnv.js`) unrelated to this task —
   reproduces on both Node 25.9.0 and Node 22.22.3, and affects only the
   `payload` CLI / plain-`tsx`-script path, not `next build`/`next start` or
   Vitest (which load `payload.config.ts` successfully throughout). Given this,
   hand-editing `importMap.js` matches how several of the pre-existing entries
   were evidently added.

## `SurveyResults` reuse decision

Reused **directly**, not ported. `src/app/(frontend)/_components/survey/SurveyResults.tsx`
is a plain, portable, synchronous presentational component (`{ aggregate }` in,
JSX out) with no `next/navigation` or other route-specific APIs — it imports
only `react` and a type from `@/content/survey`. `SurveyResultsPanel.tsx`
imports and renders it directly, so the admin panel and the public results
page render identically from the same `SurveyAggregate` shape.

## Endpoint + gate

`GET /api/surveys/:id/results`, gated via `findAccessibleDoc` under the
caller's own `surveys.access.read` (`tenantScopedMenuAccess(SURVEYS_MENU_KEY)`)
— the SAME grant the CSV exports use, not a separate/weaker check. A survey
that exists but the caller can't read (wrong tenant, no `content.surveys`
grant, anonymous) returns the same 404 as a genuinely missing id.

## Empty-state decision

No special-cased "at least one response" gate — the button/panel always
renders once a survey is being edited. `aggregateSurvey` already returns a
well-formed zero-response aggregate (`totalResponses: 0`, every question's
counts at 0), and `SurveyResults` already renders that gracefully
("Total responses: 0"), so a survey with no responses yet just shows that
plainly. This also matches `resultsVisible(survey, 'admin')` being
unconditionally true — the panel is never conditionally hidden based on
`resultVisibility`.

## Tests

`tests/int/surveyResults.int.spec.ts` (new, 4 tests, all passing), calling
`handleSurveyResultsView` directly (same pattern as the existing
`surveys.int.spec.ts` CSV-export tests):

1. An admin holding `content.surveys` on the survey's own tenant gets back
   `200` with the correct `totalResponses` (3) and correct per-option counts
   (red: 2, blue: 1) for known seeded responses — proving the panel would
   render correct aggregate counts. The survey's
   `resultVisibility` is deliberately set to `'adminsOnly'` in the fixture to
   prove the admin view is unconditional (`resultsVisible(survey, 'admin')`
   ignores `resultVisibility` entirely).
2. A cross-tenant admin (holds `content.surveys` but on a different site) gets
   `404` — cannot reach another site's survey results.
3. An anonymous caller (`user: null`) gets `404`.
4. A missing `id` gets `400` (request-shape error, not a resource-existence
   leak — matches the existing exports' posture).

## Gates

- `pnpm lint` — clean.
- `pnpm format:check` — clean.
- `pnpm typecheck` — clean.
- `pnpm build` — clean (against a fresh isolated Postgres instance; see
  "Environment note" below).
- `pnpm test` (unit + int) — **92/92 test files, 1010/1010 tests passing**,
  including the new `surveyResults.int.spec.ts`.
- `pnpm test:e2e` — **43/44 passing**. The one failure
  (`board-browse.e2e.spec.ts` › "browse board list → open a post → see a
  managed-download attachment link") is **pre-existing and unrelated** to this
  task: `src/seed/steps/rich/boards.ts` (added in the "Add rich demo seed"
  commit, long before this task) unconditionally overwrites the "Notice"
  board's `headerNotice` to `"Official notices and announcements."`, while
  `src/seed/steps/boards.ts`/`publicSite.ts` (the basic seed step, run
  earlier in the same registry) originally sets it to `"This is the Notice
  board."` (with an XSS-test payload). Since `runSeed(payload)` with no step
  filter — exactly what `pnpm seed` / `scripts/seed.ts` runs, and exactly what
  CI's `e2e` job runs — always runs both steps in the same order, this
  mismatch reproduces on ANY fresh full-seed environment, not something
  introduced here. Confirmed via `git log` that both seed files predate this
  branch's work. The two survey-specific e2e specs
  (`tests/e2e/survey.e2e.spec.ts`, `tests/e2e/survey-lifecycle.e2e.spec.ts`,
  including its "results → export" step) both passed cleanly, and no board
  code was touched by this task.

### Environment note (process, not code)

The shared dev Postgres container (`pulse-cms-db`, port 5432) had schema drift
from other concurrently-running worktree agents mid-task, which manifested as
an interactive "you've run Payload in dev mode... run migrations?" prompt that
hangs non-interactively. To get a clean, isolated signal for all gates, I ran
`docker run` for a **separate** Postgres container
(`pulse-cms-db-audit5`, port 5433, same `pulse`/`pulse`/`pulse_cms`
credentials already public in `docker-compose.yml` — nothing secret) and
pointed this worktree's own `.env` at it. `PAYLOAD_SECRET` in that `.env` is a
freshly `crypto.randomBytes(32)`-generated value written directly to the file
via a Node script — never the real project secret, and never printed to
output (per the mid-task correction from the orchestrator, which I've
acknowledged and am following for the remainder of this and all future work).
`pnpm build` and a full seed (run through Vitest's working transform, since
the plain `tsx`/`payload` CLI path has the pre-existing loader bug noted
above) both ran cleanly against that isolated DB; one stray `payload_migrations`
`batch = -1` "dev mode" marker row (written by Vitest's push-mode `getPayload()`
calls) was deleted via `psql DELETE ... WHERE batch = -1` so `next start`
(used by `pnpm test:e2e`'s `webServer`) would boot non-interactively — this
only removes the dev-mode marker, not any real migration row or data. This
container is local-only, on a non-default port, and not part of the
committed changes.

## Concerns

- The one e2e failure noted above is pre-existing/out of scope; not fixed
  here to stay within this task's scope (avoiding touching board/seed files
  other parallel work may depend on).
- `pnpm generate:importmap`, `pnpm migrate`, and `pnpm seed` (the plain CLI
  entry points) are all broken in this sandbox by the same pre-existing
  `payload`/`@next/env` interop bug — worth flagging to the project owner
  separately, since it also blocks a clean `pnpm ci:deploy` locally (though
  the app's own production boot path, `prodMigrations` + `next start`, is
  unaffected and is what actually runs in deployment per the comment in
  `payload.config.ts`).
