// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createQuota,
  MAX_ATTACHMENT_BYTES,
  normalizeMime,
  validateAttachment,
} from './assistantMedia';

const b64 = (bytes: number[], pad = 32) =>
  Buffer.from([...bytes, ...new Array(pad).fill(0)]).toString('base64');
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const SAMPLES = {
  jpeg: b64([0xff, 0xd8, 0xff, 0xe0]),
  png: b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  wav: b64([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE')]),
  webm: b64([0x1a, 0x45, 0xdf, 0xa3]),
  m4a: b64([0, 0, 0, 0x20, ...ascii('ftypisom')]),
  heic: b64([0, 0, 0, 0x18, ...ascii('ftypheic')]),
  aac: b64([0xff, 0xf1, 0x50, 0x80]),
  png_as_text: Buffer.from('hello world, not media').toString('base64'),
  aiff: b64([...ascii('FORM'), 0, 0, 0, 0, ...ascii('AIFF')]),
  flac: b64([...ascii('fLaC')]),
};

describe('normalizeMime', () => {
  it('lowercases, strips parameters and maps common aliases', () => {
    expect(normalizeMime('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(normalizeMime('AUDIO/X-M4A')).toBe('audio/mp4');
    expect(normalizeMime('audio/x-wav')).toBe('audio/wav');
    expect(normalizeMime('image/jpg')).toBe('image/jpeg');
    expect(normalizeMime(' audio/mp4 ')).toBe('audio/mp4');
  });
});

describe('validateAttachment', () => {
  const cases: Array<[string, string, string, string]> = [
    ['jpeg', 'image/jpeg', SAMPLES.jpeg, 'image/jpeg'],
    ['png', 'image/png', SAMPLES.png, 'image/png'],
    ['heic', 'image/heic', SAMPLES.heic, 'image/heic'],
    ['wav', 'audio/x-wav', SAMPLES.wav, 'audio/wav'],
    ['webm with codecs', 'audio/webm;codecs=opus', SAMPLES.webm, 'audio/webm'],
    ['m4a from Safari', 'audio/mp4', SAMPLES.m4a, 'audio/mp4'],
    ['aac', 'audio/aac', SAMPLES.aac, 'audio/aac'],
  ];
  it.each(cases)('accepts %s and returns the type found in the bytes', (_n, declared, data, expected) => {
    const r = validateAttachment({ mime: declared, dataBase64: data });
    expect(r).toMatchObject({ ok: true, mimeType: expected });
  });

  it('trusts the bytes over the declared type inside the same family', () => {
    const r = validateAttachment({ mime: 'image/png', dataBase64: SAMPLES.jpeg });
    expect(r).toMatchObject({ ok: true, mimeType: 'image/jpeg' });
  });

  it('rejects a declared type that does not match the bytes family', () => {
    expect(validateAttachment({ mime: 'audio/webm', dataBase64: SAMPLES.png })).toEqual({
      ok: false,
      error: 'attachment_type_mismatch',
    });
  });

  it('rejects unknown bytes, video, and audio formats Gemini handled badly', () => {
    for (const [mime, data] of [
      ['image/png', SAMPLES.png_as_text],
      ['video/mp4', SAMPLES.m4a],
      ['audio/aiff', SAMPLES.aiff],
      ['audio/flac', SAMPLES.flac],
    ]) {
      expect(validateAttachment({ mime, dataBase64: data })).toEqual({
        ok: false,
        error: 'attachment_type_not_allowed',
      });
    }
  });

  it('rejects malformed input', () => {
    for (const a of [null, 'x', {}, { mime: 5, dataBase64: 'AAAA' }, { mime: 'image/png' }, { mime: 'image/png', dataBase64: '***' }, { mime: 'image/png', dataBase64: '' }]) {
      expect(validateAttachment(a)).toEqual({ ok: false, error: 'attachment_invalid' });
    }
  });

  it('rejects files over the size cap without decoding them', () => {
    const tooBig = 'A'.repeat(Math.ceil(((MAX_ATTACHMENT_BYTES + 1000) * 4) / 3));
    expect(validateAttachment({ mime: 'audio/webm', dataBase64: tooBig })).toEqual({
      ok: false,
      error: 'attachment_too_large',
    });
  });
});

describe('createQuota', () => {
  it('allows up to max per key inside the window, then reports when to retry', () => {
    let now = 1_000;
    const quota = createQuota({ windowMs: 60_000, max: 2, now: () => now });
    expect(quota.take('u1').allowed).toBe(true);
    expect(quota.take('u1').allowed).toBe(true);
    const blocked = quota.take('u1');
    expect(blocked).toEqual({ allowed: false, retryAfterMs: 60_000 });
    now += 20_000;
    expect(quota.take('u1')).toEqual({ allowed: false, retryAfterMs: 40_000 });
  });

  it('counts each key separately and starts a new window after it expires', () => {
    let now = 0;
    const quota = createQuota({ windowMs: 1_000, max: 1, now: () => now });
    expect(quota.take('a').allowed).toBe(true);
    expect(quota.take('b').allowed).toBe(true);
    expect(quota.take('a').allowed).toBe(false);
    now = 1_000;
    expect(quota.take('a').allowed).toBe(true);
  });
});
