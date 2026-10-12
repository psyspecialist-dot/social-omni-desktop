---
name: Electron release packaging
description: Non-obvious host limitations and dependency-collection behavior affecting standalone commercial installers.
---

Canonicalize ASAR entry separators before validating archive contents across hosts.

**Why:** ASAR listings use the build host's path separators. Comparing Windows
backslash entries to POSIX paths falsely reported a missing main.js even though
the same package passed macOS verification.

**How to apply:** Normalize listed entries to forward slashes with a consistent
leading separator before both required-file and forbidden-dev-signer checks.
Keep genuine missing-file, WASM, and Chromium checks enabled.

Build the standalone package outside the parent pnpm workspace, such as in an isolated temporary directory.

**Why:** electron-builder's pnpm dependency collector runs pnpm list without the standalone ignore-workspace flag. Inside this repository it can return no production dependencies and fall back to the wrong workspace root, creating an archive without runtime modules. A missing SQLite WASM check caught this before an installer was delivered.

**How to apply:** Export the standalone source, install its own locked dependencies in the isolated directory, then run its build commands there. Keep native CI jobs outside the monorepo too. Validate archive contents, not merely a successful Electron download.

Cross-building Windows NSIS on this Linux host needs Wine's new 64-bit WoW64 mode and an X display.

**Why:** traditional combined Wine selects a 32-bit Linux executable that this host cannot execute. New WoW64 ran the Windows Electron SQLite probe, but NSIS uninstaller generation still failed even with an X display. A Wine-backed check is not a native Windows installation test.

**How to apply:** Use native Windows/macOS release runners for the final installers rather than repeatedly retrying Wine. Do not present an incomplete NSIS uninstaller stub left by a failed build as the installer. Standard electron-builder DMG packaging and macOS signing need native macOS tooling; unsigned cross-generated disk images require separate filesystem and mount validation.

Windows portable EXEs can be cross-built here without the NSIS uninstaller step. Use store compression when maximum compression exceeds available memory, and clear failed archive caches before retrying.

**Why:** Maximum-compression packaging was memory-killed. A subsequent prepackaged build reused the partial archive as "up to date" and reported success; clearing its generated archive and rebuilding produced the complete executable.

**How to apply:** After a failed compression run, remove only the generated intermediate archive and failed executable before retrying. Verify both the final NSIS container and its embedded application archive, not merely the builder exit code. Store compression produces substantially larger downloads.

Generated installer downloads can exceed the Library upload limit.

**Why:** asset registration rejects files over 100 MiB; a self-contained Chromium/Electron app is considerably larger.

**How to apply:** Keep build outputs in ignored generated-artifacts directories and supply verified workspace download links when they cannot be registered. Do not claim those development links are a permanent commercial download host.

Do not treat a Linux-generated HFS+ image as a valid Mac installer merely
because its disk-image tool completed.

**Why:** Mozilla's cross-platform DMG tooling compiled on this host, but editing
its reference HFS+ volume produced a B-tree inconsistency. Successfully building
the tooling is not proof that the populated filesystem is mountable.

**How to apply:** Prefer native macOS DMG production, or require filesystem and
native mount validation for cross-generated images. Never distribute a damaged
image or rename an ISO/ZIP to DMG as a substitute.

An active GitHub source-control connection does not prove that shell GitHub CLI
authentication is available in this workspace.

**Why:** The connection reported healthy repository and workflow permissions,
while `gh` lacked authentication and authenticated Git fetches stalled.
The authorization and connection-refresh tools also reported conflicting
attachment states.
The connection advertised a provider API helper that was not available in the
agent sandbox, so it could not provide an alternative to the failing Git CLI.

**How to apply:** Check actual repository access before promising an Actions
run. Do not extract OAuth tokens or ask for a raw token to work around the
connection. Refresh authorization once when warranted; if access still fails,
report the access blocker rather than repeatedly prompting or claiming a build
was started.

Keep the CI build-host Node version separate from Electron's embedded runtime.

**Why:** The user requires Node.js 20 for installer CI, but Electron's npm
download tooling can require Node.js 22. The app itself needs Electron's newer
embedded Node for built-in SQLite, so downgrading the app runtime is not an
appropriate fix.

**How to apply:** Use compatible build tooling and skip the Electron npm
download lifecycle in CI, letting electron-builder download the target runtime.
Check the builder's automatically installed Windows peer too: an incompatible
peer can reintroduce the newer builder and its Node requirements even when the
main builder is pinned.
