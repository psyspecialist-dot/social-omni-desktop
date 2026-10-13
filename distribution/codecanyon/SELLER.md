# SELLER ONLY / للبائع فقط

Do NOT include this tool bundle or your private signing directory in the
customer/CodeCanyon ZIP. A buyer receives only the verifier, public key and
their device-bound signed license. Never ship a default private key.

## Initial setup

From the repository root:

```
node tools/licensing/keygen.cjs init --config artifacts/social-omni-desktop/desktop/licensing-config.json
```

For the standalone seller-tools ZIP, use `node keygen.cjs init --config PATH`,
where PATH is the customer desktop source's `licensing-config.json`.

The key pair is generated on the seller's machine into
`~/.social-najhin-offline-issuer/` with restricted file permissions. Only the
public key is inserted into the desktop config and committed. Back up the
private signing file securely OUTSIDE the distribution. Losing it prevents
issuing new licenses for binaries already pinned to its public key.
`configure --config PATH` reuses an existing public key without rotating keys.
Do not overwrite/rotate the issuer while existing customers depend on it.

## Issue a license

```
node tools/licensing/keygen.cjs issue --device DEVICE_ID
node tools/licensing/keygen.cjs issue --device DEVICE_ID --plan monthly
node tools/licensing/keygen.cjs issue --device DEVICE_ID --plan yearly
```

Deliver only the output `licenseKey` to that buyer. Each certificate authorizes
one specific Machine ID; it is NOT a freely transferable pack key. For offline
reseller sales, issue separately signed IDs and keep an accurate seller register.
There is no central cross-issuer/global device ledger in offline mode. Do not
promise a globally enforced shared 5/10/50-device key without the optional
online authority. Old permanent certificates cannot be remotely revoked.
Confirm Envato purchase validity manually before issuance. Do not confuse this
key with an Envato purchase code or automate a payment charge.

يُنشئ البائع المفاتيح على جهازه؛ لا يظهر المفتاح الخاص في المخرجات.
أصدر رخصة منفصلة لكل معرّف جهاز، وأرسل الرخصة فقط للمشتري. احتفظ بسجل البيع
ونسخة آمنة من مفتاح التوقيع خارج Git وحزمة المشتري. التحقق من شراء CodeCanyon
يتم بواسطة البائع؛ ولا يمكن سحب الرخص الدائمة الصادرة دون اتصال عن بُعد.

## Distribution

```
pnpm --filter @workspace/social-omni-desktop run desktop:export
pnpm --filter @workspace/social-omni-desktop run desktop:distribution
git push origin main
```

GitHub Actions builds native installers, verifies them, then assembles
`codecanyon-customer-package` with Windows/macOS installers, source and docs.
`seller-tools` is a separate artifact for the seller only.
Never upload all GitHub artifacts together to CodeCanyon.

Native application usage, clipboard shortcuts, OS encryption, real platform
sign-in and real SMTP/SMS delivery should be validated on representative customer
machines before advertising compatibility. Package build success alone does
not prove every third-party integration works on every machine.
