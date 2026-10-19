import { readFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Public health report for load balancers and deploy checks. It must never include keys, emails or user data.
export function healthStatus(db, env = process.env) {
  let database = 'ok', schemaVersion = null;
  try {
    schemaVersion = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v;
    db.prepare('SELECT 1').get();
  } catch { database = 'error'; }
  const production = env.NODE_ENV === 'production';
  return {
    ok: database === 'ok',
    status: database === 'ok' ? 'ok' : 'degraded',
    service: 'wicklume',
    version: env.WICKLUME_VERSION || pkg.version || '0.0.0',
    environment: env.WICKLUME_ENV || (production ? 'production' : 'development'),
    schemaVersion,
    database,
    persistentDisk: env.WICKLUME_PERSISTENT_DISK === 'true',
    features: { googleSignIn: Boolean(env.GOOGLE_CLIENT_ID), marketData: Boolean(env.TWELVE_DATA_API_KEY), aiReview: Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL) }
  };
}
