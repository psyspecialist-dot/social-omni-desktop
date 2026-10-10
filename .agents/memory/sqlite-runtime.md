---
name: SQLite runtime compatibility
description: Experimental built-in SQLite behavior in the development and desktop runtimes.
---

Do not infer desktop SQLite compatibility from hosted Node or browser checks. Native Linux headless verification established that Electron 40's embedded Node can run this app's SQLite service, but it does not establish Windows/macOS or normal desktop sandbox compatibility.

**Why:** A successful browser preview proves the hosted Node runtime works; it does not prove the Electron version's embedded Node supports the same module or behavior.

**How to apply:** Before upgrading or packaging the desktop edition, test the API startup, database persistence, and native downloads in the target Electron runtime. Keep virtual-display checks separate from target-OS installation and save-dialog checks; do not report the latter as passed when downloads use an automated save path.
