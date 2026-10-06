---
name: Analytics semantics
description: How to choose reliable totals as simulation analytics expands.
---

Separate cumulative simulated actions from counts of currently saved records. Never derive a lifetime action total solely from retained job history.

**Why:** Job history is intentionally bounded. A total derived from that history would decrease when old completed runs are pruned, even though those simulated actions still occurred. Saved lead counts, by contrast, should decrease when the user explicitly clears results.

**How to apply:** When adding metrics such as posts or joins, define whether the metric is cumulative or a current-record count. Persist cumulative counters independently of job retention and reset them only when the workspace is explicitly cleared.
