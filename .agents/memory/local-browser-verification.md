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
