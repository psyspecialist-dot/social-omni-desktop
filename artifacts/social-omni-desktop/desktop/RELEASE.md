# Social Najhin — installer distribution

## Customers do not install Node.js

Distribute the built installer, not the development/source ZIP.

- Windows x64: double-click `Social-Najhin-1.0.0-win-x64.exe`, complete Setup,
  and launch Social Najhin from its desktop or Start menu shortcut.
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

The Linux workspace produced an unsigned macOS Intel app ZIP and a portable
Windows x64 ZIP. Extract the complete Windows folder and double-click
`Social Najhin.exe`, keeping `resources` and the bundled DLLs beside it. The
portable ZIP is not an NSIS installer and does not create installation shortcuts.
The Windows app archive includes the API dependencies, SQLite WASM and Chromium.

This host could not complete NSIS uninstaller generation under Wine. No usable
Windows Setup `.exe` or macOS DMG has been produced here. Use the native release
workflow to produce those artifacts. Actual native installation, macOS startup,
signing and notarization remain unverified.

## Build publishers

Use the standalone source folder (outside the development pnpm monorepo).
Developers, not customers, need Node.js 24 and build dependencies.

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
