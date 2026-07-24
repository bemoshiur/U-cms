# U-CMS Rebuild on Payload CMS — Development Plan

> Companion documents: [`docs/analysis/feature-inventory.md`](../analysis/feature-inventory.md) (full reverse-engineered spec, 118 features) and [`TODO.md`](../../TODO.md) (the executable task list).
> Status: **DRAFT — awaiting owner review before implementation starts.**

---

## 1. What we are building

A ground-up rebuild of **U-CMS v3.0** (a Korean enterprise/government-grade multi-site CMS by U&P) on a modern stack, re-branded as our own product. The legacy system is Java 17 / Spring Boot 2.7 / JSP / Quartz (confirmed by the manual's System Information screen). The rebuild target is:

| Layer             | Choice                                                               | Why                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| CMS / backend     | **Payload CMS 3.x** (TypeScript, code-first)                         | Instant admin panel, auth, access control, versions, uploads, jobs queue; runs natively inside Next.js                               |
| Frontend + server | **Next.js 15 (App Router)**                                          | Payload 3 is Next.js-native; one deployable app serves admin + public site                                                           |
| Database          | **PostgreSQL** (`@payloadcms/db-postgres`)                           | Legacy model is deeply relational (boards, codes, audit logs, dictionaries); the standardization module must introspect a SQL schema |
| Rich text         | Lexical (`@payloadcms/richtext-lexical`)                             | Editor/HTML/TEXT modes map to legacy editor behavior                                                                                 |
| Files             | Payload uploads + S3-compatible storage adapter (local disk for dev) | Managed, access-controlled download URLs replicate the legacy `fileDown.do` security model                                           |
| Email             | `@payloadcms/email-nodemailer`                                       | ID/PW recovery, OTP re-issue, notifications                                                                                          |
| 2FA               | Custom login flow + TOTP library (`otplib`)                          | Payload has no built-in TOTP; custom auth strategy + custom login view                                                               |
| Charts (admin)    | Recharts (or similar) in custom admin views                          | Statistics dashboards                                                                                                                |

**The three legacy subsystems** and what they become:

1. **통합관리 시스템 (Integrated Management System)** → the Payload admin panel plus custom admin views: multi-site registry, admin accounts w/ approval workflow, `ROLE_*` permission system, departments, common codes, board engine, members, banned words, short URLs, menus, banners/popups/notices, statistics, error logs, help system.
2. **데모 사이트 관리 (Demo Site Management)** → per-site (tenant-scoped) instances of the content tools plus the public-facing Next.js site: web content with version control & diff, boards (notice/press/gallery/Q&A/FAQ), surveys, user menus, privacy-terms versioning, traffic/download/satisfaction statistics.
3. **개인정보 보호 시스템 (Privacy Protection System)** → an audit/compliance module: access history, login history (overseas/mobile/failure views), permission-change and menu-permission-change journals, personal-info view logging with purpose-gated Excel export, PII masking, print watermarks, password policy management, auto-generated privacy org chart, security document boards.

---

## 2. Architecture

### 2.1 Multi-site model

Use **`@payloadcms/plugin-multi-tenant`** with a `sites` collection (legacy: 사이트 정보 관리 — site ID, name, URL, feature toggles, footer config, logo). Tenant-scoped collections: menus, boards, posts, web contents, banners, popups, notification areas, surveys, terms, statistics, members. Global (non-tenant) collections: admins, roles, departments, code groups/codes, banned words, audit logs, standardization dictionaries.

The legacy "bos" (back-office) site's own settings (2FA toggle, account-application toggle, admin IP allowlist) become fields on the `sites` record flagged `isAdminSite`.

### 2.2 Permission model (the hardest mapping)

Legacy: roles (`ROLE_*`) hold a **menu-permission tree**; an admin holds N roles; the union of checked menus defines both navigation and access. Payload natively does **collection-level** access control, not menu-level.

Design: keep the legacy model as data —

- `roles` collection: `roleId` (validated `^ROLE_[A-Z0-9]+$`), name, description.
- `adminMenus` collection: hierarchical menu tree (nested set via parent relationship), each node carrying `menuKey` → maps to an admin view/collection.
- `roles.menuGrants`: relationship hasMany to `adminMenus`.
- Admin users: `roles` hasMany relationship, `saveToJWT`.
- A shared `hasMenuAccess(user, menuKey)` helper backs: (a) every collection's `access` functions, (b) `admin.hidden` per collection, (c) the custom nav component, (d) custom views' server checks.
- `SUPER` role bypasses; the dedicated "privacy-processor" role gates the Privacy subsystem, and a "DBA" role gates the standardization module (legacy rule).
- Every change to `roles.menuGrants` and user↔role assignment is journaled (Privacy subsystem requirement) via `afterChange` hooks with before/after diffing.

### 2.3 Board engine

Two collections, mirroring the legacy single-table design (`tb_bbs`):

- `boards` (config): `bbsId` (auto `B0000031`-style), name, kind (`integrated` fixed-type vs `custom`), `boardType` relationship (photo/FAQ/Q&A-answer/attachment/extended… from a `boardTypes` collection), skin, attachment settings (on/off, max count, max size, extension whitelist), editor-for-admin-only flag, comments, list/page counts, top/bottom HTML blocks, up to 3 classification-code bindings each with title/attributes/style and 5 flags (use/required/list/detail/search), per-field settings grid (built-ins + 4 extra varchar fields with chosen input type + 4 extra text areas, each with the 5 flags), independent list-column and detail-field ordering.
- `posts`: board relationship, notice-pin flag (+pin period), title, author, department/team, rich content (Editor/HTML/TEXT), 3 category values, extraField1-4, extraContent1-4, attachments (managed uploads, representative-thumbnail designation for gallery), view count, per-site scoping. Q&A boards add an answer thread; FAQ boards render accordion-style.
- Hooks: profanity filter (block save when active banned word matched), New-icon window, Excel export endpoints, permission-filtered dashboard widgets.

The four security-document libraries in §3 (보안교육/보안사례/관리계획/대응지침) are four mounted boards — no new code.

### 2.4 Versioned web content & terms

Payload's built-in **versions** cover the legacy version-control model (every save = new version; exactly one active; re-activate any prior version). Custom admin additions: side-by-side/unified diff view (legacy 버전 비교), version history table with activate buttons. Same machinery reused for **privacy-terms documents** (5 fixed categories bound to a menu, history retained for consent evidencing). The legacy "hash-compare against externally-edited JSP file" behavior disappears — content lives only in the DB (simpler and safer).

### 2.5 Audit & privacy subsystem (cross-cutting)

Implemented as hooks + dedicated log collections, built **early** (Phase 2) because nearly every later feature must write to it:

- `accessLogs` — every admin/user action: actor, menu, action verb (login/list/view/insert/update/delete), URL, IP, event timestamp, session-login timestamp.
- `loginHistory` — success/fail flag, overseas flag (geo-IP), mobile flag (UA), masked-ID list views; pre-filtered menus (overseas/mobile/failures) are saved filters on one collection.
- `permissionChangeLogs`, `menuPermissionLogs` — journaled from role/menu hooks with added/removed menu enumeration and affected-user snapshots.
- `personalInfoAccessLogs` — `afterRead`/edit-open hooks on `members`; browser-confirm gate before viewing; **purpose-modal gate before any Excel export** (reason itself is logged); print watermark (management number + viewer ID + timestamp) as an overlay component; PII masking in list views.
- `passwordPolicies` — versioned policy text; "most recent active record wins"; the active policy is both displayed and enforced (min 10 chars w/ 2 of 3 classes OR min 8 w/ 3 classes; 6-month rotation).
- Privacy **org chart** — read-only view generated from privacy-role assignments (officer → deputy → team → staff).

### 2.6 Statistics & error logs

- Traffic: lightweight event capture middleware on the public site (page views + visitors, OS/browser/device parsed from UA) → raw events collection → nightly aggregation job (Payload jobs queue; legacy is D-1 aggregated) → dashboard + 5-tab stats views (period/menu/OS/browser/device, daily/monthly, Excel export).
- Attachment download stats (TOP 20), satisfaction stats (5-point widget, 20/40/60/80/100 weighting per menu), site access history.
- Error logs: global error handler captures exceptions (class, URL, user ID, IP, timestamp) → list + period/type/URL statistics tabs.

### 2.7 Deferred / descope-recommended modules

Two legacy modules are Korea-specific and very expensive to replicate; recommend deferring both to a final optional phase pending owner decision:

1. **공공데이터 표준화 (Public-data standardization)** — domain/word/term dictionaries with MOIS standard preloads, DBA-approved proposal workflows, live-schema conformance inspection (8 rule types), monthly self-check snapshots. Only valuable if the rebuild must serve Korean public-sector audits (감리).
2. **KWCAG 2.2 accessibility auto-diagnosis** — in-page overlay validator + monthly reports over 33 KWCAG items. A pragmatic substitute: axe-core-based scanning in CI plus an admin report page; a full KWCAG overlay engine is a product in itself.

Everything else in the manual is in scope.

---

## 3. Branding strategy ("proper Branding")

Two distinct layers:

**A. Product branding (ours, replacing "U-CMS v3.0"/U&P):** one `src/branding.ts` module holding product name, logo assets, color tokens, support contact — consumed by:

- `admin.components.graphics.Logo` (login screen) and `.Icon` (nav) — official white-label pattern;
- `admin.meta` (title suffix, favicon set incl. dark-mode variants, OG images);
- Payload CSS variable overrides (`--theme-elevation-*`, brand primary) via custom SCSS;
- custom login view text, email templates, error pages.
  Working name to confirm with owner (e.g. "Pulse CMS" for Public Pulse) — every occurrence flows from the single branding module, so renaming stays a one-file change.

**B. Runtime per-site branding (a legacy feature, kept):** each `sites` record manages its own logo upload, footer (org name/address/phone/fax/copyright with per-item show-hide), guide menus — rendered by the public site at request time.

---

## 4. Phased roadmap

Ordered so every phase ends with something demonstrable; audit hooks come early because later features depend on them.

- **Phase 0 — Foundations (≈1 wk):** repo, Payload+Next scaffold, Postgres (Docker), CI (lint/typecheck/test), envs, branding module v1, seed script skeleton.
- **Phase 1 — Core admin platform (≈3 wks):** sites registry; admins collection w/ approval workflow (승인대기/정상/장기 미로그인), lockout, password policy enforcement, ID/PW recovery emails; roles + menu-grant tree + custom permission-filtered nav; departments tree; common codes (groups/classifications/hierarchical detail codes); admin menu management.
- **Phase 2 — Security & audit backbone (≈2 wks):** Google-OTP 2FA (custom login flow, QR-once, admin reset); admin IP allowlist middleware (wildcards, IPv6, validity windows, default-deny); idle auto-logout w/ extend; accessLogs + loginHistory (geo/mobile/failure) + permission-change journals; PII masking helpers.
- **Phase 3 — Content engine (≈3–4 wks):** board types, boards (full config incl. field grid + ordering), posts (all board kinds incl. Q&A answers, FAQ, gallery w/ representative thumbnail), managed attachments + secure download endpoint + attachment board, profanity/member banned words, notices/banners/popups/notification areas (exposure windows, ordering, inline toggles), short-URL service + redirect route, web content w/ versions + diff + restore, site help system.
- **Phase 4 — Public demo site (≈3 wks):** Next.js public frontend: layout w/ site branding, user menus (login-state exposure, person-in-charge), content pages, all board UIs, search, member auth (signup w/ banned-word + terms consent, login), surveys (4 question types, skip logic, immutable-once-started, results + 2 Excel exports), privacy-terms pages w/ version history, satisfaction widget, guide menus, sitemap.
- **Phase 5 — Insights (≈2 wks):** traffic capture + D-1 aggregation job; 5-tab stats views; download stats; satisfaction stats; error-log module (list + 3 stats tabs); dashboard widgets (today stats, signups, posts, recent/most-viewed permission-filtered, notices, quick menu).
- **Phase 6 — Privacy protection system (≈2 wks):** personal-info access logs w/ confirm-gate, purpose-gated Excel exports, watermark overlay, security-document boards (×4 mounts), password-rule management UI, privacy org chart, menu-permission history views, full §3 screen set.
- **Phase 7 — Hardening & launch (≈2 wks):** E2E tests on critical flows, accessibility pass, performance, backups, deployment (Docker; target infra TBD), admin user guide, data seeding.
- **Phase 8 — Optional (owner decision):** standardization module; KWCAG auto-diagnosis engine.

Rough total: **18–20 working weeks** for one full-time developer through Phase 7; parallelizable to ~10–12 weeks with two.

---

## 5. Risks & mitigations

| Risk                                                | Mitigation                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Menu-level RBAC vs Payload's collection-level model | Single `hasMenuAccess` helper + journaled grants; spike in Phase 1 week 1                                        |
| 2FA login flow replaces Payload's login view        | Isolate as custom auth strategy + custom view; fallback = disable per site (legacy behavior)                     |
| Board field-grid flexibility (dynamic fields)       | Fixed extra-field slots exactly like legacy (4 varchar + 4 text) — avoids runtime schema mutation                |
| Statistics volume                                   | Raw events partitioned/pruned; aggregates queried by dashboards, never raw                                       |
| Scope explosion (118 features)                      | Phase gates; §2.7 deferrals; TODO.md is the single source of truth                                               |
| Korean-only manual nuances                          | Feature inventory retains Korean terms beside translations; verification notes flag inferred-vs-documented rules |

## 6. Open questions for the owner

1. **Brand identity** — product name, logo, colors? (Plan assumes a Public Pulse identity; placeholder tokens until confirmed.)
2. **UI language(s)** — English-only, Bengali+English, or keep Korean? (Payload i18n supports all; affects every label.)
3. **Deferred modules** (§2.7) — confirm deferral of standardization + KWCAG engines?
4. **Deployment target** — AWS/VPS/on-prem? Affects storage adapter and Phase 7.
5. **Demo-site design** — replicate the legacy demo site's look, or new design under our brand? (Plan assumes new design, same functionality.)
