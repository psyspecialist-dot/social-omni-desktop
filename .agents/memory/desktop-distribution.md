---
name: Desktop distribution
description: Why the local Electron distribution is separate from the web-development workspace.
---

Distribute the standalone Electron folder with the already-built renderer. Do not require end users to install and rebuild the full web-development workspace on their personal computer.

**Why:** The requested application must run locally. This workspace has Linux-specific dependency overrides for its hosted tooling; a separate desktop package avoids making local Windows/macOS setup depend on that toolchain.

**How to apply:** Keep local-run instructions focused on the standalone folder, regenerate its renderer after UI changes, and describe native execution separately from browser-preview verification.

A request for the complete project ZIP should include application runtime and source, not saved workspace data, secrets, or Replit-internal tooling.

**Why:** The download is for running and editing the application on a personal computer; copying the hosted workspace wholesale would expose unrelated or private state and still require the hosted toolchain.

**How to apply:** Keep the standalone runnable package at the archive root and additional development source separate. Preserve exclusions for dependencies, databases, and credentials when expanding the bundle.

Keep the internal Electron application identity stable during public rebranding unless a data-directory migration is also provided.

**Why:** The public brand changed to Social Najhin, but changing the package identity can change Electron's user-data location and make existing local records and sessions appear lost.

**How to apply:** Rename visible titles, logos, metadata and download labels independently of the existing storage identity.
