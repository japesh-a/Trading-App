import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { runMigrations } from './migrations.mjs';
import { healthStatus } from './health.mjs';
import { checkDeployment } from './deploy-check.mjs';

const root = import.meta.dirname;
const read = file => readFileSync(path.join(root, file), 'utf8');

test('health report is ok on a migrated database and degraded on a broken one', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  const report = healthStatus(db, { NODE_ENV: 'production', WICKLUME_PERSISTENT_DISK: 'true', WICKLUME_VERSION: 'abc123', WICKLUME_ENV: 'staging' });
  assert.equal(report.ok, true);
  assert.equal(report.version, 'abc123');
  assert.equal(report.environment, 'staging');
  assert.equal(report.persistentDisk, true);
  assert(report.schemaVersion >= 1);
  const broken = healthStatus(new DatabaseSync(':memory:'), {});
  assert.equal(broken.ok, false);
  assert.equal(broken.status, 'degraded');
});

test('health report exposes no secrets or personal data', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  const text = JSON.stringify(healthStatus(db, { GOOGLE_CLIENT_ID: 'client-id-secret', TWELVE_DATA_API_KEY: 'key-secret', OPENAI_API_KEY: 'sk-secret', OPENAI_MODEL: 'm' }));
  for (const secret of ['client-id-secret', 'key-secret', 'sk-secret']) assert(!text.includes(secret));
  assert(text.includes('"googleSignIn":true'));
});

test('server answers /healthz and sends HSTS in production', () => {
  const server = read('server.mjs');
  assert(server.includes("'/healthz'"));
  assert(server.includes('Strict-Transport-Security'));
});

async function fakeSite(health) {
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') { res.writeHead(health.status ?? 200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(health.body)); }
    res.writeHead(200); res.end('ok');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test('deploy check passes a healthy site and fails an unhealthy one', async () => {
  const good = await fakeSite({ body: { ok: true, environment: 'staging', persistentDisk: true } });
  const bad = await fakeSite({ status: 503, body: { ok: false } });
  try {
    assert.equal((await checkDeployment(good.url, { allowHttp: true, expectEnvironment: 'staging' })).ok, true);
    assert.equal((await checkDeployment(good.url, { allowHttp: true, expectEnvironment: 'production' })).ok, false);
    assert.equal((await checkDeployment(bad.url, { allowHttp: true })).ok, false);
  } finally { good.close(); bad.close(); }
});

test('deploy check requires HTTPS and a persistent disk in production', async () => {
  const prod = await fakeSite({ body: { ok: true, environment: 'production', persistentDisk: false } });
  try {
    const plain = await checkDeployment(prod.url);
    assert(plain.failures.some(message => message.includes('HTTPS')));
    const noDisk = await checkDeployment(prod.url, { allowHttp: true });
    assert(noDisk.failures.some(message => message.includes('persistent disk')));
  } finally { prod.close(); }
});

test('example blueprint has staging and pilot, health checks, no secrets and no auto-deploy', () => {
  const blueprint = read('render.yaml');
  assert(blueprint.includes('wicklume-staging') && blueprint.includes('wicklume-pilot'));
  assert.equal((blueprint.match(/healthCheckPath: \/healthz/g) || []).length, 2);
  assert.equal((blueprint.match(/autoDeploy: false/g) || []).length, 2);
  assert(!/(API_KEY|SECRET|PASSWORD)\s*\n\s*value:/.test(blueprint));
});

test('hosting guide covers rollback, quotas, processor record and the Pages demo', () => {
  const guide = read('docs/HOSTING.md').toLowerCase();
  for (const phrase of ['rollback', 'quota', 'no plan upgrades', 'processor record', 'data location', 'guest demo', 'single https origin', 'deploy-check.mjs'])
    assert(guide.includes(phrase), `HOSTING.md missing: ${phrase}`);
  assert(existsSync(path.join(root, 'deploy-check.mjs')));
});

test('Pages build labels the guest demo', () => {
  const build = read('build-pages.mjs');
  assert(build.includes('Guest demo'));
  assert(build.includes("'<body>'"));
});
