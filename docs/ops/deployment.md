# U-CMS deployment (Docker & infra notes)

This doc covers the **Docker / self-hosted** deploy path and cross-cutting deploy
notes. The **Vercel** path (serverless) is fully documented in the canonical
[DEPLOYMENT.md](../../DEPLOYMENT.md) at the repo root — this doc **does not repeat
it**; it complements it.

- **Deploying to Vercel?** → [DEPLOYMENT.md](../../DEPLOYMENT.md).
- **Deploying with Docker / your own host?** → this doc.
- **Env-var reference** → the [table in DEPLOYMENT.md §5](../../DEPLOYMENT.md#5-environment-variables-copy-paste-checklist)
  plus the [ops-only vars](#ops-only-environment-variables) below.

---

## Choosing infra

Both paths run the **same app** and the **same migrate/seed-on-deploy flow**; the
only difference is where the process runs and how the filesystem behaves.

| Concern                      | Vercel (serverless)                                         | Docker / self-hosted (long-running)                             |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Filesystem                   | **Ephemeral** → `STORAGE_DRIVER=s3` is effectively required | Persistent, but S3 still recommended for durability/scaling     |
| Scaling                      | Automatic, per-request                                      | You manage instances/replicas                                   |
| Cron (aggregation, dormancy) | External scheduler (Vercel Cron / GitHub Actions)           | Host scheduler (systemd timer / cron / k8s CronJob)             |
| Migrations on deploy         | In the Build Command (`pnpm ci:deploy`)                     | You run `pnpm ci:migrate` before/at container start (see below) |
| Best when                    | You want zero-ops hosting and a public demo                 | You need a fixed egress IP, VPC networking, or on-prem hosting  |

The [migrations-on-deploy + seed-on-deploy flow](../../DEPLOYMENT.md#reference-what-the-deploy-scripts-do)
(`pnpm ci:migrate` → `pnpm ci:seed`, gated by `SEED_ON_DEPLOY`) is identical on
both — read it once in DEPLOYMENT.md; it is not repeated here.

---

## Docker path

The repo ships a production **Dockerfile** (multi-stage, Next.js standalone
output) and a **docker-compose.yml** that provides the local backing services
(Postgres + Mailpit). Note: `docker-compose.yml` is **dev/backing infra** — it
runs Postgres and Mailpit, **not** the app. The app is built and run from the
Dockerfile.

### 1. Backing services (Postgres + Mailpit)

```bash
docker compose up -d          # starts postgres (5432) + mailpit (1025 SMTP / 8025 UI)
```

`docker-compose.yml` defines:

- **`postgres`** (`postgres:17-alpine`) — user/pass/db all `pulse` / db
  `pulse_cms`, exposed on `5432`, data in the named volume `pulse-cms-db-data`
  (this volume is what a self-host backup must cover — see
  [backup-restore.md](./backup-restore.md#1-postgres-backup)). Has a
  `pg_isready` healthcheck.
- **`mailpit`** — dev SMTP sink on `1025`, web UI/API on `8025`. Used so
  email-sending flows deliver to a real inbox locally. Not for production email.

### 2. Build the app image

The Dockerfile's builder stage sets **`ENV DOCKER_BUILD=1`**, which is the flag
`next.config.ts` keys on to emit **`output: 'standalone'`**. This gate exists so
a normal local `pnpm build` / `pnpm start` (the flow Playwright's e2e webServer
relies on) keeps producing the regular `.next` output, while _only_ the Docker
build gets the standalone bundle it copies out of `.next/standalone`.

```bash
docker build -t ucms:latest .
```

The final image runs as a non-root `nextjs` user, listens on **3000**, and
starts with `node server.js` (the standalone server) bound to `0.0.0.0`.

### 3. Run the app container

The image contains **no env** — supply it at run time. At minimum
`DATABASE_URI` + `PAYLOAD_SECRET`; add `PAYLOAD_PUBLIC_SERVER_URL`, storage, and
SMTP for a real deployment (full meanings in the
[DEPLOYMENT.md env table](../../DEPLOYMENT.md#5-environment-variables-copy-paste-checklist)).

```bash
# Apply migrations first (idempotent). Run once per deploy, before/alongside
# starting the app. `payload migrate` needs the source, so run it from the repo
# (or a one-shot `ucms:latest` override) with the same env:
DATABASE_URI="<DATABASE_URI>" pnpm ci:migrate

# Then run the app image:
docker run --rm -p 3000:3000 \
  -e DATABASE_URI="<DATABASE_URI>" \
  -e PAYLOAD_SECRET="<openssl rand -hex 32>" \
  -e PAYLOAD_PUBLIC_SERVER_URL="https://<your-host>" \
  -e STORAGE_DRIVER=s3 \
  -e S3_BUCKET="<bucket>" -e S3_REGION="<region>" \
  -e S3_ACCESS_KEY_ID="<key>" -e S3_SECRET_ACCESS_KEY="<secret>" \
  -e TRUSTED_PROXY_HOPS=1 \
  ucms:latest
```

Notes:

- If the app container reaches Postgres over the compose network instead of the
  host, point `DATABASE_URI` at the service host (`postgres`), e.g.
  `postgres://pulse:pulse@postgres:5432/pulse_cms`, and attach the container to
  the compose network.
- **`TRUSTED_PROXY_HOPS`** must match your real proxy topology (e.g. `1` behind
  one reverse proxy). It is what lets the admin IP allowlist resolve a real
  client IP; getting it wrong either fails closed or trusts a spoofable header
  (see `.env.example` and
  [DEPLOYMENT.md admin-IP notes](../../DEPLOYMENT.md#admin-ip-guard-on-vercel--pick-one)).
- **First deploy only:** to create the super-admin + seed sites, set
  `SEED_ON_DEPLOY=true` **and** `SEED_ADMIN_PASSWORD` (+ `SEED_MEMBER_PASSWORD`
  if the member step runs) and run `pnpm ci:deploy` instead of `pnpm ci:migrate`;
  then turn seeding back off. The prod seed hard-refuses the built-in default
  passwords — see [DEPLOYMENT.md §6](../../DEPLOYMENT.md#6-first-deploy--log-in--turn-off-seeding).

### 4. Health check for the orchestrator

Point your container/orchestrator readiness probe at **`GET /health`** — it
returns `200 {"ok":true,"db":true,"version":...}` when the process is up and can
reach Postgres, `503` otherwise. It is unauthenticated, leaks nothing, and lives
_outside_ the admin IP guard (see
[monitoring.md §4](./monitoring.md#4-health-readiness-probe-health)).

---

## Neon pooler-vs-direct endpoint (known deploy note)

Neon exposes **two connection endpoints** for the same database:

- a **pooled** endpoint — host contains **`-pooler`**; backed by PgBouncer in
  transaction pooling mode. Best for the serverless request runtime (many short
  connections).
- a **direct** endpoint — no `-pooler`; a normal session connection.

**The gotcha:** `payload migrate` (and other schema/session-level work via
Drizzle) does not run reliably over the **pooled** endpoint, because PgBouncer's
transaction-mode pooling breaks session-scoped state and prepared statements
that migrations rely on. Symptoms range from migration hangs to
`prepared statement "…" does not exist` errors.

**What to do:**

- Run **`pnpm ci:migrate` / `pnpm migrate` against the DIRECT (non-`pooler`)
  connection string.** Backups/restores (`pg_dump`/`pg_restore`) likewise prefer
  the direct endpoint.
- The **pooled** endpoint is fine — and generally preferred — for the running
  app's `DATABASE_URI` on a serverless host.
- If you keep a single `DATABASE_URI` for both, use the **direct** one so
  migrations always succeed; the small connection-count tradeoff is acceptable
  for a demo. Keep the `?sslmode=require` suffix on either endpoint.

This applies to any PgBouncer-fronted Postgres (Supabase's pooler, self-hosted
PgBouncer), not only Neon.

---

## Ops-only environment variables

These are **not** in the DEPLOYMENT.md checklist (that table covers the vars a
first deploy needs). They tune background/ops behavior and all have safe
defaults, so they are optional:

| Variable                                                                          | Default                        | Purpose                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAGEVIEW_RETENTION_DAYS`                                                         | `90`                           | Retention window for raw `pageViews` before the aggregation job prunes them (only for already-rolled-up days). See [monitoring.md §3](./monitoring.md#3-traffic--stats-health-cron-jobs). |
| `PUBLIC_RATE_LIMIT_MAX` / `PUBLIC_RATE_LIMIT_WINDOW_MIN`                          | `10` / `10`                    | Public unauthenticated-endpoint rate limiter (per IP + endpoint). Process-local.                                                                                                          |
| `TRACK_RATE_LIMIT_MAX` / `TRACK_RATE_LIMIT_WINDOW_MIN` / `TRACK_DEDUP_WINDOW_MIN` | limiter + dedup defaults       | Public traffic-tracking (`/track`) rate-limit + view de-duplication windows.                                                                                                              |
| `ADMIN_IDLE_TIMEOUT_MIN`                                                          | `30`                           | Idle auto-logout window for the admin (client-side inactivity timer).                                                                                                                     |
| `TRAFFIC_SECRET` / `SATISFACTION_SECRET` / `SURVEY_PARTICIPANT_SECRET`            | falls back to `PAYLOAD_SECRET` | Optional dedicated HMAC secrets for signing traffic/satisfaction/survey tokens. Leave unset to reuse `PAYLOAD_SECRET`.                                                                    |

See `.env.example` for the authoritative inline documentation of each.

---

### See also

- [DEPLOYMENT.md](../../DEPLOYMENT.md) — canonical Vercel walkthrough + full env
  table + HTTP-500 troubleshooting.
- [backup-restore.md](./backup-restore.md) — Postgres + uploads backup/restore.
- [monitoring.md](./monitoring.md) — monitoring, alerts, cron-job health, the
  `/health` probe.
