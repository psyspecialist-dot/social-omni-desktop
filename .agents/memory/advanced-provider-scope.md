---
name: Advanced provider choices
description: Provider choices and safety limits for the desktop marketing upgrade.
---

Use Telegram's personal-account API, the user's own SMTP server, and public
business websites for the advanced modules, not a Telegram bot or a substituted
hosted mailing provider.

**Why:** The user explicitly selected these providers for this project's upgrade.

**How to apply:** Preserve the native setup flows and do not replace providers
without asking. Member-directory access is not recipient consent; do not turn
member exports into outreach lists automatically. Instagram has no Facebook-style
groups: its supported path is posting an image to the user's own feed.

Native account actions must be described separately from hosted-preview and
controlled-provider checks. Domain readiness is not mailbox deliverability, and
SMTP acceptance is not delivery.

**Why:** Hosted preview cannot establish platform-account permissions or verify
macOS credential encryption. Duplicate messaging after an uncertain submission
would be costly.

**How to apply:** Disclose unverified native behavior; require manual review of
ambiguous submissions and missed schedules rather than automatic retries.

New SMTP setups should default to session-only credentials, with persistent
OS-encrypted storage available only as an explicit alternative.

**Why:** The marketing-suite request includes temporary SMTP configuration.
Silently switching to permanent storage would violate that expectation.
Reusing a cached password after the host or username changes could disclose it
to a different server or account.

**How to apply:** Keep temporary credentials out of SQLite and renderer storage,
expire their configuration and scheduled sends on app restart, and require a
password again when the SMTP host or username changes. Test with a real local
TLS SMTP listener, but report external inbox delivery as unverified.

For the WhatsApp QR session, do not force Meta Cloud API. Use numbered text
menus, such as “Reply 1 for Sales, 2 for Support”, instead of native buttons.
Keep keyword-based auto-reply as the core/default engine. Generative replies
are optional, using an OpenAI API Key field in Settings.

**Why:** The user wants QR automation to work without requiring a Meta Business
API account and wants standard rule-based triggers available to everyone.

**How to apply:** Describe these menus honestly as text responses, not native
interactive buttons. Keep AI opt-in and ensure matching keyword/menu rules
take priority over generative replies.
