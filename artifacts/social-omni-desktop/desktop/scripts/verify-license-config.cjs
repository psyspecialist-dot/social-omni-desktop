const crypto = require('node:crypto');

// Runs during source export and again on the actual packaged ASAR.
// Only the public verification key belongs in a buyer build.
function verifyLicenseConfiguration(config) {
  if (!config || typeof config.enabled !== 'boolean') {
    throw new Error('License configuration must explicitly set enabled to true or false.');
  }
  if (!['offline', 'online', 'cloud'].includes(config.mode)) {
    throw new Error('License configuration must explicitly select offline, online or cloud mode.');
  }
  if (!config.enabled) return config; // Preserve the owner's intentional source-build toggle.
  if (config.mode === 'cloud') {
    let url;
    try { url = new URL(config.serverUrl); } catch {
      throw new Error('Cloud licensing requires an HTTPS account website URL.');
    }
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
      throw new Error('Cloud licensing requires a clean HTTPS origin.');
    }
    return config;
  }
  try {
    const key = crypto.createPublicKey({
      key: Buffer.from(config.publicKey, 'base64'), format: 'der', type: 'spki',
    });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Unsupported key type');
  } catch {
    throw new Error('Enabled licensing requires a valid Ed25519 publicKey in licensing-config.json. Embed the existing seller public key before building.');
  }
  if (config.mode === 'online') {
    let url;
    try { url = new URL(config.serverUrl); } catch {
      throw new Error('Online licensing requires an HTTPS license server URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Online licensing requires a clean HTTPS license server URL.');
    }
  }
  if (config.releaseDate && !Number.isFinite(Date.parse(config.releaseDate))) {
    throw new Error('License configuration has an invalid releaseDate.');
  }
  return config;
}

module.exports = { verifyLicenseConfiguration };
