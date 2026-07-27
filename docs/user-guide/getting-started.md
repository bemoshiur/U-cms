# Getting Started

This page walks a U-CMS administrator through the very first things you do in the system: signing in, setting up the one-time-code second factor when your site requires it, recovering a lost login ID or password, and finding your way around the admin dashboard. It also explains why two administrators can see completely different menus — U-CMS shows each person only the parts of the system their role grants them. Throughout, the real field names and on-screen labels are used, and every step can be tried against the seeded demo data using the accounts listed below.

---

## Before you begin

The administrator back office lives at **`/admin`** (for the demo, `http://localhost:3000/admin`). This is separate from the public-facing website, where ordinary site members log in.

**You sign in with your email address, not your login ID.** Every U-CMS admin account has an email (used to authenticate) and, separately, an optional **Login ID** (the legacy "ID" — shown in the admin list and used by ID recovery). When you log in, type your _email_. The Login ID is not accepted at the sign-in box.

### Demo accounts you can sign in with

All of these use the same admin password — the value of the `SEED_ADMIN_PASSWORD` environment variable (dev default: `changeme-dev-only!`).

| Account (sign in with this email)                                            | Login ID          | Role                                                            | What it can see            |
| ---------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------- | -------------------------- |
| `moshiur@ticonsys.com` (deployed) / `admin@publicpulse.com.bd` (dev default) | `admin`           | Super Administrator (`ROLE_ADMIN`, _isSuper_) + Privacy Officer | Everything                 |
| `content-editor@admin.demo.example.com`                                      | `content-editor`  | Content Editor                                                  | Content menus only         |
| `comms-admin@admin.demo.example.com`                                         | `comms-admin`     | Content Editor                                                  | Content menus only         |
| `privacy-officer@admin.demo.example.com`                                     | `privacy-officer` | Privacy Officer                                                 | Privacy / audit menus      |
| `stats-analyst@admin.demo.example.com`                                       | `stats-analyst`   | Statistics Analyst                                              | Statistics dashboards only |

The exact email of the super admin depends on the `SEED_ADMIN_EMAIL` environment variable; the seed derives the Login ID `admin` from the local part of that email.

The demo also seeds four **privacy-org example admins** (`privacy-deputy`, `privacy-team`, `privacy-staff-1`, `privacy-staff-2`). These exist only to populate the privacy organisation chart and are **not** login-capable — they are created with random passwords.

**Site members are different from admins.** Public members (`member01@demo.example.com` … `member18@demo.example.com`, plus `demo-member` at `member@demo.example.com`) log in on the _public site's_ login page, not at `/admin`, using the `SEED_MEMBER_PASSWORD` value (dev default: `Pulse-Member-2026`). The seeded `pending-member` (`pending@demo.example.com`) cannot log in until an administrator approves it. Managing members is covered in the Member Management guide.

---

## Signing in

### To sign in

1. Go to **`/admin`**. You will see the branded U-CMS login screen with **Email** and **Password** fields.
2. Enter your **Email** and **Password**.
3. Click **Sign in**.
4. If your account requires two-factor authentication and you are already enrolled, an **Authentication code** field appears next — see [If your site requires a one-time code](#if-your-site-requires-a-one-time-code-2fa) below. Otherwise you land on the dashboard.

**Only "Active" accounts can sign in.** Every admin account has a **status**: _Pending approval (승인대기)_, _Active (정상)_, _Dormant — long inactivity (장기 미로그인)_, or _Locked_. Only _Active_ accounts may authenticate. A newly created or self-applied account sits in _Pending approval_ until an administrator switches it to _Active_; an account left unused for a long time is swept to _Dormant_ and must be reactivated (also by switching it back to _Active_).

**If sign-in is refused.** The failure message is deliberately generic ("Unable to sign in") — it does not tell you whether the email, the password, or the account status was the problem. This is intentional, to avoid leaking which accounts exist.

**Account lockout after repeated failures.** After **5** failed password attempts the account is locked by the system for **10 minutes**, after which it unlocks on its own. This automatic brute-force lock is separate from the manual _Locked_ status an administrator can set (which does not auto-clear).

### The helper links

Below the sign-in button you will find:

- **Forgot your password?** — opens the built-in password-reset request screen (see [Recovering your ID or password](#recovering-your-id-or-password)).
- **Find your ID** — for recovering a forgotten Login ID.
- **Request an account** — only appears when the admin site has account applications turned on. On the seeded demo it is **hidden**, because that option is off by default.

---

## If your site requires a one-time code (2FA)

U-CMS supports Google-OTP (TOTP) two-factor authentication: a rotating 6-digit code from an authenticator app on your phone, entered _after_ your password.

**2FA is a per-back-office switch.** It is turned on from **Site Info Management** on the admin site, via the **"Require a Google OTP code after login"** toggle (legacy 2차 인증 여부, ref 1-18). Because it applies to the whole back office, _if any admin site has this on, every administrator signing into the back office must complete 2FA._

> **On the seeded demo, 2FA is OFF.** No admin site has the toggle enabled, so demo logins are password-only and you will not see the code step. To try the 2FA flow, a super administrator must first turn on **"Require a Google OTP code after login"** on the _U-CMS Back Office_ site. Do this deliberately — it immediately affects **every** administrator, not just you.

### Signing in when 2FA is on and you are already enrolled

1. Enter your **Email** and **Password**, then click **Sign in**.
2. The form replaces the credentials with an **Authentication code** field. Open your authenticator app, read the current 6-digit code for your U-CMS entry, and type it in.
3. Click **Verify code**. (Use **Back** to return to the email/password step if needed.)

Codes rotate every 30 seconds; U-CMS accepts the previous, current, and next code (a ±1 window) to tolerate small clock differences between the server and your phone.

**Wrong-code lockout.** After **5** consecutive wrong codes the code step is locked for **10 minutes** — during that window even a correct code is refused. Entering a correct code resets the counter.

---

## Setting up two-factor authentication (enrolment is required)

When the back office requires 2FA and you have **not yet** set up a second factor, enrolment is **mandatory and enforced by the server** — it is not just a suggestion.

### How the requirement is enforced

An un-enrolled administrator _can_ sign in with just their password (this is necessary — you need a signed-in session to complete enrolment). But that session is **confined**: until you finish enrolling, U-CMS blocks every menu-gated action across the whole system — through the admin screens _and_ through direct API calls. While confined you can only:

- reach the 2FA-enrolment steps,
- view and edit your own account record, and
- log out.

The moment your enrolment is confirmed, the confinement lifts automatically on your next action. There is no way to skip enrolment and still use the system.

### To enrol a device

1. Sign in with your email and password. Because you are not yet enrolled, you land on the enrolment surface.
2. Install a TOTP authenticator app on your phone if you don't have one — **Google Authenticator**, Microsoft Authenticator, 1Password, or Authy all work.
3. U-CMS shows a **QR code** — and it is shown **once**. In your app choose _Scan a QR code_ and point the camera at it. A new entry named **U-CMS** appears, showing a rotating 6-digit code. (If scanning fails, the enrolment response also includes a secret key you can type in manually.)
4. Enter the current 6-digit code back on the enrolment screen to confirm. If it's accepted, two-factor authentication is now active on your account and you can use the system normally.

A plain-text install walkthrough is always available at **`/api/2fa/guide`**.

> **The QR code is shown only once.** After you confirm, U-CMS never displays the secret again. If you get a new phone or lose your device, you cannot re-scan yourself — an administrator must reset your 2FA for you (below).

### If you lose your device (administrator reset)

A super administrator (or anyone with the _system.admins_ grant) resets a locked-out colleague from that person's admin account record (legacy ref 1-16). Open the user in **Admins**, then use one of the two one-shot actions:

- **Reset 2FA device** ("2차 인증 디바이스 계정 갱신") — clears the enrolment so the user sets up a fresh device on next sign-in.
- **Regenerate OTP secret** ("2차 인증 코드 초기화") — issues a brand-new secret, immediately invalidating the old codes; the user re-enrols with a new QR.

Checking either box and saving performs the action and resets the box. The affected user is emailed automatically.

---

## Recovering your ID or password

Both recovery flows work only for **Active** (approved) accounts, and both always return the same generic confirmation regardless of whether a match was found — so no one can use them to discover which accounts exist.

### If you forgot your password

1. On the login screen click **Forgot your password?**.
2. Enter the **email** on your account and submit.
3. If an active account matches, a **password-reset link** is emailed to that address. Open the link and set a new password (it must satisfy the current password-composition policy).

### If you forgot your Login ID

Provide your **name** and the **email** on your account. If an active account matches, its Login ID is emailed to that address. (Recall that you sign in with your email, so this is only needed when you specifically need the legacy Login ID.)

> **Not in this build.** The **Find your ID** and **Request an account** links on the login screen point at pages that are not built yet — the recovery and application _logic_ currently exists only as behind-the-scenes API endpoints (`/api/find-id`, `/api/find-password`, `/api/account-request`), without a dedicated on-screen form. The **Forgot your password?** link, by contrast, opens the fully working built-in reset screen. Two related simplifications versus the legacy manual (ref 1-3): password recovery emails a **reset link** rather than issuing a brand-new password, and there is no "save ID" checkbox on the login box.

---

## The admin dashboard

After signing in you land on the U-CMS dashboard at `/admin`. It is a single overview page assembled from several widgets — and, importantly, **you only see the widgets your role permits** (refs 1-7 / 1-8). A widget you have no access to is not shown at all, and its data is never even loaded.

### Site selector

If your account is assigned more than one site, a **Site** selector appears at the top right; pick a site and click **Apply** to scope the whole dashboard (visitor counts, notices, posts, banners, and so on) to that site. A super administrator sees all sites in this list. If you only work on one site, no selector is shown.

### Today's metric cards

A row of headline numbers across the top. Each card only appears if you hold the relevant permission:

- **Today's visitors** and **Today's page views** (require the traffic-statistics grant)
- **New members today** (requires the member-management grant)
- **Posts today** and **Total posts** (require the posts grant)

### Widgets

| Widget                    | Shows                                                                   | "View all" opens      |
| ------------------------- | ----------------------------------------------------------------------- | --------------------- |
| **Traffic**               | Week/Month toggle, total page views and visitors, and a small bar chart | Traffic Statistics    |
| **Administrator Notices** | Latest internal notices, pinned ones first                              | Administrator Notices |
| **Notification Areas**    | Current notification-area items (live ones first)                       | Notification Areas    |
| **Recent Posts & Q&A**    | Three lists — Recent, Most viewed, and Recent questions                 | Posts                 |
| **Banners**               | The active banner strip                                                 | Banners               |
| **System Errors**         | Error counts, today and total                                           | Error Statistics      |
| **Quick Menu**            | Your profile and shortcuts — always shown                               | —                     |

Secret posts and restricted security-document posts are excluded from the post lists and counts, so a content administrator never glimpses titles they aren't cleared to see.

### The Quick Menu

The Quick Menu widget is always present. It shows your profile photo (or your initial), your name, and your department · duties, plus shortcut buttons to **My account**, **Admins**, and **Access history**. It also states the current idle auto-logout timeout and offers a **Log out now** link.

### Idle auto-logout

For security, U-CMS signs you out after a period of inactivity — **30 minutes by default** (configurable by the operator via the `ADMIN_IDLE_TIMEOUT_MIN` server setting). Shortly before the cutoff (roughly the final minute) a **"Still there?"** dialog appears with a live countdown and two choices:

- **Stay signed in** — resets the idle timer and keeps your session alive.
- **Log out now** — signs you out immediately.

If you do nothing, the countdown reaches zero and you are logged out and returned to the login screen. Note that once the warning dialog is showing, ordinary mouse movement will _not_ dismiss it — you must click one of the two buttons. This activity-based timeout runs on top of the session's own expiry.

---

## Navigation and menu permissions

### Why administrators see different menus

Everything an administrator can see and do is governed by **menu permissions** (refs 1-10 – 1-13). The model is:

- Each **role** holds a set of **menu grants** — the specific admin menus (identified by a stable menu key such as `content.posts` or `system.admins`) that the role unlocks.
- A person's **effective access is the union of every role they hold**. Hold two roles and you get both roles' menus combined.
- A role marked **isSuper** (the _Super Administrator_ role) bypasses all of this and unlocks everything.

Menus, dashboard widgets, and collections you have no grant for are simply hidden from your navigation — and the same check is enforced on the server for every read and write, so hiding a menu is a real security boundary, not just cosmetics.

**Permission changes take effect on your next action** — you do **not** have to log out and back in. If an administrator adjusts your roles or a role's grants, the new access applies on your very next page load.

### How the demo roles differ

Sign in as each demo account to see menu permissions in action:

- **Super Administrator** (`admin`) — sees every menu, every site, and every dashboard widget.
- **Content Editor** (`content-editor`, `comms-admin`) — sees the Content Management menus (boards, posts, media, menus, banners, notices, surveys, terms, and so on), and nothing from System, Privacy, or Member administration.
- **Statistics Analyst** (`stats-analyst`) — sees only the Statistics dashboards (traffic, satisfaction, downloads).
- **Privacy Officer** (`privacy-officer`) — sees the Privacy Protection System: access/login/permission histories, personal-information access history, the security-document libraries, the privacy org chart, and password-policy management.

The super admin additionally holds the Privacy Officer role, which is why it sees the privacy subsystem as well as everything else.

> **Note on the admin chrome.** U-CMS uses the standard Payload admin layout — a permission-filtered left-hand navigation sidebar, breadcrumbs, and a top bar — rather than the legacy manual's three-band "Integrated Management System / site management / Privacy Protection System" top-guide-menu chrome (ref 1-9). The _permission model_ behind it is the same: you see only what your roles grant.
