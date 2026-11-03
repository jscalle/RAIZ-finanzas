// Conversation thread of the in-app assistant.
// One thread per user and space: spaces/{spaceId}/assistant_threads/{uid}/messages/{id}.
// The server writes it with the Admin SDK; clients may only read their own thread
// (see firestore.rules). Raw media is never stored here, only its kind, type and size.
import { randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { AssistantDraft } from './assistantService';

export interface ThreadAttachment {
  kind: 'image' | 'audio';
  mimeType: string;
  sizeBytes: number;
}

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  /** text: an answer or the user's words; draft: a pending movement to confirm;
   *  notice: something the user should know; error: the message could not be processed. */
  kind: 'text' | 'draft' | 'notice' | 'error';
  text: string;
  createdAt: string;
  /** User messages: analyzing -> done | failed. */
  status?: 'analyzing' | 'done' | 'failed';
  usedFallback?: boolean;
  attachment?: ThreadAttachment;
  /** Assistant messages: the user message they answer. */
  replyTo?: string;
  /** Draft messages: the pending_transactions document and a snapshot to render it. */
  draftId?: string;
  draft?: {
    type: string;
    amount: number;
    currency: string;
    description: string;
    category: string;
    paymentMethod: string;
    date: string;
  };
}

export const COPY = {
  noResult: 'No pude identificar movimientos nuevos ni procesar la consulta.',
  failed: 'Algo salió mal al procesar tu mensaje. Intenta de nuevo en un momento.',
  mediaFallback: (kind: 'image' | 'audio') =>
    `No pude analizar tu ${kind === 'audio' ? 'audio' : 'imagen'} con la IA en este momento. Usé un lector básico: revisa lo que entendí o escríbeme el monto.`,
  reconciliation: (summary: string) => `Conciliación: ${summary}`,
  reviewDone: (summary: string) => `Revisión completada: ${summary}\n\nNo se encontraron movimientos nuevos para agregar.`,
};

export const newRandomId = (): string => randomBytes(3).toString('hex');

/** Time-sortable and unique: base-36 millisecond time, the request's random part, a padded counter. */
export const messageIdFor = (base: Date, rand: string, n: number): string =>
  `m${base.getTime().toString(36)}_${rand}_${String(n).padStart(3, '0')}`;

export function threadMessages(db: Firestore, spaceId: string, uid: string) {
  return db
    .collection('spaces')
    .doc(spaceId)
    .collection('assistant_threads')
    .doc(uid)
    .collection('messages');
}

/** Firestore rejects undefined values, so drop them. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function attachmentKind(mimeType: string): 'image' | 'audio' {
  return mimeType.startsWith('image/') ? 'image' : 'audio';
}

/** The assistant messages that answer one user message, in display order. */
export function buildReplyMessages(input: {
  replyTo: string;
  chatResponse: string;
  skippedSummary: string;
  drafts: AssistantDraft[];
  usedFallback: boolean;
  media?: 'image' | 'audio';
  base: Date;
  rand: string;
}): ThreadMessage[] {
  const { replyTo, chatResponse, skippedSummary, drafts, usedFallback, media, base, rand } = input;
  const out: Omit<ThreadMessage, 'id' | 'createdAt' | 'role' | 'replyTo'>[] = [];

  if (chatResponse.trim()) out.push({ kind: 'text', text: chatResponse });
  if (skippedSummary.trim()) {
    out.push(
      drafts.length > 0 || chatResponse.trim()
        ? { kind: 'notice', text: COPY.reconciliation(skippedSummary) }
        : { kind: 'text', text: COPY.reviewDone(skippedSummary) }
    );
  }
  for (const d of drafts) {
    out.push({
      kind: 'draft',
      text: d.explanation,
      draftId: d.id,
      draft: {
        type: d.type,
        amount: d.amount,
        currency: d.currency,
        description: d.description,
        category: d.category,
        paymentMethod: d.paymentMethod,
        date: d.date,
      },
    });
  }
  if (usedFallback && media) out.push({ kind: 'notice', text: COPY.mediaFallback(media) });
  if (out.length === 0) out.push({ kind: 'notice', text: COPY.noResult });

  return out.map((m, i) => ({
    ...m,
    id: messageIdFor(base, rand, i + 1),
    role: 'assistant' as const,
    replyTo,
    createdAt: new Date(base.getTime() + i).toISOString(),
  }));
}
