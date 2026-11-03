// Request handler for POST /api/assistant/messages (in-app Asistente tab).
// Pure function with injected dependencies, like requestSpaceAccess: server.ts only
// wires authentication, rate limiting and the real database/model.
import express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { validateAttachment } from './assistantMedia';
import type { QuotaResult } from './assistantMedia';
import {
  assertSpaceMember,
  buildDrafts,
  loadAssistantContext,
  runAssistantModel,
  savePendingDrafts,
} from './assistantService';
import type { GenerateFn } from './assistantService';

export const MAX_ASSISTANT_TEXT_LENGTH = 2000;
/** One message never creates more drafts than this, whatever the model answers. */
export const MAX_ASSISTANT_DRAFTS = 20;
// 10 MB attachment cap -> about 13.4 MB of base64, plus the JSON around it.
export const ASSISTANT_BODY_LIMIT = '15mb';

export interface AssistantQuota {
  take(key: string): QuotaResult;
}

export interface AssistantRouteDeps {
  getDb: () => Firestore;
  generate: GenerateFn;
  now?: () => Date;
  /** Per-user caps. Messages count every request; media counts requests with an attachment. */
  limits?: { messages: AssistantQuota; media: AssistantQuota };
}

/**
 * Body parser for /api/assistant/*. Mount it BEFORE the global express.json(): body-parser
 * skips a request that was already parsed, so this route keeps its own, smaller limit and
 * answers JSON errors instead of Express's default HTML page.
 */
export function assistantBodyParser(): express.RequestHandler[] {
  const onError: express.ErrorRequestHandler = (err, _req, res, next) => {
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large' });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    next(err);
  };
  return [express.json({ limit: ASSISTANT_BODY_LIMIT }), onError as unknown as express.RequestHandler];
}

export interface AssistantRouteResult {
  httpStatus: number;
  body: unknown;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Keeps only transactions with a finite amount above zero and forces the text fields to be strings. */
function sanitizeTransactions(raw: unknown): any[] {
  if (!Array.isArray(raw)) return [];
  const out: any[] = [];
  for (const t of raw) {
    if (out.length >= MAX_ASSISTANT_DRAFTS) break;
    if (typeof t !== 'object' || t === null) continue;
    const amount =
      typeof t.amount === 'number'
        ? t.amount
        : typeof t.amount === 'string' && t.amount.trim() !== ''
          ? Number(t.amount)
          : NaN;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push({
      ...t,
      amount,
      type: t.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      currency: str(t.currency),
      description: str(t.description),
      category: str(t.category),
      paymentMethod: str(t.paymentMethod),
      date: str(t.date),
      explanation: str(t.explanation),
    });
  }
  return out;
}

const bad = (error: string): AssistantRouteResult => ({ httpStatus: 400, body: { error } });
const limited = (error: string, retryAfterMs: number): AssistantRouteResult => ({
  httpStatus: 429,
  body: { error, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) },
});

/**
 * One message with optional text and at most one attachment (image, audio file or voice
 * note). The attachment type is decided from its bytes. Nothing is saved except pending
 * drafts, which still need an explicit confirmation by the user; the raw media is only
 * forwarded to the model and never stored.
 */
export async function handleAssistantMessage(
  deps: AssistantRouteDeps,
  input: { uid: string; body: unknown }
): Promise<AssistantRouteResult> {
  const body = input.body;
  if (typeof body !== 'object' || body === null) return bad('invalid_body');
  const { spaceId, text: rawText, attachment } = body as Record<string, unknown>;

  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (text.length > MAX_ASSISTANT_TEXT_LENGTH) return bad('text_too_long');
  const hasAttachment = attachment !== undefined && attachment !== null;
  let media: Array<{ mimeType: string; dataBase64: string }> = [];
  if (hasAttachment) {
    const check = validateAttachment(attachment);
    if (!check.ok) return bad(check.error);
    media = [{ mimeType: check.mimeType, dataBase64: (attachment as { dataBase64: string }).dataBase64 }];
  } else if (!text) {
    return bad('empty_message');
  }

  const member = await assertSpaceMember(deps.getDb, spaceId, input.uid);
  if (!member.ok) return { httpStatus: member.httpStatus, body: member.body };

  const messageQuota = deps.limits?.messages.take(input.uid);
  if (messageQuota && !messageQuota.allowed) return limited('rate_limited', messageQuota.retryAfterMs);
  if (hasAttachment) {
    const mediaQuota = deps.limits?.media.take(input.uid);
    if (mediaQuota && !mediaQuota.allowed) return limited('media_quota_exceeded', mediaQuota.retryAfterMs);
  }

  const ctx = await loadAssistantContext(deps.getDb, spaceId as string);
  const { parsed, usedFallback } = await runAssistantModel(deps, ctx, { text, media });

  const answer: Record<string, unknown> = parsed && typeof parsed === 'object' ? parsed : {};
  const drafts = buildDrafts({
    transactions: sanitizeTransactions(answer.transactions),
    topics: ctx.topics,
    spaceId: spaceId as string,
    text,
    todayISO: ctx.todayISO,
    idPrefix: 'as_',
    now: (deps.now ?? (() => new Date()))(),
  });
  if (drafts.length > 0) await savePendingDrafts(deps.getDb, spaceId as string, drafts);

  return {
    httpStatus: 200,
    body: {
      intent: typeof answer.intent === 'string' ? answer.intent : null,
      chatResponse: str(answer.chatResponse),
      skippedSummary: str(answer.skippedSummary),
      drafts,
      usedFallback,
    },
  };
}
