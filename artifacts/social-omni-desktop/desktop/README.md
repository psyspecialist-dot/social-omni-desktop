# SocialOmni Desktop

This is the local Electron edition of the SocialOmni Desktop simulation dashboard.

## Run on your computer

The downloadable desktop folder includes the built renderer. Install a current
Node.js LTS release, open a terminal in this folder, and run:

```sh
npm install
npm start
```

Electron opens a native application window. It is not a signed installer.
The Electron runtime cannot be launched or tested through the browser preview.

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
- Logins happen in your default browser on official platform sites. The app
  neither reads nor stores login credentials, session cookies, or browser profiles.
- The SQLite file is not encrypted. Do not enter passwords, tokens, or other
  credentials into campaign data, contacts, or account labels.

## What this edition does

Plan drafts, keep contact records, organize simulated accounts, and review
scheduled work. WhatsApp saves comma/newline-separated phone lists and formatted
message templates. Campaigns save keywords, captions, a target group count
(1–1,000), and optional account/media selections. Image and video attachments
(up to 5 MB each, 50 MB per workspace) are saved as SQLite blobs.

Start Campaign and Run Task trigger background simulations with persistent
per-target queues, counters, randomized 3–30 second pauses, and live logs. Jobs
run one at a time per workspace. Queue results say Sent/Joined/Posted only as
simulated results; nothing is transmitted externally. Group names are generated
hypothetical names, not real search results. Active simulated accounts are not
connected accounts. Only fake session references beginning with `demo-` are
accepted; never enter actual credentials or cookies.

Overview shows total saved campaigns, active simulated accounts, cumulative
simulated messages, and saved synthetic leads. Facebook & Instagram Automation
has its own sidebar module. Google Maps Lead Extractor saves niche/location
drafts and generates clearly labeled fictional businesses with reserved phone
numbers and .example websites; it never contacts or scrapes Google Maps.
Results accumulate in SQLite (up to 2,000) and can be exported as CSV or real
Excel .xlsx files. Excel cells are text; CSV guards formula-like values.
Lead simulations run in the same sequential queue and can be stopped.
Settings includes a saved future-license placeholder, not an activation service.

Drafts, attachments and results survive restarts. An in-progress rehearsal is
marked interrupted when the process restarts; it is not automatically resumed.
Publishing and messaging remain manual actions in official platform apps. A due
item becomes ready for review, not automatically sent. Clearing the workspace
also removes saved media, message/phone-list settings, lead results and drafts,
analytics counters, and the license placeholder (appearance is retained).

It does not auto-post, auto-comment, auto-join groups, extract group members,
send bulk messages, or use ban-avoidance delays.
