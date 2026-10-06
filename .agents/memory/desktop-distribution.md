---
name: Desktop distribution
description: Why the local Electron distribution is separate from the web-development workspace.
---

Distribute the standalone Electron folder with the already-built renderer. Do not require end users to install and rebuild the full web-development workspace on their personal computer.

**Why:** The requested application must run locally. This workspace has Linux-specific dependency overrides for its hosted tooling; a separate desktop package avoids making local Windows/macOS setup depend on that toolchain.

**How to apply:** Keep local-run instructions focused on the standalone folder, regenerate its renderer after UI changes, and describe native execution separately from browser-preview verification.
