import React, { useState } from 'react';
import {
  BellRing,
  Check,
  CloudLightning,
  Copy,
  Info,
  Loader2,
  Lock,
  LogIn,
  Mail,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Space, AccessRequest, normalizeSpaceId } from '../lib/firebase';
import { SpaceMembersList } from './SpaceMembersList';

interface SyncPanelProps {
  user: import('firebase/auth').User | null;
  currentSpaceId: string;
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
  const [targetSpaceName, setTargetSpaceName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showInviteTooltip, setShowInviteTooltip] = useState(false);

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
      await onJoinSpace(targetSpaceId.trim(), targetSpaceName.trim());
      setTargetSpaceId('');
      setTargetSpaceName('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsJoining(false);
    }
  };

  const effectiveSpaceId = currentSpaceId
    ? normalizeSpaceId(currentSpaceId)
    : user?.email
      ? normalizeSpaceId(user.email.split('@')[0])
      : 'espacio_compartido';
  const displayCode = spaceInfo?.code || 'ESP-SECURE';

  // Quick space targets
  const myPersonalSpaceId = user?.email
    ? normalizeSpaceId(user.email.split('@')[0])
    : '';

  const copyToClipboard = async (textToCopy: string) => {
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setShowInviteTooltip(true);
      setTimeout(() => setShowInviteTooltip(false), 2000);
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
        setShowInviteTooltip(true);
        setTimeout(() => setShowInviteTooltip(false), 2000);
      } catch (e) {
        console.error('Fallback copy error:', e);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleShareWhatsApp = (codeOrId: string) => {
    const text = `¡Hola! Únete a mi espacio financiero en la app de presupuesto con mi CÓDIGO ÚNICO: *${codeOrId}*. Para unirte, abre la app, entra a Nube / Sync e introduce mi código para solicitar acceso.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <h2 className="text-lg font-light text-foreground flex items-center gap-2">
            <CloudLightning className="h-5 w-5 text-cyan-400" />
            Nube y Finanzas Compartidas
          </h2>
          <p className="text-xs text-muted-foreground/80 max-w-xl font-light">
            Sincroniza tus datos de presupuesto en la nube. Conéctate con tu
            pareja compartiendo el mismo código de espacio, o deja que tus
            familiares utilicen códigos diferentes para tener cuentas 100%
            aisladas.
          </p>
        </div>

        {!user ? (
          <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-1 rounded font-bold uppercase tracking-wider">
            Sin conexión
          </span>
        ) : (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-muted-foreground/80 block font-light">
                Conectado como
              </span>
              <span className="text-xs font-bold text-cyan-400">
                {user.email}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-muted-foreground/80 border border-border/40 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cerrar Sesión
            </button>
          </div>
        )}
      </div>

      {isAuthLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-muted/10 rounded-xl border border-border/40">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mb-4" />
          <p className="text-sm text-muted-foreground font-medium">Verificando sesión...</p>
        </div>
      ) : !user ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Explicación y Google Sign In */}
          <div className="bg-muted/10 p-5 rounded-xl border border-border/40 space-y-5 h-full flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                <Info className="h-4 w-4 text-cyan-400" />
                Sincronización en la Nube
              </h3>
              <p className="text-xs text-muted-foreground/80 font-light leading-relaxed">
                Puedes registrarte usando tu correo electrónico o iniciar sesión
                con Google de forma inmediata.
              </p>
              <ul className="text-[11px] text-muted-foreground/80 space-y-1.5 list-disc pl-4 font-light">
                <li>
                  <strong>Aislado y Seguro:</strong> Tus familiares pueden crear
                  su propio correo para tener presupuestos 100% aislados.
                </li>
                <li>
                  <strong>Presupuestos Compartidos:</strong> Invita a tu pareja
                  uniéndolos al mismo código de espacio una vez inicien sesión.
                </li>
                <li>
                  <strong>Sincronización en Tiempo Real:</strong> Todos los
                  dispositivos conectados al mismo código verán los datos al
                  instante.
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-border/40 space-y-3">
              <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest block text-center">
                O Inicia con Google
              </span>
              <button
                type="button"
                onClick={onLogin}
                className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10"
              >
                <Lock className="h-4 w-4" />
                Iniciar Sesión con Google
              </button>
            </div>
          </div>

          {/* Formulario de Email y Contraseña */}
          <form
            onSubmit={handleEmailAuthSubmit}
            className="bg-muted/10 p-5 rounded-xl border border-border/40 space-y-4"
          >
            <h3 className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-cyan-400" />
              {isRegisterMode
                ? 'Crear Nueva Cuenta'
                : 'Iniciar Sesión con Email'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className="w-full bg-card border border-border/40 rounded-xl px-4 py-2 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-card border border-border/40 rounded-xl px-4 py-2 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                />
              </div>

              {authError && (
                <p className="text-[10px] text-rose-400 bg-rose-500/5 border border-rose-500/10 rounded-lg p-2 leading-relaxed">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authLoading || !email.trim() || !password.trim()}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    {isRegisterMode ? (
                      <>
                        <UserPlus className="h-3.5 w-3.5" />
                        Registrarse e Iniciar Sesión
                      </>
                    ) : (
                      <>
                        <LogIn className="h-3.5 w-3.5" />
                        Ingresar
                      </>
                    )}
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setAuthError('');
                  }}
                  className="text-[11px] text-muted-foreground/80 hover:text-cyan-400 transition-colors underline cursor-pointer"
                >
                  {isRegisterMode
                    ? '¿Ya tienes una cuenta? Inicia sesión aquí'
                    : '¿No tienes cuenta? Regístrate gratis aquí'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Active Space Info & Notifications */}
          <div className="space-y-4 bg-muted/10 p-5 rounded-xl border border-border/40 flex flex-col justify-between">
            <div className="space-y-4">
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold font-mono inline-block">
                ESPACIO ACTIVO EN NUBE
              </span>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-muted-foreground">
                  {spaceInfo?.name || 'Cargando espacio...'}
                </h3>
                <p className="text-xs text-muted-foreground/80 font-light">
                  Miembros conectados al instante:{' '}
                  <strong className="text-cyan-400 font-normal">
                    {spaceInfo?.members?.length || 1}
                  </strong>
                </p>
              </div>

              {/* Unique Space Code Card */}
              <div className="bg-gradient-to-br from-cyan-950/40 via-cyan-900/10 to-transparent p-4 rounded-xl border border-cyan-500/30 space-y-3 shadow-lg shadow-cyan-500/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] bg-cyan-400 text-[#070809] px-2 py-0.5 rounded font-extrabold uppercase tracking-widest font-mono">
                    CÓDIGO ÚNICO DEL ESPACIO
                  </span>
                  {onRegenerateCode && (
                    <button
                      type="button"
                      onClick={onRegenerateCode}
                      className="text-[10px] text-cyan-300 hover:text-white transition-colors font-mono flex items-center gap-1 cursor-pointer"
                      title="Generar un nuevo código de acceso seguro"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerar
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-black/40 p-3 rounded-lg border border-white/10">
                  <div className="font-mono text-xs overflow-hidden">
                    <span className="text-muted-foreground/80 block text-[9px] uppercase font-sans font-bold">
                      Código Privado de Acceso
                    </span>
                    <span className="text-cyan-300 text-base font-black tracking-widest select-all block">
                      {displayCode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 relative">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(displayCode)}
                      className="flex-1 sm:flex-initial px-3 py-2 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shadow-md shadow-cyan-500/10"
                      title="Copiar código único"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareWhatsApp(displayCode)}
                      className="flex-1 sm:flex-initial px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shadow-md shadow-emerald-500/10"
                      title="Compartir por WhatsApp"
                    >
                      <Send className="h-3.5 w-3.5" />
                      WhatsApp
                    </button>

                    {showInviteTooltip && (
                      <span className="absolute bottom-full right-0 mb-2 px-2.5 py-1 bg-cyan-400 text-[#070809] text-[10px] font-bold rounded-md shadow-lg whitespace-nowrap animate-bounce">
                        ¡Código copiado!
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Pending Access Requests for Host */}
              {pendingRequests.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-3 shadow-lg shadow-amber-500/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <BellRing className="h-4 w-4 text-amber-400 animate-pulse" />
                      Solicitudes Pendientes ({pendingRequests.length})
                    </span>
                    <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded font-bold">
                      Aprobación requerida
                    </span>
                  </div>

                  <div className="space-y-2">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-black/40 p-3 rounded-lg border border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                      >
                        <div>
                          <span className="text-xs font-bold text-muted-foreground block">
                            {req.requesterName || req.requesterEmail}
                          </span>
                          <span className="text-[10px] text-muted-foreground/80 font-mono block">
                            {req.requesterEmail}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                          {onApproveRequest && (
                            <button
                              onClick={() => onApproveRequest(req)}
                              className="flex-1 sm:flex-initial px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-lg font-medium text-xs"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Aceptar
                            </button>
                          )}
                          {onRejectRequest && (
                            <button
                              onClick={() => onRejectRequest(req.id)}
                              className="flex-1 sm:flex-initial px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                              Denegar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Pending Request for Requester */}
              {activePendingRequest && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 p-4 rounded-xl space-y-3 shadow-lg shadow-cyan-500/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                      <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                      Solicitud Enviada
                    </span>
                    <span className="text-[10px] text-cyan-300 bg-cyan-400/10 px-2 py-0.5 rounded font-bold">
                      Esperando al anfitrión
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground/80 leading-relaxed font-light">
                    Solicitud enviada a{' '}
                    <strong className="text-cyan-300">
                      {activePendingRequest.spaceName}
                    </strong>
                    . Cuando el dueño la acepte, tu aplicación se refrescará y
                    actualizará automáticamente.
                  </p>
                  {onCancelMyRequest && (
                    <button
                      onClick={onCancelMyRequest}
                      className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-muted-foreground/80 text-xs font-semibold rounded-lg border border-white/10 transition-all cursor-pointer"
                    >
                      Cancelar Solicitud
                    </button>
                  )}
                </div>
              )}

              {/* Guía Visual de Compartido */}
              <div className="bg-white/[0.02] border border-border/40 p-4 rounded-xl space-y-3">
                <h4 className="text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-cyan-400" />
                  Sistema Seguro con Código Único y Aprobación
                </h4>

                <div className="space-y-2.5 text-[11px] text-muted-foreground/80 font-light leading-relaxed">
                  <div className="flex gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono font-bold flex items-center justify-center shrink-0">
                      1
                    </span>
                    <p>
                      <strong>Código Único Privado:</strong> Cada espacio tiene
                      un código seguro e adivinable (ej.{' '}
                      <span className="text-cyan-300 font-mono">
                        {displayCode}
                      </span>
                      ).
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono font-bold flex items-center justify-center shrink-0">
                      2
                    </span>
                    <p>
                      <strong>Notificación de Ingreso:</strong> Cuando alguien
                      intenta unirse, recibirás una notificación para{' '}
                      <strong className="text-emerald-400">Aceptar</strong> o{' '}
                      <strong className="text-rose-400">Denegar</strong>.
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono font-bold flex items-center justify-center shrink-0">
                      3
                    </span>
                    <p>
                      <strong>Refresco Automático:</strong> Al ser aceptado, la
                      app del usuario se actualiza al instante para ver
                      exactamente lo mismo en tiempo real.
                    </p>
                  </div>
                  <div className="flex gap-2.5 pt-1 border-t border-border/30">
                    <span className="h-5 w-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold flex items-center justify-center shrink-0">
                      📲
                    </span>
                    <p>
                      <strong>Seguridad en Telegram (Zero-Trust):</strong> Para
                      conectar una cuenta de Telegram a este espacio, envía en
                      el bot{' '}
                      <code className="text-cyan-300 font-mono bg-black/40 px-1.5 py-0.5 rounded">
                        /conectar {displayCode}
                      </code>
                      . Aunque alguien tenga el código, generará una{' '}
                      <strong className="text-amber-300">
                        alerta de solicitud pendiente
                      </strong>{' '}
                      aquí en la web y no tendrá acceso hasta que el dueño del
                      espacio lo apruebe.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {spaceInfo && user && onRevokeMember && (
              <SpaceMembersList
                spaceId={spaceInfo.id}
                ownerId={spaceInfo.ownerUid}
                members={spaceInfo.members || []}
                currentUserId={user.uid}
                onRevokeMember={onRevokeMember}
              />
            )}

            {hasLocalData && (
              <div className="border-t border-border/40 pt-4 mt-2 space-y-2">
                <div className="flex justify-between items-center gap-3">
                  <div>
                    <span className="text-xs font-bold text-muted-foreground/80 block">
                      Subir datos simulados
                    </span>
                    <span className="text-[10px] text-muted-foreground/80 block font-light">
                      Carga tus registros offline locales a este espacio en la
                      nube.
                    </span>
                  </div>
                  <button
                    onClick={onUploadLocalData}
                    className="px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
                  >
                    Subir Locales
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Join / Create Another Space Form */}
          <div className="space-y-4 bg-muted/10 p-5 rounded-xl border border-border/40 flex flex-col justify-between">
            <form onSubmit={handleJoin} className="space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
                <PlusCircle className="h-4 w-4 text-cyan-400" />
                Solicitar Acceso a un Espacio
              </h3>

              <p className="text-xs text-muted-foreground/80 font-light leading-relaxed">
                Introduce el <strong>Código Único de Espacio</strong> (ej.{' '}
                <code className="text-cyan-400 font-mono">ESP-XXXXXX</code>) o
                el ID del espacio para solicitar acceso al anfitrión.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1">
                    Código Único del Espacio o ID
                  </label>
                  <input
                    type="text"
                    required
                    value={targetSpaceId}
                    onChange={(e) => setTargetSpaceId(e.target.value)}
                    placeholder="ej. ESP-9K2F7M o espacio_hogar"
                    className="w-full bg-card border border-border/40 rounded-xl px-4 py-2 text-xs text-foreground focus:outline-none focus:border-cyan-500/30 font-mono uppercase tracking-wider"
                  />
                  <span className="text-[10px] text-muted-foreground/80 block mt-1">
                    Se enviará una notificación al dueño para que apruebe tu
                    ingreso.
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground/80 uppercase tracking-widest mb-1">
                    Nombre del Espacio (Opcional)
                  </label>
                  <input
                    type="text"
                    value={targetSpaceName}
                    onChange={(e) => setTargetSpaceName(e.target.value)}
                    placeholder="ej. Presupuesto Familiar"
                    className="w-full bg-card border border-border/40 rounded-xl px-4 py-2 text-xs text-foreground focus:outline-none focus:border-cyan-500/30"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isJoining || !targetSpaceId.trim()}
                  className="w-full py-2 bg-cyan-400 hover:bg-cyan-300 text-[#070809] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/10"
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Enviando solicitud...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Solicitar Acceso al Espacio
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Shortcuts */}
            {myPersonalSpaceId && (
              <div className="pt-4 border-t border-border/40 space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider block">
                  ⚡ Accesos Rápidos
                </span>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => onJoinSpace(myPersonalSpaceId)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition-all flex items-center justify-between border cursor-pointer ${
                      effectiveSpaceId === myPersonalSpaceId
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 font-bold'
                        : 'bg-white/5 text-muted-foreground/80 border-border/40 hover:bg-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <User className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
                      <span className="truncate">{myPersonalSpaceId}</span>
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-muted-foreground/80 font-sans font-bold shrink-0">
                      {effectiveSpaceId === myPersonalSpaceId
                        ? 'Activo'
                        : 'Mi Espacio'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
