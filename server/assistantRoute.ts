// Request handler for POST /api/assistant/messages (in-app Asistente tab).
// Pure function with injected dependencies, like requestSpaceAccess: server.ts only
// wires authentication, rate limiting and the real database/model.
import express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { validateAttachment } from './assistantMedia';
import type { QuotaResult } from './assistantMedia';
import { normalizeDateToISO } from './assistantContext';
import {
  assertSpaceMember,
  buildDrafts,
  inAppInstructions,
  loadAssistantContext,
  runAssistantModel,
} from './assistantService';
import {
  attachmentKind,
  buildReplyMessages,
  compact,
  COPY,
  messageIdFor,
  newRandomId,
  threadMessages,
} from './assistantThread';
import type { ThreadMessage } from './assistantThread';
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
  /** Random part of message and draft ids; injectable for tests. */
  newId?: () => string;
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

/** A real calendar date as YYYY-MM-DD (also from dd/mm/yyyy), or '' so the caller uses today. */
function validIsoDate(raw: unknown): string {
  const text = str(raw).trim();
  if (!text) return '';
  // A timestamp such as 2026-11-07T10:00:00Z keeps its calendar date.
  const stamp = text.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
  const iso = stamp ? stamp[1] : normalizeDateToISO(text);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : '';
}

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
      date: validIsoDate(t.date),
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
  let attachmentMeta: ThreadMessage['attachment'];
  if (hasAttachment) {
    const check = validateAttachment(attachment);
    if (!check.ok) return bad(check.error);
    media = [{ mimeType: check.mimeType, dataBase64: (attachment as { dataBase64: string }).dataBase64 }];
    attachmentMeta = { kind: attachmentKind(check.mimeType), mimeType: check.mimeType, sizeBytes: check.sizeBytes };
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

  const db = deps.getDb();
  const clock = deps.now ?? (() => new Date());
  const rand = (deps.newId ?? newRandomId)();
  const space = spaceId as string;
  const startedAt = clock();
  const messages = threadMessages(db, space, input.uid);
  const userRef = messages.doc(messageIdFor(startedAt, rand, 0));

  // The user's message is visible right away as "analyzing". If this write fails there is
  // nothing to record yet and no model call is made, so the error simply propagates.
  await userRef.set(
    compact<ThreadMessage>({
      id: userRef.id,
      role: 'user',
      kind: 'text',
      text,
      status: 'analyzing',
      createdAt: startedAt.toISOString(),
      attachment: attachmentMeta,
    })
  );

  try {
    const ctx = await loadAssistantContext(deps.getDb, space);
    const { parsed, usedFallback } = await runAssistantModel(deps, ctx, {
      text,
      media,
      extraInstructions: inAppInstructions(ctx.topics.length > 0),
    });

    const answer: Record<string, unknown> = parsed && typeof parsed === 'object' ? parsed : {};
    const drafts = buildDrafts({
      transactions: sanitizeTransactions(answer.transactions),
      topics: ctx.topics,
      spaceId: space,
      text,
      todayISO: ctx.todayISO,
      idPrefix: `as_${rand}_`,
      now: startedAt,
    });
    const chatResponse = str(answer.chatResponse);
    const skippedSummary = str(answer.skippedSummary);
    const replies = buildReplyMessages({
      replyTo: userRef.id,
      chatResponse,
      skippedSummary,
      drafts,
      usedFallback,
      media: attachmentMeta?.kind,
      base: new Date(Math.max(clock().getTime(), startedAt.getTime() + 1)),
      rand,
    });

    // Drafts, replies and the "done" status commit together or not at all.
    const batch = db.batch();
    const pending = db.collection('spaces').doc(space).collection('pending_transactions');
    for (const d of drafts) batch.set(pending.doc(d.id), d);
    for (const m of replies) batch.set(messages.doc(m.id), compact(m));
    batch.update(userRef, { status: 'done', usedFallback });
    await batch.commit();

    return {
      httpStatus: 200,
      body: {
        messageId: userRef.id,
        intent: typeof answer.intent === 'string' ? answer.intent : null,
        chatResponse,
        skippedSummary,
        drafts,
        usedFallback,
      },
    };
  } catch (err) {
    console.error('[assistant] Failed to process a message:', err);
    try {
      const failedAt = new Date(Math.max(clock().getTime(), startedAt.getTime() + 1));
      const errorId = messageIdFor(failedAt, rand, 1);
      const batch = db.batch();
      batch.update(userRef, { status: 'failed' });
      batch.set(
        messages.doc(errorId),
        compact<ThreadMessage>({
          id: errorId,
          role: 'assistant',
          kind: 'error',
          text: COPY.failed,
          replyTo: userRef.id,
          createdAt: failedAt.toISOString(),
        })
      );
      await batch.commit();
    } catch (markErr) {
      console.error('[assistant] Could not record the failure in the thread:', markErr);
    }
    return { httpStatus: 500, body: { error: 'assistant_failed' } };
  }
}

export interface AssistantWiring {
  guard: express.RequestHandler;
  rateLimit: (req: express.Request, res: express.Response) => boolean;
  requireIdToken: (req: express.Request, res: express.Response) => Promise<{ uid: string } | null>;
  handler: (input: { uid: string; body: unknown }) => Promise<AssistantRouteResult>;
}

/** POST /api/assistant/messages: project guard, IP limit, token check, then the handler. */
export function registerAssistantRoutes(app: express.Express, wiring: AssistantWiring): void {
  app.post('/api/assistant/messages', wiring.guard, async (req, res) => {
    if (!wiring.rateLimit(req, res)) return;
    const caller = await wiring.requireIdToken(req, res);
    if (!caller) return;
    try {
      const result = await wiring.handler({ uid: caller.uid, body: req.body });
      res.status(result.httpStatus).json(result.body);
    } catch (err) {
      console.error('[assistant] Error in /api/assistant/messages:', err);
      res.status(500).json({ error: 'assistant_failed' });
    }
  });
}
