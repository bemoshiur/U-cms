# Operations (for administrators & operators)

This page is the operator's map, not the manual itself. It orients you around the four things that keep a live U-CMS deployment healthy — **backups, deployment, monitoring/alerts, and the `/health` probe** — and points you to the detailed runbook for each. The step-by-step procedures (exact commands, env vars, restore drill) live in the runbooks under `docs/ops/` and in the root `DEPLOYMENT.md`; this page tells you which one to open and flags the handful of gotchas that actually bite operators. Everything here is infrastructure/hosting concern — none of it maps to the legacy Korean manual, which documents in-app screens only (its closest surfaces are **System Management → Error Log**, legacy PDF 59–62, and **Access Statistics / History**, legacy PDF 57–58, both covered as monitoring signals below).

> **Who this is for.** These tasks assume access to the hosting platform (Vercel or your Docker host), the database provider (Neon/RDS/etc.), and the object-storage bucket — not just the `/admin` back office. A content operator does **not** need this page; a deployment/ops owner does.

---

## The runbooks at a glance

| I need to…                          | Open                                                                                                        | Covers                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Back up or restore data             | [`docs/ops/backup-restore.md`](../ops/backup-restore.md)                                                    | Postgres `pg_dump`, Neon point-in-time restore, the two upload pools, the quarterly restore drill |
| Deploy or redeploy the app          | [`DEPLOYMENT.md`](../../DEPLOYMENT.md) (Vercel) · [`docs/ops/deployment.md`](../ops/deployment.md) (Docker) | Import to Vercel, env-var checklist, the Docker image, migrations-on-deploy, first-deploy seeding |
| Watch a running system / set alerts | [`docs/ops/monitoring.md`](../ops/monitoring.md)                                                            | Error logs, audit logs, traffic cron jobs, the `/health` probe, recommended alerts                |
| Add an uptime check                 | [`docs/ops/monitoring.md` §4](../ops/monitoring.md#4-health-readiness-probe-health)                         | The `GET /health` readiness endpoint                                                              |

---

## 1. Backup & restore

**Runbook:** [`docs/ops/backup-restore.md`](../ops/backup-restore.md)

U-CMS keeps all durable state in exactly **two places**, and a backup must cover both:

1. **Postgres** — every collection: content, members, audit/log tables, traffic rollups, admin config. This is the system of record.
2. **Object storage** — the bytes of uploaded files, across two pools: **`media`** (public logos/banners) and **`attachments`** (access-gated board/post and admin-notice files). In production these live in your S3-compatible bucket; the database only holds the _references_, so the two halves must always line up.

What to actually do:

- **Postgres:** take a daily `pg_dump -Fc` off-site copy, and (if on Neon) lean on provider point-in-time restore for "someone deleted the wrong rows an hour ago" recovery. The runbook has the exact commands and a cadence table.
- **Uploads:** in production the bucket _is_ the durable copy — there is no separate app-side upload backup step. Protect the bucket with **object versioning** plus a lifecycle rule for noncurrent versions.
- **Prove it works:** run the [restore drill](../ops/backup-restore.md#3-restore-drill-checklist) against a throwaway target at least once a quarter. The drill ends by checking `GET /health` returns `{"ok":true,"db":true}` and that an attachment still downloads.

> **Gotcha — local uploads are not backed up.** With `STORAGE_DRIVER=local` (the dev default) uploaded files live on the container/host filesystem and are **ephemeral** — gone on the next redeploy, and deliberately excluded from every backup. Production must run `STORAGE_DRIVER=s3`. If files "vanish after a while", this is why.

> **Gotcha — the DB dump is useless without `PAYLOAD_SECRET`.** Secrets (`PAYLOAD_SECRET`, `DATABASE_URI`, `S3_*`, SMTP) are **not** in the dump. `PAYLOAD_SECRET` signs auth tokens, so a restore into a deployment with a _different_ secret invalidates sessions. Keep secrets in your host's secret store / a password manager.

---

## 2. Deployment

**Runbooks:** [`DEPLOYMENT.md`](../../DEPLOYMENT.md) is the canonical **Vercel** walkthrough (env-var checklist + HTTP-500 troubleshooting). [`docs/ops/deployment.md`](../ops/deployment.md) covers the **Docker / self-hosted** path and cross-cutting deploy notes.

Both paths run the **same app** and the **same migrate → seed flow**; only where the process runs and how the filesystem behaves differ. Key facts:

- **Build/deploy runs migrations automatically.** The build command is `pnpm ci:deploy && pnpm build`. `pnpm ci:deploy` = `pnpm ci:migrate` (applies all Payload migrations — idempotent, safe on an empty DB) then `pnpm ci:seed` (a no-op unless `SEED_ON_DEPLOY=true`). On Docker you run `pnpm ci:migrate` yourself before/at container start.
- **First deploy only:** set `SEED_ON_DEPLOY=true` to create the super-admin, the `bos`/`demo` sites, and demo content — then turn it back off and redeploy. The seed is idempotent.
- **Object storage & email** are configured by env var (`STORAGE_DRIVER=s3` + `S3_*`; `SMTP_*` to enable email — unset means email is _logged, not sent_, which is fine for a demo).

> **Gotcha — Neon pooler vs. direct endpoint.** `payload migrate` does **not** run reliably over Neon's **pooled** (`-pooler` in the host) endpoint — you get hangs or `prepared statement "…" does not exist` errors. Run **`pnpm ci:migrate` against the DIRECT (non-`pooler`) connection string.** The running app can use the pooled endpoint. Same applies to any PgBouncer-fronted Postgres. See the [pooler note](../ops/deployment.md#neon-pooler-vs-direct-endpoint-known-deploy-note).

> **Gotcha — a prod seed refuses the built-in default passwords.** When `SEED_ON_DEPLOY=true` in production, `SEED_ADMIN_PASSWORD` is **mandatory** (and `SEED_MEMBER_PASSWORD` if the member step runs). The seed hard-fails fast rather than create an admin with the known dev-only default (`changeme-dev-only!`) on a public URL. Set a strong value and redeploy.

> **Gotcha — the admin IP guard and `TRUSTED_PROXY_HOPS`.** The `/admin` back office is behind a default-deny IP allowlist (the seed installs a bootstrap `*` allow-all rule so you are not locked out on day one). Set `TRUSTED_PROXY_HOPS` to match your proxy topology (`1` on Vercel / behind one reverse proxy) so the guard can resolve a real client IP; otherwise `/admin` can 503 with "Admin temporarily unavailable" once you narrow the allowlist. For a quick demo, `ADMIN_IP_ENFORCEMENT=off` bypasses the guard entirely.

**Try it on the demo:** the deployed demo runs on Vercel. Log in at `/admin` with Login ID `admin` (email = `SEED_ADMIN_EMAIL`; on the deployed demo that is `moshiur@ticonsys.com`, local-dev default `admin@publicpulse.com.bd`; password = `SEED_ADMIN_PASSWORD`, local-dev default `changeme-dev-only!`). This account holds **Super Administrator** (`ROLE_ADMIN`, _isSuper_) + **Privacy Officer**, so it can reach every ops-relevant screen (Error Log, all audit logs, statistics).

---

## 3. Monitoring & alerts

**Runbook:** [`docs/ops/monitoring.md`](../ops/monitoring.md)

U-CMS records most of its own health in **first-class collections**, so monitoring is largely _querying data the app already keeps_ rather than bolting on an external agent. The signals, and where they surface in `/admin`:

- **Error Log (`errorLogs`)** — append-only, immutable record of every captured `>= 500` exception (sanitized message, `exceptionClass`, `url`, acting admin, IP, time). Under the **Audit** admin group. There is a built-in stats + CSV export at `GET /api/errorLogs/stats` and `…/stats/export`. Alert on an error-rate spike or a new `exceptionClass` appearing at volume. _(Legacy: System Management → Error Log, PDF 59–62.)_
- **Audit / log collections** under **Privacy Protection System** — `accessLogs` (admin actions + IP-guard denials), `loginHistory` (every login attempt, success/fail), `personalInfoAccessLogs` (PII view/edit/export with purpose), `permissionChangeLogs`, `menuPermissionLogs`. All append-only and immutable — even super admins cannot edit a row. Alert on failed-login spikes, IP-guard denials, off-hours/overseas PII access, and any permission change.
- **Traffic & statistics** — `trafficDaily` rollups. _(Legacy: Access Statistics / History, PDF 57–58.)_

### Background cron jobs

Two idempotent jobs must be scheduled by **your host's scheduler** (Vercel Cron, GitHub Actions, systemd timer, k8s CronJob) — they are not auto-run by the app:

| Job                 | Command                               | Schedule                       | Purpose                                                                                                                                                       |
| ------------------- | ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Traffic aggregation | `pnpm aggregate:traffic [YYYY-MM-DD]` | Daily, shortly after 00:00 UTC | Rolls raw `pageViews` into per-(site, day) `trafficDaily`, then prunes raw views older than `PAGEVIEW_RETENTION_DAYS` (default 90) for already-rolled-up days |
| Dormancy sweep      | `pnpm dormancy:sweep [days]`          | Daily                          | Marks `active` accounts with no login in the window (default 90 days) as `dormant`                                                                            |

> **Gotcha — audit logs are never auto-pruned.** Unlike `pageViews` (auto-pruned by the aggregation job), the audit/log collections have **no cleanup cron** by design — audit records are meant to persist. If a retention policy requires a fixed window, the grant holder must run a periodic, audited delete-by-age manually.

> **Gotcha — a stale `trafficDaily` means the cron did not run.** If the newest `trafficDaily` date is older than ~1 day, the aggregation job is missing or mis-scheduled — the single most common ops failure here. Alert on it.

---

## 4. The `/health` readiness probe

**Reference:** [`docs/ops/monitoring.md` §4](../ops/monitoring.md#4-health-readiness-probe-health)

U-CMS ships one unauthenticated readiness endpoint for uptime monitors and orchestrator probes:

```text
GET /health
200 {"ok":true,"db":true,"version":"<app version>"}    # process up + database reachable
503 {"ok":false,"db":false,"version":"<app version>"}   # database ping failed
```

- **`db` is a real check** — a `SELECT 1` against the same Postgres pool the app uses, so a green response means the process is up _and_ can reach its database.
- **Leaks nothing** — only the two booleans plus the app version. No stack, no env, no error text.
- **Not IP-guarded** — it is served at the top-level `/health` (outside the `/admin` + `/api` matcher of the admin IP guard), so an off-network uptime checker is never blocked. It also responds `Cache-Control: no-store` so a monitor never sees a stale "healthy".

**To wire it up:**

1. Point your uptime monitor (Better Uptime, Pingdom, UptimeRobot, a k8s readiness/liveness probe, or a `docker-compose` healthcheck) at `https://<your-host>/health`.
2. **Alert on any non-200** (or two consecutive failed probes).

**Try it on the demo:** open `https://<your-host>/health` in a browser (or `curl` it) — you should get the `200` JSON above. No login required.

---

## Ops-only environment variables

A running deployment needs the vars in the [DEPLOYMENT.md checklist](../../DEPLOYMENT.md#5-environment-variables-copy-paste-checklist). Beyond those, a few **optional** knobs tune background/ops behavior (all have safe defaults) — see the [full table](../ops/deployment.md#ops-only-environment-variables) and `.env.example`:

- `PAGEVIEW_RETENTION_DAYS` (default `90`) — how long raw `pageViews` are kept before the aggregation job prunes them.
- `ADMIN_IDLE_TIMEOUT_MIN` (default `30`) — idle auto-logout window for the admin.
- `PUBLIC_RATE_LIMIT_*` / `TRACK_RATE_LIMIT_*` — public-endpoint and traffic-tracking rate limiters (process-local; reset on redeploy).
- `TRAFFIC_SECRET` / `SATISFACTION_SECRET` / `SURVEY_PARTICIPANT_SECRET` — optional dedicated HMAC secrets; fall back to `PAYLOAD_SECRET` if unset.

---

## Not in this build

- **No in-app backup/restore, deploy, or server-management screen.** All operations here are performed on the hosting platform, database provider, and object storage via the runbooks above — not from `/admin`. The legacy Korean manual likewise has no such screens (it documents functional CMS screens only), so there is nothing omitted versus the manual here.
- **No built-in scheduler.** The traffic-aggregation and dormancy-sweep jobs are cron _seams_ invoked by package scripts; you schedule them with your host's scheduler. (Payload 3.86 has a native jobs queue, but its cron `autoRun` is discouraged on serverless — promoting these scripts to native jobs later is a drop-in change.)
- **No distributed rate-limit / OTP-throttle state.** The public rate limiter and OTP throttle are process-local and reset on restart/redeploy; there is nothing to back up. A future Redis-backed limiter would change this.
- **No public data standardization / DBA proposal management.** The legacy manual's System Management → Public Data Standardization screens (legacy PDF 63–78) are not built in this version.

---

### See also

- [`docs/ops/backup-restore.md`](../ops/backup-restore.md) — Postgres + uploads backup/restore, the restore drill.
- [`docs/ops/deployment.md`](../ops/deployment.md) — Docker path, ops-only env vars, the Neon pooler note.
- [`docs/ops/monitoring.md`](../ops/monitoring.md) — error logs, audit logs, cron-job health, the `/health` probe, recommended alerts.
- [`DEPLOYMENT.md`](../../DEPLOYMENT.md) — canonical Vercel walkthrough, full env-var table, HTTP-500 troubleshooting.
- [`sites-accounts-roles.md`](./sites-accounts-roles.md) — the admin IP allowlist, roles, and lockout-safety rules referenced above.
