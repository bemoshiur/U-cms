# Web Content & Member Management

This page covers two everyday jobs for a U-CMS site operator: managing the **web content pages** that make up a site (with the built-in version history, restore, and diff), and managing the **members** who register on the public site (the masked member list, the audited member detail view, approving new sign-ups, and the purpose-gated export). It also covers the **privacy-policy terms documents**, because those are the versioned documents a member consents to at sign-up. Every time an operator opens or exports a member's personal information, U-CMS records it in the personal-information access history — see the **Privacy & Personal-Information Protection** page of this guide for how to read that trail.

---

## Before you start: where things live and who can do them

Everything in this page is inside the Payload admin panel at `/admin`. In the left-hand navigation:

| What                 | Nav group   | Menu name                                   | Direct URL                          |
| -------------------- | ----------- | ------------------------------------------- | ----------------------------------- |
| Web content pages    | **Content** | Web Content Management                      | `/admin/collections/webContents`    |
| Privacy-policy terms | **Content** | Privacy Policy Terms Management             | `/admin/collections/termsDocuments` |
| Members              | **Members** | Member Accounts (under "Member Management") | `/admin/collections/members`        |

Access is by permission grant **and** by site (tenant):

- **Web content** and **Terms** require the `content.webContents` / `content.terms` menu grant. In the seeded demo, the **Content Editor** role holds both, so `content-editor@admin.demo.example.com` and `comms-admin@admin.demo.example.com` can manage them — as can the super admin.
- **Member management** requires the `members.manage` grant. In the seeded demo, **only the super admin `admin`** has it. The Content Editor and Statistics Analyst roles do not, and the Privacy Officer role holds the privacy audit menus (including the personal-info access logs) but _not_ `members.manage`. So for the member steps below, log in as the super admin.
- A non-super operator only ever sees the content and members of the **site(s) they are assigned to**. The super admin sees all sites.

**Demo login (super admin):** go to `/admin`, log in with Login ID `admin` (email `moshiur@ticonsys.com` on the deployed site, or `admin@publicpulse.com.bd` in local dev), password from `SEED_ADMIN_PASSWORD` (local-dev default `changeme-dev-only!`). The seeded demo data lives on the **Demo** site.

---

## Part 1 — Web content pages

A web content page is the body of one **user menu** on a site — for example the page behind "Company Introduction" or "Directions". In U-CMS each web content is bound **1-to-1 to a menu**: the content only exists for a menu that already exists, and a menu can have at most one web content.

### How web content is organised

- The **`menu`** field is required and unique. This is the legacy rule "content exists only for a menu created in Menu Management" (ref 2-2). You cannot create free-floating content.
- The page's **site (tenant) is derived automatically from the menu** — you never pick the site yourself. If you try to bind a menu that belongs to a site you are not assigned to, the save is rejected.
- **Versioning is always on.** Every save writes a new version and the full history is kept forever, so any earlier version can be brought back.

### Fields reference

| Field (label)                              | Legacy label | Notes                                                                                                                |
| ------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `menu` (The menu this content is bound to) | 메뉴         | Required, unique (1:1). Pick the user menu this page fills.                                                          |
| `name` (Internal name)                     | 컨텐츠명     | Optional internal label for operators.                                                                               |
| `title` (Display title)                    | —            | The page's shown title; this is the list column and record title.                                                    |
| `content` (The page body)                  | 콘텐츠       | Rich-text editor. This is the versioned body.                                                                        |
| `responsibleDept` (Responsible department) | 담당부서     | Optional link to a department.                                                                                       |
| `responsiblePerson` (Responsible person)   | 담당자       | Optional free-text name.                                                                                             |
| `contentUrl`                               | 내용/URL     | **Read-only, informational only.** Legacy served content from a controller URL; the rebuild renders the page itself. |

### To create a web content page

1. First make sure the **menu exists**. If it does not, go to **Content → Menu Management** and create the user menu, then come back. (Content cannot be created for a menu that does not exist yet.)
2. Go to **Content → Web Content Management** and click **Create New**.
3. In **The menu this content is bound to**, select the target menu. The site is set for you from that menu.
4. Fill in **Display title** and, optionally, **Internal name**, **Responsible department**, and **Responsible person**.
5. Write the page in the **page body** rich-text editor.
6. To publish the page so it is the active, publicly-rendered version, use the **Publish** control (the status control at the top of the editor). Saving as a **draft** keeps your work in the version history but does **not** change what the public sees.
7. Click **Save**.

> **Gotcha — draft vs published.** Only the **published** version is the "active" page. If you only ever "Save draft", the public site keeps showing the last published version (or nothing, if it was never published). This is the rebuild's equivalent of the legacy "exactly one active version".

> **Gotcha — one content per menu.** Because `menu` is unique, if the menu already has content you will edit that record rather than create a second one. Trying to bind an already-used menu is rejected.

### Versioning, history, and restore

U-CMS uses Payload's built-in versions with drafts. In practice:

- **Every Save creates a new version.** Nothing is overwritten. This is the legacy "새로운 버전으로 수정 → new version" behaviour (ref 2-3, callout 8).
- **The published version is the active one.** Drafts and every superseded published version stay in the history.
- **The full history is retained** (no version limit), so you can always go back.

To view history and restore an earlier version:

1. Open the web content record.
2. Click the **Versions** tab (or **API → versions** on the edit view). You get the list of every saved version with its author and timestamp.
3. Click a version to open it. Payload shows a **built-in field-level comparison** highlighting what changed versus the previous version — this is your everyday "what changed" view.
4. To bring an older version back, open that version and use **Restore this version**. U-CMS republishes that version's data as the current page (and records the restore as yet another new version), so the active version is always exactly one and any prior one can be reinstated. This is the legacy 사용여부 변경 / "사용" (Use) button (ref 2-3, callouts 6–7).

### Comparing two specific versions (line diff)

Beyond the built-in field comparison, U-CMS exposes a programmatic **line-by-line diff** between any two versions of one page:

```
GET /api/webContents/{id}/diff?from={versionId}&to={versionId}
```

It returns a per-field (`name`, `title`, `content`) line diff — each line marked `equal`, `added`, or `removed` — after flattening the rich text to plain text. Access is the same as reading the page (you must hold `content.webContents` and be assigned to the page's site), and both version IDs must belong to that same page, so it can never leak another site's content.

> **Not in this build (web content):**
>
> - The legacy **split-page / one-page visual diff screen** with red/green side-by-side highlighting (ref 2-4) is **not built as a UI** — the `/diff` endpoint returns the diff data, but the styled split/unified render is deferred. For everyday review, use the built-in **Versions** comparison described above.
> - The legacy **hash-compare against an externally-edited JSP file** is intentionally dropped. Content now lives only in the database and is versioned there — there is no external file to reconcile, and no `콘텐츠 파일 경로` (JSP path).
> - The legacy in-editor **secure attachment panel** (per-file copy-URL, preview button, "max 5 files") on the content edit screen is **not part of this collection**. Files are managed through the media/attachment tooling instead; the `contentUrl` field is display-only and informational.
> - **Sequential "Ver.76" numbers** are not used — Payload identifies versions by their own IDs and timestamps.

### Try it on the demo data

The seed creates web content bound to the demo site's Home menu and saves it **twice**, so it already has two published versions. Log in as `admin` (or `content-editor`), open **Web Content Management**, open the Home page record, and click the **Versions** tab: you will see the two versions and can compare or restore between them.

---

## Part 2 — Privacy-policy terms documents (versioned, same engine)

Terms documents use the **exact same versioning engine** as web content, and they matter here because a member's sign-up consent points at a specific terms version.

- Each site keeps **one document per fixed category**. The five categories (label / legacy Korean) are: **Terms of Use** (이용약관), **Collection, Use & Processing of Personal Information** (개인정보의 수집·이용 등 처리에 관한 사항), **Third-Party Provision of Personal Information** (개인정보의 제3자 제공에 관한 사항), **Collection of Unique Identifying Information** (고유식별정보 수집에 관한 사항), and **Other Terms** (기타). The pair (site, category) is unique.
- Fields: **`category`** (required, one of the five), **`title`** (required), **`content`** (required rich text, versioned), **`effectiveDate`** (the date this version takes effect, shown in the public change history — ref 2-16), and an optional **`menu`** binding purely for where it appears on the site (it must belong to the same site).
- Just like web content: every save is a new version, the **published** version is the active/in-use one, and any prior version can be restored via the **Versions** tab.

### To edit a terms document

1. Go to **Content → Privacy Policy Terms Management**.
2. Open the document for the category you want (or **Create New** and pick a category that does not yet exist on this site).
3. Edit the **title** / **content**, set an **effective date** for the new version, and **Publish**.
4. Save. A new published version becomes active; the previous version stays in the history for the public change log and as consent evidence.

> **Why the history is never pruned:** a member's stored consent references the terms version that was active **when they agreed** (see [Consent & terms snapshots](#consent--terms-snapshots)). Keeping every version means that evidence stays valid even after you publish newer terms.

> **Not in this build (terms):** the public-facing `/terms/{category}` pages and change-history table are the public site's concern (rendered in the Phase-4 frontend); this admin module is where you author and version the documents.

### Try it on the demo data

The seed publishes all five categories on the Demo site, and gives the **Collection/Use of Personal Information** document a **second** published version — so open that one and check the **Versions** tab to see a real prior version retained for consent evidencing.

---

## Part 3 — Member management

Members are the accounts that people register on the **public** site. They are a separate audience from admin operators: a member logs in on the public site, never at `/admin`, and a member session grants zero admin access. Members belong to exactly one site.

Because member records contain personal information, this area has extra safeguards that a normal collection does not: the list is **masked**, opening a member's detail is **logged and watermarked**, and exporting requires you to **state a purpose** that is recorded as evidence.

### The member list

Open **Members → Member Accounts** (`/admin/collections/members`). The default columns are **email, loginId, name, status, tenant**.

- **PII is masked in the list.** `name`, `loginId`, `email`, and `mobile` are shown masked — e.g. a name like `강현아` shows as `강*아`, a login ID like `member01` as `me***1`, an email as `m***@demo.example.com`. This masking applies to every list/relationship read, so member data never appears in full on a screen that isn't individually audited.
- **Search and filter** use Payload's built-in list tools: keyword search on the columns and a filter on **status**.

> **Gotcha — masking is deliberate.** You cannot "turn off" masking in the list. The only way to see a member's full details is to **open their detail page**, which is exactly the action that gets logged (below). That is the whole point of the design.

### To open a member's detail (and what happens when you do)

1. Click a member row to open the detail/edit view.
2. A yellow **acknowledgement banner** appears: "For personal-information protection, every lookup of this member's personal information is recorded in the personal-info access history." Click **Confirm** to dismiss it. This reproduces the legacy browser-confirm gate (ref 1-36, callout 5).
3. A diagonal **watermark** is painted across the detail — repeating your identity, the timestamp, and a management number. It is generated on the server (you cannot tamper with it) and is written to persist on screenshots and printouts (ref 1-37), so any copy of the personal information carries who viewed it and when.
4. **A `view` entry is written to the personal-information access history** for this member — automatically, on the server, whether or not you ever saw the banner. (A raw API read of the record is logged the same way.) If you then edit and save, an `edit` entry is also recorded.

### Member fields reference

| Field (label)                    | Legacy    | Who can change it            | Notes                                                                     |
| -------------------------------- | --------- | ---------------------------- | ------------------------------------------------------------------------- |
| `email`                          | 이메일    | Admin                        | Login email; globally unique.                                             |
| `loginId` (Public-site login ID) | 아이디    | **Admin only** after sign-up | Unique per site; 4+ chars, lowercase letters/digits/`. _ -`.              |
| `name` (Display name / nickname) | 성명/이름 | Member or admin              | Member-editable.                                                          |
| `mobile` (Mobile phone number)   | 휴대전화  | Member or admin              | Optional.                                                                 |
| `status` (Membership lifecycle)  | —         | **Admin only**               | `active` / `pending` / `dormant` / `withdrawn`. Only `active` may log in. |
| `tenant` (Site)                  | —         | **Admin only**               | The member's site; server-forced at sign-up, never client-settable.       |
| `marketingConsent`               | —         | Member or admin              | Optional opt-in checkbox.                                                 |
| `termsConsents`                  | 약관동의  | **Read-only**                | Snapshot of terms accepted at sign-up (see below).                        |

The privilege-sensitive fields (`status`, `tenant`, `loginId`, `termsConsents`) are locked to `members.manage` admins at the field level, so a member editing their own profile can change their name/mobile/marketing opt-in/password but can never self-approve, move sites, change their handle, or rewrite their consent history.

### To approve a pending member

New sign-ups that require approval arrive with **status = `Pending approval (승인대기)`** and **cannot log in** until approved.

1. In the member list, filter **status** to `pending` to find them.
2. Open the member's detail (this is logged, as above).
3. Change **status** to `Active (정상)`.
4. Save.

The member can now log in on the public site. Conversely, moving a member **out of** `active` (to dormant, withdrawn, or back to pending) not only blocks future logins but **immediately revokes their live sessions** — a suspended member cannot keep using an already-issued token.

> **Status meanings:** `Active (정상)` — normal, can log in. `Pending approval (승인대기)` — awaiting your approval, cannot log in. `Dormant — long inactivity (장기 미로그인)` — parked for not logging in for a long time. `Withdrawn (탈퇴)` — left/closed.

### Consent & terms snapshots

The read-only **`termsConsents`** array is the member's consent evidence, captured at sign-up. Each row records:

- **`category`** — which agreement (`service` = Terms of Use, `privacy` = Collection/Use of Personal Information — the two mandatory sign-up agreements),
- **`version`** — the exact terms-document version that was active on the member's site when they agreed (or `unversioned` if that site had no published terms yet), and
- **`agreedAt`** — when they agreed.

This snapshot is **immutable** — it is not member-editable and does not change when you later publish new terms, which is why Part 2's version history is never pruned. Optional **marketing** opt-in is separate and lives in `marketingConsent` (not a required term).

### To export members to CSV (purpose-gated)

Exporting member data always requires a stated purpose, which is recorded as permanent evidence before the file is produced (ref 1-36, callouts 2 & 4).

1. In **Member Accounts**, click **Export members (열람목적)** above the list.
2. In the modal, choose a **Purpose category** — Data export (개인정보 다운로드) / Inquiry response (문의 응대) / Complaint handling (민원 처리) / Other (기타).
3. Type a **Purpose detail** (required). The **Export CSV** button stays disabled until you enter one.
4. Click **Export CSV**. The file downloads.

What the export does behind the scenes:

- The purpose is **required and enforced on the server** — a blank purpose is rejected (a scripted caller cannot skip the modal), and the purpose is written to the personal-information access history as an `export` entry **before** the data is read.
- The export is **tenant-scoped** to the sites you are assigned to (the super admin gets all sites), and honours the optional site/keyword filters.
- **PII columns are tiered by grant.** An operator with `members.manage` but **without** the privacy-officer personal-info-logs grant gets the login ID / name / email / mobile columns **masked**; a privacy officer (holds `privacy.personalInfoLogs`) gets **full, unmasked** values. Non-PII columns (No., status, join date, last access, site) are always in the clear. The CSV includes a UTF-8 BOM so Korean opens correctly in Excel, and leading `= + - @` are neutralised against spreadsheet formula injection.

> **Demo note on the export tiers:** in the seeded demo, the only account that holds `members.manage` is the **super admin**, and the super admin also holds the privacy personal-info-logs grant — so a demo export returns **full** PII. There is no seeded "plain member-manager" account, so the _masked-CSV_ tier is not directly demonstrable out of the box; it applies to any real operator you grant `members.manage` to without the privacy grant.

### PII, masking, and the audit trail

To summarise the personal-information safeguards (all §3-audited — see the **Privacy & Personal-Information Protection** page of this guide for how to review the logs):

- **List / relationship reads** → masked, not logged (no full PII disclosed).
- **Detail view (single record)** → full PII, **logged as a `view`**, and watermarked, after the acknowledgement banner.
- **Edit** → **logged as an `edit`**.
- **Export** → purpose captured first, **logged as an `export`**, PII tiered by grant.

There is deliberately **no path** that shows full member PII without writing an audit entry. System/internal reads (login lookups, sign-up duplicate checks) and a member reading their own profile are not treated as an admin "viewing PII" and are not logged as such.

### Try it on the demo data

The seed creates a rich member roster on the Demo site: **member01–member18** (all active, with names like "James Wilson", "Sophia Kim"), plus **demo-member** (`member@demo.example.com`, active) and **pending-member** (`pending@demo.example.com`, pending). Members log in on the **public** site (not `/admin`) with the member password from `SEED_MEMBER_PASSWORD` (local-dev default `Pulse-Member-2026`); `pending-member` cannot log in until you approve it.

To exercise the admin side, log in at `/admin` as `admin` and:

1. Open **Member Accounts** and note the masked columns.
2. Filter status to `pending`, open **pending-member**, click **Confirm** on the banner, note the watermark, then set status to `Active` and Save — it can now log in.
3. Open any member and check the read-only **termsConsents** rows.
4. Click **Export members (열람목적)**, enter a purpose, and download the CSV.

> **Not in this build (members):** the legacy detail screen's **Korean postal-code address finder (주소 찾기)** and the split phone-number / email-domain input widgets (ref 1-37) are simplified — U-CMS keeps `mobile` as a single field and does not implement the address-finder popup. The legacy `성별` (gender) and `생년월일` (birth date) fields are not collected in this build.
