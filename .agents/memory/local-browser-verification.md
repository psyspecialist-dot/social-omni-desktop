---
name: Local browser verification
description: Avoid redundant browser downloads when Playwright's default headless launcher fails.
---

For a local Playwright check, distinguish a missing headless-shell executable
from a missing full Chromium installation.

**Why:** This workspace had full Chromium installed, but Playwright's default
headless launch selected a separate, absent headless shell. Explicitly selecting
the existing full Chromium executable allowed the same browser check to run.

**How to apply:** Check the actual installed browser before installing anything.
When full Chromium is available, launch with
`executablePath: chromium.executablePath()` and `headless: true`. Recheck
availability after Playwright upgrades rather than assuming an old path works.

Native Electron smoke tests in the hosted Linux environment may have no usable
OS machine identity even while Chromium/Electron launch normally. Do not add a
random identity fallback, alter an existing customer's identity, or treat this
as a cloud-authentication failure.

**Why:** This host had an empty OS machine-id file. That blocks legitimate
activation before authentication and is not evidence of bad account credentials.

**How to apply:** The application must show an explicit machine-ID error and
send no credentials when detection fails. If testing subsequent native UI flows,
isolate only the OS-read boundary as a test fixture, retain the production
hashing/parser and live API, exclude the fixture from distributions, and disclose
that real hardware detection was not verified on this host.
