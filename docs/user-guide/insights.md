# Insights (Statistics, Error Logs, Dashboard)

The Insights module is where you see how your sites are being used and whether the system is healthy. It brings together four read-only reporting screens — the **admin Dashboard** (your `/admin` landing page), **Traffic Statistics**, **Download Statistics** and **Satisfaction Statistics** (the three "Site Statistics" dashboards) — plus the system-wide **Error Log** and its **Error Statistics** view. None of these screens let you create or edit records: they only read data that the system captures automatically (page views, file downloads, satisfaction ratings, and unhandled exceptions). Everything is permission-gated, so two operators with different grants see different screens, and every site-level screen only shows the sites you are assigned to.

---

## Before you start: who can see what

Each Insights screen is gated on a specific admin-menu grant. If you do not hold the grant, the screen does not appear in the left navigation and opening its URL shows a "You do not have permission…" message.

| Screen                       | Left-nav label              | Grant (admin-menu name)                                                | Scope              |
| ---------------------------- | --------------------------- | ---------------------------------------------------------------------- | ------------------ |
| Traffic Statistics           | **Traffic Statistics**      | Site Statistics · **Traffic Log** (`statistics.traffic`)               | Per site           |
| Download Statistics          | **Download Statistics**     | Site Statistics · **Download Statistics** (`statistics.downloads`)     | Per site           |
| Satisfaction Statistics      | **Satisfaction Statistics** | Site Statistics · **Satisfaction Ratings** (`statistics.satisfaction`) | Per site           |
| Error Statistics + Error Log | **Error Statistics**        | System · **Error Log** (`system.errorLogs`)                            | Global (all sites) |

Two rules an operator hits in practice:

1. **The Dashboard filters itself to your grants.** A widget (and its underlying data query) only loads if you hold the backing grant. A Statistics Analyst who lacks the Error Log grant will never see the "System Errors" widget or the Error Statistics screen.
2. **Per-site screens need a site assignment.** For Traffic, Download and Satisfaction statistics, a non-super administrator must both hold the grant _and_ be assigned to at least one site. An admin with the grant but no assigned site sees "No sites are assigned to your account." A **Super Administrator sees every site** regardless of assignment.

### Trying it on the seeded demo data

The seed script creates real sample data for all of these screens (a handful of page views rolled up over the last three days, three satisfaction ratings, one seeded download count, and four example error logs).

- **Recommended:** sign in at `/admin` as the **super admin** — Login ID `admin`, password from `SEED_ADMIN_PASSWORD` (dev default `changeme-dev-only!`). The super admin sees all four screens for every site, so all the seeded data is visible immediately.
- The demo **Statistics Analyst** account `stats-analyst@admin.demo.example.com` (name "Felix Nam", same password) holds the three Site-Statistics grants but **not** the Error Log grant. Note that the seeded demo admins are created **without a site assignment**, so signing in as `stats-analyst` will show "No sites are assigned to your account" on the per-site screens until an administrator assigns that user to the demo site (edit the user, add the demo site under their Sites/tenants). This is why the super admin is the reliable way to explore the seeded data.

---

## The Insights Dashboard (`/admin` landing page)

The Dashboard replaces Payload's default "collection cards" home page. It is the first screen you see after signing in, and it aggregates the whole system into a single permission-filtered view.

**Header and site selector.** The header greets you by name. If you are assigned to more than one site, a **Site** dropdown + **Apply** button appears; pick a site to re-scope every per-site widget. (With a single assigned site the selector is hidden.) The active site defaults to your selected-tenant cookie, then the admin site, then your first assigned site.

**Today's metric cards** (each gated independently):

- **Today's visitors** and **Today's page views** — require the Traffic grant.
- **New members today** — requires the Members grant.
- **Posts today** and **Total posts** — require the Content · Posts grant. (Security-classified §3 posts are excluded from these counts.)

**Widgets** (each shown only if you hold its grant, in this order): **Traffic** (a week/month toggle over a mini bar series with page-view and visitor totals, plus a "View all →" link to Traffic Statistics), **Administrator Notices**, **Notification Areas**, **Recent Posts & Q&A** (Recent / Most viewed / Recent questions — secret posts are never listed), **Banners**, **System Errors** (today's count and total logged, linking to Error Statistics), and **Quick Menu** (your profile, quick links to My account / Admins / Access history, the active idle-logout timeout, and a "Log out now" link). The Quick Menu is always shown to every signed-in admin.

> **Gotcha — "Today's" traffic numbers are usually zero until aggregation runs.** The Traffic widget and the Today's-visitors / Today's-page-views cards read the _daily rollup_ for today. Rollups are produced by the aggregation job, which by default processes **yesterday** (see "The D-1 aggregation job" below). So today's live traffic will not appear on the Dashboard until a rollup exists for today. The seeded demo data is spread across the last three days (never "today"), so on a fresh seed the "today" figures read 0 while the Traffic Statistics screen still shows the seeded days.

---

## Traffic Statistics

**Where:** left nav → **Traffic Statistics** (`/admin/traffic-statistics`). **Grant:** Site Statistics · Traffic Log.

This is the "Homepage Access Statistics" dashboard (legacy ref 2-17 / 1-54). It shows aggregated page views and unique visitors for one site, broken down five ways, over a date range you choose. The data is **privacy-safe**: the system stores no IP address, no user-agent string and no full URL — only coarse buckets (device class, OS family, browser family, canonical path).

### To view traffic for a site

1. Open **Traffic Statistics**.
2. In the controls row, set:
   - **Site** — the site to report on (only your assigned sites appear; super admins see all).
   - **From** / **To** — the date range (defaults to the last 30 days).
   - **Granularity** — **Daily** or **Monthly**.
3. Click **Apply**. The headline **Total page views** and **Unique visitors** update, and the tab table below refreshes.
4. Switch between the five tabs to change the breakdown dimension.

### The five tabs

- **Period** — page views and unique visitors per day (or per month). Table with a bar per row.
- **Menu/Page** — views per page path; for `/page/{number}` paths the owning menu name is shown alongside the path.
- **OS** — share by operating-system family (Windows / macOS / iOS / Android / Linux / Other).
- **Browser** — share by browser family (Chrome / Safari / Firefox / Edge / Opera / Samsung Internet / Internet Explorer / Other).
- **Device** — share by device class (Mobile / Desktop).

The OS, Browser and Device tabs show a percentage share beside each row. An empty range shows "No data in this range."

### To export the table

Click **Export CSV (Excel)** above the table. This downloads the **currently selected tab** for the current site and date range as a CSV file (named e.g. `traffic-<site>-period-<from>_<to>.csv`). Open it directly in Excel — the file carries a UTF-8 byte-order mark so Korean and other Unicode text display correctly.

**Key rules and gotchas**

- **Monthly = sum of daily.** Monthly figures (including unique visitors) are the sum of the underlying daily rollups. Because a visitor session is only unique within a day, the monthly "unique visitors" number is an upper bound on true monthly uniques, not a de-duplicated monthly count.
- **Data comes from daily rollups, not live events.** Yesterday's and earlier traffic appears only after the aggregation job has run for those days. Today's traffic will not appear until today is aggregated.
- **Not in this build:** the legacy screen showed an interactive **area/line chart** with a chart-export icon. This build renders the data as a table with lightweight bars only — there is no chart image and no chart-image download. The export is **CSV** (opened by Excel), not a native `.xlsx` file.

---

## The D-1 aggregation job (how traffic rollups are produced)

Raw page views are captured continuously as visitors browse a public site. They are **not** read directly by the statistics screens. Instead a nightly job rolls each day's raw views into one compact "daily rollup" document per site, and the statistics screens read those rollups. This keeps the dashboards fast and lets raw, potentially sensitive events be pruned while the privacy-safe aggregates live on.

**Running the job (host scheduler / command line):**

```
pnpm aggregate:traffic                # aggregate YESTERDAY (UTC) + prune old raw views
pnpm aggregate:traffic 2026-07-20     # aggregate a specific UTC day + prune
pnpm aggregate:traffic 2026-07-20 no-prune   # aggregate only, skip pruning
```

- **D-1 default:** with no date argument the job aggregates **yesterday (UTC)** for every site. Schedule it once daily, shortly after midnight UTC.
- **Idempotent:** re-running the same date recomputes and overwrites that day's rollups from the raw rows — it never double-counts. Even a zero-view day writes an all-zero rollup so "this day has been aggregated" is unambiguous.
- **Retention pruning.** After aggregating, the job deletes raw page views older than the retention window (default **90 days**, overridable via `PAGEVIEW_RETENTION_DAYS`) — but **only for days already rolled up**, so an un-aggregated day is never destroyed. The daily rollups are the permanent record; raw events are ephemeral.

> **Operator note:** if today's Dashboard traffic reads 0 but you expect activity, run `pnpm aggregate:traffic <today's date>` to produce today's rollup. This is safe to run repeatedly.

---

## Download Statistics

**Where:** left nav → **Download Statistics** (`/admin/download-statistics`). **Grant:** Site Statistics · Download Statistics.

This is the "Attachment File Download Statistics" screen (legacy ref 2-18). It reports the **cumulative** download count of every attached file on the selected site, joined to the board and post that owns it.

### To view download statistics

1. Open **Download Statistics**.
2. Choose the **Site** and click **Apply**.
3. Read the headline **Total downloads** and **Files** counts.
4. Review the **Top 20 most-downloaded files** bar chart, then the **All files** detail table (Board / Post / File / Downloads).
5. Click **Export CSV (Excel)** to download the full detail table (Board, Post, File, Description, Downloads) as `downloads-<site>.csv`.

**Key rules and gotchas**

- The count is **cumulative per file** — the running total of downloads for that attachment, not a per-day series.
- Security-classified §3 documents are excluded from the download statistics for content-only operators.
- **Not in this build:** the legacy screen offered a **daily/monthly period search** over downloads. Because the count is stored as a cumulative counter (not a per-download event log), this build has **no date-range/period filter and no time series** — you always see the current running totals for the chosen site. A time-based download report would require a separate download-events log, which is not built.

---

## Satisfaction Statistics

**Where:** left nav → **Satisfaction Statistics** (`/admin/satisfaction-statistics`). **Grant:** Site Statistics · Satisfaction Ratings.

This is the "Satisfaction Management Statistics" screen (legacy ref 2-19). It summarizes the responses to the public 5-point satisfaction widget shown on content pages.

The scale is the fixed 5-point Likert scale, highest first: **5 = Very satisfied (매우만족), 4 = Satisfied (만족), 3 = Neutral (보통), 2 = Dissatisfied (불만족), 1 = Very dissatisfied (매우불만족)**. The "Satisfaction %" is the mean score mapped to 0–100 (mean × 20) — so a lone Neutral (3) rating reads 60%.

### To view satisfaction statistics

1. Open **Satisfaction Statistics**.
2. Set the filters and click **Apply**:
   - **Site** — the site to report on.
   - **Department** — "All departments" or one owning department. This is the parent of the cascade.
   - **Menu** — "All menus" or one page/menu. The menu list is scoped to the chosen department; if you change the department to one that does not include the previously chosen menu, the menu filter resets to "All".
3. Read the headline **Ratings** (count), **Weighted average (1–5)** and **Satisfaction %**.
4. Review the **Score distribution** table (count and percentage for each of the five scores, with its English/Korean label) and the **Average score per menu** bars (average, ratings count, and Satisfaction % per menu).
5. Click **Export CSV (Excel)** to download a summary + distribution + per-menu breakdown as `satisfaction-<site>.csv`.

**Key rules and gotchas**

- Corrupt or out-of-range scores are ignored; the average and distribution are computed only over valid 1–5 ratings.
- Anonymous (non-logged-in) ratings are included; ratings with no owning menu fold into a single "no menu" bucket in the per-menu breakdown.
- **Not in this build:** the legacy screen included a **period (date-range) filter** alongside department and menu. This build filters by **site, department and menu only** — there is no date-range control on the satisfaction screen. The legacy per-level participant matrix (a column per satisfaction level per menu row) is presented here as a distribution table plus per-menu averages rather than the exact legacy grid.

---

## Error Log and Error Statistics

The Error Log is the system's record of captured unhandled exceptions (legacy refs 1-56 to 1-59). It is a **global, system-wide store** — not tied to any one site — because a crash can happen anywhere (a public page, an admin flow, a scheduled job, boot). Everything here is gated on the single **System · Error Log** grant.

### What gets captured, automatically

Errors are recorded automatically by a global capture path; there is nothing to switch on and no way to add an entry by hand. Two things to understand:

- **Only genuine server errors (HTTP status 500 and above) are captured.** Expected 4xx responses — failed logins, permission denials, validation errors, not-found — are deliberately **not** logged here (a failed login is already recorded in Login History), so the error log is not flooded with routine rejections.
- **Messages and stack traces are sanitized before storage.** Passwords, tokens, JWTs, API keys and email addresses are redacted, and the stack is truncated to its top frames. This store is admin-readable and CSV-exportable, so it never keeps a live credential or personal datum. (The seeded demo data includes one sample whose fake token is scrubbed, to demonstrate the redaction.)

Each entry records: when it occurred, the exception class, the sanitized message, the request URL / HTTP method / status code, the acting admin (stored as a denormalized text label, masked in the list view), the client IP, a sanitized stack digest, and a coarse user-agent family.

### The Error Log list

**Where:** left nav → collection **Error Log** (`/admin/collections/errorLogs`), under the **Audit** group; also reachable via **Open full error log** on the Error Statistics screen.

This is the raw, newest-first list of captured exceptions with columns for occurred-at, exception class, status code, URL, actor (masked) and IP.

> **Immutable by design.** The error log is append-only. **No one can create or edit an entry through the admin panel — not even a super administrator.** Deleting is permitted only as retention cleanup by a holder of the Error Log grant. If you need to act on an error, fix the underlying cause; you cannot annotate or amend the record.

### The Error Statistics view

**Where:** left nav → **Error Statistics** (`/admin/error-statistics`). **Grant:** System · Error Log.

1. Open **Error Statistics**.
2. Set **From** / **To** (defaults to the last 30 days) and **Granularity** (**Daily** or **Monthly**), then click **Apply**. The headline **Total errors in range** updates.
3. Switch between the three tabs:
   - **By period** — error counts per day (or per month), chronological.
   - **By type** — error counts per exception class, most frequent first (fix the most common type first for the biggest stability win).
   - **By URL** — error counts per request URL, most frequent first. Errors with no captured URL fold into an `(unknown)` bucket.
4. **Drill down:** click any row (bucket) to list the individual matching errors below the chart — with when, class, status, URL, actor (masked) and message. Click **Clear drill-down** to return.
5. Click **Export CSV (Excel)** to download the **currently selected tab** for the range as `errors-<tab>-<from>_<to>.csv`. Use **Open full error log** to jump to the raw list.

**Key rules and gotchas**

- **Granularity accepts only `daily` or `monthly`.** In the URL / export parameters, any other value is silently treated as `daily`. The By-type and By-URL tabs are not affected by granularity (they are ranked totals for the whole range).
- The Error Statistics view and the Error Log list are **global** — there is no site selector, because errors are not per-site.
- A very wide date range is capped at 5,000 rows scanned per request (error volume is normally low; this only guards a pathological range). Narrow the range if you suspect you are hitting the cap.
- **Not in this build:** the legacy error log offered a keyword search by title/content, user ID or user IP on the raw list. This build provides the period/type/URL statistics with click-to-drill-down instead; there is no dedicated keyword-search box on the Error Statistics screen (use the drill-down, or the collection list's standard filters).

---

## Related: Access History

The left nav may also show **Access History** (`/admin/access-history`), which is the audit trail of _admin/site access events_ (legacy refs 1-55 / 2-20). It is a separate module gated on a privacy grant and is documented in its own guide; it is not part of the statistics screens above.

---

## Quick reference

- **Dashboard:** `/admin` — permission-filtered widgets + today's metric cards + site selector. Today's traffic needs today's rollup.
- **Traffic:** `/admin/traffic-statistics` — 5 tabs (Period / Menu-Page / OS / Browser / Device), Daily/Monthly, per site, CSV export. Reads daily rollups.
- **Downloads:** `/admin/download-statistics` — cumulative per-file counts, Top 20 + detail, per site, CSV export. No period filter.
- **Satisfaction:** `/admin/satisfaction-statistics` — 5-point distribution + weighted average + Satisfaction % + per-menu, Site→Department→Menu filters, CSV export. No period filter.
- **Errors:** `/admin/error-statistics` (stats + drill-down) and `/admin/collections/errorLogs` (immutable list) — global, 500+ only, sanitized, Daily/Monthly, CSV export.
- **Aggregation:** `pnpm aggregate:traffic [YYYY-MM-DD] [no-prune]` — D-1 by default, idempotent, prunes raw views past 90 days.
