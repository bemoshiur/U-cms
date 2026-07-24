# Pulse CMS

Payload CMS 3 on Next.js 16 (App Router, TypeScript), backed by PostgreSQL.

## Quick Start - local setup

To spin up this project locally, follow these steps:

### Development

1. `cp .env.example .env` to copy the example environment variables, then set a real `PAYLOAD_SECRET` (e.g. `openssl rand -hex 32`).
2. `docker compose up -d` to start the PostgreSQL container defined in `docker-compose.yml` (matches the `DATABASE_URI` in `.env.example`).
3. `pnpm install && pnpm dev` to install dependencies and start the dev server
4. open `http://localhost:3000/admin` to open the app in your browser

That's it! Changes made in `./src` will be reflected in your app. Follow the on-screen instructions to login and create your first admin user. Then check out [Production](#production) once you're ready to build and serve your app, and [Deployment](#deployment) when you're ready to go live.

#### Docker (Optional)

The provided `docker-compose.yml` at the repo root runs PostgreSQL only (service `postgres`, container `pulse-cms-db`); the Next.js app itself runs via `pnpm dev` / `pnpm start`, not inside Docker.

### Seeding

`pnpm seed` runs the seed registry (`src/seed`). The first (and currently only) step, `super-admin`, creates a user in the `users` collection if none with that email exists yet — safe to run repeatedly. Credentials come from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (see `.env.example`); a warning is logged if you don't set `SEED_ADMIN_PASSWORD` and the dev-only default is used.

### Testing

- `pnpm test` — Vitest, both suites (`tests/unit/**/*.spec.ts` pure-node unit tests, `tests/int/**/*.int.spec.ts` integration tests that boot Payload against Postgres). `pnpm test:unit` / `pnpm test:int` run one suite. Requires `docker compose up -d postgres` and a valid `.env`.
- `pnpm test:e2e` — Playwright, against a **production build**. Run `pnpm build` first, then `pnpm start` (or let Playwright's `webServer` start it for you), then `pnpm test:e2e`. On a database with no schema yet (e.g. a fresh CI service container), run `pnpm seed` before starting the server — it pushes the schema as a side effect of booting Payload outside of `next start`'s production mode.

## How it works

The Payload config is tailored specifically to the needs of most websites. It is pre-configured in the following ways:

### Collections

See the [Collections](https://payloadcms.com/docs/configuration/collections) docs for details on how to extend this functionality.

- #### Users (Authentication)

  Users are auth-enabled collections that have access to the admin panel.

  For additional help, see the official [Auth Example](https://github.com/payloadcms/payload/tree/3.x/examples/auth) or the [Authentication](https://payloadcms.com/docs/authentication/overview#authentication-overview) docs.

- #### Media

  This is the uploads enabled collection. It features pre-configured sizes, focal point and manual resizing to help you manage your pictures.

## Questions

If you have any issues or questions, reach out to us on [Discord](https://discord.com/invite/payload) or start a [GitHub discussion](https://github.com/payloadcms/payload/discussions).
