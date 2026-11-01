import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ClipboardPaste,
  Eye,
  HelpCircle,
  Loader2,
  Lock,
  Mail,
  MailSearch,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  Topic,
  Expense,
  Income,
  EditingMovement,
  ParsedMovement,
} from '../types';
import {
  fetchRecentBankEmails,
  parseEmailMovement,
  GmailMessageDetails,
} from '../lib/gmail';
import { getIdToken } from '../lib/firebase';

interface GmailSyncTabProps {
  user: import('firebase/auth').User | null;
  accessToken: string | null;
  onLogin: () => Promise<void>;
  topics: Topic[];
  incomes: Income[];
  expenses: Expense[];
  onAddExpense: (
    description: string,
    amount: number,
    topicId: string,
    date: string,
    source: 'INGRESOS' | 'AHORROS',
    confirmed: boolean,
    paymentMethod: 'DEBITO' | 'CREDITO' | 'EFECTIVO',
    verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL',
    reconciliationStatus?: 'PENDING' | 'VERIFIED'
  ) => void;
  onAddIncome: (
    description: string,
    amount: number,
    topicId: string,
    date: string,
    confirmed: boolean,
    method: 'DIGITAL' | 'EFECTIVO',
    verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL',
    reconciliationStatus?: 'PENDING' | 'VERIFIED'
  ) => void;
  onUpdateExpense: (
    id: string,
    description: string,
    amount: number,
    topicId: string,
    date: string,
    source: 'INGRESOS' | 'AHORROS',
    confirmed: boolean,
    paymentMethod: 'DEBITO' | 'CREDITO' | 'EFECTIVO',
    verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL',
    reconciliationStatus?: 'PENDING' | 'VERIFIED'
  ) => void;
  onUpdateIncome: (
    id: string,
    description: string,
    amount: number,
    topicId: string,
    date: string,
    confirmed: boolean,
    method: 'DIGITAL' | 'EFECTIVO',
    verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL',
    reconciliationStatus?: 'PENDING' | 'VERIFIED'
  ) => void;
  formatCurrency: (amount: number) => string;
}

export default function GmailSyncTab({
  user,
  accessToken,
  onLogin,
  topics,
  incomes,
  expenses,
  onAddExpense,
  onAddIncome,
  onUpdateExpense,
  onUpdateIncome,
}: GmailSyncTabProps) {
  const [emails, setEmails] = useState<GmailMessageDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom search query (pre-configured for Colombian banks, Wompi, PSE, payroll, and payment gateways)
  const [searchQuery, setSearchQuery] = useState(
    "subject:(Bancolombia OR Nequi OR Davivienda OR Daviplata OR Wompi OR PSE OR 'Mercado Pago' OR PayU OR Bold OR Nubank OR 'Banco de Bogota' OR BBVA OR Falabella OR Lulo OR RappiPay OR 'pago' OR 'compra' OR 'transferencia' OR 'abono' OR 'nómina' OR 'retiro' OR 'débito' OR 'crédito' OR 'transacción') OR from:(bancolombia.com OR nequi.com.co OR davivienda.com OR daviplata.com OR wompi.com OR wompi.co OR pse.com.co OR mercadopago.com OR payulatam.com OR bold.co OR nubank.com.co OR lulobank.com OR rappi.com)"
  );

  // Sync modes: 'gmail' or 'manual' (no setup required)
  const [syncMode, setSyncMode] = useState<'gmail' | 'manual'>('manual');
  const [manualText, setManualText] = useState('');
  const [manualAnalyzing, setManualAnalyzing] = useState(false);

  // AI analysis states
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [, setParsedResults] = useState<{ [msgId: string]: ParsedMovement }>(
    {}
  );
  const [editingResult, setEditingResult] = useState<EditingMovement | null>(
    null
  );
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('p_imported_gmail_ids');
    return saved ? JSON.parse(saved) : [];
  });

  const reconcileFetchedEmails = async (
    fetchedEmails: GmailMessageDetails[],
    currentImportedIds: string[]
  ) => {
    const pendingExpenses = expenses.filter(
      (e) => e.reconciliationStatus === 'PENDING'
    );
    const pendingIncomes = incomes.filter(
      (i) => i.reconciliationStatus === 'PENDING'
    );

    if (pendingExpenses.length === 0 && pendingIncomes.length === 0) return;

    const categories = topics.map((t) => t.name);
    const updatedIds = [...currentImportedIds];

    for (const msg of fetchedEmails) {
      if (updatedIds.includes(msg.id)) continue;

      try {
        const fullText = `Asunto: ${msg.subject}\nRemitente: ${msg.from}\nFecha: ${msg.date}\nContenido: ${msg.body}`;
        const idToken = await getIdToken();
        const parsed = await parseEmailMovement(fullText, categories, idToken);
        const parsedAmount = Math.ceil(parsed.amount || 0);

        if (parsed.type === 'EXPENSE' || parsed.type === 'TRANSFER') {
          const match = pendingExpenses.find(
            (e) => Math.abs(e.amount - parsedAmount) < 1
          );
          if (match) {
            onUpdateExpense(
              match.id,
              match.description,
              match.amount,
              match.topicId,
              match.date,
              match.source,
              match.confirmed,
              match.paymentMethod || 'DEBITO',
              'GMAIL',
              'VERIFIED'
            );
            updatedIds.push(msg.id);
            setImportedIds([...updatedIds]);
            localStorage.setItem(
              'p_imported_gmail_ids',
              JSON.stringify(updatedIds)
            );
          }
        } else if (parsed.type === 'INCOME') {
          const match = pendingIncomes.find(
            (i) => Math.abs(i.amount - parsedAmount) < 1
          );
          if (match) {
            onUpdateIncome(
              match.id,
              match.description,
              match.amount,
              match.topicId,
              match.date,
              match.confirmed,
              match.method || 'DIGITAL',
              'GMAIL',
              'VERIFIED'
            );
            updatedIds.push(msg.id);
            setImportedIds([...updatedIds]);
            localStorage.setItem(
              'p_imported_gmail_ids',
              JSON.stringify(updatedIds)
            );
          }
        }
      } catch (err) {
        console.error('Error auto-reconciling email:', err);
      }
    }
  };

  const handleFetchEmails = async () => {
    if (!accessToken) {
      setError(
        'No hay un token de acceso de Google. Por favor, inicia sesión de nuevo.'
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecentBankEmails(accessToken, searchQuery);
      setEmails(data);
      if (data.length === 0) {
        setError(
          'No se encontraron correos recientes que coincidan con los criterios bancarios.'
        );
      } else {
        reconcileFetchedEmails(data, importedIds);
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      console.error(error);
      if (error.message === 'UNAUTHORIZED_GMAIL_TOKEN') {
        setError(
          "Tu sesión de Google ha expirado. Por favor, haz clic en 'Volver a conectar con Google'."
        );
      } else {
        setError(`Error al consultar Gmail: ${error.message || err}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeEmail = async (msg: GmailMessageDetails) => {
    setAnalyzingId(msg.id);
    setError(null);
    try {
      const categories = topics.map((t) => t.name);
      // Combine email subject, date and snippet for rich AI parsing
      const fullText = `Asunto: ${msg.subject}\nRemitente: ${msg.from}\nFecha: ${msg.date}\nContenido: ${msg.body}`;

      const idToken = await getIdToken();
      const parsed = await parseEmailMovement(fullText, categories, idToken);

      setParsedResults((prev) => ({
        ...prev,
        [msg.id]: parsed,
      }));

      // Initialize the editing form state with the AI-parsed values
      setEditingResult({
        description: parsed.description || msg.subject,
        amount: Math.ceil(parsed.amount || 0),
        type: parsed.type || 'EXPENSE',
        targetCategory: parsed.targetCategory || topics[0]?.name || '',
        source: parsed.sourceCategory === 'Ahorros' ? 'AHORROS' : 'INGRESOS',
        paymentMethod:
          parsed.type === 'TRANSFER'
            ? 'DEBITO'
            : parsed.type === 'INCOME'
              ? 'DIGITAL'
              : 'DEBITO',
        date: new Date().toISOString().split('T')[0], // default to current date
        explanation: parsed.explanation || '',
      });
      setEditingMsgId(msg.id);
    } catch (err) {
      const error = err as Error & { code?: string };
      console.error(error);
      setError(`Error al analizar con IA: ${error.message || err}`);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleAnalyzeManualText = async (textToAnalyze?: string) => {
    const text = textToAnalyze || manualText;
    if (!text.trim()) return;
    setManualAnalyzing(true);
    setError(null);
    try {
      const categories = topics.map((t) => t.name);
      const idToken = await getIdToken();
      const parsed = await parseEmailMovement(text, categories, idToken);

      setParsedResults((prev) => ({
        ...prev,
        manual_alert: parsed,
      }));

      setEditingResult({
        description: parsed.description || 'Alerta Bancaria',
        amount: Math.ceil(parsed.amount || 0),
        type: parsed.type || 'EXPENSE',
        targetCategory: parsed.targetCategory || topics[0]?.name || '',
        source: parsed.sourceCategory === 'Ahorros' ? 'AHORROS' : 'INGRESOS',
        paymentMethod:
          parsed.type === 'TRANSFER'
            ? 'DEBITO'
            : parsed.type === 'INCOME'
              ? 'DIGITAL'
              : 'DEBITO',
        date: new Date().toISOString().split('T')[0],
        explanation: parsed.explanation || '',
        verificationSource: 'SMS_PUSH',
        reconciliationStatus: 'PENDING',
      });
      setEditingMsgId('manual_alert');
    } catch (err) {
      const error = err as Error & { code?: string };
      console.error(error);
      setError(`Error al analizar texto de la alerta: ${error.message || err}`);
    } finally {
      setManualAnalyzing(false);
    }
  };

  const handlePasteAndAnalyze = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setManualText(text);
      await handleAnalyzeManualText(text);
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
      setError('No se pudo leer el portapapeles. Pega el texto manualmente.');
    }
  };

  const handleSaveImport = () => {
    if (!editingResult) return;

    // Find the topic by name
    const topic =
      topics.find(
        (t) =>
          t.name.toLowerCase() === editingResult.targetCategory.toLowerCase()
      ) || topics[0];

    if (editingResult.type === 'INCOME') {
      onAddIncome(
        editingResult.description,
        editingResult.amount,
        topic.id,
        editingResult.date,
        true, // Confirmed by default since it parsed from real email
        editingResult.paymentMethod === 'EFECTIVO' ? 'EFECTIVO' : 'DIGITAL',
        editingResult.verificationSource,
        editingResult.reconciliationStatus
      );
    } else {
      onAddExpense(
        editingResult.description,
        editingResult.amount,
        topic.id,
        editingResult.date,
        editingResult.source,
        true, // Confirmed
        (editingResult.paymentMethod || 'DEBITO') as
          'DEBITO' | 'CREDITO' | 'EFECTIVO',
        editingResult.verificationSource,
        editingResult.reconciliationStatus
      );
    }

    // Mark as imported
    if (editingMsgId) {
      const updatedIds = [...importedIds, editingMsgId];
      setImportedIds(updatedIds);
      localStorage.setItem('p_imported_gmail_ids', JSON.stringify(updatedIds));
    }

    // Reset editing
    setEditingResult(null);
    setEditingMsgId(null);
  };

  return (
    <div className="space-y-6">
      {/* Mode Selector */}
      <div className="flex bg-card border border-border/40 p-1 rounded-xl w-full md:w-fit">
        <button
          onClick={() => {
            setSyncMode('manual');
            setEditingResult(null);
            setEditingMsgId(null);
          }}
          className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            syncMode === 'manual'
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/10'
              : 'text-muted-foreground/80 hover:text-muted-foreground'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Pegar Alerta Manual (Sin Configuración)
        </button>
        <button
          onClick={() => {
            setSyncMode('gmail');
            setEditingResult(null);
            setEditingMsgId(null);
          }}
          className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            syncMode === 'gmail'
              ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/10'
              : 'text-muted-foreground/80 hover:text-muted-foreground'
          }`}
        >
          <Mail className="h-4 w-4" />
          Conectar con Gmail (Automático)
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-red-400">Atención</h4>
            <p className="text-xs text-red-300 font-light">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column (Manual or Gmail list) */}
        {syncMode === 'manual' ? (
          <div className="bg-card border border-border/40 rounded-2xl p-6 shadow-xl space-y-5 h-fit">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                Analizador de Texto Inteligente (IA)
              </h2>
              <p className="text-xs text-muted-foreground/80 font-light leading-relaxed">
                Pega el texto de cualquier mensaje de texto (SMS), notificación
                push de tu celular o correo electrónico de transacciones de
                Bancolombia, Nequi, Davivienda, etc. Gemini extraerá los
                detalles al instante sin configurar nada más.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest">
                Texto de la Notificación / Mensaje
              </label>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                rows={5}
                className="w-full bg-muted/20 border border-border/40 rounded-xl p-4 text-xs text-foreground focus:outline-none focus:border-cyan-500/30 font-light leading-relaxed resize-none"
                placeholder="Ej. Bancolombia le informa compra de $56,000 en Supermercados D1 el 21/07/2026. O simplemente copia y pega el texto del correo..."
              />
            </div>

            <div className="space-y-2">
              <span className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest">
                ¿Quieres probar con un ejemplo rápido?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'Bancolombia le informa compra de $78,500 en Restaurante El Poblado el 21/07 a las 14:30.',
                  'Nequi: ¡Tu saldo aumentó! Recibiste $150,000 de Carlos Gómez para el almuerzo.',
                  'Daviplata: Compra exitosa por valor de $32,000 en Tiendas ARA.',
                  'Davivienda: Pago realizado de su tarjeta de crédito por $450,000.',
                ].map((example, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setManualText(example)}
                    className="p-2.5 bg-white/[0.02] hover:bg-cyan-500/5 text-muted-foreground/80 hover:text-cyan-400 border border-border/40 rounded-xl text-[10px] text-left font-light transition-all line-clamp-2 cursor-pointer"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handlePasteAndAnalyze}
                disabled={manualAnalyzing}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#070809] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/10"
              >
                <ClipboardPaste className="h-4 w-4" />
                Pegar y Analizar SMS / Notificación (1-Tap)
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-border/40"></div>
                <span className="flex-shrink-0 mx-4 text-[10px] text-muted-foreground/50 uppercase tracking-widest font-bold">
                  o pegar manualmente
                </span>
                <div className="flex-grow border-t border-border/40"></div>
              </div>

              <button
                onClick={() => handleAnalyzeManualText()}
                disabled={manualAnalyzing || !manualText.trim()}
                className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-[#070809] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10"
              >
                {manualAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analizando Alerta con IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analizar Texto con Gemini
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Intro info card */}
            <div className="bg-card border border-border/40 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                    <Mail className="h-5 w-5 text-cyan-400" />
                    Sincronizador Automático Gmail
                  </h2>
                  <p className="text-xs text-muted-foreground/80 font-light leading-relaxed">
                    Conéctate para escanear alertas de Bancolombia, Nequi,
                    Davivienda, etc.
                  </p>
                </div>

                {!accessToken ? (
                  <button
                    onClick={onLogin}
                    className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10"
                  >
                    <Lock className="h-4 w-4" />
                    Conectar con Google
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-bold flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Gmail Conectado
                    </span>
                    <button
                      onClick={handleFetchEmails}
                      disabled={loading}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground border border-border/40 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Buscar Alertas Bancarias
                    </button>
                  </div>
                )}
              </div>

              {accessToken && (
                <div className="pt-4 border-t border-border/40">
                  <details className="cursor-pointer group">
                    <summary className="text-xs text-muted-foreground/80 font-light flex items-center gap-1.5 select-none hover:text-muted-foreground">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
                      Configurar filtro de búsqueda de correos (Avanzado)
                    </summary>
                    <div className="mt-2.5 pl-5">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-muted/20 border border-border/40 rounded-xl px-4 py-2 text-xs text-foreground focus:outline-none focus:border-cyan-500/30 font-mono"
                        placeholder="Query de búsqueda en Gmail"
                      />
                      <p className="text-[10px] text-muted-foreground/80 mt-1">
                        Usa filtros estándar de búsqueda de Gmail como{' '}
                        <code className="text-cyan-400/80">
                          subject:(NombreBanco)
                        </code>{' '}
                        para filtrar alertas específicas.
                      </p>
                    </div>
                  </details>
                </div>
              )}

              {!accessToken && (
                <div className="mt-4 pt-4 border-t border-border/40">
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-5 flex flex-col gap-3">
                    <div className="flex gap-3">
                      <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0 h-fit">
                        <HelpCircle className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-amber-400">
                          Guía para solucionar el Error de Acceso (403:
                          access_denied)
                        </h4>
                        <p className="text-[11px] text-muted-foreground/80 leading-relaxed font-light">
                          Google restringe permisos sensibles como leer Gmail
                          por seguridad en apps en desarrollo. Para usarlo de
                          forma automática, debes agregar tu correo como
                          &quot;Usuario de prueba&quot; en tu consola OAuth de
                          Google Cloud.
                        </p>
                      </div>
                    </div>
                    <ol className="list-decimal list-inside text-[11px] text-muted-foreground/80 space-y-1 pl-1 font-light bg-black/20 p-3 rounded-xl border border-border/40">
                      <li>
                        Inicia sesión en tu{' '}
                        <a
                          href="https://console.cloud.google.com/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:underline"
                        >
                          Google Cloud Console
                        </a>
                        .
                      </li>
                      <li>
                        Ve a <strong>APIs y Servicios</strong> &gt;{' '}
                        <strong>Pantalla de consentimiento de OAuth</strong>.
                      </li>
                      <li>
                        Bajo <strong>Usuarios de prueba (Test Users)</strong>,
                        haz clic en <strong>+ Agregar usuarios</strong>.
                      </li>
                      <li>
                        Ingresa tu correo de Google (
                        <code className="text-cyan-400 bg-cyan-950/40 px-1 py-0.5 rounded font-mono">
                          {user?.email || 'tu_correo@gmail.com'}
                        </code>
                        ) y guarda.
                      </li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            {accessToken && emails.length > 0 && (
              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                {emails.map((msg) => {
                  const isImported = importedIds.includes(msg.id);
                  const isSelected = editingMsgId === msg.id;

                  return (
                    <div
                      key={msg.id}
                      className={`bg-card border rounded-2xl p-4 transition-all relative ${
                        isSelected
                          ? 'border-cyan-400/30 shadow-cyan-500/5 bg-cyan-950/5'
                          : isImported
                            ? 'border-emerald-500/10 opacity-70'
                            : 'border-border/40 hover:border-white/10'
                      }`}
                    >
                      {isImported && (
                        <div className="absolute top-4 right-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Importado
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <span className="text-[10px] font-bold text-cyan-400 font-mono block">
                              {msg.from.split('<')[0].trim()}
                            </span>
                            <h4 className="text-xs font-bold text-muted-foreground mt-0.5 line-clamp-1">
                              {msg.subject}
                            </h4>
                          </div>
                          <span className="text-[10px] text-muted-foreground/80 shrink-0 mt-0.5">
                            {new Date(msg.date).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground/80 font-light line-clamp-2 italic bg-black/10 p-2 rounded-lg border border-border/40">
                          &quot;{msg.snippet}&quot;
                        </p>

                        <div className="flex justify-between items-center pt-2">
                          <span className="text-[10px] text-muted-foreground/80">
                            ID: {msg.id.substring(0, 8)}...
                          </span>

                          {!isImported && (
                            <button
                              onClick={() => handleAnalyzeEmail(msg)}
                              disabled={analyzingId !== null}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-cyan-400 text-[#070809]'
                                  : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20'
                              }`}
                            >
                              {analyzingId === msg.id ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Analizando...
                                </>
                              ) : isSelected ? (
                                <>
                                  <Eye className="h-3.5 w-3.5" />
                                  Editando
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3.5 w-3.5" />
                                  Analizar con IA
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {accessToken && emails.length === 0 && !loading && (
              <div className="border border-dashed border-border/40 rounded-2xl p-8 text-center bg-white/[0.01]">
                <MailSearch className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground/80 font-light">
                  Haz clic en &quot;Buscar Alertas Bancarias&quot; arriba para
                  consultar tu bandeja.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Right column (shared review box) */}
        <div className="space-y-4">
          {editingResult ? (
            <div className="bg-card border border-cyan-400/20 rounded-2xl p-6 shadow-2xl space-y-4 sticky top-6">
              <div className="flex items-center gap-2 pb-3 border-b border-border/40">
                <div className="p-2 bg-cyan-500/15 text-cyan-400 rounded-lg">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Resultado del Análisis Inteligente (Gemini)
                  </h3>
                  <p className="text-[10px] text-muted-foreground/80 font-light">
                    Verifica e importa los datos extraídos automáticamente de la
                    alerta
                  </p>
                </div>
              </div>

              {editingResult.explanation && (
                <div className="bg-cyan-500/10 border border-cyan-500/15 rounded-xl p-3 text-xs text-cyan-300 font-light italic">
                  💡 &quot;{editingResult.explanation}&quot;
                </div>
              )}

              <div className="space-y-3.5">
                {/* Grid fields */}
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                    Descripción del Gasto / Ingreso
                  </label>
                  <input
                    type="text"
                    value={editingResult.description}
                    onChange={(e) =>
                      setEditingResult({
                        ...editingResult,
                        description: e.target.value,
                      })
                    }
                    className="w-full bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                      Monto ($)
                    </label>
                    <input
                      type="number"
                      value={editingResult.amount}
                      onChange={(e) =>
                        setEditingResult({
                          ...editingResult,
                          amount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-xs text-foreground focus:outline-none focus:border-cyan-500/30 font-mono text-cyan-400 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                      Tipo de Movimiento
                    </label>
                    <select
                      value={editingResult.type}
                      onChange={(e) =>
                        setEditingResult({
                          ...editingResult,
                          type: e.target.value,
                        })
                      }
                      className="w-full bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                    >
                      <option value="EXPENSE">Gasto (Débito)</option>
                      <option value="INCOME">Ingreso (Depósito)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                      Categoría (Tópico)
                    </label>
                    <select
                      value={editingResult.targetCategory}
                      onChange={(e) =>
                        setEditingResult({
                          ...editingResult,
                          targetCategory: e.target.value,
                        })
                      }
                      className="w-full bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                    >
                      {topics.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                      Fecha de Transacción
                    </label>
                    <input
                      type="date"
                      value={editingResult.date}
                      onChange={(e) =>
                        setEditingResult({
                          ...editingResult,
                          date: e.target.value,
                        })
                      }
                      className="w-full bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {editingResult.type === 'EXPENSE' && (
                    <div>
                      <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                        Fondo de Origen
                      </label>
                      <select
                        value={editingResult.source}
                        onChange={(e) =>
                          setEditingResult({
                            ...editingResult,
                            source: e.target.value as 'INGRESOS' | 'AHORROS',
                          })
                        }
                        className="w-full bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                      >
                        <option value="INGRESOS">Ingresos Mensuales</option>
                        <option value="AHORROS">Ahorros Acumulados</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1.5">
                      Método de Pago / Depósito
                    </label>
                    <select
                      value={editingResult.paymentMethod}
                      onChange={(e) =>
                        setEditingResult({
                          ...editingResult,
                          paymentMethod: e.target.value,
                        })
                      }
                      className="w-full bg-muted/20 border border-border/40 rounded-xl px-4 py-2.5 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                    >
                      <option value="DEBITO">Débito Digital</option>
                      <option value="CREDITO">Tarjeta de Crédito</option>
                      <option value="EFECTIVO">Efectivo</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  onClick={() => {
                    setEditingResult(null);
                    setEditingMsgId(null);
                  }}
                  className="w-1/3 py-2.5 bg-white/5 hover:bg-white/10 text-muted-foreground/80 border border-border/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Descartar
                </button>
                <button
                  onClick={handleSaveImport}
                  className="flex-1 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-500/10"
                >
                  <Check className="h-4 w-4" />
                  Registrar en Presupuesto
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[300px] border border-dashed border-border/40 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-white/[0.01]">
              <div className="p-4 bg-white/5 text-muted-foreground/80 rounded-full mb-3">
                <Sparkles className="h-6 w-6" />
              </div>
              <h4 className="text-xs font-bold text-muted-foreground/80">
                No hay selección activa
              </h4>
              <p className="text-xs text-muted-foreground/80 max-w-xs mt-1.5 font-light leading-relaxed">
                {syncMode === 'manual'
                  ? "Pega el texto de un movimiento bancario a la izquierda y presiona 'Analizar Texto con Gemini' para rellenar este panel mediante IA."
                  : "Haz clic en 'Analizar con IA' en cualquier correo de la lista izquierda para extraer los datos de la transacción."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
