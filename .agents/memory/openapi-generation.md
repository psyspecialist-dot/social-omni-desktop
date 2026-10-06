---
name: OpenAPI generation quirks
description: Why request bodies use named schemas with the split Orval Zod generator.
---

Prefer named component schemas for request bodies instead of anonymous inline schemas.

**Why:** In this workspace's split Orval output, inline request bodies produced duplicate body-type exports across the Zod schema and TypeScript barrels. Named component references resolved the collision without hand-editing generated files.

**How to apply:** When expanding API contracts, reference named request schemas and regenerate both clients and Zod types. Fix generator inputs or configuration, not generated output.
