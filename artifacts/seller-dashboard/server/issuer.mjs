import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

// Server-only: import the existing issuer; never execute user-controlled commands.
const { issue } = createRequire(import.meta.url)('../../../tools/licensing/keygen.cjs');
const desktopConfig = new URL('../../social-omni-desktop/desktop/licensing-config.json', import.meta.url);
export const defaultDirectory = path.join(os.homedir(), '.social-najhin-offline-issuer');

export function createIssuer({ directory = defaultDirectory, configFile = desktopConfig } = {}) {
  function check() {
    try {
      const encoded = fs.readFileSync(path.join(directory, 'signing-private.base64'), 'utf8').trim();
      const privateKey = crypto.createPrivateKey({
        key: Buffer.from(encoded, 'base64'), type: 'pkcs8', format: 'der',
      });
      if (privateKey.asymmetricKeyType !== 'ed25519') {
        return 'The existing issuer is not an Ed25519 key. Restore the original signing key; do not generate a replacement.';
      }
      const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (config.publicKey !== publicKey) {
        return 'The issuer does not match the desktop public key. Restore the matching issuer before generating licenses.';
      }
      return null;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return 'Initial issuer setup or private signing key is missing. Restore your existing seller issuer and desktop public-key configuration. No new keys are generated automatically.';
      }
      return 'The existing issuer could not be loaded. Check its permissions and restore the original signing key and desktop configuration.';
    }
  }
  return {
    check,
    generate(deviceId, plan) {
      const setupError = check();
      if (setupError) throw new Error(setupError);
      const result = issue(deviceId, { directory, plan: plan === 'lifetime' ? 'none' : plan });
      return { ...result, plan };
    },
  };
}
