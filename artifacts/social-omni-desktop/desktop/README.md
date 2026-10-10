# Social Najhin

## Production installers

Customers should use the standalone Windows `.exe` or macOS `.dmg`/app `.zip`,
not the developer source ZIP described below. These installers include Electron,
Chromium and SQLite; customers do not need Node.js, Terminal or npm.
See [RELEASE.md](RELEASE.md) for publisher build commands, signing requirements
and the commercial release checklist. For source-only development, install
dependencies and run `npm run browser:install` before `npm start`.

## WhatsApp modules

- **WaFilter:** paste numbers or import TXT/CSV/XLSX (up to 200 unique entries). Include country codes; store Excel phone cells as text. Save the list, select a WhatsApp account, confirm authorization, then start live verification. Format-only results remain Unverified; only an actual WhatsApp composer enables Active/Valid export. CSV and Excel exports include active numbers only. Inactive can mean invalid format or an explicit platform rejection; inspect the reason. Network failures remain Unknown and stop the run.
- **WA-CRM:** add clients or import saved phone contacts. Notes, statuses, consent and observed text messages persist in local SQLite. Editing CRM consent also updates its linked contact. Deleting a thread retains that contact. Start the Inbox listener to observe the open conversation and readable unread entries in the rendered chat list. Virtualized, unrendered chats are not a guaranteed all-chat synchronization feed. Message times are local observation times, not original platform timestamps.
- **Auto-Reply / Chatbot:** manage exact/contains keyword rules, response templates (`{{name}}` supported), enabled state, 3–8-second delays and a 1–1440-minute cooldown per client/rule. Newest matching enabled rule wins. The Inbox listener imports initial unread history without replying. Only new messages in opted-in direct chats qualify; groups and media messages do not trigger replies. STOP/unsubscribe opts a client out.
- Other browser actions retain 5–12-second pacing. Random delays are rate controls, not ban protection. Challenges/restrictions, ambiguous sends, browser closure and unavailable selectors stop execution. Never automatically retry an Unconfirmed reply; inspect WhatsApp first.
- Stop the listener before starting other browser tasks or deleting a CRM thread. Changing consent or disabling a rule suppresses a queued response. The visible browser must stay open; this is not a macOS background service.
- Live platform controls require English WhatsApp controls and the locally downloaded application. The hosted preview supports local module CRUD/imports but cannot verify numbers or run chatbot replies on your computer.

Social Najhin is a local Electron social-management suite with approved browser
automation. Simulation execution is disabled; unsupported provider actions fail
explicitly rather than inventing successful outcomes.

## Live WhatsApp and Facebook execution

- WhatsApp opens the saved account profile for a manual QR scan, navigates to each reviewed phone number, fills the visible contenteditable composer, and clicks Send. Each browser action uses the configured random 5–12-second delay. A new outgoing message and server-accepted check are required for **Sent**; this does not prove recipient delivery.
- Explicit invalid-number responses are recorded as **Failed** and the next recipient is processed. Selector failures, verification challenges, or uncertain submissions stop the run. A submission without confirmation remains **Unconfirmed**; never retry it without reviewing WhatsApp.
- Facebook opens manual sign-in, types keywords in its search field, presses Enter, selects the Groups search filter, and saves observed group links/names for review. Select or paste permitted group URLs before approving membership requests or text posts.
- **Request membership only** does not post. Group joins record observed **Requested**, **Joined**, or **Needs review** states; questions and administrator approval remain manual. Posting fills the group composer, clicks Post, and requires a newly visible matching post before recording **Posted**.
- Native IPC checks the trusted app sender; the local API checks accounts, action/platform matching, consent and group URLs. Progress events update the console and recipient/group tables, with one-second saved-state polling as a fallback. Outcomes and errors persist in the existing local SQLite workspace.
- Real Chromium tests use controlled platform pages; the email network test uses a local authenticated TLS SMTP server. These do not verify native macOS/Electron, real account authorization, or real-platform delivery.

## Run on macOS (iMac)

1. Install Node.js 24 LTS for macOS from https://nodejs.org. Choose Apple Silicon
   for an M-series iMac, or x64 for an Intel iMac. npm is included.
2. Download `social-najhin-desktop.zip` and double-click it in Finder to unzip.
3. Open Terminal (Applications → Utilities → Terminal). Enter `cd ` (with a
   trailing space), drag the extracted `social-najhin-desktop` folder from Finder
   into Terminal, and press Return. This is the folder containing `package.json`,
   `main.js`, and `preload.js`, not the nested `source` folder.
4. Run these commands, one at a time:

```sh
npm install
npm start
```

Electron opens a native application window. It is not a signed installer.
The Electron runtime cannot be launched or tested through the browser preview.
The first install needs internet access to download Electron, Playwright Chromium,
and dependencies (the Chromium download runs automatically during npm install);
afterward `npm start` opens the local application. No Replit connection or separate
backend command is needed. The interface is already built; the local backend
starts automatically. Close the application window to quit.

If Terminal says `npm: command not found`, install Node.js and reopen Terminal.
If macOS asks for permission to open Electron, review it in System Settings →
Privacy & Security. Do not disable macOS security protections.

## Package contents

## New advanced modules

The main screen includes the interactive Social Najhin node network. Its nodes
open the existing WhatsApp tools and the three new module pages:

- **B2B & Data Extractors:** visible-browser Google Maps business research and
  public HTTPS business-site extraction. Names, phones, addresses and websites
  come from observed listings/site facts; unavailable fields remain blank.
- **Telegram & Facebook:** Telegram personal-account sign-in, consented direct
  messages, member-directory exports from groups/channels you administer, and
  authorized channel/group posting. Facebook supports group search, membership
  requests and approved group posts. Instagram supports an image on your own
  feed; Instagram does not have Facebook-style searchable groups.
- **Email Marketing:** your SMTP server (465/TLS or 587/required STARTTLS),
  plain-text bulk campaigns with `{{name}}` / `{{email}}` substitutions,
  and address-format/mail-domain checks. CSV imports use an Email header or
  a single column. Invalid verification rows are omitted from clean exports;
  inconclusive rows remain explicitly Unknown.

Results export directly to CSV or Excel. Telegram member exports include user
ID and username columns, not hidden phone/email data or presumed consent.

### Setup and honest outcomes

### Language and built-in guide / اللغة ودليل الاستخدام

Use the **AR / EN** switch in the app header to change the display language
immediately. Arabic uses right-to-left layout; English uses left-to-right.
The choice is saved in local SQLite and restored when the application opens.
Existing messages, contact names, campaign contents and API status values are
not rewritten when the language changes.

Open **Guide / Help** from the dashboard network or sidebar for the built-in
WhatsApp QR setup, extraction/export, WaFilter/WA-CRM and safety instructions.

استخدم مفتاح **AR / EN** في أعلى التطبيق لتغيير اللغة مباشرةً. تظهر الواجهة
العربية من اليمين إلى اليسار، والإنجليزية من اليسار إلى اليمين. يُحفظ اختيار
اللغة في قاعدة SQLite المحلية، ولا تتغير الرسائل أو أسماء العملاء أو محتوى
الحملات عند تبديل اللغة.

افتح **دليل الاستخدام والإرشادات** من لوحة شبكة الوحدات أو القائمة الجانبية
للاطلاع على خطوات اتصال واتساب برمز QR، واستخراج البيانات وتصديرها، وفحص
الأرقام وتنظيم العملاء، وإرشادات السلامة. التأخيرات العشوائية بين 5 و12 ثانية
تقلل سرعة العمليات ولا تضمن منع الحظر؛ يلزم احترام الموافقة وقواعد المنصات.

### Provider setup

In the downloaded desktop app, open Email Marketing and save/test your SMTP
connection. For Telegram, obtain your own api_id/api_hash at my.telegram.org,
save them in the connection panel, then enter your phone, login code and 2FA
password if requested. No pre-generated session string is required.

Credentials and Telegram sessions are encrypted using the operating system
credential facility and stored separately from workspace responses. Saving
credentials is refused if native encryption is unavailable. Neither passwords,
API hashes nor Telegram sessions belong in list imports or task descriptions.
Browser-based modules open a visible browser for manual sign-in and retain a
private local browser profile.

Live task execution is desktop-only. The hosted preview permits draft editing
and result inspection, not account sign-in, sending or live extraction. Approve
each run or schedule; confirm permission and consent. Tasks use randomized
5–12-second action delays (the existing reply-specific pacing is unchanged).
Delays are rate controls, not an anti-ban guarantee. Restrictions and ambiguous
submissions stop execution without automatic retry or bypass.

Schedules require the desktop app to remain running and awake. Future schedules
survive restart; interrupted tasks, missed schedules, or schedules blocked for
more than one minute require manual review. Cancel cannot undo a submitted
message or post. SMTP acceptance is not recipient delivery; format/MX checks
cannot prove a mailbox exists, guarantee inbox placement or prevent all bounces.

The automated checks cover drafts, persistence, validation, domain checks and
controlled SMTP acceptance/failure behavior. Actual macOS Keychain, Telegram
phone/2FA authorization, third-party browser interfaces and real recipient
delivery must be verified with your authorized accounts on macOS.

### Files in this folder

- `package.json`, `main.js`, `preload.js`: standalone Electron entry point.
- `renderer/`: complete prebuilt frontend, ready to run.
- `api-service.cjs`, `validation.cjs`, `worker.cjs`, `browser-worker.cjs`, `leads.cjs`: local backend.
- `source/`: frontend/backend project source and shared libraries for development.
- `README.md`: these instructions.

Dependencies, hosted database files, secrets, and saved contacts are deliberately
not included. `npm install` supplies the dependencies on your iMac.

The downloaded folder was verified separately in a Linux x64 native Electron
window on a virtual X11 display. Electron 40.10.6 embeds Node 24.15.0 and SQLite
3.51.3; its `node:sqlite` module, local API startup, draft/result persistence
across restarts, and native CSV/XLSX download buttons passed. Windows and macOS
have not been executed. The test automated the download save path, not the
operating system's file-picker dialog; a fresh `npm install` was not tested.

## Development from the full project

After installing the project's renderer dependencies, run this from the
`artifacts/social-omni-desktop` folder:

```sh
node scripts/export-desktop.mjs
```

Then use the steps above inside its `desktop` folder. The exported renderer uses
relative asset paths and hash routing so it runs from a local file.

From the full workspace, `pnpm run test:desktop` tests the downloadable archive
in an isolated temporary application-data directory (Linux only). It requires
an X11 display, or Xvfb, and Electron's Linux shared libraries. It does not use
the browser preview or hosted API. See `../docs/native-verification.md` in the
full project for the environment, evidence, and remaining target-OS checks.

## Local data and security

- Older builds stored planning data in `socialomni.sqlite` inside Electron's
  per-user application-data directory.
- Current campaigns, account labels, contacts, simulation settings, and task
  histories are saved through a local Express API in `socialomni-workspace.sqlite`
  in that same directory. The earlier `socialomni.sqlite` is retained for a
  one-time import of previous records; it is not deleted.
- The local API binds only to a random loopback port and requires an internal
  secret on each request. The renderer uses a validated Electron bridge.
- Current SQLite storage uses Electron's embedded Node SQLite module. SQL.js is
  used only to read the legacy file. No separate SQLite compiler is required.
- The browser preview uses SQLite on the Replit development server, with an
  anonymous browser workspace ID. It is not storage on your computer and is
  not intended for private contacts. Browser and desktop records remain separate.
- Node.js is disabled in the renderer. A restricted preload bridge exposes only
  namespaced local-data storage and four allowlisted platform links.
- Live logins happen manually in a visible Playwright Chromium browser. WhatsApp
  uses its normal QR sign-in. The app never asks you to paste passwords or cookies.
  Private browser profiles retain platform sessions separately per saved account.
  Session cookies are NOT copied into SQLite or exported in the ZIP.
- The SQLite file is not encrypted. Do not enter passwords, tokens, or other
  credentials into campaign data, contacts, or account labels.

## What this edition does

Plan drafts, keep contact records, organize saved account labels, and review
scheduled work. WhatsApp saves comma/newline-separated phone lists and formatted
message templates. Campaigns save keywords, captions, a target group count
(1–1,000), and optional account/media selections. Image and video attachments
(up to 5 MB each, 50 MB per workspace) are saved as SQLite blobs.

Real background workers update persistent per-target queues, counters and logs.
Simulation requests are rejected, and legacy pending simulations are cancelled.
Historical records remain unchanged. Sign in manually in the visible browser;
never enter passwords or cookies into account labels.

Overview shows total saved campaigns, active account labels, server-accepted
live messages (with a separate historical simulated count), and saved leads. Facebook & Instagram Automation
has its own sidebar module. Google Maps Lead Extractor saves niche/location
drafts and extracts observed public listings in the local browser. Missing
details remain blank; hosted preview cannot run extraction or generate substitutes.
Results accumulate in SQLite (up to 2,000) and can be exported as CSV or real
Excel .xlsx files. Excel cells are text; CSV guards formula-like values.
Live lead extraction runs in the sequential browser queue and can be stopped.
Settings includes a saved future-license placeholder, not an activation service.

Drafts, attachments and results survive restarts. An in-progress browser task is
marked interrupted when the process restarts; it is not automatically resumed.
Live publishing and messaging require explicit approval in the local app. A due
item becomes ready for review, not automatically sent. Clearing the workspace
also removes saved media, message/phone-list settings, lead results and drafts,
analytics counters, and the license placeholder (appearance is retained).

## Real local browser execution

1. Add a WhatsApp or Facebook account label in Accounts Manager. It is not a
   credential or a connected session until you sign in.
2. Open WhatsApp Marketing or Facebook & Instagram Automation. Select the saved
   account under Local browser automation and choose Open browser / sign in.
3. Scan the WhatsApp QR with your phone, or log into Facebook manually. The local
   browser closes after connection is detected and saves its private profile.
4. WhatsApp: enter international phone numbers and a text message in the draft.
   Confirm every recipient opted in, then choose Send approved messages. The
   current draft is saved first. Messages execute sequentially; the queue records
   a send only after a new outgoing message has a server-accepted check.
5. Facebook: search group keywords for review. Select only eligible groups that
   permit your content (or paste their https://www.facebook.com/groups/... URLs).
   Select a saved text campaign, review the caption, confirm permission, and
   choose Join / post to approved groups. Limit: 20 reviewed groups per run.
   Membership questions or approval requirements stop posting for that group;
   requests are not falsely recorded as completed joins.
6. Settings and WhatsApp sliders set an enforced 5–12 second random pause before
   every navigation, typing, join and send/post action. Pacing is a rate control,
   NOT ban avoidance. Respect platform rules; no setting guarantees against bans.
7. Watch Connecting, sign-in, Sending, Waiting and Done in the queue and console.
   Stop cancels the task. WhatsApp stays open for manual interaction and subsequent
   jobs; only user closure or app shutdown closes its persistent context.
   Previously submitted actions cannot be undone.

Live execution is text-only and uses English platform controls. Saved media
remains available for drafts but cannot silently be dropped from a live text run;
remove it first. Unsupported actions fail explicitly; no simulation fallback runs.

### Persistent WhatsApp, unread observation and SMTP

The QR sign-in job has no automatic timeout or browser closure. The account's
local browser profile is reused by sending and the CRM/chatbot listener.
Drafts pause inbox switching. Message identities, cooldowns and durable reply
reservations prevent replay and automatic retries after uncertain submissions.

Email Marketing uses Host, Port, User, Password and From settings with Nodemailer.
Recipient lists, TXT/CSV imports, subjects and plain-text bodies are saved as tasks.
Live SMTP verification, per-recipient acceptance/rejection and progress are
persisted and polled by the UI. Explicit recipient rejections are reported while
the batch continues; uncertain submissions stop it. SMTP acceptance is not proof
of recipient delivery. Credentials require the native encrypted credential store,
not the hosted preview.

If Chromium installation failed, run `npx playwright install chromium` inside
this folder, then `npm start`. The hosted preview cannot launch a local browser
on your computer. Native selectors depend on platform UI and may change; missing
controls, login expiry, verification challenges, restrictions and uncertain
outcomes stop the task with a log. Review the platform manually before retrying
to avoid duplicate sends or posts. No automated retries, CAPTCHA solving, stealth
plugins, account rotation, or restriction bypass are included.

SQLite files use owner-only access permissions where supported, but are not
encrypted. Protect your computer account and backups. Browser profiles contain
sensitive sessions and must not be shared.
