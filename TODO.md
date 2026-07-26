# SUPER TODO — U-CMS Rebuild on Payload CMS

> Source spec: [`docs/analysis/feature-inventory.md`](docs/analysis/feature-inventory.md) (118 features, refs like `1-28` point there).
> Plan & architecture: [`docs/planning/development-plan.md`](docs/planning/development-plan.md).
> Convention: one PR per checkbox where practical; a phase is done only when its **Exit criteria** pass.

---

## Phase 0 — Foundations

- [x] 0.1 Confirm open decisions with owner: brand name/logo/colors, UI language(s), deferral of standardization + KWCAG modules, deployment target, demo-site design direction
- [x] 0.2 Scaffold Payload 3 + Next.js 16 app (`create-payload-app`, TypeScript, App Router)
- [x] 0.3 Postgres via Docker Compose (dev) + `@payloadcms/db-postgres`; `.env` handling and secrets convention
- [x] 0.4 Repo hygiene: ESLint, Prettier, tsconfig strict, husky pre-commit, GitHub Actions CI (lint + typecheck + test + build)
- [x] 0.5 `src/branding.ts` module (name, logos, colors, contact) + wire `admin.meta` (titleSuffix, favicons incl. dark variant) and `graphics.Logo`/`graphics.Icon`
- [x] 0.6 Payload theme CSS overrides using brand tokens (light + dark)
- [x] 0.7 Email adapter (nodemailer) with dev mailcatcher; base branded email template
- [x] 0.8 Storage adapter abstraction (local dev, S3-compatible for prod)
- [x] 0.9 Seed-script skeleton + test harness (Vitest + Playwright)

**Exit criteria:** branded admin panel boots on Postgres; CI green; seed creates a super-admin.

## Phase 1 — Core admin platform

### Sites (multi-site) — refs 1-17, 1-18, 1-19

- [x] 1.1 `sites` collection: siteId, name, URL (http-prefixed validation), isAdminSite flag, satisfaction toggle, data-manager toggle, accessibility-validation mode, 2FA toggle, account-application toggle, logo upload (1 file, jpg/jpeg/png/gif)
- [x] 1.2 Footer config group: org name, address (3 parts + postal lookup), phone, fax, copyright — each with show/hide (data model only; postal-lookup popup is a frontend concern for a later task)
- [x] 1.3 Install/configure `@payloadcms/plugin-multi-tenant`; decide tenant-scoped vs global collections (per plan §2.1)

### Admin accounts & auth — refs 1-1, 1-2, 1-3, 1-15, 1-16

- [x] 1.4 `admins` auth collection: `loginId` (unique) + email (unique), name, mobile, extension, department rel, duties, profile photo (upload→media), roles hasMany (saveToJWT), status (승인대기/정상/장기미로그인/locked) — Task 1D. (Deferred custom UI: dup-check UX, mobile country-code-from-code-mgmt, 64×64 display + rotate/reorder controls — later admin-component task.)
- [x] 1.5 Approval workflow: self-service account request (`POST /api/account-request`) → `status: pending` (client status/roles force-stripped) → approve by editing `status` in admin (field-gated on system.admins); login blocked until `active` (beforeLogin) — Task 1D.
- [x] 1.6 Password policy enforcement (`src/auth/validatePassword.ts`, beforeValidate hook): ≥10 chars w/ 2 of 3 classes OR ≥8 w/ 3 classes; block sequences/login-ID-similar — Task 1D. (`passwordPolicies` collection holds display text/history; enforcement is fixed in code — code/DB split. 6-month rotation is advisory text only, not mechanically enforced.)
- [~] 1.7 `maxLoginAttempts: 5` / `lockTime: 10m` set; public account-request + ID/PW-find endpoints exposed — Task 1D. Custom login VIEW delivered in Task 2B (`admin.components.views.login`: branded logo, two-step OTP form, conditional Account-Request/Find-ID/Find-PW links). Save-ID checkbox + full lockout-messaging polish remain Phase 4 frontend.
- [x] 1.8 ID/PW recovery: find-ID (`POST /api/find-id`, name+email → emails login ID), find-PW (`POST /api/find-password`, id+email → Payload forgotPassword reset email) — approved/active accounts only, generic responses (no enumeration) — Task 1D.
- [x] 1.9 Long-inactivity job: `markDormantAccounts()` + `scripts/mark-dormant.ts` (`pnpm dormancy:sweep`) auto-transition active→장기 미로그인 (dormant); blocks login until an admin re-activates — Task 1D.

### Roles & permissions — refs 1-10..1-13

- [x] 1.10 `roles` collection: roleId (`^ROLE_[A-Z0-9]+$`), name, description
- [x] 1.11 `adminMenus` tree collection (menuKey, name, parent, order) + seed with full menu map from inventory
- [~] 1.12 Role↔menu grants UI: checkbox tree w/ open/close-all, apply button (ref 1-13) (data model — `roles.menuGrants` — exists; Phase 1 uses the default multi-select relationship widget; the checkbox-tree UI is deferred to a later custom-admin-component task, per Task 1C)
- [x] 1.13 Role users view: list members of role, multi-select remove (ref 1-12) (read-only `join` field showing role members; multi-select remove UI deferred to a later custom-admin-component task, per Task 1C)
- [x] 1.14 `hasMenuAccess()` helper wired into: collection `access`, `admin.hidden`, custom nav, custom views; SUPER bypass; privacy-role and DBA-role gates (collection `access` + `admin.hidden` + SUPER bypass done, Task 1C; custom nav/custom-view wiring and the privacy-role/DBA-role gates are later-phase work — no custom nav component exists yet, and the dedicated privacy-processor/DBA roles are Phase 2/6 scope per development-plan.md §2.2)
- [~] 1.15 Permission-filtered navigation component (GNB 2-depth + LNB 3-depth+, breadcrumb, full-menu overlay — refs 1-9, 3-11)

### Departments & codes — refs 1-14, 1-22..1-26

- [x] 1.16 `departments` tree: add top/child, name/duties/phone/fax/use-flag, drag ordering; picker popup component (reused by admins/surveys) (data model + cycle/delete-with-children guards only; drag ordering UI and the reusable picker popup component are deferred to a later custom-admin-component task, per Task 1B)
- [x] 1.17 `codeClassifications` (English-letters code) + `codeGroups` (codeId = DB column-name convention) + hierarchical `codes` (2-digit-per-depth values, tree popup editor, ordering) (data model + validation hooks only; the tree popup editor UI is deferred to a later custom-admin-component task, per Task 1B)
- [~] 1.18 Code-search popup component (reused by boards)
- [x] 1.19 Seed baseline code sets from ref 1-74 (APRV_CD, ACS_VLD_USE_CD, BBS_ITEM_TYPE_CD, …)

**Exit criteria:** admin can create sites, request+approve accounts, define roles with menu grants and see navigation change accordingly; departments and codes manageable; all covered by tests.

## Phase 2 — Security & audit backbone

### 2FA — refs 1-4, 1-5, 1-6

- [x] 2.1 TOTP secret per admin (otplib); QR issuance page shown **only on first login**; re-issue by admin (email delivery) (Task 2B — `totpSecret` hidden+read:false field; `POST /api/2fa/enroll` returns QR+secret once, never after confirmation; admin reset re-issues + emails via `renderTwoFactorResetEmail`)
- [~] 2.2 Custom login flow: password step → OTP step (6-digit) when site 2FA enabled; guide page; account-registered-phone requirement note (Task 2B — server `require2FA` beforeLogin gate is the enforcement; custom `admin.components.views.login` two-step form + conditional Account-Request/Find-ID/Find-PW links; `GET /api/2fa/guide` setup page. Polished form UI + account-registered-phone note are Phase 4 frontend — see task-2B-report.md)
- [x] 2.3 Admin account buttons: reset 2FA device / reset OTP code (ref 1-16) (Task 2B — admin-only `resetTwoFactorDevice` / `regenerateTwoFactorSecret` action fields; clear/regenerate enrolment + email + accessLog)

### Network & session security — refs 1-20, 1-21, 1-7(#10)

- [x] 2.4 `adminIpRules` collection: applicant/affiliation/phone/memo, IP (wildcard `a.b.c.*`, bare-`*` warning, IPv6), allow classification, validity window, use toggle (inline flip)
- [x] 2.5 Default-deny middleware on admin routes: allowlist check + auto-block after validity expiry
- [x] 2.6 Idle auto-logout (default 30 min) with countdown + extend button in admin quick-menu

### Audit logging — refs 1-55, 3-1..3-3, 3-5..3-7

- [x] 2.7 `accessLogs` collection + hook/middleware capture: actor, menu, action verb, URL, IP, event ts, session-login ts; date+keyword search views (Task 2A — append-only/immutable collection + `recordAccess`/`auditCollection` mutation capture + login/logout; date/keyword search is Payload's built-in list filtering. Read/list auditing deferred — see task-2A-report.md)
- [x] 2.8 `loginHistory`: success/fail, geo-IP overseas flag, UA mobile flag; masked-ID master list + pre-filtered views (overseas, mobile, failures); empty-state (Task 2A — one collection; overseas/mobile/failure are documented saved-filter queries; geo is a `geoLookup` stub defaulting domestic)
- [x] 2.9 `permissionChangeLogs` (user↔role, w/ actor+IP) and `menuPermissionLogs` (per-save added/removed menu enumeration + role-member snapshot) (Task 2A — afterChange diff hooks on users/roles)
- [x] 2.10 PII masking utilities (IDs `ha***g`, names) applied to all log list views (Task 2A — `src/lib/mask.ts` + `MaskedCell` on accessLogs.actorLabel, loginHistory.userLabel/loginId)

**Exit criteria:** 2FA round-trip works; non-allowlisted IP blocked from admin; every admin action and login lands in the correct log with correct flags.

## Phase 3 — Content engine

### Board engine — refs 1-27..1-35, 1-77, 1-78, 2-5..2-8

- [x] 3.1 `boardTypes` collection (auto PG-code, name, description ≤800 chars) + seed built-ins (integrated, photo, answer/Q&A, FAQ, attachment, extended)
- [x] 3.2 `boards` collection — basic settings: auto bbsId, name, kind (integrated=fixed type/skin vs custom), type rel, skin, sort, admin-only editor flag, comments, excel, user-post, New-icon window, list/page counts, top/bottom HTML blocks
- [x] 3.3 Boards — attachment settings: on/off unlocks max count, max size (per-file), lowercase comma-separated extension whitelist
- [x] 3.4 Boards — category tab: up to 3 classification-code slots (code-search popup only) each w/ title, HTML attrs, style, 5 flags (use/required/list/detail/search)
- [x] 3.5 Boards — field-settings grid: built-in fields + extraField1-4 (varchar-equivalent, chosen input type) + extraContent1-4 (text), each w/ label/attrs/style + 5 flags
- [x] 3.6 Boards — independent list-column and detail-field ordering (drag + up/down)
- [x] 3.7 `posts` collection honoring board config: pin flag (+period, pinned sort first), title, author, dept/team, Lexical content (Editor/HTML/TEXT), categories, extra fields, view count, per-site scope
- [x] 3.8 Board-kind behaviors: Q&A answer threads, FAQ rendering, gallery w/ representative thumbnail + card grid, attachment board w/ per-file copyable managed URLs (fixed board, ref 1-81)
- [x] 3.9 Managed secure download endpoint (access-controlled, download-counted) replacing `fileDown.do`
- [x] 3.10 Board list/detail admin views: multi-criteria search (category+codes+period+field+keyword), Excel export, configurable header notice text

### Word filters — refs 1-38..1-41

- [x] 3.11 `profanityWords`: use-flag, bulk delete; hook blocks post save containing active words
- [x] 3.12 `memberBannedWords`: scope (common/loginId/password); hook blocks member signup accordingly

### Display components — refs 1-45..1-53, 2-1

- [x] 3.13 `notificationAreas`: image (490×245 rec), title, internal-picker/external link (http validation), new/current window, hour-precision exposure window, 4-way ordering, inline use toggle
- [x] 3.14 `popups`: image (160×140 rec), geometry (w/h/top/left px), scrollbar flag, close-for-a-day cookie, exposure window
- [x] 3.15 `banners`: image (196×70 rec), link mode, exposure window, 4-way ordering
- [x] 3.16 `adminNotices` board (pin period, 5 attachments png/gif/jpg w/ per-file description)
- [x] 3.17 Guide menus (top/bottom): max 5 top items after fixed defaults, internal-picker/absolute-URL rule, batch-save inline editor

### Menus, content, utilities — refs 1-42..1-44, 2-2..2-4, 2-13, 1-80

- [x] 3.18 `menus` (admin + user, per site): tree w/ drag + up/down, content types (placeholder/program/board/content/link via picker popup), new-window, use-flag (red-in-tree when off), menu-cache refresh action; user menus add person-in-charge + login-state exposure
- [x] 3.19 `webContents`: 1:1 menu binding, Payload versions (save = new version, one active, re-activate any) + responsible dept/person
- [x] 3.20 Version diff view: split + unified modes, color-coded, version picker, source download (ref 2-4)
- [x] 3.21 `shortUrls`: name, original URL, remarks, system-generated code, clipboard copy; public redirect route
- [x] 3.22 `helpEntries` tree bound by URL-pattern (preferred) or menu; ⓘ button popup on every admin screen; print-content-only button

**Exit criteria:** create a custom gallery board end-to-end (type → board config → post w/ thumbnail → public API); banned word blocks a post; content version restored + diffed; short URL redirects.

## Phase 4 — Public demo site

- [x] 4.1 Public layout: site logo/footer from `sites`, guide menus, GNB/LNB from user menus (login-state exposure), breadcrumb, sitemap page
- [x] 4.2 Members: signup (terms consent snapshot, banned-word checks, dup checks), login, profile edit; `members` auth collection (tenant-scoped)
- [x] 4.3 Content pages (webContents renderer) + person-in-charge display (when site data-manager toggle on)
- [x] 4.4 Board frontends: notice/press/data-library lists w/ search + pagination, detail w/ attachments, Q&A (member ask, admin answer), FAQ, gallery grid
- [x] 4.5 Surveys — refs 2-9..2-12: `surveys` (topic, minute-precision window, audience anyone/members, result-visibility, dept, phone, rich description) + `surveyQuestions` (4 types, required flag, "other" option, dynamic options, skip logic on single-select) + `surveyResponses` (participant count, anonymous rule)
- [x] 4.6 Survey rules: questions immutable once started; results visible from in-progress; results view (bars, %, per-respondent list, page size) + 2 Excel exports
- [x] 4.7 Privacy terms — refs 2-14..2-16: `termsDocuments` versioned, 5 fixed categories bound per menu (internal-link picker), exactly-one-active version, public page w/ version history
- [x] 4.8 Satisfaction widget (5-point) on content pages when site toggle on
- [x] 4.9 Public traffic capture middleware (feeds Phase 5)
- [x] 4.10 Design pass under new brand (frontend-design review, responsive, WCAG-sane)

**Exit criteria:** a visitor can browse content/boards, join as member, answer a survey, rate a page; all public pages tenant-scoped.

## Phase 5 — Insights

- [x] 5.1 Raw analytics events → nightly D-1 aggregation job (Payload jobs queue) + retention/pruning
- [x] 5.2 Traffic stats views (admin + per-site): 5 tabs (period/menu/OS/browser/device), daily/monthly, chart+table, Excel — refs 1-54, 2-17
- [x] 5.3 Attachment download stats: per-file counters, TOP-20 chart, detail table, Excel — ref 2-18
- [x] 5.4 Satisfaction stats: dept+menu cascading filters, distribution table w/ % weighting, per-menu bars, Excel — ref 2-19
- [x] 5.5 Site access history view — ref 2-20
- [x] 5.6 Error-log module: global exception capture (class, URL, user, IP) + list w/ user-centric search + period/type/URL stat tabs w/ drill-down — refs 1-56..1-59
- [x] 5.7 Admin dashboard: today visitors/PV, signups, post counts, traffic chart (week/month, chart/table), admin notices, notification area, user notices, recent Q&A/posts + most-viewed (permission-filtered), banner strip, quick menu w/ profile + logout timer — refs 1-7, 1-8

**Exit criteria:** dashboards populated from real captured traffic; D-1 aggregation verified; error drill-downs work.

## Phase 6 — Privacy protection system

- [ ] 6.1 `personalInfoAccessLogs` + hooks on member views/edits (screen, subject, URL, purpose category view/edit, viewer, ts, IP) — ref 3-8
- [ ] 6.2 Confirm-gate before member-info view (logged); purpose-modal gate before ANY member/log Excel export, reason logged — refs 1-36, 3-8
- [ ] 6.3 Watermark overlay (mgmt number + viewer ID + timestamp) on member detail view/print — ref 1-37
- [ ] 6.4 Member management screens w/ masking + audit integration — refs 1-36, 1-37
- [ ] 6.5 `passwordPolicies` mgmt UI (versioned text, most-recent-active-wins) — ref 3-9
- [ ] 6.6 Privacy org chart auto-generated from privacy-role assignments (officer→deputy→team→staff w/ duty labels) — ref 3-10
- [ ] 6.7 Mount 4 security-document boards (education/cases/mgmt-plan/incident-response) — ref 3-4
- [ ] 6.8 §3 menu wiring: access-history, permission-history, menu-permission-history, login-history views under the Privacy 1-depth system, privacy-role gated

**Exit criteria:** every personal-info touch produces an audit row; exports impossible without purpose; watermark visible on print; org chart reflects role changes.

## Phase 7 — Hardening & launch

- [ ] 7.1 E2E suites: auth+2FA, RBAC visibility, board CRUD, member privacy gates, survey lifecycle
- [ ] 7.2 Load-test stats capture + aggregation; index audit on log collections
- [ ] 7.3 Security review (OWASP pass, upload handling, access-control audit) — run `/security-review`
- [ ] 7.4 Backup/restore runbook (Postgres + uploads); deployment (Docker → chosen infra); monitoring/alerts
- [ ] 7.5 Admin user guide (our-brand equivalent of the U-CMS manual, screenshots per module)
- [ ] 7.6 Production seed: initial site records, super-admin, menu tree, code sets, password policy

## Phase 8 — Optional (pending owner decision, plan §2.7)

- [ ] 8.1 Public-data standardization module (domain/word/term dictionaries, MOIS preloads, DBA proposal workflows, live-schema inspection w/ 8 rules, monthly self-check + stats, table standard settings, code specification report) — refs 1-60..1-76
- [ ] 8.2 Accessibility auto-diagnosis (pragmatic: axe-core CI + admin report; full: KWCAG 2.2 overlay engine w/ 33-item monthly reports) — refs 2-21..2-23
- [ ] 8.3 Web-accessibility validation site toggle semantics (off/popup/DB/both) — ref 1-74 code set
