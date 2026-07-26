# Deploying U-CMS to Vercel

A precise, ordered walkthrough to get a live demo of U-CMS (Payload CMS 3 +
Next.js 16 + Postgres) running on Vercel. U-CMS was built Docker-first; this
guide covers the serverless-specific configuration that makes it boot and run on
Vercel (managed migrations, S3-compatible storage, email/IP-guard postures).

> **TL;DR** — Provision a Postgres DB and (optionally) an S3 bucket, import the
> repo into Vercel, set the env vars in the table below, set the Build Command to
> `pnpm ci:deploy && pnpm build`, deploy once with `SEED_ON_DEPLOY=true`, log in
> at `/admin`, then set `SEED_ON_DEPLOY=false`.

---

## 1. Provision Postgres (Neon free tier)

1. Create an account at <https://neon.tech> and create a new project (choose a
   region close to your Vercel region).
2. In the project dashboard, open **Connection Details** and copy the
   **connection string**. It looks like:

   ```
   postgres://<user>:<password>@<host>.neon.tech/<db>?sslmode=require
   ```

3. Keep the `?sslmode=require` suffix — Neon requires TLS. This whole string is
   your `DATABASE_URI`.

> Any Postgres works (Supabase, RDS, etc.); Neon is used here for its free tier.
> The schema is created by **migrations at deploy time** (step 4) — you do **not**
> run any SQL by hand.

## 2. Provision object storage (Cloudflare R2 or AWS S3) — recommended

On Vercel the filesystem is **ephemeral**: a file uploaded in one serverless
invocation is not on disk in another. So **file uploads/downloads only persist
with S3-compatible storage**. Both upload pools — `media` (public logos/banners)
and `attachments` (access-controlled board/post files) — go to the bucket.

- **Without storage** you can still run a **login + browse demo** (admin UI,
  content browsing, member auth all work). Only file **upload/download** won't
  persist. Set `STORAGE_DRIVER=local` (or omit it) for that.
- **With storage**, set `STORAGE_DRIVER=s3` plus the `S3_*` vars.

**Cloudflare R2** (S3-compatible, generous free tier):

1. Cloudflare dashboard → **R2** → create a bucket.
2. **R2 → Manage R2 API Tokens** → create a token with Object Read & Write →
   note the **Access Key ID** and **Secret Access Key**.
3. Your account's S3 endpoint is `https://<accountid>.r2.cloudflarestorage.com`.
4. Set: `S3_BUCKET=<bucket>`, `S3_REGION=auto`, `S3_ENDPOINT=<the endpoint>`,
   `S3_ACCESS_KEY_ID=…`, `S3_SECRET_ACCESS_KEY=…`.

**AWS S3**: create a bucket, an IAM user with `s3:PutObject`/`GetObject`/
`DeleteObject` on it, and set `S3_BUCKET`, `S3_REGION` (e.g. `us-east-1`),
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (no `S3_ENDPOINT` needed for AWS).

> **Security note:** `attachments` remain access-controlled under S3. The bucket
> only ever receives bytes; the raw `/api/attachments/file/*` route stays
> tenant-gated and the only sanctioned download path is
> `/api/files/download` (which enforces `canDownloadPost` before serving any
> byte). A **private** bucket ACL is fine and recommended.

## 3. (Optional) SMTP for email

Email (password-reset, recovery, notifications) is **optional for a demo**.

- **Leave SMTP unset** → in production, email is **disabled**: send attempts are
  **logged, not delivered** (a one-time warning is printed at boot). The app
  boots and runs normally; only email delivery is off.
- **To enable email**, use any SMTP provider (Resend, AWS SES, etc.) and set
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (and `SMTP_SECURE=true` for
  implicit TLS / port 465).

> Production **never** falls back to a localhost relay — that protection is
> intact. It either uses your configured SMTP or disables email; it never
> silently sends to `localhost`.

## 4. Import the repo into Vercel

1. <https://vercel.com> → **Add New… → Project** → import
   `github.com/bemoshiur/U-cms`.
2. **Framework Preset:** Next.js (auto-detected).
3. **Production Branch:** set to your deploy branch (e.g. `main` or
   `feature/phase-4-public-site`).
4. **Install Command:** `pnpm install` (auto-detected from `pnpm-lock.yaml`; also
   pinned in `vercel.json`).
5. **Build Command:** `pnpm ci:deploy && pnpm build`.
   - `pnpm ci:deploy` runs **`pnpm ci:migrate`** (applies all Payload migrations
     to the DB — idempotent, safe on an empty DB and safe to re-run) then
     **`pnpm ci:seed`** (a **no-op unless `SEED_ON_DEPLOY=true`**).
   - `pnpm build` then builds the Next.js app **after** the schema exists.
   - This is already set as `buildCommand` in `vercel.json`, so Vercel picks it
     up automatically; the field above is where to confirm/override it.

> Migrations run during the **build step** (which has DB network access and a
> generous timeout), so the schema is guaranteed to exist before the app serves
> its first request — this is what fixes the "empty DB → HTTP 500" symptom.

## 5. Environment variables (copy-paste checklist)

Set these in **Vercel → Project → Settings → Environment Variables** (Production,
and Preview if you use it):

| Variable                    | Required?                                      | Value / how to get it                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URI`              | **Yes**                                        | Neon connection string from step 1 (keep `?sslmode=require`).                                                                                                                                                                                                                                                                                                         |
| `PAYLOAD_SECRET`            | **Yes**                                        | A long random secret. Generate: `openssl rand -hex 32`.                                                                                                                                                                                                                                                                                                               |
| `PAYLOAD_PUBLIC_SERVER_URL` | **Yes** (prod)                                 | Your stable public origin, e.g. `https://u-cms-jet.vercel.app` (or your custom domain). Used to build password-reset links; must be your real host (CWE-640 fix). Prefer a **stable** domain over the per-deploy `VERCEL_URL`.                                                                                                                                        |
| `PUBLIC_SITE_ID`            | Recommended                                    | `demo` — the seeded public-facing site the frontend renders.                                                                                                                                                                                                                                                                                                          |
| `STORAGE_DRIVER`            | Recommended                                    | `s3` to persist uploads (step 2), or `local`/omit for a login-only demo.                                                                                                                                                                                                                                                                                              |
| `S3_BUCKET`                 | If `s3`                                        | Bucket name.                                                                                                                                                                                                                                                                                                                                                          |
| `S3_REGION`                 | If `s3`                                        | AWS region, or `auto` for R2.                                                                                                                                                                                                                                                                                                                                         |
| `S3_ENDPOINT`               | If `s3` (R2)                                   | `https://<accountid>.r2.cloudflarestorage.com` (omit for AWS S3).                                                                                                                                                                                                                                                                                                     |
| `S3_ACCESS_KEY_ID`          | If `s3`                                        | Access key.                                                                                                                                                                                                                                                                                                                                                           |
| `S3_SECRET_ACCESS_KEY`      | If `s3`                                        | Secret key.                                                                                                                                                                                                                                                                                                                                                           |
| `S3_FORCE_PATH_STYLE`       | If needed                                      | `true` for some S3-compatible providers (usually unset for AWS/R2).                                                                                                                                                                                                                                                                                                   |
| `SMTP_HOST`                 | Optional                                       | SMTP host to **enable** email (step 3). Unset → email disabled.                                                                                                                                                                                                                                                                                                       |
| `SMTP_PORT`                 | Optional                                       | e.g. `587`.                                                                                                                                                                                                                                                                                                                                                           |
| `SMTP_USER` / `SMTP_PASS`   | Optional                                       | Must be set **together** or both omitted.                                                                                                                                                                                                                                                                                                                             |
| `SMTP_SECURE`               | Optional                                       | `true` for implicit TLS (port 465).                                                                                                                                                                                                                                                                                                                                   |
| `TRUSTED_PROXY_HOPS`        | Recommended                                    | **`1`** on Vercel — Vercel appends the real client IP as the last `X-Forwarded-For` hop. Required for admin IP allowlisting to resolve a real client IP.                                                                                                                                                                                                              |
| `ADMIN_IP_ENFORCEMENT`      | Optional                                       | `off` fully disables the admin IP guard (simplest for a demo). Leave unset to keep it on (see below).                                                                                                                                                                                                                                                                 |
| `SEED_ON_DEPLOY`            | First deploy only                              | `true` on the **first** deploy to create the super-admin + sites, then set to `false`.                                                                                                                                                                                                                                                                                |
| `SEED_ADMIN_EMAIL`          | With seed                                      | The super-admin login email to create (defaults to `admin@publicpulse.com.bd`).                                                                                                                                                                                                                                                                                       |
| `SEED_ADMIN_PASSWORD`       | **REQUIRED** with a prod seed                  | The super-admin password. **Mandatory** when `SEED_ON_DEPLOY=true` in production — the seed **hard-refuses** to create the admin with the built-in dev default (a known credential on a public URL), so a prod seed without this fails fast. Use a strong, unique value.                                                                                              |
| `SEED_MEMBER_PASSWORD`      | **REQUIRED** when a prod seed creates a member | The password for the seeded login-capable demo member. **Mandatory** when `SEED_ON_DEPLOY=true` in production and the `members` seed step runs — the seed **hard-refuses** to create the demo member with the built-in dev default (`Pulse-Member-2026`, a known credential in this public repo), so a prod seed without this fails fast. Use a strong, unique value. |

### Admin IP guard on Vercel — pick one

The admin back-office is protected by a default-deny IP allowlist. The seed
installs a bootstrap `*` (allow-all) rule, so **out of the box it does not lock
you out**:

- **Simplest for a demo:** set `ADMIN_IP_ENFORCEMENT=off`. The guard is fully
  bypassed.
- **Keep it on:** set `TRUSTED_PROXY_HOPS=1`. With the seeded `*` allow rule the
  allowlist is effectively unrestricted, so the guard **allows** rather than
  failing closed even before you narrow it. When you later replace `*` with your
  own office/VPN allow rules (or add any `block` rule), the guard becomes
  genuinely restrictive and — correctly — fails closed for any request whose IP
  it cannot resolve. At that point `TRUSTED_PROXY_HOPS=1` is what lets it resolve
  the real client IP.

## 6. First deploy → log in → turn off seeding

1. With `SEED_ON_DEPLOY=true` and **`SEED_ADMIN_PASSWORD` set to a strong value**
   (plus optionally `SEED_ADMIN_EMAIL`), trigger a deploy. The build runs
   migrations then the seed (super-admin + `bos`/`demo` sites + demo content).
   The seed is **idempotent**. If you run a production seed **without**
   `SEED_ADMIN_PASSWORD`, the build fails fast with a clear error rather than
   creating an admin with the known dev-only default password — set the password
   and redeploy.
2. Visit `https://<your-domain>/admin` and log in with the seeded credentials.
   (Log in at `/` for the public member site.)
3. In Vercel, set **`SEED_ON_DEPLOY=false`** (or remove it) and redeploy. Future
   builds still run migrations but skip seeding.

## 7. Troubleshooting the HTTP 500 causes

| Symptom                                                                   | Likely cause                                                    | Fix                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 500 on every route, logs mention DB connection                            | `DATABASE_URI` missing/wrong, or missing `?sslmode=require`     | Set a correct `DATABASE_URI`.                                                               |
| 500, logs mention a missing table/relation/column                         | Schema not migrated (empty DB)                                  | Ensure Build Command is `pnpm ci:deploy && pnpm build` so `pnpm ci:migrate` runs; redeploy. |
| Can reach `/` but `/admin` 503s with "Admin temporarily unavailable"      | Armed **restrictive** IP allowlist + no resolvable client IP    | Set `TRUSTED_PROXY_HOPS=1`, or `ADMIN_IP_ENFORCEMENT=off` to recover.                       |
| Boot warning "SMTP is NOT configured… email DISABLED"                     | No SMTP set in production                                       | Expected — email is logged, not sent. Set `SMTP_*` to enable delivery.                      |
| Password-reset link points at the wrong host                              | `PAYLOAD_PUBLIC_SERVER_URL` unset/wrong                         | Set it to your real public origin.                                                          |
| Uploaded files vanish / 404 on download after a while                     | `STORAGE_DRIVER=local` on serverless (ephemeral FS)             | Set `STORAGE_DRIVER=s3` + the `S3_*` vars.                                                  |
| Can't log in (no user)                                                    | First deploy didn't seed                                        | Set `SEED_ON_DEPLOY=true` + `SEED_ADMIN_*` and redeploy once.                               |
| Build fails: "SEED_ADMIN_PASSWORD is required when seeding in production" | Prod seed (`SEED_ON_DEPLOY=true`) without `SEED_ADMIN_PASSWORD` | Set `SEED_ADMIN_PASSWORD` to a strong value and redeploy (refuses the known default).       |

---

### Reference: what the deploy scripts do

- `pnpm ci:migrate` → `payload migrate` — applies pending migrations (idempotent).
- `pnpm ci:seed` → runs the seed **only if `SEED_ON_DEPLOY` is truthy**, else a no-op.
- `pnpm ci:deploy` → `pnpm ci:migrate && pnpm ci:seed`.
- `vercel.json` pins `framework: nextjs`, `installCommand: pnpm install`, and
  `buildCommand: pnpm ci:deploy && pnpm build`.

Payload's API routes run on the Node.js runtime by default (no Edge config
needed). If a very large file download ever hits the function time limit, raise
**maxDuration** for the API function in **Vercel → Settings → Functions** (or add
a `functions` block to `vercel.json` matching your app's route files).
