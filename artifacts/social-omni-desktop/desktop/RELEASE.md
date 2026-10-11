# Social Najhin — installer distribution

## Customers do not install Node.js

Distribute the built installer, not the development/source ZIP.

- Windows x64: run the matching `.exe`. Setup packages install the application
  and create shortcuts; portable EXEs launch it without an installation.
- macOS Intel / Apple Silicon: use the DMG matching the machine, open it, and
  drag Social Najhin to Applications. The ZIP contains the same standalone app.
- Chromium, Electron, API dependencies and SQLite WASM are inside the package.
  The first launch does not download a browser or run npm.
- Data, encrypted credentials and browser profiles remain in Electron's
  writable user-data directory, never in Applications, Program Files or ASAR.
  Uninstalling on Windows does not delete user data.

Unsigned builds are test artifacts, not signed commercial releases. They can
trigger Windows SmartScreen or macOS Gatekeeper warnings. Do not instruct buyers
to disable operating-system security. Sign Windows releases and sign/notarize
macOS releases before commercial delivery.

### Current build status

Version 1.0.2 has unsigned macOS Intel and Apple Silicon app ZIPs and a Windows
x64 portable EXE. They include the updated media workers, persistent CRM tags,
QR text menus and optional OpenAI replies. Extract the matching Mac ZIP and
move Social Najhin.app into Applications. Run the Windows portable EXE directly;
it is not an NSIS Setup installer and does not create installation shortcuts.
All three packages include the API dependencies, SQLite WASM and Chromium.

This host could not produce a filesystem-validated macOS DMG or complete NSIS
uninstaller generation under Wine. Use the native release workflow for DMGs
and Windows Setup. Its Mac job verifies and mounts both DMGs before upload.
No successful native workflow run is implied by this documentation. Actual
native installation, macOS startup, signing and notarization remain unverified.

## Build publishers

Use the standalone source folder (outside the development pnpm monorepo).
Developers, not customers, need Node.js 24 and build dependencies.

The GitHub Actions packaging jobs use Node.js 20 (latest 20.x). They skip all npm
install scripts, including `install-app-deps`, and assert the host Node and both
locked Node-20-compatible builder versions. The app has `npmRebuild: false` and
uses built-in/WASM SQLite rather than native addons. This avoids Electron's npm download
script, which requires Node.js 22.12 or later. electron-builder downloads the
target Electron runtime itself; the application's embedded Node/SQLite runtime
is not downgraded to Node.js 20.

    pnpm install --frozen-lockfile --ignore-workspace
    pnpm run check
    pnpm run build:win --publish never
    pnpm run build:mac --publish never

`electron-builder` also works through npm scripts after `npm install`.
`dist/installers` contains the outputs. Windows produces an NSIS `.exe`;
macOS produces Intel and Apple Silicon `.dmg` and `.zip` artifacts.
Build DMGs on macOS. Cross-built macOS ZIPs are not a substitute for native tests.
The repository's `desktop-installers.yml` workflow prepares the renderer on Linux
and builds installers on native Windows/macOS runners. It is manual and does not
publish a release or upload marketplace listings. It currently creates unsigned
test builds; configure signing separately before release.

The before-pack hook downloads the Chromium revision matching the locked
Playwright version for each target architecture. The after-pack hook rejects
packages missing the app archive, Chromium or SQLite WASM. Browser downloads and
installer outputs are excluded from the source bundle and Git.

For developer-only `electron .` launches, run `pnpm run browser:install` first.

## Commercial release checklist

- Supply your Windows signing certificate and Apple Developer ID signing /
  notarization configuration using the release platform's secrets system.
- Test signed installation, first launch, database persistence after restart and
  upgrade, and manual WhatsApp/Facebook login on both supported operating systems.
- Include the third-party licenses for Electron, Chromium, npm dependencies and
  all shipped assets; confirm redistribution rights before marketplace delivery.
- Include this documentation and the source package for marketplace review.
- Marketplace acceptance, licensing enforcement and provider authorization are
  not established by successfully generating an installer.
