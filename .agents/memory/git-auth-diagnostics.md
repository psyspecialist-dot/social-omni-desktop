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

A bound connection can report healthy OAuth authorization while workspace
Git still stalls and `gh` has no authenticated session.
Both reconnect and normal connect cards can reject a Git provider connection
despite healthy/bound metadata; do not repeatedly offer unsupported cards.

**Why:** This happened after explicitly binding the existing authorized
connection; a healthy connection record did not prove CLI authentication.

**How to apply:** Confirm an actual remote operation succeeds before claiming
a push. Keep probes bounded and never substitute local development signing
keys for GitHub credentials.

For native GitHub source-control authentication failures, use Replit Account
Settings → Git Providers to disconnect and reconnect GitHub.

**Why:** Official Replit documentation distinguishes Git-provider authorization
from Account → Connected Services. Connector reconnect cards rejected the native
Git connection even when its metadata reported healthy OAuth.

**How to apply:** When GitHub explicitly rejects the username/token and the
native provider reconnect card is unsupported, direct the user to Git Providers.
Do not ask for tokens, extract credentials, or repeat the same failed push.

If the user supplies a PAT through workspace Secrets and authorizes its use,
authenticate per operation without saving it in the remote URL.

**Why:** Native Git-provider authentication continued to fail after reconnecting,
while user-authorized PAT authentication succeeded. Existing credential helpers
can otherwise take precedence over the newly supplied credential.

**How to apply:** Use a temporary askpass helper that consumes the secret only
inside Git, disable existing credential helpers for that operation, keep the
remote URL credential-free, and remove the temporary helper afterwards.
