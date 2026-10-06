---
name: SQLite runtime compatibility
description: Experimental built-in SQLite behavior in the development and desktop runtimes.
---

The preview backend currently runs on a Node version that provides built-in SQLite but prints an experimental-feature warning. Native Electron startup has not been verified in this environment.

**Why:** A successful browser preview proves the hosted Node runtime works; it does not prove the Electron version's embedded Node supports the same module or behavior.

**How to apply:** Before upgrading or packaging the desktop edition, test the API startup and database persistence in the target Electron runtime. Do not treat the hosted API checks as native-runtime verification.
