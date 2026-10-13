---
name: Offline commercial distribution
description: Seller-only issuer policy and offline CodeCanyon distribution constraints.
---

The user requested commercial CodeCanyon distribution with no external
activation server, selectable/copyable device IDs and license keys, verified
clipboard copy, and a source-config license-check toggle.

**Why:** The user explicitly requested these requirements.

**How to apply:** Use device-bound Ed25519 signatures with only the public key
in the application. Keep the signing key outside Git and every distribution.
The toggle belongs to owner build configuration, not an end-user activation
bypass in Settings. Clearly label disabled checking; it is not proof of payment.

The user selected seller-only key generation.

**Why:** The user explicitly selected “البائع فقط (موصى به)”.

**How to apply:** Separate seller tooling from the buyer/CodeCanyon archive.
Never include actual signing files in either archive. Offline generation issues
explicit device-specific licenses; it is not automatic Envato purchase-code
verification or a central reseller device-count ledger. Preserve optional
online-authority compatibility, but do not make it necessary for offline sales.

The seller wants daily license generation through a browser dashboard in Replit,
without using the terminal.

**Why:** The user explicitly requested this merchant workflow.

**How to apply:** Keep issuance separate from the buyer application and gated
behind seller access. Call the existing private issuer only on the backend;
never send the signing key to the browser or include the seller dashboard in
buyer distributions.

Do not initialize or rotate the seller issuer to fix an activation warning in a
released app. Check the existing issuer's public key against the source config,
then verify the configuration in the newly packaged application.

**Why:** A desktop activation warning was reported while the current source
already had the matching public key and enabled offline licensing. Correct
source configuration alone does not establish which build a customer installed;
rotating the issuer would invalidate previously issued licenses.

**How to apply:** Rebuild using the original public key and give the corrected
release a distinguishable version. Keep intentional owner-disabled builds
separate from missing/invalid public-key configuration.

Source buyers can change configuration and rebuild; no client-side scheme
prevents that. Offline permanent certificates cannot be remotely revoked.

**Why:** These are inherent limits of source distribution and offline signatures.

**How to apply:** State them in seller/buyer documentation and sales descriptions.
