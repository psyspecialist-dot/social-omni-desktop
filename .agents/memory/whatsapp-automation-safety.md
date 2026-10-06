---
name: WhatsApp automation safety
description: Why watched-chat baselines, module-specific pacing, and durable reply reservations matter.
---

Do not interpret newly mounted WhatsApp DOM elements as newly received messages. Baseline each direct conversation before allowing automatic replies; require consent and never replay its history.

**Why:** WhatsApp remounts messages when conversations switch or history scrolls. Treating a new DOM node as a new event can reply to old messages or to the wrong conversation. The initial implementation therefore watches only the visible, open direct chat, not an unattended background inbox.

**How to apply:** Preserve message identity, recheck the conversation and consent immediately before Send, and explain watched-chat scope rather than promising all-chat synchronization. Do not overwrite a person's unsent composer draft.

Reply cooldowns and ambiguous-send reservations must survive message-history pruning.

**Why:** The visible CRM history is bounded. Deriving cooldowns from it alone eventually forgets earlier attempts and can produce extra replies. A successful click also does not establish server acceptance.

**How to apply:** Persist attempt timing independently of retained messages, reserve before Send, distinguish Unconfirmed from Accepted, and never retry an ambiguous submission automatically.

Keep chatbot pacing separate from bulk browser pacing.

**Why:** The user explicitly requested 3–8 seconds for chatbot replies; previous approved sending/filter/navigation actions use 5–12 seconds. A shared global clamp would violate one of these requirements.

**How to apply:** Validate per-rule reply delays separately. Treat both ranges as rate controls, never as ban protection or a restriction-bypass mechanism.
