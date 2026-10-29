const fs = require('node:fs');
const path = require('node:path');
const repo = process.env.GITHUB_REPOSITORY;
const tag = 'v1.0.4';
const api = `https://api.github.com/repos/${repo}`;
const headers = { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json',
  'content-type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' };
async function request(route, options = {}) {
  const response = await fetch(`${api}${route}`, { headers, signal: AbortSignal.timeout(60000), ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`GitHub HTTP ${response.status}: ${body.message || 'request failed'}`);
  }
  return response.json();
}
function output(key, value) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
(async () => {
  const mode = process.argv[2];
  if (mode === 'prepare') {
    const releases = await request('/releases?per_page=100');
    let release = releases.find(r => r.tag_name === tag);
    if (release && !release.draft) throw new Error('Refusing to overwrite a published release.');
    const metadata = {
      tag_name: tag, target_commitish: process.env.GITHUB_SHA, name: 'Social Najhin 1.0.4 — unsigned installers',
      draft: true, prerelease: false,
      body: 'Private build draft. NOT published. Unsigned Windows x64 and macOS Intel/Apple Silicon installers. Apple notarization is disabled. Cloud account activation is enabled; passwords and signing keys are not included.',
    };
    release = await request(release ? `/releases/${release.id}` : '/releases', {
      method: release ? 'PATCH' : 'POST', body: JSON.stringify(metadata),
    });
    output('release_id', release.id);
    console.info(`Prepared unpublished draft ${tag}.`);
    return;
  }
  const release = await request(`/releases/${process.env.RELEASE_ID}`);
  if (!release.draft || release.tag_name !== tag || release.target_commitish !== process.env.GITHUB_SHA) {
    throw new Error('Release draft does not match this source commit.');
  }
  if (mode === 'download-source') {
    const asset = release.assets.find(a => a.name === 'social-najhin-desktop.zip');
    if (!asset) throw new Error('Standalone source asset is missing.');
    const response = await fetch(`${api}/releases/assets/${asset.id}`, {
      headers: { ...headers, accept: 'application/octet-stream' }, signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}`);
    const destination = path.join(process.env.RUNNER_TEMP, 'najhin-source', asset.name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
    console.info('Downloaded the exact standalone source for this build.');
  } else if (mode === 'verify') {
    const required = [
      'Social-Najhin-1.0.4-win-x64.exe',
      'Social-Najhin-1.0.4-mac-x64.dmg', 'Social-Najhin-1.0.4-mac-arm64.dmg',
      'Social-Najhin-1.0.4-mac-x64.zip', 'Social-Najhin-1.0.4-mac-arm64.zip',
      'SHA256SUMS-Windows.txt', 'SHA256SUMS-macOS.txt',
    ];
    for (const name of required) {
      const asset = release.assets.find(a => a.name === name && a.state === 'uploaded');
      if (!asset || asset.size < (name.endsWith('.txt') ? 64 : 1024 * 1024)) throw new Error(`Missing or incomplete build output: ${name}`);
    }
    const run = `https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Social Najhin 1.0.4\nAll five native installer/app outputs and both SHA-256 lists uploaded.\n\nDraft release remains unpublished and unsigned.\n\nBuild: ${run}\n`);
    console.info('Verified all five installers/app archives and both checksum files. Draft remains unpublished.');
  } else throw new Error('Unknown release-assets operation.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
