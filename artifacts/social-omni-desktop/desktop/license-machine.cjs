const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
function machineId({ platform = process.platform, run = execFileSync, read = readFileSync } = {}) {
  let identifier;
  const opts = { encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 256 * 1024 };
  if (platform === 'darwin') {
    identifier = run('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], opts).match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1];
  } else if (platform === 'win32') {
    identifier = run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'),
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], opts).match(/MachineGuid\s+REG_SZ\s+([^\s]+)/i)?.[1];
  } else if (platform === 'linux') {
    identifier = read('/etc/machine-id', 'utf8').trim();
  }
  if (!identifier || !/^[a-f0-9-]{16,64}$/i.test(identifier) || /^0+$/.test(identifier.replace(/-/g, ''))) throw new Error('Machine ID is unavailable. Activation was not attempted.');
  // Never disclose the raw OS hardware identifier to the server or renderer.
  return createHash('sha256').update(`social-najhin:machine:v1:${identifier.toLowerCase()}`).digest('hex');
}
module.exports = { machineId };
