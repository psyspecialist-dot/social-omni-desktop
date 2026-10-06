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
