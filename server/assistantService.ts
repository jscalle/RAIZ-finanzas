// Channel-agnostic assistant core shared by the Telegram webhook and the in-app endpoint.
// The prompt and schema were moved verbatim out of server.ts; behaviour is unchanged.
import { Type } from '@google/genai';
import type { Firestore } from 'firebase-admin/firestore';
import {
  getColombiaDateISO,
  getSpaceFullContext,
  getSpaceTopics,
  normalizeDateToISO,
} from './assistantContext';
import { buildLocalFallbackResult } from './assistantFallback';
import { isSpaceMember, isValidSpaceId } from './security';
import type { SpaceDoc } from './security';

export const ASSISTANT_MODEL = 'gemini-3.8-flash';

export type AssistantTopic = { id: string; name: string; type: string };
export type AssistantMedia = { mimeType: string; dataBase64: string };
export type AssistantContext = {
  topics: AssistantTopic[];
  fullContext: any;
  todayISO: string;
};
/** Calls the model with the given parts and returns the raw JSON text. */
export type GenerateFn = (req: { contents: any[] }) => Promise<string>;

export const assistantResponseSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      description: "QUERY si es una pregunta/consulta/análisis financiero; RECORD si es para registrar movimientos.",
    },
    chatResponse: {
      type: Type.STRING,
      description: "Respuesta conversacional o análisis financiero detallado en Markdown para el usuario (obligatorio cuando intent es QUERY o cuando el usuario hace una pregunta).",
    },
    skippedSummary: {
      type: Type.STRING,
      description: "Resumen breve si se omitieron movimientos que ya estaban registrados en la base de datos (vacío si no aplica).",
    },
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          currency: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          paymentMethod: { type: Type.STRING },
          date: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ["type", "amount", "description", "category", "paymentMethod", "date", "explanation"],
      },
    },
  },
  required: ["intent", "transactions"],
};

export function buildAssistantPrompt(ctx: AssistantContext, text: string): string {
  const { topics, fullContext, todayISO } = ctx;
  const recentRecords = fullContext?.recentRecords || [];
  const topicNames = topics.map((t) => `${t.name} (${t.type})`).join(', ');
  return `Actúa como FinPersonAI, el asesor y analista financiero personal del usuario en Colombia.
Tu tarea es decidir si el usuario está:
A) Haciendo una CONSULTA / PREGUNTA / ANÁLISIS sobre sus finanzas, saldos, presupuestos, categorías o historial (intent = "QUERY").
B) Enviando uno o varios gastos/ingresos nuevos (por texto, nota de voz/audio o imagen) para REGISTRARLOS (intent = "RECORD").
C) Ambos al mismo tiempo (ej: pide registrar algo y además hace una pregunta).

Fecha actual: ${todayISO} (Mes activo: ${fullContext?.currentMonth || todayISO.slice(0, 7)}).
Categorías disponibles en el presupuesto: [${topicNames}].

=== ESTADO FINANCIERO EN TIEMPO REAL DEL USUARIO ===
Resumen de Saldos y Liquidez (COP):
${JSON.stringify(fullContext?.financialSummary || {}, null, 2)}

Consumo de Presupuesto por Categoría en el Mes Actual (${fullContext?.currentMonth}):
${JSON.stringify(fullContext?.categoryBreakdown || [], null, 2)}

Metas de Ahorro:
${JSON.stringify(fullContext?.goals || [], null, 2)}

Últimos movimientos registrados en la base de datos (para responder consultas o evitar duplicados):
${JSON.stringify(recentRecords.slice(0, 80))}
=====================================================

Instrucciones clave:
1. Si hay un archivo de audio / nota de voz adjunto, escúchalo con total atención en español colombiano.
2. Si el usuario hace una pregunta, pide un análisis, consulta cuánto tiene disponible, cuánto ha gastado, cuánto le queda de presupuesto, qué movimientos tiene o pide consejos (intent = "QUERY"):
   - Redacta en "chatResponse" una respuesta clara, bien estructurada con viñetas, emojis y montos formateados en pesos colombianos (ej: $1.250.000), basándote ESTRICTAMENTE en los datos reales del ESTADO FINANCIERO EN TIEMPO REAL.
   - SIEMPRE presenta como cifra principal de disponibilidad el **Disponible Real para Gastar (Libre después de Topes y Ahorro)** = \`disponibleRealParaGastar\` junto con su explicación \`formulaDisponibleReal\`, tal como aparece en la tarjeta principal de la Web App.
   - Muestra también la **Reserva en Topes aún por Ejecutar** (\`reservaEnTopesPorEjecutar\`), los **Excesos fuera de tope** (\`excesosFueraDeTope\`), el **Consumo Real del Mes** (\`gastosConsumoRealMesActual\` separado en Débito/Efectivo y Compras con TC), los **Pagos a Tarjetas este mes** (\`pagosTarjetasCreditoMesActual\`) y las **Compras con TC en la App sin Cruzar** (\`deudaTcPendienteTotal\`). NUNCA inventes ni restes los excesos contra la reserva de otras categorías.
   - Deja "transactions" como un arreglo vacío [] si no pidió registrar ningún gasto/ingreso nuevo.
3. Si el usuario envía una nota de voz, imagen de recibos/movimientos o un texto describiendo un gasto/ingreso para registrar (intent = "RECORD"):
   - Extrae todas las transacciones nuevas en "transactions".
   - En "explanation", incluye brevemente qué entendiste (y si fue por audio, pon: "🎙️ Audio transcrito: ...").
   - Si pide comparar contra sus registros actuales para no duplicar, omite las que ya aparezcan en "Últimos movimientos registrados" y explícalo en "skippedSummary".
   - Lee con máxima precisión el monto numérico (amount), asigna una categoría exacta de la lista [${topicNames}], el método ("DEBITO", "CREDITO", "EFECTIVO", "DIGITAL") y la fecha YYYY-MM-DD.

Mensaje de texto adicional del usuario: "${text ? text.slice(0, 2000) : "(Nota de voz / imagen adjunta sin texto)"}"`;
}

export async function loadAssistantContext(
  getDb: () => Firestore,
  spaceId: string
): Promise<AssistantContext> {
  const topics = await getSpaceTopics(getDb, spaceId);
  const fullContext = await getSpaceFullContext(getDb, spaceId);
  return { topics, fullContext, todayISO: getColombiaDateISO() };
}

/** Runs the model; on any failure falls back to the local regex parser. */
export async function runAssistantModel(
  deps: { generate: GenerateFn },
  ctx: AssistantContext,
  input: { text: string; media?: AssistantMedia[] }
): Promise<{ parsed: any; usedFallback: boolean }> {
  const media = input.media ?? [];
  const contents: any[] = media.map((m) => ({
    inlineData: { mimeType: m.mimeType, data: m.dataBase64 },
  }));
  contents.push(buildAssistantPrompt(ctx, input.text));
  try {
    const raw = await deps.generate({ contents });
    return { parsed: JSON.parse(raw.trim() || '{}'), usedFallback: false };
  } catch (aiErr: any) {
    console.warn(
      '[assistant] Gemini API failed, activating local analytical & parser fallback:',
      aiErr?.status || aiErr?.message || aiErr
    );
    const hasImage = media.some((m) => m.mimeType.startsWith('image/'));
    return {
      parsed: buildLocalFallbackResult(input.text, ctx.fullContext, ctx.topics, ctx.todayISO, hasImage),
      usedFallback: true,
    };
  }
}

export type AssistantDraft = {
  id: string;
  spaceId: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  currency: string;
  description: string;
  category: string;
  topicId: string;
  paymentMethod: string;
  date: string;
  explanation: string;
  // The client treats this status as the pending-draft marker (src/App.tsx), so
  // every channel keeps it until Telegram is removed and the marker is renamed.
  status: 'TELEGRAM_DRAFT';
  source: 'SMS_WEBHOOK';
  createdAt: string;
};

/** Turns the model's transactions into pending drafts (category lookup, date normalization). */
export function buildDrafts(input: {
  transactions: any[];
  topics: AssistantTopic[];
  spaceId: string;
  text: string;
  todayISO: string;
  idPrefix: string;
  now: Date;
}): AssistantDraft[] {
  const { transactions: txList, topics, spaceId, text, todayISO, idPrefix, now } = input;
  return txList.map((parsed, i) => {
    const isIncome = parsed.type === 'INCOME';
    const matchedTopic =
      topics.find((t) => t.name.toLowerCase() === (parsed.category || '').toLowerCase()) ||
      topics.find((t) => t.type === (isIncome ? 'INCOME' : 'EXPENSE')) ||
      topics[0];
    return {
      id: `${idPrefix}${now.getTime().toString(36)}_${i}`,
      spaceId,
      type: isIncome ? 'INCOME' : 'EXPENSE',
      amount: Number(parsed.amount) || 0,
      currency: parsed.currency || 'COP',
      description: parsed.description || (text ? text.slice(0, 40) : 'Comprobante'),
      category: matchedTopic ? matchedTopic.name : 'Gastos imprevistos',
      topicId: matchedTopic ? matchedTopic.id : 'topic_1785985166584',
      paymentMethod: parsed.paymentMethod || (isIncome ? 'DIGITAL' : 'DEBITO'),
      date: normalizeDateToISO(parsed.date || todayISO),
      explanation:
        txList.length > 1
          ? `(${i + 1} de ${txList.length}) ${parsed.explanation || ''}`
          : parsed.explanation || '',
      status: 'TELEGRAM_DRAFT',
      source: 'SMS_WEBHOOK',
      createdAt: now.toISOString(),
    };
  });
}

export type MemberCheck =
  | { ok: true; space: SpaceDoc }
  | { ok: false; httpStatus: 400 | 403 | 404; body: { error: string } };

/** The caller must be the owner or a member of the space. */
export async function assertSpaceMember(
  getDb: () => Firestore,
  spaceId: unknown,
  uid: string
): Promise<MemberCheck> {
  // "." and ".." and ids like "__x__" are reserved by Firestore and would throw on .doc().
  if (!isValidSpaceId(spaceId) || spaceId === '.' || spaceId === '..' || /^__.*__$/.test(spaceId)) {
    return { ok: false, httpStatus: 400, body: { error: 'invalid_space_id' } };
  }
  const snap = await getDb().collection('spaces').doc(spaceId).get();
  if (!snap.exists) return { ok: false, httpStatus: 404, body: { error: 'space_not_found' } };
  const space = (snap.data() ?? {}) as SpaceDoc;
  if (!isSpaceMember(space, uid)) return { ok: false, httpStatus: 403, body: { error: 'not_a_member' } };
  return { ok: true, space };
}
