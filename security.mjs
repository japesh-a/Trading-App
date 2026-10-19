import { createHash } from 'node:crypto';

// Content-Security-Policy that still allows Google Identity Services sign-in
// (script, button iframe and popup) and the public Coinbase candle feed.
export function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.exchange.coinbase.com https://accounts.google.com/gsi/",
    'frame-src https://accounts.google.com/gsi/',
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
}

export function applySecurityHeaders(res, env = process.env) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', contentSecurityPolicy());
  // Google sign-in opens a popup that must be able to talk back to this page.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
}

// The legacy /api/progress, /api/answer and /api/decision endpoints share one
// progress record for every visitor. They stay available for local development
// and are switched off in production unless explicitly re-enabled.
export function legacyProgressEnabled(env = process.env) {
  if (env.WICKLUME_LEGACY_PROGRESS === 'true') return true;
  if (env.WICKLUME_LEGACY_PROGRESS === 'false') return false;
  return env.NODE_ENV !== 'production';
}

// Verified (ranked) results need a signed-in account. Anonymous device sessions
// only qualify when an operator opts in with WICKLUME_ANONYMOUS_VERIFIED=true.
export const mayRecordVerified = (session, env = process.env) =>
  Boolean(session?.account_id) || env.WICKLUME_ANONYMOUS_VERIFIED === 'true';

// Private audit trail. Stores event names and hashed network identifiers only;
// never passwords, tokens or request bodies. No route reads it.
export function createAuditLog(db, clock = Date.now) {
  return (event, { accountId = null, sessionId = null, ip = '', detail = '' } = {}) => {
    try {
      db.prepare('INSERT INTO audit_log(at,event,account_id,session_id,ip_hash,detail) VALUES(?,?,?,?,?,?)').run(
        clock(), String(event).slice(0, 80), accountId, sessionId,
        ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : null, String(detail).slice(0, 200));
    } catch { /* auditing must never break the request */ }
  };
}
