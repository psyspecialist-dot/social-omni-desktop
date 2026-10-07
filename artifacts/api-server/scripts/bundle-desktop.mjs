import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, lstatSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const frontend = path.join(root, 'artifacts/social-omni-desktop');
const { zipSync } = createRequire(path.join(frontend, 'package.json'))('fflate');
const files = {};
const excluded = new Set(['node_modules', '.git', '.replit-artifact', 'data', 'dist', 'downloads', '.agents', '.local']);
function add(source, destination) {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const entry of readdirSync(source).sort()) {
      if (excluded.has(entry) || entry.startsWith('.env') || /\.(sqlite|db|log)(-|$)/i.test(entry)) continue;
      add(path.join(source, entry), `${destination ? `${destination}/` : ''}${entry}`);
    }
  } else if (stat.isFile()) {
    files[`social-najhin-desktop/${destination}`] = new Uint8Array(readFileSync(source));
  }
}
for (const required of ['main.js', 'preload.js', 'browser-ipc.cjs', 'package.json', 'README.md', 'renderer/index.html', 'api-service.cjs', 'validation.cjs', 'worker.cjs', 'leads.cjs', 'browser-worker.cjs', 'advanced-browser.cjs', 'automation-errors.cjs']) {
  if (!existsSync(path.join(frontend, 'desktop', required))) throw new Error(`Missing desktop file: ${required}. Run desktop:export first.`);
}
add(path.join(frontend, 'desktop'), '');
// Keep the original branding assets available when rebuilding the included source.
add(path.join(frontend, 'public', 'assets'), 'source/artifacts/social-omni-desktop/public/assets');
// Include the complete application source alongside the ready-to-run desktop root.
for (const artifact of ['social-omni-desktop', 'api-server']) {
  for (const entry of readdirSync(path.join(root, 'artifacts', artifact)).sort()) {
    if (excluded.has(entry) || ['desktop', 'public'].includes(entry) || entry.startsWith('.')) continue;
    add(path.join(root, 'artifacts', artifact, entry), `source/artifacts/${artifact}/${entry}`);
  }
}
add(path.join(root, 'lib'), 'source/lib');
for (const entry of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'tsconfig.json', 'tsconfig.base.json']) {
  if (existsSync(path.join(root, entry))) add(path.join(root, entry), `source/${entry}`);
}
const output = path.join(frontend, 'public/downloads/social-najhin-desktop.zip');
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(`${output}.tmp`, zipSync(files, { level: 6 }));
renameSync(`${output}.tmp`, output);
// Preserve older direct download bookmarks without serving an outdated build.
copyFileSync(output, path.join(frontend, 'public/downloads/socialomni-desktop.zip'));
process.stdout.write(`Bundled ${Object.keys(files).length} application files into ${output}\n`);
