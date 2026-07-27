# The Board Engine & Posts

Boards (게시판) are the heart of every U-CMS site: they are the containers that hold your notices, press releases, questions and answers, photo galleries, and downloadable files. In U-CMS a single, flexible "board engine" powers every one of these. You first define **board types** (the behavior template), then create individual **boards** on your site, and finally publish **posts** into them. This page walks a non-technical operator through the whole flow — creating boards, filling in the field grid and categories, turning on attachments and skins, managing the specialized boards (Q&A, FAQ, gallery, attachment), the profanity and member banned-word filters, and the short-URL service — using only the features that are actually built into this system.

---

## Before you start: where everything lives and who can see it

Everything in this page is under the **Content Management** group in the left-hand admin navigation at `/admin`:

| Screen                            | What it manages                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Board Type Management**         | The reusable behavior templates (Notice / Photo / Q&A / FAQ / Attachment / Extended). Shared across all sites. |
| **Board Management**              | The individual boards on a site.                                                                               |
| **Post Management**               | The posts (게시물) inside every board.                                                                         |
| **Profanity Word Management**     | The forbidden-word list that blocks bad posts.                                                                 |
| **Member Banned-Word Management** | Words members may not use in their login ID / name / password at sign-up.                                      |
| **Short URL Management**          | The link-shortening service.                                                                                   |

Two access rules matter, and they trip people up:

1. **You only see boards for sites you are assigned to.** Boards, posts, and short URLs are _site-scoped_ (each belongs to exactly one site, called its "tenant"). A Super Administrator sees every site; a site-scoped admin sees only their own site's boards. If you create a post, its site is **inherited automatically from the board** — you never pick it yourself.
2. **Security-document boards are hidden from ordinary content admins.** A board flagged as a Privacy §3 "security document" library is gated behind **Privacy Protection** permissions, not Content Management. If you are a Content Editor you will simply not see those boards or their posts — that is by design, not a bug.

> **Board Type Management is shared; boards are not.** Board _types_ are global — a type you create is available to every site. Individual _boards_ are per-site. Keep this in mind when you name things.

---

## How the board engine is organized

- **One board type = one behavior.** A board type carries a system code like `PG0001` and a **kind** (integrated, photo, qna, faq, attachment, extended). The kind is what makes a board behave like a gallery vs. a Q&A board.
- **Every board points at one board type**, plus its own settings (attachments, categories, field grid, skin).
- **Every post belongs to one board.** There is a single Post Management screen for _all_ board kinds — the post automatically knows how to behave (show an answer box, show a gallery thumbnail, etc.) from the kind of board it sits in. You do not manage separate collections per board kind.
- **IDs are assigned for you.** Board types get a code in the form `PG` + four digits (e.g. `PG0011`). Boards get a **BBS ID** in the form `B` + seven digits (e.g. `B0000031`). Both are generated on save and are **read-only** — you cannot type or change them.

---

## Part 1 — Board types (the behavior templates)

The system ships with six built-in board types (seeded automatically). Their codes are pinned to the legacy values, so PG0005 and PG0007–PG0009 are intentionally missing:

| Code     | Name                  | Kind       | Legacy label   |
| -------- | --------------------- | ---------- | -------------- |
| `PG0001` | Integrated Board      | integrated | 통합게시판     |
| `PG0002` | Photo/Gallery Board   | photo      | 포토형게시판   |
| `PG0003` | Q&A Board             | qna        | 답변형게시판   |
| `PG0004` | FAQ Board             | faq        | FAQ게시판      |
| `PG0006` | Attachment File Board | attachment | 첨부파일게시판 |
| `PG0010` | Extended Board        | extended   | 확장형 게시판  |

You will rarely need to create a new one, but if you do:

**To create a board type:**

1. Go to **Content Management → Board Type Management** and click **Create New**.
2. Enter a **Name** (required).
3. Choose a **Kind** (required) — this drives the board's behavior. Pick from `integrated`, `photo`, `qna`, `faq`, `attachment`, `extended`.
4. Optionally fill in **Description** (게시판유형상세) — up to **800 characters**. Longer text is rejected with a clear error.
5. Leave **Table Name** at its default (`posts`). This field is informational only — it is kept for parity with the legacy system, which stored all board types in one physical table. It does **not** switch any database table.
6. Save. The **Code** (`PGxxxx`) is assigned automatically; the first admin-created type becomes `PG0011`.

---

## Part 2 — Creating a board

Open **Content Management → Board Management** and click **Create New**. A board's settings are grouped as follows.

### 2.1 Basic settings

| Field                                                          | What it does                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Name** (required)                                            | The board's display name.                                                                    |
| **Board type** (required)                                      | Which behavior template this board uses (from Board Type Management).                        |
| **Integrated board** (checkbox)                                | See the important lock below.                                                                |
| **Skin**                                                       | _Common skin (공통)_ or _This site's skin_. Choice is stored only (see "Not in this build"). |
| **Board form**                                                 | _List (리스트형)_ or _Thumbnail (썸네일형)_ — the thumbnail/gallery layout.                  |
| **Sort order**                                                 | _Latest first_ or _Oldest first_.                                                            |
| **Editor for admins only** (default on)                        | The rich-text editor is available to admins only; end users never get it.                    |
| **Comments enabled**                                           | Allow comments.                                                                              |
| **Prev/next enabled**                                          | Show previous/next navigation on a post.                                                     |
| **Excel export**                                               | Allow exporting the board's post list.                                                       |
| **User post allowed**                                          | Allow logged-in members to submit posts (used by Q&A — see Part 4).                          |
| **Secret post allowed**                                        | Allow private/secret (비공개) posts.                                                         |
| **New icon window**                                            | Number of days a post shows the "New" icon after it is posted (default 3).                   |
| **List count** / **Page count**                                | How many posts per list page, and how many page numbers to show (defaults 10 / 10).          |
| **Top content** (상단콘텐츠) / **Bottom content** (하단콘텐츠) | Raw HTML shown above/below the board.                                                        |
| **Header notice**                                              | A notice banner shown at the top of the board.                                               |

> **The Integrated board lock — the #1 gotcha.** If you tick **Integrated board**, the system _forces_ the board type to `PG0001` (Integrated Board) and the skin to _Common_. If you try to save an integrated board with any other type or skin, the save is rejected with an error. An "integrated" board is the standard general-purpose notice board; leave the box unticked when you want a photo, Q&A, FAQ, attachment, or extended board and want to pick the type freely.

### 2.2 Categories (분류코드 — up to 3)

Each board can bind **up to three** classification-code groups. These become dropdowns the author picks from when writing a post.

Each category slot has:

- **Classification code** (required) — a code **group** that must already exist in **Code Management**. You select an existing group; you cannot type a free-form value here.
- **Title** — the label shown to the author.
- **HTML title attribute**, **Attribute value** (e.g. `data="12"`), **Style** — advanced display tweaks.
- Five behavior flags: **Use (사용)**, **Required (필수)**, **Show in list (목록)**, **Show in detail (보기)**, **Searchable (검색)**.

> **Codes must pre-exist.** You bind a code _group_ here — you cannot create the codes on this screen. Register them first in Code Management. When a post is saved, the system checks that the chosen category value actually belongs to the group bound to that slot, and rejects mismatches. If a slot is marked **Use + Required**, a post cannot be saved without a value for it.

### 2.3 Field settings (the field grid, 필드설정)

This grid controls which columns a post can carry and how each behaves. Every new board starts with the built-in default rows:

`Number`, `Title`, `Division`, `Department`, `Author`, `View Count`, `Registration Date`, `Modification Date`, `Attachment`, plus four **Extra Field 1–4** (short text) and four **Extra Content 1–4** (long text) rows.

Each row has:

- **Field key** (the stable internal name, e.g. `title`, `extraField1`) and **Label** (what the author sees).
- **HTML title attribute**, **Attribute value**, **Style** — display tweaks.
- **Input type** — the HTML element the field renders as: `text`, `textarea`, `date`, `email`, `select`, `number`.
- The same five flags: **Use / Required / Show in list / Show in detail / Searchable**.

How to use it:

- **The four Extra Field and four Extra Content rows ship turned off.** Tick **Use** on a row to opt it into this board — that is how you add custom columns (e.g. a "Reference number" field on an Extended board).
- **Required is enforced on save** for the title, author, department, and the eight extra field/content rows, plus a special rule: if the **Attachment** row is Use + Required, a post must carry at least one attachment. (System-managed rows like Number, View Count, and the date columns are filled in automatically, so their Required flag is a display concern only.)

### 2.4 List order & detail order

Two more settings — **List field order** and **Detail field order** — hold the order of the columns shown in the board's list view and in a single post's detail view, as ordered lists of field keys. They default to sensible orders and can be set independently.

> **Not in this build (simplified):** these are stored as ordered key lists. The drag-and-drop reordering handle from the legacy manual (refs 1-31 / 1-32) is not built — you edit the order as a list of keys.

### 2.5 Attachments

- Tick **Attachments enabled** to accept file uploads on this board. Three more settings then appear:
  - **Attachment max count** (default 1).
  - **Attachment max size (MB)** (default 10; the legacy hint of "10 MByte recommended" is preserved).
  - **Attachment allowed extensions** — a **lowercase, comma-separated list with no spaces**, e.g. `hwp,pdf,png`. Anything else (uppercase, spaces, dots) is rejected with a clear message. Leave blank to allow any type.
- These limits are enforced when a post is saved: too many files, an over-size file, or a disallowed extension all block the save.

### To create a Notice board (worked example)

1. **Content Management → Board Management → Create New.**
2. **Name:** `Notice`.
3. Tick **Integrated board** — the type locks to `PG0001` and the skin to Common automatically.
4. **Board form:** _List_. **Sort order:** _Latest first_.
5. Tick **Attachments enabled**; set **max count** `3`, **max size** `10`, **allowed extensions** `hwp,pdf,png,jpg`.
6. (Optional) Under **Categories**, add a slot bound to an existing code group, tick **Use** (and **Required** if authors must always classify).
7. **Save.** The board gets a BBS ID like `B0000031`.

---

## Part 3 — Managing posts

Open **Content Management → Post Management → Create New**. The available fields depend on the board you pick.

**To publish a post:**

1. **Board** (required) — pick the board. This determines the post's configuration, its site, and its kind (notice/gallery/Q&A/etc.). Choose it first; the kind-specific fields (like the Q&A answer box) appear based on it.
2. **Title** (required).
3. **Author** — a free-text display name. Optionally link **Author user** to an admin account.
4. **Department** / **Team** — the owning department (from the department tree) and a free-text team name.
5. **Content** — the post body, written in the rich-text editor.
6. **Notice** (공지) — tick **Notice** to pin the post. You can optionally scope it with **Notice from** / **Notice to** dates.
7. **Secret** (비공개) — tick to make the post visible only to its author and admins (only meaningful when the board has _Secret post allowed_ on).
8. **Category 1–3** — pick values from the code groups the board bound (only the slots the board configured appear).
9. **Extra Field 1–4 / Extra Content 1–4** — the custom columns, if the board turned them on.
10. **Attachments** — add files (each has a description and a _Representative_ flag; see Gallery below). Constraints come from the board.
11. **Save.** The system validates required fields, category membership, and attachment rules, and runs the profanity filter (Part 5) before saving.

**Things the system fills in for you (read-only):** the post number, **View count** (incremented when the post is viewed on the public site), each attachment's file sequence number and download counter, and the denormalized board kind.

---

## Part 4 — The specialized boards

All four behave differently purely because of their board type's **kind** — you do not manage them on separate screens.

### 4.1 Q&A board (kind `qna`): member asks → admin answers

- Create a board whose type is **Q&A Board (`PG0003`)**. To let members post questions, turn on **User post allowed** on the board.
- **The member asks on the public site.** A logged-in member submits a question from the board page. The system only accepts the member's **title** and **content** — it force-sets the board, site, and author from the session and never lets a member pin a notice, publish a secret post, or write an answer.
- **The admin answers in Post Management.** Open the question, fill in the **Answer** field (this box only appears for Q&A posts), and save.
  - **Answered by** and **Answered at** are stamped automatically from the admin who wrote the answer and the server clock — they cannot be forged or edited.
  - **Is answered** flips to true automatically once an answer is present (clearing the answer clears it again).
- Only a Post-Management admin can write the answer; a member never can.

### 4.2 FAQ board (kind `faq`)

- Create a board whose type is **FAQ Board (`PG0004`)**. Posts are ordinary posts (a title and body) — there is no extra answer field.
- On the public site they render accordion-style, ordered by the board's **Sort order** setting.

### 4.3 Gallery / photo board (kind `photo`)

- Create a board whose type is **Photo/Gallery Board (`PG0002`)**, set **Board form** to _Thumbnail_, and enable **Attachments**.
- Each post's gallery card is driven by its **representative** attachment. In the post's Attachments list, tick **Representative** on the image you want as the thumbnail. **At most one** attachment can be the representative — ticking two is rejected. If you add images to a photo post and mark none, the system automatically makes the **first** one the representative.

### 4.4 Attachment board (kind `attachment`)

- Create a board whose type is **Attachment File Board (`PG0006`)** and enable **Attachments**. (The legacy fixed attachment board is BBS ID `B0000009`, which the demo data pins.)
- Posts here act as file hosts: each attached file is served through a **managed download endpoint** rather than a direct link, and each file's download count is tracked.

---

## Part 5 — Profanity & member banned words

### 5.1 Profanity Word Management (금칙어)

A single global list of forbidden words. **When a post is saved, if its text contains any active word, the save is rejected** — the operator sees a generic policy message that never repeats the offending word.

**To add a profanity word:**

1. **Content Management → Profanity Word Management → Create New.**
2. Enter the **Word** (must be unique). Matching is **case-insensitive substring** — so `badword` also blocks `BadWord123`. (Be aware this can over-match short Latin fragments; curate the list accordingly.)
3. Leave **Active** ticked. To stop filtering a word without losing it, edit it and **untick Active** — deactivating disables it; you do not have to delete it.
4. The **Registrant** (the admin who added it) is recorded automatically.

The post text checked includes the title, author, team, all extra fields/contents, the body, and any Q&A answer.

### 5.2 Member Banned-Word Management (회원 금칙어)

A global list of words members may not use when signing up on the public site. **Enforced at member sign-up** — a chosen login ID, name, or password containing an active banned word blocks registration.

**To add a member banned word:**

1. **Content Management → Member Banned-Word Management → Create New.**
2. Enter the **Word**.
3. Choose a **Scope** — where the word is forbidden:
   - **common** — everywhere (checked against both ID/name and password).
   - **loginId** — the login ID and name.
   - **password** — the password only.
4. Leave **Active** ticked. Matching is case-insensitive substring, same as profanity words.

> The same word may legitimately appear under different scopes; uniqueness is enforced on the **word + scope** pair, not the word alone.

---

## Part 6 — Short URLs

**Content Management → Short URL Management** turns a long link into a short, shareable one. Short URLs are per-site, but the generated code is globally unique so the public redirect resolves it unambiguously.

**To create a short URL:**

1. **Create New.**
2. **Link name** (링크명, required) — a label so you can find it later, e.g. `Press releases`.
3. **Original URL** (required) — the destination. It must be either an absolute `http(s)://…` address **or** a site-relative path (`/services/online`, `?q=…`). Dangerous values (`javascript:`, `data:`, protocol-relative `//host`) are rejected — this protects the site from being turned into an open redirect.
4. **Remarks** (비고) — optional notes.
5. **Save.** The system generates a read-only **Code** (an 8-character alphanumeric token). The public short link is `/s/<code>` (e.g. `/s/2zxaLwJ6`), which 302-redirects to the original URL and re-checks it every time. A best-effort **Hit count** tracks how often it is followed.

> **Not in this build (simplified vs. the legacy manual):** the public path is `/s/<code>`, not the legacy `/shortView/<code>`. The one-click "Copy link" clipboard button from the legacy screen (ref 1-43) is not built — read the generated code from the read-only **Code** field.

---

## Trying it on the seeded demo data

Log in at `/admin` as the **Super Administrator** (sees all sites). On a local/dev install the default credentials are email `admin@publicpulse.com.bd` and password `changeme-dev-only!` (the login ID is the email's local part, `admin`). On the deployed system the super-admin email is whatever `SEED_ADMIN_EMAIL` was set to (e.g. `moshiur@ticonsys.com`) with the configured `SEED_ADMIN_PASSWORD`. Other login-capable admins (same password) include `content-editor@admin.demo.example.com` (Content Editor) — useful for confirming that a content admin does **not** see the security-document boards.

The rich demo seed creates one board of every kind on the **demo** site, so you can exercise all of the above immediately:

- **Notice** (integrated) — pinned + regular notices.
- **Press Releases** (extended).
- **Q&A** — answered and open questions. Log in on the **public** site as a member (e.g. `member01@demo.example.com`, password from `SEED_MEMBER_PASSWORD` — dev default `Pulse-Member-2026`) to ask a question, then answer it in Post Management.
- **FAQ** — accordion entries.
- **Gallery** (photo) — posts with representative images.
- **Attachment Board** — downloadable files (this is the pinned `B0000009`).

To try the filters and short URLs:

- **Profanity:** the demo seeds the placeholder words `badword`, `profanitysample`, `forbiddenterm`. Create a post whose body contains one of these — the save is rejected.
- **Member banned words:** the demo seeds `admin` (loginId scope), `password` (password scope), and `forbiddenname` (common). Try signing up on the public site with one of these to see the block.
- **Short URLs:** the demo seeds several, including `Notices board → /notices` and `Open data portal → https://example.com/open-data`. Open Short URL Management to read each one's generated code, then visit `/s/<code>`.

---

## Not in this build (deferred or simplified vs. the legacy manual)

These are called out so you never promise a stakeholder a feature that is not there yet:

- **Skins are stored but not yet rendered differently.** The **Skin** choice (Common vs. This site's skin) is saved, but the legacy JSP path mapping is not part of this build — public rendering does not yet switch templates by skin. (Board type kind is what actually drives behavior.)
- **List/detail column order has no drag-and-drop UI** — the order is stored as a list of field keys (legacy refs 1-31 / 1-32).
- **Post body is the rich-text (Editor) mode only.** The legacy Editor / HTML / TEXT input-mode switch is not built; raw-HTML sanitize-on-render for Top/Bottom/Notice content blocks is a later rendering concern.
- **Excel export is CSV, not XLSX.** The board post export produces a dependency-free CSV using the board's list columns.
- **Short URL:** public path is `/s/<code>` (not legacy `/shortView/<code>`); no one-click copy-to-clipboard button.
- **"Comments", "Prev/next", "New icon window", and list/page counts** are stored board settings consumed by the public site; they are configuration toggles, not admin-side features you operate here.
