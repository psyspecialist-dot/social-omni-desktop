import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'vite', 'build', '--config', 'vite.config.ts'],
  {
    cwd: appDirectory,
    env: { ...process.env, NODE_ENV: 'production', PORT: '5173', BASE_PATH: './' },
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const output = path.join(appDirectory, 'dist', 'public');
if (!existsSync(path.join(output, 'index.html'))) throw new Error('No renderer build was produced.');
const destination = path.join(appDirectory, 'desktop', 'renderer');
rmSync(destination, { recursive: true, force: true });
cpSync(output, destination, { recursive: true, filter: (source) => !source.includes(`${path.sep}downloads`) });
cpSync(path.resolve(appDirectory, '..', '..', 'lib', 'socialomni-api', 'service.cjs'), path.join(appDirectory, 'desktop', 'api-service.cjs'));
for (const file of ['validation.cjs', 'worker.cjs', 'leads.cjs', 'browser-worker.cjs']) {
  cpSync(path.resolve(appDirectory, '..', '..', 'lib', 'socialomni-api', file), path.join(appDirectory, 'desktop', file));
}
process.stdout.write(`Desktop renderer exported to ${destination}\n`);
const bundle = spawnSync(process.execPath, [path.resolve(appDirectory, '../api-server/scripts/bundle-desktop.mjs')], { stdio: 'inherit' });
if (bundle.error) throw bundle.error;
if (bundle.status !== 0) process.exit(bundle.status ?? 1);
