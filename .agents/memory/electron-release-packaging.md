---
name: Electron release packaging
description: Non-obvious host limitations and dependency-collection behavior affecting standalone commercial installers.
---

Build the standalone package outside the parent pnpm workspace, such as in an isolated temporary directory.

**Why:** electron-builder's pnpm dependency collector runs pnpm list without the standalone ignore-workspace flag. Inside this repository it can return no production dependencies and fall back to the wrong workspace root, creating an archive without runtime modules. A missing SQLite WASM check caught this before an installer was delivered.

**How to apply:** Export the standalone source, install its own locked dependencies in the isolated directory, then run its build commands there. Keep native CI jobs outside the monorepo too. Validate archive contents, not merely a successful Electron download.

Cross-building Windows NSIS on this Linux host needs Wine's new 64-bit WoW64 mode and an X display.

**Why:** traditional combined Wine selects a 32-bit Linux executable that this host cannot execute. New WoW64 ran the Windows Electron SQLite probe, but NSIS uninstaller generation still failed even with an X display. A Wine-backed check is not a native Windows installation test.

**How to apply:** Use native Windows/macOS release runners for the final installers rather than repeatedly retrying Wine. Do not present an incomplete NSIS uninstaller stub left by a failed build as the installer. DMG production and macOS signing need native macOS tooling.

Windows portable EXEs can be cross-built here without the NSIS uninstaller step. Use store compression when maximum compression exceeds available memory, and clear failed archive caches before retrying.

**Why:** Maximum-compression packaging was memory-killed. A subsequent prepackaged build reused the partial archive as "up to date" and reported success; clearing its generated archive and rebuilding produced the complete executable.

**How to apply:** After a failed compression run, remove only the generated intermediate archive and failed executable before retrying. Verify both the final NSIS container and its embedded application archive, not merely the builder exit code. Store compression produces substantially larger downloads.

Generated installer downloads can exceed the Library upload limit.

**Why:** asset registration rejects files over 100 MiB; a self-contained Chromium/Electron app is considerably larger.

**How to apply:** Keep build outputs in ignored generated-artifacts directories and supply verified workspace download links when they cannot be registered. Do not claim those development links are a permanent commercial download host.
