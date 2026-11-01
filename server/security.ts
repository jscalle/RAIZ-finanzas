// Security decisions for the backend endpoints, kept free of Express handlers
// and Firestore I/O so they can be unit-tested without network or emulators.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export interface SpaceDoc {
  ownerUid?: unknown;
  members?: unknown;
}

export interface AccessRequestDoc {
  status?: unknown;
  requesterUid?: unknown;
}

export interface TelegramLinkDoc {
  spaceId?: unknown;
  status?: unknown;
}

export type TelegramAccessStatus = 'approved' | 'rejected' | 'revoked';

export type TelegramAccessDecision =
  | { ok: true; status: TelegramAccessStatus }
  | { ok: false; httpStatus: 400 | 403 | 404 | 409; error: string };

const TELEGRAM_ACCESS_STATUSES: readonly TelegramAccessStatus[] = [
  'approved',
  'rejected',
  'revoked',
];

// Returns the token of an `Authorization: Bearer <token>` header, or null.
export function extractBearerToken(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer (.+)$/);
  return match ? match[1] : null;
}

// Constant-time comparison of a caller-provided secret with the configured
// one. Both sides are hashed first so their lengths never leak through timing.
// An empty or missing configured secret never matches (fail closed).
export function secretsMatch(
  provided: unknown,
  expected: string | undefined | null
): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  if (expected.length === 0) return false;
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

// Normalizes a Telegram chat id that may carry the `tg:` member prefix or the
// `req_tg_` request prefix. Telegram chat ids are integers; anything else is
// rejected so it can never be used to build an arbitrary Firestore path.
export function parseTelegramChatId(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const cleaned = String(raw)
    .trim()
    .replace(/^tg:/, '')
    .replace(/^req_tg_/, '');
  return /^-?\d{1,20}$/.test(cleaned) ? cleaned : null;
}

// A space id is used as a single Firestore document id.
export function isValidSpaceId(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    raw.length > 0 &&
    raw.length <= 200 &&
    !raw.includes('/')
  );
}

function membersOf(space: SpaceDoc): unknown[] {
  return Array.isArray(space.members) ? space.members : [];
}

export function isSpaceOwner(
  space: SpaceDoc | null | undefined,
  uid: string
): boolean {
  return Boolean(
    space && typeof space.ownerUid === 'string' && space.ownerUid === uid
  );
}

export function isSpaceMember(
  space: SpaceDoc | null | undefined,
  uid: string
): boolean {
  if (!space || !uid) return false;
  return isSpaceOwner(space, uid) || membersOf(space).includes(uid);
}

// Decides whether `callerUid` may approve, reject or revoke the Telegram chat
// `chatId` in `spaceId` (POST /api/telegram/notify-access).
// - Only the space owner may decide (403 otherwise, including a missing space).
// - The chat must have asked for access: its `req_tg_<chatId>` request must
//   exist (404). Approving or rejecting needs it still pending (409). Revoking
//   an existing member is allowed whatever the request status is.
// - A chat currently linked to another space is never re-pointed (409).
export function decideTelegramAccessChange(input: {
  callerUid: string;
  spaceId: string;
  chatId: string;
  status: unknown;
  space: SpaceDoc | null;
  request: AccessRequestDoc | null;
  link: TelegramLinkDoc | null;
}): TelegramAccessDecision {
  const { callerUid, spaceId, chatId, status, space, request, link } = input;

  if (
    typeof status !== 'string' ||
    !TELEGRAM_ACCESS_STATUSES.includes(status as TelegramAccessStatus)
  ) {
    return { ok: false, httpStatus: 400, error: 'Invalid status.' };
  }
  const accessStatus = status as TelegramAccessStatus;

  if (!space || !isSpaceOwner(space, callerUid)) {
    return {
      ok: false,
      httpStatus: 403,
      error: 'Only the space owner can change Telegram access.',
    };
  }

  const isTelegramMember = membersOf(space).includes(`tg:${chatId}`);
  if (!request && !(accessStatus === 'revoked' && isTelegramMember)) {
    return {
      ok: false,
      httpStatus: 404,
      error: 'No Telegram access request exists for this chat.',
    };
  }

  if (accessStatus !== 'revoked' && request?.status !== 'pending') {
    return {
      ok: false,
      httpStatus: 409,
      error: 'The Telegram access request is no longer pending.',
    };
  }

  const linkedSpaceId = link?.spaceId;
  if (
    typeof linkedSpaceId === 'string' &&
    linkedSpaceId.length > 0 &&
    linkedSpaceId !== spaceId
  ) {
    return {
      ok: false,
      httpStatus: 409,
      error: 'This Telegram chat is linked to another space.',
    };
  }

  return { ok: true, status: accessStatus };
}

// POST /api/telegram/sync-draft: the caller must be a member (or the owner) of
// the space the chat is linked to (`telegram_links/<chatId>.spaceId`), where
// `space` is that linked space document.
export function canSyncTelegramDraft(input: {
  uid: string;
  link: TelegramLinkDoc | null;
  space: SpaceDoc | null;
}): boolean {
  const { uid, link, space } = input;
  if (!link || typeof link.spaceId !== 'string' || !link.spaceId) return false;
  return isSpaceMember(space, uid);
}

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';

// Express middleware for POST /api/webhook/telegram. Telegram sends the
// `secret_token` given to setWebhook in the X-Telegram-Bot-Api-Secret-Token
// header; any update without the matching value is rejected with 401.
// Without a configured secret every update is rejected (fail closed) and
// `onMissingSecret` is called so the server can report the misconfiguration.
export function createTelegramWebhookGuard(options: {
  getSecret: () => string | undefined;
  onMissingSecret: () => void;
}): RequestHandler {
  return (req, res, next) => {
    const secret = options.getSecret();
    if (!secret) {
      options.onMissingSecret();
      res.sendStatus(401);
      return;
    }
    if (!secretsMatch(req.headers[TELEGRAM_SECRET_HEADER], secret)) {
      res.sendStatus(401);
      return;
    }
    next();
  };
}
