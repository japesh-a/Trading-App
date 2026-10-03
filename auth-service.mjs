import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { OAuth2Client } from 'google-auth-library';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const lifetime = 7 * 86400000;
const cookieName = 'wicklume_account';

// Account cookies never expose credentials to JavaScript. Anonymous bearer
// sessions remain separate, so registering cannot claim another user's data.
export function createAccountService(db, { env, clock, fail, requestBody, rateLimit, googleVerifier }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL,
      password_hash TEXT NOT NULL, session_id TEXT UNIQUE NOT NULL, created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_logins (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_login_expiry ON account_logins(expires);
    CREATE INDEX IF NOT EXISTS account_login_owner ON account_logins(account_id);
    CREATE TABLE IF NOT EXISTS account_google_identities (
      google_sub TEXT PRIMARY KEY, account_id TEXT UNIQUE NOT NULL
    );
  `);
  if (!db.prepare('PRAGMA table_info(accounts)').all().some(column => column.name === 'password_enabled'))
    db.exec('ALTER TABLE accounts ADD COLUMN password_enabled INTEGER NOT NULL DEFAULT 1');
  const googleClientId = String(env.GOOGLE_CLIENT_ID || '').trim();
  const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;
  const verifyGoogle = googleVerifier || (async credential => (await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId })).getPayload());
  const secure = env.WICKLUME_COOKIE_SECURE === 'true' || (env.NODE_ENV === 'production' && env.WICKLUME_COOKIE_SECURE !== 'false');
  const crossSite = env.WICKLUME_COOKIE_SAME_SITE === 'none';
  if (crossSite && !secure) throw Error('Cross-site account cookies require WICKLUME_COOKIE_SECURE=true.');
  const cookie = (token, seconds) => `${cookieName}=${token}; Path=/api/trading; HttpOnly; SameSite=${crossSite ? 'None' : 'Lax'}; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  const tokenFor = req => String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const resolve = req => {
    const token = tokenFor(req);
    if (!token) return null;
    const row = db.prepare(`SELECT a.id AS account_id, a.email, a.password_enabled, s.id, s.display_name,
      EXISTS(SELECT 1 FROM account_google_identities g WHERE g.account_id=a.id) AS google_linked
      FROM account_logins l JOIN accounts a ON a.id=l.account_id
      JOIN trading_sessions s ON s.id=a.session_id WHERE l.token_hash=? AND l.expires>?`).get(digest(token), clock());
    if (!row) fail(401, 'Your login has expired. Sign in again or sign out to continue as a guest.');
    return row;
  };
  const publicAccount = row => ({ id: row.account_id, displayName: row.display_name, email: row.email,
    hasPassword: Boolean(row.password_enabled), googleLinked: Boolean(row.google_linked) });
  const issue = (res, accountId) => {
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM account_logins WHERE expires<=?').run(clock());
    db.prepare('INSERT INTO account_logins VALUES(?,?,?)').run(digest(token), accountId, clock() + lifetime);
    res.setHeader('Set-Cookie', cookie(token, lifetime / 1000));
  };
  const keyOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
  return {
    resolve,
    async handle(req, res, route, send, ip) {
      if (!route.startsWith('/auth/')) return false;
      if (route === '/auth/me' && req.method === 'GET') {
        const account = resolve(req);
        return send({ account: account ? publicAccount(account) : null });
      }
      if (route === '/auth/logout' && req.method === 'POST') {
        await requestBody(req);
        const token = tokenFor(req);
        if (token) db.prepare('DELETE FROM account_logins WHERE token_hash=?').run(digest(token));
        res.setHeader('Set-Cookie', cookie('', 0));
        return send({ account: null });
      }
      if (route === '/auth/google' && req.method === 'POST') {
        if (!googleClientId) fail(503, 'Google sign in is not configured.');
        if (!req.headers.origin) fail(403, 'Open Google sign in from this website.');
        rateLimit(`google-ip:${ip}`, 12, 15 * 60000);
        const body = await requestBody(req);
        if (typeof body.credential !== 'string' || body.credential.length > 8192) fail(400, 'Google did not provide a valid sign in response.');
        let identity;
        try { identity = await verifyGoogle(body.credential); }
        catch { fail(401, 'Google could not verify this sign in. Please try again.'); }
        const sub = typeof identity?.sub === 'string' ? identity.sub : '';
        const email = typeof identity?.email === 'string' ? identity.email.trim().toLowerCase() : '';
        if (!sub || sub.length > 255 || !identity.email_verified || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          fail(401, 'Google did not provide a verified email address.');
        const linked = db.prepare('SELECT account_id FROM account_google_identities WHERE google_sub=?').get(sub);
        if (body.link === true) {
          const account = resolve(req);
          if (!account) fail(401, 'Sign in to your account before linking Google.');
          if (linked && linked.account_id !== account.account_id) fail(409, 'This Google account is already linked to another account.');
          const other = db.prepare('SELECT google_sub FROM account_google_identities WHERE account_id=?').get(account.account_id);
          if (other && other.google_sub !== sub) fail(409, 'This account is already linked to a different Google account.');
          if (!linked) db.prepare('INSERT INTO account_google_identities VALUES(?,?)').run(sub, account.account_id);
          return send({ account: { ...publicAccount(account), googleLinked: true } });
        }
        let accountId = linked?.account_id;
        if (!accountId) {
          if (db.prepare('SELECT id FROM accounts WHERE email=?').get(email))
            fail(409, 'An account already uses this email. Sign in with its password, then link Google in Account settings.');
          const displayName = String(identity.name || identity.given_name || email.split('@')[0]).trim().slice(0, 40).replace(/[\u0000-\u001f\u007f]/g, '') || 'Learner';
          accountId = randomUUID(); const sessionId = randomUUID();
          db.exec('BEGIN IMMEDIATE');
          try {
            db.prepare('INSERT INTO trading_sessions VALUES(?,?,?,?)').run(sessionId, digest(randomBytes(32)), displayName, clock());
            db.prepare('INSERT INTO accounts(id,email,salt,password_hash,session_id,created,password_enabled) VALUES(?,?,?,?,?,?,0)')
              .run(accountId, email, randomBytes(16).toString('hex'), randomBytes(64).toString('hex'), sessionId, clock());
            db.prepare('INSERT INTO account_google_identities VALUES(?,?)').run(sub, accountId);
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        issue(res, accountId);
        const account = db.prepare(`SELECT a.id AS account_id,a.email,a.password_enabled,s.display_name,
          1 AS google_linked FROM accounts a JOIN trading_sessions s ON s.id=a.session_id WHERE a.id=?`).get(accountId);
        return send({ account: publicAccount(account) });
      }
      if (route === '/auth/password' && req.method === 'POST') {
        const identity = resolve(req);
        if (!identity) fail(401, 'Sign in before changing your password.');
        rateLimit(`password:${identity.account_id}`, 6, 3600000);
        const body = await requestBody(req);
        if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 128 || typeof body.newPassword !== 'string' || body.newPassword.length < 12 || body.newPassword.length > 128) fail(400, 'Enter your current password and a new password between 12 and 128 characters.');
        if (body.currentPassword === body.newPassword) fail(400, 'Choose a password different from your current one.');
        const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(identity.account_id);
        if (!account.password_enabled) fail(400, 'This account uses Google sign in and has no password to change.');
        const candidate = await derive(body.currentPassword, account.salt, 64, keyOptions);
        if (!timingSafeEqual(candidate, Buffer.from(account.password_hash, 'hex'))) fail(401, 'Your current password is incorrect.');
        const salt = randomBytes(16).toString('hex');
        const passwordHash = (await derive(body.newPassword, salt, 64, keyOptions)).toString('hex');
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = db.prepare('UPDATE accounts SET salt=?,password_hash=? WHERE id=? AND password_hash=?').run(salt, passwordHash, account.id, account.password_hash);
          if (!result.changes) fail(409, 'Your password was changed in another session. Sign in again.');
          db.prepare('DELETE FROM account_logins WHERE account_id=?').run(account.id);
          issue(res, account.id);
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return send({ account: publicAccount(identity), message: 'Password changed. Other devices have been signed out.' });
      }
      if (!['/auth/register', '/auth/login'].includes(route) || req.method !== 'POST') return send({ error: 'Account endpoint not found.' }, 404);
      rateLimit(`auth-ip:${ip}`, 12, 15 * 60000);
      const body = await requestBody(req);
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) fail(400, 'Use a password between 12 and 128 characters.');
      rateLimit(`auth-email:${digest(email)}`, 20, 15 * 60000);
      if (route === '/auth/register') {
        const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
        if (!displayName || displayName.length > 40 || /[\u0000-\u001f\u007f]/.test(displayName)) fail(400, 'Enter a display name between 1 and 40 characters.');
        const salt = randomBytes(16).toString('hex');
        const passwordHash = (await derive(body.password, salt, 64, keyOptions)).toString('hex');
        // Recheck after asynchronous password hashing to cover simultaneous requests.
        if (db.prepare('SELECT id FROM accounts WHERE email=?').get(email)) fail(409, 'Unable to create this account. Try signing in instead.');
        const accountId = randomUUID(), sessionId = randomUUID();
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('INSERT INTO trading_sessions VALUES(?,?,?,?)').run(sessionId, digest(randomBytes(32)), displayName, clock());
          db.prepare('INSERT INTO accounts(id,email,salt,password_hash,session_id,created) VALUES(?,?,?,?,?,?)').run(accountId, email, salt, passwordHash, sessionId, clock());
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        issue(res, accountId);
        return send({ account: { id: accountId, email, displayName, hasPassword: true, googleLinked: false } }, 201);
      }
      const account = db.prepare('SELECT * FROM accounts WHERE email=?').get(email);
      const candidate = await derive(body.password, account?.salt || '00000000000000000000000000000000', 64, keyOptions);
      if (!timingSafeEqual(candidate, Buffer.from(account?.password_hash || '00'.repeat(64), 'hex')) || !account || !account.password_enabled) fail(401, 'Email or password is incorrect.');
      issue(res, account.id);
      const session = db.prepare('SELECT display_name FROM trading_sessions WHERE id=?').get(account.session_id);
      return send({ account: { id: account.id, email: account.email, displayName: session.display_name,
        hasPassword: true, googleLinked: Boolean(db.prepare('SELECT 1 FROM account_google_identities WHERE account_id=?').get(account.id)) } });
    },
  };
}
