# Standalone desktop verification

## Result

Passed on Linux x64 using the actual exported
`public/downloads/socialomni-desktop.zip`, extracted outside the workspace.
The archive's main process, preload, API modules, and renderer matched the
corresponding desktop source files. No application behavior or storage engine
was changed for this verification.

Tested runtime:

| Component | Version |
| --- | --- |
| Electron | 40.10.6 |
| Embedded Node | 24.15.0 |
| Embedded SQLite | 3.51.3 |
| Express | 5.2.1 |
| SQL.js (legacy storage) | 1.14.2 |

The operating environment used Xvfb with a 1440 × 1080 virtual X11 display.
This is a native Electron process with a BrowserWindow, not a browser preview
and not a test against the hosted API.

## Checks that passed

- Electron's embedded runtime opened an in-memory `node:sqlite` database and
  executed a query. The exported API opened the on-disk workspace database.
- The prebuilt `file:` renderer loaded with its sandboxed preload; the renderer
  had no Node `require` or `process` global.
- The renderer's IPC bridge successfully requested initialized state from the
  embedded loopback API.
- UI clicks saved a niche/location/count draft and ran a three-lead simulation.
  Results were explicitly fictional, with reserved `.example` websites.
- After closing and relaunching the Electron process, the saved draft, complete
  result objects, and completed job history were unchanged and visible.
- A value written through the retained legacy SQL.js bridge survived restart.
- Clicking Export CSV triggered Electron's download event, completed an on-disk
  download, and produced UTF-8 CSV with a BOM, one header plus three rows,
  escaped commas/quotes, Unicode, and text-safe phone numbers.
- Clicking Export Excel triggered a separate completed native download. The
  file was a real XLSX ZIP containing OOXML workbook parts, four worksheet rows,
  and text cells including the saved phone numbers and websites.
- Closing during a second 200-target simulation and relaunching marked it
  `Failed` / `Interrupted`, retained previous results and the new draft, and did
  not resume it automatically.
- No uncaught renderer exceptions were observed. The container emitted D-Bus
  desktop-service warnings, but these did not prevent the checked flows.

## Repeat the check

Install workspace dependencies using the project's package-management workflow,
including the approved Electron postinstall. Then, on a Linux desktop:

```sh
pnpm run test:desktop
```

Or, on a headless Linux host with Xvfb:

```sh
Xvfb :99 -screen 0 1440x1080x24 -nolisten tcp &
DISPLAY=:99 pnpm run test:desktop
```

Electron requires standard Linux GTK/NSS/ALSA/X11/GBM/xkbcommon libraries.
In this Nix container, `LD_LIBRARY_PATH` additionally pointed to the installed
libxkbcommon library directory. Do not hardcode that container-specific path in
the application.

The harness is `scripts/desktop-smoke.mjs`. Its optional first argument is a
different archive path. It materializes installed production dependency trees
into the extracted app, rather than linking the app back to workspace modules.
Only Playwright and the Electron test executable are supplied by the workspace.
It creates isolated temporary user data and removes it when finished; existing
desktop and hosted records are untouched.

Evidence is written to `tmp/desktop-smoke/` (or `DESKTOP_EVIDENCE_DIR`):
`report.json`, `native-window.png`, downloaded `leads.csv` / `leads.xlsx`, and
`electron-stderr.log`. These are generated test artifacts, not application data.

## Limits and release checks still needed

- Windows and macOS execution, CPU architectures other than Linux x64, and
  desktop-specific permissions/path behavior are not verified.
- Dependencies were staged from installed workspace packages satisfying the
  standalone package's declared dependency ranges. A clean end-user
  `npm install` and the subsequent normal `npm start` still need a target-OS
  check. No claim is made about an installer, code signing, or OS trust prompts.
- The test's download listener set a save path to avoid an unattended OS dialog.
  This proves the real button → Blob → Chromium/Electron → file flow, but not
  choosing a folder, cancelling a save, overwriting a file, or OS permissions.
- `--no-sandbox`, `--disable-dev-shm-usage`, and `--disable-gpu` are harness-only
  container flags. Normal startup remains `electron .`, with the original
  security settings; sandbox/GPU behavior on a normal desktop is not established
  by this run.
- SQL.js key-value persistence was exercised, but migration of populated older
  releases was not part of this run.

The application remains simulation-only and uses the prebuilt renderer.
No real scraping, sending, publishing, replacement database, or signed installer
was added.
