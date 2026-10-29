---
name: External account website
description: Ownership and handoff expectations for the planned cloud account/subscription service.
---

The user built the external account/subscription website in GenSpark and
explicitly requested connecting Electron to its deployed HTTPS API and testing
login/device activation.

The user-provided service origin is
https://736c5a67-ada7-4b71-8509-88e554ff733f.vip.gensparksite.com .

**Why:** After requesting the standalone contract for GenSpark, the user said:
«تم إنشاء الموقع وواجهة الـ API بنجاح على GenSpark» and asked to update Electron.

**How to apply:** Treat the external website as a separate service boundary,
not an assumption that the existing local/Replit API is the cloud authority.
Keep purchase entitlement separate from updates/support unless the user
explicitly changes the commercial model.

Cloud activation follows the delivered contract's periodic online verification
and no offline grace. Preserve old offline certificates without using them as
an automatic fallback when cloud access is denied or unavailable.

**Why:** The cloud account/device contract is a distinct mode, not the old
SNK-to-SN1 exchange; fallback would bypass cloud device and revocation decisions.

**How to apply:** Keep legacy offline sales available as an explicit seller
build choice. Do not silently infer a change to perpetual purchase semantics.
