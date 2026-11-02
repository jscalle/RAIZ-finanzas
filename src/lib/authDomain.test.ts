import { describe, it, expect } from 'vitest';
import { resolveAuthDomain } from './authDomain';

const CONFIGURED = 'my-project.firebaseapp.com';
const at = (url: string) => {
  const u = new URL(url);
  return { protocol: u.protocol, hostname: u.hostname, host: u.host };
};

describe('resolveAuthDomain', () => {
  it('uses the page host so redirect sign-in stays same-origin on a custom domain', () => {
    // Cross-origin auth (firebaseapp.com <-> custom domain) loses the redirect
    // result in browsers that partition third-party storage (e.g. in-app tabs).
    expect(
      resolveAuthDomain(CONFIGURED, at('https://raiz.example.site/'))
    ).toBe('raiz.example.site');
  });

  it('uses the page host on the default web.app domain', () => {
    expect(
      resolveAuthDomain(CONFIGURED, at('https://my-project.web.app/'))
    ).toBe('my-project.web.app');
  });

  it('keeps the configured domain on localhost and loopback addresses', () => {
    expect(resolveAuthDomain(CONFIGURED, at('https://localhost:5173/'))).toBe(
      CONFIGURED
    );
    expect(resolveAuthDomain(CONFIGURED, at('https://dev.localhost/'))).toBe(
      CONFIGURED
    );
    expect(resolveAuthDomain(CONFIGURED, at('https://127.0.0.1/'))).toBe(
      CONFIGURED
    );
    expect(resolveAuthDomain(CONFIGURED, at('https://[::1]/'))).toBe(
      CONFIGURED
    );
  });

  it('keeps the configured domain on plain http pages', () => {
    expect(resolveAuthDomain(CONFIGURED, at('http://raiz.example.site/'))).toBe(
      CONFIGURED
    );
  });

  it('keeps the configured domain inside native Capacitor builds', () => {
    expect(
      resolveAuthDomain(CONFIGURED, at('https://raiz.example.site/'), true)
    ).toBe(CONFIGURED);
  });

  it('keeps the configured domain when there is no location (SSR / tests)', () => {
    expect(resolveAuthDomain(CONFIGURED, null)).toBe(CONFIGURED);
    expect(resolveAuthDomain(CONFIGURED, undefined)).toBe(CONFIGURED);
  });
});
