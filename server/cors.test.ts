// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createApiCors, parseAllowedOrigins } from './cors';
import { assistantBodyParser } from './assistantRoute';

const ALLOWED = 'https://qa.example.web.app';

describe('parseAllowedOrigins', () => {
  it('splits, trims, lowercases and drops trailing slashes', () => {
    expect(parseAllowedOrigins(' https://A.example.com/ , http://localhost:5173 ')).toEqual([
      'https://a.example.com',
      'http://localhost:5173',
    ]);
  });

  it('drops wildcards, paths, other schemes and empty entries, and reports them once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      parseAllowedOrigins('*, https://*.example.com, https://ok.example.com/app, ftp://x.example.com, , https://good.example.com')
    ).toEqual(['https://good.example.com']);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('returns an empty list when unset', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });
});

describe('createApiCors', () => {
  afterEach(() => vi.restoreAllMocks());

  async function withServer(allowed: string[], fn: (url: string) => Promise<void>) {
    const app = express();
    app.use('/api', createApiCors(allowed));
    app.use('/api/assistant', ...assistantBodyParser());
    app.post('/api/echo', (_req, res) => res.json({ ok: true }));
    app.post('/api/assistant/echo', (_req, res) => res.json({ ok: true }));
    app.get('/page', (_req, res) => res.send('page'));
    const server = app.listen(0);
    try {
      await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      server.close();
    }
  }
  const preflight = (url: string, origin: string) =>
    fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });

  it('answers the preflight of an allowed origin with 204 and the needed headers', async () => {
    await withServer([ALLOWED], async (url) => {
      const res = await preflight(`${url}/api/echo`, ALLOWED);
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED);
      expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
      expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('vary')?.toLowerCase()).toContain('origin');
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    });
  });

  it('adds the allow-origin header to real responses, including body-parser errors', async () => {
    await withServer([ALLOWED], async (url) => {
      const ok = await fetch(`${url}/api/echo`, { method: 'POST', headers: { Origin: ALLOWED, 'content-type': 'application/json' }, body: '{}' });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('access-control-allow-origin')).toBe(ALLOWED);

      const broken = await fetch(`${url}/api/assistant/echo`, { method: 'POST', headers: { Origin: ALLOWED, 'content-type': 'application/json' }, body: '{nope' });
      expect(broken.status).toBe(400);
      expect(broken.headers.get('access-control-allow-origin')).toBe(ALLOWED);
    });
  });

  it('gives no CORS headers to origins that are not listed, including "null"', async () => {
    await withServer([ALLOWED], async (url) => {
      for (const origin of ['https://evil.example.com', 'null', 'https://qa.example.web.app.evil.com']) {
        const res = await preflight(`${url}/api/echo`, origin);
        expect(res.headers.get('access-control-allow-origin')).toBeNull();
        expect(res.status).not.toBe(204);
      }
    });
  });

  it('changes nothing when the allowlist is empty', async () => {
    await withServer([], async (url) => {
      const res = await preflight(`${url}/api/echo`, ALLOWED);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
      expect(res.status).not.toBe(204);
      expect(res.headers.get('vary')).toBeNull();
    });
  });

  it('leaves non-API paths alone', async () => {
    await withServer([ALLOWED], async (url) => {
      const res = await fetch(`${url}/page`, { headers: { Origin: ALLOWED } });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  it('does not touch requests without an Origin header (server to server)', async () => {
    await withServer([ALLOWED], async (url) => {
      const res = await fetch(`${url}/api/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });
});
