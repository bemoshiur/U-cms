# U-CMS Operator Guide

This is the **U-CMS operator manual** — the day-to-day reference for administrators and
operators who run a U-CMS site from the `/admin` back office. It is our-brand replacement
for the legacy **122-page Korean U-CMS v3.0** manual: same subsystems and workflows,
re-documented in English against this Payload CMS implementation, screen by screen.

Every module page below is task-oriented — what each screen does, how to use it, and what
to watch out for. Start with **Getting Started** if you are new, then jump to the module
you need. Operators looking after backups, deploys, and monitoring should also read the
[ops runbooks](#operations--runbooks).

---

## Demo login credentials

> **Quick reference.** These are the seeded demo accounts. Email and password come from
> environment variables (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_MEMBER_PASSWORD`);
> the dev defaults below apply only when those vars are unset. On any shared/production
> deploy the passwords are set to strong, unique values — the dev defaults will **not** work.

**Super administrator — sign in at `/admin`**

| Field    | Value                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| Login ID | `admin`                                                                                                                 |
| Email    | `SEED_ADMIN_EMAIL` — deployed demo: `moshiur@ticonsys.com`; dev default: `admin@publicpulse.com.bd`                     |
| Password | `SEED_ADMIN_PASSWORD` — dev default: `changeme-dev-only!`                                                               |
| Roles    | Super Administrator (`ROLE_ADMIN`, _isSuper_) **+** Privacy Officer (`ROLE_PRIVACY_OFFICER`) — sees and does everything |

**Other login-capable admins — sign in at `/admin`** (password = the same `SEED_ADMIN_PASSWORD`)

| Email                                    | Role               |
| ---------------------------------------- | ------------------ |
| `content-editor@admin.demo.example.com`  | Content Editor     |
| `privacy-officer@admin.demo.example.com` | Privacy Officer    |
| `comms-admin@admin.demo.example.com`     | Content Editor     |
| `stats-analyst@admin.demo.example.com`   | Statistics Analyst |

> **Privacy-org example admins** (`privacy-deputy`, `privacy-team`, `privacy-staff-1`,
> `privacy-staff-2`) are **not** login-capable — they are seeded with random, unrecoverable
> passwords and a `pending` status purely to populate the privacy organization chart. To use
> one, an operator approves it (status → active) and sets a known password.

**Public members — sign in on the PUBLIC site** (not `/admin`; password = `SEED_MEMBER_PASSWORD`, dev default `Pulse-Member-2026`)

| Account                                                   | Notes                                       |
| --------------------------------------------------------- | ------------------------------------------- |
| `member01@demo.example.com` … `member18@demo.example.com` | 18 active demo members on the **Demo** site |
| `member@demo.example.com` (`demo-member`)                 | Active demo member                          |
| `pending@demo.example.com` (`pending-member`)             | Pending — **cannot log in until approved**  |

---

## Table of Contents

### Getting Started

- [Getting Started](getting-started.md) — first login, the `/admin` layout, sites, roles, and how the pieces fit together.

### Integrated Management (admin back office)

- [Sites, Admin Accounts & Roles](sites-accounts-roles.md) — multi-site setup, admin user accounts, roles, menu grants, and access control.
- [The Board Engine & Posts](boards-and-posts.md) — board types, boards, posts, attachments, comments, and moderation.
- [Menus, Banners, Popups, Notifications & Common Codes](menus-banners-notices.md) — navigation menus, banners, popups, admin notices/notifications, and the common-code (classification/group/detail) system.

### Demo / Public Site

- [Web Content & Member Management](web-content-and-members.md) — web content pages, display components, public members, and member administration.
- [Surveys](surveys.md) — building surveys and questions, response collection, skip logic, results, and exports.

### Privacy Protection (§3 Subsystem)

- [Privacy Protection](privacy-protection.md) — the §3 personal-information protection subsystem: privacy organization chart, access logs, security documents, and safeguards.

### Insights

- [Insights (Statistics, Error Logs, Dashboard)](insights.md) — traffic / satisfaction / download statistics, the error log, and the admin dashboard.

### Operations (for administrators & operators)

- [Operations](operations.md) — infrastructure/hosting runbooks: backup & restore, deployment, monitoring & alerts, and the `/health` probe. (For `/admin` screens, see [IP rules](sites-accounts-roles.md#part-4--admin-ip-access-control), [password policy](privacy-protection.md#password-composition-rules), [banned words](boards-and-posts.md#part-5--profanity--member-banned-words), and [terms](web-content-and-members.md#part-2--privacy-policy-terms-documents-versioned-same-engine).)

---

## Operations & runbooks

For infrastructure-level operations — how the deployment is backed up, deployed, and
watched — see the ops runbooks in [`../ops/`](../ops/):

- [Backup & restore](../ops/backup-restore.md) — database and media backup, retention, and restore procedure.
- [Deployment](../ops/deployment.md) — Docker / self-hosted deploy path, environment variables, and the seed-on-deploy step.
- [Monitoring & alerts](../ops/monitoring.md) — what to watch in a running deployment, using the app's own surfaces plus external checks.
