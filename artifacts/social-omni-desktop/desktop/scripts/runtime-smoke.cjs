// Run with Electron's embedded Node; never uses customer databases or accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const createService = require('../api-service.cjs');
const { randomUUID } = require('node:crypto');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-runtime-'));
  const workspace = randomUUID();
  let service, server;
  const start = async () => {
    service = createService({ express, dbPath: path.join(directory, 'workspace.sqlite') });
    const app = express(); app.use(express.json()); app.use('/api/socialomni', service.router);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  };
  const stop = async () => { await new Promise(resolve => server.close(resolve)); await service.close(); server = service = null; };
  const api = async (method, route, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/socialomni${route}`, {
      method, headers: { 'content-type': 'application/json', 'x-socialomni-workspace': workspace },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(response.status, 200); return response.json();
  };
  try {
    const SQL = await require('sql.js')({ locateFile: file => require.resolve(`sql.js/dist/${file}`) });
    const db = new SQL.Database();
    db.run('CREATE TABLE smoke (value TEXT); INSERT INTO smoke VALUES ("persistent")');
    const file = path.join(directory, 'local.sqlite');
    fs.writeFileSync(file, db.export()); db.close();
    const reopened = new SQL.Database(fs.readFileSync(file));
    assert.equal(reopened.exec('SELECT value FROM smoke')[0].values[0][0], 'persistent'); reopened.close();
    await start(); await api('POST', '/initialize');
    await api('POST', '/accounts', { platform: 'WhatsApp', displayLabel: 'Runtime smoke', handle: 'fixture', status: 'Active label' });
    await stop(); await start();
    assert.equal((await api('GET', '/state')).store.accounts[0].displayLabel, 'Runtime smoke');
    console.log(`Electron Node ${process.versions.node}: SQLite WASM, API startup and disk persistence passed.`);
  } finally {
    if (server) await stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
