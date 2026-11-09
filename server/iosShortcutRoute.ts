// Background webhook endpoint for iOS Shortcuts ("Obtener contenido de URL" / Get Contents of URL).
// Receives bank SMS or push notification text silently in the background without opening the app,
// parses the transaction, and saves it as a PENDING confirmation in Firestore.
import express from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { getColombiaDateISO, getSpaceTopics } from './assistantContext';
import { findSpaceByCodeOrId } from './spaceAccess';
import { parseBankNotificationFallback } from '../src/lib/notificationAutomation';

export const MAX_IOS_SHORTCUT_TEXT_LENGTH = 2000;

export interface IosShortcutHistoricalExample {
  description: string;
  topicId: string;
  category: string;
  paymentMethod: string;
  amount: number;
}

export interface IosShortcutAiClassification {
  type?: 'INCOME' | 'EXPENSE';
  amount?: number;
  paymentMethod?: 'DEBITO' | 'CREDITO' | 'EFECTIVO' | 'DIGITAL';
  category?: string;
  description?: string;
  explanation?: string;
}

export interface IosShortcutRouteDeps {
  getDb: () => Firestore;
  now?: () => Date;
  newId?: () => string;
  classifyWithAi?: (input: {
    rawText: string;
    fallback: NonNullable<ReturnType<typeof parseBankNotificationFallback>>;
    topics: Array<{ id: string; name: string; type: string }>;
    recentExamples: IosShortcutHistoricalExample[];
  }) => Promise<IosShortcutAiClassification | null>;
}

export interface IosShortcutRouteResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

function defaultRandomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Strips multipart/form-data boundaries and headers if the raw body came from an iOS Form POST.
 */
function cleanMultipartText(raw: string): string {
  if (!raw.includes('Content-Disposition:') && !raw.startsWith('--')) {
    return raw.trim();
  }
  const lines = raw.split(/\r?\n/);
  const contentLines = lines.filter((line) => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('--')) return false;
    if (/^content-(disposition|type|transfer-encoding):/i.test(t)) return false;
    return true;
  });
  return contentLines.join(' ').trim();
}

/**
 * Recursively collects string values from a parsed body object, ignoring space code keys.
 */
function collectBodyStrings(value: unknown, ignoredUpperCode: string): string[] {
  if (typeof value === 'string') {
    const trimmed = cleanMultipartText(value);
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

const MERCHANT_STOPWORDS = new Set([
  'bancolombia',
  'davivienda',
  'nequi',
  'daviplata',
  'bbva',
  'compra',
  'compraste',
  'pago',
  'pagaste',
  'movimiento',
  'automatico',
  'inversiones',
  'comercializadora',
  'distribuidora',
  'colombia',
  'medellin',
  'bogota',
  'centro',
  'comercial',
  'sas',
  'ltda',
  'del',
  'las',
  'los',
  'por',
  'con',
  'para',
]);

function normalizeComparableText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadHistoricalExamples(
  db: Firestore,
  spaceId: string,
  topics: Array<{ id: string; name: string; type: string }>
): Promise<IosShortcutHistoricalExample[]> {
  try {
    const topicMap = new Map(topics.map((t) => [t.id, t.name]));
    const snap = await db
      .collection('spaces')
      .doc(spaceId)
      .collection('expenses')
      .limit(80)
      .get();
    if (snap.empty) return [];
    const results: IosShortcutHistoricalExample[] = [];
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const desc = typeof data.description === 'string' ? data.description.trim() : '';
      const topicId = typeof data.topicId === 'string' ? data.topicId : '';
      const category = topicMap.get(topicId) || '';
      if (!desc || !topicId || !category) continue;
      results.push({
        description: desc,
        topicId,
        category,
        paymentMethod:
          typeof data.paymentMethod === 'string' ? data.paymentMethod : 'DEBITO',
        amount: Number(data.amount) || 0,
      });
    }
    return results;
  } catch {
    return [];
  }
}

export function findHistoricalMerchantMatch(
  merchantOrDesc: string,
  examples: IosShortcutHistoricalExample[],
  topics: Array<{ id: string; name: string; type: string }>
): { id: string; name: string; learnedDescription?: string } | null {
  const cleanMerchant = normalizeComparableText(
    merchantOrDesc.replace(
      /^(bancolombia|davivienda|nequi|daviplata|nu|bbva)\s*:\s*/i,
      ''
    )
  );
  if (!cleanMerchant || cleanMerchant === 'movimiento automatico') return null;

  const merchantTokens = cleanMerchant
    .split(' ')
    .filter((tok) => tok.length >= 4 && !MERCHANT_STOPWORDS.has(tok));

  for (const ex of examples) {
    const normEx = normalizeComparableText(ex.description);
    if (!normEx) continue;

    const isDirectSubstring =
      cleanMerchant.length >= 4 &&
      (normEx.includes(cleanMerchant) || cleanMerchant.includes(normEx));

    const hasDistinctiveTokenMatch =
      merchantTokens.length > 0 &&
      merchantTokens.some((tok) => tok.length >= 5 && normEx.split(' ').includes(tok));

    if (isDirectSubstring || hasDistinctiveTokenMatch) {
      const validTopic = topics.find((t) => t.id === ex.topicId);
      if (validTopic) {
        return {
          id: validTopic.id,
          name: validTopic.name,
          learnedDescription: ex.description,
        };
      }
    }
  }
  return null;
}

export function matchBestTopic(
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
    // 1. Transporte / Gasolina / EDS / Movilidad / Parqueaderos / Peajes
    if (
      /uber|didi|cabify|indriver|gasolina|tanquead|tanqueo|retanqueo|\beds\b|estaci[oó]n de servicio|terpel|primax|texaco|biomax|zeuss|coesco|dayamo|peaje|parqueadero|celda|metro|transmilenio|flypass|gopass|transporte|moto|carro|taller|llantas|soat|tecnomec/i.test(
        combined
      )
    ) {
      const transportTopic = topics.find((t) =>
        /transporte|movilidad|veh[ií]culo|gasolina/i.test(t.name)
      );
      if (transportTopic)
        return { id: transportTopic.id, name: transportTopic.name };
    }

    // 2. Supermercados / Mercado de hogar -> Alimentación / Mercado
    if (
      /mercado|supermercado|pricesmart|supermu|[eé]xito|d1\b|carulla|\bara\b|ol[ií]mpica|vaquita|euro|makro|fruver|legumbres|verduras|carnicer/i.test(
        combined
      )
    ) {
      const groceryTopic =
        topics.find((t) => /alimenta|mercado/i.test(t.name)) ||
        topics.find((t) => /comida/i.test(t.name));
      if (groceryTopic) return { id: groceryTopic.id, name: groceryTopic.name };
    }

    // 3. Restaurantes / Cafés / Salidas / Comidas fuera -> Comidas extra / Restaurantes (fallback Alimentación)
    if (
      /crepes|waffles|juan valdez|rappi|restaurante|almuerzo|cena|desayuno|caf[eé]|pizza|hamburguesa|comida|corral|starbucks|frisby|kfc|wok|mcdonald|mcflurry|burrisimos|fresenata|todofresa|mekato|helado|postre|panader[ií]a|reposter[ií]a/i.test(
        combined
      )
    ) {
      const diningOutTopic =
        topics.find((t) => /comidas?\s*extra|restaurante|salida/i.test(t.name)) ||
        topics.find((t) => /comida|alimenta|mercado/i.test(t.name));
      if (diningOutTopic)
        return { id: diningOutTopic.id, name: diningOutTopic.name };
    }

    // 4. Mascotas (Rafiki / Perro / Veterinaria)
    if (
      /rafiki|fiki|veterinari|agaval|kanu|pet|mascota|nexgard|concentrado/i.test(
        combined
      )
    ) {
      const petTopic = topics.find((t) =>
        /rafiki|mascota|perro|gato|pet/i.test(t.name)
      );
      if (petTopic) return { id: petTopic.id, name: petTopic.name };
    }

    // 5. Deporte y Ocio (Tenis, Cadie, Decathlon, Gym, Cine)
    if (
      /tenis|cadie|cancha|deporte|decathlon|dekathlon|gym|smartfit|bodytech|cine|procinal|cinecolombia|boleta|entretenimiento/i.test(
        combined
      )
    ) {
      const sportTopic = topics.find((t) =>
        /tenis|deporte|ocio|entretenimiento/i.test(t.name)
      );
      if (sportTopic) return { id: sportTopic.id, name: sportTopic.name };
    }

    // 6. Suscripciones digitales / Cloud / IA
    if (
      /netflix|spotify|icloud|apple|google|gcp|openai|chatgpt|claude|anthropic|cursor|github|aws|azure|amazon|disney|max|youtube|suscripci/i.test(
        combined
      )
    ) {
      const subTopic =
        topics.find((t) => /suscripci|nube|ia\b|digital/i.test(t.name)) ||
        topics.find((t) => /servicio/i.test(t.name));
      if (subTopic) return { id: subTopic.id, name: subTopic.name };
    }

    // 7. Servicios Públicos y Telecomunicaciones
    if (
      /epm|claro|tigo|movistar|etb|wom|servicio|celular|internet|energ[ií]a|agua|acueducto|gas natural/i.test(
        combined
      )
    ) {
      const serviceTopic = topics.find((t) =>
        /servicio|hogar|fijo/i.test(t.name)
      );
      if (serviceTopic) return { id: serviceTopic.id, name: serviceTopic.name };
    }

    // 8. Pagos de Tarjetas de Crédito / Deudas
    if (
      /(?:abono|pago)\s+(?:a\s+|de\s+)?(?:tu\s+)?(?:t\.?\s*cr[eé]d|tarjeta|tc\b|nu\b|nubank|cr[eé]dito)/i.test(
        combined
      )
    ) {
      const debtTopic = topics.find((t) =>
        /tarjeta|cr[eé]dito|deuda/i.test(t.name)
      );
      if (debtTopic) return { id: debtTopic.id, name: debtTopic.name };
    }

    // 9. Salud / Droguerías / Imprevistos / Compras varias (Miniso, Dollarcity)
    if (
      /farmatodo|cruz verde|pasteur|droguer[ií]a|salud|eps|sura|medicina|consulta|copago|miniso|dollarcity/i.test(
        combined
      )
    ) {
      const healthTopic = topics.find((t) =>
        /salud|m[eé]dic|imprevisto/i.test(t.name)
      );
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
  let space = await findSpaceByCodeOrId(db, cleanCode);
  if (
    !space &&
    (cleanCode.toUpperCase() === 'ESP-SECURE' ||
      cleanCode.toUpperCase() === 'ESP-LOCAL')
  ) {
    try {
      const snap = await db.collection('spaces').limit(5).get();
      if (!snap.empty) {
        const preferred =
          snap.docs.find((d) => !d.id.startsWith('espacio_u_')) || snap.docs[0];
        if (preferred) {
          space = { id: preferred.id, ...(preferred.data() as Record<string, unknown>) };
        }
      }
    } catch (e) {
      console.warn('[ios-shortcut] Fallback space lookup failed:', e);
    }
  }
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
  const recentExamples = await loadHistoricalExamples(db, space.id, topics);

  // Stage 1: Historical Merchant Memory (exact merchant seen previously in this space)
  const historicalMatch = findHistoricalMerchantMatch(
    parsed.merchant || parsed.description,
    recentExamples,
    topics
  );

  // Stage 2: Deterministic Colombian merchant rules
  let matchedTopic = historicalMatch
    ? { id: historicalMatch.id, name: historicalMatch.name }
    : matchBestTopic(safeText, parsed.description, parsed.type, topics);

  let finalDescription =
    historicalMatch?.learnedDescription || parsed.description;
  let finalPaymentMethod: string = parsed.paymentMethod;
  let finalExplanation =
    parsed.paymentMethod === 'CREDITO'
      ? `Compra con Tarjeta de Crédito${parsed.cardLast4 ? ` (*${parsed.cardLast4})` : ''} detectada desde tu Atajo de iOS.`
      : `Movimiento con Débito/Cuenta${parsed.cardLast4 ? ` (*${parsed.cardLast4})` : ''} detectado desde tu Atajo de iOS.`;

  // Stage 3: Gemini AI enrichment (when available, bounded by a 5.5s timeout so iOS never times out)
  if (deps.classifyWithAi) {
    try {
      const aiResult = await Promise.race([
        deps.classifyWithAi({
          rawText: safeText,
          fallback: parsed,
          topics,
          recentExamples: recentExamples.slice(0, 35),
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5500)),
      ]);

      if (aiResult) {
        // Only override category with AI if we didn't already have an exact historical match for this merchant
        if (!historicalMatch && aiResult.category) {
          const aiTopic = topics.find(
            (t) => t.name.toLowerCase() === aiResult.category!.toLowerCase().trim()
          );
          if (aiTopic) {
            matchedTopic = { id: aiTopic.id, name: aiTopic.name };
          }
        }
        if (
          !historicalMatch?.learnedDescription &&
          aiResult.description &&
          aiResult.description.trim().length >= 3
        ) {
          finalDescription = aiResult.description.trim();
        }
        // Preserve CREDITO if regex already proved "T.Cred" / "TC"; otherwise allow AI to refine method
        if (parsed.paymentMethod === 'CREDITO') {
          finalPaymentMethod = 'CREDITO';
        } else if (
          aiResult.paymentMethod === 'CREDITO' ||
          aiResult.paymentMethod === 'DEBITO' ||
          aiResult.paymentMethod === 'EFECTIVO' ||
          aiResult.paymentMethod === 'DIGITAL'
        ) {
          finalPaymentMethod = aiResult.paymentMethod;
        }
        if (aiResult.explanation && aiResult.explanation.trim()) {
          finalExplanation = aiResult.explanation.trim();
        }
      }
    } catch (aiErr) {
      console.warn('[ios-shortcut] AI classification skipped, using local rules:', aiErr);
    }
  }

  const now = (deps.now ?? (() => new Date()))();
  const rand = (deps.newId ?? defaultRandomId)();
  const todayISO = parsed.date || getColombiaDateISO();
  const draftId = `ios_${now.getTime()}_${rand}`;

  const draft = {
    id: draftId,
    spaceId: space.id,
    type: parsed.type,
    amount: parsed.amount,
    currency: 'COP',
    description: finalDescription,
    category: matchedTopic.name,
    topicId: matchedTopic.id,
    paymentMethod: finalPaymentMethod,
    date: todayISO,
    rawText: safeText,
    explanation: finalExplanation,
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
    express.text({
      type: ['text/*', 'multipart/form-data', 'application/octet-stream'],
      limit: '256kb',
    }),
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
        console.log(
          `[ios-shortcut] method=${req.method} code=${extracted.code} textLen=${extracted.text.length}`
        );
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
