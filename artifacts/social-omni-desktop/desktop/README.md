# Social Najhin

## WhatsApp modules

- **WaFilter:** paste numbers or import TXT/CSV/XLSX (up to 200 unique entries). Include country codes; store Excel phone cells as text. Save the list, select a WhatsApp account, confirm authorization, then start live verification. Format-only results remain Unverified; only an actual WhatsApp composer enables Active/Valid export. CSV and Excel exports include active numbers only. Inactive can mean invalid format or an explicit platform rejection; inspect the reason. Network failures remain Unknown and stop the run.
- **WA-CRM:** add clients or import saved phone contacts. Notes, statuses, consent and observed text messages persist in local SQLite. Editing CRM consent also updates its linked contact. Deleting a thread retains that contact. Sync requires starting the Inbox listener and opening a direct client conversation in the browser yourself. Only the open, visible conversation is monitored; it is not an all-chat background inbox. Message times are local observation times, not the original platform timestamps.
- **Auto-Reply / Chatbot:** manage exact/contains keyword rules, response templates (`{{name}}` supported), enabled state, 3–8-second delays and a 1–1440-minute cooldown per client/rule. Newest matching enabled rule wins. Start the same Inbox listener and complete the initial conversation sync before testing a new incoming text. Initial history never triggers replies; only opted-in direct chats qualify. Groups, media messages and background conversations do not trigger replies. STOP/unsubscribe opts a client out.
- Other browser actions retain 5–12-second pacing. Random delays are rate controls, not ban protection. Challenges/restrictions, ambiguous sends, browser closure and unavailable selectors stop execution. Never automatically retry an Unconfirmed reply; inspect WhatsApp first.
- Stop the listener before starting other browser tasks or deleting a CRM thread. Changing consent or disabling a rule suppresses a queued response. The visible browser must stay open; this is not a macOS background service.
- Live platform controls require English WhatsApp controls and the locally downloaded application. The hosted preview supports local module CRUD/imports but cannot verify numbers or run chatbot replies on your computer.

Social Najhin is a local Electron social-management suite with approved browser
automation and separate, clearly labeled rehearsal tools.

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
afterward `npm start` opens the local simulator. No Replit connection or separate
backend command is needed. The interface is already built; the local backend
starts automatically. Close the application window to quit.

If Terminal says `npm: command not found`, install Node.js and reopen Terminal.
If macOS asks for permission to open Electron, review it in System Settings →
Privacy & Security. Do not disable macOS security protections.

## Package contents

- `package.json`, `main.js`, `preload.js`: standalone Electron entry point.
- `renderer/`: complete prebuilt frontend, ready to run.
- `api-service.cjs`, `validation.cjs`, `worker.cjs`, `browser-worker.cjs`, `leads.cjs`: local backend.
- `source/`: frontend/backend project source and shared libraries for development.
- `README.md`: these instructions.

Dependencies, hosted database files, secrets, and saved contacts are deliberately
not included. `npm install` supplies the dependencies on your iMac.

## Development from the full project

After installing the project's renderer dependencies, run this from the
`artifacts/social-omni-desktop` folder:

```sh
node scripts/export-desktop.mjs
```

Then use the steps above inside its `desktop` folder. The exported renderer uses
relative asset paths and hash routing so it runs from a local file.

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

Plan drafts, keep contact records, organize simulated accounts, and review
scheduled work. WhatsApp saves comma/newline-separated phone lists and formatted
message templates. Campaigns save keywords, captions, a target group count
(1–1,000), and optional account/media selections. Image and video attachments
(up to 5 MB each, 50 MB per workspace) are saved as SQLite blobs.

Rehearsal buttons trigger background simulations with persistent
per-target queues, counters, randomized 5–12 second pauses, and live logs. Jobs
run one at a time per workspace. Queue results say Sent/Joined/Posted only as
simulated results; nothing is transmitted externally. Group names are generated
hypothetical names, not real search results. Active simulated accounts are not
connected accounts. Only fake session references beginning with `demo-` are
accepted; never enter actual credentials or cookies.

Overview shows total saved campaigns, active account labels, server-accepted
live messages (with a separate simulated count), and saved synthetic leads. Facebook & Instagram Automation
has its own sidebar module. Google Maps Lead Extractor saves niche/location
drafts and generates clearly labeled fictional businesses with reserved phone
numbers and .example websites; it never contacts or scrapes Google Maps.
Results accumulate in SQLite (up to 2,000) and can be exported as CSV or real
Excel .xlsx files. Excel cells are text; CSV guards formula-like values.
Lead simulations run in the same sequential queue and can be stopped.
Settings includes a saved future-license placeholder, not an activation service.

Drafts, attachments and results survive restarts. An in-progress rehearsal is
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
   Stop closes the task browser; previously submitted actions cannot be undone.

Live execution is text-only and uses English platform controls. Saved media
remains available for drafts/rehearsals but cannot silently be dropped from a
live run; remove it first. Instagram, TikTok and Google Maps remain planning or
simulation tools, not real browser automation.

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
