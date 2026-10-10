// Run from the workspace: pnpm run test:desktop (requires a desktop display).
// Exercises the downloadable archive, never the hosted API or Vite renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import electronPath from 'electron';

const directory = path.dirname(fileURLToPath(import.meta.url));
const rendererRequire = createRequire(path.resolve(directory, '../package.json'));
const { unzipSync, strFromU8 } = rendererRequire('fflate');
const archive = path.resolve(process.argv[2] || path.join(directory, '../public/downloads/socialomni-desktop.zip'));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'socialomni-native-'));
const desktop = path.join(temporary, 'desktop');
const downloads = path.join(temporary, 'downloads');
const config = path.join(temporary, 'config');
const evidence = path.resolve(process.env.DESKTOP_EVIDENCE_DIR || 'tmp/desktop-smoke');
const errors = [];
const launches = [];
let app;

// Materialize production dependency trees, rather than linking the test app to
// the workspace. The standalone package's main, preload and renderer stay intact.
async function stageDependency(name, importer, destination) {
  const resolve = createRequire(importer);
  let entry;
  try { entry = resolve.resolve(`${name}/package.json`); }
  catch { entry = resolve.resolve(name); }
  let source = path.dirname(entry);
  while (true) {
    try {
      if (JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8')).name === name) break;
    } catch {}
    const parent = path.dirname(source);
    assert.notEqual(parent, source, `Could not locate package ${name}`);
    source = parent;
  }
  const manifest = JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8'));
  const target = path.join(destination, 'node_modules', name);
  await fs.cp(source, target, {
    recursive: true,
    dereference: true,
    filter: entry => !path.relative(source, entry).split(path.sep).includes('node_modules'),
  });
  for (const dependency of Object.keys(manifest.dependencies || {})) {
    await stageDependency(dependency, path.join(source, 'package.json'), target);
  }
  return manifest.version;
}

async function launch() {
  const env = { ...process.env, XDG_CONFIG_HOME: config };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    executablePath: electronPath,
    args: [desktop, '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    env,
    timeout: 30000,
  });
  app.process().stderr.on('data', chunk => launches.push(chunk.toString()));
  const page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  assert.ok(page.url().startsWith('file:'), 'Must use the prebuilt local renderer');
  await page.waitForFunction(() => window.socialOmni?.isDesktop === true);
  const runtime = await app.evaluate(({ app }) => {
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
    const db = new DatabaseSync(':memory:');
    const probe = db.prepare('SELECT 1 AS ok').get().ok;
    db.close();
    return { versions: process.versions, userData: app.getPath('userData'), probe };
  });
  assert.equal(runtime.probe, 1);
  assert.ok(runtime.userData.startsWith(config + path.sep), 'Test must not touch real user data');
  // Successful renderer IPC against /state establishes startup of the embedded
  // loopback API, not merely the presence of a native window.
  await page.waitForFunction(async () => {
    const state = await window.socialOmni.apiRequest('GET', '/state');
    return state.initialized;
  });
  await page.getByRole('link', { name: 'Google Maps Leads', exact: true }).click();
  await page.getByTestId('input-lead-keyword').waitFor();
  return { page, runtime };
}

const state = page => page.evaluate(() => window.socialOmni.apiRequest('GET', '/state'));
async function waitForState(page, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await state(page);
    if (predicate(value)) return value;
    await page.waitForTimeout(200);
  }
  throw new Error('Timed out waiting for saved desktop state');
}

async function download(page, format) {
  const savePath = path.join(downloads, `native-leads.${format}`);
  // Replace only the OS file-picker interaction, leaving the renderer button,
  // Blob URL, Chromium download, and Electron DownloadItem fully exercised.
  await app.evaluate(({ BrowserWindow }, savePath) => {
    globalThis.smokeDownload = { done: false };
    BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => {
      item.setSavePath(savePath);
      globalThis.smokeDownload.filename = item.getFilename();
      item.once('done', (_event, status) => {
        globalThis.smokeDownload = { ...globalThis.smokeDownload, done: true, status };
      });
    });
  }, savePath);
  await page.getByTestId(`button-export-${format}`).click();
  const deadline = Date.now() + 15000;
  let result;
  do {
    result = await app.evaluate(() => globalThis.smokeDownload);
    if (result.done) break;
    await page.waitForTimeout(100);
  } while (Date.now() < deadline);
  assert.equal(result.status, 'completed', JSON.stringify(result));
  assert.match(result.filename, new RegExp(`^socialomni-simulated-leads-.*\\.${format}$`));
  return fs.readFile(savePath);
}

try {
  assert.equal(process.platform, 'linux', 'This harness currently isolates Electron user data using Linux XDG paths');
  await fs.mkdir(downloads, { recursive: true });
  await fs.mkdir(evidence, { recursive: true });
  for (const [entry, bytes] of Object.entries(unzipSync(await fs.readFile(archive)))) {
    const destination = path.resolve(temporary, entry);
    assert.ok(destination.startsWith(temporary + path.sep), 'Unsafe archive path');
    if (entry.endsWith('/')) { await fs.mkdir(destination, { recursive: true }); continue; }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
  const manifest = JSON.parse(await fs.readFile(path.join(desktop, 'package.json'), 'utf8'));
  const dependencies = {};
  for (const name of Object.keys(manifest.dependencies)) {
    const importer = name === 'express'
      ? path.resolve(directory, '../../api-server/package.json')
      : path.resolve(directory, '../../../package.json');
    dependencies[name] = await stageDependency(name, importer, desktop);
  }
  let { page, runtime } = await launch();
  const bridgeSafety = await page.evaluate(() => ({
    require: typeof window.require, process: typeof window.process,
  }));
  assert.deepEqual(bridgeSafety, { require: 'undefined', process: 'undefined' });
  await page.getByTestId('input-lead-keyword').fill('Café, "Native"');
  await page.getByTestId('input-lead-city').fill('Test City');
  await page.getByTestId('input-lead-count').fill('3');
  await page.getByTestId('button-save-leads').click();
  await waitForState(page, s => s.leads.keyword === 'Café, "Native"' && s.leads.targetCount === 3);
  await page.getByTestId('button-run-leads').click();
  const completed = await waitForState(page, s => s.jobs[0]?.status === 'Completed' && s.leads.results.length === 3);
  assert.ok(completed.leads.results.every(lead => lead.simulated && lead.website.endsWith('.example')));
  // Also exercise the retained SQL.js legacy key-value bridge.
  await page.evaluate(() => window.socialOmni.setItem('socialomni.native-probe', 'saved'));
  await app.close();
  app = null;

  ({ page } = await launch());
  assert.equal(await page.getByTestId('input-lead-keyword').inputValue(), completed.leads.keyword);
  assert.equal(await page.getByTestId('input-lead-city').inputValue(), 'Test City');
  assert.equal(await page.getByTestId('input-lead-count').inputValue(), '3');
  const reopened = await state(page);
  assert.deepEqual(reopened.leads, completed.leads);
  assert.deepEqual(reopened.jobs, completed.jobs);
  assert.equal(await page.evaluate(() => window.socialOmni.getItem('socialomni.native-probe')), 'saved');
  await page.locator('[data-testid^="row-lead-"]').first().waitFor();
  assert.equal(await page.locator('[data-testid^="row-lead-"]').count(), 3);

  const csv = await download(page, 'csv');
  const csvText = csv.toString('utf8');
  assert.ok(csvText.startsWith('\uFEFF'));
  assert.equal(csvText.trim().split('\r\n').length, 4);
  assert.ok(csvText.includes('Demo Café, ""Native"" 001'));
  for (const lead of reopened.leads.results) assert.ok(csvText.includes(`"'${lead.phoneNumber}"`));
  const xlsx = await download(page, 'xlsx');
  const files = unzipSync(xlsx);
  assert.ok(files['[Content_Types].xml']);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.equal((sheet.match(/<row /g) || []).length, 4);
  assert.equal((sheet.match(/t="inlineStr"/g) || []).length, 20);
  for (const lead of reopened.leads.results) {
    assert.ok(sheet.includes(lead.phoneNumber));
    assert.ok(sheet.includes(lead.website));
  }
  await page.screenshot({ path: path.join(evidence, 'native-window.png'), fullPage: true });
  await fs.writeFile(path.join(evidence, 'leads.csv'), csv);
  await fs.writeFile(path.join(evidence, 'leads.xlsx'), xlsx);

  // A real in-progress job must become interrupted on the next process launch.
  await page.getByTestId('input-lead-count').fill('200');
  await page.getByTestId('button-run-leads').click();
  const running = await waitForState(page, s => s.jobs[0]?.status === 'Running');
  await app.close();
  app = null;
  ({ page } = await launch());
  const interrupted = await state(page);
  const previous = interrupted.jobs.find(job => job.id === running.jobs[0].id);
  assert.equal(previous.status, 'Failed');
  assert.equal(previous.phase, 'Interrupted');
  assert.equal(previous.nextActionAt, null);
  assert.equal(interrupted.leads.targetCount, 200);
  assert.deepEqual(interrupted.leads.results.slice(0, 3), completed.leads.results);
  const resultCount = interrupted.leads.results.length;
  await page.waitForTimeout(1500);
  assert.equal((await state(page)).leads.results.length, resultCount, 'Interrupted job must not resume automatically');
  assert.deepEqual(errors, [], 'Renderer must have no uncaught errors');
  const report = {
    archive, platform: `${process.platform}-${process.arch}`, dependencies,
    electron: runtime.versions.electron, node: runtime.versions.node, sqlite: runtime.versions.sqlite,
    checks: ['embedded node:sqlite', 'file renderer and sandboxed preload', 'local API startup',
      'UI draft save', 'completed simulation', 'draft/results/job persistence after restart',
      'legacy storage persistence', 'native CSV download and bytes', 'native XLSX download and OOXML',
      'interrupted job recovery without auto-resume', 'no uncaught renderer errors'],
    limitations: ['Linux x64 with virtual X11 display; Windows/macOS not executed',
      'DownloadItem save path automated; OS file-picker UI not exercised',
      'Production dependencies staged from installed packages; fresh npm install not exercised',
      '--no-sandbox and --disable-gpu are test-container flags, not shipping defaults'],
  };
  await fs.writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (app) await app.close();
  await fs.writeFile(path.join(evidence, 'electron-stderr.log'), launches.join('')).catch(() => {});
  await fs.rm(temporary, { recursive: true, force: true });
}
