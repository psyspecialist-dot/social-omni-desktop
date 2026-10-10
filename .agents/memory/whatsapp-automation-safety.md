---
name: WhatsApp automation safety
description: Why watched-chat baselines, module-specific pacing, and durable reply reservations matter.
---

Do not interpret newly mounted WhatsApp DOM elements as newly received messages. Baseline each direct conversation before allowing automatic replies; require consent and never replay its history.

**Why:** WhatsApp remounts messages when conversations switch or history scrolls. Treating a new DOM node as a new event can reply to old messages or to the wrong conversation. The user requested extending monitoring to unread inbox conversations, not just the open chat.

**How to apply:** Baseline pre-existing unread history as well as the open chat. Require unread evidence or newly appended messages, preserve message identity and durable reply reservations, and recheck the peer and consent before Send. Explain rendered-list limits rather than promising all-chat synchronization. Never switch chats or overwrite a person's unsent composer draft.

Reply cooldowns and ambiguous-send reservations must survive message-history pruning.

**Why:** The visible CRM history is bounded. Deriving cooldowns from it alone eventually forgets earlier attempts and can produce extra replies. A successful click also does not establish server acceptance.

**How to apply:** Persist attempt timing independently of retained messages, reserve before Send, distinguish Unconfirmed from Accepted, and never retry an ambiguous submission automatically.

Keep chatbot pacing separate from bulk browser pacing.

**Why:** The user explicitly requested 3–8 seconds for chatbot replies; previous approved sending/filter/navigation actions use 5–12 seconds. A shared global clamp would violate one of these requirements.

**How to apply:** Validate per-rule reply delays separately. Treat both ranges as rate controls, never as ban protection or a restriction-bypass mechanism.
