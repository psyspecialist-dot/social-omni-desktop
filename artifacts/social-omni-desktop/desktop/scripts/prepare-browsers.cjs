// Runs on the release builder, never on a customer's computer.
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

function target(platform, arch) {
  const name = typeof arch === 'string' ? arch : ({ 1: 'x64', 3: 'arm64' })[arch];
  if (platform === 'win32' && name === 'x64') return { directory: 'win-x64', host: 'win64' };
  if (platform === 'darwin' && ['x64', 'arm64'].includes(name)) {
    return { directory: `mac-${name}`, host: name === 'arm64' ? 'mac15-arm64' : 'mac15' };
  }
  throw new Error(`Unsupported release target: ${platform}/${name || arch}`);
}
function hasChromium(root) {
  if (!fs.existsSync(root)) return false;
  return fs.readdirSync(root).some(name => /^chromium-\d+$/.test(name) &&
    fs.existsSync(path.join(root, name, 'INSTALLATION_COMPLETE')));
}
async function prepare(context) {
  const selected = target(context.electronPlatformName, context.arch);
  const root = path.resolve(__dirname, '..', 'browser-runtime', selected.directory);
  fs.mkdirSync(root, { recursive: true });
  const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
  const result = spawnSync(process.execPath, [cli, 'install', 'chromium', '--no-shell'], {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: root, PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: selected.host },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !hasChromium(root)) throw new Error(`Bundled Chromium preparation failed for ${selected.directory}.`);
}
module.exports = prepare;
module.exports.target = target;
module.exports.hasChromium = hasChromium;
