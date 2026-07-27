# U-CMS backup & restore runbook

A precise, parameterized runbook for backing up and restoring U-CMS (Payload
CMS 3 + Next.js 16 + Postgres). U-CMS keeps **all durable state in two places**:

1. **Postgres** — every collection (content, members, audit/log tables, traffic
   rollups, admin config). This is the system of record.
2. **Object storage** — the bytes of uploaded files (the `media` and
   `attachments` upload pools). In production this is an S3-compatible bucket;
   in local dev it is the ephemeral container/host filesystem.

Everything else (the built app, `.next` output, in-memory rate-limit state) is
**reproducible or ephemeral** and is _not_ part of a backup — see
[What is NOT in a backup](#what-is-not-in-a-backup).

> Commands below use placeholders in `<angle brackets>`. Never commit real
> secrets. All connection strings come from the same `DATABASE_URI` /`S3_*`
> env vars the app uses (see [DEPLOYMENT.md](../../DEPLOYMENT.md#5-environment-variables-copy-paste-checklist)).

---

## 1. Postgres backup

### 1a. Logical backup with `pg_dump` (works for any Postgres — Neon, RDS, self-host)

`pg_dump` produces a portable snapshot. Use the **custom format** (`-Fc`) — it is
compressed and restores selectively with `pg_restore`.

```bash
# Full database, custom (compressed) format.
pg_dump "<DATABASE_URI>" \
  --format=custom \
  --no-owner --no-privileges \
  --file="ucms-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Notes:

- `<DATABASE_URI>` is the exact connection string from your environment. For
  Neon keep the `?sslmode=require` suffix. **Prefer the _direct_ (non-pooled)
  endpoint for dumps/restores** — see the
  [pooler-vs-direct note in the deployment doc](./deployment.md#neon-pooler-vs-direct-endpoint-known-deploy-note).
- `--no-owner --no-privileges` makes the dump restore cleanly into a fresh
  managed database whose role names differ from the source.
- A plain-SQL alternative (human-readable, restore with `psql`):

  ```bash
  pg_dump "<DATABASE_URI>" --no-owner --no-privileges \
    | gzip > "ucms-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  ```

Verify the dump is non-empty and readable before trusting it:

```bash
pg_restore --list "ucms-<timestamp>.dump" | head    # custom format
# or, for the SQL variant:
gzip -t "ucms-<timestamp>.sql.gz" && echo "archive OK"
```

### 1b. Neon-native protection (use _in addition_ to `pg_dump`)

If you host Postgres on Neon (the path DEPLOYMENT.md documents), you also get
provider-side protection that needs no cron of your own:

- **Point-in-time restore (PITR):** Neon retains a history window and can create
  a new branch at any timestamp inside it (Neon dashboard → project → **Restore**
  / **Branches**). This recovers from "someone deleted the wrong rows an hour
  ago" without a dump. Confirm the retention window on your plan (free-tier
  windows are short — treat PITR as a convenience, not your only line of
  defense).
- **Branching:** create a cheap copy-on-write branch of the DB to test a restore
  or a migration without touching production, then point a throwaway app
  instance at the branch's connection string.

> Neon PITR/branching protects the **managed instance**. It does **not** protect
> against losing the whole Neon project/account. Keep the portable `pg_dump`
> artifacts (1a) somewhere independent (e.g. a different cloud/bucket) so a
> provider-level loss is still recoverable.

### 1c. Cadence recommendation

| Data                     | Mechanism                                 | Cadence                                                           |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| Postgres (logical)       | `pg_dump -Fc` → off-site copy             | **Daily**, retain 7 daily + 4 weekly + 3 monthly (adjust to plan) |
| Postgres (point-in-time) | Neon PITR window                          | Continuous (provider-managed); verify the window covers your RPO  |
| Before any risky change  | On-demand `pg_dump` **and** a Neon branch | Every migration deploy / bulk data operation                      |

Automate 1a from the same scheduler that runs the traffic-aggregation and
dormancy cron jobs (see [monitoring.md](./monitoring.md#3-traffic--stats-health-cron-jobs)).

---

## 2. Uploads / object storage backup

U-CMS has **two upload pools** and both are toggled between local and S3 by the
single `STORAGE_DRIVER` env var (see `src/payload.config.ts`):

| Pool          | Collection   | Visibility                                                                                     | Public file route                                                 |
| ------------- | ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `media`       | Public       | Display assets only — site logos, banner/popup images the public site renders unauthenticated. | `GET /api/media/file/*`                                           |
| `attachments` | Access-gated | Board/post + admin-notice files (incl. **secret**), **tenant-scoped** (Task 4-zero).           | never raw; via `/api/files/download` (enforces `canDownloadPost`) |

Both pools store bytes in the **same driver target**: the local filesystem when
`STORAGE_DRIVER=local` (default), or an S3-compatible bucket when
`STORAGE_DRIVER=s3` (both `media: true` and `attachments: true` are registered
on the S3 plugin). The **access-control split is enforced by the app**, not by
separate buckets — a private bucket ACL is correct and sufficient because the
only sanctioned attachment download path re-checks `canDownloadPost`.

### 2a. Production (`STORAGE_DRIVER=s3`) — the bucket IS the durable store

There is no separate "upload backup" step to run against the app: the bucket
_is_ the durable copy of every uploaded byte. Protect the bucket itself:

- **Enable object versioning** on the bucket (AWS S3 versioning / Cloudflare R2
  versioning). This turns an accidental overwrite or delete into a recoverable
  previous version.
- **Add a lifecycle rule** to expire noncurrent versions after a retention
  window (e.g. 30–90 days) so versioning does not grow unbounded.
- **(Optional) cross-region / cross-account replication** for the same
  provider-loss reason as the DB: keep an independent copy.
- To take an explicit point-in-time snapshot of the pool, mirror the bucket:

  ```bash
  # AWS CLI (S3):
  aws s3 sync "s3://<S3_BUCKET>" "s3://<backup-bucket>/ucms-$(date -u +%Y%m%d)/"

  # Cloudflare R2 (S3-compatible — pass the R2 endpoint):
  aws s3 sync "s3://<S3_BUCKET>" "./ucms-uploads-$(date -u +%Y%m%d)/" \
    --endpoint-url "https://<accountid>.r2.cloudflarestorage.com"
  ```

### 2b. Local dev (`STORAGE_DRIVER=local` / unset) — ephemeral, not backed up

Local-disk uploads are **development-only and intentionally not part of any
backup**. On serverless hosts the filesystem is ephemeral (a file written in one
invocation is gone in the next), which is exactly why production must use
`STORAGE_DRIVER=s3` (see
[DEPLOYMENT.md §2](../../DEPLOYMENT.md#2-provision-object-storage-cloudflare-r2-or-aws-s3--recommended)).
Do not rely on local uploads surviving a container rebuild.

---

## 3. Restore drill (checklist)

Run this end-to-end against a **throwaway target** (a scratch DB / Neon branch +
a scratch bucket) at least once per quarter, so the runbook is proven before you
need it in anger.

1. **Provision a target DB.** A fresh empty Postgres, or a Neon branch. Capture
   its connection string as `RESTORE_DATABASE_URI` (use the **direct/non-pooled**
   endpoint for the restore).
2. **Restore Postgres:**

   ```bash
   # custom-format dump:
   pg_restore --no-owner --no-privileges \
     --dbname="<RESTORE_DATABASE_URI>" "ucms-<timestamp>.dump"

   # or SQL variant:
   gunzip -c "ucms-<timestamp>.sql.gz" | psql "<RESTORE_DATABASE_URI>"
   ```

3. **Point storage at the restored bytes.** Set `STORAGE_DRIVER=s3` and the
   `S3_*` vars to the bucket that holds the uploads (the live bucket, or a
   restored copy from step 2a). File _references_ live in Postgres; the _bytes_
   live in the bucket, so both halves must line up.
4. **Bring the schema to head.** Migrations are idempotent and safe to re-run:

   ```bash
   DATABASE_URI="<RESTORE_DATABASE_URI>" pnpm migrate
   ```

   (`pnpm migrate` → `payload migrate`. On a deploy this is `pnpm ci:migrate`;
   see [DEPLOYMENT.md](../../DEPLOYMENT.md#reference-what-the-deploy-scripts-do).)
   A dump taken from a fully-migrated DB is already at head — this step is the
   belt-and-braces that also lets you restore an _older_ dump and roll it forward.

5. **Verify.** Point a scratch app instance at `RESTORE_DATABASE_URI` and:
   - `pnpm migrate:status` shows no pending migrations;
   - `GET /health` returns `{ "ok": true, "db": true }` (see
     [monitoring.md](./monitoring.md#4-health-readiness-probe-health));
   - log in at `/admin`, open a few collections (content, members, an audit log)
     and confirm row counts look sane;
   - open a post with an attachment and confirm the file downloads via
     `/api/files/download` (proves the DB↔bucket references match);
   - load the public site (`/`) and confirm a `media` image (a logo/banner)
     renders.

Record how long the drill took — that is your realistic **RTO**.

---

## What is NOT in a backup

These are deliberately excluded because they are ephemeral or reproducible:

- **Local-disk uploads** (`STORAGE_DRIVER=local`) — dev-only, ephemeral (§2b).
- **In-memory public rate-limit state** — the public-endpoint limiter and the
  OTP throttle are process-local (see `PUBLIC_RATE_LIMIT_*` in `.env.example`).
  A restart/redeploy resets the windows; there is nothing to back up. (A future
  distributed/Redis limiter would change this.)
- **Built artifacts** — `.next/`, `node_modules/`, the standalone Docker output.
  Rebuilt from source + `pnpm-lock.yaml` on every deploy.
- **Secrets** — `PAYLOAD_SECRET`, `DATABASE_URI`, `S3_*`, SMTP creds. These live
  in your host's secret store / env config, **not** in the DB dump. Keep them in
  a password manager or secrets vault; a DB restore is useless without the same
  `PAYLOAD_SECRET` (it is used to sign tokens).

---

### See also

- [deployment.md](./deployment.md) — Docker & Vercel deploy paths, env-var
  reference, the Neon pooler-vs-direct note.
- [monitoring.md](./monitoring.md) — what to watch, the cron jobs, the `/health`
  probe.
- [DEPLOYMENT.md](../../DEPLOYMENT.md) — the canonical Vercel walkthrough and the
  full env-var table.
