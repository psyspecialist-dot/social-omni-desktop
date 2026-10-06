# Social Najhin

A local-first desktop social-management suite with a React browser preview, a standalone Electron edition and explicitly approved local browser automation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/social-omni-desktop run dev` — browser preview through the managed web workflow
- `pnpm --filter @workspace/social-omni-desktop run desktop:export` — build the portable desktop renderer
- Desktop launch: inside `artifacts/social-omni-desktop/desktop`, run `npm install` then `npm start`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Desktop DB: SQLite for current records through loopback Express API; legacy SQL.js SQLite is read once for migration
- Browser preview: SQLite on the Replit development server, scoped by a browser-local anonymous workspace ID, independent of desktop records
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/social-omni-desktop/src/App.tsx` — renderer routes and local workspace controls
- `artifacts/social-omni-desktop/src/lib/workspace.ts` — data models, validation, example records
- `artifacts/social-omni-desktop/src/lib/persistence.ts` — legacy local record reader and official platform handoff
- `artifacts/social-omni-desktop/src/lib/api.ts` — local API client
- `lib/socialomni-api/` — shared Express routes, validation, SQLite media storage, and sequential simulation worker
- `artifacts/social-omni-desktop/src/index.css` — theme and responsive styles
- `artifacts/social-omni-desktop/desktop/` — standalone package, main process, preload, local-run instructions
- `artifacts/social-omni-desktop/scripts/export-desktop.mjs` — relative-asset renderer export
- The shared API server hosts the browser-preview SQLite API; Electron hosts the same service on a protected loopback port.

## Architecture decisions

- Live WhatsApp text sending and Facebook keyword discovery/approved group join/post flows execute in visible local Playwright Chromium browsers. Users sign in manually; account-isolated browser profiles retain sessions outside SQLite. No credential pasting, stealth, CAPTCHA solving, restriction bypass or automatic action retries.
- The Electron renderer has Node.js disabled and uses a whitelisted preload bridge for local persistence and platform opening.
- Due scheduled items become review reminders on the next API poll; paused reminders do not progress.
- Live controls and rehearsal controls remain explicitly distinct. The browser preview cannot execute live tasks; only the downloaded desktop service receives a Playwright adapter.

## Product

- Campaign draft CRUD, scheduling, review states, pause/resume, manual sent/failed tracking
- Simulated accounts for Facebook, Instagram, TikTok, and WhatsApp; fake demo-session references only, with official-site manual handoff
- Local contact records with explicit consent indicators and lists; no sending
- Light/dark themes, persistent simulation settings, live activity logs and per-target queue tables
- Downloadable Electron source folder with the prebuilt renderer from Settings
- Working Express CRUD routes, anonymous preview SQLite, native local SQLite, live browser worker and rehearsal worker, enforced 5–12 second pacing
- Phone lists, formatted message templates, saved image/video attachments, campaign keywords and target counts; sequential simulated sends, joins, and posts with cancellation
- Sidebar modules: Overview & Analytics, Accounts Manager, WhatsApp Marketing, Facebook & Instagram Automation, Google Maps Leads, Settings & Future License; campaigns and contacts remain available
- Google Maps Lead Extractor is a local simulation only: niche/location drafts and synthetic business results persist in SQLite; no actual Google Maps scraping or lead collection
- Lead results export as CSV and real XLSX; fictional phone ranges and reserved .example websites prevent synthetic records from masquerading as verified business contacts
- Overview distinguishes server-accepted live messages from cumulative simulated sends. Live runs require explicit recipient consent/group posting permission, use reviewed group URLs (up to 20), and stop on platform restrictions or uncertain outcomes.
- Future-license input is a locally persisted placeholder only; it does not activate, validate, or restrict use

## User preferences

- The desktop app is intended to run locally on the user's own computer.

## Gotchas

- Browser and desktop SQLite storage are separate. Do not claim the preview imports or syncs desktop records. The preview lives on a Replit development server, not on the viewer's device.
- Never silently replace invalid saved records; loading errors must preserve stored data.
- Rebuild/export the renderer and regenerate the public desktop archive after renderer changes.
- Desktop native execution is not verified by a browser screenshot. The distribution is source, not a signed installer.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
