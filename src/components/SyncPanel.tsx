import React, { useState } from 'react';
import {
  BellRing,
  Check,
  ChevronDown,
  CloudLightning,
  Copy,
  Loader2,
  Lock,
  LogIn,
  Mail,
  PlusCircle,
  RefreshCw,
  Send,
  Undo2,
  Upload,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { Space, AccessRequest, normalizeSpaceId } from '../lib/firebase';
import { SpaceMembersList } from './SpaceMembersList';

interface SyncPanelProps {
  user: import('firebase/auth').User | null;
  currentSpaceId: string;
  // The signed-in user's own default space (uid-derived, or its existing one).
  personalSpaceId?: string;
  isAuthLoading?: boolean;
  spaceInfo: Space | null;
  pendingRequests?: AccessRequest[];
  activePendingRequest?: {
    spaceId: string;
    requestId: string;
    spaceName: string;
  } | null;
  onLogin: () => Promise<void>;
  onEmailLogin: (email: string, pass: string) => Promise<void>;
  onEmailRegister: (email: string, pass: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onJoinSpace: (spaceCodeOrId: string, spaceName?: string) => Promise<void>;
  onApproveRequest?: (req: AccessRequest) => Promise<void>;
  onRejectRequest?: (reqId: string) => Promise<void>;
  onCancelMyRequest?: () => Promise<void>;
  onRegenerateCode?: () => Promise<void>;
  onUploadLocalData: () => Promise<void>;
  hasLocalData: boolean;
  onRevokeMember?: (memberUid: string, emailOrName: string) => Promise<void>;
}

export default function SyncPanel({
  user,
  isAuthLoading = false,
  currentSpaceId,
  personalSpaceId = '',
  spaceInfo,
  pendingRequests = [],
  activePendingRequest = null,
  onLogin,
  onEmailLogin,
  onEmailRegister,
  onLogout,
  onJoinSpace,
  onApproveRequest,
  onRejectRequest,
  onCancelMyRequest,
  onRegenerateCode,
  onUploadLocalData,
  hasLocalData,
  onRevokeMember,
}: SyncPanelProps) {
  const [targetSpaceId, setTargetSpaceId] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  // Which copy button was pressed last, to flash "Copiado" on it.
  const [copiedKey, setCopiedKey] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Email/Password auth states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setAuthLoading(true);
    setAuthError('');
    try {
      if (isRegisterMode) {
        await onEmailRegister(email.trim(), password.trim());
      } else {
        await onEmailLogin(email.trim(), password.trim());
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      setAuthError(error.message || String(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSpaceId.trim()) return;

    setIsJoining(true);
    try {
      await onJoinSpace(targetSpaceId.trim(), '');
      setTargetSpaceId('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsJoining(false);
    }
  };

  const effectiveSpaceId = currentSpaceId
    ? normalizeSpaceId(currentSpaceId)
    : personalSpaceId;
  const displayCode = spaceInfo?.code || 'ESP-SECURE';

  // True when the active space is someone else's (not the user's own default).
  const myPersonalSpaceId = user ? personalSpaceId : '';
  const isInOtherSpace =
    !!myPersonalSpaceId && effectiveSpaceId !== myPersonalSpaceId;
  const telegramCommand = `/conectar ${displayCode}`;

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const copyToClipboard = async (textToCopy: string, key: string) => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      flashCopied(key);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        flashCopied(key);
      } catch (e) {
        console.error('Fallback copy error:', e);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleShareWhatsApp = (codeOrId: string) => {
    const text = `¡Hola! Únete a mi espacio financiero en la app de presupuesto con este código del espacio: *${codeOrId}*. Para unirte, abre la app, entra a Nube y Compartir e introduce el código para solicitar acceso.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const inputClass =
    'w-full min-h-10 bg-card border border-border/40 rounded-xl px-4 py-2 text-sm text-foreground focus:outline-none focus:border-cyan-500/30';
  const labelClass =
    'block text-xs font-bold text-muted-foreground/80 uppercase tracking-wider mb-1';
  const blockClass =
    'min-w-0 space-y-3 bg-muted/10 p-4 sm:p-5 rounded-xl border border-border/40';
  const blockTitleClass =
    'text-sm font-bold text-foreground flex items-center gap-2';
  const helpClass =
    'text-xs text-muted-foreground/80 font-light leading-relaxed';

  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/40 pb-5 mb-5">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-light text-foreground flex items-center gap-2">
            <CloudLightning className="h-5 w-5 text-cyan-400 shrink-0" />
            Nube y Finanzas Compartidas
          </h2>
          <p className="text-xs text-muted-foreground/80 max-w-xl font-light">
            {user
              ? 'Tus datos se guardan en la nube y se comparten con quien tú decidas.'
              : 'Inicia sesión para guardar tus datos en la nube y compartirlos con quien quieras.'}
          </p>
        </div>

        {!user ? (
          <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-1 rounded font-bold uppercase tracking-wider">
            Sin conexión
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-3 min-w-0 max-w-full">
            <div className="min-w-0 md:text-right">
              <span className="text-xs text-muted-foreground/80 block font-light">
                Conectado como
              </span>
              <span className="text-xs font-bold text-cyan-400 block break-all">
                {user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="min-h-10 px-3.5 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground/80 border border-border/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cerrar Sesión
            </button>
          </div>
        )}
      </div>

      {isAuthLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-muted/10 rounded-xl border border-border/40">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mb-4" />
          <p className="text-sm text-muted-foreground font-medium">
            Verificando sesión...
          </p>
        </div>
      ) : !user ? (
        <div className="mx-auto w-full max-w-md min-w-0 space-y-4">
          <button
            type="button"
            onClick={onLogin}
            className="w-full min-h-12 py-3 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10"
          >
            <Lock className="h-4 w-4" />
            Continuar con Google
          </button>

          <div className="min-w-0 border border-border/40 rounded-xl bg-muted/10">
            <button
              type="button"
              aria-expanded={showEmailForm}
              aria-controls="sync-email-form"
              onClick={() => setShowEmailForm((v) => !v)}
              className="w-full min-h-11 px-4 py-2 flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-cyan-400" />
                Usar correo y contraseña
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showEmailForm ? 'rotate-180' : ''}`}
              />
            </button>

            {showEmailForm && (
              <form
                id="sync-email-form"
                onSubmit={handleEmailAuthSubmit}
                className="px-4 pb-4 space-y-3"
              >
                <p className={helpClass}>
                  {isRegisterMode
                    ? 'Crea una cuenta nueva con tu correo.'
                    : 'Entra con el correo con el que te registraste.'}
                </p>
                <div>
                  <label htmlFor="sync-email" className={labelClass}>
                    Correo electrónico
                  </label>
                  <input
                    id="sync-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="sync-password" className={labelClass}>
                    Contraseña
                  </label>
                  <input
                    id="sync-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className={inputClass}
                  />
                </div>

                {authError && (
                  <p className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-lg p-2 leading-relaxed break-words">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={authLoading || !email.trim() || !password.trim()}
                  className="w-full min-h-11 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Procesando...
                    </>
                  ) : isRegisterMode ? (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Registrarse e Iniciar Sesión
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Ingresar
                    </>
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterMode(!isRegisterMode);
                      setAuthError('');
                    }}
                    className="min-h-10 px-2 text-xs text-muted-foreground/80 hover:text-cyan-400 transition-colors underline cursor-pointer"
                  >
                    {isRegisterMode
                      ? '¿Ya tienes una cuenta? Inicia sesión aquí'
                      : '¿No tienes cuenta? Regístrate gratis aquí'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 min-w-0">
          {/* Strip shown when the active space is someone else's */}
          {isInOtherSpace && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-amber-300">
                  Estás en otro espacio
                </p>
                <p className="text-xs text-muted-foreground/80 break-all">
                  {spaceInfo?.name || effectiveSpaceId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onJoinSpace(myPersonalSpaceId)}
                className="min-h-10 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-[#070809] rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <Undo2 className="h-4 w-4" />
                Volver a mi espacio
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="min-w-0 space-y-4">
              {/* Block 1: Mi espacio */}
              <section className={blockClass} aria-labelledby="sync-my-space">
                <h3 id="sync-my-space" className={blockTitleClass}>
                  <User className="h-4 w-4 text-cyan-400 shrink-0" />
                  {isInOtherSpace ? 'Espacio actual' : 'Mi espacio'}
                </h3>

                {/* Pending access requests for the owner come first */}
                {pendingRequests.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl space-y-3">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <BellRing className="h-4 w-4 text-amber-400 animate-pulse shrink-0" />
                      Solicitudes pendientes ({pendingRequests.length})
                    </span>
                    <div className="space-y-2">
                      {pendingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="bg-black/40 p-3 rounded-lg border border-white/10 flex flex-col gap-3 min-w-0"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-muted-foreground block break-words">
                              {req.requesterName || req.requesterEmail}
                            </span>
                            <span className="text-xs text-muted-foreground/80 font-mono block break-all">
                              {req.requesterEmail}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {onApproveRequest && (
                              <button
                                type="button"
                                onClick={() => onApproveRequest(req)}
                                className="min-h-10 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                              >
                                <Check className="h-4 w-4" />
                                Aceptar
                              </button>
                            )}
                            {onRejectRequest && (
                              <button
                                type="button"
                                onClick={() => onRejectRequest(req.id)}
                                className="min-h-10 px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg font-bold text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                              >
                                <X className="h-4 w-4" />
                                Denegar
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-base font-bold text-muted-foreground break-words">
                  {spaceInfo?.name || 'Cargando espacio...'}
                </p>

                <div className="bg-black/40 p-3 rounded-lg border border-white/10 space-y-3 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">
                      Código del espacio
                    </span>
                    {onRegenerateCode && (
                      <button
                        type="button"
                        onClick={onRegenerateCode}
                        className="min-h-10 px-2 text-xs text-cyan-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                        title="Generar un código nuevo"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Regenerar
                      </button>
                    )}
                  </div>
                  <span className="text-cyan-300 text-lg font-mono font-black tracking-widest select-all block break-all">
                    {displayCode}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(displayCode, 'code')}
                      aria-label="Copiar código del espacio"
                      className="min-h-10 px-3 py-2 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 text-sm font-bold"
                    >
                      <Copy className="h-4 w-4" />
                      {copiedKey === 'code' ? '¡Copiado!' : 'Copiar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp(displayCode)}
                      className="min-h-10 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 text-sm font-bold"
                    >
                      <Send className="h-4 w-4" />
                      Compartir por WhatsApp
                    </button>
                  </div>
                </div>
                <p className={helpClass}>
                  Comparte este código con quien quieras invitar. Tú decides si
                  aceptas su solicitud.
                </p>
              </section>

              {/* Block 2: Personas */}
              <section className={blockClass} aria-labelledby="sync-people">
                <h3 id="sync-people" className={blockTitleClass}>
                  <User className="h-4 w-4 text-cyan-400 shrink-0" />
                  Personas
                </h3>
                <p className={helpClass}>
                  Quiénes tienen acceso a este espacio. El dueño puede quitar el
                  acceso.
                </p>
                {spaceInfo && onRevokeMember && (
                  <SpaceMembersList
                    spaceId={spaceInfo.id}
                    ownerId={spaceInfo.ownerUid}
                    members={spaceInfo.members || []}
                    currentUserId={user.uid}
                    onRevokeMember={onRevokeMember}
                  />
                )}
              </section>
            </div>

            <div className="min-w-0 space-y-4">
              {/* Block 3: Unirme a otro espacio */}
              <section className={blockClass} aria-labelledby="sync-join">
                <h3 id="sync-join" className={blockTitleClass}>
                  <PlusCircle className="h-4 w-4 text-cyan-400 shrink-0" />
                  Unirme a otro espacio
                </h3>

                {/* Requester's own pending request */}
                {activePendingRequest && (
                  <div className="bg-cyan-500/10 border border-cyan-500/30 p-3 rounded-xl space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-cyan-300 flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 text-cyan-400 animate-spin shrink-0" />
                        Solicitud enviada
                      </span>
                      <span className="text-xs text-cyan-300 bg-cyan-400/10 px-2 py-0.5 rounded font-bold">
                        Esperando al dueño
                      </span>
                    </div>
                    <p className={`${helpClass} break-words`}>
                      Pediste acceso a{' '}
                      <strong className="text-cyan-300">
                        {activePendingRequest.spaceName}
                      </strong>
                      . Cuando el dueño la acepte, tu app se actualizará sola.
                    </p>
                    {onCancelMyRequest && (
                      <button
                        type="button"
                        onClick={onCancelMyRequest}
                        className="min-h-10 px-3 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground/80 text-sm font-semibold rounded-lg border border-white/10 transition-all cursor-pointer"
                      >
                        Cancelar solicitud
                      </button>
                    )}
                  </div>
                )}

                <form onSubmit={handleJoin} className="space-y-3">
                  <div>
                    <label htmlFor="sync-join-code" className={labelClass}>
                      Código del espacio
                    </label>
                    <input
                      id="sync-join-code"
                      type="text"
                      required
                      value={targetSpaceId}
                      onChange={(e) => setTargetSpaceId(e.target.value)}
                      placeholder="ESP-XXXXXXXX"
                      className={`${inputClass} font-mono uppercase tracking-wider`}
                    />
                    <span className={`${helpClass} block mt-1`}>
                      Pídele el código al dueño del espacio. Él recibirá tu
                      solicitud y decidirá si te acepta.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={isJoining || !targetSpaceId.trim()}
                    className="w-full min-h-11 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/10"
                  >
                    {isJoining ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Enviando solicitud...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Solicitar acceso
                      </>
                    )}
                  </button>
                </form>
              </section>

              {/* Collapsed extras */}
              <section className={blockClass}>
                <button
                  type="button"
                  aria-expanded={showMoreOptions}
                  aria-controls="sync-more-options"
                  onClick={() => setShowMoreOptions((v) => !v)}
                  className="w-full min-h-10 flex items-center justify-between gap-2 text-sm font-bold text-foreground cursor-pointer"
                >
                  Más opciones
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showMoreOptions ? 'rotate-180' : ''}`}
                  />
                </button>

                {showMoreOptions && (
                  <div id="sync-more-options" className="space-y-5 min-w-0">
                    <div className="space-y-2 min-w-0">
                      <h4 className="text-sm font-bold text-muted-foreground">
                        Conectar Telegram
                      </h4>
                      <ol className="space-y-2 text-xs text-muted-foreground/80 font-light leading-relaxed list-decimal pl-5">
                        <li>Abre el bot de Telegram de la app.</li>
                        <li>
                          Envíale este comando. El dueño del espacio deberá
                          aprobarlo aquí.
                        </li>
                      </ol>
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 items-center bg-black/40 p-3 rounded-lg border border-white/10">
                        <code className="text-cyan-300 font-mono text-sm break-all min-w-0">
                          {telegramCommand}
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(telegramCommand, 'telegram')
                          }
                          aria-label="Copiar comando de Telegram"
                          className="min-h-10 px-3 py-2 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 text-sm font-bold"
                        >
                          <Copy className="h-4 w-4" />
                          {copiedKey === 'telegram' ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>

                    {hasLocalData && (
                      <div className="space-y-2 min-w-0">
                        <p className={helpClass}>
                          Pasa los registros guardados solo en este dispositivo
                          a este espacio en la nube.
                        </p>
                        <button
                          type="button"
                          onClick={onUploadLocalData}
                          className="w-full min-h-10 px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          Subir mis registros locales
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
