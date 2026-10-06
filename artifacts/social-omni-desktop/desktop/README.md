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

- The desktop app stores campaign planning data in `socialomni.sqlite` inside
  Electron's per-user application-data directory.
- SQLite runs through SQL.js, so no native SQLite compiler or ABI rebuild is required.
- The browser preview uses browser-local storage instead. Browser and desktop
  records are separate; launching the desktop does not import browser records.
- Node.js is disabled in the renderer. A restricted preload bridge exposes only
  namespaced local-data storage and four allowlisted platform links.
- Logins happen in your default browser on official platform sites. The app
  neither reads nor stores login credentials, session cookies, or browser profiles.
- The SQLite file is not encrypted. Do not enter passwords, tokens, or other
  credentials into campaign data, contacts, or account labels.

## What this edition does

Plan drafts, keep opted-in contact records, organize campaign statuses, and
review scheduled work. Publishing and messaging remain manual actions in
official platform apps. A due item becomes ready for review, not automatically
sent. The license field is a clearly labeled test placeholder, not a paid license
validator.

It does not auto-post, auto-comment, auto-join groups, extract group members,
send bulk messages, or use ban-avoidance delays.
