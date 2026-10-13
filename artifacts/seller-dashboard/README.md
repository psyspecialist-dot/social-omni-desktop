# Social Najhin Seller Dashboard — seller only

Open the **Seller Dashboard** artifact in Replit. Set `SELLER_DASHBOARD_PASSWORD`
in Replit Secrets once (16–256 characters), then sign in. No terminal is needed
for daily generation: paste a buyer's 64-character Device ID, choose a plan,
generate, and copy the signed SN1 key.

The isolated Node.js/Express server imports the existing `tools/licensing/keygen.cjs`
issuer. It never sends the private signing key to the browser, accepts issuer
paths from requests, logs passwords/keys, or starts an automatic initialization.
It uses the existing issuer in `~/.social-najhin-offline-issuer/` and checks that
its public key matches the desktop config before issuing. Missing/mismatched
keys show an explicit setup error; restore the ORIGINAL issuer, never rotate it
while released installers depend on its public key.

**Plan semantics are unchanged:** all licenses authorize permanent app use.
Monthly/Yearly add calendar-month/year updates and support. Lifetime and None
both mean permanent access with no additional support period. Lifetime does NOT
promise lifetime updates, and Monthly/Yearly do NOT expire the application.

Seller sessions last eight hours, are revoked by sign-out, and are invalidated
by server restart. The browser stores only a short-lived session token in
sessionStorage, not the password or signing key. This works inside Replit's
preview without third-party cookies. Keep this tool seller-only.

The dashboard is separate from the buyer application and omitted by the
desktop source exporter (which includes only the desktop and shared API
artifacts). Do not add it to a buyer/CodeCanyon archive.

The signing key currently lives outside Git and the deployed source. Do not
publish expecting that file to be copied automatically; publishing this issuer
requires a separately planned secure, durable signing-key setup. Keep an
encrypted backup of the original key outside distributions.

Development: managed Replit workflow runs `node server/index.mjs` with Vite
middleware. Production: build the frontend, then run `NODE_ENV=production node
server/index.mjs`. Express serves only the public build, never the server/tools
or signing directory. Contract lives in `lib/api-spec/openapi.yaml`.
