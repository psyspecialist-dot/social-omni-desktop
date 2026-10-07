---
name: Bilingual Social Najhin scope
description: Standing Arabic/English and RTL expectations for all app surfaces.
---

Social Najhin must support instantaneous AR/EN switching across every module,
including navigation, buttons, titles, status badges and the built-in guide.
Arabic uses RTL with Arabic-capable typography; English uses LTR. Preserve the
dark theme and blue, green, yellow and red accents.

**Why:** The user explicitly required full bilingual support while adding the
Help & Guidelines / دليل الاستخدام والإرشادات section, not just a translated
guide page.

**How to apply:** Localize future UI additions as well as the guide. Language
changes affect presentation, not stored user content or canonical API values.
Keep all existing modules active and preserve local SQLite/macOS execution.

Validate both catalog-key coverage and unwrapped/static and dynamic UI labels.
A catalog check of existing translation calls alone can pass while entire
modules, conditional actions or enum badges still appear in English.

**Why:** During localization, key-only coverage was complete even though several
module views and status labels remained untranslated.

Treat the user's official Social Najhin logo as brand artwork in both languages;
retain its embedded English wordmark rather than translating or redrawing it.
Localize surrounding captions and keep the original image unchanged when deriving
small application icons.

**Why:** The user supplied the professional logo as the official branding asset
while requiring continued full Arabic/English functionality.

**How to apply:** Preserve that artwork during future bilingual UI or branding
changes; language switching changes the interface, not the official logo.
