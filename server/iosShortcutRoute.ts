// Background webhook endpoint for iOS Shortcuts ("Obtener contenido de URL" / Get Contents of URL).
// Receives bank SMS or push notification text silently in the background without opening the app,
// parses the transaction, and saves it as a PENDING confirmation in Firestore.
import express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { getColombiaDateISO, getSpaceTopics } from './assistantContext';
import { findSpaceByCodeOrId } from './spaceAccess';
import { parseBankNotificationFallback } from '../src/lib/notificationAutomation';

export const MAX_IOS_SHORTCUT_TEXT_LENGTH = 2000;

export interface IosShortcutRouteDeps {
  getDb: () => Firestore;
  now?: () => Date;
  newId?: () => string;
}

export interface IosShortcutRouteResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

function defaultRandomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Recursively collects string values from a parsed body object, ignoring space code keys.
 */
function collectBodyStrings(value: unknown, ignoredUpperCode: string): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toUpperCase() === ignoredUpperCode) return [];
    return [trimmed];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectBodyStrings(item, ignoredUpperCode));
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const preferredKeys = ['text', 'message', 'content', 'body', 'ios_tx', 'mensaje', 'contenido'];
    for (const k of preferredKeys) {
      if (typeof obj[k] === 'string' && (obj[k] as string).trim()) {
        return [(obj[k] as string).trim()];
      }
    }
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'code' || k === 'spaceCode' || k === 'ios_space') continue;
      parts.push(...collectBodyStrings(v, ignoredUpperCode));
    }
    return parts;
  }
  return [];
}

/**
 * Extracts `code` and `text` flexibly from query params, raw URL tail, or JSON/form/text body
 * so iOS Shortcuts works whether configured as GET or POST (JSON / Form / Text).
 */
export function extractIosShortcutInput(req: {
  query?: Record<string, unknown>;
  body?: unknown;
  originalUrl?: string;
}): { code: string; text: string } {
  const query = req.query ?? {};
  const bodyObj =
    typeof req.body === 'object' && req.body !== null
      ? (req.body as Record<string, unknown>)
      : {};

  const rawCode =
    query.code ??
    query.ios_space ??
    bodyObj.code ??
    bodyObj.spaceCode ??
    bodyObj.ios_space ??
    '';
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  const upperCode = code.toUpperCase();

  // 1. Prefer POST body text when present (avoids URL space truncation in iOS Shortcuts)
  const bodyStrings = collectBodyStrings(req.body, upperCode);
  if (bodyStrings.length > 0) {
    return { code, text: bodyStrings.join(' ').trim() };
  }

  // 2. Check raw URL tail after ?text= or &text= or &ios_tx= in case unencoded spaces were sent
  if (typeof req.originalUrl === 'string') {
    const rawTailMatch = req.originalUrl.match(/[?&](?:text|ios_tx)=([^#]*)/i);
    if (rawTailMatch && rawTailMatch[1]) {
      const rawTail = rawTailMatch[1].replace(/\+/g, ' ');
      try {
        const decoded = decodeURIComponent(rawTail).trim();
        if (decoded) return { code, text: decoded };
      } catch {
        if (rawTail.trim()) return { code, text: rawTail.trim() };
      }
    }
  }

  // 3. Standard decoded query parameters
  const rawQueryText =
    query.text ?? query.ios_tx ?? query.message ?? query.content ?? '';
  const text = typeof rawQueryText === 'string' ? rawQueryText.trim() : '';

  return { code, text };
}

function matchBestTopic(
  text: string,
  description: string,
  type: 'INCOME' | 'EXPENSE',
  topics: Array<{ id: string; name: string; type: string }>
): { id: string; name: string } {
  const combined = `${text} ${description}`.toLowerCase();

  // Direct topic name match
  const exact = topics.find((t) => combined.includes(t.name.toLowerCase()));
  if (exact) return { id: exact.id, name: exact.name };

  if (type === 'EXPENSE') {
    if (
      /crepes|waffles|juan valdez|rappi|restaurante|almuerzo|cena|desayuno|caf[eé]|pizza|hamburguesa|comida|corral|starbucks|frisby|kfc|wok|mcdonald|mercado|supermercado|[eé]xito|d1|carulla|ara|ol[ií]mpica|vaquita|euro/i.test(
        combined
      )
    ) {
      const foodTopic = topics.find((t) =>
        /comida|alimenta|restaurante|mercado/i.test(t.name)
      );
      if (foodTopic) return { id: foodTopic.id, name: foodTopic.name };
    }

    if (
      /uber|didi|cabify|indriver|gasolina|terpel|primax|texaco|peaje|parqueadero|metro|transmilenio|flypass|gopass|transporte/i.test(
        combined
      )
    ) {
      const transportTopic = topics.find((t) =>
        /transporte|movilidad|veh[ií]culo|gasolina/i.test(t.name)
      );
      if (transportTopic)
        return { id: transportTopic.id, name: transportTopic.name };
    }

    if (
      /epm|claro|tigo|movistar|etb|wom|netflix|spotify|icloud|apple|google|openai|claude|amazon|disney|max|servicio|celular|internet|energ[ií]a|agua/i.test(
        combined
      )
    ) {
      const serviceTopic = topics.find((t) =>
        /servicio|suscripci|hogar|fijo/i.test(t.name)
      );
      if (serviceTopic) return { id: serviceTopic.id, name: serviceTopic.name };
    }

    if (
      /farmatodo|cruz verde|pasteur|droguer[ií]a|salud|eps|sura|medicina|consulta/i.test(
        combined
      )
    ) {
      const healthTopic = topics.find((t) => /salud|m[eé]dic/i.test(t.name));
      if (healthTopic) return { id: healthTopic.id, name: healthTopic.name };
    }
  }

  const byType =
    topics.find((t) => t.type === type || t.type === 'BOTH') || topics[0];
  if (byType) return { id: byType.id, name: byType.name };
  return { id: 'default', name: type === 'INCOME' ? 'Ingresos' : 'Otros' };
}

export async function handleIosShortcutNotification(
  deps: IosShortcutRouteDeps,
  input: { code: string; text: string }
): Promise<IosShortcutRouteResult> {
  const cleanCode = (input.code || '').trim();
  const safeText = (input.text || '').trim().slice(0, MAX_IOS_SHORTCUT_TEXT_LENGTH);

  if (!cleanCode) {
    return {
      httpStatus: 400,
      body: {
        ok: false,
        error: 'missing_space_code',
        message: 'Falta el código del espacio (code) en el Enlace Mágico.',
      },
    };
  }

  if (!safeText) {
    return {
      httpStatus: 400,
      body: {
        ok: false,
        error: 'missing_notification_text',
        message:
          'No se recibió el texto del mensaje. En Atajos, asegúrate de pasar Entrada del atajo (Contenido).',
      },
    };
  }

  const db = deps.getDb();
  const space = await findSpaceByCodeOrId(db, cleanCode);
  if (!space) {
    return {
      httpStatus: 404,
      body: {
        ok: false,
        error: 'space_not_found',
        message: 'No se encontró un espacio con ese código.',
      },
    };
  }

  const parsed = parseBankNotificationFallback(safeText);
  if (!parsed || parsed.amount <= 0) {
    return {
      httpStatus: 422,
      body: {
        ok: false,
        error: 'no_valid_amount',
        receivedTextPreview: safeText.slice(0, 80),
        message:
          'Se recibió la notificación pero no se detectó un monto válido en el texto enviado.',
      },
    };
  }

  const topics = await getSpaceTopics(deps.getDb, space.id);
  const matchedTopic = matchBestTopic(
    safeText,
    parsed.description,
    parsed.type,
    topics
  );

  const now = (deps.now ?? (() => new Date()))();
  const rand = (deps.newId ?? defaultRandomId)();
  const todayISO = getColombiaDateISO();
  const draftId = `ios_${now.getTime()}_${rand}`;

  const draft = {
    id: draftId,
    spaceId: space.id,
    type: parsed.type,
    amount: parsed.amount,
    currency: 'COP',
    description: parsed.description,
    category: matchedTopic.name,
    topicId: matchedTopic.id,
    paymentMethod: parsed.paymentMethod,
    date: todayISO,
    rawText: safeText,
    explanation:
      'Detectado automáticamente desde tu Atajo de iOS (pendiente por confirmar).',
    status: 'PENDING' as const,
    source: 'SMS_WEBHOOK' as const,
    createdAt: now.toISOString(),
  };

  await db
    .collection('spaces')
    .doc(space.id)
    .collection('pending_transactions')
    .doc(draftId)
    .set(draft);

  return {
    httpStatus: 200,
    body: {
      ok: true,
      status: 'PENDING',
      message: `Movimiento pendiente creado: ${draft.description} ($${draft.amount.toLocaleString('es-CO')})`,
      draft,
    },
  };
}

export function registerIosShortcutRoutes(
  app: express.Express,
  wiring: {
    guard: express.RequestHandler;
    rateLimit: (req: express.Request, res: express.Response) => boolean;
    deps: IosShortcutRouteDeps;
  }
): void {
  const parsers = [
    express.urlencoded({ extended: true, limit: '256kb' }),
    express.text({ type: ['text/*', 'application/octet-stream'], limit: '256kb' }),
  ];

  app.all(
    '/api/automation/ios-shortcut',
    wiring.guard,
    ...parsers,
    async (req, res) => {
      if (!wiring.rateLimit(req, res)) return;
      try {
        const extracted = extractIosShortcutInput({
          query: req.query as Record<string, unknown>,
          body: req.body,
          originalUrl: req.originalUrl,
        });
        const result = await handleIosShortcutNotification(
          wiring.deps,
          extracted
        );
        res.status(result.httpStatus).json(result.body);
      } catch (err) {
        console.error('[ios-shortcut] Error in /api/automation/ios-shortcut:', err);
        res.status(500).json({ ok: false, error: 'ios_shortcut_failed' });
      }
    }
  );
}
