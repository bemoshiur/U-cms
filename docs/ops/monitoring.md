# U-CMS monitoring & alerts

What to watch in a running U-CMS deployment, using the app's own surfaces, plus
provider-agnostic alert recommendations. U-CMS captures a lot about its own
health in **first-class collections** (error logs, audit logs, traffic rollups),
so most monitoring is _querying data the app already records_ rather than bolting
on an external agent.

Sections:

1. [Error logs (`errorLogs`)](#1-error-logs-errorlogs)
2. [Audit / log collections](#2-audit--log-collections)
3. [Traffic & stats health (cron jobs)](#3-traffic--stats-health-cron-jobs)
4. [Health readiness probe (`/health`)](#4-health-readiness-probe-health)
5. [Platform & alert recommendations](#5-platform--alert-recommendations)

---

## 1. Error logs (`errorLogs`)

`errorLogs` (`src/collections/ErrorLogs.ts`) is an **append-only, immutable**
record of every captured unhandled exception. It is written by the global
capture path (`recordError`, wired into Payload's config-level `afterError`
hook), so a `>= 500` failure anywhere in the app lands here with its
`exceptionClass`, a **sanitized** `message` + `stackDigest` (secrets/PII
redacted before storage), the `url`, `httpMethod`, `statusCode`, acting admin
(`actorLabel` — denormalized, masked in the list), `ipAddress`, and
`occurredAt`.

### How to watch it

- **Admin view:** it appears under the **Audit** group in the admin. Read/delete
  are gated on the `system.errorLogs` menu grant; nobody (not even super) can
  edit a row. Sorted newest-first.
- **Built-in stats + CSV export** (`src/endpoints/errorStatsExport.ts`), also
  gated on `system.errorLogs`:

  ```text
  GET /api/errorLogs/stats?from=<ISO>&to=<ISO>&granularity=<day|week|month>
      → JSON with three tabs: by period, by exceptionClass (type), by url
  GET /api/errorLogs/stats/export?from&to&granularity&tab=<period|type|url>
      → the same, one tab, as CSV
  ```

  A monitor can poll `…/stats` for a recent window and **alert when the period
  count jumps** over a baseline, and use the `type` tab to see _which_
  `exceptionClass` is spiking (a new class appearing at volume is the strongest
  signal something just broke).

### What to alert on

- **Error-rate spike** — sharp rise in `errorLogs` rows / `stats` period count
  vs. the trailing baseline.
- **A new `exceptionClass`** appearing at volume (regression from a deploy).
- **A single `url` dominating** the `by-url` tab (one broken route/endpoint).

---

## 2. Audit / log collections

All the audit/log collections share the same **append-only, immutable** backbone
(`src/collections/logCollection.ts`): `create` is system-only (written with
`overrideAccess` by the audit writers), `update` is denied for **everyone
including super** (plus a defense-in-depth `beforeChange` reject), and
`read`/`delete` are gated on each collection's privacy menu grant (delete =
retention cleanup by the grant holder). They live under the **Privacy Protection
System** admin group.

| Collection               | Slug                     | Records                                                        | Key fields for alerting                                                                   |
| ------------------------ | ------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Access logs              | `accessLogs`             | Every admin action + **IP-guard denials** (`action: 'denied'`) | `action`, `menuKey`, `actorLabel`, `ipAddress`, `createdAt`                               |
| Login history            | `loginHistory`           | Every admin login attempt (success/fail)                       | `success` (bool), `failReason`, `loginId`, `ipAddress`, `isOverseas`                      |
| Personal-info access log | `personalInfoAccessLogs` | Every PII view/edit/export, with documented purpose            | `action` (view/edit/export), `purposeCategory`, `occurredAt`, `subjectLabel`, `ipAddress` |
| Permission-change log    | `permissionChangeLogs`   | Role/permission grants & revocations                           | who/what/when of a privilege change                                                       |
| Menu-permission log      | `menuPermissionLogs`     | Menu-level permission changes                                  | who/what/when of a menu-access change                                                     |

### Retention

There is **no automatic pruning cron** for these audit collections — that is
deliberate (audit records are meant to persist). Retention is a **manual delete
by the grant holder** (the `delete` access on each collection). If your
compliance policy requires a fixed retention window, run a periodic, audited
delete-by-age against the specific collection; do not expect it to happen on its
own. (Contrast this with `pageViews`, which _is_ auto-pruned — see
[§3](#3-traffic--stats-health-cron-jobs).)

### What to alert on

- **Failed-login spikes** — count `loginHistory` where `success = false` over a
  short window, grouped by `loginId` and/or `ipAddress`. A burst against one
  account = credential-stuffing/brute force; a burst from one IP across many
  accounts = spray. (The OTP throttle + lockout already slow these down; the
  alert is so a human notices.)
- **IP-guard denials** — a rise in `accessLogs` rows with `action = 'denied'`
  means requests are hitting the admin from off-allowlist IPs (misconfiguration,
  or someone probing).
- **Off-hours / overseas PII access** — `personalInfoAccessLogs` with
  `action in (view, export)` at an unusual `occurredAt` hour, or `loginHistory`
  with `isOverseas = true`. Export actions especially warrant review.
- **Permission changes** — any new `permissionChangeLogs` / `menuPermissionLogs`
  row is worth surfacing (privilege escalation is high-signal, low-volume).

---

## 3. Traffic & stats health (cron jobs)

Two background jobs keep the statistics subsystem healthy. Both are **idempotent
cron seams** invoked via package scripts (see the header comments in each
script), scheduled by _your host's_ scheduler (systemd timer / cron / GitHub
Actions / Vercel Cron):

| Job                 | Command                               | What it does                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Traffic aggregation | `pnpm aggregate:traffic [YYYY-MM-DD]` | Rolls raw `pageViews` for the given day (default: **yesterday UTC**) into per-(site, day) `trafficDaily`, then prunes raw views past `PAGEVIEW_RETENTION_DAYS` (only for days already rolled up — never destroys un-aggregated data). Pass `no-prune` to skip the prune. |
| Dormancy sweep      | `pnpm dormancy:sweep [days]`          | Marks `active` accounts with no login in the threshold window (default **90 days**) as `dormant` (blocks them at next login).                                                                                                                                            |

Schedule `aggregate:traffic` **daily, shortly after 00:00 UTC**; `dormancy:sweep`
daily is fine.

### How to confirm the aggregation ran

- The job logs `[traffic] aggregated <date> for N site(s); M view(s) rolled up.`
  and `[traffic] retention: deleted X aged view(s), skipped Y un-aggregated
day(s).` — scrape these lines from the scheduler/job logs.
- **Data-level check:** a `trafficDaily` document should exist for each active
  site for _yesterday_. **Alert if the latest `trafficDaily` date is older than
  ~1 day** — that means the cron did not run (the most common failure is simply
  a missing/mis-scheduled job).
- **Retention sanity:** raw `pageViews` should not accumulate unbounded; the
  oldest `pageViews` should stay within `PAGEVIEW_RETENTION_DAYS`. If it grows
  past that, the prune step is not running (or all recent days are somehow
  un-aggregated).

> Note (from the script header): Payload 3.86 has a native jobs queue, but its
> cron `autoRun` is discouraged on serverless (Vercel). These scripts are the
> established cron seam; promoting them to native jobs later is a drop-in call to
> the same functions.

---

## 4. Health readiness probe (`/health`)

U-CMS ships a minimal readiness endpoint at **`GET /health`**
(`src/app/(frontend)/health/route.ts`) for uptime monitors and orchestrator
probes:

```text
GET /health
200 {"ok":true,"db":true,"version":"<app version>"}    # process up + DB reachable
503 {"ok":false,"db":false,"version":"<app version>"}   # DB ping failed
```

- **Unauthenticated and leaks nothing** — only the two booleans + the app
  version. No stack, no env, no request echo, no DB error text.
- **`db`** is a real `SELECT 1` against the same Postgres pool the app uses, so a
  green response confirms the app can reach its database (not just that the
  process is listening).
- **Not IP-guarded.** It is served from the `(frontend)` route group at the
  top-level `/health`, which is outside the admin IP proxy's matcher
  (`/admin/*`, `/api/*` — see `src/proxy.ts`), so an off-network uptime checker
  is never blocked by the admin allowlist. There was no need to touch the
  guard's exempt list.
- **Cache-busting** — responds with `Cache-Control: no-store` so a CDN/monitor
  never serves a stale "healthy".

Point your uptime monitor (Better Uptime, Pingdom, UptimeRobot, a k8s
readiness/liveness probe, `docker-compose` healthcheck, etc.) at `/health` and
**alert on any non-200**.

---

## 5. Platform & alert recommendations

### Platform surfaces

- **Vercel** (serverless path): use **Vercel → Logs / Observability** for
  function invocations, cold starts, and runtime errors, and **Vercel Cron** (or
  GitHub Actions) to run the [§3](#3-traffic--stats-health-cron-jobs) jobs. The
  app-level `errorLogs`/audit collections are still your richest, structured
  signal — platform logs are the raw stream, the collections are the curated one.
- **Docker / self-host**: wire the container healthcheck to
  [`/health`](#4-health-readiness-probe-health); ship stdout/stderr (the
  Payload logger, incl. the `[traffic]`/`[dormancy]` lines) to your log
  aggregator.
- **Database**: watch the managed DB's own dashboard (Neon/RDS) for connection
  count, CPU, and storage. A rise in connection errors will show up as a `503`
  from `/health` and as DB-connection exceptions in `errorLogs`.

### Recommended alerts (provider-agnostic)

Set these in whatever you use (Vercel, Datadog, Grafana, CloudWatch, a simple
uptime monitor) — the _signal_ matters more than the tool:

| Alert                    | Source                                                        | Suggested trigger                                            |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------ |
| **Uptime / readiness**   | `GET /health`                                                 | Any non-200, or 2 consecutive failed probes                  |
| **5xx / error-rate**     | Platform logs **and** `errorLogs` (or `…/stats` period count) | Error rate over trailing baseline, or a burst of new rows    |
| **DB latency / errors**  | Managed-DB dashboard + `/health` 503s                         | p95 query latency high, connection errors, or repeated 503s  |
| **Failed-login spike**   | `loginHistory` where `success = false`                        | > N failures per account or per IP in a short window         |
| **Off-hours PII access** | `personalInfoAccessLogs` (view/export)                        | Access outside business hours, or any bulk `export`          |
| **Permission change**    | `permissionChangeLogs` / `menuPermissionLogs`                 | Any new row (high-signal, low-volume)                        |
| **Stale traffic rollup** | Latest `trafficDaily` date                                    | Latest date older than ~1 day (aggregation cron not running) |
| **IP-guard denials**     | `accessLogs` where `action = 'denied'`                        | Sustained rise (misconfig or probing)                        |

---

### See also

- [deployment.md](./deployment.md) — Docker & Vercel paths, ops-only env vars,
  the Neon pooler note.
- [backup-restore.md](./backup-restore.md) — Postgres + uploads backup/restore,
  restore drill.
- [DEPLOYMENT.md](../../DEPLOYMENT.md) — canonical Vercel walkthrough + env table.
