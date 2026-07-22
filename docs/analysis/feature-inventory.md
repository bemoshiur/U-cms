# U-CMS v3.0 — Complete Feature Inventory

> Reverse-engineered functional specification, extracted page-by-page from
> `U-CMS v3.0 사용자 매뉴얼(사용자취급설명서)_20250714.pdf` (122 pages, Korean, by U&P/유앤피플, dated 2025-05-23).
> Extraction method: manual read of PDF pages 1–20 + 6 parallel AI deep-read passes over pages 21–122,
> each independently re-verified by an adversarial completeness check. Verification notes are appended
> per extraction block — treat rules marked as "inferred" there with caution.
>
> Manual structure: **§1 Integrated Management System** (printed pp. 2–84) ·
> **§2 Demo Site Management** (printed pp. 85–109) · **§3 Privacy Protection System** (printed pp. 110–121).
> PDF page N = printed page N−1.

---

## Part 0 — Features on PDF pages 3–19 (read directly)

### 1-1) 관리자 로그인 — Admin Login (PDF p.4)
Menu path: 홈 > 관리자 로그인. Login screen with configurable logo (from Site Info Management), ID/PW login, "save ID" checkbox, Admin Account Request button and ID/PW Find button (both shown/hidden based on the site's "admin member signup" setting), failure alert ("ID or password does not match, or the account is locked"), configurable copyright footer.
- Rules: logo, copyright and button visibility are all driven by Site Info Management settings; a lockout state exists ("계정이 잠긴 상태").

### 1-2) 관리자 계정 신청 — Admin Account Request (PDF p.5)
Self-service admin account application: ID with duplicate check; password + confirm with policy hint (min 10 chars combining 2 of 3 character classes, OR min 8 chars combining 3+ classes; avoid sequential/guessable values; validity period with change at least once per period); name; internal extension; mobile phone (country/area code linked to Code Management); department picked from the department tree popup (with reset); email with duplicate check (admin emails must be unique); profile photo (jpg/jpeg/png/gif, max 1 file, display size 64×64). Submitting puts the account in 승인대기 (approval-wait); login is possible only after approval.

### 1-3) 관리자 ID/PW 찾기 — Admin ID/PW Recovery (PDF p.6)
Two-tab popup. Find ID: name + email → the ID is emailed for approved accounts. Find PW: ID + email → a new password is issued and emailed for approved accounts.

### 1-4) 2차 인증 — Two-Factor Authentication (PDF p.7)
Enabled per site via Site Info Management ("2차 인증 사용"). After ID/PW login, an OTP entry screen requires a 6-digit Google OTP code. Includes a guide-page button and a link to the QR page for users who have not scanned yet. Requirements listed: own smartphone; phone number must match the one registered on the admin account; login impossible without completing 2FA.

### 1-5) Google OTP 인증 절차 안내 — Google OTP Guide (PDF p.8)
Static guide popup: install Google Authenticator (first time only), add account by QR scan or manual key entry.

### 1-6) Google OTP QR코드 스캔 — Google OTP QR Scan (PDF p.9)
QR code page showing code name (U-CMS v3.0), secret key, key type (time-based). For security the QR is offered only at first login; afterwards it is not shown again — re-issuance must be requested from an administrator (delivered by email).

### 1-7) 관리자 대시보드 — Admin Dashboard, top (PDF p.10)
Top guide area (login info, edit-my-info, logout are fixed; other menus managed via top guide menu management). 1-depth menu bar (통합 관리 시스템 / UCMS 사이트 관리 / 개인정보보호시스템) loaded from admin menu management. Sitemap button. Homepage access statistics widget for the user site: weekly/monthly, whole period, by OS, by browser, PC vs mobile — chart or table toggle; data aggregated as of D-1. Today's stats (visitors, page views), member signups (today/total), board posts (today/total). Admin notices, admin notification area, user notices widgets. Quick-menu area with logged-in profile (from admin account management) and idle-logout countdown — auto-logout after inactivity (default 30 min) with an extend button that resets the timer.

### 1-8) 관리자 대시보드(하단) — Admin Dashboard, bottom (PDF p.11)
Recent Q&A posts (only if the viewer has access rights to that Q&A), recent board posts (permission-filtered), most-viewed posts weekly/monthly (permission-filtered), banner list (from admin banner management), bottom guide menu (only menus registered in bottom guide menu management), footer copyright (from Site Info Management).

### 1-9) 관리자 레이아웃 — Admin Layout (PDF p.12)
Canonical admin chrome: logo area; top guide menu (defaults: login info, edit-my-info, logout + configured items; varies by the operator's permissions); 1-depth menu area (typically split into Integrated Management System, per-site management, Privacy Protection System); whole-menu/per-permission menu overlay button; 2-depth GNB (permission-filtered); 3-depth+ LNB; breadcrumb navigation; content area; quick-menu area (profile + auto-logout); bottom guide menu area; copyright.

### 1-10) 관리자 권한 관리 — Admin Role Management, list (PDF p.13)
Menu: 통합 관리 시스템 > 관리 시스템 설정 > 관리자관리 > 관리자 권한관리. List of roles: 권한 ID (must start with ROLE_, uppercase letters/digits only), 권한명 (any characters), registration date, whether menu permissions are configured (Y/N), buttons per row: 사용자 조회 (list users in role), 메뉴권한설정 (set menu permissions). Search by 권한ID/권한명; help (ⓘ) and print buttons in header (common to all screens; print outputs content only, without layout). Pagination 10 per page.

### 1-11) 관리자 권한 관리(등록/수정) — Role Create/Edit (PDF p.14)
Fields: 권한 ID (uppercase alnum, must start with "ROLE_"), 권한 명, 설명 (all required). Edit mode offers 수정/삭제/취소.

### 1-12) 관리자 권한 관리(권한 사용자 조회) — Role Users (PDF p.15)
Shows role code + name, table of users in the role (name, department, status, registrant, registration date) with checkbox multi-select and 선택 제거 (remove selected from role).

### 1-13) 관리자 권한 관리(메뉴 권한 설정) — Role Menu Permissions (PDF p.16)
Checkbox tree over the full admin menu hierarchy (each node shows menu name + menu number). Open-all/close-all buttons. Users holding the role can access only checked menus. 권한적용 saves.

### 1-14) 관리자 부서 관리 — Department Management (PDF p.17)
Department tree (Root > headquarters > teams…): open/close all, select node to edit; add top-level department; add child department under the selected node; fields: 부서명 (required), 부서업무 (memo), phone, fax, 사용여부 (use/unuse — temporarily hides the department); update and delete actions.

### 1-15) 관리자 계정 관리 — Admin Account Management, list (PDF p.18)
Search by registration date range + condition (ID etc.). Columns: number, ID, name, role(s) (e.g. SUPER관리자, ROLE_AA, 개인정보보호 처리자 권한), status (승인대기 / 정상 / 장기 미로그인), registration date. 등록 button for direct admin creation.

### 1-16) 관리자 계정 관리(수정/등록) — Admin Account Edit (PDF p.19)
Fields: ID (duplicate check on create), password change (checkbox-gated), name, department (picker popup), mobile, extension, email (duplicate check) + buttons "2차 인증 디바이스 계정 갱신" (reset 2FA device) and "2차 인증 코드 초기화" (reset OTP code), 업무내용 (duties, shown in org chart), 권한 (add multiple roles from dropdown; menus of all held roles are exposed at login; a dedicated 개인정보보호 처리자 권한 badge exists; note — ROLE_ADMIN(SUPER) permission cannot be copied/granted unless held), 상태 (승인대기→정상 enables login; after long inactivity, status auto-changes to 장기 미로그인 which blocks login), profile photo (max 1 file, jpg/jpeg/png/gif, 64×64; rotate left/right, move up/down, download, copy link, delete controls). 수정/삭제 actions. Screens containing personal info render a background watermark with the personal-info access-record management number and view timestamp.

### 1-17) 사이트 정보 관리 — Site Info Management, list (PDF p.20)
Multi-site registry. Columns: 사이트ID (e.g. bos = admin back-office, ucms = user demo site), 사이트명, URL, 만족도사용 (satisfaction on/off), 자료관리자사용 (data-manager on/off), 상단가이드메뉴 설정 button, 하단가이드메뉴 설정 button, registration date, 허용IP관리 (IP allowlist per admin site; a separate 관리자 IP 접근제어 menu also exists). 등록 button adds a site.

---

## Parts 1–3 — Features on PDF pages 21–122 (AI deep-read, adversarially verified)



## PDF pages 21-38

_Section context: Section 1: 통합관리시스템 (Integrated Management System) — subsection 관리 시스템 설정 (Management System Settings), covering 사이트 정보 관리 (Site Information Management incl. footer and Admin IP Access Control), 코드관리 (Code Management: common codes, detail codes, classification codes), and 게시판 관리 (Board Management: Integrated Board and Custom Board)._

### 1-18) 사이트 정보 관리(등록/수정) — Site Information Management (Register/Edit)

**Pages:** PDF page 21 (printed page 20) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 사이트 정보 관리 (on-screen breadcrumb: 통합 관리 시스템 > 관리 시스템 설정 > 사이트 정보 관리 > 사이트 정보 관리)

Register/edit screen for a site's basic homepage information (홈페이지 기본정보). Manages site name, site URL, feature toggles (page satisfaction survey, data manager designation, web accessibility validation), admin-side security options (2-factor authentication, admin account application), and the homepage logo upload with image manipulation controls. Some toggles apply only to user-facing sites while others apply only to the admin page.

**Screen elements (numbered callouts):**
- Callout 1: Register the homepage (site) name.
- Callout 2: Homepage URL input area; the full URL must be entered starting from 'http'. (On-screen hint: 'ⓘ http:// 부터 입력하셔야 합니다' — you must type it beginning with http://.)
- Callout 3: Homepage satisfaction usage toggle (when set to 사용/Use, a page-satisfaction widget is displayed on the user page; it is ignored for the admin). Items [3][4][5] can only be entered for user pages; for the admin page, as shown in the boxed panel (labeled [11] in the manual text, i.e. callout 6's box), 2-factor authentication and admin account application settings are available instead.
- Callout 4: Sets whether the data manager (자료관리자) designation feature is used. Configurable only for user sites.
- Callout 5: Web accessibility validation check (웹접근성 유효성 검사) usage setting; configurable only for user sites. (On-screen note next to the DB저장 dropdown: '※ 웹접근성 유효성 로컬 및 개발 환경에서만 동작합니다' — web accessibility validation operates only in local and development environments.)
- Callout 6: This panel is activated when configuring the admin page as well; here you can set 2차인증 여부 (2-factor authentication use) and 계정 신청 사용 여부 (admin account application use). When 2FA is activated, after login the user must enter a Google OTP verification code to complete login. When admin account application is allowed, an admin account application can be submitted from the login page.
- Callout 7: Register and manage the homepage logo.

**Fields / columns / controls:**
- *홈페이지명 (Homepage name) — text input, e.g. 'UCMS 데모사이트'
- 홈페이지 URL (Homepage URL) — text input, e.g. 'http://user.unpi.co.kr'
- *만족도 (Satisfaction survey) — radio: 사용(Use) / 미사용(Not use)
- *자료관리자 (Data manager) — radio: 사용 / 미사용
- *웹접근성 유효성 사용여부 (Web accessibility validation use) — dropdown, value shown: DB저장 (Save to DB)
- *2차인증 여부 (2-factor authentication) — radio: 사용 / 미사용 (admin page only)
- *계정 신청 사용 여부 (Account application use) — radio: 사용 / 미사용 (admin page only)
- 홈페이지 로고 변경 (Homepage logo change) — file upload zone showing current file 'logo-3.0.png 1.07 KB' with checkbox selection; image toolbar buttons: 90°회전 (rotate 90° left), 90°회전 (rotate 90° right), 위로 (move up), 아래로 (move down), 다운로드 (download), 링크복사 (copy link), 삭제 (delete)
- Upload buttons: 파일선택 (Select file), 선택 파일 삭제 (Delete selected file), 전체선택 (Select all); counter '1 File / 1.07 KB byte'

**Business rules:**
- Homepage URL must be entered in full starting with http:// (validation hint shown under the field).
- Satisfaction, Data manager, and Web accessibility validation settings (callouts 3/4/5) can be entered only for user sites; the admin page instead exposes 2FA and admin account application toggles (callout 6).
- Web accessibility validation operates only in local and development environments.
- When 2FA is enabled, login requires entering a Google OTP verification code after the normal login step.
- When admin account application is enabled, applicants can request an admin account from the login page.
- Logo upload: attach via '파일선택' button or drag-and-drop into the drop zone.
- Allowed logo file extensions: jpg, jpeg, png, gif.
- Maximum 1 attachment file for the logo ('첨부파일 최대 1개 까지 첨부 가능합니다').

### 1-19) 사이트 정보 관리(등록/수정 하단) — Site Information Management (Register/Edit, Bottom Section: Footer)

**Pages:** PDF page 22 (printed page 21) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 사이트 정보 관리

Lower portion of the Site Information register/edit screen: Footer 영역 관리 (Footer Area Management). Manages the organization name, address (with postal-code lookup), phone, fax, and copyright text that appear in the site footer, with a per-item show/hide toggle.

**Screen elements (numbered callouts):**
- Callout 1: Manages the site footer area.
- Callout 2: For each item, when checked 사용중 (in use) it is displayed on the site; when checked 미사용중 (not in use) it is not displayed.

**Fields / columns / controls:**
- 기관명 (Organization name) — text, e.g. '(주)유앤피플'; radio 사용중/미사용중
- 주소 (Address) — three inputs: postal code (e.g. '08376') with '주소 찾기' (Find Address) lookup button; address line ('서울 구로구 디지털로31길 38-9 (구로동)'); detail address ('803호 (구로동, 에이스테크노타워 1차)'); each of the three rows has its own 사용중/미사용중 radio
- 전화번호 (Phone number) — e.g. '02-855-7471'; radio 사용중/미사용중
- 팩스번호 (Fax number) — e.g. '070-8650-0110'; radio 사용중/미사용중 (미사용중 selected in example)
- Copyright — text, e.g. 'COPYRIGHT (주)유앤피플. ALL RIGHT RESERVED.'; radio 사용중/미사용중
- Buttons: 수정 (Update, green), 삭제 (Delete, red), 취소 (Cancel, gray)

**Business rules:**
- Each footer item is independently toggleable: 사용중 = rendered in footer, 미사용중 = hidden.
- Address entry supports a postal-code/address search popup via the 주소 찾기 button.

### 1-20) 관리자 IP 접근제어 — Administrator IP Access Control (List)

**Pages:** PDF page 23 (printed page 22) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 사이트 정보 관리 > 관리자 IP 접근 제어

List screen of registered admin-access IP allowlist entries. Supports searching by application period, usage status, and applicant/affiliation/IP; shows each entry's site ID, applicant, affiliation, requested IP (supports wildcards and IPv6), validity period, access classification (allow), and an inline usage toggle. A Register button navigates to the registration form.

**Screen elements (numbered callouts):**
- Callout 1: Provides search by usage period (date range), usage status, and applicant/affiliation/IP.
- Callout 2: Applicant name and affiliation are displayed. Clicking the applicant name navigates to the edit page.
- Callout 3: Shows the requested IP address.
- Callout 4: Shows the application (validity) period.
- Callout 5: Shows the access classification name.
- Callout 6: Usage status is exposed as a toggle; clicking it changes the status immediately (no separate save step).
- Callout 7: Clicking the 등록 (Register) button navigates to the registration page.

**Fields / columns / controls:**
- Search bar: 사용여부 date range (연도-월-일 ~ 연도-월-일), 사용여부 dropdown (value: 사용), 구분 dropdown (value: 선택), free-text input, 검색 (Search) button, 초기화 (Reset) button
- Table columns: 사이트ID (Site ID), 신청자성명 (Applicant name, link), 소속명 (Affiliation), 신청IP주소 (Requested IP address), 적용일시 (Application period), 접속구분코드 (Access classification code), 사용여부 (Usage status toggle button labeled 사용중)
- Sample data: site ID 'bos'; applicants 관리자/TTA; IPs include 127.0.0.1, 0:0:0:0:0:0:0:1 (IPv6 loopback), 125.141.56.* and 218.146.11.* (wildcard class), 112.220.85.26, 192.168.0.1, 210.96.71.213/214/159/162; periods such as 2025-05-28 ~ 2099-12-31, 2025-06-30 ~ 2025-08-31, 2025-06-30 ~ 2025-07-18, 2025-07-08 ~ 2025-07-18; access code 허용 (Allow) on all rows
- 등록 (Register) button below the table

**Business rules:**
- Usage status can be flipped directly from the list via a toggle-style button — immediate change on click.
- Wildcard IPs (e.g. 125.141.56.*) and IPv6 addresses (0:0:0:0:0:0:0:1) are valid entries.
- Each entry carries a validity window (적용일시); see 1-21 for auto-blocking after expiry.

### 1-21) 관리자 IP 접근제어(등록/수정/삭제) — Administrator IP Access Control (Register/Edit/Delete)

**Pages:** PDF page 24 (printed page 23) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 사이트 정보 관리 > 관리자 IP 접근 제어

Form (사이트 접속IP 등록 / Site Access IP Registration) for creating, editing, and deleting an admin IP allowlist entry. Captures applicant identity (name, affiliation, phone), operational memo, the IP address (with wildcard class semantics), access classification code, validity period, and usage status. Entries auto-block after the validity period ends.

**Screen elements (numbered callouts):**
- Callout 1: Enter the applicant's name.
- Callout 2: Enter the applicant's affiliation name.
- Callout 3: Enter the applicant's phone number.
- Callout 4: Enter and manage a memo used during operations.
- Callout 5: Enter the applicant IP. Putting an asterisk (*) on a specific class means the entire class. ex) 192.168.0.* -> means 192.168.0.1~192.168.0.255. ex) * -> means ALL IPs. Warning: if operated with only '*', access is possible from every IP, so use caution.
- Callout 6: The access classification code (접속구분코드) technically has 허용 (Allow) / 차단 (Block) values, but for administrators the model is 'block all IPs and explicitly allow', so in IP access control only the Allow code is used.
- Callout 7: Enter the application (validity) period. When the period passes, access is automatically blocked.
- Callout 8: Update / Register / Delete buttons.

**Fields / columns / controls:**
- *신청자 성명 (Applicant name) — text, e.g. '관리자'
- *신청자 소속명 (Applicant affiliation) — text, e.g. '관리자'
- *신청자 전화번호 (Applicant phone) — 3-part input: prefix dropdown (010) - 1111 - 2222
- 메모내용 (Memo) — textarea, e.g. 'test33' (not marked required)
- *신청IP주소 (Requested IP address) — text, e.g. '127.0.0.1'
- *접속구분코드 (Access classification code) — dropdown, value 허용 (Allow)
- *적용일시 (Application period) — start/end date pickers, e.g. 2025-05-28 ~ 2099-12-31
- *사용여부 (Usage) — radio: 사용 / 미사용
- Buttons: 수정 (Update, green), 삭제 (Delete, red), 취소 (Cancel, gray)

**Business rules:**
- IP wildcard semantics: '192.168.0.*' covers 192.168.0.1–192.168.0.255; a bare '*' means every IP (explicitly warned against because it opens admin access to all IPs).
- Admin access control follows a default-deny model: all IPs are blocked and only allowlisted IPs are permitted, therefore only the 허용 (Allow) classification code is used in practice even though 차단 (Block) exists in the code table.
- After the 적용일시 validity period ends, the IP is automatically blocked (no manual deactivation needed).
- Required fields (marked *): applicant name, affiliation, phone, IP address, access classification code, application period, usage status. Memo is optional.

### 1-22) 공통 코드관리 — Common Code Management (List)

**Pages:** PDF page 25 (printed page 24) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 코드관리 > 공통 코드관리

List screen for common code groups (code categories). Each row is a code group identified by a Code ID that must match its DB column name, grouped by classification (system). A per-row 관리 (Manage) button opens the detail-code management popup (see 1-24).

**Screen elements (numbered callouts):**
- Callout 1: Performs code search using classification and search conditions.
- Callout 2: Codes are grouped per system by classification name (분류명).
- Callout 3: The Code ID is used identically to (matching) the DB column name in which it is used.
- Callout 4: A popup window is invoked (via the 관리 button) to manage the detail codes of the group.

**Fields / columns / controls:**
- Search bar: 구분 dropdown (분류/classification), field dropdown (코드ID), free-text input, 검색 (Search) button
- Table columns: 번호 (No.), 분류명 (Classification name, link), 코드ID (Code ID, link), 코드카테고리명 (Code category name), 사용여부 (Use status), 코드관리 (Code management — 관리 button per row)
- Sample rows (classification 'UCMS공통코드', all 사용): CNTN_SE_CD=접속구분코드 (access classification code), STD_SRC_SE_CD=표준출처구분코드 (standard source classification code), DB_STD_CHCK_CLSF_CD=데이터베이스표준점검분류코드 (DB standard inspection classification code), PRP_SE_CD=제안구분코드 (proposal classification code), WEB_ACS_INSP_ARTCL_CD=웹접근성검사항목코드 (web accessibility inspection item code), APRV_CD=승인코드 (approval code), ACS_VLD_USE_CD=웹접근성검사사용코드 (web accessibility check usage code), RVSN_CYCL_CD=개정차수코드 (revision cycle code), COLCT_TRGET_CD=개인정보(수집)대상코드 (personal-info collection target code), BBS_ITEM_TYPE_CD=게시판항목타입코드 (board item type code)
- Pagination: 1 2 3 4; 등록 (Register) button

**Business rules:**
- Code IDs are named identically to the database column names that consume them (naming convention rule).
- Code groups are partitioned per system via the classification name.
- Detail codes under a group are managed exclusively through the popup opened by the 관리 button.

### 1-23) 공통 코드관리(등록/수정) — Common Code Management (Register/Edit)

**Pages:** PDF page 26 (printed page 25) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 코드관리 > 공통 코드관리

Register/edit form for a common code group: choose a classification, enter the Code ID (must equal the DB column name), the code category name, a description, and the use status.

**Screen elements (numbered callouts):**
- Callout 1: Classification name selection; codes are classified per system.
- Callout 2: The Code ID is used identically to the DB column name in which it is used. (On-screen hint: 'ⓘ 코드ID는 DB컬럼과 동일한 명칭을 사용해 주세요!' — please use the same name as the DB column for the Code ID.)
- Callout 3: Enter the code category name.
- Callout 4: Enter the Code ID description.
- Callout 5: Select whether the code is used.

**Fields / columns / controls:**
- *분류코드명 (Classification code name) — dropdown, e.g. 'UCMS공통코드'
- *코드ID (Code ID) — text, e.g. 'ACS_VLD_USE_CD'
- *코드카테고리명 (Code category name) — text, e.g. '웹접근성검사사용코드'
- *코드ID설명 (Code ID description) — textarea, e.g. '웹접근성검사사용코드'
- *사용여부 (Use status) — dropdown: 사용 / (미사용)
- Buttons: 수정 (Update), 목록 (List)

**Business rules:**
- Code ID must use exactly the same name as the corresponding DB column (enforced by convention, prompted on-screen).
- All five fields are marked required (*).

### 1-24) 공통 코드관리(공통 상세코드 관리 팝업) — Common Code Management (Common Detail Code Management Popup)

**Pages:** PDF page 27 (printed page 26) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 코드관리 > 공통 코드관리

Popup (공통상세코드 관리) for managing the hierarchical detail codes inside a code group. Left pane shows the code tree with expand/collapse-all and reordering arrows; right pane shows the selected code's detail (parent code, code, name, depth level, description, use status). Supports adding top-level (1-depth) codes, adding child codes under the selected node, updating, and deleting.

**Screen elements (numbered callouts):**
- Callout 1: Used to open or close the entire code tree at once (모두열기 expand-all / 모두닫기 collapse-all).
- Callout 2: Shows the codes in tree form.
- Callout 3: Used to change the order of the codes (up/down arrow buttons).
- Callout 4: Enter the code information (detail panel).
- Callout 5: Button used when entering a top-level code (최상위(1depth)코드등록).
- Callout 6: Button used to register a child code under the selected code (하위코드등록).
- Callout 7: Provides update/delete functions.

**Fields / columns / controls:**
- Left pane 코드목록 (Code list): buttons 모두열기 (Expand all), 모두닫기 (Collapse all); reorder arrows (top/up/down/bottom); tree example: UCMS공통코드(Root) > black(01) > 테스트01(0101) > 테스트01_1(010101) > [테스트01_1_1(01010101), 테스트01_1_2(01010102)]; 테스트01_2(010102); 0102(0102); white(02); red(03); yellow(04)
- Right pane 코드상세정보 (Code detail info): *상위코드 (Parent code, e.g. 010101), *코드 (Code, e.g. 01010101), *코드명 (Code name, e.g. 테스트01_1_1), Depth level (read-only, e.g. 4), 코드설명 (Code description, textarea), *사용여부 (radio: 사용/미사용)
- Buttons: + 최상위(1depth)코드등록 (Register top-level 1-depth code), + 하위코드등록 (Register child code), 수정 (Update), 삭제 (Delete)

**Business rules:**
- Detail codes form a hierarchy; code values are concatenated 2-digit segments per depth (01 -> 0101 -> 010101 -> 01010101), with Depth level tracked (example shows depth 4).
- New codes are added either as top-level (1-depth) or as children of the currently selected tree node.
- Sibling ordering is adjustable via arrow buttons (and reflected in display order).

### 1-25) 공통 분류 코드관리 — Common Classification Code Management (List)

**Pages:** PDF page 28 (printed page 27) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 코드관리 > 공통 분류 코드관리

List of top-level classification codes (the 분류/classification groupings used by Common Code Management). Each detailed sub-system defines its own classification code. Supports search and registration.

**Screen elements (numbered callouts):**
- Callout 1: Provides classification-code search function.
- Callout 2: Provides the classification code and classification code name. A classification code is established and used per detailed (sub-)system.
- Callout 3: Registration of a classification code is possible via the 등록 (Register) button.

**Fields / columns / controls:**
- Search bar: 구분 dropdown (분류코드), free-text input, 검색 (Search) button
- Table columns: 순번 (Seq. no.), 분류코드 (Classification code, link), 분류코드명 (Classification code name, link), 사용여부 (Use status)
- Sample rows: 2 / TTA / TEST / 사용; 1 / CMS / UCMS공통코드 / 사용
- Pagination: 1; 등록 (Register) button

**Business rules:**
- One classification code is defined per detailed sub-system (per-system namespace for common codes).

### 1-26) 공통 분류 코드관리(등록/수정) — Common Classification Code Management (Register/Edit)

**Pages:** PDF page 29 (printed page 28) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 코드관리 > 공통 분류 코드관리

Register/edit form for a classification code: code (English letters), name, description, and use status.

**Screen elements (numbered callouts):**
- Callout 1: Register the classification code using English alphabet letters.
- Callout 2: Register and manage the classification code name and description.
- Callout 3: Select whether it is used.

**Fields / columns / controls:**
- *분류코드 (Classification code) — text, e.g. 'CMS'
- *분류코드명 (Classification code name) — text, e.g. 'UCMS공통코드'
- *분류코드설명 (Classification code description) — textarea, e.g. 'UCMS공통코드'
- *사용여부 (Use status) — dropdown: 사용
- Buttons: 수정 (Update), 목록 (List)

**Business rules:**
- Classification code value must be composed of English alphabet letters.
- All fields marked required (*).

### 1-27) 통합 게시판 관리 — Integrated Board Management (List)

**Pages:** PDF page 30 (printed page 29) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 통합 게시판 관리

List of integrated (통합) bulletin boards. Each board is identified by an auto-assigned BBS ID and always uses board type 통합게시판(PG0001) and the common (공통) skin. The list shows attachment usage, up to three assigned classification codes, list count, page count, and creation date. Register button creates a new board.

**Screen elements (numbered callouts):**
- Callout 1: Provides search function (by board name).
- Callout 2: The board ID (BBS ID) is used as the board discriminator.
- Callout 3: Shows the board name.
- Callout 4: Shows the board type — only the Integrated Board (통합게시판, PG0001) type is used here.
- Callout 5: Shows the skin type — only the common (공통) type is used.
- Callout 6: Shows whether attachment files are used.
- Callout 7: Shows the designated classifications (분류1/2/3).
- Callout 8: Shows the list count (rows per page).
- Callout 9: Shows the page count (pagination size).

**Fields / columns / controls:**
- Search bar: 게시판명 (Board name) text input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), ID (BBS ID, e.g. B0000031), 게시판명 (Board name, link), 게시판유형 (Board type — all rows 통합게시판(PG0001)), 스킨 (Skin — all 공통), 첨부파일 (Attachment — 첨부/미첨부), 분류1/2/3 (Classification 1/2/3, slash-separated code IDs, e.g. 'SORT_STDR_CD//', 'STD_SRC_SE_CD//', 'COLCT_TRGET_CD/BBS_ITEM_TYPE_CD/SORT_STDR_CD'), 목록수 (List count, e.g. 10, 6, 5), 페이지수 (Page count, e.g. 10, 5), 생성일 (Creation date, e.g. 2025-05-23)
- Sample rows: B0000031 게시판테스트2; B0000028 게시판테스트; B0000026 테스트0513; B0000024 test; B0000023 test0204; B0000022 테스트777; B0000021 통합게시판6; B0000019 통합게시판테스트5; B0000018 통합게시판테스트4; B0000017 개인정보 침해사고 대응지침 (2020-04-22)
- Pagination: 1 2 3; 등록 (Register) button

**Business rules:**
- Integrated boards are restricted to board type PG0001 (통합게시판) — no other type selectable.
- Integrated boards are restricted to the common (공통) skin type.
- Up to 3 classification codes can be assigned per board (분류1/2/3).
- BBS ID (format Bxxxxxxx, e.g. B0000031) is the unique board discriminator.

### 1-28) 통합 게시판 관리(등록/수정:기본설정) — Integrated Board Management (Register/Edit: Basic Settings)

**Pages:** PDF page 31 (printed page 30) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 통합 게시판 관리

Basic Settings tab of the integrated-board register/edit screen. Five tabs exist: 기본설정 (Basic), 카테고리 설정 (Category), 필드설정 (Field), 목록순서변경 설정 (List order), 상세순서변경 설정 (Detail order). Configures board name, type/form, sorting, editor use, attachments, comment/navigation/excel/user-post/visibility/New-icon toggles, list & page counts, and shared top/bottom HTML content blocks.

**Screen elements (numbered callouts):**
- Callout 1: Basic Settings tab — navigation between tabs by their setting-division names is possible.
- Callout 2: Enter the board name.
- Callout 3: Board type — for the integrated board only the common type (공통유형) is possible.
- Callout 4: Select the board form (게시판 형태); list type (리스트형) / thumbnail type (썸네일형) are selectable.
- Callout 5: Select the sorting criteria (정렬기준).
- Callout 6: Editor use (에디터 사용여부) applies only to the administrator. Users cannot use the editor.
- Callout 7: If attachment usage (파일첨부 가능여부) is set to Use, you can then input attachment file count / file size / allowed extensions.
- Callout 8: Selectable toggles: comment use (댓글 사용여부) / previous-next post use (이전글다음글 사용여부) / excel download use (엑셀다운로드 사용여부) / user comment use (사용자 댓글 사용여부) / public-private (공개.비공개 사용여부) / New icon use (New 아이콘 사용여부).
- Callout 9: The list count (목록 수) can be specified.
- Callout 10: The page count (페이지 수) can be specified.
- Callout 11: Top content (상단콘텐츠) — HTML content commonly displayed at the top of this board.
- Callout 12: Bottom content (하단콘텐츠) — HTML content commonly displayed at the bottom of this board.

**Fields / columns / controls:**
- Tabs: 기본설정 | 카테고리 설정 | 필드설정 | 목록순서변경 설정 | 상세순서변경 설정
- *게시판명 (Board name) — text, e.g. '게시판테스트2'
- *게시판 유형 (Board type) — fixed: 공통유형
- *게시판 형태 (Board form) — dropdown: 리스트형 (list) / 썸네일형 (thumbnail)
- *정렬기준 (Sort criteria) — two dropdowns: field (등록일/registration date) + direction (내림차순/descending)
- *에디터 사용여부(관리자) (Editor use, admin) — radio 사용/미사용
- *파일첨부 가능여부 (Attachment allowed) — radio 사용/미사용
- *댓글 사용여부 (Comments) — radio 사용/미사용
- *이전글다음글 사용여부 (Prev/next post links) — radio 사용/미사용
- *엑셀다운로드 사용여부(관리자) (Excel download, admin) — radio 사용/미사용
- *사용자 글등록 여부 (User post registration) — radio 사용/미사용
- *공개/비공개 여부 (Public/private) — radio 공개/비공개
- *New아이콘 사용여부 (New icon) — radio 사용/미사용
- *목록수 (List count) — dropdown, e.g. 10 개
- *페이지수 (Page count) — dropdown, e.g. 10 개
- 상단콘텐츠 (Top content) — HTML textarea
- 하단콘텐츠 (Bottom content) — HTML textarea
- Buttons: 수정 (Update), 삭제 (Delete), 취소 (Cancel)

**Business rules:**
- Integrated board type is locked to the common type (공통유형/PG0001).
- Rich-text editor is admin-only; end users never get the editor.
- Enabling attachments unlocks three sub-settings: max attachment count, max file size, allowed extensions.
- Default/example pagination values: 목록수 10 items per page, 페이지수 10 page links.
- Top/bottom content blocks accept raw HTML rendered on every view of the board.

### 1-29) 통합 게시판 관리(등록/수정:카테고리 설정) — Integrated Board Management (Register/Edit: Category Settings)

**Pages:** PDF page 32 (printed page 31) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 통합 게시판 관리

Category Settings tab: binds up to three classification codes (분류코드1/2/3) to the board. Each slot is populated via a code-search popup (codes must pre-exist in Code Management) and configured with a display title, HTML title attribute, custom HTML attribute value, inline style, and five behavioral checkboxes (use, required, show-in-list, show-in-detail/edit, searchable).

**Screen elements (numbered callouts):**
- Callout 1: Category Settings tab; navigation by selecting the tab.
- Callout 2: Invokes the code-search popup (코드찾기); the content to be used as a classification code must already be registered as a code (refer to screen item 9).
- Callout 3: Button (코드선택제거) to remove a selected code so it is no longer used.
- Callout 4: The field where the classification code name is entered; used as the title/label where input is received.
- Callout 5: The field for the title name; used for the HTML title attribute.
- Callout 6: Attribute value — used to specify HTML attributes. ex) data="12".
- Callout 7: Style — used when specifying a style on the corresponding input (or similar) tag.
- Callout 8: Checkboxes: select usage (사용), select whether the value is required (필수), select whether it appears in the list (목록), select whether it appears on the detail view and edit/register screens (보기), select whether it can be used as a search condition (검색).
- Callout 9: Code-search popup screen — select a code via the 선택 (Select) button. To manage codes further, click the 관리 (Manage) button; to add a new code, register it in Code Management first, then return to this screen and select it.

**Fields / columns / controls:**
- Per classification slot (분류코드1, 분류코드2, 분류코드3): code ID input + code category name input, 코드찾기 (Find code) button, 코드선택제거 (Remove code selection) button
- Per slot config row: 분류코드N label/title input, Title input, 속성값 (attribute value) input, 스타일 (style) input, 항목 checkboxes: 사용 / 필수 / 목록 / 보기 / 검색
- 코드 찾기 popup: search (코드ID dropdown + text + 검색), result table columns: 번호, 분류명, 코드ID, 코드카테고리명, (사용여부), 관리 button, 선택 button
- Buttons: 수정 (Update), 삭제 (Delete), 취소 (Cancel)

**Business rules:**
- Classification codes must be registered in Common Code Management before they can be bound to a board (popup selection only; no free-form entry).
- 속성값 injects arbitrary HTML attributes (example: data="12"); 스타일 injects inline CSS onto the rendered input tag.
- Five per-category flags control behavior: 사용 (enabled), 필수 (validation-required), 목록 (visible in list view), 보기 (visible in detail/register/edit views), 검색 (available as a search filter).
- Maximum of 3 classification code slots per board.

### 1-30) 통합 게시판 관리(등록/수정:필드 설정) — Integrated Board Management (Register/Edit: Field Settings)

**Pages:** PDF page 33 (printed page 32) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 통합 게시판 관리

Field Settings tab: per-field configuration grid for all board post fields (number, title, division, department name, author, view count, plus extra fields 추가필드1-4 and extra content areas 추가내용1-4, attachment, registration date, modification date). Each field row sets label, HTML title attribute, attribute value, style, and the same five flags (use/required/list/view/search). Extra fields are varchar(4000); extra content fields are text type, with a selectable input HTML element Type.

**Screen elements (numbered callouts):**
- Callout 1: The place where the field label/title is entered; used as the title where input is received.
- Callout 2: The title-name input; used in the HTML title attribute.
- Callout 3: Attribute value — specify HTML attributes. ex) data="12".
- Callout 4: Style — used when specifying a style on the input tag.
- Callout 5: Checkboxes: use (사용), required (필수), show in list (목록), show in detail view and edit/register screens (보기), usable as search condition (검색).
- Callout 6: Extra fields (추가필드) are composed as varchar(4000); extra content (추가내용) fields are composed as text. After entering the desired label in the title, select the Type to choose the input HTML element.
- Callout 7: Settings must be configured here in order to use file attachments (첨부파일 row).
- Callout 8: Register/update/delete are possible (bottom buttons).

**Fields / columns / controls:**
- Field rows (left column visible): 번호 (number), 제목 (title), 구분 (division), 부서명 (department name), 팀명/담당 (team), 작성자 (author), 조회수 (view count), 게시일/내용 etc.; right column: 추가필드1~4 (extra fields, each with a Type dropdown), 추가내용1~4 (extra content areas), 첨부파일 (attachment), 등록일 (registration date), 수정일 (modification date)
- Per field row: 필드 label input, Title input, 속성값 (attribute value) input, 스타일 (style) input, 항목 checkboxes: 사용 / 필수 / 목록 / 보기 / 검색
- 추가필드 rows additionally have a 'Type' dropdown to pick the input HTML element
- Buttons: 수정 (Update), 삭제 (Delete), 취소 (Cancel)

**Business rules:**
- Extra fields (추가필드) are stored as varchar(4000); extra content fields (추가내용) are stored as text (DB column types are fixed).
- For extra fields, the admin picks the rendering HTML input element via a Type dropdown after naming the field.
- Attachment functionality requires its field-row configuration on this tab (in addition to the Basic Settings toggle).
- Same five behavioral flags per field: 사용/필수/목록/보기/검색.
- 속성값 example: data="12" (custom HTML data attributes); 스타일 applies inline CSS to the input tag.

### 1-31) 통합 게시판 관리(등록/수정:목록순서 변경 설정) — Integrated Board Management (Register/Edit: List Order Change Settings)

**Pages:** PDF page 34 (printed page 33) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 통합 게시판 관리

Tab for ordering the columns displayed in the board's LIST view. Items (e.g. 번호, 제목, 부서명, 작성자, 내용, 등록일) can be reordered by drag-and-drop using the handle or by up/down buttons, then saved.

**Screen elements (numbered callouts):**
- Callout 1: List order change settings tab; navigation by selecting the tab.
- Callout 2: Order can be changed by dragging while holding the mouse button (drag handle ≡).
- Callout 3: Order can be changed by clicking the up/down buttons.
- Callout 4: Update/delete are possible.

**Fields / columns / controls:**
- Table columns: 순서 (Order — drag handle ≡), 항목 (Item), 노출순서 (Exposure order — ^ / v buttons)
- Items listed: 번호 (number), 제목 (title), 부서명 (department name), 작성자 (author), 내용 (content), 등록일 (registration date)
- Buttons: 수정 (Update, green), 삭제 (Delete, red), 취소 (Cancel, gray)

**Business rules:**
- Two reordering mechanisms: mouse drag-and-drop on the handle, or per-row up/down arrow clicks.
- Order applies to the list-view column exposure sequence; must be saved with 수정.

### 1-32) 통합 게시판 관리(등록/수정:상세 순서 변경 설정) — Integrated Board Management (Register/Edit: Detail Order Change Settings)

**Pages:** PDF page 35 (printed page 34) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 통합 게시판 관리

Tab for ordering the fields displayed in the board's DETAIL (post view) screen. Identical interaction to 1-31: drag handle or up/down buttons over the same field items, then save.

**Screen elements (numbered callouts):**
- Callout 1: Detail order change settings tab; navigation by selecting the tab.
- Callout 2: Order can be changed by dragging while holding the mouse button.
- Callout 3: Order can be changed by clicking the up/down buttons.
- Callout 4: Update/delete are possible.

**Fields / columns / controls:**
- Table columns: 순서 (drag handle ≡), 항목 (Item), 노출순서 (up/down buttons)
- Items listed: 번호, 제목, 부서명, 작성자, 내용, 등록일
- Buttons: 수정 (Update), 삭제 (Delete), 취소 (Cancel)

**Business rules:**
- Separate ordering configuration from the list view — detail view field order is managed independently on this tab.
- Drag-and-drop and up/down buttons both supported; changes saved via 수정.

### 1-33) 커스텀 게시판 관리 — Custom Board Management (List)

**Pages:** PDF page 36 (printed page 35) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 통합 게시판 관리 (as printed in the manual; on-screen breadcrumb shows ... > 게시판 관리 > 커스텀 게시판 관리)

List of custom boards. Unlike integrated boards, custom boards can use any board type registered in System Management > Board Type Management (e.g. photo, FAQ, Q&A/answer, attachment, extended types identified by PG-codes) and show their skin setting. Columns mirror the integrated board list: BBS ID, name, type, skin, attachment, classifications 1/2/3, list count, page count, creation date.

**Screen elements (numbered callouts):**
- Callout 1: Search function is provided.
- Callout 2: The board ID (BBS ID) is used as the board discriminator.
- Callout 3: Shows the board name.
- Callout 4: Board type — type registration can be performed in 시스템관리 > 게시판 유형관리 (System Management > Board Type Management).
- Callout 5: Shows the board skin setting.
- Callout 6: Shows attachment usage.
- Callout 7: If a classification is designated, shows the classification codes.
- Callout 8: Shows the list count.
- Callout 9: Shows the page count.

**Fields / columns / controls:**
- Search bar: 게시판명 input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호, ID, 게시판명, 게시판유형, 스킨, 첨부파일, 분류1/2/3, 목록수, 페이지수, 생성일
- Sample rows: B0000029 커스텀테스트 / 게시판속성테스트42(PG00020) / 공통 / 첨부 / STD_SRC_SE_CD/DB_STD_CHCK_CLSF_CD/ / 10 / 10 / 2025-05-15; B0000027 테스트 / 게시판속성테스트2(PG0011) / 공통 / 미첨부 / // / 10 / 10 / 2025-05-14; B0000020 커스텀게시판테스트 / 테스트중입니다.(PG0021) / 공통 / 첨부 / COLCT_TRGET_CD/BBS_ITEM_TYPE_CD/PID_CND_CD / 10 / 10 / 2025-01-16; B0000012 확장형 게시판 / 확장형 게시판 샘플(PG0010) / 공통 / 첨부 / // / 10 / 10 / 2019-09-03; B0000009 첨부파일게시판 / 첨부파일게시판(PG0006) / 공통 / 첨부 / 2017-07-18; B0000005 Q.A / 답변형게시판(PG0003) / 공통 / 첨부 / 2017-04-06; B0000004 FAQ / FAQ게시판(PG0004) / 공통 / 미첨부 / 2017-04-17; B0000002 워크샵 / 포토형게시판(PG0002) / 공통 / 첨부 / STD_SRC_SE_CD/DB_STD_CHCK_CLSF_CD/PRP_SE_CD / 9 / 10 / 2017-04-06
- Pagination: 1; 등록 (Register) button

**Business rules:**
- Custom board types are extensible: new types are registered under System Management > Board Type Management (observed built-in/registered types: 포토형게시판 PG0002 photo board, 답변형게시판 PG0003 answer/Q&A board, FAQ게시판 PG0004, 첨부파일게시판 PG0006 attachment board, 확장형 게시판 샘플 PG0010 extended board, plus custom PG0011/PG0021/PG00020).
- Same BBS ID scheme (Bxxxxxxx) and up to 3 classification codes as integrated boards.

### 1-34) 커스텀 게시판 관리(등록/수정) — Custom Board Management (Register/Edit: Basic Settings)

**Pages:** PDF page 37 (printed page 36) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 커스텀 게시판 관리

Register/edit screen for a custom board with two tabs (기본설정 Basic Settings, 카테고리 설정 Category Settings). Extends the integrated-board basic settings with a selectable board type (from Board Type Management) and a skin selector (common skin vs site-specific skin, resolved to JSP paths that must be implemented). Also exposes explicit attachment constraints: file count, file size (10 MByte recommended), and a comma-separated lowercase allowed-extension list.

**Screen elements (numbered callouts):**
- Callout 1: Basic Settings; tab navigation by setting-division name is possible.
- Callout 2: Enter the board name.
- Callout 3: Select the board type. Board types can be registered in 시스템관리 > 게시판 유형관리 (System Management > Board Type Management).
- Callout 4: Select the board form; list type (리스트형) / thumbnail type (썸네일형) selectable.
- Callout 5: Select the board skin (common skin vs the given site's skin setting). Common skin ex) /WEB-INF/jsp/cmmn/bbs/PG0002/*.jsp ; site-specific skin ex) /WEB-INF/jsp/eng/bbs/PG0002/*.jsp ; the referenced skin must already be implemented.
- Callout 6: Editor use applies only to the administrator; users cannot use the editor.
- Callout 7: Select the sorting criteria.
- Callout 8: If attachment use is set to Use, you can input attachment file count / file size / allowed extensions.
- Callout 9: Selections available: comment use / previous-next post use / excel download use / user comment use / public-private / New icon use.
- Callout 10: The list count can be specified.
- Callout 11: The page count can be specified.
- Callout 12: Top/bottom content — HTML content commonly displayed at the top (and bottom) of the board.

**Fields / columns / controls:**
- Tabs: 기본설정 | 카테고리 설정
- *게시판명 (Board name) — text, e.g. '워크샵'
- *게시판 유형 (Board type) — dropdown, e.g. 포토형게시판(PG0002)
- *게시판 형태 (Board form) — dropdown: 리스트형/썸네일형 (썸네일형 shown)
- *게시판 스킨 선택(사용자) (Board skin selection, user side) — radio: 공통 스킨 사용 (use common skin) / 해당 사이트 스킨 사용 (use this site's skin); hint shows JSP path patterns /WEB-INF/jsp/cmmn/bbs/PG0002/*.jsp (common) and /WEB-INF/jsp/eng/bbs/PG0002/*.jsp (site)
- *정렬기준 (Sort criteria) — dropdowns: 등록일 + 내림차순
- *에디터 사용여부(관리자) — radio 사용/미사용
- *파일첨부 가능여부 (Attachment allowed) — radio 사용/미사용
- *첨부 가능 파일 개수 (Attachable file count) — dropdown, e.g. 5
- *첨부 가능 파일 사이즈 (Attachable file size) — numeric input, e.g. 10 MByte, with hint 'ⓘ 10 MByte 권장' (10 MByte recommended)
- 첨부파일 허용확장자 (Allowed attachment extensions) — text input, hint: enter extensions in lowercase separated by commas
- *댓글 사용여부 (Comments) — 사용/미사용
- *이전글다음글 사용여부 (Prev/next links) — 사용/미사용
- *엑셀다운로드 사용여부(관리자) (Excel download, admin) — 사용/미사용
- *사용자 글등록 여부 (User post registration) — 사용/미사용
- *공개/비공개 여부 (Public/private) — 공개/비공개
- *New아이콘 사용여부 (New icon) — 사용/미사용
- *목록수 (List count) — dropdown, e.g. 9 개
- *페이지수 (Page count) — dropdown, e.g. 10 개
- 상단콘텐츠 / 하단콘텐츠 (Top/Bottom HTML content) — textareas

**Business rules:**
- Board type is free to choose from types registered in System Management > Board Type Management (unlike integrated boards which are fixed to PG0001).
- Skin resolution: common skin loads from /WEB-INF/jsp/cmmn/bbs/{PGcode}/*.jsp, site-specific skin from /WEB-INF/jsp/{site}/bbs/{PGcode}/*.jsp (example site 'eng'); the chosen skin's JSP files must already be implemented or the board will not render.
- Attachment file size guidance: 10 MByte recommended (on-screen ⓘ note).
- Allowed extensions must be entered comma-separated in lowercase.
- Editor is admin-only; end users cannot use the rich-text editor.
- Enabling attachments unlocks count/size/extension constraint fields.
- Example pagination defaults: list count 9-10 items, page count 10.

### 1-35) 커스텀 게시판 관리(등록/수정:카테고리 설정) — Custom Board Management (Register/Edit: Category Settings)

**Pages:** PDF page 38 (printed page 37) · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 게시판 관리 > 커스텀 게시판 관리

Category Settings tab of the custom board editor: binds up to three classification codes (분류코드1/2/3) using the code-search popup, identical in mechanics to the integrated board's category tab. Codes must pre-exist in Code Management; a remove button clears a slot.

**Screen elements (numbered callouts):**
- Callout 1: Category Settings; tab navigation by selecting the tab.
- Callout 2: Invokes the code-search (코드찾기) popup; the content to be used as a classification code must already be registered as a code (refer to screen item 4).
- Callout 3: Button (코드선택제거) that removes a selected code so it is not used.
- Callout 4: Code-search popup screen — select a code via the 선택 (Select) button. To manage codes further, click the 관리 (Manage) button; to add a code, register it in Code Management first, then return to this screen and select it.

**Fields / columns / controls:**
- 분류코드1 slot: code 'STD_SRC_SE_CD' + name '표준출처구분코드', with 코드찾기 (Find code) and 코드선택제거 (Remove selection) buttons
- 분류코드2 slot: code 'DB_STD_CHCK_CLSF_CD' + name '데이터베이스표준점검...', same buttons
- 분류코드3 slot: code 'PRP_SE_CD' + name '제안구분코드', same buttons
- 코드 찾기 popup: search bar (코드ID dropdown + text + 검색) and result table columns: 번호, 분류명, 코드ID, 코드카테고리명, 사용여부, 관리 (Manage) button, 선택 (Select) button
- Buttons: 수정 (Update, green), 삭제 (Delete, red), 취소 (Cancel, gray)

**Business rules:**
- Classification codes are selectable only from codes already registered in Common Code Management (popup-driven; no free text).
- New codes cannot be created inside the popup's select flow — they must be registered in Code Management first, after which the admin returns to this screen to select them (the popup's 관리 button opens code management for edits).
- Maximum 3 classification code slots per custom board.

#### Extraction verification notes (adversarial second pass)

- **Gap:** PDF p24 (printed 23), 1-21: The screenshot has NINE numbered markers, not eight — on-screen marker 8 sits on the *사용여부 (use status) radio and marker 9 on the button row, while the manual's 화면 설명 lists only 8 items (item 8 = buttons). The extraction reproduces the 8 text descriptions and silently loses the fact that the 사용여부 field has its own on-screen callout marker with no matching description (a dropped/merged callout).
- **Gap:** PDF p23 (printed 22), 1-20: The 등록 (Register) button's on-screen marker is misprinted as a second '6' (two markers labeled 6: the usage toggle column and the Register button), while the description list has 7 items. The extraction maps Register to 'Callout 7' without noting this duplicate-marker anomaly — worth flagging since callout-to-screen tracing will fail here.
- **Gap:** PDF p33 (printed 32), 1-30 field settings: Type dropdowns are visible under the 추가내용1~4 (extra content) rows as well, not only under the 추가필드 (extra field) row(s). The extraction attributes the Type/HTML-element selector exclusively to 추가필드 rows; the manual's callout 6 text ('제목을 입력 후 Type를 선택') applies to the extra-field/extra-content group generally.
- **Gap:** PDF p37 (printed 36), 1-34 custom board: Next to *첨부 가능 파일 사이즈 there are TWO ⓘ hint lines — '10 MByte 권장' (captured) plus a second hint (partially illegible in the scan, reading approximately '첨부파일마다 적용되는 사이즈 입니다', i.e. the size limit applies per attachment file). The extraction only captured the first hint.
- **Gap:** PDF p21 (printed 20), 1-18: The extraction does not record the example/selected states of the radio toggles shown on screen (만족도=사용, 자료관리자=미사용, 2차인증 여부=미사용, 계정 신청 사용 여부=사용). Minor, but these are the only observable default states for the admin-page 2FA/account-application panel.
- **Correction:** PDF p24 (printed 23), 1-21: 'Callout 8: Update / Register / Delete buttons' follows the manual's text list but does not match the screen — on screen the buttons are marker 9 (marker 8 is 사용여부), and the buttons actually shown are 수정/삭제/취소 (Update/Delete/Cancel), not 수정/등록/삭제 as the manual's item-8 text claims. The extraction reproduces the manual's internally inconsistent numbering/labels without flagging it (its own dataFields correctly list 수정/삭제/취소, contradicting its callout 8).
- **Correction:** PDF p33 (printed 32), 1-30: The claim of '추가필드1~4' (four extra fields) is not supported by this page — only one 추가필드 row is clearly visible in the screenshot (label partially obscured by the callout marker), followed by 추가내용1~4. The count of 추가필드 slots cannot be verified from page 33 and should not be stated as 1-4.
- **Correction:** PDF p33 (printed 32), 1-30: The left-column field list '번호, 제목, 구분, 부서명, 팀명/담당, 작성자, 조회수, 게시일/내용 etc.' is partly speculative — the legible rows are 번호, 제목, 구분, 부서명, 팀명, 작성자, 조회수 (bottom row illegible); '담당' and '게시일/내용' are not verifiable on this page.
- **Correction:** PDF p36 (printed 35), 1-33: The third classification code on the B0000020 (커스텀게시판테스트) row reads 'PD_CND_CD' in the scan, not 'PID_CND_CD' as extracted. Scan quality is poor, so this should be re-verified against the source system, but as printed the extraction's value appears wrong.
- **Correction:** PDF p32 (printed 31), 1-29: The extraction lists a '사용여부' column (in parentheses) for the 코드 찾기 popup result table; on the page-32 popup screenshot that column header is not legibly present (번호/분류명/코드ID/코드카테고리명 + 관리/선택 buttons are). It is an inference from the page-38 popup, not something verifiable on page 32.


## PDF pages 39-56

_Section context: Section 1: 통합관리시스템 (Integrated Management System), printed pages 2-84. This range covers the tail of "관리 시스템 설정" (Management System Settings: integrated member management, banned-word management, short URL service) and the "관리자 사이트 관리" (Administrator Site Management: admin menu, notification area, popups, notices, banners, guide menus) sub-sections._

### 1-36 통합 회원 관리 (Integrated Member Management)

**Pages:** printed 38 / PDF 39 · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 통합회원관리 (Home > Integrated Management System > Management System Settings > Integrated Member Management)

List screen for all site members with search, detail view, and Excel export. Personal-information protection is enforced: any viewing of member data is logged in an access-history trail (a browser confirm dialog notifies the admin of this), and Excel download requires the admin to first record a 'purpose of viewing' which is stored in the personal-information access history.

**Screen elements (numbered callouts):**
- Callout 1: Provides a member search function.
- Callout 2: Excel download — when member information is downloaded, it is recorded in the personal-information access (viewing) history, and the purpose of viewing the member information must be written before the download is allowed.
- Callout 3: Member detail information lookup is available (click the member ID link in the list).
- Callout 4: This is the screen for registering the viewing purpose at the time of Excel download (modal '회원정보 엑셀다운로드' with a purpose field and 저장 Save / 닫기 Close buttons).
- Callout 5: When viewing member information, a message is displayed notifying the admin that a lookup history of member-information viewing is being accumulated (browser confirm dialog: '개인정보보호를 위해서 조회 시 이력을 쌓고있습니다. 확인 버튼을 클릭해주세요.' — 'For personal information protection, a history is recorded at every lookup. Please click the Confirm button.' with 확인 Confirm / 취소 Cancel buttons).

**Fields / columns / controls:**
- Search condition dropdown (검색조건: 이름/Name shown selected)
- Search keyword input (검색어)
- Buttons: 검색 (Search), 초기화 (Reset), 회원정보 엑셀다운 (Member Info Excel Download)
- Record count/pagination header: 총 : 1건 | 1 / 1 Page
- Table columns: 번호 (No.), 아이디 (User ID, hyperlink to detail), 성명 (Name), 성별 (Gender, e.g. 여/female), 가입일 (Join date, e.g. 2025-05-21 15:20), 접속일시 (Last access date/time, e.g. 2025-05-21 15:21)
- Excel-download purpose modal: field 열람목적 (Viewing purpose) text input; buttons 저장 (Save), 닫기 (Close)
- Info (i) and print icons in the page header
- Numeric pagination control

**Business rules:**
- Every lookup of member personal information appends to the personal-information access (viewing) history log; a confirm dialog explicitly notifies the admin of this before viewing.
- Excel download of member information is itself recorded in the personal-information viewing history.
- Excel download is blocked until a viewing purpose (열람목적) is entered and saved in the purpose modal — the purpose is a required precondition for download.
- Member names/IDs in the list are partially masked in display (screenshot shows redacted/masked values), consistent with privacy protection.

### 1-37 통합 회원 관리(상세보기/수정) (Integrated Member Management — Detail View / Edit)

**Pages:** printed 39 / PDF 40 · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 통합회원관리 (Home > Integrated Management System > Management System Settings > Integrated Member Management)

Detail/edit screen for a single member's basic information. Admin can edit phone, mobile, address (with postal-code address finder), and email. Privacy safeguard: whenever the personal-information page is viewed or printed, a diagonal watermark is generated on-screen/on-paper containing the document (management) number, the ID of the person printing, and the print date/time.

**Screen elements (numbered callouts):**
- Callout 1: Edits member information (points at the 주소 찾기 / Find Address postal-code lookup button in the address row).
- Callout 2: When printing personal information, a watermark containing the document number (문서번호), the printer/outputting user (출력자), and the print date/time (출력일시) is recorded and printed.
- Callout 3: Edits the member's detail information (수정 / Edit submit button).
- Callout 4: A watermark is generated upon viewing and printing (diagonal watermark overlay visible on the screenshot, e.g. 'U-CMS v3.0 관리번호: idtong4100 / 출력자… / 출력일시: 2025-05-27 1x:55:58').

**Fields / columns / controls:**
- Section header: 기본정보 (Basic Information)
- 아이디 (User ID, read-only, e.g. hakang00)
- 이름 (Name, e.g. 강현아)
- 성별 (Gender, e.g. 0)
- 생년월일 (Birth date, e.g. 19950427, YYYYMMDD)
- 전화번호 (Phone: prefix select dropdown + 2 number inputs)
- 휴대전화 (Mobile: prefix select dropdown + 2 number inputs)
- 주소 (Address: postal code input e.g. 08391 + 주소 찾기 Find Address button + 2 address text lines)
- 이메일 (Email: local-part input @ domain input + 메일주소선택 mail-domain select dropdown)
- Buttons: 수정 (Update/Save edit), 취소 (Cancel)
- Detail page also contains a 로그 (log) section (partially visible behind: 가입일/최초.../비밀번호 변경... rows)
- Print icon in header (triggers watermarked print)

**Business rules:**
- Viewing and printing member personal information always generates a watermark overlay.
- The printed watermark records: document/management number, outputting user ID, and output (print) timestamp — providing an audit trail on hard copies.
- User ID is not editable; contact fields (phone, mobile, address, email) are editable.
- Address entry uses a postal-code lookup (주소 찾기) flow rather than free text for the postal code.

### 1-38 비속어 금지단어 관리 (Profanity / Banned Word Management)

**Pages:** printed 40 / PDF 41 · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 비속어 금지단어 관리 (Home > Integrated Management System > Management System Settings > Profanity Banned Word Management)

List screen managing the dictionary of profanity/banned words used to filter bulletin-board posts. If a post being registered on a board contains a listed profanity, registration of the post is blocked. Individual filter entries can be deactivated. Supports multi-select bulk delete and navigation to a detail page per word.

**Screen elements (numbered callouts):**
- Callout 1: Profanity search. When registering a post on a bulletin board, if the post contains one of these profanities, the post is not registered. The profanity filter (per word) can be deactivated.
- Callout 2: Checkbox selection function for deleting multiple profanity words at once (header checkbox selects all).
- Callout 3: Bulk-delete function for the selected profanity words (삭제 Delete button).
- Callout 4: Navigates to the profanity detail page (word name is a hyperlink).

**Fields / columns / controls:**
- Search filters: 사용여부 (Use status) dropdown, 금지단어명 (Banned word name) dropdown (search-field selector), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: select checkbox, 번호 (No., e.g. 1961…1952), 금지단어명 (Banned word name, hyperlink), 등록ID (Registrant ID, e.g. hakang, admin), 사용여부 (Use status, e.g. 사용), 등록일자 (Registration date, e.g. 2025-05-15 10:06:43.0)
- Buttons: 삭제 (Delete, bottom-left, red), 등록 (Register, bottom-right, blue)
- Pagination: 1 2 3 4 5 6 7 8 9 10 > »

**Business rules:**
- Board post registration is rejected when the post content contains any active banned profanity word.
- Each banned word has a use/not-use flag; deactivating disables filtering for that word without deleting it.
- Bulk delete requires checkbox selection first; header checkbox = select all on page.
- Words track registrant ID and registration timestamp.

### 1-39 비속어 금지단어 관리(등록/수정) (Profanity Banned Word Management — Register / Edit)

**Pages:** printed 41 / PDF 42 · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 비속어 금지단어 관리 (Home > Integrated Management System > Management System Settings > Profanity Banned Word Management)

Register/edit form for a single profanity banned word: enter the word and set whether the filter entry is active. From this form the admin can register/update, delete, or cancel back to the list.

**Screen elements (numbered callouts):**
- Callout 1: Enter the profanity word (금지단어명 input, e.g. 'yasine').
- Callout 2: Set the use status (사용여부 radio: 사용 Use / 미사용 Not use).
- Callout 3: Register / Delete / Cancel (return to list) actions are available (buttons: 수정 green, 삭제 pink, 취소 gray).

**Fields / columns / controls:**
- *금지단어명 (Banned word name — required, marked with red asterisk) text input
- *사용여부 (Use status — required) radio: 사용 (default selected) / 미사용
- Buttons: 수정 (Update — green), 삭제 (Delete — pink/red), 취소 (Cancel — gray, returns to list)

**Business rules:**
- 금지단어명 and 사용여부 are required fields (asterisk-marked).
- Default use status is 사용 (in use).
- Cancel returns to the list without saving.

### 1-40 회원 금지 단어 설정 (Member Banned Word Settings)

**Pages:** printed 42 / PDF 43 · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 회원 금지 단어 설정 (Home > Integrated Management System > Management System Settings > Member Banned Word Settings)

List screen managing words that are forbidden inside member IDs and passwords at sign-up. If a user attempts to register using one of these words in the applicable scope, registration is refused. Each word carries an application scope (공통 common / 로그인 login-ID / 비밀번호 password). Supports search, multi-select bulk delete, and detail navigation.

**Screen elements (numbered callouts):**
- Callout 1: Member banned word search. Member banned words are words that cannot be used in the ID and password when registering as a member; if such a word is used at member registration, registration is not possible.
- Callout 2: Checkbox selection function for deleting multiple member banned words.
- Callout 3: Bulk-delete function for the selected member banned words (삭제 button).
- Callout 4: Navigates to the member banned word detail page (word name hyperlink).

**Fields / columns / controls:**
- Search filters: 적용범위 (Application scope) dropdown, 사용여부 (Use status) dropdown, 금지단어명 (Banned word name) dropdown, keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: select checkbox (with header select-all), 번호 (No.), 금지단어명 (Banned word, hyperlink — e.g. webmaster, pwd, password, master, admin), 등록ID (Registrant ID, e.g. admin), 적용범위 (Application scope — values shown: 공통 Common, 비밀번호 Password, 로그인 Login), 사용여부 (Use status, e.g. 사용), 등록일자 (Registration date, e.g. 2019-02-12 00:00:00.0)
- Buttons: 삭제 (Delete, red, bottom-left), 등록 (Register, blue, bottom-right)

**Business rules:**
- Member registration is blocked when the chosen ID or password contains an active banned word within its application scope.
- Application scope determines where the word is forbidden: 로그인 (login/ID only), 비밀번호 (password only), 공통 (both/common).
- Each entry has a use/not-use flag to enable or disable enforcement without deletion.

### 1-41 회원 금지 단어 설정(등록/수정) (Member Banned Word Settings — Register / Edit)

**Pages:** printed 43 / PDF 44 · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 회원 금지 단어 설정 (Home > Integrated Management System > Management System Settings > Member Banned Word Settings)

Register/edit form for a single member banned word: the word itself, the scope in which it is forbidden (ID / password / common), and its active flag. Register/update, delete, and cancel-to-list actions are provided.

**Screen elements (numbered callouts):**
- Callout 1: Enter the member banned word (금지단어명 input, e.g. 'webmaster').
- Callout 2: Select the category in which the member banned word will be used. The application scope can be selected as ID / password / common (radio shown: 공통 Common / 로그인 Login / 비밀번호 Password).
- Callout 3: Set 사용/미사용 (use / not use).
- Callout 4: Register / Delete / Cancel (return to list) actions are available (buttons: 수정, 삭제, 취소).

**Fields / columns / controls:**
- *금지단어명 (Banned word name — required) text input
- *적용범위 (Application scope — required) radio: 공통 (Common — default selected) / 로그인 (Login/ID) / 비밀번호 (Password)
- *사용여부 (Use status — required) radio: 사용 (default) / 미사용
- Buttons: 수정 (Update — green), 삭제 (Delete — pink), 취소 (Cancel — gray)

**Business rules:**
- All three fields are required (asterisk-marked).
- Scope semantics: 로그인 applies to member IDs, 비밀번호 applies to passwords, 공통 applies to both.
- Defaults on the form: scope 공통, use status 사용.

### 1-42 단축 URL 서비스 (Short URL Service)

**Pages:** printed 44 / PDF 45 · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 단축 URL 서비스 (Home > Integrated Management System > Management System Settings > Short URL Service)

List screen of short URLs generated by the system's URL-shortening service. Shows the link name, the generated short URL path, and the creation date, with keyword search and a register button. Short URLs use the pattern /shortView/{8-char alphanumeric code}.

**Screen elements (numbered callouts):**
- Callout 1: Short URL search function.
- Callout 2: The short URL link name is displayed (hyperlink to detail, e.g. 테스트1, 금감원 보도자료, 구글, 네이버).
- Callout 3: The short URL is displayed (e.g. /shortView/2zxaLwJ6, /shortView/WCylVhhv, /shortView/KtUA4ekp).
- Callout 4: The short URL creation date is displayed (e.g. 2025-05-15 10:19:03.0).

**Fields / columns / controls:**
- Search: 구분 (Category) dropdown (링크명 / Link name shown), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 링크명 (Link name, hyperlink), 단축 url (Short URL, hyperlink), 등록일 (Registration date/time)
- Button: 등록 (Register, blue, bottom-right)
- Pagination control

**Business rules:**
- Generated short URLs follow the site-relative pattern /shortView/{code} where the code is a random 8-character alphanumeric token.
- Each short URL record stores link name, short URL, and creation timestamp.

### 1-43 단축 URL 서비스(등록/수정) (Short URL Service — Register / Edit)

**Pages:** printed 45 / PDF 46 · **Menu path:** 홈 > 통합 관리 시스템 > 관리 시스템 설정 > 단축 URL 서비스 (Home > Integrated Management System > Management System Settings > Short URL Service)

Register/edit form for a short URL: enter a link name, the original (long) URL, and optional remarks; the system then generates the short URL, displayed in a '단축 URL 생성' section with a one-click clipboard copy button. Reset (re-generate/clear), delete, and back-to-list actions are provided.

**Screen elements (numbered callouts):**
- Callout 1: Enter the short URL link name (링크명, e.g. '금감원 보도자료').
- Callout 2: Enter the short URL original link (원본 링크, e.g. https://www.fss.or.kr/fss/bbs/B0000188/list.do?menuNo=200218).
- Callout 3: Enter remarks (비고내역 textarea).
- Callout 4: The short URL is generated (shown in the 단축 URL 생성 section, e.g. /shortView/2zxaLwJ6).
- Callout 5: Short URL reset (초기화), delete (삭제), and move to list (목록) are available.
- Callout 6: Link copy button (링크 복사) — on click, the short URL is copied to the clipboard.

**Fields / columns / controls:**
- *링크명 (Link name — required) text input
- *원본 링크 (Original link/URL — required) text input
- 비고내역 (Remarks — optional) multi-line textarea
- Section: 단축 URL 생성 (Short URL generation) — read-only generated short URL display
- Buttons: 초기화 (Reset — gray), 삭제 (Delete — pink), 목록 (List — blue), 링크 복사 (Copy Link — blue, next to generated URL)

**Business rules:**
- 링크명 and 원본 링크 are required; 비고내역 is optional.
- The short URL is system-generated after saving; it is not manually editable.
- 링크 복사 copies the generated short URL to the OS clipboard in one click.

### 1-44 관리자 메뉴관리 (Administrator Menu Management)

**Pages:** printed 46 / PDF 47 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 메뉴관리 (Home > Integrated Management System > Administrator Site Management > Administrator Menu Management)

Tree-based management of the admin site's menu structure. Left pane shows a drag-and-drop menu tree (메뉴목록) with expand/collapse-all and up/down reorder controls; right pane edits the selected menu's properties (number, name, URL, content type, new-window flag, use flag). Menus can be created at top level or as children, the in-memory menu cache can be refreshed per site, and a program/board picker popup assigns the menu's target link. Unused menus render red in the tree and are hidden from the top/left navigation.

**Screen elements (numbered callouts):**
- Callout 1: Button to open/close (expand/collapse) all tree menus (모두열기 / 모두닫기).
- Callout 2: Buttons to move the selected menu up/down (reorder arrows).
- Callout 3: Tree-format menu structure; menus can be moved by clicking and dragging (drag & drop reordering/reparenting).
- Callout 4: Creates a top-level menu regardless of which menu is currently selected, and lets you edit it (최상위신규메뉴추가 / Add new top-level menu).
- Callout 5: Adds a menu beneath the currently selected menu and lets you edit it (하위신규메뉴추가 / Add new sub-menu).
- Callout 6: Refreshes that site's menu in memory; the refreshed menu is re-read (takes effect) through login (해당사이트 메뉴적용 / Apply menu to this site — menu cache refresh).
- Callout 7: Via 호출하기 (Call/Open), direct access to the selected menu is possible (opens/navigates to that menu).
- Callout 8: Edits the information about the menu (메뉴번호 menu number field, e.g. 100005).
- Callout 9: Content selection — one of 준비중 (In preparation) / 프로그램 링크 (Program link) / 게시판 (Bulletin board) / 링크 (Link) can be chosen.
- Callout 10: For program or board types, a popup for selecting the specific program or board is invoked (see callout 13 screen; 프로그램 선택 button).
- Callout 11: When 'open in new window' (새창열기) is enabled, clicking the menu opens it in a new window.
- Callout 12: Use/not-use setting; when set to not-use, the menu appears in red in the admin menu tree but is not exposed in the top/left navigation menus.
- Callout 13: The popup invoked for program links — apply by clicking the desired program or link (메뉴링크선택 popup with program-name search and a table of 번호 / 프로그램명 / 링크).

**Fields / columns / controls:**
- Left pane 메뉴목록 (Menu list): tree rooted at 메뉴Root with nodes such as 통합 관리 시스템 > 관리 시스템 설정 > 관리자관리 (관리자 권한관리 / 관리자 부서관리 / 관리자 계정관리), 사이트 정보 관리, 코드관리, 게시판 관리, 통합회원관리, 비속어금지단어관리, 회원 금지 단어 설정, 단축 URL 서비스, 관리자 사이트 관리 (관리자 메뉴관리 / 관리자 알림영역 / 관리자 공지사항 / 관리자 배너관리 / 상단가이드메뉴관리) …
- Tree controls: 모두열기 (Expand all), 모두닫기 (Collapse all), up/down/reorder arrow buttons
- Action buttons (top): 최상위신규메뉴추가 (Add top-level menu — green), 하위신규메뉴추가 (Add sub-menu — green), 해당사이트 메뉴적용 (Apply menu to site — blue), 호출하기 (Call/Open — green)
- Form fields: 메뉴번호 (Menu number, e.g. 100005), *메뉴명 (Menu name — required, e.g. 관리자 권한관리), 메뉴URL (Menu URL, e.g. /bos/auth/list.do?menuSn=100005), *콘텐츠 선택 (Content selection — required) radio: 준비중 / 프로그램링크 / 게시판 / 링크, with 프로그램 선택 (Select program) button and 메뉴링크 (Menu link) path field (e.g. /bos/auth/list.do), *새창열기 (Open in new window — required) radio 사용/미사용, 사용여부 (Use status) radio 사용/미사용
- Bottom buttons: 수정 (Update — green), 삭제 (Delete — pink)
- 메뉴링크선택 popup: search filter dropdown (프로그램명) + keyword + 검색; results table columns 번호 / 프로그램명 (e.g. 샘플 조회, 샘플 요약2, 홈페이지(리치) 관리이력, 권한 변경/직제, 통합게시판 관리, 관리자 대체보수정 관리…) / 링크 (e.g. /bos/sample/sample01/list.do…, /bos/sns/token/list.do, /bos/auth/auth/list.do, /bos/auth/authhrhist/list.do, /bos/bbs/master/list.do, /bos/cmms/cmmnMngr/list/updateMv.do, /bos/cmms/cmmnMngr/list/updateMvPasswd.do)

**Business rules:**
- Menu tree supports drag-and-drop restructuring plus explicit up/down reorder buttons.
- Menu changes are cached: the '해당사이트 메뉴적용' action refreshes the menu in server memory, and admins pick up the refreshed menu on (re)login.
- Menu content type must be one of: 준비중 (placeholder/under preparation), 프로그램 링크 (internal program), 게시판 (board), 링크 (arbitrary link); program/board types are assigned through a selection popup rather than free-typed.
- 새창열기=사용 makes the menu open in a new window on click.
- 사용여부=미사용 hides the menu from the top/left navigation but keeps it visible (colored red) in the admin menu tree.
- Menu number (메뉴번호, menuSn) is the system identifier embedded in menu URLs (e.g. ?menuSn=100005).

### 1-45 관리자 알림 영역 (Administrator Notification Area)

**Pages:** printed 47 / PDF 48 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 알림 영역 (Home > Integrated Management System > Administrator Site Management > Administrator Notification Area)

List screen managing the image-banner notification slots shown on the admin main screen (e.g. release announcements). Each entry has an image, title, exposure period, sortable exposure order, and a use/not-use toggle. Items outside their exposure period are automatically hidden.

**Screen elements (numbered callouts):**
- Callout 1: Administrator notification area search area (사용여부 dropdown + keyword + 검색 + 초기화).
- Callout 2: Shows the notification area image (thumbnail column).
- Callout 3: Shows the notification area title (hyperlink to detail, e.g. 샘플, 관리자 공지사항을 항상 확인해주세요, U-CMS v3.0 출시, 데모 사이트 오픈).
- Callout 4: The exposure period is displayed; outside of this period the item is automatically not exposed (e.g. 2025-07-02 ~ 2025-07-09).
- Callout 5: Clicking the exposure-order buttons moves the item to top / up / down / bottom (최상위/상위/하위/최하위 arrow buttons).
- Callout 6: Clicking 사용중/미사용중 (In use / Not in use) toggles the setting in toggle-button fashion.

**Fields / columns / controls:**
- Search: 사용여부 (Use status) dropdown, keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 이미지 (Image thumbnail), 제목 (Title, hyperlink), 노출기간 (Exposure period, from ~ to dates), 노출순서 (Exposure order — 4 arrow buttons: to-top, up, down, to-bottom), 사용 (Use — 사용중 toggle button)
- Button: 등록 (Register, blue, bottom-right)
- Pagination control

**Business rules:**
- Exposure is automatically suppressed outside the configured exposure period.
- Exposure order is managed with 4-way move buttons (to top / one up / one down / to bottom).
- Use status can be flipped directly from the list via a toggle button without opening the detail form.

### 1-46 관리자 알림 영역(등록/수정) (Administrator Notification Area — Register / Edit)

**Pages:** printed 48 / PDF 49 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 알림영역 (Home > Integrated Management System > Administrator Site Management > Administrator Notification Area)

Register/edit form for one notification-area item: web image (single file, jpg/jpeg/png/gif, recommended 490x245), title, link URL (internal via picker popup or external which must start with http), use flag, link-target mode (new window vs current window), and an exposure period with date+hour precision.

**Screen elements (numbered callouts):**
- Callout 1: Registers the notification area image (file upload area with drag & drop).
- Callout 2: Enter the notification area title (제목).
- Callout 3: Enter the notification area link URL; external links must be entered starting with http (내부/외부 radio; 내부링크선택 internal-link picker button; hint text: '외부링크의 경우 반드시 http://를 입력하셔야 합니다').
- Callout 4: Use status — when set to 미사용 (not use), the item still exists in the admin list but is not exposed on the main use screen.
- Callout 5: When set to open in a new window (새창), clicking after setting opens it in a new window (링크 방식 radio 새창(Y)/현재창(N)).
- Callout 6: Exposure period — if the current time is not within this period, the item is not exposed on the main use screen (date + hour selects for start and end).

**Fields / columns / controls:**
- *웹 이미지 (Web image — required): file upload with drag&drop ('"파일선택"에서 첨부하거나, 여기로 첨부파일을 끌어놓으세요'); allowed types stated: 업로드 가능 파일은 jpg,jpeg,png,gif 입니다; max attachments: 첨부파일 최대 1개까지 첨부 가능합니다 (1 file); recommended image size note: 이미지 권장사이즈 : 490 * 245; shows filename+size (샘플1_1.png 128.98 KB) and total (1 File / 128.98 KB byte); per-file controls: 90°회전 (rotate CW), 90°회전 (rotate CCW), 위로 (up), 아래로 (down), 다운로드 (download), 링크복사 (copy link), 삭제 (delete); bulk controls: 파일선택 (choose file), 선택 파일 삭제 (delete selected files), 전체선택 (select all); per-file checkbox + description textarea
- *제목 (Title — required) text input (e.g. 샘플)
- *링크 URL (Link URL — required): 내부/외부 (Internal/External) radio + 내부링크선택 (Select internal link) button + URL input (e.g. /ucms/singl/contents/ready.do?menuSn=300001); note: external links must start with http://
- *사용 여부 (Use status — required) radio: 사용 (Y) / 미사용 (N)
- *링크 방식 (Link mode — required) radio: 새창 (Y — new window) / 현재창 (N — current window)
- *노출 기간 (Exposure period — required): start date picker + hour select (0-23시) ~ end date picker + hour select (e.g. 2025-07-02 0시 ~ 2025-07-09 15시)
- Buttons: 수정 (Update — green), 삭제 (Delete — pink), 취소 (Cancel — gray)

**Business rules:**
- Image upload restricted to jpg, jpeg, png, gif; maximum 1 attached file; recommended dimensions 490x245 px.
- External link URLs must begin with http:// (validation hint displayed).
- Internal links are chosen via an internal-link selection popup instead of free entry.
- 미사용 items remain in the admin list but never render on the main screen.
- Exposure period is enforced with hour granularity; outside the window the item is hidden on the main screen.
- 링크 방식 controls click behavior: 새창(Y) opens a new window, 현재창(N) navigates in place.

### 1-47 관리자 팝업 관리 (Administrator Popup Management)

**Pages:** printed 49 / PDF 50 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 팝업 관리 (Home > Integrated Management System > Administrator Site Management > Administrator Popup Management)

List screen for popup windows shown on the admin site. Each row lists the popup image, title, exposure period, target image link, and use status; use status can be toggled inline, and new popups are added via the register button.

**Screen elements (numbered callouts):**
- Callout 1: Popup management search area (사용여부 dropdown + keyword + 검색 + 초기화).
- Callout 2: Lists image, title, exposure period, link, and use status (the list-row content).
- Callout 3: Clicking 사용중/미사용중 toggles the setting in toggle-button fashion.
- Callout 4: Register button (등록) for registering a new popup.

**Fields / columns / controls:**
- Search: 사용여부 (Use status) dropdown, keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 이미지 (Image thumbnail), 제목 (Title, hyperlink — e.g. test, U-CMS V3.0 출시, 데모 사이트 오픈), 노출기간 (Exposure period, e.g. 2025-07-07 ~ 2025-07-09), 이미지링크 (Image link — e.g. http://naver.com, ?menuSn=100085, https://ucms.unpl.co.kr/bos/bbs/B0000006/view.do?pstSn=54&menuSn=100089, https://ucms.unpl.co.kr/ucms/main/main.do), 사용여부 (Use status toggle: 사용중/미사용중)
- Button: 등록 (Register, blue, bottom-right)
- Pagination control

**Business rules:**
- Use status is toggled inline from the list.
- Popups carry an exposure period governing when they appear.
- Image link may be an external absolute URL or an internal relative link (e.g. ?menuSn=...).

### 1-48 관리자 팝업 관리(수정/등록/삭제) (Administrator Popup Management — Edit / Register / Delete)

**Pages:** printed 50 / PDF 51 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 팝업 관리 (Home > Integrated Management System > Administrator Site Management > Administrator Popup Management)

Register/edit form for an admin-site popup: single popup image (gif/jpg/jpeg/png, recommended 160x140), title, image link (internal/external), use flag, scrollbar flag, 'close for a day' flag, exposure period with hour precision, and explicit popup window geometry (width, height, top, left in px).

**Screen elements (numbered callouts):**
- Callout 1: Registers the popup image (file upload area).
- Callout 2: Enter the popup title and the popup image link URL.
- Callout 3: Select the use status (사용여부), scroll usage (스크롤사용여부), and the close-for-one-day (하루닫기) setting.
- Callout 4: Enter the exposure period (노출기간 date + hour range).
- Callout 5: Specify the popup window's horizontal width and vertical height (넓이 WIDTH / 높이 HEIGHT in px).
- Callout 6: Enter the left and top coordinates of the popup window (팝업위치 TOP / 팝업위치 LEFT in px).

**Fields / columns / controls:**
- *이미지 (Image — required): upload with drag&drop; allowed types: gif,jpg,jpeg,png (업로드 가능 파일은 gif,jpg,jpeg,png 입니다); max 1 file (첨부파일 최대 1개까지 첨부 가능합니다); recommended size 이미지 권장사이즈 : 160 * 140; example file 02.png 75.6 KB; per-file controls: rotate 90° CW/CCW, 위로, 아래로, 다운로드, 링크복사, 삭제; bulk: 파일선택, 선택 파일 삭제, 전체선택
- *팝업제목 (Popup title — required) text input (e.g. U-CMS V3.0 출시)
- *이미지링크 (Image link — required): 내부/외부 radio + URL input (e.g. https://ucms.unpl.co.kr/bos/bbs/B0000006/view.do?pstSn=54&menuSn=100089); note: 외부링크의 경우 반드시 http://를 입력하셔야 합니다 (external links must start with http://)
- *사용 여부 (Use status — required) radio: 사용 / 사용하지않음
- *스크롤사용여부 (Scrollbar use — required) radio: 사용 / 사용하지않음
- *하루닫기 (Close for one day — required) radio: 사용 / 사용하지않음
- *노출기간 (Exposure period — required): start date + hour select ~ end date + hour select (e.g. 2025-06-25 0시 ~ 2025-12-31 0시)
- *넓이(WIDTH) — required, px number input (e.g. 550)
- *높이(HEIGHT) — required, px number input (e.g. 700)
- *팝업위치(TOP) — required, px number input (e.g. 100)
- *팝업위치(LEFT) — required, px number input (e.g. 200)
- 등록일시 (Registration date/time — read-only, e.g. 2025-06-25)
- Buttons: 수정 (Update — green), 삭제 (Delete — pink), 취소 (Cancel — gray)

**Business rules:**
- Popup image restricted to gif/jpg/jpeg/png, max 1 file, recommended 160x140 px.
- External image links must begin with http://.
- 하루닫기 (close-for-a-day) option lets viewers suppress the popup for one day (cookie-style 'do not show again today').
- 스크롤사용여부 controls whether the popup window shows scrollbars.
- Popup rendering geometry is fully configurable: width/height plus top/left screen coordinates, all in pixels.
- Exposure period with hour granularity gates when the popup appears.

### 1-49 관리자 공지사항 (Administrator Notices)

**Pages:** printed 51 / PDF 52 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 공지사항 (Home > Integrated Management System > Administrator Site Management > Administrator Notices)

List screen of notices posted to administrators. Supports date-range search and keyword search; pinned rows marked 공지 (Notice) sort above numbered general posts. Columns include title, department, author, view count, and registration date. NOTE: the manual's printed callout texts 4-6 on this page describe use-status / new-window / exposure-period behaviors that do not correspond to the visible list columns (they appear to be copy-paste carryover from the notification-area page); the callout markers actually point at the 조회수 (view count) column, 등록일 (registration date) column, and 등록 (register) button respectively. Both the literal translations and this discrepancy are recorded.

**Screen elements (numbered callouts):**
- Callout 1: Period search — after entering a period and searching, only the notices registered within that period are shown (date range: 연도-월-일 ~ 연도-월-일).
- Callout 2: Search using a search keyword is possible (구분 category dropdown [제목/title] + keyword input).
- Callout 3: If a file is registered (attached), an image is displayed (attachment indicator on the title row).
- Callout 4 (as printed): Use status — when not in use, the item exists in the admin list but is not exposed on the main use screen. [Marker actually points at the 조회수/view-count column — likely manual copy-paste error.]
- Callout 5 (as printed): When set to open in a new window, clicking opens a new window. [Marker actually points at the 등록일/registration-date column — likely manual copy-paste error.]
- Callout 6 (as printed): Exposure period — if not within the period, not exposed on the main use screen. [Marker actually points at the 등록 (Register) button — likely manual copy-paste error.]

**Fields / columns / controls:**
- Search: registration-period date-range pickers (연도-월-일 from ~ to), 구분 (Category) dropdown (제목 Title shown), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No. — pinned notices show the badge 공지 instead of a number; general posts numbered 13, 12, 11, 10, 9, 8, 7…), 제목 (Title, hyperlink — e.g. test, 공지사항 테스트2, ss3434, 테스트, 파일순서테스트, 비속어, 공지사항 테스트55, 멀티파일 첨부 테스트 1111…), 부서명 (Department name — e.g. test, 공지사항 테스트2, 비서실, 스마트정보), 작성자 (Author — e.g. 강현아, 관리자1, 이동호), 조회수 (View count — e.g. 15, 81, 2, 5, 1, 13), 등록일 (Registration date — e.g. 2025-05-14)
- Button: 등록 (Register, blue, bottom-right)
- Pagination: 1 2

**Business rules:**
- Notices flagged as 공지 are pinned at the top of the list above numbered general posts.
- Date-range search filters by registration date within the entered period.
- View count is tracked and displayed per post.
- Rows with attached files display an image/attachment indicator.

### 1-50 관리자 공지사항(등록/수정) (Administrator Notices — Register / Edit)

**Pages:** printed 52 / PDF 53 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 공지사항 (Home > Integrated Management System > Administrator Site Management > Administrator Notices)

Register/edit form for an administrator notice: notice type (공지 pinned — with a pin period selectable when chosen — vs 일반 general), title, department, team, author, WYSIWYG-edited body (Editor/HTML/TEXT modes), and up to five attachments (png/gif/jpg) each with an optional description. Save/update, delete, and cancel actions provided.

**Screen elements (numbered callouts):**
- Callout 1: Notice classification (공지구분) — when 공지 (Notice) is selected, select the period during which it will be registered (pinned) as a notice.
- Callout 2: Enter the content into the post registration form fields such as the title.
- Callout 3: Content input using the rich-text editor is possible (editor toolbar with font, size, bold/italic/underline, color, alignment, lists, tables, image, link etc.; mode tabs Editor / HTML / TEXT).
- Callout 4: Registers attachment files (per-file checkbox, filename e.g. test.png 64.43 KB, copy and remove icons, plus 첨부파일 설명 attachment-description input).
- Callout 5: After ticking an attachment's checkbox, deletion of all selected files is possible (선택 파일 삭제 / 전체선택 controls).
- Callout 6: Post registration and edit/delete are possible (buttons 수정 / 삭제 / 취소).

**Fields / columns / controls:**
- *공지구분 (Notice classification — required) radio: 공지 (Notice/pinned) / 일반 (General; shown selected); selecting 공지 additionally requires choosing the pinning period
- *제목 (Title — required) text input (e.g. 테스트)
- *부서명 (Department name — required) text input (e.g. test)
- *팀명 (Team name — required) text input (e.g. 신규부서)
- *작성자 (Author — required) text input (e.g. 강현아)
- *내용 (Body — required): WYSIWYG editor with full formatting toolbar and Editor / HTML / TEXT mode tabs
- 첨부파일 (Attachments): drag&drop zone ('"파일선택"에서 첨부하거나, 여기로 첨부파일을 끌어놓으세요'); allowed types: 업로드 가능 파일은 png,gif,jpg 입니다; limit note: 첨부파일 최대 5개까지 첨부 가능합니다 (max 5 files); running total display (1 File / 64.43 KB byte); per-file: checkbox, filename+size, copy icon, remove (X) icon, 첨부파일 설명 (attachment description) input; bulk buttons: 파일선택 (choose files), 선택 파일 삭제 (delete selected), 전체선택 (select all)
- Buttons: 수정 (Update — green), 삭제 (Delete — pink), 취소 (Cancel — gray)

**Business rules:**
- Attachment uploads restricted to png, gif, jpg; maximum 5 files per post.
- 공지 (pinned notice) type requires selecting the period during which the post stays pinned as a notice.
- Body supports three authoring modes: rich Editor, raw HTML, and plain TEXT.
- Each attachment can carry its own description text.
- Bulk attachment deletion works via checkbox selection (with select-all).

### 1-51 관리자 배너관리 (Administrator Banner Management)

**Pages:** printed 53 / PDF 54 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 배너관리 (Home > Integrated Management System > Administrator Site Management > Administrator Banner Management)

List screen for banners displayed on the admin site: shows banner image, title, target URL, exposure period, reorderable exposure order (4-way move buttons), and an inline use-status toggle, with search and register actions.

**Screen elements (numbered callouts):**
- Callout 1: Banner-management search function is provided (사용여부 dropdown + keyword + 검색 + 초기화).
- Callout 2: Shows the banner image (thumbnail).
- Callout 3: Shows the banner title (hyperlink, e.g. 배너 테스트, gggg).
- Callout 4: Shows the banner link address (e.g. https://www.bok.or.kr/portal/main/main.do, https://www.naver.com).
- Callout 5: Shows the banner exposure period (e.g. 2025-05-01 ~ 2033-12-31; 2025-03-04 ~ 2030-12-31).
- Callout 6: Exposure-order change — order can be changed with the to-bottom / down / up / to-top (최하위/하위/상위/최상위) buttons.
- Callout 7: Use-status change is possible with the 사용중/미사용중 (in use / not in use) toggle button.

**Fields / columns / controls:**
- Search: 사용여부 (Use status) dropdown, keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 이미지 (Image thumbnail), 제목 (Title, hyperlink), 배너URL(링크) (Banner URL/link, hyperlink), 노출기간 (Exposure period from ~ to), 노출순서 (Exposure order — 4 arrow buttons), 사용 (Use — 사용중 toggle button)
- Button: 등록 (Register, blue, bottom-right)
- Pagination control

**Business rules:**
- Banner display order is controlled with 4-way move buttons (to top / up / down / to bottom).
- Use status can be toggled inline from the list.
- Banners have exposure periods bounding when they display.

### 1-52 관리자 배너관리(등록/수정) (Administrator Banner Management — Register / Edit)

**Pages:** printed 54 / PDF 55 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 관리자 배너관리 (Home > Integrated Management System > Administrator Site Management > Administrator Banner Management)

Register/edit form for a banner: single web banner image (gif/jpg/jpeg/png, recommended 196x70, with a 'representative banner file' designation), title, link URL (external must start with http://), use flag, link mode (new window vs current page), and an exposure period with date+hour precision.

**Screen elements (numbered callouts):**
- Callout 1: Registers the image (file upload area with drag & drop and per-file manipulation controls).
- Callout 2: Enter data into the information input form fields such as the title.
- Callout 3: Enter the exposure period (date + hour range selects).

**Fields / columns / controls:**
- *웹 배너 이미지 (Web banner image — required): upload with drag&drop; allowed types: 업로드 가능 파일은 gif,jpg,jpeg,png 입니다; max 1 file (첨부파일 최대 1개까지 첨부 가능합니다); recommended size 이미지 권장사이즈 : 196 * 70; 대표 배너파일 (representative banner file) radio next to the file (visual-new.jpg 163.72 KB shown); per-file controls: 90°회전 CW/CCW, 위로, 아래로, 다운로드, 링크복사, 삭제; bulk: 파일선택, 선택 파일 삭제, 전체선택; totals display 1 File / 163.72 KB byte
- *제목 (Title — required) text input (e.g. 배너 테스트)
- *링크 URL (Link URL — required) input (e.g. https://www.bok.or.kr/portal/main/main.do); note: 외부링크의 경우 반드시 http://를 입력하셔야 합니다 (external links must start with http://)
- *사용 여부 (Use status — required) radio: 사용 / 미사용
- *링크 방식 (Link mode — required) radio: 새창 (new window) / 현재페이지 (current page)
- *노출기간 (Exposure period — required): start date + hour (0-23시) ~ end date + hour (e.g. 2025-05-01 0시 ~ 2033-12-31 0시)
- Buttons: 수정 (Update — green), 삭제 (Delete — pink), 취소 (Cancel — gray)

**Business rules:**
- Banner image restricted to gif/jpg/jpeg/png; maximum 1 file; recommended dimensions 196x70 px.
- External link URLs must begin with http://.
- 링크 방식 selects click behavior: 새창 (new window) or 현재페이지 (same page).
- Exposure period has hour-level granularity.

### 1-53 상단/하단 가이드메뉴관리 (Top/Bottom Guide Menu Management)

**Pages:** printed 55 / PDF 56 · **Menu path:** 홈 > 통합 관리 시스템 > 관리자 사이트 관리 > 상단가이드메뉴관리 (Home > Integrated Management System > Administrator Site Management > Top Guide Menu Management)

Inline multi-row editor for extra 'guide menu' links shown in the top utility bar (examples given: language settings — Chinese/English/Japanese, shortcut links, blog, cafe links). Added menus are appended after the default guide menus (Login, Sign-up, Sitemap). Each row configures name, internal/external link, order, new-window flag, use flag, and delete; a maximum of 5 top menus may be configured, and nothing persists until the Save button is pressed. On-screen guidance also states that new-window links must be absolute paths including http://.

**Screen elements (numbered callouts):**
- Callout 1: Provides an explanation of the guide menu (on-screen guidance box: 'Please configure additional menus to use in the top guide menu. (e.g. language settings — Chinese, English, Japanese, shortcut links, blog, cafe links, etc.) Position: added menus are placed after (behind) the default guide menus (Login, Sign-up, Sitemap). For new-window links, enter an absolute path value including http://.').
- Callout 2: For internal menu links, invoke the internal-link selection popup (내부링크선택) to pick a menu and fill it in; for external links, enter the URL directly (내부/외부 radio per row).
- Callout 3: Enter the menu link in the link input field (메뉴링크, e.g. /bos/singl/deptinfo/list.do?menuSn=10…, /bos/auth/auth/list.do?menuSn=10000…, /bos/singl/errorLog/list.do?menuSn=10…).
- Callout 4: Position-change buttons (최상위/상위/하위/최하위 — to top / up / down / to bottom) allow order changes.
- Callout 5: New-window use (새창 사용) and new-window not-use (새창 미사용) settings are available per row.
- Callout 6: Use-status (사용여부) setting is available per row (사용/미사용 select).
- Callout 7: The row (line) can be deleted (삭제 button per row).
- Callout 8: Save button (저장) — after making changes you must press Save for them to be saved.

**Fields / columns / controls:**
- Guidance/notice box at top describing purpose, placement, and http:// rule
- Note + button: ※ 상단 메뉴는 5개까지 설정가능 (Top menus can be configured up to 5) with 추가 (+ Add) button to append a row
- Per-row columns: *메뉴명 (Menu name — required, e.g. 홈페이지 관리자 부서관리, 홈페이지 관리자 권한관리, 에러로그), 내부/외부 (Internal/External) radio + 내부링크선택 (Select internal link) popup button, *메뉴링크 (Menu link — required) input with hint '외부 링크의 경우 반드시 http://를 입력하셔야 합니다' (external links must start with http://), 순서 (Order — 4 arrow buttons: to top/up/down/to bottom), 새창여부 (New-window) select: 새창 사용 / 새창 미사용, 사용여부 (Use status) select: 사용 / 미사용, 삭제 (Delete) button per row
- Bottom button: 저장 (Save — blue)

**Business rules:**
- Maximum of 5 top guide menus can be configured.
- Added guide menus are always positioned after the built-in default guide menus: 로그인 (Login), 회원가입 (Sign-up), 사이트맵 (Sitemap).
- New-window links (and external links generally) must be absolute URLs including http://.
- Internal links must be chosen through the internal-link selection popup; external links are typed directly.
- Edits are not persisted until the 저장 (Save) button is pressed — the screen is a batch inline editor.
- Each row independently controls order, new-window behavior, use status, and deletion.

#### Extraction verification notes (adversarial second pass)

- **Gap:** PDF 45 / printed 44 (1-42 Short URL Service list): the first row ('테스트1', 2025-05-15) has an EMPTY 단축 url cell — the screenshot shows a registered link-name record with no short URL displayed. The extraction asserts every record stores/displays a short URL and never notes this state (which matters because it suggests the short URL may not exist until generated on the detail screen).
- **Gap:** PDF 39 / printed 38 (1-36 Integrated Member Management): the callout-5 dialog is a native JavaScript browser confirm whose header shows the server origin '112.220.85.26:8123 내용:' — the extraction quotes the dialog body but drops this header, which is the evidence that the privacy notice is a browser confirm() gate rather than a styled modal.
- **Correction:** PDF 54 / printed 53 (1-51 Administrator Banner Management list): the bottom-right blue button is labeled 목록 (List), NOT 등록 (Register) as the extraction states in dataFields ('Button: 등록 (Register, blue, bottom-right)'). Zoomed comparison against the genuine 등록 buttons on printed pages 40/42/44/47/49 confirms the glyphs read 목록. The businessRule implying registration is launched from this button should be dropped or hedged.
- **Correction:** PDF 45 / printed 44 (1-42): the business rule 'the code is a random 8-character alphanumeric token' is nowhere stated in the manual — the callouts only say the short URL is displayed. It is an inference from three sample values (2zxaLwJ6, WCylVhhv, KtUA4ekp) and should be labeled as inferred, not a documented rule (and one visible record has no code at all).
- **Correction:** PDF 42 / printed 41 (1-39) and PDF 44 / printed 43 (1-41): the claimed defaults ('Default use status is 사용', 'Defaults on the form: scope 공통, use status 사용') are not documented. Both screenshots are EDIT views of existing records (buttons are 수정/삭제/취소, with populated values 'yasine'/'webmaster'), so the selected radios reflect the saved record, not form defaults for new registration.
- **Correction:** PDF 39 / printed 38 (1-36): businessRule says the confirm dialog notifies the admin 'before viewing' member info. Callout 5 actually says the message is output WHEN viewing ('회원 정보를 열람하는 경우 ... 메시지를 출력한다') — the before/gating semantics (that Cancel blocks the view) are inferred, not stated.
- **Correction:** PDF 40 / printed 39 (1-37): minor imprecision — callout 2's printed text says the watermark contains 문서번호 (document number), but the on-screen watermark sample shows the label 관리번호 ('관리번호: idtong4100'). The extraction mentions both terms but presents them as the same field without flagging the manual's own terminology mismatch; also the watermark sample timestamp is only partially legible ('1x:55:58'), which the extraction reproduces as if read cleanly.
- **Correction:** PDF 49 / printed 48 (1-46): the extraction states the exposure-period hour selects cover '0-23시'. The screenshot only shows the values 0 and 15 selected; the 0-23 range is a plausible inference but not shown or stated in the manual.


## PDF pages 57-74

_Section context: Section 1 통합관리시스템 (Integrated Management System). Subsections covered: 관리시스템 통계 (Management System Statistics: access statistics/history), 시스템 관리 > 에러로그 (System Management > Error Log with 3 statistics tabs), and 시스템 관리 > 공공데이터 표준화 관리 (System Management > Public Data Standardization Management: standard domain/word/term dictionaries, meta-term dictionary inspection, and the DBA-only standardization proposal management with table standard settings and proposal approval screens)._

### 1-54 접속통계 (Access Statistics)

**Pages:** PDF 57 / printed 56 · **Menu path:** 홈 > 통합 관리 시스템 > 관리시스템 통계 > 접속통계 (Home > Integrated Management System > Management System Statistics > Access Statistics)

Site access statistics dashboard with five tabbed statistic dimensions (site period, per menu, per OS, per browser, PC/mobile). The admin picks a daily/monthly aggregation mode and a date range, views an area chart of page views vs. visitors, sees the same data in a table below the chart, and can export the table to Excel.

**Screen elements (numbered callouts):**
- 1. Select the statistics tab menu (choose among 사이트 기간별/site-period, 메뉴별/by menu, 운영체제별/by operating system, 브라우저별/by browser, PC/모바일별/PC-mobile statistics).
- 2. Select daily (일간) / monthly (월간) mode and the aggregation base dates (date range).
- 3. Statistics graph area (area chart of the selected period).
- 4. Statistics are also shown in table form.
- 5. Clicking [엑셀 다운로드] (Excel Download) downloads the table from callout [4] as an Excel file.

**Fields / columns / controls:**
- Tabs: 사이트 기간별 통계 (Site period statistics), 메뉴별 (By menu), 운영체제별 (By OS), 브라우저별 (By browser), PC/모바일별 (PC/Mobile)
- Aggregation mode dropdown: 월간 (monthly) shown; 일간/월간 (daily/monthly) selectable
- Date range pickers (example: 2025-04-27 ~ 2025-05-26)
- 통계보기 (View Statistics) button
- Chart area '사이트 기간별 통계' — stacked/area chart with two series (page views in blue, visitors in green), chart export icon top-right
- 엑셀 다운로드 (Excel Download) button
- Table columns: 날짜 (Date), 페이지뷰(건) (Page Views, count), 방문자수(명) (Visitors, persons)

**Business rules:**
- Statistics are aggregatable by day or by month over a user-selected date range.
- Five statistic dimensions are provided as tabs: site period, menu, OS, browser, PC/mobile.
- Excel export downloads exactly the tabular data shown (the chart data table).

### 1-55 접속이력 (Access History)

**Pages:** PDF 58 / printed 57 · **Menu path:** 홈 > 통합 관리 시스템 > 관리시스템 통계 > 접속 이력 (Home > Integrated Management System > Management System Statistics > Access History)

Audit log of every admin access to the management system. Each row records who accessed (name, ID, IP), which admin menu they touched, the action performed (login, view, insert, update), the request URL, the access timestamp, and the login timestamp of the session. Supports date-range and keyword search.

**Screen elements (numbered callouts):**
- 1. Period search by access date/time is possible (date range pickers).
- 2. Keyword search function is provided (search field dropdown + text input).
- 3. Information about the person who accessed and their IP information is provided.
- 4. Accessed menu information is provided (full breadcrumb of admin menu, e.g. 통합 관리 시스템>관리자 사이트 관리>관리자 배너관리).
- 5. Access action (행동) and URL are provided.
- 6. Access date/time (일시) is provided.
- 7. Login date/time (로그인일시) is provided.

**Fields / columns / controls:**
- Search: date range (example 2025-05-21 ~ 2025-05-28), search field dropdown (아이디/ID shown), keyword text box, 검색 (Search) button, 초기화 (Reset) button
- Table columns: 번호 (No.), 이름 (Name), 아이디 (ID), IP, 메뉴 (Menu), 행동 (Action), URL, 일시 (Access date/time), 로그인일시 (Login date/time)
- Observed action values: 수정처리 (update processed), 메인조회 (main page viewed), 등록처리 (register processed), 로그인 (login)
- Observed URLs: /bos/siteManage/banner/update.do, /bos/main/main.do, /bos/siteManage/banner/insert.do, /bos/member/admin/toLogin.do
- Pagination: numbered pages 1-10 plus next (>) and last (>>) arrows

**Business rules:**
- Every admin action is logged with menu breadcrumb, action verb, endpoint URL, IP, and both action timestamp and session-login timestamp (allowing session reconstruction).
- Names/IDs are personal data (redacted in the manual screenshot), implying the log stores real identity data.
- IP examples show both LAN (192.168.0.1) and localhost (127.0.0.1) captured as-is.
- List is paginated (10 rows visible per page in screenshot).

### 1-56 에러로그 (Error Log)

**Pages:** PDF 59 / printed 58 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 에러로그 (Home > Integrated Management System > System Management > Error Log)

Server-side error (exception) log browser, first tab of a four-tab module (에러로그 / 기간별 통계 / 유형별 통계 / URL별 통계). Lists each captured exception with its class name (clickable, linking to detail), the request path that raised it, the logged-in user's ID and IP, and the timestamp. Searchable by period, title/content, user ID, or user IP — explicitly designed so developers can debug per logged-in user.

**Screen elements (numbered callouts):**
- 1. Error log menu tabs; 기간별 통계 (period statistics) / 유형별 통계 (type statistics) / URL별 통계 (URL statistics) are provided.
- 2. Error-generation period search function is provided (year-month-day range).
- 3. Search is possible by title and content, user ID, and user IP. Because search can be based on the logged-in user, debugging on behalf of other users is smooth.
- 4. Error title is provided; the path (URL) that triggered the error is provided.
- 5. User ID and IP are provided, which makes debugging smooth.
- 6. Error date/time is provided.

**Fields / columns / controls:**
- Search: 연도-월-일 ~ 연도-월-일 date range pickers, 구분 (Category) dropdown showing 제목 (Title), keyword input, 검색 (Search), 초기화 (Reset)
- Record count header: 총 10353건 | 1/1036 Page (10 rows per page)
- Table columns: 번호 (No.), error title as hyperlink (e.g. org.springframework.beans.factory.NoSuchBeanDefinitionException), 에러경로 (Error path, e.g. /bos/singl/siteConectStats/rcord.do), 사용자ID (User ID, e.g. kst116), 사용자IP (User IP, e.g. 192.168.0.1), 에러일자 (Error date, e.g. 2025-05-28 10:17)
- Pagination: 1-10 plus > and >> arrows

**Business rules:**
- Search category dropdown allows searching by title/content, user ID, or user IP (구분 selector).
- Error records are tied to the logged-in user (ID + IP) at the time of the exception, enabling per-user debugging.
- Default page size is 10 rows (10353 records = 1036 pages).
- Error title is a link (opens error detail/stack trace).

### 1-57 기간별 통계 (Error Statistics by Period)

**Pages:** PDF 60 / printed 59 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 에러로그 > 기간별 통계 (Home > Integrated Management System > System Management > Error Log > Statistics by Period)

Second tab of the error-log module: a daily time-series of error counts over a selected date range, rendered as an area chart with a data table underneath. Purpose: quickly spot the days on which errors were concentrated. Daily error-count values in the table are hyperlinks (drill-down to the underlying errors).

**Screen elements (numbered callouts):**
- 1. Moves to the 기간별 통계 (period statistics) tab.
- 2. Error-generation period search function is provided (date range + 통계보기/View Statistics button).
- 3. Visualized as a per-day graph, making it possible to identify the days where error occurrence is concentrated.
- 4. Per-day error counts are provided in table form.

**Fields / columns / controls:**
- Date range pickers (example 2025-04-29 ~ 2025-05-28), 통계보기 (View Statistics) button
- Chart: 기간별 에러통계 (Period error statistics) area chart with hover tooltip (shows date and value, e.g. 2025-05-06 / 페이지뷰 0), y-axis up to 1,500, chart export icon
- Table columns: 날짜 (Date), 에러(건) (Errors, count) — counts rendered as underlined links (e.g. 10, 9, 0)

**Business rules:**
- Chart and table cover the exact user-selected period.
- Non-zero daily error counts are clickable links, implying drill-down navigation to the filtered error list for that day.

### 1-58 유형별 통계 (Error Statistics by Type)

**Pages:** PDF 61 / printed 60 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 에러로그 > 유형별 통계 (Home > Integrated Management System > System Management > Error Log > Statistics by Type)

Third tab of the error-log module: horizontal bar chart ranking exception classes by occurrence count over a selected period, with a matching table. The stated purpose is triage — eliminate the most frequent error types first to stabilize the service. Counts link to the underlying error records.

**Screen elements (numbered callouts):**
- 1. Moves to the 유형별 통계 (type statistics) tab. If error removal is performed starting from the error type with the most occurrences, a more stable service can be provided.
- 2. Error-generation period search function is provided.
- 3. Visualized as a per-type graph, making it possible to identify where errors are concentrated.
- 4. Per-type error counts are provided in table form.

**Fields / columns / controls:**
- Date range pickers (2025-04-29 ~ 2025-05-28), 통계보기 (View Statistics) button
- Chart: 유형별 에러통계 (Type error statistics) horizontal bar chart listing exception class names, x-axis 0–3,000, legend 페이지뷰, export icon
- Table columns: 에러유형 (Error Type), 에러(건) (Errors count, underlined links)
- Observed rows: org.springframework.beans.factory.NoSuchBeanDefinitionException 2,542; javax.el.PropertyNotFoundException 752; java.lang.NullPointerException 273; org.mybatis.spring.MyBatisSystemException 141; org.springframework.jdbc.BadSqlGrammarException 121

**Business rules:**
- Error types are aggregated by full exception class name and ranked descending by count.
- Per-type counts are clickable, implying drill-down to the filtered error list for that type.

### 1-59 URL별 통계 (Error Statistics by URL)

**Pages:** PDF 62 / printed 61 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 에러로그 > URL별 통계 (Home > Integrated Management System > System Management > Error Log > Statistics by URL)

Fourth tab of the error-log module: horizontal bar chart ranking request URLs by error count over a selected period, plus a table of URL/count pairs. Purpose is the same triage principle — fix the URLs producing the most errors first for a more stable service.

**Screen elements (numbered callouts):**
- 1. Moves to the URL별 통계 (URL statistics) tab. If error removal is performed starting from the URL with the most error occurrences, a more stable service can be provided.
- 2. Error-generation period search function is provided.
- 3. Visualized as a per-URL graph, making it possible to identify where error occurrence is concentrated.
- 4. Per-URL error counts are provided in table form.

**Fields / columns / controls:**
- Date range pickers (2025-04-29 ~ 2025-05-28), 통계보기 (View Statistics) button
- Chart: URL별 에러통계 horizontal bar chart with URL labels on the y-axis, legend 페이지뷰, export icon
- Table columns: 에러URL (Error URL), 에러(건) (Errors count, underlined links)
- Observed rows: /bos/singl/siteConectStats/rcord.do 2,443; (empty URL) 862; /bos/member/admin/toLogin.do 59; /bos/siteManage/prvcClct/forUpdate.do 39; /bos/singl/siteCntriTot/rcord.do 38; /cmmn/bbs/bbsCm/insert.json 36; /ucms/bbs/B0000005/x 36; /ucms/oauth/sns/kakaoCallback.do 34; /bos/cmmnCd/cmmnCdCtgry/getSortOrdr.json 25

**Business rules:**
- Errors are aggregated per request URL and ranked descending.
- A blank/empty URL bucket exists (errors with no captured URL are still aggregated).
- Counts link to the underlying error records for that URL.

### 1-60 표준 도메인사전 (Standard Domain Dictionary)

**Pages:** PDF 63 / printed 62 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 표준 도메인사전 (Home > Integrated Management System > System Management > Public Data Standardization Management > Standard Domain Dictionary)

List screen for the standard domain dictionary used for Korean public-data standardization. The MOIS (행정안전부) public-database standard domains ship as built-in defaults; institution-specific (기관) standards are added via the 등록 (Register) button. Rich filtering by source, revision number, and use status; full Excel export intended as audit (감리) submission material.

**Screen elements (numbered callouts):**
- 1. Various search filter functions are provided (source / revision number / use status, etc.).
- 2. Standard-source, public-database standard domains are provided by default (기본 제공), and institution (기관) standards can be managed through registration.
- 3. Shows the revision number (개정차수).
- 4. Shows the domain group (도메인그룹).
- 5. Shows the domain classification (분류).
- 6. Shows the domain name (도메인명).
- 7. Shows the data type (데이터타입).
- 8. Shows the use status (사용여부).
- 9. By downloading to Excel, more precise review work is possible, and it can be used as useful base material when submitting for audit (감리 제출).

**Fields / columns / controls:**
- Filter bar: 표준출처 전체 (Source: all) dropdown, 개정차수 전체 (Revision: all) dropdown, 사용 (Use status) dropdown, 등록순 (Sort: registration order) dropdown, page-size dropdown (10), search-field dropdown (전체/All), keyword input, 검색 (Search), 초기화 (Reset)
- Record count: 총 122건 | 2/13 Page
- Table columns: 번호 (No.), 표준출처 (Standard Source, e.g. 행정안전부), 개정차수 (Revision, e.g. 1차–6차), 도메인그룹 (Domain Group, e.g. 금액/Amount, 날짜/시간/Date-Time), 분류 (Classification, e.g. 금액, 비용, 요금, 시분, 시분초, 연도, 연월, 연월일), 도메인명 (Domain Name link, e.g. 금액N17, 금액N18, 금액22.2, 비용N15, 요금N15, 시분C4, 시분초C6, 연도C4, 연월C6, 연월일C8), 데이터타입 (Data Type: NUMERIC, CHAR), 길이 (Length: 17, 18, 22.2, 15, 4, 6, 8), 형식 (Format: 9999999999999900-style masks, HH24MI, HH24MISS, YYYY, YYYYMM, YYYYMMDD), 사용여부 (Use status: 사용), 등록일 (Registration date, e.g. 2025-02-12)
- Buttons: 전체엑셀다운로드 (Download All to Excel), 등록 (Register)
- Pagination 1-10 with > and >>

**Business rules:**
- MOIS public-data standard domains are pre-loaded and treated as the baseline; institution standards are user-registered.
- Page size is selectable (10 shown); sortable by registration order.
- Domain name encodes group + type abbreviation + length (e.g. 금액N17 = Amount, NUMERIC, length 17; 연월일C8 = Date, CHAR, length 8).
- Length supports decimal notation for numeric precision (22.2 = precision.scale).
- Full Excel export is positioned as audit-submission material.

### 1-61 표준 도메인사전(등록/수정) (Standard Domain Dictionary — Register/Edit)

**Pages:** PDF 64 / printed 63 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 표준 도메인사전 (Home > Integrated Management System > System Management > Public Data Standardization Management > Standard Domain Dictionary)

Detail/edit form for a single standard domain. Captures source, revision, group/classification, name, data type, length, decimal places, storage and display format masks, unit, descriptions, memo, use flag, and approval metadata. Direct edits to standard content are prohibited; instead the user submits 수정 제안 (edit proposal) or 폐기 제안 (discard proposal) which only take effect after DBA review/approval, with every action logged. Version history is viewable.

**Screen elements (numbered callouts):**
- 1. Register the standard source (표준출처) and revision number (개정차수), etc.
- 2. The domain name is composed of domain group + data-type abbreviation + data length (도메인그룹 + 자료유형 약자 + 자료길이).
- 3. Through data-type management, the input data type can be easily grasped.
- 4. Enter the domain description (도메인 설명).
- 5. The memo content (메모내용) is useful during management.
- 6. Shows the approval status (승인 상태) of the domain.
- 7. The history (이력) of the domain can be checked ([이력보기] button).
- 8. [수정 제안하기] (Propose Edit) is available; the proposal is reflected only after approval through DBA review, and the corresponding log is recorded.
- 9. [폐기 제안하기] (Propose Discard) function; the proposal is reflected only after approval through DBA review, and the corresponding log is recorded.

**Fields / columns / controls:**
- 표준출처* (Standard Source, dropdown — 행정안전부)
- 개정차수* (Revision, dropdown — 4차)
- 도메인그룹명* (Domain Group Name — 금액)
- 도메인분류명* (Domain Classification Name — 금액)
- 도메인명* (Domain Name — 금액N17)
- 자료유형* (Data Type, dropdown — NUMERIC)
- 자료 길이* (Data Length — 17)
- 소수점 자릿수 (Decimal Places)
- 저장유형명* (Storage Format Name — 99,999,999,999,999,900)
- 표시유형명 (Display Format Name — 99,999,999,999,999,900)
- 단위명 (Unit Name — 원/KRW)
- 도메인 설명 (Domain Description)
- 허용값 설명 (Allowed-Values Description)
- 메모내용 (Memo Content, textarea)
- 사용여부* (Use Status radio: 사용/미사용)
- 등록일 (Registration date — 2025-02-12 00:00:00.0), 수정일 (Modification date)
- 승인여부 (Approval status — 승인), 승인일시 (Approval datetime), 승인아이디 (Approver ID — admin)
- Buttons: 이력보기 (View History), 수정 제안하기 (Propose Edit, green), 폐기 제안하기 (Propose Discard, red), 취소 (Cancel)
- Notice text: '공공데이터 표준 제정 내용은 수정 및 삭제시 표준에 위배 됨으로 재정절차에 따라 수정 및 폐기 하시길 바랍니다' (Because directly editing/deleting enacted public-data standard content violates the standard, please edit and discard via the enactment procedure)

**Business rules:**
- Fields marked * are required (source, revision, group name, classification name, domain name, data type, data length, storage format, use status).
- Domain naming rule: 도메인명 = domain group + data-type abbreviation + data length (N=NUMERIC, C=CHAR, V=VARCHAR, T=TEXT observed).
- Standard entries cannot be directly modified or deleted — changes go through the edit/discard proposal workflow.
- Edit and discard proposals require DBA review and approval before being applied; every proposal action is written to a log.
- Approval metadata (status, datetime, approver ID) is displayed read-only.
- Full change history per domain is retained and viewable via 이력보기.

### 1-62 표준 단어사전 (Standard Word Dictionary)

**Pages:** PDF 65 / printed 64 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 표준 단어사전 (Home > Integrated Management System > System Management > Public Data Standardization Management > Standard Word Dictionary)

List screen for the standard word dictionary (atomic vocabulary used to compose terms/columns). Public-database standard words are pre-loaded; institution words are added via registration. Shows abbreviation, Korean name, English name, domain classification, synonym list, and use status, with the same filter set and Excel/audit export as the domain dictionary.

**Screen elements (numbered callouts):**
- 1. Various search filter functions are provided (source / revision number / use status, etc.).
- 2. Standard-source, public-database standard words are provided by default, and institution standards can be managed through registration.
- 3. Shows the revision number (개정차수).
- 4. Shows the word abbreviation name (단어 약어명).
- 5. Shows the word Korean name (단어 한글명).
- 6. Shows the word English name (단어 영문명).
- 7. Shows the word classification name (도메인분류명 column).
- 8. Shows the use status (사용여부).
- 9. By downloading to Excel, more precise review work is possible, and it can be used as useful base material when submitting for audit (감리).

**Fields / columns / controls:**
- Filter bar: 표준출처 전체 dropdown, 개정차수 전체 dropdown, 사용 dropdown, 등록순 sort dropdown, page-size 10 dropdown, 전체 field dropdown, keyword, 검색, 초기화
- Record count: 총 2,441건 | 1/245 Page
- Table columns: 번호 (No.), 표준출처 (Source: 기관/institution or 행정안전부/MOIS), 개정차수 (Revision, e.g. 기관생성/institution-created), 단어약어명 (Word Abbreviation, link — YN, test, TXT11, TXT1, TST12, 40, 39, 38, 37, 36), 단어한글명 (Korean Name, link), 단어영문명 (English Name, link — YN, TST, TXT11, dsdfsdf, test12), 도메인분류명 (Domain Classification — 여부, 내용, 코드, 건물부번, 법인등록번호, or '-'), 동의어목록명 (Synonym List Name — 11, sdf, TXT11, dsf2, 동의어목록명12, or '-'), 사용여부 (Use status: 사용), 등록일 (Registration date)
- Buttons: 전체엑셀다운로드 (Download All to Excel), 등록 (Register)
- Pagination 1-10 with > and >>

**Business rules:**
- Public-data standard words are pre-provided; institution-created words carry 개정차수 = 기관생성 (institution-created).
- Each word maps abbreviation ↔ Korean name ↔ English name, optionally to a domain classification and a synonym list.
- Full Excel export positioned as audit-submission material.
- Page size selectable, default 10 (2,441 records = 245 pages).

### 1-63 표준 단어사전(등록/수정) (Standard Word Dictionary — Register/Edit)

**Pages:** PDF 66 / printed 65 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 표준 단어사전 (Home > Integrated Management System > System Management > Public Data Standardization Management > Standard Word Dictionary)

Detail/edit form for a single standard word. Manages abbreviation/Korean/English names, formal-word flag, optional domain-classification binding (which turns the word into a domain), synonym and forbidden-word lists, description and memo, plus use/approval status. Like domains, direct changes are replaced by DBA-approved edit/discard proposals with logging, and per-word history is viewable.

**Screen elements (numbered callouts):**
- 1. Register the standard source and revision number, etc.
- 2. Word abbreviation name, word Korean name, and word English name management is possible.
- 3. Enter the formal-word status (형식단어 여부).
- 4. Domain classification name designation is possible. (If a domain classification name is designated, the word is used as a domain.)
- 5. Enter the word description to provide information about the word.
- 6. Use status, approval status, and approval date/time are provided.
- 7. Provides the history (이력) for the word.
- 8. [수정 제안하기] (Propose Edit) available; the proposal is reflected once approved through DBA review, and it is recorded in the log.
- 9. [폐기 제안하기] (Propose Discard) function; the proposal is reflected once approved through DBA review, and it is recorded in the log.

**Fields / columns / controls:**
- 표준출처* (Standard Source — 행정안전부)
- 개정차수* (Revision dropdown — 6차)
- 단어약어명* (Word Abbreviation — MBRCO)
- 단어한글명* (Word Korean Name — 회원사)
- 단어영문명* (Word English Name — Member Company)
- 형식단어여부* (Formal-Word Status radio: 사용/미사용)
- 도메인분류명 (Domain Classification Name dropdown — 도메인분류명 전체)
- 동의어목록명 (Synonym List Name)
- 금칙어목록명 (Forbidden-Word List Name)
- 단어설명 (Word Description textarea — e.g. '단체다. 어떤 회를 구성하는 회사 또는 어떤 단체에 가입한 회사')
- 메모내용 (Memo Content)
- 사용여부* (Use Status radio: 사용/미사용)
- 승인여부 (Approval status — 승인), 승인일시 (2025-02-12 00:00:00.0), 승인아이디 (admin)
- 등록일 (2025-02-12 00:00:00.0), 수정일 (Modification date)
- Buttons: 이력보기 (View History), 수정 제안하기 (Propose Edit), 폐기 제안하기 (Propose Discard), 취소 (Cancel)
- Notice: editing/deleting enacted public-data standard content violates the standard — follow the enactment (proposal) procedure

**Business rules:**
- Required fields: source, revision, abbreviation, Korean name, English name, formal-word status, use status.
- If a 도메인분류명 (domain classification name) is assigned to a word, that word is usable as a domain.
- Words carry both a synonym list and a forbidden-word (금칙어) list for standardization enforcement.
- Edit/discard proposals require DBA review approval before taking effect; all proposal actions are logged.
- Per-word revision history is retained and viewable.

### 1-64 표준 용어사전 (Standard Term Dictionary)

**Pages:** PDF 67 / printed 66 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 표준 용어사전 (Home > Integrated Management System > System Management > Public Data Standardization Management > Standard Term Dictionary; breadcrumb in manual header shows '표준 요어사전' — a typo for 표준 용어사전)

List screen for the standard term dictionary (terms = column-level business terms composed of standard words and bound to a domain). Public-database standard terms are pre-loaded; institution terms are registered. Each row shows the term abbreviation, term name, bound domain, storage format, and display format. Same filters and Excel/audit export pattern.

**Screen elements (numbered callouts):**
- 1. Provides various search filter functions: source / revision number / use status, etc.
- 2. Standard-source, public-database standard terms are provided by default, and institution standards can be managed through registration.
- 3. Shows the revision number (개정차수).
- 4. Shows the term name (용어명; callout marker sits on the 용어약어명/abbreviation column, whose values are links).
- 5. Shows the corresponding domain name (도메인명).
- 6. Shows the data/storage format (저장형식).
- 7. Shows the display format (표현형식).
- 8. Shows the use status (사용여부).
- 9. By downloading to Excel, more precise review work is possible, and it can be used as useful base material when submitting for audit (감리).

**Fields / columns / controls:**
- Filter bar: 표준출처 전체, 개정차수 전체, 사용, 등록순, page-size 10, 전체 field dropdown, keyword, 검색, 초기화
- Record count: 총 9,029건 | 1/903 Page
- Table columns: 번호 (No.), 표준출처 (기관/행정안전부), 개정차수 (기관생성, 6차, 7차), 용어약어명 (Term Abbreviation, link — TEST_YN, SMK_YN, SCBIZ_YMD, SCBIZ_YN, LVABSN_END_YMD, LVABSN_YMD, LVABSN_DAY_CNT, LVABSN_YN, LVABSN_BGNG_YMD), 용어명 (Term Name, link — 시설여부, 흡연여부, 휴폐업일자, 휴폐업여부, 휴직종료일자, 휴직일자, 휴직일수, 휴직여부, 휴직시작일자), 도메인명 (Domain Name — 여부C1, 연월일C8, 수N7), 저장형식 (Storage Format — 'Y or N', '1자리 문자'/1-char, YYYYMMDD, 9999999), 표현형식 (Display Format — 'Y or N', YYYYMMDD, 9999999), 사용여부 (사용), 등록일
- Buttons: 전체엑셀다운로드 (Download All to Excel), 등록 (Register)
- Pagination 1-10 with > and >>

**Business rules:**
- Terms are bound to exactly one domain (도메인명), from which storage/display formats derive.
- Term abbreviations follow underscore-joined word abbreviations (e.g. LVABSN_END_YMD = 휴직종료일자 / leave-of-absence end date).
- Public standards pre-loaded; institution terms flagged as 기관/기관생성.
- Excel export positioned as audit material; default page size 10 (9,029 records = 903 pages).

### 1-65 표준 용어사전(등록/수정) (Standard Term Dictionary — Register/Edit)

**Pages:** PDF 68 / printed 67 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 표준 용어사전 (Home > Integrated Management System > System Management > Public Data Standardization Management > Standard Term Dictionary)

Detail/edit form for a standard term. The user enters the term abbreviation and clicks search, which generates a list of matching domain names to bind; once a domain is selected, its allowed-value description, storage format name, and display format name are auto-populated read-only. Additional metadata: standard administrative code name, competent-agency name, synonyms, memo. Changes flow through DBA-approved edit/discard proposals with logging and viewable history. Note: this menu manages the standard term dictionary only — meta terms are not searchable here.

**Screen elements (numbered callouts):**
- 1. Register the standard source and revision number, etc.
- 2. Search is possible by entering the standard term name; the meta term dictionary is NOT searched — this menu manages the standard term dictionary.
- 3. When the term abbreviation is entered and searched, a list of matching domain names is generated; the domain to use can be selected from that list.
- 4. The allowed-value description (허용값 설명) for the selected domain, the storage format name (저장유형명), and the display format name (표시유형명) are expressed automatically.
- 5. Manage the term description (용어설명).
- 6. The memo content is useful during management.
- 7. Use status, approval status, and approval date/time are provided.
- 8. Provides the history for the term ([이력보기]).
- 9. [수정 제안하기] (Propose Edit) available; reflected once approved through DBA review; the log is recorded.
- 10. [폐기 제안하기] (Propose Discard) function; reflected once approved through DBA review; the log is recorded.

**Fields / columns / controls:**
- 표준출처* (Standard Source — 행정안전부)
- 개정차수* (Revision dropdown — 6차)
- 용어약어명* (Term Abbreviation — LVABSN_END_YMD) with 검색 (Search) button
- 용어명* (Term Name — 휴직종료일자)
- 도메인명* (Domain Name dropdown — 연월일C8, populated by the abbreviation search)
- 허용값 설명 (Allowed-Values Description, auto/read-only — 'YYYY : 0001-9999, MM : 01-12, DD : 01-31')
- 저장유형명 (Storage Format Name, auto — YYYYMMDD)
- 표시유형명 (Display Format Name, auto — YYYYMMDD)
- 용어설명 (Term Description — '일정산 기간 직무를 쉬는 것을 끝마치는 날짜')
- 표준행정코드명 (Standard Administrative Code Name)
- 소관기관명 (Competent Agency Name)
- 동의어목록명 (Synonym List Name)
- 메모내용 (Memo Content)
- 사용여부* (Use Status radio: 사용/미사용)
- 승인여부 (승인), 승인일시 (2025-02-12 00:00:00.0), 승인아이디 (admin), 등록일, 수정일
- Buttons: 이력보기 (View History), 수정 제안하기 (Propose Edit), 폐기 제안하기 (Propose Discard), 취소 (Cancel)
- Notice: follow the enactment procedure for edits/discards of enacted public-data standards

**Business rules:**
- Domain binding is driven by searching the term abbreviation: the system generates a candidate domain-name list from which the user picks one.
- Allowed-value description, storage format, and display format are inherited automatically (read-only) from the bound domain.
- Meta term dictionary entries are excluded from this screen's search — standard terms only.
- Edit/discard proposals need DBA review approval; all actions logged; per-term history retained.

### 1-66 메타용어 사전 점검 (Meta Term Dictionary Inspection)

**Pages:** PDF 69 / printed 68 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 메타 용어사전 점검 (Home > Integrated Management System > System Management > Public Data Standardization Management > Meta Term Dictionary Inspection)

Automated conformance check of the live database metadata (actual tables/columns) against the standard dictionaries. Each physical column is tested against four error rules and marked SUCCESS or FAIL per rule. Filters allow selecting an error type and FAIL-only rows for fast triage; results are exportable to Excel.

**Screen elements (numbered callouts):**
- 1. Meta term dictionary inspection is a menu that checks whether metadata is standardized; it checks the following errors — 오류1 (Error 1): comparing the standard term dictionary with the meta term dictionary, the column name (physical) is the same but the logical name (comment) is different; 오류2 (Error 2): comparing the standard term dictionary with the meta term dictionary, the logical name (comment) is the same but the column name (physical) is different; 오류3 (Error 3): a word within the column name (physical) of the meta term dictionary does not exist in the word dictionary; 오류4 (Error 4): no domain exists.
- 2. Various filter functions are provided; selecting the error type (오류 구분) and setting error status (오류여부) to FAIL enables quick review of error content.
- 3. Provides information about the metadata: the table, column name, logical name, etc.
- 4. The inspection result for Error 1 is provided.
- 5. The inspection result for Error 2 is provided.
- 6. The inspection result for Error 3 is provided.
- 7. The inspection result for Error 4 is provided.
- 8. The data can be downloaded to Excel for further use.

**Fields / columns / controls:**
- Info banner: '메타 용어사전의 오류 항목 기술' listing the four error definitions
- Filter bar: 행정안전부 (source) dropdown, 오류 구분 (Error Type) dropdown, 오류여부 전체 (Error Status: all/FAIL) dropdown, page-size 10, 전체 field dropdown, keyword, 검색, 초기화
- Record count: 총 1,137건 | 1/114 Page
- Table columns: 번호 (No.), 테이블명 (Table Name — ta_acs_cntrl_authrt), 용어약어명 (Column/Term Abbreviation — authrt_sn, idntf_sn, sort_sn, trgt_sn, lmt_cnt, aprv_yn, scs_yn, fail_yn), 용어명 (Logical Name — 권한-일련번호, 식별일련번호, 정렬일련번호, 대상일련번호, 제한수, 승인여부, 성공여부, 실패여부), 데이터타입 (Data Type — int(22), int(10), char(1)), 도메인명 (Domain — 일련번호N10, 수N10, 여부C1), 오류1, 오류2, 오류3, 오류4 (each SUCCESS in blue or FAIL in red, clickable links)
- Button: 전체엑셀다운로드 (Download All to Excel)
- Pagination 1-10 with > and >>

**Business rules:**
- Four fixed validation rules: (1) same physical column name but different logical name/comment vs standard; (2) same logical name but different physical name vs standard; (3) a word token inside the physical column name missing from the word dictionary; (4) column has no bound domain.
- Each column row receives an independent SUCCESS/FAIL verdict per rule.
- Filtering by error type + FAIL status is the intended triage workflow.
- Results exportable to Excel; default page size 10 (1,137 records = 114 pages).

### 1-67 테이블 표준 설정 (Table Standard Settings)

**Pages:** PDF 70 / printed 69 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 공공데이터 표준화 제안관리 > 테이블 표준 설정 (Home > Integrated Management System > System Management > Public Data Standardization Management > Public Data Standardization Proposal Management > Table Standard Settings)

DBA-only screen that assigns which standardization source each physical database table must conform to (행정안전부/MOIS, 기관/institution, 제외/excluded, or unassigned). Lists all tables with descriptions and created/changed dates, provides a per-row source dropdown, checkbox multi-select, and a batch-apply save button. A summary strip totals tables per source category.

**Screen elements (numbered callouts):**
- 1. Search by table category (테이블구분) and by standard source is possible with the search filter. The 공공데이터 표준화 제안관리 (Public Data Standardization Proposal Management) menu — only the DBA has permission to it.
- 2. The table name, table description, and table creation date are exposed.
- 3. Set the standard source (표준출처). It can be set to 행정안전부 (MOIS), 기관 (institution), 제외 (excluded), etc., and the table then follows the standardization criteria of that setting.
- 4. Button that bulk-saves the source of the selected tables after modification ([일괄적용] / Batch Apply).

**Fields / columns / controls:**
- Filter bar: page-size dropdown (10), 테이블구분 전체 (Table Category: all) dropdown, 표준출처 전체 (Standard Source: all) dropdown, 전체 field dropdown, keyword, 검색, 초기화
- Summary banner: 총 테이블수: 92건, 행정안전부: 90건, 기관: 1건, 제외: 0건, 미지정: 1건 (total 92 tables; MOIS 90; institution 1; excluded 0; unassigned 1)
- Record count: 총 92건 | 1/10 Page
- Table columns: row checkbox, 번호 (No.), 테이블구분 (Category — 기본/basic), 테이블명 (Table Name — ta_acs_cntrl_authrt, ta_acs_cntrl_clsf, ta_acs_cntrl_trgt, ta_acs_cntrl_unq_idntf, ta_db_std_chck, ta_db_std_chck_rslt, ta_err_log, ta_lgn_hstry, ta_prvc_prsl_hstry, ta_site_acs_hstry), 테이블설명 (Description — 접근통제권한, 접근통제분류, 접근통제대상, 접근통제고유식별, 데이터베이스표준점검, 데이터베이스표준점검결과, 오류로그, 로그인이력, 제안정보열람이력, 사이트접근이력), 테이블 생성일 (Created date), 테이블 변경일 (Changed date), 표준출처 (per-row dropdown — 행정안전부)
- Button: 일괄적용 (Batch Apply)
- Pagination 1-10

**Business rules:**
- Permission: the entire 공공데이터 표준화 제안관리 menu group is restricted to the DBA role only.
- Each table is assigned one standardization source: 행정안전부 / 기관 / 제외 / 미지정 (unassigned); the assigned source determines which standardization rules the table is validated against.
- Source changes are applied in bulk to checkbox-selected rows via 일괄적용.
- Summary counts by source category are recalculated and displayed above the list.

### 1-68 표준 도메인사전 제안 (Standard Domain Dictionary Proposal — List)

**Pages:** PDF 71 / printed 70 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 공공데이터 표준화 제안관리 > 표준 도메인사전 제안 (Home > Integrated Management System > System Management > Public Data Standardization Management > Public Data Standardization Proposal Management > Standard Domain Dictionary Proposal)

DBA work queue listing all pending and processed proposals against the domain dictionary. Each row shows the proposal kind (등록/register, 수정/edit, 삭제·폐기/delete-discard), the proposed domain's attributes, its approval state (승인대기 pending / 승인 approved / 미승인 rejected), and approval date. The DBA opens a row to process it.

**Screen elements (numbered callouts):**
- 1. Provides filters by standard source, revision number, etc.
- 2. Search is possible with the search filter (keyword box).
- 3. The proposal category (수정/폐기/등록 — edit/discard/register proposal) is exposed.
- 4. The approval status (승인상태) is classified as 승인대기 (pending approval) / 승인 (approved) / 미승인 (not approved), etc., and is processed by the DBA.
- 5. The approval date (승인일) is exposed.

**Fields / columns / controls:**
- Filter bar: 표준출처 전체 dropdown, 개정차수 전체 dropdown, 전체 dropdown, page-size 10, 전체 field dropdown, keyword, 검색, 초기화
- Record count: 총 62건 | 1/7 Page
- Table columns: 번호 (No.), 제안구분 (Proposal Type — 수정제안/Edit Proposal in blue, 삭제제안/Delete Proposal in red, 등록제안/Register Proposal; values are links), 표준출처 (기관/행정안전부), 개정차수 (기관생성), 도메인그룹 (코드, 테스트, 번호), 분류 (여부, 테스트, 전화번호), 도메인명 (link — 여부C2, 테스트C10, 테스트T65535, 전화번호V14, 전화번호V32), 데이터타입 (CHAR, TEXT, VARCHAR), 길이 (2, 10, 65535, 14, 32), 사용여부 (사용 / 미사용 in red), 등록일, 승인상태 (승인대기/승인/미승인), 승인일
- Pagination 1-7

**Business rules:**
- Three proposal kinds exist: 등록제안 (register), 수정제안 (edit), 삭제제안/폐기 (delete/discard).
- Approval lifecycle: 승인대기 (pending) → 승인 (approved) or 미승인 (rejected); only the DBA processes proposals.
- Proposal rows retain the full proposed domain attribute set (group, classification, name, data type, length, use status).
- Data types observed include CHAR, VARCHAR, TEXT with lengths up to 65535.

### 1-69 표준 도메인사전 제안(제안관리) (Standard Domain Dictionary Proposal — Proposal Processing Detail)

**Pages:** PDF 72 / printed 71 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 공공데이터 표준화 제안관리 > 표준 도메인사전 제안 (Home > Integrated Management System > System Management > Public Data Standardization Management > Public Data Standardization Proposal Management > Standard Domain Dictionary Proposal)

DBA processing screen for one domain-dictionary proposal. Shows the proposal kind, and for edit proposals renders a before > after diff of every changed field highlighted in red (e.g. 가격N10 > 가격N20, length 10 > 20, storage format 9999999999 > 9,999,999,999). The DBA picks 승인/미승인 in the 승인여부 dropdown and clicks 수정제안 처리 to execute the decision.

**Screen elements (numbered callouts):**
- 1. Displays the category value of the domain proposal (등록/수정/폐기 — register/edit/discard).
- 2. For an edit proposal, the changed parts are briefly displayed (before > after, changed values shown in red).
- 3. Shows the proposal date/time (등록일).
- 4. After selecting approve/non-approve (승인/미승인) for the proposal, edit-proposal processing is performed.
- 5. Performs the edit-proposal processing ([수정제안 처리] button).

**Fields / columns / controls:**
- 제안구분 (Proposal Type — 수정제안 in blue)
- 표준출처 (행정안전부), 개정차수 (2차)
- 도메인그룹명 (금액), 도메인분류명 (가격)
- 도메인명 (diff: 가격N10 > 가격N20 with new value in red)
- 자료유형 (NUMERIC)
- 자료 길이 (diff: 10 > 20), 소수점 자릿수 (empty)
- 저장유형명 (diff: 9999999999 > 9,999,999,999), 표시유형명 (9,999,999,999)
- 단위명 (원)
- 도메인 설명 ('물건이 지니고 있는 가치를 돈으로 나타낸 것')
- 허용값 설명 (empty), 메모내용 (empty)
- 사용여부 (사용)
- 등록일 (2025-07-09 13:09:31.0)
- 승인여부 dropdown (승인대기 shown; options approve/non-approve)
- Buttons: 수정제안 처리 (Process Edit Proposal, green), 취소 (Cancel)
- Notice: enacted public-data standard content must be edited/discarded via the enactment procedure

**Business rules:**
- Edit proposals present a field-level before > after diff with changes highlighted in red for DBA review.
- The DBA must explicitly choose 승인 (approve) or 미승인 (reject) in the 승인여부 dropdown, then commit via 수정제안 처리; only approval causes the change to be applied to the standard dictionary.
- Proposal date/time is recorded and displayed; processing is logged (per 1-61 rules).

### 1-70 표준 단어 사전 제안 (Standard Word Dictionary Proposal — List)

**Pages:** PDF 73 / printed 72 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 공공데이터 표준화 제안관리 > 표준 단어사전 제안 (Home > Integrated Management System > System Management > Public Data Standardization Management > Public Data Standardization Proposal Management > Standard Word Dictionary Proposal)

DBA work queue for proposals against the word dictionary. Rows show proposal kind (등록제안/삭제제안 observed), the word's abbreviation/Korean/English names (all clickable to open the proposal detail), domain classification, use status, registrant, registration date, approval state, and approval date.

**Screen elements (numbered callouts):**
- 1. Provides search filters by standard source, revision number, etc.
- 2. Provides the information about the word dictionary (the proposed word rows).
- 3. The word abbreviation name, Korean name, and English name can be clicked to check the proposal content.

**Fields / columns / controls:**
- Filter bar: 표준출처 전체 dropdown, 개정차수 전체 dropdown, 전체 dropdown, page-size 10, 전체 field dropdown, keyword, 검색, 초기화
- Record count: 총 40건 | 1/4 Page
- Table columns: 번호 (No.), 제안구분 (Proposal Type — 등록제안/Register in blue-black, 삭제제안/Delete in red), 표준출처 (기관/행정안전부), 개정차수 (1차, 7차, 기관생성), 단어약어명 (link — TTA, TXT1, TST12, YN, TXT11, test, TEST2, TEST1), 단어한글명 (link — 한국정보통신기술협회, dfsdf, 테스트12, 여부, TXT11, 테스트, 테스트2, 테스트1), 단어영문명 (link — Telecommunications Technology Association, dsdfsdf, test12, YN, TXT11, TST, TEST2, TEST1), 도메인분류명 (여부 or '-'), 사용여부 (사용 / 미사용 in red), 등록자 (Registrant — GS테스트1, 김준모, 김승태), 등록일, 승인상태 (미승인/승인), 승인일
- Pagination 1-4

**Business rules:**
- Word proposals carry the registrant's name (등록자) — proposals are attributable to the submitting user.
- Approval lifecycle mirrors the domain proposals: pending/approved/not-approved, DBA-processed.
- All three name variants (abbr/Korean/English) act as links into the proposal detail screen.

### 1-71 표준 단어 사전 제안(제안관리) (Standard Word Dictionary Proposal — Proposal Processing Detail)

**Pages:** PDF 74 / printed 73 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 공공데이터 표준화 제안관리 > 표준 단어사전사전 제안 (Home > Integrated Management System > System Management > Public Data Standardization Management > Public Data Standardization Proposal Management > Standard Word Dictionary Proposal; manual breadcrumb contains the duplicated-word typo '단어사전사전')

DBA processing/detail screen for one word-dictionary proposal (screenshot shows an already-approved 삭제제안/delete proposal). Displays the proposal kind, all word fields, the diff for edit proposals, proposal timestamp, and approval metadata (status, masked approver ID, approval datetime). For unprocessed proposals the DBA selects approve/non-approve and commits; for processed ones only 취소 (Cancel/back to list) remains.

**Screen elements (numbered callouts):**
- 1. Displays the category value of the word-dictionary proposal (등록/수정/폐기 — register/edit/discard).
- 2. For an edit proposal, the changed parts are briefly displayed.
- 3. Shows the proposal date/time (등록일).
- 4. After selecting approve/non-approve for the proposal, edit-proposal processing is performed (승인여부 shown as 승인 for this already-processed record).
- 5. Through edit-proposal processing and Cancel (취소), returns to the list screen.

**Fields / columns / controls:**
- 제안구분 (Proposal Type — 삭제제안 in red)
- 표준출처 (행정안전부), 개정차수 (기관생성)
- 단어약어명 (TXT1), 단어한글명 (dfsdf)
- 단어영문명 (dsdfsdf)
- 형식단어여부 (미사용), 도메인분류명 (empty)
- 동의어목록명 (dsf2), 금칙어목록명 (sdf4)
- 단어설명 (sdf45), 메모내용 (sdf66)
- 사용여부 (사용)
- 등록일 (2025-06-13 16:05:41.0)
- 승인여부 (승인), 승인아이디 (masked: ju**2), 승인일시 (2025-06-13 16:05:54.0)
- Button: 취소 (Cancel — returns to the list); processing button appears only for unprocessed proposals
- Notice: enacted public-data standard content must be edited/discarded via the enactment procedure

**Business rules:**
- Approver identity is stored but displayed masked (ju**2), consistent with personal-data masking policy.
- Once a proposal is processed (approved/rejected) the decision controls are removed — only Cancel/back-to-list remains, i.e. decisions are immutable on this screen.
- Approval datetime is recorded separately from proposal registration datetime.
- Same DBA-review + logging workflow as domain proposals applies.

#### Extraction verification notes (adversarial second pass)

- **Gap:** All screens (PDF 57-74): every admin screen header shows an info (i) icon and a print icon at the top right of the breadcrumb bar; this recurring UI chrome is never mentioned in any of the 18 feature entries.
- **Gap:** PDF 60 (1-57 기간별 통계): the zero-count day in the table (2025-05-01, value 0) is rendered as plain text without an underline, i.e. only non-zero counts appear link-styled; the extraction instead lists '0' among the underlined-link examples, missing this zero-vs-nonzero rendering distinction.
- **Gap:** PDF 71 (1-68 표준 도메인사전 제안): row 62 shows 승인상태=승인대기 (pending) yet already has a populated 승인일 (2025-05-28), while PDF 73 (1-70) row 40 shows 미승인 with an empty 승인일 — the inconsistent population of the approval-date column across states is an observable data behavior the extraction does not capture.
- **Gap:** PDF 69 (1-66 메타용어 사전 점검): the single visible FAIL example (table ta_acs_cntrl_authrt, column authrt_sn, logical name 권한-일련번호, failing 오류1 = physical name matches but comment differs) is not called out; it concretely illustrates how a rule-1 violation looks and that the other three rules can simultaneously pass for the same column.
- **Correction:** PDF 59 (1-56 에러로그): the claim 'Error title is a link (opens error detail/stack trace)' overstates the source — the screenshot shows underlined exception titles, but the manual never states the link target; 'opens error detail/stack trace' is an unverified inference presented as fact.
- **Correction:** PDF 60 (1-57): businessRule 'Non-zero daily error counts are clickable links, implying drill-down navigation to the filtered error list for that day' — the manual (callout 4) only says per-day error counts are provided in table form; drill-down navigation is nowhere stated. Also the dataFields example '(e.g. 10, 9, 0)' wrongly includes 0 as an underlined link (the 0 row is not underlined).
- **Correction:** PDF 61 and 62 (1-58/1-59, callout 3): the manual's literal text for both tabs reads '에러 발생이 집중된 일자 확인이 가능하다' (identify the DAYS on which errors are concentrated — an apparent copy-paste of the period-tab wording); the extraction silently rewrote this to 'identify where errors are concentrated' without flagging the divergence from the source text, even though it flagged other manual typos.
- **Correction:** PDF 61 and 62 (1-58/1-59): businessRules assert per-type/per-URL counts are 'clickable, implying drill-down to the filtered error list' — the counts are underlined in the screenshots, but the manual states no drill-down behavior; this is inference stated as a rule.
- **Correction:** PDF 64 (1-61): 단위명 (Unit Name) is shown in the screenshot as just '원'; the extraction's '원/KRW' appends an editorial gloss not present in the source field value.
- **Correction:** PDF 69 (1-66): describing the per-rule SUCCESS/FAIL values as 'clickable links' is not supported by the manual — they appear as colored status text (SUCCESS blue, FAIL red) and no click behavior is documented.
- **Correction:** PDF 74 (1-71): businessRule 'Once a proposal is processed the decision controls are removed — only Cancel remains, i.e. decisions are immutable on this screen' is an unsupported inference — the manual's callouts 4-5 still describe selecting 승인/미승인 and performing 수정 제안 처리 on this screen, and never state that processed proposals become read-only; the screenshot merely happens to show a processed record with only a 취소 button.
- **Correction:** PDF 74 (1-71): the masked approver ID in the screenshot appears to be 'ju***2' (three asterisks), not 'ju**2' as extracted (low-confidence visual read; verify against the source image).
- **Correction:** PDF 68 (1-65, callout 8): the manual literally says '해당 단어에 대한 이력을 제공한다' (history of the WORD — a manual typo on the term screen); the extraction silently normalized it to 'history for the term' without flagging the source wording, inconsistent with its practice of flagging the 요어사전/단어사전사전 typos.


## PDF pages 75-92

_Section context: End of Section 1 통합관리시스템 (Integrated Management System, printed pages 74-84: Public Data Standardization Management sub-menus, Board Type Management, System Info, Site Help Management, Attachment File Board, Admin Publishing Guide); Section 2 divider page (printed 85); start of Section 2 데모 사이트 관리 (Demo Site Management, printed pages 86-91: Main visual/banner/popup, Web Content Management with versioning/diff, Workshop gallery board)._

### 1-72 표준 용어 사전 제안 (Standard Terminology Dictionary Proposal — list)

**Pages:** PDF 75 / printed 74 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 공공데이터 표준화 제안관리 > 표준 단어사전사전 제안 (Home > Integrated Management System > System Management > Public Data Standardization Management > Public Data Standardization Proposal Management > Standard Word/Term Dictionary Proposal)

List screen showing proposals (register / modify / delete) made against the standard terminology dictionary of the public-data standardization module. Each row shows the proposal type, standard source, revision round, term abbreviation, term name, domain, storage format, use flag, registrant, registration date, approval state and approval date. Clicking the abbreviation or term name opens the proposal detail (feature 1-73) for review/approval.

**Screen elements (numbered callouts):**
- 1. Provides search filters such as standard source (표준출처), revision round (개정차수), etc.
- 2. Provides information about the terminology dictionary (the proposal list grid).
- 3. Click the standard term abbreviation name (표준용어약어명) or standard term name (표준용어명) to view the proposal contents.

**Fields / columns / controls:**
- Filter bar: 표준출처 전체 (Standard source: All) dropdown
- Filter bar: 개정차수 전체 (Revision round: All) dropdown
- Filter bar: 전체 (All) dropdown (unlabeled third filter)
- Filter bar: page-size dropdown (value 10)
- Filter bar: 전체 (All) search-field selector dropdown
- Filter bar: free-text search input
- Buttons: 검색 (Search), 초기화 (Reset)
- Result count header: 총 20건 | 1/2 Page
- Table column: 번호 (No.)
- Table column: 제안구분 (Proposal type) — observed values: 등록제안 (registration proposal), 수정제안 (modification proposal), 삭제제안 (deletion proposal, shown in red)
- Table column: 표준출처 (Standard source) — observed values: 기관 (institution), 행정안전부 (Ministry of the Interior and Safety)
- Table column: 개정차수 (Revision round) — observed values: 기관생성 (institution-created), 7차 (7th round)
- Table column: 표준용어약어명 (Standard term abbreviation, hyperlink) — e.g. TEST_YN, TEST
- Table column: 표준용어명 (Standard term name, hyperlink) — e.g. 테스트여부, 시험여부, 테스트
- Table column: 도메인명 (Domain name) — e.g. 여부C2, 여부C1, 내용V2000
- Table column: 저장형식 (Storage format) — e.g. 'Y or N', '1자리 문자' (1-character text), '2000자리 이내 문자' (text within 2000 characters)
- Table column: 사용여부 (Use status) — e.g. 사용 (in use)
- Table column: 등록자 (Registrant) — e.g. 김준모
- Table column: 등록일 (Registration date)
- Table column: 승인상태 (Approval status) — observed values: 승인 (approved), 승인대기 (pending approval)
- Table column: 승인일 (Approval date)
- Pagination control (pages 1, 2)

**Business rules:**
- Default page size 10 (dropdown).
- Three proposal types exist: 등록제안 (register), 수정제안 (modify), 삭제제안 (delete); delete/modify proposals are rendered in red in the list.
- Approval workflow states: 승인대기 (pending approval) → 승인 (approved); approval date only populated after approval.
- Standard source distinguishes institution-created entries (기관/기관생성) from Ministry of Interior and Safety (행정안전부) standard entries with numbered revision rounds (e.g. 7차).

### 1-73 표준 용어 사전 제안(제안관리) (Standard Terminology Dictionary Proposal — Proposal Management / approval detail)

**Pages:** PDF 76 / printed 75 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 공공데이터 표준화 제안관리 > 표준 단어사전사전 제안 (Home > Integrated Management System > System Management > Public Data Standardization Management > Public Data Standardization Proposal Management > Standard Word/Term Dictionary Proposal)

Detail/approval screen for a single terminology-dictionary proposal. All fields show the change as 'old value > new value' (new value in red). The reviewer selects approve/not-approve in a dropdown and clicks the process button to apply the modification proposal. A warning notice reminds that modifying/deleting public-data standard content violates the standard and must follow the formal revision procedure.

**Screen elements (numbered callouts):**
- 1. Displays the classification value of the terminology dictionary proposal (등록/수정/폐기 — Register / Modify / Discard).
- 2. For a modification proposal, briefly displays the changed parts (old > new diff per field).
- 3. Shows the proposal date/time (등록일).
- 4. Select approval (승인) / non-approval (미승인) for the proposal, then perform modification-proposal processing.
- 5. Executes the modification-proposal processing (수정제안 처리 button).

**Fields / columns / controls:**
- 제안구분 (Proposal type): 수정제안 (modification proposal)
- 표준출처 (Standard source): shown as diff '기관 >'
- 개정차수 (Revision round): 기관생성
- 표준용어약어명 (Standard term abbreviation): TEST > TEST_YN
- 표준용어명 (Standard term name): 테스트 > 시험여부
- 도메인명 (Domain name): 내용V2000 > 여부C1
- 허용값 설명 (Allowed values description): 'Y : 예(예), N : 부(아니요)' (Y = yes, N = no)
- 저장유형명 (Storage type name): 2000자리 이내 문자 > 1자리 문자 (text within 2000 chars > 1-char text)
- 표시유형명 (Display type name): > Y or N
- 용어설명 (Term description): 1111 > 1
- 표준행정코드명 (Standard administrative code name): 222 > 2
- 소관기관명 (Competent agency name): 333 > 3
- 동의어목록명 (Synonym list name): 444 > 45
- 메모내용 (Memo content): 555 > 5
- 사용여부 (Use status): 미사용 > 사용 (not used > used)
- 등록일 (Registration date/time): 2025-03-17 15:59:55.0
- 승인여부 (Approval status): dropdown, shown value 승인대기 (pending approval)
- Buttons: 수정제안 처리 (Process modification proposal, green), 취소 (Cancel)

**Business rules:**
- Proposal classification values: 등록 (register) / 수정 (modify) / 폐기 (discard).
- Changed fields are displayed in 'old > new' format with the new value highlighted in red.
- Approval must be selected (approve / not approve) before executing the proposal processing action.
- On-screen warning: '공공데이터 표준 개정 내용은 수정 및 삭제 시 표준에 위배 됨으로 개정절차에 따라 수정 및 폐기 하시길 바랍니다.' — Because modifying/deleting public-data standard content violates the standard, modification and discard must follow the official revision procedure.
- Registration timestamp is stored to sub-second precision (e.g. 2025-03-17 15:59:55.0).

### 1-74 코드 명세서 (Code Specification / Code Inventory)

**Pages:** PDF 77 / printed 76 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 공공데이터 표준화 제안관리 > 코드 명세서 (Home > Integrated Management System > System Management > Public Data Standardization Management > Public Data Standardization Proposal Management > Code Specification)

Read-only inventory of all system common codes (UCMS 공통코드). Shows classification, division (code group name), code ID, parent code, code value, code name, English code name and registration date. Filterable by code classification and keyword; results can be exported to Excel. Explicitly described as a DBA-facing menu useful for audit (감리) responses.

**Screen elements (numbered callouts):**
- 1. Search filter setting by code classification (코드 분류) is possible.
- 2. Search is possible by entering a search term.
- 3. Shows the code classification name (분류) and code division name (구분).
- 4. Shows the code ID, code, and code name.
- 5. The search results can be downloaded to Excel. As a menu used by the DBA, it can be usefully used when responding to an audit (감리).

**Fields / columns / controls:**
- Filter bar: 전체 (All) classification dropdown
- Filter bar: page-size dropdown (value 10)
- Filter bar: 전체 (All) dropdown
- Filter bar: keyword search input
- Buttons: 검색 (Search), 초기화 (Reset), 전체엑셀다운로드 (Download all to Excel)
- Result count header: 총 186건 | 1/19 Page
- Table column: 번호 (No.)
- Table column: 분류 (Classification) — observed value: UCMS공통코드 (UCMS common code)
- Table column: 구분 (Division/code-group name) — observed values: 웹접근성검사사용코드 (web accessibility check use code), 승인코드 (approval code), 게시판항목타입코드 (board item type code)
- Table column: 코드ID (Code ID) — observed values: ACS_VLD_USE_CD, APRV_CD, BBS_ITEM_TYPE_CD
- Table column: 상위코드 (Parent code) — observed value: 0
- Table column: 코드 (Code) — observed values: AVU001, AVU002, AVU003, AVU004, Y, I, N, text, date, email
- Table column: 코드명 (Code name) — observed values: 사용안함 (not used), 새창알림 (new-window alert), DB저장 (save to DB), 새창알림+DB저장 (new-window alert + save to DB), 승인 (approved), 승인대기 (pending approval), 미승인 (not approved), text, date, email
- Table column: 코드 영문명 (Code English name)
- Table column: 등록일 (Registration date)
- Pagination: pages 1-10 with > and >> controls

**Business rules:**
- Default page size 10; total 186 codes across 19 pages at time of screenshot.
- Key code sets to replicate: APRV_CD (approval): Y=승인/approved, I=승인대기/pending, N=미승인/not approved. ACS_VLD_USE_CD (accessibility validation usage): AVU001=사용안함/off, AVU002=새창알림/popup alert, AVU003=DB저장/store to DB, AVU004=새창알림+DB저장/both. BBS_ITEM_TYPE_CD (board field item types): text, date, email.
- Parent code 0 denotes a root-level code (flat hierarchy support exists via 상위코드).
- Excel export covers the full filtered result set (전체엑셀다운로드); intended for DBA/audit use.

### 1-75 표준화 자가점검 결과 (Standardization Self-Check Results)

**Pages:** PDF 78 / printed 77 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 표준화 자가점검 결과 (Home > Integrated Management System > System Management > Public Data Standardization Management > Standardization Self-Check Results)

Monthly self-check that compares the physical database schema (meta) against the standard terminology/word dictionaries and reports violations across 8 error types. Rows are per check year-month per standard source with counts per error type; clicking a non-zero count opens a popup listing the detailed violating tables/columns, searchable and Excel-exportable. A '표준화 점검' button re-runs the check against the current schema state and writes results into the current check year-month.

**Screen elements (numbered callouts):**
- 1. Shows the standardization self-check results; the lower part shows the error contents for the self-check. (Top of screen lists the definitions of error types 오류1–오류8.)
- 2. Filter functions are provided by standard source (표준 출처), year/month, etc.
- 3. Provides the error counts per error type (per row).
- 4. When a specific error count is clicked, the detailed error content can be checked in a popup window like item 5.
- 5. Detailed error content confirmation; errors can be searched (popup grid with its own search).
- 6. The inspection contents for tables and columns can be checked; referring to the contents, improvement work can be performed.
- 7. The error contents (in the popup) can be downloaded to Excel.
- 8. The inspection contents (main grid) can be downloaded to Excel (전체엑셀다운로드 button).
- 9. Clicking 표준화 점검 (Standardization Check) re-runs the check on the current state and reflects it into the current check year-month. Red warning: contents from before that year-month are to be used for reference only (해당년월 이전의 내용은 참고용으로만 사용한다).

**Fields / columns / controls:**
- Header legend (error type definitions, partially truncated in screenshot): 오류1 = physical column name matches between standard term dictionary and meta (term dictionary) but logical name (comment) differs; 오류2 = logical name (comment) matches but column name differs; 오류3 = word in meta term-dictionary physical column name not present in word dictionary; 오류4 = word in meta physical table name not present in word dictionary; 오류5 = column name matches but logical name differs; 오류6 = logical name matches but column name differs; 오류7 = column same but domain differs; 오류8 = per-column domain-name lookup to find violating columns (general column domain violation query)
- Filter bar: 행정안전부 (standard source) dropdown, 2024년 (from-year), 월선택 (from-month), 2025년 (to-year), 월선택 (to-month), page-size dropdown (10)
- Result count header: 총 5건 | 1/1 Page
- Table column: 번호 (No.)
- Table column: 점검연월 (Check year-month) — e.g. 202505, 202504, 202503, 202502, 202501
- Table column: 표준출처 (Standard source) — e.g. 행정안전부
- Table columns: 오류1 … 오류8 (error counts; non-zero counts rendered as red hyperlinks, e.g. 425, 14, 8, 129, 33, 73, 27, 5, 1)
- Table column: 점검일 (Check timestamp) — e.g. 2025-05-28 11:21:07, 2025-04-01 10:44:10
- Buttons: 전체엑셀다운로드 (Download all to Excel), 표준화 점검 (Run standardization check, green)
- Popup (detail): grid of violating table/column rows with own search box, pagination, and Excel download button

**Business rules:**
- Eight fixed error types (오류1–오류8) comparing standard term dictionary / word dictionary vs. database meta (physical tables/columns/comments/domains).
- Only non-zero error counts are clickable links to the detail popup.
- Running 표준화 점검 re-checks the CURRENT schema state and overwrites/records into the current check year-month; historical months are reference-only snapshots (explicit red-text rule).
- Results are stored per year-month per standard source, enabling trend history (used by 1-76 statistics).
- Excel export available at both summary level and per-error detail level.

### 1-76 표준화 자가점검 통계 (Standardization Self-Check Statistics)

**Pages:** PDF 79 / printed 78 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 공공데이터 표준화 관리 > 표준화 자가점검 통계 (Home > Integrated Management System > System Management > Public Data Standardization Management > Standardization Self-Check Statistics)

Statistics dashboard over the monthly self-check results: a pie chart of error-type distribution, a line chart of monthly error trends per error type (오류1–오류8), and a table of counts per check year-month, filterable by standard source and period, with Excel export.

**Screen elements (numbered callouts):**
- 1. Standardization self-check statistics can be searched by standard source and by period (year/month range) — 통계보기 (View statistics) button executes.
- 2. When hovering the mouse over a year/month in item 3 (the line chart), you can see the change in the graph (hover tooltip/highlight).
- 3. Provides a graph in which the monthly error trend can be seen (line chart, x-axis = check months 202501–202505).
- 4. The error-type statistics per year-month can be viewed in table form.
- 5. The contents can be downloaded to Excel (엑셀 다운로드 button).

**Fields / columns / controls:**
- Filter bar: 행정안전부 (source) dropdown, 2024년 / 월선택 (from year/month), 2025년 / 월선택 (to year/month), 통계보기 (View statistics) button
- Chart legend: 오류1, 오류2, 오류3, 오류4, 오류5, 오류6, 오류7, 오류8
- Pie chart example values: 오류8: 129 (84.87%), 오류5: 14 (9.21%), 오류7: 8 (5.26%), 오류1: 1 (0.66%), 오류2/3/4/6: 0 (0%)
- Line chart: y-axis 0–500 scale, x-axis 202501…202505
- Table columns: 점검연월 (check year-month), 표준출처 (standard source), 오류1–오류8 (counts, non-zero as red links), 점검일 (check timestamp)
- Button: 엑셀 다운로드 (Excel download)

**Business rules:**
- Statistics are derived from the stored monthly self-check snapshots (feature 1-75); same 8 error types.
- Filterable by standard source and by year/month range; rendering is on-demand via 통계보기 button.
- Non-zero counts in the statistics table remain clickable (red links), consistent with 1-75.

### 1-77 게시판 유형 관리 (Board Type Management — list)

**Pages:** PDF 80 / printed 79 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 게시판 유형 관리 (Home > Integrated Management System > System Management > Board Type Management)

List of board (bulletin board) types. Each board type is identified by a system-assigned type code (PGxxxx) which maps to Service classes and JSP folders in the codebase. New board types are added here before they can be used when creating boards. Rows support edit and delete.

**Screen elements (numbered callouts):**
- 1. Managed by type code (유형코드) per board type; the code is managed in relation to the corresponding Service and JSP folders (the code binds a board type to its server-side Service and JSP template folder).
- 2. Board type name (유형명); when a specific board type needs to be added, add the type on this page first and then use it.
- 3. Modification (수정) and deletion (삭제) are possible per row.

**Fields / columns / controls:**
- Table column: 번호 (No.)
- Table column: 유형코드 (Type code, hyperlink) — observed values: PG0023, PG0021, PG0020, PG0018, PG0011, PG0009, PG0005, PG0017, PG0016, PG0015, PG0014, PG0013, PG0012, PG0010, PG0009…
- Table column: 유형명 (Type name, hyperlink) — observed values: 테스트, 테스트중입니다, 게시판속성테스트42, 게시판속성테스트3, 게시판속성테스트2, 게시판속성테스트, 테스트2 게시판, 확장형 게시판 (extended board), 도서관리 게시판 (book management board), 대관예약 테스트 게시판 (venue reservation test board), testtest111, 확장형 게시판 샘플 (extended board sample)
- Table column: 관리 (Manage) — buttons 수정 (Edit, green) and 삭제 (Delete, red) per row

**Business rules:**
- Board type codes follow pattern PG#### and are system-assigned (see 1-78).
- A board type must exist here before boards of that type can be created/used elsewhere.
- Type code is coupled to code artifacts (Service classes, JSP folders) — i.e., adding a type implies corresponding server-side template/service resources.

### 1-78 게시판 유형 관리(등록/수정) (Board Type Management — Register/Edit)

**Pages:** PDF 81 / printed 80 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 게시판 유형 관리 (Home > Integrated Management System > System Management > Board Type Management)

Registration/edit form for a board type. The type code is auto-assigned by the system; the physical table is selected from a dropdown (currently only tb_bbs); the admin enters a type name and a detail description limited by a character counter.

**Screen elements (numbered callouts):**
- 1. The board type code (게시판유형코드) is assigned by the system (read-only, e.g. PG000x).
- 2. The table used — currently the system operates with only one table, tb_bbs (테이블명 dropdown).
- 3. Enter and manage the board type name (게시판유형명) and the detailed contents (게시판유형상세).
- 4. Modification (수정) and deletion (삭제) are possible.

**Fields / columns / controls:**
- 게시판유형코드 (Board type code) — system-assigned, read-only (e.g. PG000…)
- *테이블명 (Table name) — required dropdown, value tb_bbs
- *게시판유형명 (Board type name) — required text input, e.g. 통합게시판 (integrated board)
- 게시판유형상세 (Board type detail) — textarea with remaining-characters counter showing '800 자 남음' (800 characters remaining)
- Buttons: 수정 (Modify, green), 삭제 (Delete, red), 목록 (List, blue)

**Business rules:**
- Board type code is system-generated and not user-editable.
- All board types are currently backed by a single physical table: tb_bbs (single-table board storage architecture).
- 게시판유형상세 detail field has a character limit with live remaining-count display (counter shows 800 remaining; i.e., max length 800 characters when empty).
- 테이블명 and 게시판유형명 are required fields (marked with *).

### 1-79 시스템정보 (System Information)

**Pages:** PDF 82 / printed 81 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 시스템 관리 > 시스템정보 (Home > Integrated Management System > System Management > System Management > System Information)

Read-only KEY/VALUE dump of the JVM/OS system environment variables of the running server, for diagnostics. Values cannot be changed or deleted from this screen and vary with OS and JVM version. The screenshot reveals the runtime stack (Java 17, Spring Boot 2.7.0, embedded Tomcat 9.0.63, etc.).

**Screen elements (numbered callouts):**
- 1. The KEY value of the system environment variable.
- 2. The system environment variable VALUE; changing or deleting is not possible, and values may differ depending on the OS and JVM version.

**Fields / columns / controls:**
- Table columns: KEY, VALUE
- Observed entries: java.specification.version = 17; sun.cpu.isalist = amd64; sun.jnu.encoding = MS949; java.class.path = long classpath revealing dependencies: lombok 1.18.24, quartz-scheduler 2.3.2, mchange-commons-java 0.2.15, jakarta APIs, tomcat-embed-jasper/core/el 9.0.63, tomcat-annotations-api 9.0.63, spring-boot 2.7.0 (spring-boot-configuration-processor 2.7.0, spring-boot-starter-web 2.7.0, spring-boot-starter-logging 2.7.0, spring-boot-starter-json 2.7.0, spring-boot-starter-tomcat 2.7.0), logback-classic/core 1.2.11, slf4j 1.7.x (jul-to-slf4j 1.7.36, log4j-to-slf4j 2.17.2), snakeyaml 1.30, jackson-datatype-jdk8/jsr310 2.13.3, jackson-module-parameter-names 2.13.3, jakarta.annotation-api 1.3.5, tomcat-embed-websocket 9.0.63, eclipse jdt ecj 3.18.0

**Business rules:**
- Screen is strictly read-only: environment variables cannot be modified or deleted via UI.
- Displayed values are runtime-dependent (OS and JVM version).
- Reference stack for the legacy system (useful for rebuild parity assessment): Java 17, Spring Boot 2.7.0, embedded Tomcat 9.0.63, Quartz 2.3.2 scheduler, Jackson 2.13.3, Logback 1.2.11, encoding MS949 on Windows (sun.jnu.encoding), amd64 architecture.

### 1-80 사이트 도움말관리 (Site Help Management)

**Pages:** PDF 83 / printed 82 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 사이트 도움말관리 (Home > Integrated Management System > System Management > Site Help Management)

Tree-based management of contextual help pages shown throughout the admin system (the ⓘ info button on each screen). Help entries are organized in a drag-and-drop tree; each entry has a number, name, WYSIWYG content, and is bound to either a program/service (matched by URL pattern) or a menu (matched by menu number). Service binding is the recommended method.

**Screen elements (numbered callouts):**
- 1. Help is managed in tree form; open-all/close-all (모두열기/모두닫기) of the whole help tree can be performed.
- 2. The selected help entry can be moved to top / up / down / bottom (최상위/상위/하위/최하위) using arrow buttons.
- 3. A help tree is provided; after selecting a help entry it can be dragged to a specific position (drag-and-drop reordering/reparenting).
- 4. Input form for entering the help title etc. (도움말명 field and content).
- 5. When a service is selected (서비스선택 + 프로그램 선택 button), the help is found by the program's URL pattern. On-screen note: '프로그램의 URL 패턴으로 도움말을 찾습니다.'
- 6. When a menu is selected (메뉴선택 + 메뉴 선택 / 메뉴 삭제 buttons), even if a service is also selected, the help is looked up by menu number. On-screen note: '메뉴를 선택하신 경우 서비스가 선택되어 있더라도 메뉴번호를 기준으로 도움말을 찾습니다.' Designating help via service selection is recommended whenever possible.
- 7. 최상위 추가 (Add top-level) is used to register a top-level help entry.
- 8. 하위신규 추가 (Add new child) is used to register a help entry under the currently selected help entry.

**Fields / columns / controls:**
- Left panel: 도움말 목록 (Help list) tree with 모두열기 (Open all) / 모두닫기 (Close all) buttons and 4 move-arrow buttons (top/up/down/bottom); example tree nodes: 도움말 > 홈페이지 관리자 (홈페이지 관리자 권한관리, 홈페이지 관리자 부서관리, 홈페이지 관리자 관리), 사이트 관리 (사이트 기본정보, 메뉴관리 > 사용자 메뉴관리/관리자 메뉴관리, 상단가이드 메뉴관리, 하단가이드 메뉴관리, 통합게시판관리, 배너관리, 팝업영역관리, 팝업관리, 금지어 관리, 관리자 메뉴관리), 홈페이지 관리 (웹콘텐츠관리, 통합위원 관리), 게시판관리 (포토형 게시판, 공지형 게시판, 답변형 게시판, FAQ형 게시판, 일반형 게시판), 홈페이지 통계 (홈페이지 접속통계, 첨부파일 다운로드 통계, 만족도 관리 통계)
- *도움말번호 (Help number) — required, e.g. 14
- *도움말명 (Help name) — required text, e.g. 홈페이지 관리자 권한관리
- 도움말내용 (Help content) — WYSIWYG rich-text editor (font/size/formatting toolbar; Editor/HTML/TEXT mode tabs)
- 메뉴선택 (Menu selection) — readonly input + 메뉴 선택 (Select menu) button + 메뉴 삭제 (Remove menu) button
- 서비스선택 (Service selection) — readonly input (e.g. 홈페이지 관리자 권한관리) + 프로그램 선택 (Select program) button
- *사용여부 (Use status) — required radio: 사용 (use) / 미사용 (not use)
- Buttons: 최상위 추가 (Add top-level, green), 하위신규 추가 (Add new child, green), 수정 (Modify), 삭제 (Delete)

**Business rules:**
- Help lookup precedence: if a menu is selected, help resolves by menu number even when a service is also selected; otherwise resolves by the program/service URL pattern. Service(URL-pattern)-based binding is the recommended practice.
- Tree supports unlimited hierarchy manipulation: add top-level, add child under selected node, drag-and-drop repositioning, and directional move buttons.
- 도움말번호, 도움말명, 사용여부 are required fields (*).

### 1-81 첨부파일 게시판 (Attachment File Board)

**Pages:** PDF 84 / printed 83 · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 첨부파일 게시판 (Home > Integrated Management System > System Management > Attachment File Board)

A dedicated board for hosting files/images that will be referenced from web content. Instead of insecure direct file links, files registered here get a managed download URL (fileDown.do with attachment ID, file sequence and fixed board ID) that is copied to the clipboard and pasted into web content, preventing security vulnerabilities. The list shows site, post title, per-file name + generated URL with a copy button, author, and date.

**Screen elements (numbered callouts):**
- 1. The attachment file board is used for file downloads or image links; it is superior in security to ordinary links (which are security-weak) and is used when management of attachment files is required. When an attachment is registered on this board and the following attachment download / image link is used in web content, security vulnerabilities and weaknesses can be prevented in advance. Attachment download link format: /{siteId}/cmmn/file/fileDown.do?atchFileId={파일ID}&fileSn={파일순번}&bbsId=B0000009
- 2. An attachment file search filter is provided (date range + field selector + keyword).
- 3. The attachment post title (제목) is displayed.
- 4. The attachment file name is displayed.
- 5. The generated attachment file URL is displayed.
- 6. 복사 (Copy) button copies the URL to the clipboard.
- 7. Author (작성자) information is provided.
- 8. [Manual text here erroneously repeats the help-management sentence 'Used to register help under the selected help item' — the actual UI element is the 글쓰기 (Write post) button used to register a new attachment post.]

**Fields / columns / controls:**
- Filter bar: date range pickers (연도-월-일 ~ 연도-월-일), field selector dropdown (제목/Title), keyword input, 검색 (Search) button
- Table column: 번호 (No.)
- Table column: 사이트 (Site) — observed values: bos, site1
- Table column: 제목 (Title, hyperlink) — e.g. 첨부파일 테스트, 파일테스트, 테스트, 테스트2, test, 0528테스트
- Table column: 링크주소 (Link address) — one row per file: file name (e.g. test.png, echarts (2).png, echarts (1).png, echarts.png, test (2).png, 코드명세서 2025 0515.xls, sample.txt, UCMS 웹접근성자가진단툴 20250528.xls) + generated URL (e.g. /bos/cmmn/file/fileDown.do?atchFileId=9b4af20…, //cmmn/file/fileDown.do?atchFileId=fdf6e9387d…, /site1/cmmn/file/fileDown.do?atchFileId=961c3…, /bos/cmmn/file/fileDown.do?atchFileId=5f9c04c…) + 복사 (Copy) button per file
- Table column: 작성자 (Author) — e.g. 강현아, 김승태
- Table column: 작성일 (Created date/time) — e.g. 2025-05-14 10:52
- Buttons: 글쓰기 (Write post, bottom right), pagination

**Business rules:**
- Canonical secure download URL pattern: /{siteId}/cmmn/file/fileDown.do?atchFileId={fileID}&fileSn={fileSequence}&bbsId=B0000009 — attachment board has the fixed bbsId B0000009.
- One post can hold multiple files; each file gets its own sequence number (fileSn) and its own URL row with a clipboard-copy button.
- Purpose/policy: web content must reference files via these managed download URLs rather than direct static links, to avoid security vulnerabilities (access goes through the file-download controller).
- Posts are scoped per site (사이트 column, e.g. bos = back-office site, site1 = user site).

### 1-82 관리자 퍼블리싱 가이드 (Administrator Publishing Guide)

**Pages:** PDF 85 / printed 84 · **Menu path:** 홈 > 관리자 퍼블리싱 가이드 (Home > Administrator Publishing Guide)

A static style/markup guide page for front-end publishing inside the admin system. It documents minimum font sizes, popup invocation conventions (js-pop / b-pop classes with data-size attribute handled by /static/commons/commons.js), button styles and other UI patterns, with sample code blocks and a right-hand shortcut menu that jumps to each topic. Accessible only from the fixed bottom guide menu.

**Screen elements (numbered callouts):**
- 1. Publishing guide title; the administrator publishing guide is fixed in the bottom guide menu (하단 가이드 메뉴) and is accessible ONLY through the bottom guide menu.
- 2. Provides coding styles (code samples, e.g. popup-invocation markup and the openPop JavaScript function).
- 3. Shortcut menu (바로가기): clicking a specific title moves to that content section (anchor navigation).

**Fields / columns / controls:**
- Documented topic: fontsize 최소 규격 (minimum font-size specification) — samples from fontsize 10px through 17px
- Documented topic: 팝업호출 (popup invocation) — rule: insert class 'js-pop' with attribute data-size="가로,세로" (width,height); script located at /static/commons/commons.js; for buttons with base button styles use class 'b-pop' instead of 'js-pop'; sample markup: <a class="js-pop" data-size="100,900" href="http://google.com">…</a>; sample JS: function openPop() binding click on '.js-pop, .b-pop', reading data('size'), splitting on ',', window.open with width/height/scrollbars
- Right-hand shortcut index (as legible in screenshot): fontsize 최소 규격, 팝업호출, 버튼 샘플 (button samples), 제목 (headings), 네비사이즈 % = 5단위 (nav size in 5% units), 전체안내 (general guidance), 아이디중복확인 (ID duplication check), 사업자등록번호 (business registration number), 셀렉트 (select), 오탈자안내 (typo guidance), 메일링폼 (mailing form), 첨부파일 (attachments), 아코디언 (accordion), 필수입력 (required input), 필수입력안내 (required-input guidance), 대금 (payment), 프로그램(페이지) 사이즈 안내 폰트, tabspanel(제이쿼리/jQuery), tabs(용그램), tabs+tabs(2리스트) dropdown-menu, tab 2depth, 금색/검색 (illegible), 몇자(글자수)안내 (illegible), 전체입력 (illegible), 콘텐츠 안내등 (some shortcut labels are low-resolution and approximate)
- Stamp on page: '이하 생략' (remainder omitted) — the manual truncates the rest of the guide page

**Business rules:**
- The publishing guide is a fixed entry of the bottom guide menu and has no other navigation path.
- Popup windows must be invoked via the standardized js-pop/b-pop + data-size convention handled by the shared /static/commons/commons.js script (no ad-hoc window.open in content).
- Minimum font sizes are standardized (10-17px scale displayed).

### 2-0 (section divider) 2. 데모 사이트 관리 (Section 2: Demo Site Management)

**Pages:** PDF 86 / printed 85 · **Menu path:** (none — section divider page)

Section divider page introducing Section 2 데모 사이트 관리 (Demo Site Management). No screen, callouts, or fields; U-CMS v3.0 branding and U&P logo only.

### 2-1 비주얼/배너/알림 영역(사업분야)/팝업 관리 (Visual / Banner / Notification Area (Business Field) / Popup Management)

**Pages:** PDF 87 / printed 86 · **Menu path:** 홈 > 데모 홈페이지 관리 > 메인 관리 > 비주얼 관리 외 (Home > Demo Homepage Management > Main Management > Visual Management and others)

Demo-site counterpart of the main-page component managers (main visual slider, banners, notification/business-field area, popups). The manual states these are identical to the administrator (integrated admin) versions and therefore omits detailed documentation; the screenshot shows the 비주얼 관리 (Visual Management) list as an example.

**Screen elements (numbered callouts):**
- 1. 비주얼/배너/알림 영역(사업분야)/팝업 관리 (Visual / Banner / Notification-area (business field) / Popup management) is identical to the administrator [system's equivalent screens] and is omitted from this manual.

**Fields / columns / controls:**
- Filter bar: 사용여부 (use status) dropdown, keyword input, 검색 (Search), 초기화 (Reset)
- Table column: 번호 (No.)
- Table column: 이미지 (Image thumbnail)
- Table column: 제목 (Title, hyperlink) — e.g. U-CMS v3.0 콘텐츠관리시스템, U-PICK, U-Talk, U-LINGO
- Table column: 비주얼URL(링크) (Visual URL/link) — e.g. https://ucms.unpi.co.kr/ucms/main/main.do
- Table column: 노출기간 (Exposure period) — e.g. 2025-06-23 ~ 2025-12-31
- Table column: 노출순서 (Exposure order) — 4 arrow buttons per row (move top/up/down/bottom)
- Table column: 사용 (Use) — status badge 사용중 (in use)
- Buttons: 등록 (Register), pagination

**Business rules:**
- Functionality is identical to the integrated-admin versions of visual/banner/notification-area/popup management (documented earlier in Section 1); the demo-site screens are per-site instances of the same programs.
- Visual items have exposure period (start~end dates), sort order controls, and a use/in-use status.

### 2-2 웹콘텐츠 관리 (Web Content Management — list)

**Pages:** PDF 88 / printed 87 · **Menu path:** 홈 > 데모 사이트 관리 > 웹콘텐츠관리 (Home > Demo Site Management > Web Content Management)

List of web-content pages of the demo site, keyed by menu number/menu name. Content items exist only for menus already created in Menu Management (on-screen notice). Shows responsible department/person when designated and the last modified date; clicking a menu name opens the content edit screen (2-3).

**Screen elements (numbered callouts):**
- 1. In web content management, search based on menu name (메뉴명) is possible.
- 2. Clicking the menu name navigates to the detail page.
- 3. When a responsible department (담당 부서) and responsible person (담당자) are designated, the designated person is displayed.

**Fields / columns / controls:**
- On-screen notice: '해당 프로그램은 사용자 메뉴에 대한 콘텐츠를 관리하는 곳입니다. 새로운 메뉴에 대한 항목은 메뉴에서 먼저 생성 후 사용이 가능합니다.' (This program manages the contents for user menus. Items for a new menu can be used only after first being created in the Menu [management].)
- Filter bar: 검색조건 (search condition) dropdown = 메뉴명, keyword input, 검색 (Search), 초기화 (Reset)
- Table column: NO
- Table column: 메뉴번호 (Menu number) — e.g. 300002, 300011, 300014, 300016, 300033, 300044, 300103, 300164, 300165, 300166
- Table column: 메뉴명 (Menu name, hyperlink) — e.g. 회사소개 (Company intro), 파트너 (Partner), U-LMS, System Integration, 이용약관 (Terms of use), 개인정보 처리방침 (Privacy policy), U-CMS, 연혁 (History), 채용정보 (Recruitment), 오시는길 (Directions)
- Table column: 담당자 부서 (Responsible department)
- Table column: 담당자 명 (Responsible person name) — e.g. 이정무, 이중보
- Table column: 최종수정일 (Last modified date) — e.g. 2025-07-01
- Pagination (pages 1, 2)

**Business rules:**
- Web content records are bound 1:1 to user menus; a menu must be created in Menu Management before its content item appears/can be used here.
- Responsible department/person assignment is optional; displayed only when designated.

### 2-3 웹콘텐츠 관리(수정) (Web Content Management — Edit, with version control)

**Pages:** PDF 89 / printed 88 · **Menu path:** 홈 > 데모 홈페이지 > 웹콘텐츠관리 (Home > Demo Homepage > Web Content Management)

Content edit screen with built-in version control. Shows the content's basic info (version number, name, physical JSP file path, content URL, last modifier), the source content in an editor, preview, secure file attachments with copyable URLs, version comparison, and a full version history where any previous version can be re-activated. Content changes are hash-compared against the database record: if the file changed externally, the old content is archived to history and the latest is displayed. Saving creates a new version rather than overwriting.

**Screen elements (numbered callouts):**
- 1. Provides the basic information of the web content (version no., content name, file path, URL, last modified/by).
- 2. Shows the contents of the web content. The history is recorded in the database, and hash values are compared — if the file's content has been changed [externally], that content is stored into history and then the latest content is shown.
- 3. Preview is possible via the 미리보기 (Preview) button.
- 4. Files used in the content can be attached and their URL copied for use inside the content. When used this way, security vulnerabilities are removed (same secure fileDown.do link mechanism as 1-81).
- 5. Function that compares versions of the content (콘텐츠버전 비교 button). See next page (2-4).
- 6. Provides the content history. It is possible to go back to a previous version.
- 7. To return to a specific version, click the 사용 (Use) button on that history row to revert to that version.
- 8. After editing the content, click the 새로운 버전으로 수정 (Modify as new version) button to create a new version.
- 9. 삭제 (Delete) deletes.
- 10. The 취소 (Cancel) button moves back to the list.

**Fields / columns / controls:**
- 콘텐츠 버전 관리 panel fields: 버전 번호 (Version number, e.g. Ver.76), 콘텐츠 명 (Content name, e.g. 회사소개>회사소개), 콘텐츠 파일 경로 (Content file path, e.g. /cts/ucms/000002.jsp), 내용/URL (Content URL, e.g. /ucms/main/content.do), 최종수정일(수정자) (Last modified (modifier), e.g. 2025-07-01 09:50:07.0(g****1) — modifier ID masked)
- *콘텐츠 (Content) — required source editor/textarea containing JSP/HTML markup
- 미리보기 (Preview) button (full-width dark bar)
- Attachment area: per-file rows (e.g. img01.png 168.24 KB, thumb.png 37.38 KB) each with checkbox, 다운로드 (Download) button, copy-URL button, X (remove) button, and a text/caption input; summary '2 File / 207.02 KB Size'
- Attachment area buttons: 파일선택 (Choose files), 선택 파일 삭제 (Delete selected files), 전체선택 (Select all)
- Attachment notes: allowed extensions 'hwp,xls,xlsx,doc,docx,ppt,pptx,pdf,txt,gif,png,jpg,jpeg'; guidance to copy the URL after selecting the file ('파일선택에서 첨부하시고, 이미지 정부(복사)…' approximate); note that up to 5 attachments maximum can be attached ('최대 5개 까지 첨부 가능합니다')
- Action buttons: 콘텐츠버전 비교 (Compare content versions, bottom-left), 새로운 버전으로 수정 (Modify as new version, blue), 삭제 (Delete, red), 취소 (Cancel, gray)
- 콘텐츠 History table columns: 버전번호 (Ver.76, Ver.75, Ver.74), 메뉴 명 (menu name, e.g. 회사소개 > 회사소개), 사용여부 (use status: 사용 highlighted red for active / 미사용 for inactive), 사용여부 변경 (change-use column with 사용 button on inactive rows), 수정자 (modifier, masked e.g. g****1), 수정일 (modified date, e.g. 2025-07-01, 2025-06-25)

**Business rules:**
- Version-control model: every save via 새로운 버전으로 수정 creates a new immutable version; exactly one history version is active (사용) at a time; any prior version can be re-activated with its 사용 button.
- Integrity check: a hash of the physical content file is compared with the DB record; if the file was changed outside the CMS, the changed content is captured into history automatically and the latest content is displayed.
- Content is physically stored as a JSP file under a per-site content path (e.g. /cts/ucms/000002.jsp) and served via a content controller URL (e.g. /ucms/main/content.do).
- Attachments must be referenced in the content via the copied managed URL (removes security vulnerabilities — same fileDown.do mechanism as the attachment file board).
- Attachment restrictions: allowed file types hwp, xls, xlsx, doc, docx, ppt, pptx, pdf, txt, gif, png, jpg, jpeg; maximum 5 attachments per content (per on-screen note).
- Modifier IDs are displayed masked (e.g. g****1) — personal-data masking rule.
- Version numbers are sequential (Ver.74, 75, 76 …).

### 2-4 웹콘텐츠 관리(버전 비교) (Web Content Management — Version Comparison; title printed as '비전 비교', a typo for 버전 비교)

**Pages:** PDF 90 / printed 89 · **Menu path:** 홈 > 데모 홈페이지 > 웹콘텐츠관리 (Home > Demo Homepage > Web Content Management)

Side-by-side diff tool for two content versions. A version-selection dialog lets the user pick original (원본) and modified (수정) versions; the two sources are displayed in parallel panels, and the comparison result can be viewed either as a split page or as a single combined page, with changed lines color-highlighted (red = removed/changed in original, green = added/changed in modified).

**Screen elements (numbered callouts):**
- 1. Version-selection button for content comparison (콘텐츠 버전 선택). Clicking this button shows a dialog box like item [2].
- 2. Select the versions to compare: choose the original content (원본버전) and the modified content (수정버전), then click the 적용 (Apply) button. (Dialog also has 닫기 (Close).)
- 3. Shows the contents of the current (original) content — left panel, e.g. 원본 콘텐츠 Ver.76 with 버전 / 최종수정(일)자 header and 다운로드 (Download) button.
- 4. Shows the contents of the modified content — right panel, e.g. 수정 콘텐츠 Ver.69 with its own header and 다운로드 (Download) button.
- 5. Clicking 비교 결과보기(분리 페이지) (View comparison result — split page) separates the page and compares the contents; changed parts are distinguished by color.
- 6. The comparison screen of the current version and the modified version (line-by-line diff grid: red highlight on original side, green highlight on modified side, with line numbers).
- 7. Selecting 비교 결과보기(한페이지) (View comparison result — one page) compares the versions within a single page.

**Fields / columns / controls:**
- Header: 콘텐츠 제목 (Content title)
- Left panel header: 원본 콘텐츠 — 버전 (Ver.76), 최종수정(일)자 (last modified date, e.g. 2025-07-01), source textarea, 다운로드 button
- Right panel header: 수정 콘텐츠 — 버전 (Ver.69), 최종수정(일)자 (e.g. 2025-06-25), source textarea, 다운로드 button
- 버전선택 dialog: 원본버전 dropdown (e.g. Ver.76), 수정버전 dropdown (e.g. Ver.69), 적용 (Apply) button, 닫기 (Close) button
- 콘텐츠 버전 비교결과 section: 비교결과보기(분리 페이지) and 비교결과보기(한페이지) buttons; diff grid labeled 원본 콘텐츠(Ver.76) vs 수정 콘텐츠(Ver.69) with numbered lines and red/green change highlighting

**Business rules:**
- Any two stored versions can be compared (original vs modified selection is free).
- Two diff render modes: split-page (side-by-side) and one-page (unified).
- Changed portions are color-coded (red for original-side differences, green for modified-side differences).
- Each compared version's raw source can be downloaded.

### 2-5 워크샵 (Workshop — gallery board list)

**Pages:** PDF 91 / printed 90 · **Menu path:** 홈 > 데모 홈페이지 > 회사 소개 > 워크샵 (Home > Demo Homepage > Company Introduction > Workshop); breadcrumb on screen: 데모 홈페이지 > 게시판관리 > 워크샵

Gallery-type board management screen for the demo site's Workshop menu. Posts are displayed as photo cards (thumbnail + title + registration datetime) in a grid. Supports period search by registration date, keyword search by field, reset, pagination and new-post registration.

**Screen elements (numbered callouts):**
- 1. Provides a period search function based on the registration date, and a keyword-based search function (field selector 구분 = 제목/title + keyword input + 검색 button).
- 2. Clicking the search reset button (초기화) resets the search.
- 3. The Workshop menu is a gallery-type board (갤러리형 게시판) in which photos are exposed.

**Fields / columns / controls:**
- Filter bar: registration-date range pickers (연도-월-일 ~ 연도-월-일), 구분 (field) dropdown = 제목, keyword input, 검색 (Search), 초기화 (Reset)
- Gallery card: thumbnail image, title, registration datetime — observed cards: 아이스크림 (2025-07-09 16:32), 2025년 (주)유엔피플 신년회 (2025-06-24 14:18), 2024년 (주)유엔피플 PM & 부서장 워크샵 (2025-06-24 14:15), 2023년 유엔피플 전직원 해외 워크샵 (2025-06-24 14:10)
- Buttons: 등록 (Register, bottom right), pagination (page 1)

**Business rules:**
- Board is of gallery type: list view is a card grid driven by each post's representative (thumbnail) image.
- Period search operates on registration date (등록일).

### 2-6 워크샵(등록/수정) (Workshop — Register/Edit)

**Pages:** PDF 92 / printed 91 · **Menu path:** 홈 > 데모 홈페이지 > 회사 소개 > 워크샵 (Home > Demo Homepage > Company Introduction > Workshop)

Post create/edit form for the gallery-type Workshop board. Includes category code selectors (when the board has category settings), title, author, WYSIWYG content, and a rich image-attachment manager offering representative-thumbnail selection, image rotation, ordering, per-image download / link-copy / delete, bulk select/delete, file-count and size totals, allowed-extension and recommended-image-size notices.

**Screen elements (numbered callouts):**
- 1. If a category setting exists (카테고리 설정), select the corresponding setting (category code dropdowns at top of form).
- 2. Enter the title (제목) and author (작성자).
- 3. Enter the contents (내용) — WYSIWYG editor.
- 4. Manage the attached images. Provides functions such as representative thumbnail (대표 썸네일) selection, image rotation (이미지 회전), image ordering (이미지 순서), link copy (링크복사), deletion (삭제), etc.

**Fields / columns / controls:**
- *카테고리구분 코드 선택 (Category classification code select) — required dropdown (screenshot value approx. '통합연관…', low resolution)
- *대표 페이지 표시여부/상세 코드 선택 (secondary code dropdown, screenshot value approx. '모두거…' — label partially illegible at screenshot resolution)
- *웹진 가이드 코드선택-type third dropdown (screenshot value approx. '수정제안' — label partially illegible)
- *제목 (Title) — required text input (sample value '900')
- *작성자 (Author) — required text input
- *내용 (Content) — required WYSIWYG rich-text editor with formatting toolbar
- 첨부파일 (Attachments) — per-image rows: checkbox, image preview, 대표 썸네일 (representative thumbnail) radio/label with filename and size (e.g. 1575896866992.jpg 105.03 KB, 1571897011763 - 복사본.jpg 57.08 KB, 1571897173930 - 복사본.jpg 89.03 KB), per-file buttons: rotate buttons (90도 rotation left/right), order move buttons (1칸위/1칸아래 — up/down), 다운로드 (Download), 링크복사 (Copy link), 삭제 (Delete)
- Attachment footer: 파일선택 (Choose files), 선택 파일 삭제 (Delete selected files), 전체선택 (Select all); totals '6 File / 264.04 KB Byte'
- Attachment notices: allowed upload extensions (jpg, jpeg, png / hwp, xls, xlsx, doc, docx, ppt, pptx, pdf, txt, zip — list partially legible in screenshot); recommended image size note '이미지 권장사이즈 : 828 x 458' (approximate reading); note about representative selection: '대표선택 에서 선택하거나, 이미지만 전부(대표)선택은 곤란해요' (approximate — pick representative via 대표선택)
- Form buttons: 수정 (Modify) / 등록 (Register), 삭제 (Delete), 취소 (Cancel)

**Business rules:**
- Category selectors appear only when the board is configured with category settings; they are required (*) when present.
- Exactly one attached image is designated the representative thumbnail (대표 썸네일) which drives the gallery card in the list view (2-5).
- Image management operations supported per attachment: rotate, reorder (affects display order), download, copy managed link URL, delete; plus bulk select-all / delete-selected.
- Upload restricted to an allowed extension whitelist (images jpg/jpeg/png plus document types hwp/xls/xlsx/doc/docx/ppt/pptx/pdf/txt/zip per the on-screen note; exact list partially legible).
- A recommended image size is displayed for gallery images (approx. 828 x 458 px per on-screen note).
- Attachment count/size totals are displayed live (e.g. 6 File / 264.04 KB); an on-screen note caps the number of attachments (wording matches the '최대 N개까지 첨부 가능' pattern seen on 2-3, count partially legible).

#### Extraction verification notes (adversarial second pass)

- **Gap:** PDF 83 / printed 82 (feature 1-80 사이트 도움말관리): the screenshot contains a 9th red callout marker placed on the 도움말내용 WYSIWYG editor area, but the manual's 화면 설명 legend only lists items 1-8. The extraction covers callouts 1-8 and lists the editor as a data field, but does not record the existence of marker 9 or flag the marker/legend mismatch — the same kind of manual defect it correctly flagged for item 8 on printed page 83 (1-81).
- **Gap:** PDF 87 / printed 86 (feature 2-1): the on-screen breadcrumb is '데모 홈페이지 > 메인관리 > 비주얼 관리', which differs from the manual's stated menu path '홈 > 데모 홈페이지 관리 > 메인 관리 > 비주얼 관리 외'. The extraction records the manual path but omits the differing breadcrumb (it did capture the analogous breadcrumb discrepancy for 2-5 on printed page 90), losing the hint that the demo-site menu label is '메인관리' with a '비주얼 관리' child.
- **Gap:** PDF 80 / printed 79 (feature 1-77): the visible list shows the type code PG0009 appearing on two different rows (row 6 '게시판속성테스트2' and the partially cut-off row 15 '테스트'), suggesting type codes in this list screen may not be unique / that the screenshot shows duplicate code rows. The extraction lists PG0009 in its observed-values string but does not surface this duplication, which is relevant to anyone replicating the data model.
- **Correction:** PDF 81 / printed 80 (feature 1-78): the business rule 'counter shows 800 remaining; i.e., max length 800 characters when empty' is an unsafe inference — in the screenshot the 게시판유형상세 textarea is NOT empty (it contains '통합게시판') while the counter still reads '800 자 남음'. The screenshot therefore does not establish the max length as exactly 800; it only shows a live remaining-character counter whose value at that moment was 800.
- **Correction:** PDF 76 / printed 75 (feature 1-73): the extraction presents 허용값 설명 as a plain field value "'Y : 예(예), N : 부(아니요)'", but on screen it is itself rendered as a diff with an empty old value ('> Y : 예(예), N : 부(아니요)' in red), i.e. a newly added value in the modification proposal — same old>new convention it correctly preserved for 표시유형명 ('> Y or N'). Presenting it without the '>' loses the fact that the field was previously empty.
- **Correction:** PDF 86 (Section 2 divider): the divider page carries no printed page number at all; describing it as 'printed 85' is an inference from the sequence (printed 84 precedes it, printed 86 follows), not something printed on the page. Minor, but the extraction states it as fact.
- **Correction:** PDF 75 / printed 74 (feature 1-72): internal imprecision in the dataFields — only 삭제제안 is annotated as 'shown in red', while the screenshot shows both 수정제안 and 삭제제안 rows rendered in red (등록제안 in normal dark text). The extraction's own businessRules entry states this correctly, so the dataFields annotation understates which proposal types are red-highlighted.


## PDF pages 93-110

_Section context: Section 2 데모 사이트 관리 (Demo Site Management), printed pages 85-109. This range covers: Customer Center boards (Notice list + register/edit), Survey Management (list, register/edit, question management, results view), User Menu Management with top/bottom guide, Privacy Policy Terms Management (list, register/edit, version management), and the UCMS Site Statistics suite (homepage access stats, attachment download stats, satisfaction stats, site access history, web accessibility auto-diagnosis results/statistics/itemized report). PDF page 110 = printed page 109, the final page of Section 2; Section 3 (개인정보 보호 시스템) begins at printed page 110 (PDF 111), outside this extraction range._

### 2-7 공지사항(이외 게시판 동일) — Notice Board (same for all other boards)

**Pages:** PDF 93 / printed 92 · **Menu path:** 홈 > 데모 홈페이지 > 고객센터 > 공지사항 (Home > Demo Homepage > Customer Center > Notice); on-screen breadcrumb: UCMS 사이트 관리 > 고객센터 > 공지사항

List screen for the Notice board in the demo site admin. It is a standard board list with a multi-criteria search bar (board category, classification code 2, classification code 3, date range, search field type, keyword), a results table with attachments and category columns, pagination, an Excel download of the list, and a Register button. The title explicitly states this screen pattern is identical for all other boards (보도자료/자료실/Q&A/FAQ etc.). A guidance banner at the top reads: 'This is the Notice board. Please use Q&A for inquiries.'

**Screen elements (numbered callouts):**
- 1. Provides a search function in a typical/general board format (category dropdowns, date range, field selector, keyword).
- 2. Provides information such as title, rank/number, and similar list information (each title is a hyperlink to the detail view).
- 3. Provides category information (board category, classification code 2, classification code 3 columns).

**Fields / columns / controls:**
- Search bar: 게시판 카테고리 선택 (Board category select, dropdown), 분류코드2 선택 (Classification code 2 select, dropdown), 분류코드3 선택 (Classification code 3 select, dropdown), registration date range (연도-월-일 ~ 연도-월-일, two date pickers), 구분 (Search field selector, dropdown, shown value: 제목/Title), keyword text input, 검색 (Search) button, 초기화 (Reset) button
- Table columns: 번호 (No.), 제목 (Title, hyperlink), 작성자 (Author), 조회수 (View count), 첨부파일 (Attached files — shown as file-type icons), 등록일 (Registration date), 게시판 카테고리 (Board category), 분류코드2 (Classification code 2), 분류코드3 (Classification code 3)
- Sample category values visible: 게시판 카테고리 = 행정안전부, 제외; 분류코드2 = 오류1, 오류2, 오류3; 분류코드3 = 등록제안, 수정제안
- Bottom-left button: 엑셀다운로드 (Excel download); bottom-right button: 등록 (Register); pagination (pages 1, 2)
- Header icons: ⓘ (info) and 🖨 (print)

**Business rules:**
- This list layout and behavior applies identically to all other boards ('이외 게시판 동일').
- Three-level categorization is supported per post: board category + classification code 2 + classification code 3; all three are searchable filters.
- Board header notice text is configurable and displayed above the search bar ('공지사항 게시판입니다. 문의사항은 Q&A를 이용해 주시기 바랍니다.').
- The full list can be exported to Excel.
- List is paginated (numeric pager).

### 2-8 공지사항(등록/수정: 이하 게시판 동일) — Notice Register/Edit (same for all boards below)

**Pages:** PDF 94 / printed 93 · **Menu path:** 홈 > 데모 홈페이지 > 고객센터 > 공지사항 (Home > Demo Homepage > Customer Center > Notice)

Register/edit form for a Notice post (pattern shared by all other boards). Contains notice-type radio, title, author, WYSIWYG content editor, three category dropdowns, and a drag-and-drop file attachment area with explicit file-type whitelist and attachment-count limit. Edit mode shows 수정 (Update), 삭제 (Delete), 취소 (Cancel) buttons.

**Screen elements (numbered callouts):**
- 1. In a typical board format, enter notice status (공지여부), title, author, etc.
- 2. The content section can be written using the (WYSIWYG) editor.
- 3. Specify values for the category settings (board category / classification code 2 / classification code 3).
- 4. Provides the attachment file upload function (file picker or drag-and-drop).

**Fields / columns / controls:**
- *공지구분 (Notice type, required): radio 공지 (Notice) / 일반 (General)
- *제목 (Title, required): text input
- *작성자 (Author, required): text input
- *내용 (Content, required): WYSIWYG editor with toolbar (font/style, size, bold/italic, color, alignment, lists, indentation, table, image/media insert, undo/redo, search) and mode tabs Editor / HTML / TEXT; resizable editor area
- 게시판 카테고리 선택 (Board category select): dropdown '선택하세요' (Please select)
- 분류코드2 선택 (Classification code 2 select): dropdown
- 분류코드3 선택 (Classification code 3 select): dropdown
- 첨부파일 (Attachment): drop zone text — '"파일선택"에서 첨부하거나, 여기로 첨부파일을 끌어놓으세요' (Attach via "File select" or drag files here); 파일선택 (File select) button, 전체선택 (Select all) checkbox/button, counter '0 File / 0 byte'
- Bottom guidance line (board footer notice): '공지사항 게시판입니다. 문의사항은 Q&A를 이용해 주시기 바랍니다.'
- Buttons: 수정 (Update), 삭제 (Delete), 취소 (Cancel)

**Business rules:**
- Allowed upload file types (whitelist printed in the drop zone): hwp, hwpx, xls, xlsx, doc, docx, ppt, pptx, pdf, txt, gif, png, jpg.
- Attachment limit notice: '첨부파일 최대 1개 까지 첨부 가능합니다' — a maximum of 1 attachment can be attached (per this board's configuration; the count is board-configurable).
- 공지구분=공지 pins/marks the post as an official notice vs 일반 (general post).
- Required fields marked with a red asterisk: 공지구분, 제목, 작성자, 내용.
- This register/edit form pattern is identical for all other boards ('이하 게시판 동일').
- Content supports three editing modes: rich-text Editor, raw HTML, and plain TEXT.

### 2-9 설문조사관리 — Survey Management (list)

**Pages:** PDF 95 / printed 94 · **Menu path:** 홈 > 데모 홈페이지 > 고객센터 > 설문조사관리 (Home > Demo Homepage > Customer Center > Survey Management)

List screen for surveys. Provides search by status and survey topic keyword, and a table showing each survey's topic, owning department, survey period (datetime range), participant count, question count (with inline add-question button), a result-view button, and registration date. Question editing is locked once a survey starts; results become viewable once a survey is in progress or later.

**Screen elements (numbered callouts):**
- 1. Provides a search function for surveys (status + topic keyword).
- 2. Provides the survey topic (hyperlink to the survey).
- 3. Provides the department in charge, the survey period, and the number of participants.
- 4. Question management (문제 관리) allows editing and registration ONLY before the survey starts; after the survey is in progress, changes are impossible.
- 5. For surveys at 'in progress' status or beyond, the survey results can be checked. Survey results can be viewed via a popup window (결과보기 button).

**Fields / columns / controls:**
- Search bar: 상태 (Status) dropdown (shown: 전체/All), 구분 (Field) dropdown (shown: 설문주제/Survey topic), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 설문주제 (Survey topic, hyperlink), 담당부서 (Department in charge), 조사기간 (Survey period, e.g. '2025-05-27 00:00 ~ 2025-05-29 00:00'), 참여인원 (Number of participants), 문제수(문제추가) (Question count with '+ N문제' add/manage button, e.g. '+ 0문제', '+ 4문제'), 설문결과(통계) (Survey results (statistics) — '결과보기' (View results) button per row), 등록일 (Registration date)
- Sample departments: SI사업본부, RnD연구소, 모바일팀, 경영지원본부
- Pagination (1, 2); 등록 (Register) button bottom-right

**Business rules:**
- Question add/edit is permitted only BEFORE the survey start datetime; once the survey is in progress, question changes are blocked (immutable questionnaire during collection).
- Result viewing is available only from 'in progress' status onward; results open in a popup window.
- Survey period is a datetime range (date + hour + minute precision).
- Each survey tracks a live participant count.

### 2-10 설문조사관리(등록/수정) — Survey Management (Register/Edit)

**Pages:** PDF 96 / printed 95 · **Menu path:** 홈 > 데모 홈페이지 > 고객센터 > 설문조사관리 (Home > Demo Homepage > Customer Center > Survey Management)

Register/edit form for a survey's master record: topic, datetime period, target audience (anyone vs members), result-visibility flag, owning department (with picker), contact phone number, and rich-text description. Registration date is displayed read-only. Edit mode shows Update/Delete/List buttons.

**Screen elements (numbered callouts):**
- 1. Enter the survey name (topic).
- 2. Enter the survey period.
- 3. Survey target selection: '아무나' (Anyone) allows even non-members to participate; '회원' (Members) means members can participate in the survey only after logging in.
- 4. Select whether the survey results are disclosed (public) or not.
- 5. Enter the survey department (via picker).
- 6. Enter the phone number of the person in charge of the survey.
- 7. Enter the survey content (rich-text).

**Fields / columns / controls:**
- *설문주제 (Survey topic, required): text input
- *조사기간 (Survey period, required): start date picker + hour select (00시) + minute select (00분) ~ end date picker + hour select + minute select
- *설문대상 (Survey target, required): radio 아무나 (Anyone) / 회원 (Members)
- *결과보기 공개여부 (Result view disclosure, required): radio 공개 (Public) / 비공개 (Private)
- *부서명 (Department name, required): text input + 선택 (Select) button (department picker popup) + 초기화 (Reset) button
- *전화번호 (Phone number, required): 3-part input — area-code dropdown (02) - middle (1111) - last (2222)
- *내용 (Content, required): WYSIWYG editor (Editor/HTML/TEXT modes)
- 등록일 (Registration date): read-only display (e.g. 2025-05-28 11:23)
- Buttons: 수정 (Update), 삭제 (Delete), 목록 (List)

**Business rules:**
- All form fields are required (marked with asterisk) except the read-only registration date.
- Target=아무나: anonymous/non-member participation allowed; Target=회원: participation requires login.
- 결과보기 공개여부 controls whether end users can see the results (공개) or results stay private (비공개).
- Survey period has minute-level precision (date + 시 + 분 selects).
- Department is chosen through a select/picker with a reset control (not free text only).
- Phone number is stored as three segments with a dropdown area code.

### 2-11 설문조사관리(문제 관리) — Survey Management (Question Management)

**Pages:** PDF 97 / printed 96 · **Menu path:** 홈 > 데모 홈페이지 > 고객센터 > 설문조사관리 (Home > Demo Homepage > Customer Center > Survey Management)

Question-management screen for one survey. Top section shows the survey's basic info (department/phone, registration date, target, participant count, period). Below is the list of already-registered questions, each with Edit/Delete buttons and its answer options rendered. A '문제추가' (Add question) button opens a modal supporting four question formats, required-answer flag, an 'other' free-text option, dynamic answer rows (add/delete), and a per-answer Skip function.

**Screen elements (numbered callouts):**
- 1. Shows the basic content of the survey (header info block).
- 2. When adding a question item, it can be added with the add button (+ 문제추가).
- 3. Provides the list of already-registered survey questions (each with 수정/Edit and 삭제/Delete buttons and rendered answer options).
- 4. The 'Add survey question' (설문조사 문제추가) modal window is invoked.
- 5. Question format selection: 단일선택 객관식 (single-select multiple choice) provides the Skip function for objective questions; 복수선택 객관식 (multi-select multiple choice) allows selecting several objective answers (duplicate/multiple selection possible).
- 6. Register the question text.
- 7. Select whether an answer is required (필수/선택) — choose 필수 when the question must be answered.
- 8. Add an 'other' (기타) item when the question needs an 'other' free-form option (+ 기타 내용추가 button).
- 9. Add or delete answer contents (per-row + 추가 / 삭제 buttons).
- 10. The Skip function can be attached (스킵 button per answer row). This function becomes usable in the edit screen only AFTER the question has been added.

**Fields / columns / controls:**
- Survey header block: 부서+전화 (e.g. SI사업본부 02-1111-2222), 등록일 (2025-05-28 11:23), 설문대상 (아무나), 참여인원 (0명), 조사기간 (2043-01-01 00:00 ~ 2044-12-31 00:00)
- Buttons on header: + 문제추가 (Add question), 목록 (List)
- 설문조사 문제 (Survey questions) section: per-question 수정 (Edit) / 삭제 (Delete) buttons, question text (e.g. '당신은 남성입니까?'), radio options (네 / 아니요)
- Modal 설문조사 문제추가 fields: 문항형식 (Question format) radio — 단일선택 객관식 (single-select objective) / 복수선택 객관식 (multi-select objective) / 단답형 주관식 (short-answer subjective) / 서술형 주관식 (essay/long-form subjective)
- 질문등록 (Question text): text input
- 필수답변여부 (Required answer): radio 필수 (Required) / 선택 (Optional), with helper note '문제에 대해 꼭 답변을 해야 할 경우에 선택합니다'
- 기타추가 (Other option): + 기타 내용추가 (Add other content) button
- 답변등록 (Answer registration): repeating rows of [answer text input] + [+ 추가 Add] [삭제 Delete] [스킵 Skip] buttons
- Modal buttons: 저장 (Save), 취소 (Cancel)

**Business rules:**
- Four question types: single-select objective, multi-select objective, short-answer subjective, essay subjective.
- Skip logic (branching) is available only for 단일선택 객관식 (single-select objective) questions.
- Multi-select objective questions permit multiple simultaneous answer selections.
- Required-answer flag (필수/선택) is per question; 필수 forces respondents to answer.
- An optional '기타' (other) free-text option can be appended to a question.
- Answer options are dynamically addable/deletable rows.
- The Skip assignment per answer can only be configured in the question EDIT screen after the question is first saved (not during initial creation).
- Per 2-9 rule: all of this question management is only possible before the survey starts.

### 2-12 설문조사관리(결과보기) — Survey Management (View Results)

**Pages:** PDF 98 / printed 97 · **Menu path:** 홈 > 데모 홈페이지 > 고객센터 > 설문조사관리 (Home > Demo Homepage > Customer Center > Survey Management)

Results screen for a survey. Shows the survey's basic info and description, then per-question results: response items with case counts, percentages, and horizontal bar graphs. Below is a pageable list of individual answers (name + answer) with adjustable page size. Two Excel exports are provided: survey results and participation status.

**Screen elements (numbered callouts):**
- 1. Shows the basic content of the survey (header block).
- 2. Shows the survey content (description).
- 3. Shows the survey results (per-question result blocks, labeled by question type, e.g. '1. 단일객관식').
- 4. Shows the count of survey results (사례수 — case counts per response item, e.g. 0/2, 1/2).
- 5. Shows the survey results as a bar graph (비율 % rendered as horizontal bars).
- 6. Adjust the paging of the answer-content list at the bottom and press 적용 (Apply) — page-number jump with 이동 (Go) and page-size dropdown (10).
- 7. Provides the answer contents as a list (이름/Name, 답변/Answer columns).
- 8. Downloads the survey results as Excel (설문조사결과 엑셀다운 button).
- 9. Downloads the survey participation status as Excel (설문조사참여현황 엑셀다운 button).

**Fields / columns / controls:**
- Header block: department + phone (RnD연구소 02-1111-2222), 등록일 (2025-05-09 10:35), 설문대상 (아무나), 참여인원 (12명), 조사기간 (2025-05-09 00:00 ~ 2025-05-22 00:00), survey description (설문 테스트)
- Buttons: 설문조사결과 엑셀다운 (Survey results Excel download), 설문조사참여현황 엑셀다운 (Participation status Excel download), 목록 (List)
- 설문결과 (Results) per question — question type badge (단일객관식), table columns: 응답항목 (Response item), 사례수(건) (Case count, shown as answered/total e.g. 1/2), 비율(%) (Ratio %), 그래프 (Graph, horizontal bar)
- Answer-list paging controls: current page input '/ total', 이동 (Go) button, page-size select (10), 적용 (Apply) button
- Answer list table columns: 이름 (Name), 답변 (Answer)

**Business rules:**
- Results are viewable only once the survey reaches 'in progress' status or beyond (from 2-9).
- Individual answer list page size defaults to 10 and is user-adjustable via dropdown + Apply.
- Two distinct Excel exports: aggregated results vs participant/participation roster.
- Case counts display as fraction of total respondents per item (e.g. 1/2 = 50%).

### 2-13 사용자 메뉴 관리, 상단/하단 가이드 — User Menu Management, Top/Bottom Guide

**Pages:** PDF 99 / printed 98 · **Menu path:** 홈 > 데모 홈페이지 > 사용자 메뉴 관리 (Home > Demo Homepage > User Menu Management); on-screen breadcrumb: 데모 홈페이지 > 사이트 > 사용자 메뉴관리

Menu management for the public (user-facing) demo site. Functionally identical to the administrator menu management described earlier in the manual, with two additions unique to user menus: assignment of a person-in-charge (담당자) per menu, and a menu-exposure condition (show always / only when logged in / only when logged out). Left pane is the site menu tree with ordering controls; right pane is the selected menu's property form including content-type selection and content version management.

**Screen elements (numbered callouts):**
- 1. The menu management function is identical to administrator menu management. However, user menu management additionally allows selecting a person in charge (담당자) and selecting the menu exposure type (메뉴노출구분).
- 2. By selecting a person in charge, the responsible department and person for that menu can be exposed (on the public page). However, in Site Management, '자료 관리자 사용여부' (data/content manager use flag) must be set to 사용 (Use) for this to display.
- 3. Via the menu exposure type, you can choose which menus are exposed when in a logged-in state and which menus are exposed in a non-logged-in state.
- (Note printed on page) * Other top/bottom guide (상단/하단 가이드) usage is the same as the administrator's, so it is omitted here.

**Fields / columns / controls:**
- Left pane 메뉴목록 (Menu list): 모두열기 (Expand all) / 모두닫기 (Collapse all) buttons, legend marker for '담당자 지정됨' (person-in-charge assigned), up/down/ordering arrow buttons; tree: 메뉴Root > 회사소개 (회사소개, 연혁, 해양정보, 워크샵, 파트너, 오시는 길, 하위메뉴2), 사업분야, 솔루션, 고객센터, 이용안내, 마이페이지, 회원, test
- Top action buttons: + 최상위신규메뉴추가 (Add new top-level menu), + 하위신규메뉴추가 (Add new sub-menu), 해당사이트 메뉴적용 (Apply menus to the site), plus a fourth green action button (small text in the screenshot; appears to be a menu copy/duplicate action)
- Form fields: 메뉴번호 (Menu number, read-only, e.g. 300002); *메뉴명 (Menu name, e.g. 회사소개); 메뉴URL (Menu URL, e.g. /ucms/main/contents.do?menuSn=300002)
- *콘텐츠 선택 (Content selection, required): radio 준비중 (In preparation) / 프로그램링크 (Program link) / 웹콘텐츠 (Web content) / 게시판 (Board) / 링크 (Link); button 콘텐츠 버전관리 (Content version management); note: '※ HTML 콘텐츠도, 콘텐츠 버전관리를 통해 수정 가능합니다' (HTML content can also be edited through content version management)
- 담당자 지정 (Person-in-charge assignment): 담당자 선택 (Select person) button + 초기화 (Reset) button; read-only fields 부서 (Department), 이름 (Name), 연락처 (Contact), 이메일 (Email)
- *새창열기 (Open in new window, required): radio 사용 (Use) / 미사용 (Not use)
- *메뉴노출구분 (Menu exposure type, required): radio 해당사항없음 (Not applicable / always) / 로그인 시 (When logged in) / 비 로그인 시 (When not logged in)
- *사용여부 (Use status, required): radio 사용 (Use) / 미사용 (Not use)
- Buttons: 수정 (Update), 삭제 (Delete)

**Business rules:**
- User menu management = admin menu management + two extra capabilities: per-menu person-in-charge and login-state-based menu exposure.
- Displaying the person-in-charge (department/contact) on the public site requires the site-level setting 자료 관리자 사용여부 = 사용 in Site Management; otherwise assignment has no visible effect.
- 메뉴노출구분 gates menu visibility by session state: N/A (always shown), shown only to logged-in users, or shown only to logged-out users.
- Menu content type is one of five: In-preparation placeholder, program link, web (HTML) content, board, or external/internal link.
- Web/HTML content attached to a menu is versioned and edited via 콘텐츠 버전관리 (content version management).
- Menus assigned a person-in-charge are flagged in the tree with a visual indicator.
- Menu tree ordering is controlled with move up/down arrow buttons; changes are pushed live via 해당사이트 메뉴적용 (apply to site).
- Top/bottom guide (상단/하단 가이드) management works exactly as in the administrator section (explicitly stated as omitted).

### 2-14 개인정보처리방침 약관관리 — Privacy Policy Terms Management (list)

**Pages:** PDF 100 / printed 99 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 관리 > 개인정보처리방침 약관관리 (Home > Demo Homepage > Site Management > Privacy Policy Terms Management); on-screen breadcrumb: UCMS 사이트 관리 > UCMS 사이트 관리 > 개인정보처리방침 약관관리

List screen managing sets of privacy/terms documents bound to specific menus (keyed by menu serial number). Each row (one menu, e.g. 회원/Member, 회원가입/Member signup) carries five terms-document slots — Terms of Use, collection/use/processing of personal info, third-party provision, unique identifying info collection, and other — each opened via a 약관상세 (Terms detail) button, plus a use/not-use toggle. Terms history is retained per the privacy protection policy.

**Screen elements (numbered callouts):**
- 1. This privacy policy terms management operates based on the menu serial number (메뉴 일련번호), and is used wherever terms management is needed — e.g. membership-signup terms such as Terms of Use, consent to personal-information collection, matters concerning the collection/use/processing of personal information, matters concerning third-party provision of personal information, matters concerning collection of unique identifying information, and other terms. In accordance with the personal-information protection policy, the history of each terms document is managed.
- 2. Manages the Terms of Use (이용약관) document and its history.
- 3. Manages the terms and history for matters concerning the collection, use, and processing of personal information (개인정보의 수집·이용 등 처리에 관한 사항).
- 4. Manages the terms and history for matters concerning the provision of personal information to third parties (개인정보의 제3자 제공에 관한 사항).
- 5. Manages the terms and history for matters concerning the collection of unique identifying information (고유식별정보 수집에 관한 사항).
- 6. Manages other terms (기타) and their history.
- 7. Use / not-use (사용/미사용) setting can be applied per row.

**Fields / columns / controls:**
- Table columns: 번호 (No.), 메뉴명 (Menu name, hyperlink — e.g. 회원, 회원가입), 메뉴번호 (Menu number — e.g. 300018, 300020), 이용약관 (Terms of Use — 약관상세 button), 개인정보의 수집·이용 등 처리에 관한 사항 (약관상세 button), 개인정보의 제3자 제공에 관한 사항 (약관상세 button), 고유식별정보 수집에 관한 사항 (약관상세 button), 기타 (Other — 약관상세 button), 사용 (Use — status toggle showing 미사용중 (not in use, grey w/ crossed-eye icon) or 사용중 (in use, dark w/ eye icon))
- Buttons: 등록 (Register), pagination

**Business rules:**
- Terms records are keyed to a menu serial number (메뉴 일련번호) — each terms set is bound to one site menu (e.g. the member-signup page).
- Five fixed terms categories per menu: Terms of Use; collection/use/processing; third-party provision; unique identifying info collection; other.
- Every terms document keeps a managed change history (required by privacy protection policy — supports evidencing which version a user consented to).
- Each menu's terms set can be toggled 사용중/미사용중 (in use / not in use).

### 2-15 개인정보처리방침 약관관리(등록/수정) — Privacy Policy Terms Management (Register/Edit: menu link binding)

**Pages:** PDF 101 / printed 100 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 관리 > 개인정보처리방침 약관관리 (Home > Demo Homepage > Site Management > Privacy Policy Terms Management)

First step of registering/editing a terms set: binding it to a menu. Because the feature operates on the menu serial number, the admin clicks 내부링크선택 (Internal link select) which opens a menu-tree popup; picking a menu auto-fills the link (?menuSn=...), menu name, and menu number fields. A use-status radio completes the record.

**Screen elements (numbered callouts):**
- 1. Because it operates based on the menu serial number, a menu must be selected. Clicking the internal-link-select (내부링크선택) button opens a popup window like [3], and when a menu is selected, the information in the lower fields is filled in automatically.
- 2. URL information etc. is displayed (the ?menuSn=300018 link value).
- 3. The popup window for selecting a menu is displayed (menu tree; instruction: '연결할 메뉴를 선택하세요' — Select the menu to link).

**Fields / columns / controls:**
- *메뉴링크선택 (Menu link select, required): 내부링크선택 (Internal link select) button + read-only link value field (e.g. ?menuSn=300018)
- *메뉴명 (Menu name, required, auto-filled): e.g. 회원
- *메뉴번호 (Menu number, required, auto-filled): e.g. 300018
- *사용 여부 (Use status, required): radio 사용 (Use) / 미사용 (Not use)
- Popup '메뉴 목록' (Menu list): Chrome popup at /bos/cmmn/cmmnMenu/listMenuPop.do?viewType=BODY&pSiteId=ucms&linkNo=0; menu tree Root > 회사소개, 사업분야, 솔루션, 고객센터, 이용안내, 마이페이지, 회원

**Business rules:**
- A terms set cannot exist without a bound menu; menu selection is mandatory and drives the record key (menuSn).
- Menu name, number, and link URL are populated automatically from the popup selection (not hand-typed).
- The menu picker popup is scoped to the site (pSiteId=ucms).

### 2-16 개인정보처리방침 약관관리(등록/수정) — Privacy Policy Terms Management (Register/Edit: content version management)

**Pages:** PDF 102 / printed 101 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 관리 > 개인정보처리방침 약관관리 (Home > Demo Homepage > Site Management > Privacy Policy Terms Management)

Version-managed editor for one terms document (최종 버전관리 / Latest version management). Shows menu name, current version number (e.g. Ver.2), title, screen-exposure flag, WYSIWYG content, and last-modified timestamp with modifier ID. Saving via '새로운 버전으로 수정' creates a NEW version rather than overwriting. A History table lists all versions with title, use status, a use-status-change action, and modification dates — this history can be queried to power a change-log on the public page.

**Screen elements (numbered callouts):**
- 1. A form is provided to manage the menu name and the terms title.
- 2. Exposure / non-exposure (노출/미노출) on screen can be set.
- 3. Terms content management (WYSIWYG editing of the terms body) is provided.
- 4. After editing, saving as a new version ('새로운 버전으로 수정') enables version management (each save creates a new version).
- 5. Provides the version history; when a change history needs to be shown on the user-facing page, query this history data and use it.

**Fields / columns / controls:**
- 최종 버전관리 (Latest version) form: 메뉴명 (Menu name, e.g. 회원), 버전 번호 (Version number, read-only, e.g. Ver.2), *제목 (Title, e.g. '회원 개인정보의 수집·이용 등 처리에 관한 사항'), *화면 노출 여부 (Screen exposure, required): radio 노출 (Expose) / 미노출 (Do not expose), *내용 (Content, required): WYSIWYG editor containing the terms text (제 1 조 (목적), 제 2 조 (정의) ...), 최종수정일(수정자) (Last modified date & modifier, e.g. 2025-05-13 13:57:41.0 (hakang))
- Buttons: 새로운 버전으로 수정 (Save as new version), 목록 (List)
- History table columns: 버전번호 (Version no.: Ver.2, Ver.1), 제목 (Title, hyperlink), 사용여부 (Use status: 사용/미사용), 사용여부 변경 (Use-status change action — inactive versions show a '사용' activate button), 수정일 (Modified date, e.g. 2025-05-13 13:57:41.0)

**Business rules:**
- Terms edits never overwrite in place — each save via '새로운 버전으로 수정' produces a new immutable version (Ver.1, Ver.2, ...).
- Exactly one version is marked 사용 (in use) at a time; older versions show 미사용 with a 사용여부 변경 action to reactivate.
- Last-modified timestamp records the modifier's user ID (audit trail).
- Screen exposure (노출/미노출) is set per document independent of version activation.
- Version history is the data source for public-facing 'previous versions / change history' displays — the manual instructs implementers to query this history table for the user page.

### 2-17 홈페이지 접속통계 — Homepage Access Statistics

**Pages:** PDF 103 / printed 102 · **Menu path:** 홈 > 데모 홈페이지 > UCMS 사이트 통계 > 홈페이지 접속통계 (Home > Demo Homepage > UCMS Site Statistics > Homepage Access Statistics)

Site traffic statistics dashboard with five tab dimensions: by period, by menu, by OS, by browser, and PC/mobile. The admin picks daily or monthly granularity and a date range, clicks 통계보기 (View statistics), and gets an area/line chart plus a data table of pageviews and visitors per date, exportable to Excel.

**Screen elements (numbered callouts):**
- 1. Provides homepage access statistics as period-based / per-menu / per-OS / per-browser / PC-vs-mobile statistics (five tabs).
- 2. Select daily (일간) / monthly (월간) and the period, then click 통계보기 (View statistics) to refresh the content below.
- 3. Provides the statistics for the selected period as a graph at the top.
- 4. Provides the statistics for the selected period as a table.
- 5. The statistics table for the selected period can be downloaded as Excel.

**Fields / columns / controls:**
- Tabs: 사이트 기간별 통계 (Site period statistics — active), 메뉴별 (By menu), 운영체제별 (By OS), 브라우저별 (By browser), PC/모바일별 (PC/Mobile)
- Filter: granularity dropdown 일간/월간 (Daily/Monthly), date range pickers (2025-04-28 ~ 2025-05-27), 통계보기 (View statistics) button
- Chart: 사이트 기간별 통계 area/line chart (multiple series — pageviews and visitors), with a chart export/download icon
- Table columns: 날짜 (Date), 페이지뷰(건) (Pageviews, count), 방문자수(명) (Visitors, persons)
- 엑셀 다운로드 (Excel download) button above the table

**Business rules:**
- Two granularities: daily and monthly, combined with an arbitrary date range.
- Five analysis dimensions (period / menu / OS / browser / device class) presented as tabs on one screen.
- Metrics tracked: pageviews (건) and unique visitors (명) per date bucket.
- Tabular data is exportable to Excel.

### 2-18 첨부파일 다운로드 통계 — Attachment File Download Statistics

**Pages:** PDF 104 / printed 103 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 통계 > 첨부파일 다운로드 통계 (Home > Demo Homepage > Site Statistics > Attachment Download Statistics)

Statistics screen ranking the most-downloaded attachment files. Provides daily/monthly period search, a horizontal bar chart of the TOP 20 downloaded files (labeled with menu path + file name and download counts), and a detail table (file name, menu path, post title, download count) exportable to Excel.

**Screen elements (numbered callouts):**
- 1. Provides a daily (일간) / monthly (월간) search function with date range.
- 2. Shows the TOP 20 downloaded attachment files as a (horizontal) bar graph.
- 3. Shows the data in table form.
- 4. The content of [3] can be downloaded as Excel.

**Fields / columns / controls:**
- Filter: granularity dropdown (월간 shown; 일간/월간), date range 2025-06-11 ~ 2025-07-10, 검색 (Search) button
- Chart '첨부파일 다운로드 TOP 20': horizontal bars, each labeled with menu path > file name (e.g. '> test / tirza-van-dijk-cNGUw-CEsp0-unsplash.jpg' = 14; '고객센터 > Q&A > echarts (3) - 복사본...(1).png' = 3; 'UCMS 사이트 관리 > 고객센터 > 공지사항 > s-1.jpg' = 1; '자료실 > ... 샘플1_첨부파일.png', 'imageSrc.png', '페이지인쇄하기 UCMS5588.pdf', 'sample.txt' etc.), legend '파일 다운로드'
- Table columns: 파일명 (File name), 메뉴경로 (Menu path, e.g. 고객센터 > Q&A), 글제목 (Post title, e.g. test), 다운로드수 (Download count, e.g. 14, 3)
- 엑셀 다운로드 (Excel download) button

**Business rules:**
- Ranking is capped at TOP 20 files for the chart.
- Download counting is tracked per individual attachment file, associated with its menu path and post title.
- Period search supports daily and monthly granularity.
- Table data exportable to Excel.

### 2-19 만족도 관리 통계 — Satisfaction Management Statistics

**Pages:** PDF 105 / printed 104 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 통계 > 만족도 관리 통계 (Home > Demo Homepage > Site Statistics > Satisfaction Management Statistics)

Statistics on the per-page satisfaction survey widget (5-point scale). Filters by period, department, and menu. Shows a table of respondent counts per rating level per menu with computed satisfaction percentage and totals, followed by a horizontal bar graph of average satisfaction per menu. Table exportable to Excel.

**Screen elements (numbered callouts):**
- 1. Provides a search function by period and by menu (and department).
- 2. Shows the satisfaction index per menu in table form.
- 3. Shows satisfaction as a bar graph.
- 4. The content of [2] can be downloaded as Excel.

**Fields / columns / controls:**
- Filter: 기간 (Period) date range 2025-06-11 ~ 2025-07-10, 부서 (Department) dropdown 전체 + secondary dropdown 전체, 메뉴 (Menu) dropdown 전체 + secondary dropdown 전체, 검색 (Search) button
- Table '메뉴별 만족도 참여자수' (Satisfaction participants per menu) columns: 메뉴명 (Menu name, hyperlink), 매우만족 (Very satisfied), 만족 (Satisfied), 보통 (Neutral), 불만족 (Dissatisfied), 매우불만족 (Very dissatisfied), 만족도 (Satisfaction %), 총계 (Total)
- Sample rows: U-LMS 100% (1 resp), System Integration 60%, 공지사항 90% (2 resp), 이용약관 20%, 내 게시물 60%, AI & BigDATA 60%, Mobile & Service 60%, 관리기능 소개 20%; footer 총계 row: 2/1/4/0/2, 62%, 9
- Chart '메뉴별 만족도 평균 그래프' (Average satisfaction per menu): horizontal bars on a 0-100 scale
- 엑셀 다운로드 (Excel download) button

**Business rules:**
- Satisfaction is a 5-level Likert scale: 매우만족 / 만족 / 보통 / 불만족 / 매우불만족 (very satisfied → very dissatisfied).
- A 만족도 (satisfaction %) score is computed per menu from the rating distribution (e.g. 1 '보통' response → 60%, suggesting a 20/40/60/80/100-point weighting averaged per menu).
- Aggregation dimensions: period + department + menu; results roll up to a grand-total row.
- Two cascading dropdowns each for department and menu filters (parent/child selection).
- Table exportable to Excel.

### 2-20 사이트 접속 이력 — Site Access History

**Pages:** PDF 106 / printed 105 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 통계 > 사이트 접속 이력 (Home > Demo Homepage > Site Statistics > Site Access History); on-screen breadcrumb: UCMS 사이트 관리 > UCMS 사이트 통계 > UCMS 사이트 접속 이력

Audit log of site access events. Filterable by date range and keyword (search-key dropdown, e.g. by ID). Each row records the accessor's name/ID (blank for anonymous), IP address, menu path visited, action type (list view, detail view, view, logout, etc.), the request URL, the event timestamp, and the associated login timestamp.

**Screen elements (numbered callouts):**
- 1. Provides access-period and search-keyword filter functions.
- 2. Shows the name, ID, and IP of the accessor.
- 3. Provides the accessed menu path.
- 4. Provides the access action and the URL.
- 5. Provides the access date/time and the login date/time.

**Fields / columns / controls:**
- Filter: date range 2025-05-21 ~ 2025-05-28, search-key dropdown (shown: 아이디/ID), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 이름 (Name, e.g. 김승태; '-' when anonymous), 아이디 (ID, e.g. kst116116), IP (e.g. 192.168.0.1, 0:0:0:0:0:0:0:1), 메뉴 (Menu path, e.g. 고객센터>공지사항, 고객센터>설문조사, 이용안내>이용약관, 회사소개>워크샵), 행동 (Action: 목록조회 list-view / 상세조회 detail-view / 조회 view / 로그아웃 logout), URL (e.g. /ucms/bbs/B0000001/list.do, /ucms/qestnr/srvy/view.do, /ucms/qestnr/answer/view.do, /ucms/main/contents.do, /ucms/member/user/logout.do), 일시 (Event date/time), 로그인일시 (Login date/time)
- Pagination: 1-10 with next (›) and last (») controls

**Business rules:**
- Every page access is logged with action type and raw URL — including anonymous (non-logged-in) traffic, where name/ID are blank.
- For authenticated events, the log links the event to the session's login timestamp (로그인일시), enabling per-session reconstruction.
- IPv4 and IPv6 addresses are both recorded.
- Action taxonomy observed: 목록조회 (list view), 상세조회 (detail view), 조회 (view), 로그아웃 (logout).

### 2-21 웹접근성 자동진단 결과 — Web Accessibility Auto-Diagnosis Results

**Pages:** PDF 107 / printed 106 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 통계 > 웹접근성 자동진단 > 웹접근성 자동진단 결과 (Home > Demo Homepage > Site Statistics > Web Accessibility Auto-Diagnosis > Results); on-screen breadcrumb: 통합 관리 시스템 > 시스템 관리 > 웹접근성 자가검진결과 > 웹접근성 자가검진 결과

List of automated web-accessibility self-inspection results, one row per inspected admin/site screen. A summary strip totals inspected screens, checked items, successes, errors, and error severity counts (critical/danger/warning). Each row shows per-screen counts, inspection timestamp, a 바로가기 (shortcut) button that jumps to the offending screen with the diagnosis overlay, and a delete button. An 항목별 점검 보고서 (itemized inspection report) button opens the aggregate report.

**Screen elements (numbered callouts):**
- 1. Filter search of inspection results is possible (two dropdowns + keyword).
- 2. The site / screen name is provided.
- 3. The total inspection count, success count, and error count are provided.
- 4. Error counts classified into 심각 (critical) / 위험 (danger) / 경고 (warning) are provided.
- 5. The inspection date/time is provided.
- 6. The 바로가기 (shortcut) button navigates to the corresponding screen.
- 7. Inspection results can be deleted.

**Fields / columns / controls:**
- Filter: dropdown 전체 (All) x2, keyword input, 검색 (Search)
- Summary: '총 168건 | 1/17 Page'; info strip: 검사 화면수: 168 (inspected screens), 검사 항목수: 8177 (checked items), 성공 항목수: 4473 (passed items), 에러 항목수: 384 (error items), 심각 건수: 48 (critical), 위험 건수: 77 (danger), 경고 건수: 259 (warning); button 항목별 점검 보고서 (Itemized inspection report)
- Table columns: 번호 (No.), 사이트 (Site, e.g. U-CMS 3.0), 화면명 (Screen name, e.g. 공지사항상세보기, 설문조사관리수정, 사이트 정보 관리수정, 사이트 정보 관리목록, 관리자 메뉴관리목록, 관리자메인화면, 설문조사관리목록, 공지사항목록), 전체건수 (Total items), 성공건수 (Success count), 에러건수 (Error count), 심각 (Critical), 위험 (Danger), 경고 (Warning), 검사일시 (Inspection datetime), 바로가기 (Shortcut button), 삭제 (Delete button)
- Pagination 1-10 with » ; 등록 (Register) button bottom-right

**Business rules:**
- Errors are triaged into three severity levels: 심각 (critical), 위험 (danger), 경고 (warning).
- Each inspection result is per-screen and timestamped; results can be individually deleted.
- List page size gives 10 rows/page (168 records = 17 pages).
- A '바로가기' deep-link opens the actual inspected screen with the diagnosis popup overlaid (see 2-22).

### 2-22 웹접근성 자동진단 결과(바로가기 결과 화면 이동) — Accessibility Diagnosis Results (Shortcut Navigation to the Inspected Screen)

**Pages:** PDF 108 / printed 107 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 통계 > 웹접근성 자동진단 > 웹접근성 자동진단 결과 (Home > Demo Homepage > Site Statistics > Web Accessibility Auto-Diagnosis > Results)

Behavior of the 바로가기 (shortcut) button: it navigates to the live screen where errors occurred (example: 고객센터 > 공지사항 detail page) and opens a validation popup titled 'U-CMS 접근성 자가검진: 4가지의 지침 오류가 발견 되었습니다' (4 guideline errors found). The popup lists each violated guideline grouped by severity badge with per-item help links and occurrence counts; clicking an item reveals, on the right, the target HTML source (대상 보기), the specific failure reasons (e.g. missing aria-label / aria-labelledby / title / placeholder attributes), and remediation guidance.

**Screen elements (numbered callouts):**
- 1. Navigates to the screen where the error occurred (the real page renders behind the popup).
- 2. Shows the information of the content area where the error occurred on that screen (highlighted region).
- 3. Shows the content of the errors (popup listing, e.g. '제목은 비어있지 않아야 합니다' (title must not be empty), 'form 엘리먼트는 반드시 레이블을 가져야 합니다' (form elements must have a label), '문서는 하나의 main 랜드마크를 가져야 합니다' (document must have one main landmark), '모든 페이지 콘텐츠는 랜드마크에 포함되어야 합니다' (all page content must be contained in landmarks)) — each with a 도움말 (help) link and occurrence count.
- 4. Classifies the error content by danger level (severity badges); clicking an item shows the detail content on the right, as in [5].
- 5. Presents the detailed content of the error and the improvement direction (e.g. target HTML '<textarea rows="7" cols="60" name="bsgIn" id="bsgIn" style="height:100px">' with reasons: aria-label attribute missing or empty; aria-labelledby missing or references non-existent element; title attribute missing; placeholder missing; form element lacks visible label / role="none" or role="presentation" guidance).

**Fields / columns / controls:**
- Popup window title: 'U-CMS 접근성 자가검진 : N가지의 지침 오류가 발견 되었습니다' (N guideline errors found); popup served from a validation URL (e.g. http://112.220.65.28:8123/validation...)
- Per-error row: severity badge, guideline description text, 도움말 (Help) link, occurrence count badge
- Detail pane: 대상 보기 (View target) with the offending HTML source snippet, failure-reason list, and remediation/improvement suggestions
- Background: actual site page (demo site left-nav: 고객센터 — 공지사항, 보도자료, 자료실, Q&A, FAQ, 설문조사관리) with the post-detail fields (구분, 제목, 작성자, 조회수, 내용, 등록일, 분류코드3, 분류코드2)

**Business rules:**
- Diagnosis is contextual: the validator overlays the real rendered screen, mapping each violation to its exact DOM element/content area.
- Errors are grouped and badged by severity level; each error type carries an occurrence count and a help/documentation link.
- Remediation guidance is generated per violation (which ARIA/label attributes to add, etc.).

### 2-23 웹접근성 자동진단 통계 — Web Accessibility Auto-Diagnosis Statistics

**Pages:** PDF 109 / printed 108 · **Menu path:** 홈 > 데모 홈페이지 > 사이트 통계 > 웹접근성 자동진단 > 웹접근성 자동진단 통계 (Home > Demo Homepage > Site Statistics > Web Accessibility Auto-Diagnosis > Statistics); on-screen breadcrumb: 통합 관리 시스템 > 시스템 관리 > 웹접근성 자가검진결과 > 웹접근성 자가검진 통계

Monthly trend statistics for the accessibility self-diagnosis. Admin selects a year/month range and clicks 통계보기; the screen renders a stacked trend chart across months and a table of monthly counts (inspected screens, inspections, errors, critical/danger/warning), with per-month access to the itemized inspection report and Excel export.

**Screen elements (numbered callouts):**
- 1. Provides a monthly search function (year/month range).
- 2. Provides a change-trend graph for the searched months.
- 3. Provides a table of error counts by month.
- 4. The table content can be downloaded as Excel.
- 5. Provides the itemized inspection report (항목별 점검 보고서) for the given month.

**Fields / columns / controls:**
- Filter: start year dropdown (2024년) + month dropdown (06월) ~ end year (2025년) + month (05월), 통계보기 (View statistics) button
- Chart '사이트 기간별 통계': stacked area/line trend by month (x-axis 202406 ... 202505), with chart download icon
- Table columns: 년월 (Year-month, e.g. 202406), 검사화면수 (Inspected screen count), 검사건수 (Inspection/item count), 에러건수 (Error count), 심각건수 (Critical count), 위험건수 (Danger count), 경고건수 (Warning count), 항목별 점검 보고서 (per-row '항목별 점검 보고서' report button)
- 엑셀 다운로드 (Excel download) button

**Business rules:**
- Aggregation granularity is monthly, over a selectable year/month range.
- Severity taxonomy consistent with 2-21: error total plus critical/danger/warning breakdown per month.
- Each month links to its own itemized inspection report (see next feature).
- Table exportable to Excel.

### 2-21 (as printed; out-of-sequence label — logically follows 2-23) 웹접근성 자동진단 통계(항목별 점검 보고서) — Accessibility Auto-Diagnosis Statistics (Itemized Inspection Report)

**Pages:** PDF 110 / printed 109 (final page of Section 2) · **Menu path:** 홈 > 통합 관리 시스템 > 시스템 관리 > 웹접근성 자가검진결과 > 웹접근성 자가검진 통계 (Home > Integrated Management System > System Management > Web Accessibility Self-Diagnosis Results > Statistics)

The itemized inspection report generated per month. Header states the diagnosis standard — 한국형 웹 콘텐츠 접근성 지침 2.2 (Korean Web Content Accessibility Guidelines / KWCAG 2.2) — and the diagnosis date. A radar chart summarizes major error categories (unit: pages) with legend 오류 (error) / 개선 (improve). Two tables follow: (a) the 33 KWCAG diagnostic items each with pass count, error count, improvement count, and compliance rate; (b) 'other' categories (ARIA-related, style/structure-related, frame-related, semantic-related) with the same columns. A footer 주의사항 (cautions) block notes the limits of automated diagnosis.

**Screen elements (numbered callouts):**
- 1. Provides the inspection content based on the Korean Web Content Accessibility Guidelines 2.2 (한국형 웹 콘텐츠 접근성 지침 2.2) as a graph (radar chart of major error categories, unit: page; legend: 오류/개선).
- 2. Provides the error counts per diagnostic item (main 33-item KWCAG table with 통과/오류/개선/준수율 columns).
- 3. Provides the other (기타) error counts per diagnostic item (기타 ARIA 관련, 기타 스타일 및 구조 관련, 기타 프레임 관련, 기타 시맨틱 관련).
- 4. Provides cautions (주의사항) in the footer area.

**Fields / columns / controls:**
- Report header: 진단 기준 (Diagnosis standard) = 한국형 웹 콘텐츠 접근성 지침 2.2; 진단일자 (Diagnosis date) = 2025년 02월 26일
- Radar chart '자동검사 결과 주요 오류 항목(단위:page)' with category axes (style & structure related, ARIA related, document structure, text content contrast, operability, etc.); legend: 오류 (error) / 개선 (improve)
- Main table 진단항목 columns: 진단항목 (Diagnostic item), 통과 (Pass count), 오류 (Errors), 개선 (Improvements), 준수율 (Compliance — 'Pass' or % e.g. 99.9%, 99.8%)
- Visible KWCAG 2.2 items include: 1.적절한 대체 텍스트 제공 (appropriate alt text), 2.자막 제공 (captions), 3.표의 구성 (table structure), 4.콘텐츠의 선형 구조 (linear content structure), 5.명확한 지시 사항 제공 (clear instructions), 6.색에 무관한 콘텐츠 인식 (color-independent recognition), 7.자동 재생 금지 (no autoplay), 8.텍스트 콘텐츠의 명도 대비 (text contrast — 3096 pass, 5 errors, 99.8%), 9.콘텐츠 간의 구분 (content separation), 10.키보드 사용 보장 (keyboard access), ... [middle omitted — '중간 생략' stamp on the page] ..., 20.고정된 참조 위치 정보 (fixed reference location info), 21.단일 포인터 입력 지원 (single-pointer input support), 22.포인터 입력 취소 (pointer input cancellation), 23.레이블과 네임 (label and name), 24.동작 기반 작동 (motion-based operation), 25.기본 언어 표시 (default language), 26.사용자 요구에 따른 실행 (execution on user request), 27.찾기 쉬운 도움 정보 (findable help), 28.오류 정정 (error correction), 29.레이블 제공 (label provision — 3095 pass, 6 errors, 99.8%), 30.접근 가능한 인증 (accessible authentication), 32.마크업 오류 방지 (markup error prevention), 33.웹 애플리케이션 접근성 준수 (web application accessibility compliance), 합계 (Total) row; most items show 3101 pass / 0 error / Pass
- Second table (기타/other) columns: 진단항목, 통과, 오류, 개선, 준수율 — rows: 기타 ARIA 관련 (3100, -, 1, 99.9%), 기타 스타일 및 구조 관련 (2806, -, 295, 90.4%), 기타 프레임 관련 (3101, -, 0, Pass), 기타 시맨틱 관련 (3101, -, 0, Pass)
- Footer 주의사항 (Cautions) + 'copyright UNP (주)유엔파인 All rights reserved.'

**Business rules:**
- The audit standard is KWCAG 2.2 (한국형 웹 콘텐츠 접근성 지침 2.2) with 33 diagnostic items plus 4 supplementary 'other' categories (ARIA / style & structure / frame / semantic).
- Per item, the report computes pass count, error count, improvement-recommended count, and a compliance rate; items with zero errors are marked 'Pass' instead of a percentage.
- Footer disclaimer: automated diagnosis can detect on average only ~57% of WCAG issues; items that cannot be diagnosed automatically require expert manual inspection, and compliance must ultimately be verified against relevant accessibility criteria/indicators.
- Note: this page is labeled '2-21)' in print although it follows 2-23 — the printed numbering is out of sequence; its menu path also references the 통합 관리 시스템 (Integrated Management System) tree, indicating the report component is shared between Section 1 and Section 2 contexts.

#### Extraction verification notes (adversarial second pass)

- **Gap:** PDF 102 (printed 101, 2-16): the History table has its own pagination control (a numeric pager visible below the version rows), absent from the extraction's description of the history section.
- **Gap:** PDF 99 (printed 98, 2-13): the menu-tree pane shows per-node checkboxes and a four-button reorder control (top/up/down/bottom style arrows), which the extraction compresses to generic 'up/down/ordering arrow buttons'. Minor UI detail.
- **Gap:** PDF 110 (printed 109): in the main KWCAG table, item 3 (표의 구성 / table structure) also shows an error row (3100 pass / 1 error / 99.9%), a third non-Pass item alongside items 8 and 29; the extraction only cites items 8 and 29 as having errors. Also item 31 exists but is occluded by the '중간 생략' stamp — worth an explicit note since the extraction's list jumps 30 -> 32 without comment.
- **Correction:** PDF 93 (printed 92, 2-7) callout 2 mistranslation: '제목, 등과 같은 정보 제공한다' means 'provides information such as title, etc.' — '등' is 'etc.', not 'rank/number'. The extraction's 'title, rank/number, and similar list information' invents a rank concept that is not in the text.
- **Correction:** PDF 106 (printed 105, 2-20): the business rule 'including anonymous (non-logged-in) traffic, where name/ID are blank' is an inference not stated in the manual, and the screenshot undercuts it — rows with '-' in the name/ID columns still carry 로그인일시 (login timestamp) values (e.g. row 1872: 로그인일시 2025-05-28 05:55:24), so blank name/ID does not demonstrably mean non-logged-in access. The callouts only say name/ID/IP and event/login datetimes are shown.
- **Correction:** PDF 99 (printed 98, 2-13): the guess that the fourth green toolbar button 'appears to be a menu copy/duplicate action' is unverified — the label is illegible in the screenshot and no copy/duplicate function is mentioned anywhere in the page's callout text. Should be flagged as unknown rather than characterized.
- **Correction:** PDF 100 (printed 99, 2-14) callout 1: the printed enumeration is '이용약관, 개인정보 수집동의, 개인정보의 제3자 제공에 관한 사항, 고유식별정보 수집에 관한 사항, 기타 약관' — i.e. the second item is 'consent to collection of personal information' (개인정보 수집동의). The extraction substituted the table-column heading '개인정보의 수집·이용 등 처리에 관한 사항' (collection/use/processing) into the callout-1 paraphrase, conflating callout text with column headers.
- **Correction:** PDF 102 (printed 101, 2-16): 'Exactly one version is marked 사용 (in use) at a time' is an inference from a two-row example (Ver.2 사용, Ver.1 미사용 with a reactivate button); the manual never states single-active-version enforcement.
- **Correction:** PDF 94 (printed 93, 2-8): the parenthetical 'the count is board-configurable' attached to the 1-attachment limit is not stated on this page — the page only shows the fixed notice '첨부파일 최대 1개 까지 첨부 가능합니다'. Configurability may be true from an earlier section but is unsupported within pages 93-110.


## PDF pages 111-122

_Section context: Section 3: 개인정보 보호 시스템 (Privacy Protection System), printed pages 110-122. PDF page 111 is the section divider page (printed 110, titled '3. 개인정보 보호시스템'). Features 3-1 through 3-11 follow on printed pages 111-121. Every page carries the document header table: 사업명 (Project name) = 'U-CMS v3.0(콘텐츠관리시스템) 개발', 시스템 명 (System name) = '콘텐츠관리 시스템', footer 'Copyright Reserved by UNP'. Every admin screen has an info (i) icon and a print icon at top right of the content area._

### 3-1 관리자/사용자 접속 이력 (Administrator/User Access History)

**Pages:** printed 111 (PDF 112) · **Menu path:** 홈 > 개인정보보호시스템 > 접속 이력 > 관리자 접속 이력 (Home > Privacy Protection System > Access History > Administrator Access History)

Audit-log screen listing every access an administrator (and, via the sibling menu, users) makes in the back office. Each row records who accessed (name, ID, IP), which menu path they touched, what action they performed (login, view, insert, update, delete), the exact request URL, the event timestamp, and the first-access (login session start) timestamp. The list is filterable by date range and keyword. The feature title covers both 관리자 접속 이력 (admin access history) and 사용자 접속 이력 (user access history) — same screen layout under two menu entries.

**Screen elements (numbered callouts):**
- 1. Provides access-period (date range) and search-keyword filter functions.
- 2. Shows the name, ID, and IP of the person who accessed.
- 3. Provides the menu Path that was accessed.
- 4. Provides the access action (행동) and the URL.
- 5. Provides the access date/time (일시) and the login date/time (최초 접속일시 / first access date-time).

**Fields / columns / controls:**
- Search bar: start date picker (e.g. 2025-05-21), end date picker (e.g. 2025-05-28), search-type dropdown (아이디 / ID shown selected), keyword text input, 검색 (Search) button, 초기화 (Reset) button
- Table columns: 번호 (No.), 이름 (Name), 아이디 (ID), IP, 메뉴 (Menu path), 행동 (Action), URL, 일시 (Date/time), 최초 접속일시 (First access date/time)
- Observed 행동 (action) values: 로그인 (Login), 메인조회 (Main view), 수정처리 (Update process), 삭제처리 (Delete process), 등록처리 (Insert/Register process)
- Observed 메뉴 values: 로그인, 메인, 'UCMS 사이트 관리>UCMS 사이트 관리>팝업관리' (full breadcrumb of the menu accessed)
- Observed URLs: /bos/member/admin/toLogin.do, /bos/main/main.do, /bos/gestnar/srvy/update.do, /bos/siteManage/popup/delete.do, /bos/siteManage/popup/update.do, /bos/siteManage/popup/insert.do
- Pagination bar: pages 1-10 with > (next block) and >> (last) controls
- Name/ID column values are masked (redacted) in the manual screenshot
- Info (i) and print icons at top right

**Business rules:**
- Every admin action is logged with action type + raw URL, so CRUD verbs (등록처리/수정처리/삭제처리/조회) must be classifiable per request.
- Both the per-event timestamp (일시) and the session's first access/login timestamp (최초 접속일시) are stored on each row, linking actions to the originating login session.
- Default search window in the screenshot is the last 7 days (2025-05-21 ~ 2025-05-28).
- Search supports selecting a search field (dropdown, e.g. 아이디/ID) plus free keyword; 초기화 resets filters.
- List is paginated (10 rows visible per page; numbered pagination with next/last block navigation).
- IP is captured for every event (internal IPs like 127.0.0.1 and 192.168.0.1 shown).
- Same screen exists twice: 관리자 접속 이력 (admin) and 사용자 접속 이력 (user) under 접속 이력.

### 3-2 권한 변경 이력 (Permission Change History)

**Pages:** printed 112 (PDF 113) · **Menu path:** 홈 > 개인정보보호시스템 > 권한설정 이력 > 권한 변경 이력 (Home > Privacy Protection System > Permission Setting History > Permission Change History)

Audit log of user-to-role (permission) assignment changes. Each row shows the affected user's identity (name, ID, email), which permission/role was involved, a summary of what changed, plus who made the change, when, and from which IP. Filterable by date range and keyword.

**Screen elements (numbered callouts):**
- 1. Shows the information of the user whose permission was changed (name, ID, email).
- 2. Shows the changed permission (권한명) and the change action performed (권한변경 요약 / change summary).
- 3. Provides the changer (변경자) and the change date/time (일시).
- 4. Provides the changer's IP (변경IP).

**Fields / columns / controls:**
- Search bar: start date (2025-05-21), end date (2025-05-28), search-type dropdown (아이디 / ID), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 이름 (Name), 아이디 (ID), 이메일주소 (Email address), 권한명 (Permission/role name), 권한변경 요약 (Permission change summary), 변경자 (Changer), 일시 (Date/time), 변경IP (Change IP)
- Observed 권한명 values: 테스트 권한 (Test permission), 어드민권한(공통권한) (Admin permission (common permission)), 0527TEST, ROLE_CC
- ID/email and 변경자 columns masked in screenshot; email domain unpl.co.kr visible
- Pagination: pages 1-3
- Info (i) and print icons top right

**Business rules:**
- Every grant/revoke of a role to a user is journaled with actor identity, timestamp, and actor IP — non-repudiation for permission administration.
- The affected user's email address is stored alongside name/ID in the audit record.
- Default date filter window is 7 days; keyword search field selectable via dropdown (e.g. 아이디).

### 3-3 메뉴 권한 설정 이력 (Menu Permission Setting History)

**Pages:** printed 113 (PDF 114) · **Menu path:** 홈 > 개인정보보호시스템 > 권한설정 이력 > 메뉴 권한 설정 이력 (Home > Privacy Protection System > Permission Setting History > Menu Permission Setting History)

Audit log of role-to-menu permission changes. For each change event it shows the role (permission code + name), the users currently belonging to that role, an itemized list of every menu whose access was added or removed in that event, and the changer's identity, IP, and timestamp. Searchable by period and permission name.

**Screen elements (numbered callouts):**
- 1. Provides search conditions by period (date range) and permission name (권한명).
- 2. Shows the permission code (권한코드) and permission name (권한명) concerned.
- 3. Provides the list of users belonging to (소속) that permission/role.
- 4. Provides the list of permissions granted to the role (itemized menu access-permission history for the event).
- 5. Provides information about the changer (변경자, 변경IP, 변경일시).

**Fields / columns / controls:**
- Search bar: start date (2025-05-21), end date (2025-05-28), search-type dropdown (권한명 / permission name), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 권한코드 (Permission code), 권한명 (Permission name), 소속 사용자 (Belonging users), 메뉴 접근권한 이력 (Menu access-permission history), 변경자 (Changer), 변경IP (Change IP), 변경일시 (Change date/time)
- Observed permission code/name: ROLE_TEST527 / 0527TEST
- 메뉴 접근권한 이력 cell contains a multi-line itemized list; each line = '<menu name>(메뉴 권한 등록)' [menu permission registered/added] or '<menu name>(메뉴 권한 제거)' [menu permission removed]
- Observed menu entries in history cells: 개인정보 관리계획(메뉴 권한 등록); 만족도관리통계(메뉴 권한 제거); 홈페이지 접속통계(메뉴 권한 제거); 첨부파일 다운로드 통계(메뉴 권한 제거); UCMS 사이트 접속 이력(메뉴 권한 제거); 배너관리(메뉴 권한 제거); 일정양력관리(메뉴 권한 제거); 팝업관리(메뉴 권한 제거); 웹콘텐츠관리(메뉴 권한 제거); 사용자 메뉴관리(메뉴 권한 제거); 상단가이드메뉴관리(메뉴 권한 제거); 하단가이드메뉴관리(메뉴 권한 제거); 비주얼관리(메뉴 권한 제거); 개인정보처리방침 약관관리(메뉴 권한 제거); 워크샵(메뉴 권한 제거); 공지사항(메뉴 권한 제거); 자료실(메뉴 권한 제거); Q&A(메뉴 권한 제거); FAQ(메뉴 권한 제거); 설문조사관리(메뉴 권한 제거); 보도자료(메뉴 권한 제거); 침해사고 대응지침(메뉴 권한 등록); 개인정보 조직도(메뉴 권한 등록); 관리자 접속 이력(메뉴 권한 제거); 사용자 접속 이력(메뉴 권한 제거); 권한 변경 이력(메뉴 권한 제거); 메뉴 권한 설정 이력(메뉴 권한 제거); 개인정보 메뉴권한 이력(메뉴 권한 제거); 보안 사례(메뉴 권한 제거)
- 소속 사용자 and 변경자 columns masked in screenshot (변경자 appears to be 김승태)
- Info (i) and print icons top right

**Business rules:**
- Each save of a role's menu-permission matrix is journaled as one event whose payload enumerates every added menu (메뉴 권한 등록) and every removed menu (메뉴 권한 제거) by menu display name.
- The snapshot also records which users belonged to the role at change time, so impact of the change is traceable to affected accounts.
- Changer identity, changer IP, and change timestamp are mandatory on every event.
- Search is by period plus permission name keyword (dropdown 권한명).

### 3-4 보안교육/보안사례/개인정보 관리계획/침해사고 대응지침 (Security Education / Security Cases / Personal-Information Management Plan / Incident Response Guidelines)

**Pages:** printed 114 (PDF 115) · **Menu path:** 홈 > 개인정보보호시스템 > 보안 교육 > 보안 교육 (Home > Privacy Protection System > Security Education > Security Education) — same board layout is reused for 보안사례, 개인정보 관리계획, and 침해사고 대응지침 menus

A standard board-style repository used for four privacy/security document libraries: security education materials, security case studies (casebook), the personal-information management plan, and incident-response guidelines. Administrators can search by date range, category, and keyword, view posts (title links open the post), and register new posts. One manual page documents all four menus because they share the same screen.

**Screen elements (numbered callouts):**
- 1. Provides search conditions and keyword search (date range, 구분/category dropdown, keyword).
- 2. Provides the casebook (collection of materials) for security education and security cases.

**Fields / columns / controls:**
- Search bar: start date placeholder 연도-월-일 (YYYY-MM-DD), end date placeholder 연도-월-일, 구분 (category) dropdown with 제목 (Title) shown, keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 제목 (Title — rendered as a hyperlink to the post), 작성자 (Author), 조회수 (View count), 등록일 (Registration date)
- 등록 (Register) button at bottom right for creating a new post
- Sample rows: '정보보안 프로젝트 정보보안교육' (author 이경훈, 4 views, 2025-06-27); '2025년 정보보호 공시 실무교육 자료 배포' (이경훈, 2 views, 2025-06-27); '2024 정보보호 공시 실무교육 자료' (이경훈, 9 views, 2025-06-27)
- Numbered pagination (page 1)
- Info (i) and print icons top right

**Business rules:**
- Four separate menus (보안교육, 보안사례, 개인정보 관리계획, 침해사고 대응지침) reuse this identical bulletin-board feature — implement once, mount four times.
- Posts track author, view count, and registration date; view count increments on read.
- Search dropdown 구분 selects the field to search (제목/Title shown); date range is optional (empty placeholders by default).
- Authorized users can create posts via the 등록 (Register) button.

### 3-5 해외 로그인 시도 이력/모바일 로그인 이력 (Overseas Login Attempt History / Mobile Login History)

**Pages:** printed 115 (PDF 116) · **Menu path:** 홈 > 개인정보보호시스템 > 로그인 이력 > 로그인 이력 > 해외 로그인시도 이력 (Home > Privacy Protection System > Login History > Login History > Overseas Login Attempt History) — sibling menu: 모바일 로그인 이력 (Mobile Login History), same layout

Filtered view of the login-history log showing only login attempts flagged as originating overseas (해외여부 = Y); the sibling mobile menu shows attempts flagged as mobile (모바일여부 = Y). Columns are identical to the general login history. The screenshot shows the empty state ('데이터가 없습니다.' — No data) with a roughly 6-month default date window.

**Screen elements (numbered callouts):**
- 1. Provides search conditions and keyword search (date range, search-field dropdown, keyword).
- 2. Provides the overseas login attempt history (the filtered log list).

**Fields / columns / controls:**
- Search bar: start date (2024-12-04), end date (2025-05-28), search-type dropdown (아이디 / ID), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 이름 (Name), 아이디 (ID), IP, 로그인 성공여부 (Login success status), 해외여부 (Overseas Y/N), 모바일여부 (Mobile Y/N), 일시 (Date/time)
- Empty-state message: '데이터가 없습니다.' (There is no data.)
- Info (i) and print icons top right

**Business rules:**
- Every login attempt is geo-classified (해외여부 Y/N flag) and device-classified (모바일여부 Y/N flag); this screen filters on the overseas flag, the sibling menu on the mobile flag.
- Default search window here is much longer than other logs (~6 months: 2024-12-04 ~ 2025-05-28) — presumably because overseas attempts are rare.
- A defined empty-state message must be shown when no rows match.

### 3-6 로그인 실패 이력 (Login Failure History)

**Pages:** printed 116 (PDF 117) · **Menu path:** 홈 > 개인정보보호시스템 > 로그인 이력 > 로그인 이력 > 로그인 실패 이력 (Home > Privacy Protection System > Login History > Login History > Login Failure History)

Filtered view of the login-history log showing only failed login attempts (로그인 성공여부 = 실패). Same column set as the general login history; searchable by date range and keyword.

**Screen elements (numbered callouts):**
- 1. Provides search conditions and keyword search.
- 2. Provides the login failure history (list of failed attempts).

**Fields / columns / controls:**
- Search bar: start date (2025-05-21), end date (2025-05-28), search-type dropdown (아이디 / ID), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 이름 (Name), 아이디 (ID), IP, 로그인 성공여부 (Login success status — value 실패/Failure), 해외여부 (Overseas Y/N), 모바일여부 (Mobile Y/N), 일시 (Date/time)
- Sample rows: 김승태 / kst116 / 192.168.0.1 / 실패 / N / N / 2025-05-29 13:05:49; (name partially covered) / ikinox / 127.0.0.1 / 실패 / N / N / 2025-05-27 18:00:40
- Numbered pagination (page 1)
- Info (i) and print icons top right

**Business rules:**
- Failed attempts are stored in the same log schema as successes (success flag = 실패) and surfaced through a dedicated pre-filtered menu.
- Note: unlike the general login-history screen (3-7), IDs are shown unmasked here in the screenshot (kst116, ikinox) — masking appears applied on the success/general list, not the failure list.
- Default date filter window is 7 days.

### 3-7 로그인 이력 (Login History)

**Pages:** printed 117 (PDF 118) · **Menu path:** 홈 > 개인정보보호시스템 > 로그인 이력 > 로그인 이력 > 로그인 이력 (Home > Privacy Protection System > Login History > Login History > Login History)

Master login-history screen showing all login events (success and failure, domestic and overseas, desktop and mobile) with masked user IDs. Searchable by date range and keyword, with pagination.

**Screen elements (numbered callouts):**
- 1. Provides search conditions and keyword search.
- 2. Shows the entire login history (all login events).

**Fields / columns / controls:**
- Search bar: start date (2025-07-02), end date (2025-07-09), search-type dropdown (아이디 / ID), keyword input, 검색 (Search), 초기화 (Reset)
- Table columns: 번호 (No.), 이름 (Name), 아이디 (ID — masked, e.g. ha***g, idto***100, gs***t4, gs***t3), IP, 로그인 성공여부 (Login success — value 성공/Success), 해외여부 (Overseas — N or blank), 모바일여부 (Mobile — N), 일시 (Date/time)
- Sample rows: 강현아 / ha***g / 192.168.0.1 / 성공 / N / N / 2025-07-09 17:23:55; 이경훈 / idto***100 / 192.168.0.1 / 성공 / (blank) / N / 2025-07-09 17:12:21; GS테스트4 / gs***t4 / 210.96.71.162 / 성공 / (blank) / N / 2025-07-09 16:59:46; GS테스트3 / gs***t3 / 210.96.71.162 / 성공 / ...
- Pagination: pages 1-10 with > and >> controls
- Info (i) and print icons top right

**Business rules:**
- User IDs are displayed partially masked with asterisks in the list (e.g. ha***g, gs***t4) — PII-masking rule for login IDs on this screen.
- 해외여부 column may be blank for some rows (not always N/Y) — tri-state display observed.
- Default date window is the last 7 days (2025-07-02 ~ 2025-07-09).
- Both internal (192.168.x.x, 127.0.0.1) and public (210.96.71.162) IPs are logged.
- This master list is the source for the pre-filtered views 3-5 (overseas/mobile) and 3-6 (failures).

### 3-8 개인정보 열람 이력 (Personal Information View/Access History)

**Pages:** printed 118 (PDF 119) · **Menu path:** 홈 > 개인정보보호시스템 > 개인정보 열람이력 > 개인정보 열람이력 (Home > Privacy Protection System > Personal Information View History > Personal Information View History)

Audit log recording every time an operator viewed or edited a member's personal information in the back office. Each row identifies the screen used, the data subject (member viewed), the exact URL, the view type and purpose category (inquiry vs modification), and the viewer with timestamp and IP. The list can be exported to Excel, but only after the operator enters a justification reason in a modal dialog — the download is blocked without it.

**Screen elements (numbered callouts):**
- 1. Provides search conditions and keyword search (date range, field dropdown, keyword).
- 2. Provides information about the member whose personal data was viewed (성명 / data subject).
- 3. Provides information on the view type (열람형태) and view purpose category (열람목적구분).
- 4. Provides information about the viewer (열람자).
- 5. Downloads the view (access) information — '개인정보 열람이력 엑셀다운' (Personal-info view history Excel download) button.
- 6. A reason for the personal-information Excel download must be entered before the download is possible (modal with 열람목적 input).

**Fields / columns / controls:**
- Search bar: start date (2025-05-21), end date (2025-05-28), search-type dropdown (아이디 / ID), keyword input, 검색 (Search), 초기화 (Reset)
- '개인정보 열람이력 엑셀다운' (Excel download) button to the right of the search bar
- Table columns: 번호 (No.), 화면명 (Screen name), 성명 (Name of data subject — masked), URL, 열람형태 (View type), 열람목적구분 (View purpose category), 열람자 (Viewer — masked), 열람일시 (View date/time), 열람IP (View IP)
- Observed 화면명 value: 통합회원관리 (Integrated Member Management)
- Observed 열람형태 value: 열람 (View)
- Observed 열람목적구분 values: 개인정보(조회) (Personal info - inquiry), 개인정보(수정) (Personal info - modification)
- Observed URLs: /bos/member/user/view.do?menuSn=100017&userId=kst116116; /bos/member/user/forUpdate.do?menuSn=100017&userId=kst116116&menuSn=100017&pageIndex=; /bos/member/user/view.do?userId=kst116116&menuSn=100017&pageIndex=1; /bos/member/user/forUpdate.do?menuSn=100017&userId=hakang00&menuSn=100017&pageIndex=1
- Excel-download modal: title '개인정보 열람 이력 엑셀다운로드' (Personal-info view history Excel download), required text field 열람목적 (view purpose/reason), 저장 (Save/confirm) button, Close button
- Info (i) and print icons top right

**Business rules:**
- Every read (조회) and every edit-form open (수정) of a member's personal data is logged automatically with screen name, full request URL (including target userId), viewer, timestamp, and IP.
- View purpose is categorized (개인정보(조회) vs 개인정보(수정)) so inquiry and modification access are distinguishable.
- Excel export of this log is gated: a download-reason (열람목적) must be entered in a modal before the file is produced — entering the reason is mandatory for the download to proceed (and the reason itself is presumably logged).
- Data-subject name and viewer columns are masked/redacted in the manual, indicating PII display protection.
- Default search window is 7 days.

### 3-9 비밀번호 작성 규칙 (Password Composition Rules)

**Pages:** printed 119 (PDF 120) · **Menu path:** 홈 > 개인정보보호시스템 > 개인정보 열람이력 > 비밀번호 작성규칙 (Home > Privacy Protection System > Personal Information View History > Password Composition Rules)

Management screen for the system's password-policy text. A list screen shows all registered rule versions with an in-use/not-in-use badge; the most recently registered rule that is marked 'in use' becomes the active password composition rule. A register/edit screen lets admins enter the rule text (multiline) and toggle its usage status.

**Screen elements (numbered callouts):**
- 1. Provides the password composition rules as a list screen. The most recent content that is in use (사용중) is applied as the active password composition rule.
- 2. The password composition rule can be managed via the register (등록) and edit (수정) screen.
- 3. The usage status (사용 여부) can be selected (use / not use).

**Fields / columns / controls:**
- List table columns: 번호 (No.), 비밀번호 규칙 (Password rule — text, title links to edit), 사용 (Use status badge: '사용중' In use with eye icon / '미사용중' Not in use with crossed-eye icon)
- 등록 (Register) button on list screen; numbered pagination (page 1)
- Edit/Register form fields: *비밀번호 규칙 (Password rule — required, multiline textarea), *사용 여부 (Usage status — required, radio buttons 사용 (Use) / 미사용 (Not use))
- Form buttons: 수정 (Update, green) and 취소 (Cancel)
- Sample rule text stored: '영문, 숫자, 특수문자 중 2종류 이상을 조합하여 최소 10자리 이상 또는 3종류 이상을 조합하여 최소 8자리 이상의 길이로 구성' / '연속적인 숫자나 생일, 전화번호 등 추측하기 쉬운 개인정보 및 아이디와 비슷한 비밀번호는 사용하지 않는 것을 권고' / '비밀번호에 유효기간을 설정하여 반기별 1회 이상 변경'
- Info (i) and print icons top right

**Business rules:**
- Rule-selection logic: among records flagged 사용중 (in use), the most recent one is the effective password composition rule for the system.
- Both form fields are required (marked with *): 비밀번호 규칙 text and 사용 여부.
- 사용 여부 is a binary radio: 사용 (use) / 미사용 (not use); list badges mirror this as 사용중 / 미사용중.
- The example policy content itself encodes the password requirements the system should enforce/display: (a) minimum 10 characters when combining 2+ of the 3 character classes (letters, digits, special characters), OR minimum 8 characters when combining 3+ classes; (b) recommendation against easily guessable values — sequential digits, birthdays, phone numbers, or passwords similar to the login ID; (c) passwords must have a validity period and be changed at least once per half-year (every 6 months).
- Multiple rule versions can coexist; deactivated versions are retained in the list (versioned history of the policy).

### 3-10 개인정보 조직도 (Personal Information Protection Organization Chart)

**Pages:** printed 120 (PDF 121) · **Menu path:** 홈 > 개인정보보호시스템 > 개인정보 관리계획 > 개인정보 조직도 (Home > Privacy Protection System > Personal Information Management Plan > Privacy Organization Chart)

Read-only screen that renders the organization's privacy-governance hierarchy as a tree diagram. The chart is generated automatically from the permission (role) management data rather than maintained by hand: privacy officer at top, deputy officer next, then the privacy protection team with individual privacy staff members underneath.

**Screen elements (numbered callouts):**
- 1. Automatically composes the personal-information organization chart based on the permission-management criteria (roles assigned in the system drive the chart).

**Fields / columns / controls:**
- Chart node level 1: 개인정보 책임자 (Chief Privacy Officer) — sub-label '교학부 총장 강태희' (position + name)
- Chart node level 2: 개인정보 부책임자 (Deputy Privacy Officer) — sub-label '정보통신센터장 개인정보보호관리자' (Head of Info-Comm Center, Privacy Protection Manager)
- Chart node level 3: 개인정보 보호팀 (Personal Information Protection Team) — parent of staff nodes
- Chart node level 4: four 개인정보 담당자 (Privacy Staff) boxes, each sub-labeled '관리적 보호조치 / 담당자 <name>' (Administrative protection measures / person in charge): 강태희, 이정무, 박창섭, 이경훈
- Info (i) and print icons top right; no search/filter controls (display-only screen)

**Business rules:**
- The chart is not manually edited on this screen — it is auto-generated from role/permission assignments (권한 관리 기준), so adding/removing a user from a privacy role updates the chart.
- Hierarchy model: 책임자 (officer) → 부책임자 (deputy) → 보호팀 (team) → N x 담당자 (staff), each node carrying a role title plus the assignee's position/name.
- Staff nodes carry a duty classification label (e.g. 관리적 보호조치 / administrative safeguards).

### 3-11 전체 메뉴 보기 (View All Menus / Full Menu Overlay)

**Pages:** printed 121 (PDF 122) · **Menu path:** 홈 > 전체 메뉴 보기 (Home > View All Menus)

Full-screen dark overlay sitemap of the entire admin application. The left rail lists the three top-level (1-depth) systems; selecting one loads its full sub-menu tree in the panel columns to the right. A close (X) button dismisses the overlay. The screenshot shows the tree for 통합 관리 시스템 (Integrated Management System) and serves as a de-facto sitemap of Section 1 menus.

**Screen elements (numbered callouts):**
- 1. Select a management-system (1-Depth) menu (left rail).
- 2. Provides the sub-menu information under the selected 1-Depth menu (multi-column tree).
- 3. The menu overlay can be closed with the close (X) button.

**Fields / columns / controls:**
- Left rail (1-depth systems): 통합 관리 시스템 (Integrated Management System — highlighted/selected), UCMS 사이트 관리 (UCMS Site Management), 개인정보보호시스템 (Privacy Protection System)
- Column '관리 시스템 설정' (Management System Settings): 관리자관리 (Administrator Management) → 관리자 권한관리 (Admin Permission Mgmt), 관리자 부서관리 (Admin Department Mgmt), 관리자 계정관리 (Admin Account Mgmt); 사이트 정보 관리 (Site Information Mgmt); 코드관리 (Code Mgmt) → 공통코드관리 (Common Code Mgmt), 공통분류코드관리 (Common Classification Code Mgmt); 게시판 관리 (Board Mgmt) → 통합 게시판 관리 (Integrated Board Mgmt), 커스텀 게시판 관리 (Custom Board Mgmt); 통합회원관리 (Integrated Member Mgmt); 비속어금지단어관리 (Profanity/Banned Word Mgmt); 회원 금지 단어 설정 (Member Forbidden Word Settings); 단축 URL 서비스 (Short URL Service)
- Column continues '시스템 관리' (System Management): 에러로그 (Error Log); 공공데이터 표준화 관리 (Public Data Standardization Mgmt) → 표준 도메인사전 (Standard Domain Dictionary), 표준 단어사전 (Standard Word Dictionary), 표준 용어사전 (Standard Terminology Dictionary — partially cut off)
- Column '관리자 사이트 관리' (Administrator Site Management): 관리자 메뉴관리 (Admin Menu Mgmt), 관리자 알림영역 (Admin Notification Area), 관리자 공지사항 (Admin Notices), 관리자 배너관리 (Admin Banner Mgmt), 상단가이드메뉴관리 (Top Guide Menu Mgmt), 하단가이드메뉴관리 (Bottom Guide Menu Mgmt)
- Column '관리시스템 통계' (Management System Statistics): 접속통계 (Access Statistics), 접속 이력 (Access History)
- Close (X) button at top right of overlay; U-CMS 3.0 logo at top left

**Business rules:**
- The admin IA is a 3-system, multi-depth menu tree; this overlay renders it dynamically (menus shown reflect the menu-management data, and presumably the operator's permissions).
- Selecting a 1-depth item swaps the right-hand tree; the currently selected system is visually highlighted (orange) in the left rail.
- The overlay is accessible globally from Home (홈 > 전체 메뉴 보기) and dismissed via the X button.

#### Extraction verification notes (adversarial second pass)

- **Gap:** Printed p.119 (PDF 120), 3-9: the screenshot contains FOUR numbered callout markers (1=list, 2=register/edit screen breadcrumb, 3=rule textarea, 4=사용 여부 radio row) but the 화면 설명 box defines only three descriptions. The extraction reproduces the three text descriptions without noting the marker/description mismatch (marker 4 has no corresponding description line).
- **Gap:** Printed p.119 (PDF 120), 3-9: in the list screenshot the record that actually carries the 사용중 (in-use) badge is row 2, titled 'test', while row 1 (the detailed password-composition rule) is flagged 미사용중; consistently, the edit form below shows the 미사용 radio pre-selected. The extraction quotes the detailed rule text but omits that in the example the active rule is the 'test' record and the detailed rule is deactivated.
- **Gap:** Printed p.111 (PDF 112), 3-1: the 메뉴 column is not limited to the three values listed ('로그인', '메인', 'UCMS 사이트 관리>...>팝업관리') — row 348 (the survey update event, URL /bos/gestnar/srvy/update.do) shows a different, non-breadcrumb menu label, so the menu cell can hold values outside the extraction's observed set.
- **Gap:** Printed p.112 (PDF 113), 3-2: the 권한변경 요약 (permission change summary) column is visibly EMPTY in all ten screenshot rows — a notable screenshot fact (the summary field may often be blank) that the extraction does not mention while presenting the column as populated audit content.
- **Gap:** Printed p.113 (PDF 114), 3-3: the last history block in the screenshot (관리자 접속 이력/사용자 접속 이력/권한 변경 이력/메뉴 권한 설정 이력/개인정보 메뉴권한 이력/보안 사례 removals) belongs to a separate, partially cut-off event row below row 6 (its 번호/변경자/변경일시 are not visible). The extraction merges it into one flat 'observed menu entries' list without noting it is a distinct truncated event, slightly misrepresenting rows 8/7/6 payloads.
- **Correction:** Internal inconsistency in sectionContext: it states Section 3 spans 'printed pages 110-122', but the extracted range only covers printed 110-121 (their own pageRange field says 'printed pages 110-121'). Nothing on printed 122 was read or extracted.
- **Correction:** 3-5 (printed p.115 / PDF 116): the businessRule asserting a '~6-month default search window ... presumably because overseas attempts are rare' is an inference, not a documented rule — the manual text never states any default date window for any of these screens. All 'default 7-day window' claims (3-1, 3-2, 3-6, 3-7, 3-8) are likewise read off screenshot values that may simply be operator-entered filter dates.
- **Correction:** 3-6 (printed p.116 / PDF 117): counter-evidence to the 'default 7-day window' claim — the top data row is dated 2025-05-29 13:05:49, which lies OUTSIDE the displayed 2025-05-21 ~ 2025-05-28 filter range, so the shown range demonstrably does not bound the results in the screenshot. The extraction repeats the sample row without noting this contradiction.
- **Correction:** 3-6 (printed p.116 / PDF 117): the businessRule 'masking appears applied on the success/general list, not the failure list' is an inference from two screenshots, not a documented rule; the difference could equally stem from the accounts shown (admin/test accounts) or manual-preparation inconsistency. It should not be carried forward as a system rule.
- **Correction:** 3-1 (printed p.111 / PDF 112): callout 5's Korean text says only '접속일시 및 로그인 일시를 제공합니다' (provides access datetime and login datetime). The extraction's gloss that 최초 접속일시 'link[s] actions to the originating login session' and that both timestamps are 'stored on each row' as session linkage is interpretation presented as a stated business rule — the manual makes no session-linkage claim.
- **Correction:** 3-4 (printed p.114 / PDF 115): the row-3 sample title transcription is doubtful — in the screenshot the first word appears to read '침동보안 프로젝트 정보보안교육' (or similar), not '정보보안 프로젝트 정보보안교육' as extracted. Low confidence at screenshot resolution, but the extracted reading should be re-verified rather than trusted.
- **Correction:** 3-11 (printed p.121 / PDF 122): the claim that 'the currently selected system is visually highlighted (orange) in the left rail' is imprecise — all three 1-depth items (통합 관리 시스템, UCMS 사이트 관리, 개인정보보호시스템) render in orange/gold text in the screenshot; selection is not clearly distinguished by the orange color alone.
