// Post-deploy smoke check: node deploy-check.mjs https://your-app.example [--allow-http] [--env=staging]
// Exits non-zero on failure so a pipeline (or a person) knows to roll back. Sends no credentials.
export async function checkDeployment(baseUrl, { fetchFn = fetch, allowHttp = false, expectEnvironment } = {}) {
  const base = String(baseUrl).replace(/\/$/, ''), failures = [];
  const fail = message => failures.push(message);
  if (!allowHttp && !base.startsWith('https://')) fail('Deployment must be served over HTTPS');
  const get = async path => { try { return await fetchFn(base + path, { signal: AbortSignal.timeout(15000) }); } catch (error) { fail(`${path}: ${error.message}`); return null; } };
  const health = await get('/healthz');
  if (health) {
    if (health.status !== 200) fail(`/healthz returned ${health.status}`);
    else {
      const body = await health.json().catch(() => null);
      if (!body || body.ok !== true) fail('/healthz did not report ok');
      else {
        if (!body.persistentDisk && body.environment === 'production') fail('Production is not on a persistent disk');
        if (expectEnvironment && body.environment !== expectEnvironment) fail(`Expected environment ${expectEnvironment}, got ${body.environment}`);
      }
    }
  }
  const page = await get('/');
  if (page && page.status !== 200) fail(`/ returned ${page.status}`);
  const lessons = await get('/api/lessons');
  if (lessons && lessons.status !== 200) fail(`/api/lessons returned ${lessons.status}`);
  return { ok: !failures.length, failures };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const [url, ...flags] = process.argv.slice(2);
  if (!url) { console.error('Usage: node deploy-check.mjs <base-url> [--allow-http] [--env=staging]'); process.exit(2); }
  const env = flags.find(flag => flag.startsWith('--env='))?.slice(6);
  const result = await checkDeployment(url, { allowHttp: flags.includes('--allow-http'), expectEnvironment: env });
  for (const message of result.failures) console.error('FAIL: ' + message);
  console.log(result.ok ? 'Deployment check passed' : 'Deployment check failed: roll back (see docs/HOSTING.md)');
  process.exit(result.ok ? 0 : 1);
}
