# Surveys

The Surveys module lets each site run its own online surveys: you build a survey and its questions in the admin, choose who may answer and when the survey is open, and members or the public respond on the public website. Aggregate results (counts, percentages, bar charts) appear on the public survey page according to the survey's disclosure setting, and administrators can download the full results and every individual response as CSV files. This guide walks through the whole cycle and calls out the one rule that trips up most operators: **once a survey has started, its questions are permanently locked.**

Everything here is per-site (tenant-scoped). You only see and manage the surveys that belong to the site(s) you are assigned to, exactly like Boards and Posts. Access is controlled by the **Survey Management** menu (`content.surveys`): the Super Administrator and anyone with the **Content Editor** role can manage surveys; the **Statistics Analyst** role cannot.

---

## Where the survey screens live

In the admin panel, under the **Content** group in the left sidebar, the survey system uses three collections that share one permission:

- **Surveys** — the survey master record (title, window, audience, disclosure, etc.).
- **Survey Questions** — one row per question, each linked to its parent survey.
- **Survey Responses** — one row per submitted response. Read-only; individual answers are administrators-only.

Questions and responses are separate lists (not embedded inside the survey) so that a question keeps a stable identity across thousands of responses and can be frozen independently once collection begins.

---

## 1. Create a survey

To create a survey:

1. Go to **Content > Surveys** and click **Create New**.
2. Fill in the survey master fields:
   - **Title** _(required)_ — the survey topic shown to respondents and used as the survey's name everywhere.
   - **Description** — a rich-text intro rendered above the questions on the public page.
   - **Department** — the owning department, chosen from your site's Departments list (the "person-in-charge" context).
   - **Contact Phone** — a contact number for enquiries.
   - **Topic** — a short topic/category label (shown next to the title in the public list).
   - **Audience** _(required)_ — **Anyone (public)** or **Members only (login required)** (see [section 4](#4-choose-the-audience-anyone-vs-members-only)).
   - **Result Visibility** _(required)_ — when aggregate results appear on the public site (see [section 6](#6-results-and-disclosure-resultvisibility)).
   - **Anonymous** — when on, responses are not tied to a member identity (see [section 4](#4-choose-the-audience-anyone-vs-members-only)).
   - **Active** — the master on/off switch (defaults to on). An inactive survey is always Closed, regardless of its window.
3. **Leave "Open From" empty for now.** A survey with no start time is a **draft** — this is what keeps its questions editable while you build them. You will set the window in [section 5](#5-open-or-schedule-the-survey), after the questions are ready.
4. Click **Save**.

> **Do not set the open window before you have added all your questions.** As soon as a survey's window opens (or it receives its first response), its questions lock permanently — see [the locking rule](#the-locking-rule-questions-freeze-once-a-survey-starts).

**Fields you cannot edit.** _Status_, _Has Responses_, and _Started At_ are read-only and managed by the system. _Status_ is derived live (never stored) — see [section 5](#5-open-or-schedule-the-survey).

---

## 2. Add questions

Questions live in their own collection and point back to the survey.

To add a question:

1. Go to **Content > Survey Questions** and click **Create New**.
2. Set the fields:
   - **Survey** _(required)_ — pick the parent survey. (This can be set only on creation; a question can never be moved to a different survey afterwards. The site/tenant is filled in automatically from the survey.)
   - **Order** — the ask/display order; lower numbers come first. Give each question a distinct order (1, 2, 3 …); the order values are also what skip logic points at (see [section 3](#3-skip--branch-logic-single-choice-only)).
   - **Text** _(required)_ — the question wording.
   - **Type** _(required)_ — one of the four question types below.
   - **Required** — when on, the respondent must answer (but only if the question is reachable given their skip path — see [section 3](#3-skip--branch-logic-single-choice-only)).
   - **Show verbatim free-text in public results** (`includeInPublicResults`) — off by default. See [section 6](#6-results-and-disclosure-resultvisibility).
3. For choice questions, add the **Options** (see [section 2b](#2b-options-for-choice-questions)).
4. Click **Save**, then repeat for each question.

### 2a. The four question types

| Type (label in admin)          | Respondent sees          | Notes                                   |
| ------------------------------ | ------------------------ | --------------------------------------- |
| **Single choice (radio)**      | Radio buttons, pick one  | The only type that supports skip logic. |
| **Multiple choice (checkbox)** | Checkboxes, pick several |                                         |
| **Short text**                 | One-line text box        | Free text.                              |
| **Long text (textarea)**       | Multi-line text box      | Free text.                              |

### 2b. Options (for choice questions)

The **Options** section appears only when the type is single or multiple choice. Add one row per choice:

- **Label** _(required)_ — what the respondent sees.
- **Value** _(required)_ — the stored value; keep it unique within the question (e.g. `web`, `friend`).
- **Order** — the display order of this option.
- **Is Other** — when on, this option shows an extra free-text box ("Please specify"). If the respondent picks this option, that text becomes required.
- **Next Question Order** — skip logic (single-choice only); see [section 3](#3-skip--branch-logic-single-choice-only).

---

## 3. Skip / branch logic (single-choice only)

Skip logic lets a single-choice answer jump the respondent forward, past questions that don't apply.

To set it up:

1. On a **Single choice** question, open the option that should cause the jump.
2. In **Next Question Order**, enter the **Order** value of the question to jump to.
3. Save.

When a respondent picks that option, the survey continues at the target question and **skips everything in between**. Questions that get skipped are never required for that respondent, even if their Required flag is on — the server only enforces answers on the questions actually reached along the chosen path. If a jump points at an order that doesn't exist, or points backward to a question already answered, the walk simply ends there.

Skip logic is only available on single-choice questions. Multiple-choice, short-text, and long-text questions always fall through to the next question in order.

> **Demo example.** In the seeded _2026 Public Services Satisfaction Survey_, choosing **Rarely** on question 1 jumps straight to question 5, skipping the usage-specific questions. In the smaller _Demo satisfaction survey_, choosing **A friend** on question 1 skips the multiple-choice question 2.

---

## The locking rule: questions freeze once a survey starts

**This is the single most important thing to know.** A survey is considered **started** the moment either of these happens, whichever comes first:

- its **Open From** time arrives (the window opens by the clock), or
- its **first response** is recorded.

Once started, you can **no longer add, edit, or delete any question or option** for that survey. Attempting it is rejected with:

> _"This survey has started (it has responses or its open window has begun); its questions and options can no longer be added, edited, or deleted."_

The lock is **sticky and irreversible**. You cannot un-freeze a survey by pushing **Open From** back into the future, by toggling **Active** off, or by deleting responses — the system latches "started" the first time it sees the window open and never clears it. (In fact, editing **Open From** on an already-open survey re-confirms the latch on that very save.)

**What this means for you:** finish and double-check all questions, options, and skip logic **while the survey is still a draft** (no Open From). Only then set the window. If you discover a mistake after a survey has opened, you cannot fix the questions — you must close that survey and create a replacement.

---

## 4. Choose the audience (Anyone vs Members only)

**Audience** decides who may respond, on the public website:

- **Anyone (public)** — anyone visiting the site can respond, no login needed.
- **Members only (login required)** — only signed-in members of that site may respond. Visitors who aren't logged in see a "This survey is for members only. Sign in to respond." prompt with a link to log in.

**One response per participant** is always enforced:

- Signed-in members are deduped by their member identity (one response each).
- Anonymous/public respondents are deduped by a private, identity-free key derived from their network address. If no trustworthy address is available, dedup is best-effort only.

**Anonymous** (a separate checkbox) controls _identity linkage_, not access. When **Anonymous** is on, the response is stored with **no respondent** attached (even if the person was logged in) — you get the answers but not who gave them. One-response-per-member is still enforced without recording who answered. When **Anonymous** is off, a logged-in member's response is attributed to them.

---

## 5. Open or schedule the survey

A survey's **Status** is never stored — it is calculated live from the window plus the **Active** toggle:

- **Scheduled** — Active, but the current time is before **Open From**.
- **Open** — Active and within the window (or no bounds set).
- **Closed** — after **Open To**, or whenever **Active** is off.

To open or schedule a survey:

1. Confirm all questions are final (remember [the locking rule](#the-locking-rule-questions-freeze-once-a-survey-starts)).
2. Open the survey record and set the window (both use a date **and** time picker, to the minute):
   - **Open From** — when the survey opens.
     - Set it in the **past** to open the survey immediately.
     - Set it in the **future** to schedule it — the survey shows as _Scheduled_ and its questions stay editable **until that time arrives**.
   - **Open To** — when it closes. Leave empty for no closing time.
3. Make sure **Active** is on.
4. Save.

To close a survey early, either set **Open To** to a past time or turn **Active** off (an inactive survey is always Closed).

> The admin Surveys list shows the **Title, Audience, Open From, Open To,** and **Active** columns. There is no live participant-count column here; response totals are visible on the public results view and in the exports.

---

## 6. Results and disclosure (`resultVisibility`)

Aggregate results are shown **on the public survey page**, beneath the form, as a per-question breakdown: total responses, and for each choice question the option counts with percentages and horizontal bars. Percentages are of the respondents who answered _that_ question.

**Result Visibility** decides when the public may see those results:

- **After close only** — results appear only once the survey is Closed.
- **During and after (in-progress results)** — results appear while the survey is Open and after it closes.
- **Admins only** — results never appear on the public site.

A _Scheduled_ (not-yet-open) survey never shows public results.

### Free-text privacy

For privacy, respondents' **verbatim free-text answers** (short/long-text answers, and the "Other" text on a choice question) are **hidden from the public results by default**. Where such answers exist but are withheld, the public page shows: _"Individual free-text answers are not shown publicly."_

To publish a particular question's verbatim answers publicly, turn on **Show verbatim free-text in public results** on that question (before the survey starts, like any question edit). Option counts and percentages are aggregate numbers, not verbatim text, so they always appear. **The admin CSV exports always include the verbatim text regardless of this flag.**

---

## 7. How people respond on the public site

Respondents use the public website, not the admin panel:

1. **`/survey`** lists the site's currently **Open** surveys, each linking to its response page. (Scheduled and closed surveys are not listed here.)
2. **`/survey/<id>`** is the response page. Depending on state, the visitor sees:
   - the **response form** (open, and they haven't answered yet),
   - a **members-only sign-in prompt** (audience is Members only and they're not logged in),
   - _"This survey is not open yet. Please check back later."_ (Scheduled),
   - _"This survey is closed."_ (Closed),
   - _"You have already responded to this survey."_ (they've answered),
   - _"Thank you — your response has been recorded."_ (just submitted).
3. The form shows all questions in order. Required questions are validated on the server according to the respondent's skip path; an "Other" box is required only if the "Other" option is actually chosen. Invalid or duplicate submissions, or free text containing banned words, are rejected with a short message.

> **Note on the form:** every question is rendered on one page (a straightforward linear form). Skip logic is enforced when the response is checked on the server — a respondent who answers only the questions on their path is accepted — rather than by progressively hiding questions as they click. See [Not in this build](#not-in-this-build).

---

## 8. Export results and responses (CSV)

Two access-controlled CSV exports are available per survey. They are fetched by URL while you are logged in to the admin as a user with Survey Management access on that survey's site:

- **Summary (aggregate):**
  `/api/surveys/<id>/export/summary`
  One section per question — for choice questions, each option with its **count** and **percentage**; for text questions, the answered count followed by every free-text answer. Starts with the total response count.

- **Responses (raw):**
  `/api/surveys/<id>/export/responses`
  One row per response, one column per question, plus **Response #, Submitted at,** and **Respondent**.

Notes and gotchas:

- Both exports **always include verbatim free-text**, ignoring the per-question public-results flag — treat these files as sensitive.
- In the **Responses** export, the **Respondent** column shows the member's internal ID number (or **(anonymous)**), not a name or email. Anonymous surveys show **(anonymous)** for every row.
- Files are UTF-8 with a BOM so Excel opens Korean/Unicode text correctly, and leading `= + - @` in a cell are neutralized to prevent spreadsheet formula injection.
- Access is strict: if you request a survey you may not read (wrong site, not permitted, or it doesn't exist), all cases return the same **404** — the export never confirms a survey's existence to someone who shouldn't see it.
- Replace `<id>` with the survey's numeric ID (visible in the survey's admin URL).

Individual responses can also be reviewed one by one in **Content > Survey Responses** (read-only).

---

## Try it on the demo data

The demo site is seeded with four surveys so you can exercise every state without building one:

| Survey                                   | State     | Audience     | Results          | Responses |
| ---------------------------------------- | --------- | ------------ | ---------------- | --------- |
| Demo satisfaction survey                 | Open      | Anyone       | During and after | 2         |
| 2026 Public Services Satisfaction Survey | Open      | Anyone       | During and after | 36        |
| 2025 Website Redesign Feedback           | Closed    | Anyone       | After close      | 31        |
| Upcoming Community Program Interest      | Scheduled | Members only | After close      | 0         |

To explore them:

1. **Sign in to the admin** at `/admin`. Use the Super Administrator (Login ID `admin`; password from `SEED_ADMIN_PASSWORD`, dev default `changeme-dev-only!`), or a **Content Editor** admin such as `content-editor@admin.demo.example.com` (same seeded password) — Content Editors have Survey Management access. (The Statistics Analyst admin `stats-analyst@admin.demo.example.com` does **not** see surveys.)
2. **Browse the surveys** under **Content > Surveys**, and the questions under **Survey Questions**. Notice you cannot edit any of their questions — all four seeded surveys have already started, so they are frozen (exactly the locking rule).
3. **Respond as a visitor:** open the public site's `/survey` page, choose an Open survey, and submit. Try the _Demo satisfaction survey_ skip path by choosing **A friend** on question 1 and watch question 2 get skipped when validated.
4. **Respond to the members-only survey:** the _Upcoming Community Program Interest_ survey is Members only and currently Scheduled — log in on the **public** site as a demo member (e.g. `member01@demo.example.com`, password from `SEED_MEMBER_PASSWORD`, dev default `Pulse-Member-2026`) to see the members flow. (It won't accept responses until it opens.)
5. **See results:** on the _2026 Public Services Satisfaction Survey_ page, results show while it's open (its visibility is _During and after_). The verbatim answers to its free-text "What could we improve?" question appear publicly because that question opts in; other free-text answers are hidden.
6. **Export:** while signed in to the admin, open `/api/surveys/<id>/export/summary` and `/api/surveys/<id>/export/responses` for one of the surveys (use its numeric ID from the admin URL).

To practice **building and editing** questions, create a **new draft** survey (leave Open From empty), add questions freely, then set the window — rather than trying to edit a seeded, already-started one.

---

## Not in this build

The following differ from, or simplify, the legacy Korean manual (refs 2-9 … 2-12):

- **No dedicated admin "results" popup/dashboard.** Legacy had a 결과보기 popup with bar graphs and a paged, name+answer individual-answer list. Here, aggregate results are viewed on the **public** survey page (subject to Result Visibility), individual responses are listed read-only in **Survey Responses**, and the full aggregate/detail is obtained via the CSV exports.
- **CSV, not Excel (.xlsx).** Legacy offered two Excel downloads (results and participation status). This build provides two **CSV** exports — _summary_ (results) and _responses_ (the participation/roster equivalent) — with a UTF-8 BOM for Excel compatibility.
- **No one-click export button in the admin UI.** Exports are reached via the `/api/surveys/<id>/export/...` URLs while logged in, not from a toolbar button on a survey screen.
- **Response form is linear, not progressively branching.** All questions render on one page; skip logic is enforced server-side rather than by hiding/showing questions live as the respondent clicks. Client-side progressive branching is a possible future enhancement.
- **Skip logic is configured directly on the option.** Legacy only allowed assigning skips in the question edit screen after the question was first saved. Here you set **Next Question Order** on any single-choice option at any time before the survey starts.
- **Contact phone is a single free-text field**, not the legacy three-segment (area-code dropdown + two boxes) input.
- **Three disclosure modes** (After close / During and after / Admins only) replace the legacy binary Public / Private.
- **Anonymous responses** and the **per-question public free-text opt-in** (`includeInPublicResults`) are new privacy controls not present in the legacy manual.
- **No inline "add question" counter/button on the survey list** and **no live participant-count column** in the admin Surveys list. Questions are managed in the Survey Questions collection; totals appear in the results view and exports.
