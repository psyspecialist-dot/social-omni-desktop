---
name: Social Najhin licensing model
description: The user's requested purchase and support-subscription model.
---

The user requested: "شراء لمرة واحدة مع اشتراك شهري/سنوي للتحديثات والدعم",
license verification, binding to the local Machine ID, and clear license status
in Settings.

**Why:** The user explicitly specified this sales model.

**How to apply:** Keep purchase entitlement and updates/support validity
separate. Do not silently change the requested model into monthly payment for
basic application usage.

The user selected signed offline licenses and requested `maxDevices`: 1 for
ordinary licenses bound to a Machine ID, and configurable reseller packs such
as 5, 10, or 50 devices.

**Why:** The user wants to sell device-limited packs to resellers.

**How to apply:** Enforce the device allowance, not just display a signed
number. Fully offline licenses need signed, explicitly authorized Machine IDs;
a shared key for previously unknown devices needs a central activation ledger
to enforce its total device count. The user selected connection at activation
only, followed by offline operation. Do not present a local counter as a global
device limit or require recurring online validation for normal use.

Do not recycle a registered seat while a permanent offline certificate may
still be usable. Disabling the master key stops new activations, not already
issued offline certificates.

**Why:** Central activation plus permanent offline use cannot establish that
an old certificate has stopped being used; recycling would violate maxDevices.

**How to apply:** Treat the allowance as total distinct registered machines,
and explain this limitation in owner/customer controls.

Keep a covered release usable after support expires; a newer release needs an
updates entitlement covering its release date.

**Why:** The requested recurring subscription is for updates/support, not for
continued use of the purchased application.

**How to apply:** Release dates are release metadata, not export/build times.
Do not advance the release date during a mere re-export or repack.
