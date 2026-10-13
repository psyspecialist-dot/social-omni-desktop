# Social Najhin — CodeCanyon package / حزمة التوزيع

## Buyer package / حزمة المشتري

- `Installers/Windows`: x64 NSIS EXE. Unzip the downloaded CodeCanyon package,
  run the EXE, and choose an installation directory. Node.js is not needed.
- `Installers/macOS`: DMG and ZIP for Intel x64 and Apple Silicon arm64.
  Open the matching DMG and drag Social Najhin to Applications.
- `Source/social-najhin-desktop.zip`: prebuilt renderer and complete application
  source. Extract it to a separate directory outside any pnpm workspace.
- `Documentation`: setup, activation, troubleshooting, third-party notices.

تحتوي الحزمة على مثبّت Windows ونسختي macOS والمصدر والمستندات.
لا يحتاج المستخدم تثبيت Node.js لتشغيل المثبّت. لا تتضمن الحزمة أداة إصدار
الرخص أو مفتاح توقيع البائع الخاص.

The source ZIP is not itself an installer. To develop/rebuild it, use Node.js
20 for the packaging toolchain and pnpm 10.26.1:

```
pnpm install --frozen-lockfile --ignore-workspace --ignore-scripts
pnpm run check
pnpm run build:win --publish never
# On macOS:
pnpm run build:mac --publish never
```

Electron's embedded runtime is bundled separately. Do not downgrade Electron
to the packaging host's Node version. Builders download Chromium automatically.
Development mode is `pnpm run start:dev` after installing the Electron runtime
with its supported installer tooling; it is visibly marked and cannot unlock
installed binaries.

## Offline activation / التفعيل دون خادم

1. Open Settings → License. Select/copy your Machine ID.
2. Send the ID and purchase confirmation to the seller through a private channel.
3. The seller confirms the sale and returns an `SN1.…` signed license.
4. Paste the entire license into the License key field and select Activate.
5. Keep the license for reactivation on the same machine after a reinstall.

افتح الإعدادات ثم الترخيص، وانسخ معرّف الجهاز وأرسله للبائع مع إثبات الشراء.
الصق الرخصة الموقّعة كاملة واضغط تفعيل. لا يحتاج التفعيل أو التحقق خادماً
أو إنترنت. احتفظ بالرخصة لإعادة التفعيل على الجهاز نفسه.

License certificates are checked with the embedded Ed25519 public key and
saved using native OS encryption. A copied license cannot activate a different
Machine ID. Licenses are perpetual for a covered release; monthly/yearly plans
cover only updates and support. Offline certificates cannot be revoked remotely.
Automated social-platform actions still require internet and user authorization.
This custom activation key is NOT an Envato purchase code and does not verify
a CodeCanyon purchase automatically; the seller checks purchase evidence.

## Clipboard and editing / النسخ والتحرير

Use Ctrl+C/V on Windows or Cmd+C/V on macOS. The native Edit menu also supplies
Undo, Redo, Cut, Copy, Paste and Select All; right-click editable fields for the
context menu. The Machine ID is selectable/read-only. Its Copy button reports
success only after native clipboard read-back matches the ID. If the OS denies
clipboard access, select the field and copy manually.

## Configuration / الإعدادات

`licensing-config.json` in the desktop source:

```
{
  "enabled": true,
  "mode": "offline",
  "publicKey": "SELLER_PUBLIC_KEY",
  "serverUrl": "",
  "releaseDate": "2026-10-12T00:00:00.000Z"
}
```

Only the build owner changes this file and rebuilds installers. `enabled:false`
intentionally bypasses licensing and is clearly displayed in Settings. Do not
use it in a protected commercial release. Buyers receiving source can modify
and rebuild it: no client-side license scheme prevents source owners from doing
that. No signing secret or shared “secret salt” belongs in the app.
`mode:"online"` preserves the previous optional central-activation integration;
it requires a valid HTTPS server URL and matching public key.

يغيّر مالك الإصدار ملف الإعدادات ثم يعيد البناء. تعطيل `enabled` يتيح استخدام
التطبيق دون رخصة، ولا يُعد إثباتاً للشراء. لا يوجد مفتاح سري داخل التطبيق.
من يحصل على المصدر يمكنه تعديل الفحص وإعادة بناء نسخته.

## Troubleshooting / حل المشكلات

- Invalid device: issue a new device-specific license after seller review.
- Invalid signature: use the full unmodified license from this build's seller.
- Newer release: install a covered version or obtain renewed update entitlement.
- OS encryption unavailable: unlock the user's OS keychain/profile and retry;
  do not bypass encryption or store plaintext certificates.
- Windows SmartScreen/macOS Gatekeeper: these builds are not publisher-signed
  or notarized unless the seller configures code-signing credentials. Verify
  the seller and download integrity before opening. Do not disable OS security
  globally. Production signing/notarization is a separate release requirement.
- Browser automation requires complete bundled Chromium and platform consent.
  Social platform login, policy limits and restrictions remain in effect.

Approval by CodeCanyon is not guaranteed by this package. The seller must
provide an accurate item description, screenshots, support/contact information,
legal rights to assets, and comply with Envato's current review/licensing rules.
