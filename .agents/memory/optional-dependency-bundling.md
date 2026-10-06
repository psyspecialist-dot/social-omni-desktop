---
name: Optional native dependency bundling
description: An esbuild pitfall with variable dependency fallback paths.
---

Avoid template-string require paths that point into a dependency directory.

**Why:** Esbuild interprets them as globs and recursively tries to parse files,
including pnpm's shell scripts under node_modules/.bin, as JavaScript. This
broke the API workflow despite unit tests passing.

**How to apply:** Use a runtime loader for optional native provider dependencies.
Verify the bundled API build as well as source-based tests whenever changing
dependency resolution.
