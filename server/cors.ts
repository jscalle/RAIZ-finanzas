// Opt-in CORS for the JSON API. Browsers block a cross-origin call that carries an
// Authorization header unless the server answers the preflight with an allow-origin
// header, so a frontend on Firebase Hosting needs this to reach the Cloud Run API.
// The allowlist comes from CORS_ALLOWED_ORIGINS; when it is empty (the default) nothing
// is added and behaviour is exactly what it was before.
import type { RequestHandler } from 'express';

// Exact origins only: scheme + host (+ port). No wildcards, no paths.
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const origins: string[] = [];
  let ignored = 0;
  for (const part of raw.split(',')) {
    const entry = part.trim().replace(/\/$/, '').toLowerCase();
    if (!entry) continue;
    if (ORIGIN.test(entry)) origins.push(entry);
    else ignored += 1;
  }
  if (ignored > 0) {
    console.warn(
      `[cors] Ignored ${ignored} invalid CORS_ALLOWED_ORIGINS entr${ignored === 1 ? 'y' : 'ies'} (use exact origins such as https://app.example.com, no wildcards or paths).`
    );
  }
  return origins;
}

/**
 * Mount on /api, before the body parsers, so preflights skip parsing and parser errors
 * (413, invalid JSON) still carry the allow-origin header the browser needs to read them.
 * Credentials are never allowed: the API authenticates with a bearer token.
 */
export function createApiCors(allowedOrigins: string[]): RequestHandler {
  if (allowedOrigins.length === 0) return (_req, _res, next) => next();
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    res.vary('Origin');
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !allowed.has(origin)) {
      next();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }
    next();
  };
}
