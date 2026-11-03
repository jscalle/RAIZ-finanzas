// Attachment validation and per-user quotas for the in-app assistant.
// The type is decided from the decoded bytes, never from what the client declares.
// Allowlist = the formats verified against Gemini in spike A0 (Chrome webm, Safari mp4,
// wav, aac, and jpeg/png/heic images). Video is out of scope by product decision.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentError =
  | 'attachment_invalid'
  | 'attachment_too_large'
  | 'attachment_type_not_allowed'
  | 'attachment_type_mismatch';

export type AttachmentCheck =
  | { ok: true; mimeType: string; sizeBytes: number }
  | { ok: false; error: AttachmentError };

const ALIASES: Record<string, string> = {
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'image/jpg': 'image/jpeg',
};

/** Lowercases, drops parameters such as ";codecs=opus" and maps common aliases. */
export function normalizeMime(raw: string): string {
  const base = raw.split(';')[0].trim().toLowerCase();
  return ALIASES[base] ?? base;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

const ascii = (b: Buffer, from: number, to: number) => b.subarray(from, to).toString('latin1');

/** Detects an allowed type from the first bytes, or null when it is not one of them. */
function sniffMime(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'image/png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return 'audio/wav';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp') {
    return HEIC_BRANDS.has(ascii(b, 8, 12)) ? 'image/heic' : 'audio/mp4';
  }
  // ADTS AAC: 12 sync bits and layer bits 00 (MP3 frames have a non-zero layer).
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'audio/aac';
  return null;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function validateAttachment(attachment: unknown): AttachmentCheck {
  if (typeof attachment !== 'object' || attachment === null) return { ok: false, error: 'attachment_invalid' };
  const { mime, dataBase64 } = attachment as Record<string, unknown>;
  if (typeof mime !== 'string' || typeof dataBase64 !== 'string' || dataBase64.length === 0) {
    return { ok: false, error: 'attachment_invalid' };
  }

  // Size from the encoded length first, so an oversized payload is never decoded.
  const padding = dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0;
  const sizeBytes = Math.floor((dataBase64.length * 3) / 4) - padding;
  if (sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'attachment_too_large' };
  if (dataBase64.length % 4 !== 0 || !BASE64.test(dataBase64)) return { ok: false, error: 'attachment_invalid' };

  const declared = normalizeMime(mime);
  const family = declared.split('/')[0];
  if (family !== 'image' && family !== 'audio') return { ok: false, error: 'attachment_type_not_allowed' };

  const sniffed = sniffMime(Buffer.from(dataBase64.slice(0, 24), 'base64'));
  if (!sniffed) return { ok: false, error: 'attachment_type_not_allowed' };
  if (sniffed.split('/')[0] !== family) return { ok: false, error: 'attachment_type_mismatch' };
  return { ok: true, mimeType: sniffed, sizeBytes };
}

export type QuotaResult = { allowed: true } | { allowed: false; retryAfterMs: number };

/** Fixed-window counter per key (for example a uid). In memory, so per process. */
export function createQuota(opts: { windowMs: number; max: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key: string): QuotaResult {
      const t = now();
      if (buckets.size > 10_000) {
        for (const [k, v] of buckets) if (v.resetAt <= t) buckets.delete(k);
      }
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        buckets.set(key, { count: 1, resetAt: t + opts.windowMs });
        return { allowed: true };
      }
      if (bucket.count >= opts.max) return { allowed: false, retryAfterMs: bucket.resetAt - t };
      bucket.count += 1;
      return { allowed: true };
    },
  };
}
