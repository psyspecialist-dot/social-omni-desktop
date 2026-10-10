---
name: Desktop distribution
description: Why the local Electron distribution is separate from the web-development workspace.
---

Customer releases must be standalone Windows installers and macOS DMGs/app ZIPs that run by double-click, without Node.js, Terminal or npm knowledge. Keep the prebuilt standalone source ZIP for publishers/developers, not as the customer installer.

**Why:** The user requested commercial/CodeCanyon installer distribution with no customer development setup. This workspace has Linux-specific dependency overrides; isolated release packaging avoids making Windows/macOS builds depend on that toolchain.

**How to apply:** Keep local-run instructions focused on the standalone folder, regenerate its renderer after UI changes, and describe native execution separately from browser-preview verification.

A request for the complete project ZIP should include application runtime and source, not saved workspace data, secrets, or Replit-internal tooling.

**Why:** The download is for running and editing the application on a personal computer; copying the hosted workspace wholesale would expose unrelated or private state and still require the hosted toolchain.

**How to apply:** Keep the standalone runnable package at the archive root and additional development source separate. Preserve exclusions for dependencies, databases, and credentials when expanding the bundle.

Keep the internal Electron application identity stable during public rebranding unless a data-directory migration is also provided.

**Why:** The public brand changed to Social Najhin, but changing the package identity can change Electron's user-data location and make existing local records and sessions appear lost.

**How to apply:** Rename visible titles, logos, metadata and download labels independently of the existing storage identity.

Browser controls should acknowledge queued work promptly rather than hold an IPC
invocation open for the entire authentication or automation run. Send progress
and failures separately, and do not automatically retry an uncertain request.

**Why:** Manual QR sign-in can take several minutes. Waiting for it in the request
would look like a frozen interface; retrying after a transport timeout could
duplicate an already-submitted action.

**How to apply:** Keep long-running browser work asynchronous, retain visible job
status, and make transport timeouts tell users to check the current task before
retrying. Keep persistent account profiles in the existing desktop user-data
location; branding changes must not create new session locations.

The user requires real production executions, not mock or rehearsal modes. WhatsApp browser, SMTP sending, chatbot/CRM observation and global progress must reflect actual backend/provider outcomes. Hosted preview must disable unsupported actions, never simulate success.

**Why:** The user repeatedly clarified this is not a UI-only project and explicitly asked to remove all mocking and bind controls and progress to real background execution.

**How to apply:** Scope future work around the full button-to-worker-to-saved-outcome journey. Never reintroduce rehearsals as a fallback for missing runtime/provider access. Preserve historical records rather than rewriting their outcomes.
