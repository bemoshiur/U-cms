# Privacy Protection (§3 Subsystem)

The Privacy Protection System is the part of the U-CMS back office that watches over personal information: it keeps a permanent, tamper-proof record of who looked at what, gates every export of member data behind a stated reason, watermarks the screens that show personal data, publishes the organization's password rules and privacy-governance chart, and holds the internal security-document libraries. Unlike the rest of the admin, this subsystem is reserved for privacy-role administrators — a general content editor or statistics analyst never even sees that it exists. This page explains who can open it, what each screen does, and the handful of rules an operator actually trips over (a reason is mandatory before any member export; a security-document board is invisible to everyone outside the privacy roles).

---

## Who can see this subsystem (role gating)

Access in U-CMS is granted **per menu**, not per person. Each administrator holds one or more **roles**, and each role carries a set of **menu grants**. An administrator's effective permission is the _union_ of every grant across all the roles they hold — with one shortcut: a **Super Administrator** role bypasses the grant list entirely and can see everything.

The Privacy Protection screens are gated on a small set of privacy menu keys. If your roles do not include the matching grant, the screen is **doubly hidden**: it does not appear in your left-hand navigation, _and_ the server refuses the data even if you type the URL by hand. There is no "hidden but reachable" state here.

### The four privacy roles and what each one sees

U-CMS ships four dedicated privacy roles that form the governance hierarchy (they also drive the org chart — see below). Each tier is granted progressively more of the subsystem:

| Role (tier)                     | Korean title      | Sees                                                                                                                                                                |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chief Privacy Officer** (1)   | 개인정보 책임자   | Everything in §3: all audit histories, the personal-information access log **and its export**, security documents, the org chart, and password-rule management      |
| **Deputy Privacy Officer** (2)  | 개인정보 부책임자 | Same full §3 surface as the Officer                                                                                                                                 |
| **Privacy Protection Team** (3) | 개인정보 보호팀   | Access / login / permission histories, security documents, and the org chart — **but not** the personal-information access log and **not** password-rule management |
| **Privacy Staff** (4)           | 개인정보 담당자   | The day-to-day read surface: access history, login history, security documents, and the org chart — nothing more                                                    |
| **Super Administrator**         | (ROLE_ADMIN)      | Everything, always                                                                                                                                                  |

The most sensitive screen — the **personal-information access history** (who viewed which member's private data) — and the ability to change **password rules** are deliberately confined to the Officer and Deputy tiers plus Super Administrators.

### Where it appears in the admin

Once you have the grants, the audit logs show up under a collection group named **"Privacy Protection System"** in the admin sidebar, and the custom screens (Password Composition Rules, Privacy Organization Chart, Security Documents, and the pre-filtered login views) appear as extra navigation links added below the standard menu.

### Try it on the demo data

The seeded demo makes the gating obvious:

1. Sign in at `/admin` as **`privacy-officer@admin.demo.example.com`** (display name _Daniel Cho_; password = the value of `SEED_ADMIN_PASSWORD`, dev default `changeme-dev-only!`). You will see the full Privacy Protection System.
2. Sign out and sign back in as **`content-editor@admin.demo.example.com`** (_Claire Bennett_, Content Editor) or **`stats-analyst@admin.demo.example.com`** (_Felix Nam_, Statistics Analyst). The entire subsystem is gone — no group, no links, and the URLs return "forbidden".
3. The seeded **super administrator** (email from `SEED_ADMIN_EMAIL`; dev default `admin@publicpulse.com.bd`, login ID `admin`; password from `SEED_ADMIN_PASSWORD`) holds both the Super Administrator role and the Chief Privacy Officer role, so it also sees everything.

> The example privacy-org accounts `privacy-deputy`, `privacy-team`, `privacy-staff-1`, and `privacy-staff-2` are **not** login-capable — they are seeded with unknown random passwords and a "pending" status purely to populate the org chart. To make one usable, an operator approves the account (status → active) and sets a known password.

---

## The audit / access histories

Everything under the "Privacy Protection System" group is an **append-only audit log**. These records are written automatically by the system as administrators work; you can read, search, and (for retention housekeeping) delete rows, but **no one — not even a Super Administrator — can create or edit an audit row**. The purpose text, the timestamps, and the actor identities are permanent evidence.

Identity columns (names, login IDs, IP addresses) are shown **masked** in the list views. The full value is stored underneath for non-repudiation; masking only affects what is displayed on screen.

### Administrator / user access history

_(legacy 관리자·사용자 접속 이력 — refs 3-1, 1-55)_

A row is recorded for every back-office action. Each row shows:

- **When** (the event time) and the **session login time**
- **Who** — the acting administrator (masked label)
- **Menu** touched, and the **action**: Login, Logout, List, View, Create, Update, Delete, or "Denied (IP)" when the IP access-control rules refused a request
- The exact request **URL** and the client **IP address**

Newest events appear first.

### Login history — and the overseas / mobile / failure views

_(legacy 로그인 이력 / 해외 로그인 시도 이력 / 모바일 로그인 이력 / 로그인 실패 이력 — refs 3-5, 3-6, 3-7)_

Every login attempt — success or failure — is recorded once, with the user label (masked), the login ID (masked), a **success** flag and fail reason, the IP address, an **overseas** flag, a **mobile** flag, and the user agent.

The legacy manual described four separate screens; in U-CMS they are **one log with saved filters**. The navigation offers three ready-made views built on top of the same data:

- **Overseas Login Attempts** — filtered to the overseas flag
- **Mobile Login History** — filtered to the mobile flag
- **Login Failure History** — filtered to unsuccessful attempts

The unfiltered collection list is the master "all login history" screen.

> **Not in this build:** the _overseas_ flag currently defaults to "domestic" for every login. The geo-IP lookup that would set it is a pluggable seam that has not yet been connected to a live provider, so the Overseas Login Attempts view will normally be empty until that is wired up. The _mobile_ flag is set for real, from the browser's user-agent.

### Permission change history & menu permission setting history

_(legacy 권한 변경 이력 / 메뉴 권한 설정 이력 — refs 3-2, 3-3)_

Two logs track "who changed whose access":

- **Permission Change History** records every change to a _user's_ roles: the affected user (name, ID, email), a before → after **change summary** (for example `roles: [ROLE_AA] → [ROLE_AA, ROLE_BB]`), and the administrator who made the change with their IP.
- **Menu Permission Setting History** records every change to a _role's_ menu grants: the role code and name, the exact menus **added** and **removed** in that event, and the administrator who made the change with their IP.

Both are gated together on a single permission-history grant (held by the Officer, Deputy, and Team tiers).

---

## Personal-information access logging

_(legacy 개인정보 열람 이력 — refs 3-8, 1-36; the core of the subsystem)_

This is the most important record U-CMS keeps. **Every single touch of a member's personal information in the back office writes an immutable log row** — a view, an edit-form open, or an export. It captures:

- **When** it happened and the **screen** used
- The **subject** — the member whose data was accessed (masked in the list), their internal member id, and their site
- The exact **URL** (including the target member id) and the viewer's **IP** (masked in the list)
- The **action**: View (열람), Edit (수정), or Export (다운로드)
- The **purpose category** (inquiry, modification, export, inquiry response, complaint handling, or other) and a free-text **purpose detail**
- The **viewer** — the administrator who did the looking (masked in the list)

The capture happens on the server, so it cannot be bypassed. Even a direct data request outside the admin UI (for example a raw API read of a single member) writes a "view" row exactly as the on-screen detail view does. This log is gated on the personal-information grant — only the Officer, Deputy, and Super Administrator tiers can read it.

### The confirm-gate on the member detail screen

When an operator opens a member's detail/edit screen, a yellow notice appears at the top:

> _"For personal-information protection, every lookup of this member's personal information is recorded in the personal-info access history. Please acknowledge to continue."_

Click **Confirm** to dismiss it. Important: this banner is a **courtesy notice, not the security boundary**. The access is logged the moment the screen loads, whether or not you ever click Confirm — dismissing the notice does not "un-log" anything.

### The watermark on personal-information screens

_(legacy watermark — ref 1-37)_

While a member's detail screen is open, a faint, repeated diagonal **watermark** is painted across the content showing three things: **who** is viewing (your own name and login ID), the exact **timestamp**, and a **management number**. The management number ties directly back to the matching row in the personal-information access log.

The watermark is generated on the server and is designed to survive a screenshot **or a printout** — so any leaked copy of a member's personal data indelibly identifies who looked and when. You cannot remove or alter it. (It does not appear on the "create new member" screen, because there is no existing personal data on screen to protect.)

### Exporting member data — the purpose modal (mandatory reason)

_(legacy 회원정보 엑셀다운로드 열람목적 — refs 1-36, 3-8)_

Above the member-management list there is an **"Export members (열람목적)"** button. Exporting member data is not a one-click action:

**To export member data:**

1. On the member list, click **Export members (열람목적)**.
2. In the modal, choose a **Purpose category** (Data export, Inquiry response, Complaint handling, or Other).
3. Type a **Purpose detail** — this field is **required** (for example, _"Responding to a member data-access request, ref #1234"_). The Export button stays disabled until you enter something.
4. Click **Export CSV**. The file downloads, and a permanent "export" row is written to the personal-information access history _before_ the file is produced — with the purpose you typed as the evidence.

> **Gotcha — no purpose, no export.** The reason is enforced on the server, not just in the pop-up. An export with a blank purpose is rejected outright ("A purpose (열람목적) is required before member data can be exported."). There is no way to script around it.

> **What ends up in the file depends on your role.** A plain member-management administrator gets an export with the personal columns (login ID, name, email, mobile) **masked**. A privacy officer (who holds the personal-information grant) gets the **full, unmasked** values. Non-personal columns (row number, status, join date, last access, site) are always in the clear. Either way the export is logged with your stated purpose, and a non-super administrator only ever exports members from the sites they are assigned to.

### The access-history log and its own export

The personal-information access history itself can be exported to a CSV so a privacy officer can hand the audit trail to an auditor. Use the export control on the log screen (or the `history/export` endpoint). The exported file **masks** the subject label, the viewer label, and the IP — the same protection the on-screen list applies — while keeping the screen name, URL, action, purpose category, and purpose detail intact.

### Try it on the demo data

1. Sign in as **`privacy-officer@admin.demo.example.com`**.
2. Open **Members**, click into any seeded member (for example _member01_). Notice the yellow confirm notice and the diagonal watermark carrying your name, the time, and a `PIA-…` management number.
3. Open the **Personal Information Access History** under the Privacy Protection System group — your view of that member is already logged as an "inquiry" row.
4. Back on the member list, click **Export members**, leave the purpose blank, and try to submit — the button stays disabled. Enter a purpose, export, then return to the access history to see the new "export" row carrying your purpose text.

---

## Password composition rules

_(legacy 비밀번호 작성 규칙 — ref 3-9)_

This screen manages the **human-readable password rules** the system displays to users. It is a versioned history: you may keep many versions, deactivating old ones without deleting them.

- Open **Password Composition Rules** from the privacy navigation (the underlying collection lives under the "System" group, gated so the Officer/Deputy tiers and Super Administrators can manage it). The view highlights the **currently live** rule and lists every version with its created date, active flag, and who created it.
- Each version has a **rule text** (multiline, required — legacy 비밀번호 규칙), a **usage / active** flag (legacy 사용여부), and an author stamp that is filled in automatically and cannot be edited.
- **The live rule is the most recently _created_ version among those marked active.** To make an older rule's wording live again, do **not** just re-tick its active flag — a newer active version would still win. Instead, create a **new** version carrying that text and mark it active; the new one becomes the most recent and therefore the live one.

**To publish a new password rule:**

1. From the management view, click through to create a new version in the collection editor.
2. Enter the **rule text** and set the **active** flag on.
3. Save. The management view now shows it as the current live policy.

> **Not in this build (deliberate):** the rule text on this screen is **what users are shown, not what the system enforces**. The password strength actually rejected at sign-up/change is fixed in code and does not read this text. Editing the wording here updates the displayed guidance only — it will not loosen or tighten what passwords are accepted. This mirrors the legacy system, where the displayed notice and the enforced rule were maintained separately.

---

## The privacy organization chart

_(legacy 개인정보 조직도 — ref 3-10)_

Open **Privacy Organization Chart** from the privacy navigation (gated on the org-chart grant, which all four privacy tiers hold). It is a **read-only** diagram of the privacy-governance hierarchy in four tiers, top to bottom:

1. **Chief Privacy Officer** (개인정보 책임자)
2. **Deputy Privacy Officer** (개인정보 부책임자)
3. **Privacy Protection Team** (개인정보 보호팀)
4. **Privacy Staff** (개인정보 담당자)

The chart is **generated automatically from role assignments** — it is never drawn by hand. Each person appears in the tier(s) whose privacy role they hold, showing their name, department, and a duty label (their own duties text, or the tier's default such as _"관리적 보호조치 / Administrative safeguards"_). Add or remove an administrator from a privacy role and the chart re-derives itself on the next load. A tier with nobody assigned renders as an "unassigned" placeholder.

Because it is built from administrator organization data (names, departments, duties), it contains **no member personal information** and applies no masking; administrators' login IDs and emails are deliberately left off.

**To change the chart:** you do not edit it here. Assign or unassign the relevant privacy role on the administrator's account (in administrator management), and the chart updates automatically.

### Try it on the demo data

Sign in as the super administrator or `privacy-officer@…` and open the chart. It is pre-populated: the super administrator sits at the Officer tier, and the seeded example accounts fill the Deputy, Team, and Staff tiers.

---

## Security-document boards

_(legacy 보안교육 / 보안사례 / 개인정보 관리계획 / 침해사고 대응지침 — ref 3-4)_

The Privacy Protection System hosts four internal document libraries:

- **Security Education** (보안교육)
- **Security Cases** (보안사례)
- **Security Management Plan** (개인정보 관리계획)
- **Incident Response Guidelines** (침해사고 대응지침)

These are ordinary board/post libraries flagged as **security documents**, reached through the **"Security Documents"** link in the privacy navigation (a pre-filtered board list). They behave like any other attachment-enabled board: search, open a post, register a new post, attach files.

> **Gotcha — invisible to non-privacy administrators.** A security-document board (and its posts, and even its file attachments) is gated on the security-documents grant, which only the privacy roles and Super Administrators hold. A general content administrator does **not** see these boards anywhere — not in the board list, not by URL, and cannot download their attachments through any back door. Conversely, a content administrator can never _turn_ an ordinary board into a security-document board; that flag is reserved for privacy roles.

**To create a security-document post:**

1. As a privacy-role administrator, open **Security Documents** from the navigation.
2. Open the library you want (e.g. _Incident Response Guidelines_) and create a new post.
3. Enter the title and content, attach any files, and save. The post automatically inherits the security-document protection from its board — its attachments are locked to privacy-role readers too.

> **Not in this build:** there is **no "seal" or "lock once published" mechanism** on security-document boards. A security-document post is an ordinary, editable board post — a privacy-role administrator with the grant can edit or delete it at any time. The only records in this subsystem that are truly immutable are the **audit logs** (access, login, permission, and personal-information histories), which cannot be edited by anyone. If your operating procedure requires that a finalized security document can never be altered, that must be handled by process, not by a system lock.

### Try it on the demo data

Sign in as `privacy-officer@…`, open **Security Documents**, and browse the four seeded libraries (each has a couple of example posts). Then sign in as `content-editor@…` — the Security Documents link and boards are simply not there.

---

## Gotchas recap

- **A stated purpose is mandatory before any member export.** Blank purpose = rejected, enforced on the server. The purpose becomes permanent audit evidence.
- **A security-document board is invisible to non-privacy administrators** — including its posts and file attachments.
- **Opening a member's personal-information screen is logged even if you never click "Confirm"** on the notice, and the screen is watermarked with your identity, time, and a traceable management number.
- **Audit logs are immutable** — no one, not even a Super Administrator, can edit an access/login/permission/personal-info row; they can only be read, searched, and purged for retention.
- **The password rule text is displayed, not enforced** — editing it changes guidance shown to users, not the strength actually required.
- **The overseas-login view is empty by design for now** — geo-IP detection is not yet connected.
- **Password-rule management and the personal-information access log are Officer/Deputy-only** — the Team and Staff privacy tiers do not get them.

---

## Demo credentials (as seeded)

Sign in to the admin at `/admin`:

- **Super administrator** — email from `SEED_ADMIN_EMAIL` (dev default `admin@publicpulse.com.bd`, login ID `admin`; deployed `moshiur@ticonsys.com`), password from `SEED_ADMIN_PASSWORD` (dev default `changeme-dev-only!`). Holds Super Administrator **and** Chief Privacy Officer — sees all of §3.
- **`privacy-officer@admin.demo.example.com`** — _Daniel Cho_, Chief Privacy Officer; full §3 surface. Password = `SEED_ADMIN_PASSWORD`.
- **`content-editor@admin.demo.example.com`** (_Claire Bennett_), **`comms-admin@admin.demo.example.com`** (_Erin Park_) — Content Editor; **no** privacy access. Password = `SEED_ADMIN_PASSWORD`.
- **`stats-analyst@admin.demo.example.com`** — _Felix Nam_, Statistics Analyst; **no** privacy access. Password = `SEED_ADMIN_PASSWORD`.
- **Example org-chart accounts** `privacy-deputy`, `privacy-team`, `privacy-staff-1`, `privacy-staff-2` — **not** login-capable; they only populate the org chart.

Public **members** (used as the _subjects_ of personal-information access, not as admins) sign in on the **public site**, not `/admin`: `member01@demo.example.com` … `member18@demo.example.com`, plus `demo-member` (`member@demo.example.com`) and `pending-member` (`pending@demo.example.com`, which cannot log in until approved). Password = `SEED_MEMBER_PASSWORD` (dev default `Pulse-Member-2026`).
