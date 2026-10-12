# Social Najhin licensing / تراخيص سوشيال ناجحين

## Model / النموذج

One-time perpetual application entitlement. Updates/support can be none,
monthly, or yearly. Expired support does not stop use of a covered release.
Installing a release newer than the signed purchase/support period requires
renewal. Set `releaseDate` once per release; do not advance it for mere repacking.

شراء التطبيق لمرة واحدة. التحديثات والدعم اختيارية باشتراك شهري أو سنوي؛
انتهاؤهما لا يوقف استخدام التطبيق.

`maxDevices=1` is a normal license. Packs of 5, 10, 50 (or another configured
limit) share one activation key. The central authority atomically registers
each distinct Machine ID and issues an Ed25519-signed device certificate.
Repeated activation on the same machine does not consume another seat.

الترخيص العادي لجهاز واحد. مفتاح باقة الموزّع يفعّل العدد المحدد من الأجهزة،
وتكرار تفعيل الجهاز نفسه لا يستهلك مقعداً إضافياً.

The limit is the total number of distinct registered machines, not concurrent
online devices. Removing the local certificate does NOT release a seat.
Slots cannot safely be recycled while permanent offline certificates exist.
Disabling a key prevents new activation but cannot instantly revoke an
already-issued offline certificate. Renew support online with the same key.

الحد لعدد الأجهزة المختلفة المسجّلة إجمالاً، وليس للأجهزة المتصلة حالياً.
إزالة الشهادة المحلية لا تعيد المقعد. تعطيل المفتاح يمنع التفعيلات الجديدة،
ولا يلغي فوراً الشهادات الدائمة الصادرة دون اتصال.

## Owner setup / إعداد المالك

### Local development without Secrets / اختبار محلي دون Secrets

Run `pnpm run start:dev` (or `npm run start:dev`) from the exported desktop
source folder. It generates an ephemeral test signing pair and activates a
visibly marked local test license without contacting a server. Real Machine ID
and OS encryption are still required. Local development data lives in a
separate `local-dev` folder; normal app data and production trust settings are
unchanged. This is not a reseller ledger or evidence of production activation.
Installed builds reject `--dev-license`, and the signer is excluded from ASAR.
Production still requires the owner's private key and pinned public key.

شغّل `npm run start:dev` من مجلد مصدر التطبيق لاختبار محلي دون إدخال Secrets.
يُنشأ مفتاح توقيع مؤقت وترخيص اختبار واضح مع فصل بيانات التطوير. لا يتصل
بخادم، ولا يعمل هذا الوضع في ملفات التثبيت، ولا يغيّر إعدادات ترخيص الإنتاج.

1. On your own computer, generate the signing pair using
   `node artifacts/api-server/scripts/license-admin.mjs keygen`.
   Keys go outside Git into `~/.social-najhin-licensing/`. Never share the
   private file or include it in a desktop build.
2. Import `signing-private.base64` through Replit Secrets as
   `LICENSE_SIGNING_PRIVATE_KEY`, and `admin-token.txt` as `LICENSE_ADMIN_TOKEN`.
   Never paste either into chat or Git. Keep the admin token out of the desktop.
3. Publish the authority API with its PostgreSQL activation ledger. Publishing
   applies the development schema to production. Application records continue
   using the existing SQLite database; they are not migrated to PostgreSQL.
4. Set `desktop/licensing-config.json` to the published HTTPS server root and
   the matching public key from `signing-public.base64`. Re-export the desktop
   and build installers. Only this public trust anchor belongs in Git.
   The renderer cannot change the trusted public key.
5. Run administrative commands ONLY in the authorized authority environment
   connected to the intended database, or use the authenticated remote CLI
   below for the published service. Development keys do not automatically
   exist in production. License administration requires the owner's token.

يجب إعداد مفتاح التوقيع عبر Secrets ونشر خادم التفعيل ثم تضمين رابطه ومفتاحه
العام في الإصدار. الإصدار غير المهيأ لا يسمح بالتفعيل أو بالعمليات المرخّصة.
أوامر الإصدار والتجديد خاصة بالمالك داخل بيئة الخادم المعتمدة.

## Issue / إصدار

From the repository root, in the server workspace:

```
node artifacts/api-server/scripts/license-admin.mjs issue --devices 1 --plan monthly
node artifacts/api-server/scripts/license-admin.mjs issue --devices 5 --plan yearly
node artifacts/api-server/scripts/license-admin.mjs issue --devices 10 --plan yearly
node artifacts/api-server/scripts/license-admin.mjs issue --devices 50 --plan none
node artifacts/api-server/scripts/license-admin.mjs list
node artifacts/api-server/scripts/license-admin.mjs renew --id LICENSE_UUID --plan yearly
node artifacts/api-server/scripts/license-admin.mjs disable --id LICENSE_UUID
```

For production from the owner's computer, add `--server` with the actual
published HTTPS authority root to any issue/list/renew/disable command. Provide
`LICENSE_ADMIN_TOKEN` through your local secure environment, never a command
argument. This invokes authenticated administrative endpoints in production;
no production database connection string needs to be copied.

Issue prints the buyer's key once. Only its SHA-256 hash is stored centrally.
Deliver the key securely; do not save terminal output in Git or public logs.
Payments are handled outside this tool; issuing a license is not proof of a
payment or an automatic billing subscription.

المفتاح يظهر مرة واحدة عند الإصدار؛ تُخزَّن بصمته فقط في الخادم. سلّمه للمشتري
بشكل آمن. إدارة المفاتيح ليست بوابة دفع ولا اشتراك خصم مالي تلقائي.

## Desktop / التطبيق

Settings → License displays the hashed Machine ID, certificate status,
allowed devices, device count known at last activation, and support validity.
Activation requires internet. Afterwards verification is local, with the
OS-encrypted certificate and bundled public key, including after restart.
An invalid signature or different Machine ID is rejected. The key itself is
not retained locally. Read access and cancellation remain available when
unlicensed so users can inspect their records; writes and automation require
a valid license. macOS and Windows hardware/OS-encryption behavior still needs
native-device verification before release.
