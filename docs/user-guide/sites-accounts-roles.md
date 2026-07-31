# Sites, Admin Accounts & Roles

This page covers the three foundational System-management screens that decide _which sites exist_, _who can sign in to the back office_, and _what each of them is allowed to do_. All three live under the **System** group in the left-hand admin navigation: **Site Information Management**, **Admin Account Management**, **Admin Role Management** (plus the supporting **Department Management**, **Admin Menu Management**, and **Admin IP Access Control**). You reach them at `/admin` after signing in. Everything below is written for a non-technical operator — but a few points genuinely matter for security and for not locking yourself out, so watch for the **Gotcha** and **Not in this build** notes.

---

## Before you start

- **Sign in** at `/admin`. The seeded super administrator has Login ID `admin`; its email is whatever `SEED_ADMIN_EMAIL` was set to (on the deployed demo that is `moshiur@ticonsys.com`; the local-dev default is `admin@publicpulse.com.bd`) and its password is `SEED_ADMIN_PASSWORD` (local-dev default `changeme-dev-only!`). This account holds the **Super Administrator** role (`ROLE_ADMIN`, _isSuper_) plus **Privacy Officer**, so it can see and do everything.
- **You only see the screens your roles grant.** A menu that isn't granted to any role you hold is simply hidden from your navigation. The super administrator bypasses this entirely.
- **The golden lockout-safety rule:** as long as the seeded super administrator keeps the **Super Administrator** role, the back office can never lock itself out, no matter how you edit roles, menus, or accounts. Do not delete that role or strip it from the super admin.

---

## Part 1 — Sites (Site Information Management)

A **site** record is one homepage that the CMS runs. The system is multi-site: one record is the **admin back office** itself, and each of the others is a public-facing site. The seed creates two:

| Site ID | Name              | URL                           | Admin site? |
| ------- | ----------------- | ----------------------------- | ----------- |
| `bos`   | U-CMS Back Office | `http://localhost:3000/admin` | Yes         |
| `demo`  | Demo Site         | `http://localhost:3000`       | No          |

The **Is Admin Site** checkbox is the switch that changes which feature toggles apply (see below). `bos` is the back office; `demo` is a normal public site.

### To create or edit a site

1. Go to **System → Site Information Management**.
2. Click **Create New** (or open an existing site to edit).
3. Fill in the required fields:
   - **Site ID** — a short, permanent identifier. **Lowercase letters and digits only** (`a–z`, `0–9`), e.g. `bos` or `demo`. Anything else (uppercase, spaces, hyphens, Korean) is rejected with a clear message. It must be unique.
   - **Name** — the homepage/display name (legacy 홈페이지명), e.g. `UCMS Demo Site`.
   - **URL** — the full address, and it **must start with `http://` or `https://`** (legacy hint: "http:// 부터 입력하셔야 합니다"). Typing `user.example.com` without the scheme is rejected.
4. Tick **Is Admin Site** only for the back-office record. Leave it unticked for public sites.
5. Set the feature toggles (next section), upload a logo, fill in the footer, then **Save**.

### Feature toggles

Which toggles appear depends on **Is Admin Site**. The form hides the ones that don't apply.

**Public sites only** (shown when _Is Admin Site_ is **off**):

| Toggle                       | What it does                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Satisfaction Enabled**     | Turns on the page-satisfaction widget for this public site (legacy 만족도 사용).                                                                                                                                   |
| **Data Manager Enabled**     | Turns on the "data manager" (자료관리자) designation feature — the per-menu person-in-charge shown on the public site.                                                                                             |
| **Member Approval Required** | When on, a member who signs up on this public site is created **pending** and cannot log in until an admin approves them. When off (the legacy default), new members are active immediately.                       |
| **Accessibility Validation** | Web-accessibility validation mode (legacy 웹접근성 유효성). Choices: **Off**, **Popup alert**, **Save to DB**, **Popup alert + Save to DB**. Per legacy behavior this runs only in local/development environments. |

**Admin site only** (shown when _Is Admin Site_ is **on**):

| Toggle                          | What it does                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Two Factor Enabled**          | Requires a Google OTP code after login for this back office (legacy 2차 인증). See the 2FA gotcha under Admin accounts.                    |
| **Account Application Enabled** | Shows the "Request an account" link on the login page and enables the self-service admin-account application (legacy 계정 신청 사용 여부). |

> **Gotcha:** the toggles are _stored per site record_, but "does the back office require 2FA / accept applications?" is answered by looking at **any** admin site with the toggle on. In a normal single-back-office setup that's just the `bos` record.

### Logo

The **Logo** field is a single image upload used as the homepage logo.

1. In the site's edit screen, use the **Logo** upload field to choose or drag in an image.
2. Allowed types are **jpg, jpeg, png, gif** only.
3. Save.

> **Gotcha:** if you upload a non-image (e.g. a PDF or SVG), the save fails with `Site logo must be one of: jpg, jpeg, png, gif`. Pick a JPG/PNG/GIF and retry.

### Footer

The **Footer** group holds the organization details shown at the bottom of the public site. It has seven items — **Org Name**, **Address Postal Code**, **Address Line 1**, **Address Line 2**, **Phone**, **Fax**, **Copyright**. Each item has two parts:

- a **Value** (the text), and
- a **Show** checkbox (legacy 사용중 / 미사용중) that decides whether that one line is rendered in the footer.

To hide a footer line without deleting its text, untick its **Show** box.

### Try it on the demo

1. Sign in as `admin`.
2. Open **System → Site Information Management → Demo Site**.
3. Turn **Satisfaction Enabled** on, fill in a **Footer → Copyright** value, tick its **Show** box, and save.
4. Open the **U-CMS Back Office** record and note that you instead see **Two Factor Enabled** and **Account Application Enabled** (the public-site toggles are hidden here).

### Not in this build

- The legacy **postal-code / address lookup popup** (주소 찾기) is not implemented — footer address fields are plain text you type yourself.
- The legacy logo **image-manipulation toolbar** (rotate 90°, move up/down, download, copy link, delete thumbnails) is not built — the logo is a standard single-file upload.
- The legacy **상단/하단 가이드메뉴 설정** buttons and the per-site **허용 IP 관리** button shown _inside_ the site list are handled by separate screens, not on the site form: guide-menu links live under [Guide Menus](./menus-banners-notices.md#guide-menus-top-and-bottom-utility-bars), and the admin IP allowlist is its own fully-built screen — see [Part 4 — Admin IP Access Control](#part-4--admin-ip-access-control) below.

---

## Part 2 — Admin accounts (Admin Account Management)

An **admin account** is a back-office user. Sign-in uses the **email + password**; the **Login ID** (legacy "ID") is a separate legacy identifier shown in the list and used by ID/password recovery.

Reach the screen at **System → Admin Account Management**. The list shows email, Login ID, name, and status.

### The status lifecycle

Every account has a **Status** (legacy 상태). This is the business lifecycle — separate from Payload's automatic brute-force lock (see the login gotchas).

| Status (label in the form)                    | Meaning                                                                         | Can this account log in?                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Pending approval (승인대기)**               | Newly applied/created, not yet approved. This is the default for a new account. | No — "This account is awaiting administrator approval."                      |
| **Active (정상)**                             | Approved and in good standing.                                                  | **Yes**                                                                      |
| **Dormant — long inactivity (장기 미로그인)** | Auto-set by the dormancy sweep after a long period with no login.               | No — "This account is dormant due to inactivity — contact an administrator." |
| **Locked**                                    | Manually locked by an administrator.                                            | No — "This account is locked."                                               |

> **Gotcha:** only **Active** accounts can sign in. Approving an account and reactivating a dormant one are the **same action** — you set **Status → Active**. The dormancy status does **not** clear itself; an admin must reactivate.

> **Security:** the **Status** field can only be changed by someone holding the **Admin Account Management** grant (`system.admins`). You cannot approve or reactivate _your own_ account, even though you're otherwise allowed to edit your own profile.

### The request → approval workflow

There are two ways an admin account comes into being.

**A. Self-service application** (only when an admin site has **Account Application Enabled**):

1. An applicant goes to the `/admin` login page and clicks **Request an account** (this link only appears when applications are enabled).
2. They supply **Login ID**, **email**, **name**, **password + confirmation**, and optionally mobile, extension, and department.
3. The system creates the account as **Pending approval** with **no roles** — an applicant can never grant themselves a role or self-approve. Uniqueness of email and Login ID is enforced, and the password must meet the composition policy.
4. To approve: open **System → Admin Account Management**, find the pending account, set **Status → Active**, add the appropriate **Roles**, and save.

**B. Direct creation by an administrator:**

1. Go to **System → Admin Account Management → Create New**.
2. Enter email, Login ID, name, and a password (subject to the password policy). Optionally set department, duties, mobile, extension, profile photo.
3. Set **Status → Active** and pick one or more **Roles**.
4. Save. The account can sign in immediately.

> **Gotcha:** creating an account with no explicit status leaves it **Pending approval** (the default) — it won't be able to log in until you switch it to Active.

### Departments, duties, and profile

- **Department** — picked from the department tree (see Part 3). Legacy 부서.
- **Duties** — free text describing the person's responsibilities (legacy 업무내용); this is what shows up in the privacy org chart.
- **Mobile**, **Extension** — contact fields (legacy 휴대전화 / 내선번호).
- **Profile Photo** — an optional image upload.

### Login gotchas an operator actually hits

- **Two independent "locks."** Besides the **Status** lifecycle above, Payload applies its own transient brute-force lock: **5 wrong passwords** locks the account for **10 minutes**, then it clears itself. That automatic lock is _separate_ from Status and never touches Status — a temporarily lockout from bad passwords does not make the account "Locked."
- **2FA confinement.** If the back office has **Two Factor Enabled** and an admin has not yet set up their Google OTP device, that admin can sign in but is **confined** — every management screen is denied until they finish OTP enrollment. This is by design (it's what lets them reach the enrollment step) and lifts automatically the moment their OTP is confirmed.
- **Password recovery.** "Forgot your password?" and "Find your ID" links are always on the login page, but only one of them is a working end-to-end flow in this build: **Forgot your password?** opens the fully working built-in reset screen and emails a reset link to approved accounts. **Find your ID** has **no rendered screen** — the link points at `/admin/find-id`, which is not built; only the underlying `/api/find-id` REST endpoint exists. See [If you forgot your Login ID](./getting-started.md#if-you-forgot-your-login-id) on the Getting Started page.

### Resetting a user's two-factor device

On an account's edit screen (requires the `system.admins` grant) there are two one-shot action checkboxes:

- **Reset Two Factor Device** — clears the user's 2FA enrollment so they set up a new device on next login. The user is emailed.
- **Regenerate Two Factor Secret** — issues a brand-new OTP secret (the old code stops working immediately; the user re-scans a new QR). The user is emailed.

Tick one and **Save** to perform the action; the checkbox resets itself to unticked afterward.

### Try it on the demo

- Sign in as one of the login-capable seeded admins (password = the same `SEED_ADMIN_PASSWORD`): `content-editor@admin.demo.example.com` (Content Editor), `privacy-officer@admin.demo.example.com` (Privacy Officer), `comms-admin@admin.demo.example.com` (Content Editor), `stats-analyst@admin.demo.example.com` (Statistics Analyst). Notice each sees only the screens their role grants.
- The seeded privacy-org example accounts (`privacy-deputy`, `privacy-team`, `privacy-staff-1`, `privacy-staff-2`) are **Pending approval** with random unknown passwords — they exist only to populate the org chart and **cannot log in**. To make one usable, approve it (Status → Active) and set a known password.

### Not in this build

- The legacy **personal-info access watermark** overlay on screens containing personal data is not part of these account screens.
- The mobile/extension **country/area-code pickers linked to Code Management** are plain text fields here.
- The legacy profile-photo editing toolbar (rotate/move/download) is a standard single-file upload.

---

## Part 3 — Departments (Department Management)

Departments (legacy 관리자 부서 관리) form a **tree** — a root, divisions under it, teams under those — and are shared across all sites. They're used by the department picker on admin accounts and by the org chart.

Reach it at **System → Department Management**.

### To add a department

1. Go to **System → Department Management → Create New**.
2. Enter **Name** (required, legacy 부서명).
3. Optionally set **Duties** (부서업무 memo), **Phone**, **Fax**.
4. Set **Parent** — leave empty for a top-level department, or pick a parent to nest it. (A department cannot be its own ancestor; the system blocks cycles.)
5. **Order** controls sibling display order (lower first).
6. **Is Active** (legacy 사용여부) — leave on. Turning it off hides the department from pickers but keeps it, so old references still resolve.
7. Save.

> **Gotcha:** you can only delete a **leaf** department. Trying to delete one that still has children fails with "Cannot delete a department that has child departments." Delete or reassign the children first.

The seed creates **Head Office** with **Management Support** and **Development** under it, and the rich demo seed adds four divisions (Planning & Coordination, Public Relations, Administrative Services, Information & Technology), each with two teams.

### Not in this build

The legacy tree editor with expand/collapse-all, drag-to-reorder, and a reusable popup picker is deferred — departments use the standard list view and a plain **Parent** relationship field.

---

## Part 4 — Admin IP Access Control

**Legacy reference:** 1-20 / 1-21 (관리자 IP 접근제어). Reach it at **System → Admin IP Access Control**.

This screen is the **admin IP allowlist/blocklist** that the IP guard enforces at the edge, on every request to `/admin/*` and `/api/*`, before Payload's own access control ever runs. Each row registers a requester (the legacy request-and-approve metadata — applicant name, affiliation, phone, memo) against an IP pattern, an **allow** or **block** classification, and a validity window.

The model is **default-deny once armed**: while **no** rule exists for a site, the admin stays open (bootstrap safety net — you can never lock yourself out of a brand-new install). Once at least one rule exists, only an IP matched by an **active**, **in-window** **allow** rule may reach the admin — and any matching **block** rule always wins over a matching allow, even if both match the same request.

### Fields

| Field              | Legacy       | Notes                                                                                                                                                                                                                                                        |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Applicant Name** | 신청자       | Required. Who requested this access rule.                                                                                                                                                                                                                    |
| **Affiliation**    | 소속         | Required. The applicant's organization/department.                                                                                                                                                                                                           |
| **Phone**          | 연락처       | Required. The applicant's contact number.                                                                                                                                                                                                                    |
| **Memo**           | 비고         | Optional free-text note about the rule.                                                                                                                                                                                                                      |
| **IP Address**     | 신청IP주소   | Required. Accepts an **exact IPv4** (`203.0.113.7`), an **exact IPv6** (`::1`), an **IPv4 trailing wildcard** (`192.168.0.*`, `10.*` — the `*` must be a suffix), or a **bare `*`** (matches every IP). Anything else is rejected with a validation message. |
| **Access Type**    | 접속구분코드 | Required, defaults to **Allow**. **Allow** or **Block** — under default-deny, a matching **Block** always wins over a matching **Allow**.                                                                                                                    |
| **Valid From**     | 시작일       | Required. The rule takes effect at/after this date/time.                                                                                                                                                                                                     |
| **Valid To**       | 종료일       | Required. The rule stops matching after this date/time — expired rules are ignored automatically, no cron needed. Must be strictly later than **Valid From** (enforced even on an edit that only changes **Valid To**).                                      |
| **Is Active**      | 사용여부     | Checkbox, defaults on. Inactive rules are ignored by the guard.                                                                                                                                                                                              |
| **Site ID**        | 사이트ID     | Required relationship to **Sites** — which site's admin back office this rule guards. Defaults to the admin back-office site when you create a new rule.                                                                                                     |

> **WARNING:** a rule with IP Address `*` and Access Type **Allow** matches **every** IP — an active `*` allow rule disables IP restriction entirely for that site.

### To add, edit, or delete an allowlist entry

1. Go to **System → Admin IP Access Control**.
2. Click **Create New** (or open an existing rule to edit).
3. Fill in **Applicant Name**, **Affiliation**, and **Phone** (all required), plus an optional **Memo**.
4. Enter the **IP Address** — an exact IPv4/IPv6 address, an IPv4 trailing wildcard (e.g. `192.168.0.*`, `10.*`), or `*` for all IPs.
5. Choose **Access Type** — **Allow** (default) or **Block**.
6. Set **Valid From** and **Valid To** — **Valid To** must be strictly later than **Valid From**.
7. Leave **Is Active** ticked, confirm **Site ID** (defaults to the admin back-office site), and **Save**.
8. To retire a rule without losing its record, open it and untick **Is Active**; to remove it entirely, delete it. Both actions are audited.

> **Gotcha — this screen is data, not the switch.** Enforcement is governed separately by the **`ADMIN_IP_ENFORCEMENT`** environment variable — the demo runs with it **off**, so none of these rules are actually enforced there regardless of what they say. Set it to anything other than `off`/`false`/`0`/`no` to arm enforcement. A bootstrap **`*` allow** rule is seeded on the admin site precisely so that turning enforcement on never locks everyone out by surprise; deactivate or delete it once you've added allow rules for your own office/VPN networks. See the [deployment gotcha](./operations.md#2-deployment) for the related `TRUSTED_PROXY_HOPS` setting the guard needs to trust a client IP at all.

### Not in this build

The legacy list screen's **inline usage-status toggle** (flip 사용여부 directly from the row, no separate save) is not replicated — here you open the rule and tick/untick **Is Active**, then **Save**.

---

## Part 5 — Roles & menu permissions

This is the heart of "who can do what." The model has three moving parts:

1. **Admin Menus** (`adminMenus`) — a catalog of permission keys, one per back-office screen (e.g. `system.sites`, `content.boards`). Each has a permanent **Menu Key**.
2. **Roles** (`roles`) — a named `ROLE_*` bundle that **grants** a set of admin menus.
3. **Admin accounts** (`users`) — each holds one or more **Roles**.

**A user's effective access is the union of every menu granted by every role they hold** — or **unrestricted** if any role they hold has **isSuper** ticked. That single rule governs both what appears in their navigation and what they can actually create/read/update/delete.

### The isSuper bypass

A role with **Is Super** checked ignores its own menu grants entirely and grants **everything**. This is how the built-in **Super Administrator** (`ROLE_ADMIN`) role works, and it's the lockout-safety anchor. Use isSuper sparingly — it's all-or-nothing.

### To create a role

1. Go to **System → Admin Role Management → Create New**.
2. **Role ID** (required, unique) — must start with `ROLE_` and use uppercase letters, digits, and underscores only, e.g. `ROLE_CONTENT_EDITOR`. Other formats are rejected.
3. **Name** (required) and **Description** (required) — human-readable label and explanation.
4. Leave **Is Super** unchecked for a normal, scoped role.
5. **Menu Grants** — this is the checkbox MENU-GRANT model: pick the admin menus this role should unlock (see next).
6. Save.

### To grant menus to a role (the MENU-GRANT model)

In the role's **Menu Grants** field, select each admin-menu entry the role should grant. Behind the scenes each admin menu is identified by its **Menu Key**; a user holding this role can reach exactly the screens whose menu keys are selected here (plus anything from their other roles). Granting the parent grouping node alone does not grant its children — grant each specific screen's menu you want to expose.

The available admin menus are the catalog under **System → Admin Menu Management**. The seeded menu tree includes, among others:

- **System**: `system.sites` (Site Info), `system.admins` (Admin Accounts), `system.roles` (Roles), `system.menus` (Admin Menus), `system.departments`, `system.codes.*`, `system.passwordPolicies`, `system.ipAccessControl`, `system.errorLogs`.
- **Content**: `content.media`, `content.boards`, `content.posts`, `content.menus`, `content.webContents`, `content.surveys`, `content.terms`, and more.
- **Privacy Protection**: `privacy.accessLogs`, `privacy.loginHistory`, `privacy.permissionLogs`, `privacy.personalInfoLogs`, `privacy.orgChart`, `privacy.securityDocs`.
- **Members**: `members.manage`. **Site Statistics**: `statistics.satisfaction`, `statistics.traffic`, `statistics.downloads`.

> **Gotcha (permanent keys):** a **Menu Key** is the actual permission string every screen checks against. **Do not rename a Menu Key** after roles have been granted it — renaming silently revokes the grant (the old key stops resolving). Add new menu nodes rather than repurposing existing ones.

> **How fast do changes take effect?** Role and menu-grant changes apply on the user's **very next request** — they do **not** have to log out and back in.

### To assign a role to an admin

1. Open the account under **System → Admin Account Management**.
2. In **Roles**, add one or more roles.
3. Save.

> **Security:** changing the **Roles** on any account — including your own — requires the **Admin Account Management** grant (`system.admins`). This is what stops a low-privileged user from editing their own profile to hand themselves `ROLE_ADMIN`. Note also that holding **Admin Role Management** (`system.roles`) lets you _create_ an isSuper role but not _assign_ it — assignment needs `system.admins` — so neither grant alone lets someone escalate.

### Role Users view

Each role's edit screen has a read-only **Users** list showing who currently holds the role (legacy 권한 사용자 조회).

### Seeded roles you can inspect

| Role ID                                                 | Name                | isSuper | Grants                                                    |
| ------------------------------------------------------- | ------------------- | ------- | --------------------------------------------------------- |
| `ROLE_ADMIN`                                            | Super Administrator | Yes     | Everything (bypass)                                       |
| `ROLE_CONTENT_EDITOR`                                   | Content Editor      | No      | All `content.*` screens                                   |
| `ROLE_STATISTICS_ANALYST`                               | Statistics Analyst  | No      | The `statistics.*` dashboards                             |
| `ROLE_PRIVACY_OFFICER` / `_DEPUTY` / `_TEAM` / `_STAFF` | Privacy org tiers   | No      | Privacy Protection menus (org chart + §3 privacy screens) |

The seeded super admin holds `ROLE_ADMIN` **and** `ROLE_PRIVACY_OFFICER`.

### Try it on the demo

1. Sign in as `admin` and open **System → Admin Role Management → Content Editor**. Note its **Menu Grants** cover the content screens but nothing under System, Privacy, or Members.
2. In another browser/profile, sign in as `content-editor@admin.demo.example.com`. Confirm the navigation shows Content screens only — Site Information Management, Admin Accounts, and Roles are hidden.
3. As `admin`, add a `content.*` menu to a role, save, and refresh the content-editor session to see the new screen appear without re-login.

### Not in this build

- The legacy **checkbox-tree UI** for menu grants (open-all/close-all, per-node checkboxes across the whole hierarchy, ref 1-13) is deferred — for now Menu Grants uses Payload's standard multi-select.
- The legacy **bulk "remove selected users from role"** control on the role-users view is deferred — the Users list is read-only.
- The legacy **System Information** screen (ref 1-79 — a read-only dump of the runtime's JVM/OS environment and version info) is intentionally not built. It has no equivalent in this stack (no JVM to introspect) and no operator-facing value beyond what `docs/ops/monitoring.md` and the `/health` probe already surface (app version, DB reachability) — decided as a deliberate won't-build rather than a gap.
