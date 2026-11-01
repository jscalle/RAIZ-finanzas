// Startup routine that keeps the registered Telegram webhook in sync with
// TELEGRAM_WEBHOOK_SECRET, so deploying a new secret needs no manual
// setWebhook call. The bot token and the secret are never logged.

export type TelegramWebhookSyncResult =
  'skipped-missing-config' | 'skipped-no-webhook' | 'updated' | 'failed';

export type TelegramWebhookStartupResult =
  TelegramWebhookSyncResult | 'skipped-not-cloud-run';

type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  result?: {
    url?: string;
    allowed_updates?: unknown;
    max_connections?: unknown;
  };
}

const REQUEST_TIMEOUT_MS = 10_000;

function redact(text: string, secrets: string[]): string {
  return secrets.reduce(
    (acc, secret) => (secret ? acc.split(secret).join('[redacted]') : acc),
    text
  );
}

export async function syncTelegramWebhookSecret(options: {
  botToken: string | undefined;
  secret: string | undefined;
  fetchImpl?: FetchLike;
  logger?: Logger;
}): Promise<TelegramWebhookSyncResult> {
  const { botToken, secret } = options;
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const logger: Logger = options.logger ?? console;
  if (!botToken || !secret) return 'skipped-missing-config';

  const callTelegram = async (
    method: string,
    body: Record<string, unknown>
  ): Promise<TelegramApiResponse> => {
    const response = await fetchImpl(
      `https://api.telegram.org/bot${botToken}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    return (await response.json()) as TelegramApiResponse;
  };

  try {
    const info = await callTelegram('getWebhookInfo', {});
    if (!info.ok) {
      logger.warn(
        `[telegram] getWebhookInfo failed; webhook secret not synced: ${redact(
          String(info.description ?? 'unknown error'),
          [botToken, secret]
        )}`
      );
      return 'failed';
    }

    const url = info.result?.url;
    if (!url) {
      logger.log(
        '[telegram] No webhook URL is registered; skipping webhook secret sync.'
      );
      return 'skipped-no-webhook';
    }

    const params: Record<string, unknown> = { url, secret_token: secret };
    if (Array.isArray(info.result?.allowed_updates)) {
      params.allowed_updates = info.result.allowed_updates;
    }
    if (typeof info.result?.max_connections === 'number') {
      params.max_connections = info.result.max_connections;
    }

    const updated = await callTelegram('setWebhook', params);
    if (!updated.ok) {
      logger.warn(
        `[telegram] setWebhook failed; webhook secret not synced: ${redact(
          String(updated.description ?? 'unknown error'),
          [botToken, secret]
        )}`
      );
      return 'failed';
    }

    logger.log(
      '[telegram] Webhook re-registered with the configured secret token.'
    );
    return 'updated';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `[telegram] Could not sync the webhook secret: ${redact(message, [
        botToken,
        secret,
      ])}`
    );
    return 'failed';
  }
}

// Startup entry point: re-registers the webhook only on Cloud Run (where
// K_SERVICE is set), so a local server sharing the bot token never re-points
// the production webhook to a different secret.
export async function syncTelegramWebhookOnStartup(
  options: Parameters<typeof syncTelegramWebhookSecret>[0] & {
    cloudRunService: string | undefined;
  }
): Promise<TelegramWebhookStartupResult> {
  if (!options.cloudRunService) {
    (options.logger ?? console).log(
      '[telegram] K_SERVICE is not set (not running on Cloud Run); skipping the startup webhook re-registration.'
    );
    return 'skipped-not-cloud-run';
  }
  return syncTelegramWebhookSecret(options);
}
