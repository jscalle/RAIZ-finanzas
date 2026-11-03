// Request handler for POST /api/assistant/messages (in-app Asistente tab).
// Pure function with injected dependencies, like requestSpaceAccess: server.ts only
// wires authentication, rate limiting and the real database/model.
import type { Firestore } from 'firebase-admin/firestore';
import {
  assertSpaceMember,
  buildDrafts,
  loadAssistantContext,
  runAssistantModel,
  savePendingDrafts,
} from './assistantService';
import type { GenerateFn } from './assistantService';

export const MAX_ASSISTANT_TEXT_LENGTH = 2000;

export interface AssistantRouteDeps {
  getDb: () => Firestore;
  generate: GenerateFn;
  now?: () => Date;
}

export interface AssistantRouteResult {
  httpStatus: number;
  body: unknown;
}

const bad = (error: string): AssistantRouteResult => ({ httpStatus: 400, body: { error } });

/**
 * Text-only for now: attachments are rejected until upload hardening (limits, MIME
 * from decoded bytes, quotas) exists. Nothing is saved except pending drafts, which
 * still need an explicit confirmation by the user.
 */
export async function handleAssistantMessage(
  deps: AssistantRouteDeps,
  input: { uid: string; body: unknown }
): Promise<AssistantRouteResult> {
  const body = input.body;
  if (typeof body !== 'object' || body === null) return bad('invalid_body');
  const { spaceId, text: rawText, attachment } = body as Record<string, unknown>;

  if (attachment !== undefined && attachment !== null) return bad('attachment_not_supported');
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) return bad('empty_message');
  if (text.length > MAX_ASSISTANT_TEXT_LENGTH) return bad('text_too_long');

  const member = await assertSpaceMember(deps.getDb, spaceId, input.uid);
  if (!member.ok) return { httpStatus: member.httpStatus, body: member.body };

  const ctx = await loadAssistantContext(deps.getDb, spaceId as string);
  const { parsed, usedFallback } = await runAssistantModel(deps, ctx, { text });

  const transactions: any[] = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  const drafts = buildDrafts({
    transactions,
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
      intent: parsed.intent ?? null,
      chatResponse: parsed.chatResponse || '',
      skippedSummary: parsed.skippedSummary || '',
      drafts,
      usedFallback,
    },
  };
}
