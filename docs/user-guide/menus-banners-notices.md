# Menus, Banners, Popups, Notifications & Common Codes

This guide covers the screens you use to build a site's navigation and its "furniture" — the menu tree visitors click through, the banners, popups and notification tiles on the main page, the notices you post to fellow administrators, the extra links in the top and bottom utility bars, the ⓘ help content, and the common codes that supply the drop-down lists used all over the system. All of these live in the U-CMS admin panel at `/admin`. Each screen is described here as it is actually built — where the current build is simpler than the original Korean U-CMS v3.0 manual, a short **Not in this build** note tells you so, so you never go looking for a button that isn't there yet.

---

## Before you start

A few things are true of every screen in this guide. Reading this section first will save you from the most common confusion.

### Where these screens live in the admin menu

In the left-hand admin sidebar the screens are split across two groups:

- **Content** — Menus, Banners, Popups, Notification Areas, Admin Notices, Guide Menus, Help.
- **System** — Code Classifications, Code Groups, Codes.

If you do **not** see one of these entries in your sidebar, your account's role has not been granted that menu. Access is controlled per menu key (for example `content.banners`, `system.codes.groups`), and the check is silent — an ungranted screen simply does not appear. Ask a Super Administrator to add the menu to your role, or sign in with the super-admin account.

### Site-scoped vs. global — this is the biggest gotcha

Some of these tables belong to **one site at a time** (multi-site / "tenant" scoped); others are **shared across every site** (global).

| Screen                                     | Scope                                 |
| ------------------------------------------ | ------------------------------------- |
| Menus                                      | Per site                              |
| Banners                                    | Per site                              |
| Popups                                     | Per site                              |
| Notification Areas                         | Per site                              |
| Admin Notices                              | Per site (the admin back-office site) |
| Guide Menus                                | Per site                              |
| Help                                       | **Global** (shared by all sites)      |
| Code Classifications / Code Groups / Codes | **Global** (shared by all sites)      |

For a per-site screen you must choose the correct **site** when you create a record, using the site selector at the top of the admin panel. Two consequences follow:

1. **You can only create records for a site you are assigned to.** A Super Administrator can work on any site. A non-super operator who is not a member of the chosen site will have the save rejected with a message about site membership — this is deliberate.
2. The demo data ships two sites: the **admin back-office** site (site ID `bos`) and the public **demo** site (site ID `demo`). Banners, popups and notification areas are seeded on the **demo** site; admin notices and guide menus are seeded on the **bos** site. If a list looks empty, check which site is selected.

### Everything you do here is logged

Every create, update and delete on these collections is written to the access-history audit trail (who, which menu, what action, when). This is expected behaviour for a government/enterprise CMS — treat these screens as auditable.

### Trying it on the demo data

Sign in at `/admin`. On a fresh dev seed the accounts are:

- **Super Administrator** — Login ID `admin`, email `admin@publicpulse.com.bd` (deployments use whatever `SEED_ADMIN_EMAIL` is set to, e.g. `moshiur@ticonsys.com`), password from `SEED_ADMIN_PASSWORD` (dev default `changeme-dev-only!`). This account can see and edit every screen in this guide on every site.
- **Content Editor** — `content-editor@admin.demo.example.com` (also `comms-admin@admin.demo.example.com`), same `SEED_ADMIN_PASSWORD`. Use this to see the operator (non-super) experience.

The rest of this guide points out, per screen, the seeded records you can open to see a working example.

---

## Menus — the site menu tree

**Legacy reference:** 1-44 (admin menu management) and 2-13 (user-site menu management). One `menus` table serves both trees; which tree a menu belongs to is decided by the **site** it is attached to.

A menu is one node in a site's navigation. Menus form a tree: a menu with no parent is a top-level (1-depth) item; give it a parent and it becomes a child.

### Fields you fill in

- **Name** (required) — the label shown in the navigation.
- **Menu number** — read-only. The system assigns this automatically per site (the legacy `menuSn` used inside URLs). You cannot set or change it; it is unique within a site.
- **Parent** — the menu this one sits under. Leave empty for a top-level menu. A menu and its parent must belong to the same site.
- **Order** — a number controlling sibling order (lower shows first).
- **Content type** — what the menu points at. One of:
  - **Placeholder (no link)** — a grouping/heading with no destination (legacy 준비중).
  - **Program** — reserved for an internal program link.
  - **Board** — opens a bulletin board; pick the board in the **Board** field that appears.
  - **Web content** — binds a managed content page (see the Web Content guide; the page's `menu` field is the binding).
  - **Link** — an arbitrary link; type the destination in the **Link URL** field that appears.
- **Board** — shown only when content type is Board; choose the board this menu opens.
- **Link URL** — shown only when content type is Link. Must be either a site-relative path (for example `/bos/home` or a `?menuSn=…` reference) **or** an absolute `http(s)://` URL. Other schemes (`javascript:`, `data:`) and protocol-relative values (`//host`) are rejected — this is a security guard, not a formatting nicety.
- **Open in new window** — opens the target in a new window (legacy 링크 방식: 새창).
- **Active** — on by default. An inactive menu is hidden from the public navigation (it stays visible, coloured red, in the admin tree — that colouring is a later UI feature; the field is the data behind it).
- **Data manager (person in charge)** — a user or department, shown on the public site only when that site's "data manager" toggle is on.
- **Exposure condition** — controls who sees the menu by sign-in state: **Always**, **Logged-in users only**, or **Logged-out users only** (legacy 노출조건).

### To add a top-level menu

1. Open **Content → Menus**.
2. Confirm the correct **site** is selected at the top of the panel.
3. Click **Create New**.
4. Enter the **Name**.
5. Leave **Parent** empty.
6. Choose a **Content type** and fill the field it reveals (Board, Link URL, or nothing for Placeholder / Web content).
7. Set **Order**, **Open in new window**, **Active** and **Exposure condition** as needed.
8. **Save.** The **Menu number** is filled in for you.

### To add a child menu

Do the same, but set **Parent** to the menu it belongs under. The parent must be on the same site.

### Gotchas

- The **menu number is automatic and immutable.** Don't expect to type it.
- Ordering is a plain number, not drag-and-drop (see below).
- Setting **Active** off does not delete the menu — it just hides it from navigation.
- **Program** content type stores the type but has no target picker in this build — use **Link** or **Board** for a working destination.

### Try it on the demo data

On the **demo** site the seed creates three menus: **Home** (Web content, bound to a versioned welcome page), **Notice** (Board, bound to the Notice board), and **External Site** (Link → `https://example.com`, opens in a new window). The rich seed adds a full public tree — **About Us**, **Services**, **News & Notices**, **Participation**, **Information**, **Member Zone**, **Sign Up** — with child menus and board bindings, so you can see a realistic multi-level navigation.

### Not in this build

- The legacy drag-and-drop tree editor, expand/collapse-all, and the four-way (top/up/down/bottom) reorder buttons are deferred. You set the tree by choosing **Parent** and typing **Order**.
- The program/board "selection popup" is replaced by a plain relationship drop-down (Board) and a typed path (Link URL).
- The legacy **"apply menu to this site"** cache-refresh button and the **"Call/Open" (호출하기)** shortcut are not present — there is no separate in-memory menu cache to refresh in this build.

---

## Banners

**Legacy reference:** 1-51 / 1-52 (admin banner management); the demo-site instance is 2-1. **Per site.**

A banner is an image link shown in a site's banner strip. Banners share a common set of fields with popups and notification areas (image, title, link, active toggle, exposure window); those shared mechanics are described once under **How exposure windows and links work** below.

### Fields

- **Image** (required) — uploaded to Media; recommended size **196 × 70 px**; jpg/jpeg/png/gif.
- **Representative banner file** — marks this as the site's primary banner (legacy 대표 배너파일).
- **Title** (required).
- **Link** — internal or external (see shared mechanics), with an **Open in new window** toggle (링크 방식: new window vs. current page).
- **Active** — the use/expose toggle.
- **Exposure start / end** — the display window, with hour precision.
- **Display order** — lower shows first.

### To create a banner

1. Open **Content → Banners**, confirm the site.
2. Click **Create New**.
3. Upload the **Image** and enter a **Title**.
4. Choose the link type and fill the internal path or external URL; set **Open in new window** if wanted.
5. Set **Active**, the **Exposure start/end** window, and **Display order**.
6. **Save.**

### Try it on the demo data

The rich seed adds four banners on the **demo** site — _Apply for civil services online_ (the representative banner), _FY2026 budget public hearings_, _Open Data Portal_ (external link, opens in a new window), and _Join the community programs_.

### Not in this build

The inline "use/not-use" toggle button and the four-way order buttons from the legacy list are deferred; use the **Active** checkbox and the **Display order** number on the edit form instead.

---

## Popups

**Legacy reference:** 1-47 / 1-48 (admin popup management). **Per site.**

A popup is an image link that opens in its own small window when the site loads. It shares the image / title / link / active / exposure fields with banners and notification areas, plus popup-window geometry.

### Fields unique to popups

- **Image** (required) — recommended size **160 × 140 px**.
- **Width / Height** — the popup window size in pixels (defaults 400 / 300).
- **Top / Left position** — the popup window's on-screen coordinates in pixels (defaults 100 / 100).
- **Scrollbar use** — whether the popup window shows scrollbars (legacy 스크롤사용여부).
- **Close-for-a-day** — on by default; lets a visitor dismiss the popup for one day (legacy 하루닫기).

Popups have **no "open in new window" toggle** (they already open in their own window) and **no display-order** field (the legacy popup list has no order column).

### To create a popup

1. Open **Content → Popups**, confirm the site.
2. **Create New**, upload the **Image**, enter the **Title**.
3. Choose the link type and fill it in.
4. Set **Active** and the **Exposure start/end** window.
5. Set **Width / Height / Top / Left**, **Scrollbar use** and **Close-for-a-day**.
6. **Save.**

### Try it on the demo data

The rich seed adds two popups on the **demo** site — _Scheduled maintenance notice_ (live now) and _Upcoming community fair_ (scheduled to start about two weeks out), so you can see both a live and a not-yet-live popup.

### Not in this build

The collection stores the geometry and the scrollbar / close-for-a-day flags; the actual rendering of the popup window (honouring those flags and the one-day cookie) is a later public-site rendering task. The inline list toggle is likewise deferred — use **Active** on the form.

---

## Notification Areas

**Legacy reference:** 1-45 / 1-46 (administrator notification area). **Per site.**

Notification-area items are the image tiles shown on a site's main screen (for example a release announcement). Fields are identical to banners minus the "representative" flag.

### Fields

- **Image** (required) — recommended size **490 × 245 px**.
- **Title** (required).
- **Link** — internal or external, with **Open in new window**.
- **Active**, **Exposure start / end** (hour precision), **Display order**.

### To create a notification-area item

1. Open **Content → Notification Areas**, confirm the site.
2. **Create New**, upload the **Image**, enter the **Title**.
3. Set the link, **Active**, the exposure window, and **Display order**.
4. **Save.**

### Try it on the demo data

The rich seed adds two items on the **demo** site — _New online payment methods available_ and _Annual satisfaction survey now open_.

### Not in this build

Four-way order buttons, the inline use toggle, and the internal-link picker popup are deferred to a later UI phase.

---

## How exposure windows and links work (banners, popups, notification areas, guide menus)

These behaviours are shared, so learn them once.

**Exposure window.** Each item has an **Exposure start** and **Exposure end**, both with hour precision. An item is shown only when _now_ is inside the window **and** the item is **Active**. Rules to remember:

- Leaving **start** empty means "no lower bound"; leaving **end** empty means "no upper bound."
- The bounds are **inclusive** — an item is live exactly at its start and end instant.
- Turning **Active** off hides the item immediately, regardless of the window. The item stays in the admin list; it just never renders.

**Internal vs. external links.** The **link type** selector switches which field applies:

- **Internal** — a site-relative path (`/services/online`) or a `?menuSn=…` reference. Off-site URLs, other schemes, and protocol-relative (`//host`) values are rejected. The field may be left empty (an item need not link anywhere).
- **External** — must be an absolute URL starting with `http://` or `https://`. It is required once you choose "external."

**Open in new window** (banners, notification areas, guide menus only) controls whether the click opens a new window or navigates in place.

> Note: the four-way reorder button UI and the internal-link "picker popup" from the legacy screens are deferred. Today you type the internal path directly and set order with the **Display order** number.

---

## Admin Notices

**Legacy reference:** 1-49 / 1-50 (administrator notices). **Per site** — used on the admin back-office (`bos`) site. This is a dedicated notice manager, **not** a bulletin board.

Admin notices are announcements posted to fellow administrators (for example "complete your 2FA enrolment"). Pinned notices sort above general ones.

### Fields

- **Notice type** (required) — **Pinned notice (공지)** or **General (일반)**. Default is General.
- **Pin-period start / end** — shown only when the type is Pinned; the window during which it stays pinned. If you switch a notice back to General, these dates are cleared automatically (server-side), so a general notice can never carry a stale pin window.
- **Title** (required).
- **Department** — a relationship to the department list.
- **Team** — free text (팀명).
- **Author** — free text display name (작성자).
- **Content** — the notice body, edited in the rich-text (Lexical) editor.
- **Attachments** — up to **5** image files, each with an optional description. Only **png, gif, jpg (jpeg)** are accepted; the file type is checked on save, not just in the browser.

### To post an admin notice

1. Open **Content → Admin Notices**, confirm the **bos** (admin) site is selected.
2. **Create New.**
3. Choose **Notice type**. If **Pinned**, set the **Pin-period start/end**.
4. Enter **Title**, and optionally **Department**, **Team**, **Author**.
5. Write the body in the **Content** editor.
6. Add up to five image **Attachments** (png/gif/jpg), with descriptions if useful.
7. **Save.**

### Try it on the demo data

The rich seed posts five admin notices on the **bos** site — two pinned (_Complete your 2FA enrolment_, _New content approval workflow in effect_) and three general (_Quarterly access-log review reminder_, _Style guide updated for press releases_, _Scheduled database maintenance this weekend_).

### Not in this build

- The legacy **HTML** and **TEXT** body input modes collapse onto the single rich-text editor.
- There is **no view-count (조회수)** field on a notice in this build — the legacy list column is not reproduced.
- The pinned-above-general ordering is applied by the rendering layer (a tested ordering rule exists); the admin list itself uses its default sort. Date-range and keyword searching use the admin panel's standard list filters.

---

## Guide Menus (top and bottom utility bars)

**Legacy reference:** 1-53 (top/bottom guide menu management). **Per site.**

Guide menus are the _extra_ links you add to a site's top or bottom utility bar — for example language switches, shortcut links, a blog or accessibility statement. Each record is one link.

### Fields

- **Position** (required) — **Top guide bar (상단)** or **Bottom guide bar (하단)**.
- **Name** (required) — the link label (메뉴명).
- **Link** — internal or external, with **Open in new window** (same rules as above).
- **Display order** — lower shows first.
- **Active** — the use toggle.

### To add a guide menu

1. Open **Content → Guide Menus**, confirm the site.
2. **Create New.**
3. Choose **Position** (top or bottom), enter the **Name**.
4. Set the link, **Display order** and **Active**.
5. **Save.**

### Gotchas

- **A site may have at most five _top_ guide menus.** A save that would create a sixth top menu on that site is rejected with a clear error. Bottom menus are unlimited.
- The built-in defaults — **Login, Sign-up, Sitemap** — are rendered automatically by the front end and are **not** stored here. Anything you add appears _after_ those defaults.

### Try it on the demo data

The minimal seed adds a **Help** (top) and a **Privacy Policy** (bottom) guide menu on the **bos** site. The rich seed adds a fuller set on the **demo** site — _Sitemap_, _Contact_ (top) and _Accessibility_, _Open Data_, _Copyright Policy_ (bottom).

### Not in this build

The legacy screen was a single batch editor where nothing saved until you pressed **Save** for all rows at once; here each row is an ordinary record you save individually. The four-way order buttons and the internal-link picker popup are deferred.

---

## Help (the ⓘ button content)

**Legacy reference:** 1-80 (site help management). **Global** — help is system-level and shared across sites.

Help entries are the content shown by the ⓘ help button on admin screens, organised as a tree. Each entry is bound to a screen either by menu number or by URL pattern.

### Fields

- **Name** (required).
- **Parent** — for building a help tree; empty for a top-level entry.
- **Order** — sibling order.
- **Content** — the help body (rich text).
- **Bind type** — **Service (URL pattern)** or **Menu (menu number)**.
- **URL pattern** — shown when bind type is Service; the screen URL to match, with a `*` wildcard (for example `/bos/board/*`).
- **Menu number** — shown when bind type is Menu; the menu this help attaches to.

### To add a help entry

1. Open **Content → Help**.
2. **Create New**, enter a **Name**.
3. Choose **Bind type** and fill in either the **URL pattern** or the **Menu number**.
4. Write the **Content**, set **Parent**/**Order** if it belongs in a tree.
5. **Save.**

### Gotcha

When both a menu-bound and a service-bound entry could match the same screen, **the menu binding wins**.

### Try it on the demo data

The seed creates a menu-bound entry (_Home screen help_, tied to the Home menu) and a service-bound entry (_Board list help_, pattern `/bos/board/*`). The rich seed adds a small help tree (_Getting started_ → _Using the boards_, _Submitting a civil complaint_; _Managing your member account_; _Greeting page help_).

### Not in this build

The ⓘ help-button rendering that reads these entries and shows them in context is a later public/admin UI task; the entries and the menu-wins matching rule are in place now.

---

## Common Codes

**Legacy reference:** 1-22 to 1-26 (common code management) and the baseline code set in 1-74. **All three levels are global** (shared across every site).

Common codes are the master lists that fill the system's drop-downs. They are organised in **three levels**, top to bottom:

1. **Code Classification** (분류코드) — a namespace for one sub-system. Example: `SYS` = "System codes."
2. **Code Group** (공통코드) — one drop-down list / category inside a classification. Example: `APRV_CD` = "Approval status."
3. **Codes** (상세코드) — the individual options inside a group, arranged as a small hierarchy. Example: `01` = "Approved", `02` = "Pending approval", `03` = "Not approved."

### Level 1 — Code Classifications

Fields: **Code** (English letters only, e.g. `SYS`), **Name**, **Description**, **Active**. One classification per sub-system.

### Level 2 — Code Groups

Fields:

- **Code ID** (required, unique) — **uppercase snake_case starting with a letter**, e.g. `APRV_CD`. Legacy rule (and the on-screen hint): the Code ID must equal the database column name that consumes it. Choose it carefully — see the warning below.
- **Name** — the human label for the group (the "code category name").
- **Classification** (required) — which classification this group belongs to.
- **Description**, **Active**.

### Level 3 — Codes (the detail codes)

Fields:

- **Group** (required) — the code group this option belongs to.
- **Code** (required) — a **two-digits-per-level** value. Top-level codes are two digits (`01`, `02`); a child is its parent's code plus two more digits (`0101`, `010101`). A child's code **must start with its parent's code**.
- **Name** (required) — the option's label.
- **Parent** — leave empty for a top-level (depth 1) code.
- **Depth** — computed automatically and read-only (1 for top level, otherwise parent depth + 1).
- **Order** — sibling order.
- **Description**.
- **Legacy value** — optional; preserves the original U-CMS v3.0 value (e.g. `Y` / `I` / `N`, `AVU001`) for audit parity.
- **Active**.

Within a group, each **Code** value must be unique.

### To create a new drop-down list end to end

1. Open **System → Code Classifications** and make sure a classification exists for your sub-system (e.g. `SYS`). Create one if not.
2. Open **System → Code Groups** → **Create New**. Set the **Code ID** (uppercase snake_case), the **Name**, and pick the **Classification**. Save.
3. Open **System → Codes** → **Create New** for each option: pick the **Group**, type the **Code** (`01`, `02`, …), and the **Name**. For a nested option set the **Parent** and give the child code the parent's value plus two digits. Save each one.

Your new group is now available wherever code-driven drop-downs are offered.

### How codes drive drop-downs across the system

Codes are consumed in two connected places:

- **Board category settings.** A board can bind up to **three** classification code **groups** (분류코드 1/2/3). On the board's Category settings you pick a **Code Group** (for example `CNTNT_CTGRY_CD`, "Content category"). The group must already exist in Code Management — you select it, you don't type it.
- **Post category values.** When someone creates a post on that board, each bound category becomes a drop-down whose options are the **detail codes** of the bound group. The system enforces that the chosen value actually belongs to that board's bound group, and — if the board marks a category as required — that it is filled in.

So the chain is: **Classification → Code Group → Codes**, and a board points at a **Group** while a post stores a specific **Code**. To add a new option to a board's category drop-down, add a new **Code** to the bound group; to offer a brand-new category, create a new **Code Group** and bind it on the board.

### Warning: Code ID is effectively permanent

A code group's **Code ID** mirrors a database column name and is referenced elsewhere once used. Treat it as append-only: **create new groups rather than renaming an existing Code ID** after it has been bound to a board.

### Try it on the demo data

The seed creates the `SYS` classification with three groups: **Approval status** (`APRV_CD`), **Accessibility validation usage** (`ACS_VLD_USE_CD`) and **Board field item types** (`BBS_ITEM_TYPE_CD`), each with its detail codes. The rich seed adds a second classification `SVC` ("Service codes") with **Content category** (`CNTNT_CTGRY_CD`, including a nested _Policy → National / Local policy_ branch) and **Department type** (`DEPT_TYPE_CD`) — a good example of a multi-level code group and of a group that a board category can bind to.

### Not in this build

- The legacy **tree-view popup editor** for detail codes (expand/collapse-all, up/down reorder arrows, "register top-level code" / "register child code" buttons) is deferred. You manage codes in the standard list view, choosing **Parent** and typing **Order**.
- The **code-search popup** on the board category tab is replaced by a plain relationship drop-down; new codes are still created in Code Management first and then selected.

---

## Quick reference: which screen for which job

| I want to…                               | Go to                                            | Scope          |
| ---------------------------------------- | ------------------------------------------------ | -------------- |
| Change what's in a site's navigation     | Content → Menus                                  | Per site       |
| Put an image link on the main page strip | Content → Banners                                | Per site       |
| Show a pop-up window on a site           | Content → Popups                                 | Per site       |
| Add a main-page notification tile        | Content → Notification Areas                     | Per site       |
| Post an announcement to other admins     | Content → Admin Notices                          | Per site (bos) |
| Add a link to the top/bottom utility bar | Content → Guide Menus                            | Per site       |
| Edit the ⓘ help content                  | Content → Help                                   | Global         |
| Add or change a drop-down's options      | System → Codes (+ Code Groups / Classifications) | Global         |
