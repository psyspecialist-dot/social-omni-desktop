---
name: GitHub credential lookup stalls
description: Distinguishing a Git credential-helper stall from network failure.
---

A hanging Git remote check is not evidence that GitHub is unreachable.
Credential lookup can stall even with terminal prompts disabled.

**Why:** Public GitHub HTTP requests succeeded while normal Git remote checks
timed out; disabling credential helpers for a read-only anonymous probe exposed
the actual authentication requirement immediately.

**How to apply:** Separate network reachability from repository authentication
before diagnosing a push failure. An anonymous probe is diagnostic only, not
an authentication workaround for pushing. Use the authorized GitHub connection;
never read or print stored credentials.
