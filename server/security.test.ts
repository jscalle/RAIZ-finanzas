// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  canSyncTelegramDraft,
  createTelegramWebhookGuard,
  decideTelegramAccessChange,
  extractBearerToken,
  parseTelegramChatId,
  secretsMatch,
} from './security';

const OWNER = 'owner-uid';
const SPACE_ID = 'espacio_familia';
const CHAT_ID = '123456789';

const ownerSpace = {
  ownerUid: OWNER,
  members: [OWNER, 'other-member-uid'],
};

function accessInput(
  overrides: Partial<Parameters<typeof decideTelegramAccessChange>[0]> = {}
): Parameters<typeof decideTelegramAccessChange>[0] {
  return {
    callerUid: OWNER,
    spaceId: SPACE_ID,
    chatId: CHAT_ID,
    status: 'approved',
    space: ownerSpace,
    request: { status: 'pending', requesterUid: `tg:${CHAT_ID}` },
    link: { spaceId: SPACE_ID, status: 'pending' },
    ...overrides,
  };
}

describe('extractBearerToken', () => {
  it('returns the token from a Bearer header and null when it is missing or malformed', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
  });
});

describe('decideTelegramAccessChange (S1 notify-access)', () => {
  it('lets the space owner approve a pending Telegram access request', () => {
    expect(decideTelegramAccessChange(accessInput())).toEqual({
      ok: true,
      status: 'approved',
    });
  });

  it('refuses with 403 when the caller is not the space owner', () => {
    const decision = decideTelegramAccessChange(
      accessInput({ callerUid: 'other-member-uid' })
    );
    expect(decision).toMatchObject({ ok: false, httpStatus: 403 });
    expect(
      decideTelegramAccessChange(accessInput({ space: null }))
    ).toMatchObject({ ok: false, httpStatus: 403 });
  });

  it('refuses with 404 when the chat never requested access to the space', () => {
    expect(
      decideTelegramAccessChange(accessInput({ request: null }))
    ).toMatchObject({ ok: false, httpStatus: 404 });
  });

  it('refuses with 409 when the request is no longer pending', () => {
    expect(
      decideTelegramAccessChange(
        accessInput({ request: { status: 'approved' } })
      )
    ).toMatchObject({ ok: false, httpStatus: 409 });
    expect(
      decideTelegramAccessChange(
        accessInput({ status: 'rejected', request: { status: 'rejected' } })
      )
    ).toMatchObject({ ok: false, httpStatus: 409 });
  });

  it('refuses with 409 when the chat is linked to another space', () => {
    expect(
      decideTelegramAccessChange(
        accessInput({ link: { spaceId: 'espacio_ajeno', status: 'approved' } })
      )
    ).toMatchObject({ ok: false, httpStatus: 409 });
  });

  it('lets the owner revoke a Telegram member whatever the request status is', () => {
    expect(
      decideTelegramAccessChange(
        accessInput({ status: 'revoked', request: { status: 'rejected' } })
      )
    ).toEqual({ ok: true, status: 'revoked' });
    expect(
      decideTelegramAccessChange(
        accessInput({
          status: 'revoked',
          request: null,
          space: { ownerUid: OWNER, members: [OWNER, `tg:${CHAT_ID}`] },
        })
      )
    ).toEqual({ ok: true, status: 'revoked' });
  });

  it('refuses with 400 an unknown status', () => {
    expect(
      decideTelegramAccessChange(accessInput({ status: 'owner' }))
    ).toMatchObject({ ok: false, httpStatus: 400 });
  });
});

describe('parseTelegramChatId', () => {
  it('accepts numeric chat ids with tg:/req_tg_ prefixes and rejects anything else', () => {
    expect(parseTelegramChatId('tg:123')).toBe('123');
    expect(parseTelegramChatId('req_tg_-100200')).toBe('-100200');
    expect(parseTelegramChatId(42)).toBe('42');
    expect(parseTelegramChatId('123/../x')).toBeNull();
    expect(parseTelegramChatId('')).toBeNull();
    expect(parseTelegramChatId(undefined)).toBeNull();
  });
});

describe('secretsMatch (S2 constant-time secret check)', () => {
  it('matches only an identical, non-empty secret', () => {
    expect(secretsMatch('s3cr3t-value', 's3cr3t-value')).toBe(true);
    expect(secretsMatch('s3cr3t-valuX', 's3cr3t-value')).toBe(false);
    expect(secretsMatch('short', 's3cr3t-value')).toBe(false);
    expect(secretsMatch(undefined, 's3cr3t-value')).toBe(false);
    expect(secretsMatch(['s3cr3t-value'], 's3cr3t-value')).toBe(false);
    expect(secretsMatch('', '')).toBe(false);
    expect(secretsMatch('anything', undefined)).toBe(false);
  });
});

function fakeExchange(headerValue?: string) {
  const req = {
    headers: headerValue
      ? { 'x-telegram-bot-api-secret-token': headerValue }
      : {},
  } as unknown as Request;
  const res = {
    statusCode: 200,
    sendStatus: vi.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
  };
  const next = vi.fn();
  return { req, res: res as unknown as Response & typeof res, next };
}

describe('createTelegramWebhookGuard (S2 webhook secret header)', () => {
  it('rejects with 401 an update whose secret header does not match', () => {
    const onMissingSecret = vi.fn();
    const guard = createTelegramWebhookGuard({
      getSecret: () => 'expected-secret',
      onMissingSecret,
    });
    const { req, res, next } = fakeExchange('wrong-secret');
    guard(req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    const missingHeader = fakeExchange();
    guard(missingHeader.req, missingHeader.res, missingHeader.next);
    expect(missingHeader.res.sendStatus).toHaveBeenCalledWith(401);
    expect(missingHeader.next).not.toHaveBeenCalled();
    expect(onMissingSecret).not.toHaveBeenCalled();
  });

  it('fails closed with 401 and reports the missing configuration when the secret is unset', () => {
    const onMissingSecret = vi.fn();
    const guard = createTelegramWebhookGuard({
      getSecret: () => undefined,
      onMissingSecret,
    });
    const { req, res, next } = fakeExchange('any-value');
    guard(req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(onMissingSecret).toHaveBeenCalledTimes(1);
  });

  it('lets a Telegram update with the right secret through to the bot handler', () => {
    const guard = createTelegramWebhookGuard({
      getSecret: () => 'expected-secret',
      onMissingSecret: vi.fn(),
    });
    const { req, res, next } = fakeExchange('expected-secret');
    guard(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sendStatus).not.toHaveBeenCalled();
  });
});

describe('canSyncTelegramDraft (S3 sync-draft)', () => {
  it('allows only members of the space the chat is linked to', () => {
    const link = { spaceId: SPACE_ID };
    expect(
      canSyncTelegramDraft({ uid: 'other-member-uid', link, space: ownerSpace })
    ).toBe(true);
    expect(canSyncTelegramDraft({ uid: OWNER, link, space: ownerSpace })).toBe(
      true
    );
    expect(
      canSyncTelegramDraft({ uid: 'stranger-uid', link, space: ownerSpace })
    ).toBe(false);
    expect(
      canSyncTelegramDraft({ uid: OWNER, link: null, space: ownerSpace })
    ).toBe(false);
    expect(canSyncTelegramDraft({ uid: OWNER, link, space: null })).toBe(false);
  });
});
