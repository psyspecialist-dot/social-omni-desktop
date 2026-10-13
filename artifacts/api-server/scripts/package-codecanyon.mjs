import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const frontend = path.join(root, 'artifacts/social-omni-desktop');
const { zipSync, unzipSync } = createRequire(path.join(frontend, 'package.json'))('fflate');
const source = fs.readFileSync(path.join(frontend, 'public/downloads/social-najhin-desktop.zip'));
for (const name of Object.keys(unzipSync(source))) {
  if (/(?:signing-private|admin-token|keygen\.cjs|license-admin\.mjs|\.env(?:\/|$)|\.(?:pem|p12|pfx)$)/i.test(name)) throw new Error(`Unsafe buyer source entry: ${name}`);
}
const docs = path.join(root, 'distribution/codecanyon');
const buyer = { 'Social-Najhin/Source/social-najhin-desktop.zip': source };
for (const name of ['index.html', 'README.md', 'THIRD-PARTY-NOTICES.md']) {
  buyer[`Social-Najhin/Documentation/${name}`] = fs.readFileSync(path.join(docs, name));
}
buyer['Social-Najhin/Documentation/LICENSING.md'] = fs.readFileSync(path.join(frontend, 'desktop/LICENSING.md'));
buyer['Social-Najhin/README.txt'] = Buffer.from('Windows/macOS installers are added by the final GitHub Actions distribution job.\nRead Documentation/README.md before installation.\nاقرأ مستندات التثبيت والتفعيل. أدوات البائع غير مضمنة.\n');
const seller = {
  'seller-tools/keygen.cjs': fs.readFileSync(path.join(root, 'tools/licensing/keygen.cjs')),
  'seller-tools/SELLER.md': fs.readFileSync(path.join(docs, 'SELLER.md')),
};
const output = path.join(root, 'generated-artifacts/codecanyon');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'customer-source.zip'), zipSync(buyer, { level: 6 }));
fs.writeFileSync(path.join(output, 'seller-tools.zip'), zipSync(seller, { level: 6 }));
console.log('CodeCanyon customer source/docs and separate seller tools packaged; no private keys included.');
