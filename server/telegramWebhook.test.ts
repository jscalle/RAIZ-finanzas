// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  syncTelegramWebhookOnStartup,
  syncTelegramWebhookSecret,
} from './telegramWebhook';

const BOT_TOKEN = '000000000:TEST_BOT_TOKEN_VALUE';
const SECRET = 'TEST_WEBHOOK_SECRET_VALUE';
const WEBHOOK_URL = 'https://raiz.example.run.app/api/webhook/telegram';

type FakeCall = { method: string; body: Record<string, unknown> };

function fakeTelegram(webhookInfo: Record<string, unknown>) {
  const calls: FakeCall[] = [];
  const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
    const method = String(input).split('/').pop() || '';
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, body });
    const payload =
      method === 'getWebhookInfo'
        ? { ok: true, result: webhookInfo }
        : { ok: true, result: true, description: 'Webhook was set' };
    return { json: async () => payload } as unknown as Response;
  });
  return { calls, fetchImpl };
}

function fakeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function everythingLogged(logger: ReturnType<typeof fakeLogger>): string {
  return [logger.log, logger.warn, logger.error]
    .flatMap((fn) => fn.mock.calls.flat())
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join('\n');
}

describe('syncTelegramWebhookSecret (S2 startup re-registration)', () => {
  it('re-registers the current webhook URL with the secret and the same allowed_updates', async () => {
    const { calls, fetchImpl } = fakeTelegram({
      url: WEBHOOK_URL,
      allowed_updates: ['message', 'callback_query'],
      max_connections: 40,
      pending_update_count: 0,
    });
    const logger = fakeLogger();

    const result = await syncTelegramWebhookSecret({
      botToken: BOT_TOKEN,
      secret: SECRET,
      fetchImpl,
      logger,
    });

    expect(result).toBe('updated');
    expect(calls.map((c) => c.method)).toEqual([
      'getWebhookInfo',
      'setWebhook',
    ]);
    expect(calls[1].body).toEqual({
      url: WEBHOOK_URL,
      secret_token: SECRET,
      allowed_updates: ['message', 'callback_query'],
      max_connections: 40,
    });
    const logged = everythingLogged(logger);
    expect(logged).not.toContain(BOT_TOKEN);
    expect(logged).not.toContain(SECRET);
  });

  it('does not call setWebhook when no webhook URL is registered', async () => {
    const { calls, fetchImpl } = fakeTelegram({ url: '' });
    const result = await syncTelegramWebhookSecret({
      botToken: BOT_TOKEN,
      secret: SECRET,
      fetchImpl,
      logger: fakeLogger(),
    });
    expect(result).toBe('skipped-no-webhook');
    expect(calls.map((c) => c.method)).toEqual(['getWebhookInfo']);
  });

  it('does nothing when the bot token or the webhook secret is not configured', async () => {
    const { fetchImpl } = fakeTelegram({ url: WEBHOOK_URL });
    expect(
      await syncTelegramWebhookSecret({
        botToken: BOT_TOKEN,
        secret: undefined,
        fetchImpl,
        logger: fakeLogger(),
      })
    ).toBe('skipped-missing-config');
    expect(
      await syncTelegramWebhookSecret({
        botToken: undefined,
        secret: SECRET,
        fetchImpl,
        logger: fakeLogger(),
      })
    ).toBe('skipped-missing-config');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never logs the bot token or the secret when Telegram fails', async () => {
    const logger = fakeLogger();
    const fetchImpl = vi.fn(async () => {
      throw new Error(
        `request to https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo failed (${SECRET})`
      );
    });
    const result = await syncTelegramWebhookSecret({
      botToken: BOT_TOKEN,
      secret: SECRET,
      fetchImpl,
      logger,
    });
    expect(result).toBe('failed');
    const logged = everythingLogged(logger);
    expect(logged).not.toContain(BOT_TOKEN);
    expect(logged).not.toContain(SECRET);
    expect(logged).toContain('[telegram]');
  });
});

describe('syncTelegramWebhookOnStartup (S10 Cloud Run only)', () => {
  it('skips the re-registration and says so when K_SERVICE is not set', async () => {
    const { fetchImpl } = fakeTelegram({ url: WEBHOOK_URL });
    const logger = fakeLogger();

    const result = await syncTelegramWebhookOnStartup({
      cloudRunService: undefined,
      botToken: BOT_TOKEN,
      secret: SECRET,
      fetchImpl,
      logger,
    });

    expect(result).toBe('skipped-not-cloud-run');
    expect(fetchImpl).not.toHaveBeenCalled();
    const logged = everythingLogged(logger);
    expect(logged).toContain('K_SERVICE');
    expect(logged).toContain('skipping');
    expect(logged).not.toContain(BOT_TOKEN);
    expect(logged).not.toContain(SECRET);
  });

  it('re-registers the webhook with the secret when running on Cloud Run', async () => {
    const { calls, fetchImpl } = fakeTelegram({ url: WEBHOOK_URL });

    const result = await syncTelegramWebhookOnStartup({
      cloudRunService: 'raiz-finanzas-api',
      botToken: BOT_TOKEN,
      secret: SECRET,
      fetchImpl,
      logger: fakeLogger(),
    });

    expect(result).toBe('updated');
    expect(calls.map((c) => c.method)).toEqual([
      'getWebhookInfo',
      'setWebhook',
    ]);
    expect(calls[1].body).toMatchObject({
      url: WEBHOOK_URL,
      secret_token: SECRET,
    });
  });
});
