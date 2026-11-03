import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  fileToBase64,
  formatFileSize,
  validateAttachmentFile,
} from './attachments';

const file = (name: string, type: string, size = 1000) => ({
  name,
  type,
  size,
});

describe('validateAttachmentFile', () => {
  it('accepts the photo and audio formats the server can read', () => {
    expect(validateAttachmentFile(file('foto.jpg', 'image/jpeg'))).toEqual({
      ok: true,
      kind: 'image',
      mime: 'image/jpeg',
    });
    expect(validateAttachmentFile(file('foto.png', 'image/png'))).toMatchObject(
      { ok: true, kind: 'image' }
    );
    expect(
      validateAttachmentFile(file('foto.heic', 'image/heic'))
    ).toMatchObject({ ok: true, kind: 'image', mime: 'image/heic' });
    expect(validateAttachmentFile(file('nota.webm', 'audio/webm'))).toEqual({
      ok: true,
      kind: 'audio',
      mime: 'audio/webm',
    });
    expect(validateAttachmentFile(file('nota.m4a', 'audio/mp4'))).toMatchObject(
      { ok: true, kind: 'audio', mime: 'audio/mp4' }
    );
    expect(validateAttachmentFile(file('nota.wav', 'audio/wav'))).toMatchObject(
      { ok: true, kind: 'audio' }
    );
    expect(validateAttachmentFile(file('nota.aac', 'audio/aac'))).toMatchObject(
      { ok: true, kind: 'audio' }
    );
  });

  it('normalizes aliases and parameters, and uses the extension when the browser gives no type', () => {
    expect(
      validateAttachmentFile(file('n.webm', 'audio/webm;codecs=opus'))
    ).toMatchObject({ ok: true, mime: 'audio/webm' });
    expect(validateAttachmentFile(file('n.m4a', 'audio/x-m4a'))).toMatchObject({
      ok: true,
      mime: 'audio/mp4',
    });
    expect(validateAttachmentFile(file('IMG_0001.HEIC', ''))).toMatchObject({
      ok: true,
      kind: 'image',
      mime: 'image/heic',
    });
    expect(validateAttachmentFile(file('nota.m4a', ''))).toMatchObject({
      ok: true,
      kind: 'audio',
      mime: 'audio/mp4',
    });
  });

  it('refuses video with an explanation', () => {
    const r = validateAttachmentFile(file('video.mp4', 'video/mp4'));
    expect(r).toMatchObject({ ok: false });
    expect(r.ok === false && r.message).toContain('video');
  });

  it('explains the audio formats that are not supported yet, including WhatsApp voice notes', () => {
    for (const f of [
      file('PTT-2026.opus', 'audio/ogg'),
      file('nota.ogg', 'audio/ogg'),
      file('cancion.mp3', 'audio/mpeg'),
      file('x.opus', ''),
    ]) {
      const r = validateAttachmentFile(f);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.message).toContain('audio');
    }
  });

  it('refuses unknown types, empty files and files over 10 MB', () => {
    expect(validateAttachmentFile(file('doc.pdf', 'application/pdf')).ok).toBe(
      false
    );
    expect(validateAttachmentFile(file('vacio.jpg', 'image/jpeg', 0)).ok).toBe(
      false
    );
    const big = validateAttachmentFile(
      file('grande.jpg', 'image/jpeg', MAX_ATTACHMENT_BYTES + 1)
    );
    expect(big.ok).toBe(false);
    expect(big.ok === false && big.message).toContain('10 MB');
    expect(
      validateAttachmentFile(
        file('justo.jpg', 'image/jpeg', MAX_ATTACHMENT_BYTES)
      ).ok
    ).toBe(true);
  });
});

describe('fileToBase64', () => {
  it('returns only the base64 payload, without the data URL prefix', async () => {
    const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
      type: 'audio/webm',
    });
    expect(await fileToBase64(blob)).toBe('GkXfow==');
  });
});

describe('formatFileSize', () => {
  it('uses KB below one megabyte and MB above', () => {
    expect(formatFileSize(500)).toBe('1 KB');
    expect(formatFileSize(150 * 1024)).toBe('150 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2,5 MB');
  });
});
