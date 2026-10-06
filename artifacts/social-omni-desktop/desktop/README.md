# SocialOmni Desktop

This is the local Electron edition of the SocialOmni campaign planner.

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
- SQLite runs through SQL.js, so no native SQLite compiler or ABI rebuild is required.
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

Plan drafts, keep opted-in contact records, organize campaign statuses, and
review scheduled work. Start Campaign and Run Task trigger local background
simulations with saved progress, adjustable 3–30 second pauses, and live logs.
Publishing and messaging remain manual actions in official platform apps. A due
item becomes ready for review, not automatically sent. The license field is a
clearly labeled test placeholder, not a paid license validator.

It does not auto-post, auto-comment, auto-join groups, extract group members,
send bulk messages, or use ban-avoidance delays.
