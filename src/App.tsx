import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudLightning,
  CloudOff,
  LayoutDashboard,
  Loader2,
  Menu,
  RefreshCw,
  Shapes,
  Sprout,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Topic,
  Income,
  Expense,
  SavingGoal,
  SavingContribution,
  Withdrawal,
  PendingTransaction,
} from './types';
import DashboardSection from './components/DashboardSection';
import { PendingTransactionsBanner } from './components/PendingTransactionsBanner';
const IncomesSection = lazy(() => import('./components/IncomesSection'));
const ExpensesSection = lazy(() => import('./components/ExpensesSection'));
const SavingsSection = lazy(() => import('./components/SavingsSection'));

const TopicsConfig = lazy(() => import('./components/TopicsConfig'));
const AssistantTab = lazy(() => import('./components/AssistantTab'));
import EditPendingTransactionModal from './components/EditPendingTransactionModal';

export const getColombiaDateISO = (): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
};

// Pending transactions created by the Telegram bot carry extra Firestore fields
// (see server.ts draft documents) that the shared PendingTransaction type omits.
type PendingTransactionDraft = PendingTransaction & {
  topicId?: string;
  tgChatId?: number;
  tgMessageId?: number | null;
};

export const normalizeDateToISO = (dateStr: string): string => {
  if (!dateStr) return getColombiaDateISO();
  const regex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
  const match = dateStr.match(regex);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return dateStr;
};

const getMonthLabel = (monthString: string) => {
  if (monthString === 'all') return 'Todo el Historial';
  const [year, month] = monthString.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date
    .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    .replace(/^\w/, (c) => c.toUpperCase());
};

const incrementMonth = (monthString: string) => {
  if (monthString === 'all') return 'all';
  const [year, month] = monthString.split('-');
  let y = parseInt(year);
  let m = parseInt(month) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${m.toString().padStart(2, '0')}`;
};

const decrementMonth = (monthString: string) => {
  if (monthString === 'all') return 'all';
  const [year, month] = monthString.split('-');
  let y = parseInt(year);
  let m = parseInt(month) - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${m.toString().padStart(2, '0')}`;
};

import { calculateFinancials } from './lib/mathEngine';

// Cloud and Gmail Imports
import {
  googleSignIn,
  emailSignIn,
  emailSignUp,
  logout as firebaseLogout,
  initAuth,
  getOrCreateSpace,
  updateSpaceSavings,
  saveSpaceDocument,
  deleteSpaceDocument,
  syncSpaceSubcollection,
  normalizeSpaceId,
  Space,
  AccessRequest,
  requestAccessToSpace,
  resolveDefaultSpaceId,
  isPermissionDenied,
  subscribeToPendingAccessRequests,
  subscribeToAccessRequestStatus,
  approveAccessRequest,
  rejectAccessRequest,
  cancelAccessRequest,
  regenerateSpaceCode,
  readStoredToken,
  clearStoredToken,
  removeSpaceMember,
  syncTelegramDraftCard,
  db,
} from './lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
const SyncPanel = lazy(() => import('./components/SyncPanel'));
import { User } from 'firebase/auth';
import { useProfileStorage } from './hooks/useProfileStorage';
import { useGmailSync } from './hooks/useGmailSync';
import { addToSyncQueue, flushSyncQueue, getSyncQueue } from './lib/syncQueue';

const DEMO_SEED_IDS = new Set([
  'exp_1',
  'exp_2',
  'exp_3',
  'exp_4',
  'exp_5',
  'inc_1',
  'inc_2',
  'inc_3',
  'goal_1',
  'goal_2',
  'cnt_1',
  'cnt_2',
  'topic_vivienda',
  'topic_deudas',
]);

export default function App() {
  // Lock profile to default to eliminate custom demo profiles
  const profile = 'default';

  // State configurations for privacy control
  const [privacyMode, setPrivacyMode] = useState<'real' | 'masked' | 'scaled'>(
    () => {
      const local = localStorage.getItem('p_privacy_mode');
      return (local as 'real' | 'masked' | 'scaled') || 'real';
    }
  );

  const [privacyScale, setPrivacyScale] = useState<number>(() => {
    const local = localStorage.getItem('p_privacy_scale');
    return local ? parseFloat(local) : 1;
  });

  const [activeMonth, setActiveMonth] = useState<string>(() => {
    const local = localStorage.getItem('p_active_month');
    return local || '2026-08'; // Default starts at August 2026 as requested!
  });

  // Firebase Auth and Shared Space States
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [gToken, setGToken] = useState<string | null>(() => {
    return readStoredToken();
  });
  const [currentSpaceId, setCurrentSpaceId] = useState<string>(() => {
    return localStorage.getItem('p_current_space_id') || '';
  });
  // The signed-in user's own default space (S8): remembered or already owned
  // for existing users, uid-derived for new ones. Empty until resolved.
  const [personalSpaceId, setPersonalSpaceId] = useState<string>('');
  const [spaceInfo, setSpaceInfo] = useState<Space | null>(null);
  const [syncEnabled, setSyncEnabled] = useState<boolean>(false);
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);
  const [activePendingRequest, setActivePendingRequest] = useState<{
    spaceId: string;
    requestId: string;
    spaceName: string;
  } | null>(() => {
    const saved = localStorage.getItem('p_pending_access_req');
    return saved ? JSON.parse(saved) : null;
  });

  // Per-profile financial state (localStorage-backed when cloud sync is disabled)
  const {
    topics,
    setTopics,
    incomes,
    setIncomes,
    expenses,
    setExpenses,
    goals,
    setGoals,
    contributions,
    setContributions,
    withdrawals,
    setWithdrawals,
    startingSavings,
    setStartingSavings,
  } = useProfileStorage(profile, syncEnabled);

  const [activeTab, setActiveTab] = useState<
    | 'dashboard'
    | 'assistant'
    | 'incomes'
    | 'expenses'
    | 'savings'
    | 'topics'
    | 'sync_settings'
  >('dashboard');
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);

  // Custom Toast Notification State
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  } | null>(null);

  const [pendingTransactions, setPendingTransactions] = useState<
    PendingTransaction[]
  >([]);
  // The space whose pending drafts have loaded at least once; derived so it never
  // needs resetting when the space changes.
  const [pendingLoadedSpace, setPendingLoadedSpace] = useState('');
  const [editingPendingTx, setEditingPendingTx] =
    useState<PendingTransaction | null>(null);

  // Auto-clear toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Intercept window.alert and redirect to custom toast
  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message: string) => {
      if (
        message.includes('auth/popup-closed-by-user') ||
        message.includes('closed-by-user') ||
        message.includes('popup-closed')
      ) {
        setToast({
          message:
            'Inicio de sesión cancelado (cerraste la ventana emergente de Google).',
          type: 'info',
        });
        return;
      }
      setToast({ message: String(message), type: 'info' });
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);

  // Keep privacy and active config parameters synced
  useEffect(() => {
    localStorage.setItem('p_privacy_mode', privacyMode);
  }, [privacyMode]);

  useEffect(() => {
    localStorage.setItem('p_privacy_scale', privacyScale.toString());
  }, [privacyScale]);

  useEffect(() => {
    localStorage.setItem('p_active_month', activeMonth);
  }, [activeMonth]);

  // --- Firebase Sync Logic ---

  // Initialize Firebase Auth subscription
  useEffect(() => {
    const unsubAuth = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        if (token) {
          setGToken(token);
        }
        setSyncEnabled(true);
        setIsAuthLoading(false);
      },
      () => {
        setUser(null);
        setGToken(null);
        setSyncEnabled(false);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSpaceInfo(null);
        setIsAuthLoading(false);
      }
    );
    return () => unsubAuth();
  }, []);

  // Moves the app to the user's own space after losing access to the current
  // one (revoked, or never granted) and says why. Clearing the current space
  // lets the space loader below open the default space once it is ready.
  const switchToPersonalSpace = useCallback((message: string) => {
    setCurrentSpaceId('');
    localStorage.removeItem('p_current_space_id');
    setToast({ message, type: 'warning' });
  }, []);

  // 0. Resolve the signed-in user's default space id (S8)
  const userUid = user?.uid;
  const userEmail = user?.email;
  useEffect(() => {
    if (!syncEnabled || !userUid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPersonalSpaceId('');
      return;
    }
    let active = true;
    resolveDefaultSpaceId({ uid: userUid, email: userEmail })
      .then((spaceId) => {
        if (active) setPersonalSpaceId(spaceId);
      })
      .catch((err) => {
        console.error('Could not resolve the default space:', err);
        if (active) {
          setToast({
            message:
              'No se pudo cargar tu espacio en la nube. Revisa tu conexión e intenta de nuevo.',
            type: 'error',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [syncEnabled, userUid, userEmail]);

  // 1. Load active space metadata on demand or auto-initialize if empty
  useEffect(() => {
    if (!syncEnabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSpaceInfo(null);
      return;
    }

    // Without a stored space, wait for the resolved default space.
    const activeSpaceId = currentSpaceId
      ? normalizeSpaceId(currentSpaceId)
      : personalSpaceId;
    if (!activeSpaceId) return;

    let active = true;
    getOrCreateSpace(
      activeSpaceId,
      `Presupuesto de ${user?.email?.split('@')[0] || 'Usuario'}`,
      user?.uid || '',
      user?.email || ''
    )
      .then((space) => {
        if (!active) return;
        // Selected only once the space doc exists: the data listeners need it
        // to pass the membership rules.
        if (currentSpaceId !== activeSpaceId) {
          setCurrentSpaceId(activeSpaceId);
          localStorage.setItem('p_current_space_id', activeSpaceId);
        }
        setSpaceInfo(space);
        setStartingSavings(space.startingSavings);
      })
      .catch((err) => {
        if (!active) return;
        console.error('Error loading active space:', err);
        if (!isPermissionDenied(err)) {
          const error = err as Error;
          setToast({
            message: `No se pudo cargar el espacio "${activeSpaceId}": ${error.message || err}`,
            type: 'error',
          });
        } else if (activeSpaceId !== personalSpaceId) {
          switchToPersonalSpace(
            `No tienes acceso al espacio "${activeSpaceId}". Se cambió a tu espacio personal.`
          );
        } else {
          setToast({
            message: `No tienes acceso al espacio "${activeSpaceId}".`,
            type: 'error',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [
    syncEnabled,
    currentSpaceId,
    personalSpaceId,
    user,
    setStartingSavings,
    switchToPersonalSpace,
  ]);

  // Offline Sync Queue Flush
  useEffect(() => {
    if (!syncEnabled || !currentSpaceId) return;

    const handleFlush = async () => {
      const { flushed, dropped } = await flushSyncQueue(currentSpaceId);
      if (dropped.length > 0) {
        // Rule refusals are not retryable: tell the user they were dropped.
        setToast({
          message: `No tienes permiso para guardar en este espacio: se descartaron ${dropped.length} registros pendientes que no se pudieron sincronizar.`,
          type: 'error',
        });
      } else if (flushed > 0) {
        setToast({
          message: `¡Sincronizados ${flushed} registros pendientes en la nube!`,
          type: 'success',
        });
      }
    };

    handleFlush();

    const handleOnline = () => {
      handleFlush();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncEnabled, currentSpaceId]);

  // Authoritative Cloud Merge: when connected to a Space, Firestore is the source of truth;
  // only preserve local items that are actively pending in the offline syncQueue.
  // Memoized on currentSpaceId (its only reactive input) so the sync effect can
  // list it as a dependency without changing when that effect re-subscribes.
  const mergeRecords = useCallback(
    <T extends { id: string }>(
      serverItems: T[],
      localItems: T[],
      subcol?: string
    ): T[] => {
      const cleanServer = (serverItems || []).filter(
        (s) => !DEMO_SEED_IDS.has(s.id)
      );
      if (!currentSpaceId || !subcol) {
        return cleanServer.length > 0 ? cleanServer : localItems;
      }
      const queue = getSyncQueue(currentSpaceId).filter(
        (q) => q.subcol === subcol
      );
      const pendingSaveIds = new Set(
        queue.filter((q) => q.action === 'save').map((q) => q.id)
      );
      const pendingDeleteIds = new Set(
        queue.filter((q) => q.action === 'delete').map((q) => q.id)
      );
      const serverFiltered = cleanServer.filter(
        (s) => !pendingDeleteIds.has(s.id)
      );
      const serverIds = new Set(serverFiltered.map((s) => s.id));
      const queuedLocalOnly = localItems.filter(
        (l) =>
          !DEMO_SEED_IDS.has(l.id) &&
          pendingSaveIds.has(l.id) &&
          !serverIds.has(l.id)
      );
      return [...serverFiltered, ...queuedLocalOnly];
    },
    [currentSpaceId]
  );

  // 2. Sync state data with Active Cloud Space in real-time
  useEffect(() => {
    if (!syncEnabled || !currentSpaceId) return;

    // Real-time Firestore Subscriptions
    const unsubTopics = syncSpaceSubcollection<Topic>(
      currentSpaceId,
      'topics',
      (items) => {
        setTopics((prev) => mergeRecords(items, prev, 'topics'));
      }
    );

    const unsubIncomes = syncSpaceSubcollection<Income>(
      currentSpaceId,
      'incomes',
      (items) => {
        setIncomes((prev) =>
          mergeRecords(items, prev, 'incomes').sort((a, b) =>
            b.date.localeCompare(a.date)
          )
        );
      }
    );

    const unsubExpenses = syncSpaceSubcollection<Expense>(
      currentSpaceId,
      'expenses',
      (items) => {
        setExpenses((prev) =>
          mergeRecords(items, prev, 'expenses').sort((a, b) =>
            b.date.localeCompare(a.date)
          )
        );
      }
    );

    const unsubGoals = syncSpaceSubcollection<SavingGoal>(
      currentSpaceId,
      'goals',
      (items) => {
        setGoals((prev) => mergeRecords(items, prev, 'goals'));
      }
    );

    const unsubContributions = syncSpaceSubcollection<SavingContribution>(
      currentSpaceId,
      'contributions',
      (items) => {
        setContributions((prev) =>
          mergeRecords(items, prev, 'contributions').sort((a, b) =>
            b.date.localeCompare(a.date)
          )
        );
      }
    );

    const unsubWithdrawals = syncSpaceSubcollection<Withdrawal>(
      currentSpaceId,
      'withdrawals',
      (items) => {
        setWithdrawals((prev) =>
          mergeRecords(items, prev, 'withdrawals').sort((a, b) =>
            b.date.localeCompare(a.date)
          )
        );
      }
    );

    const unsubPendingTransactions = syncSpaceSubcollection<PendingTransaction>(
      currentSpaceId,
      'pending_transactions',
      (items) => {
        setPendingLoadedSpace(currentSpaceId);
        setPendingTransactions(
          items
            .filter(
              (item) =>
                item.status === 'PENDING' ||
                (item.status as string) === 'TELEGRAM_DRAFT'
            )
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
      }
    );

    return () => {
      unsubTopics();
      unsubIncomes();
      unsubExpenses();
      unsubGoals();
      unsubContributions();
      unsubWithdrawals();
      unsubPendingTransactions();
    };
  }, [
    syncEnabled,
    currentSpaceId,
    user,
    mergeRecords,
    setTopics,
    setIncomes,
    setExpenses,
    setGoals,
    setContributions,
    setWithdrawals,
  ]);

  // 2a. Sync Space Metadata (Real-time updates to members array and properties)
  useEffect(() => {
    if (!syncEnabled || !currentSpaceId || !user) return;

    const cleanId = normalizeSpaceId(currentSpaceId);
    const spaceRef = doc(db, 'spaces', cleanId);
    const isPersonalSpace = cleanId === personalSpaceId;
    const revokedMessage =
      'Tu acceso a este espacio fue revocado por el anfitrión. Se cambió a tu espacio personal.';

    const unsubSpace = onSnapshot(
      spaceRef,
      (snap) => {
        if (snap.exists()) {
          const spaceData = snap.data() as Space;
          setSpaceInfo(spaceData);

          // Auto-switch to personal space if revoked
          if (
            !isPersonalSpace &&
            spaceData.ownerUid !== user.uid &&
            (!spaceData.members || !spaceData.members.includes(user.uid))
          ) {
            switchToPersonalSpace(revokedMessage);
          }
        }
      },
      (error) => {
        // Spaces are readable only by their members, so a revoked member's
        // listener fails with permission-denied instead of a snapshot.
        if (isPermissionDenied(error) && !isPersonalSpace) {
          switchToPersonalSpace(revokedMessage);
        } else {
          console.warn('Error syncing the active space:', error);
        }
      }
    );

    return () => unsubSpace();
  }, [
    syncEnabled,
    currentSpaceId,
    user,
    personalSpaceId,
    switchToPersonalSpace,
  ]);

  // 2b. Sync Host Pending Access Requests (Real-time Host Notification)
  useEffect(() => {
    if (!syncEnabled || !currentSpaceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingRequests([]);
      return;
    }

    const unsubPending = subscribeToPendingAccessRequests(
      currentSpaceId,
      (requests) => {
        setPendingRequests(requests);
      }
    );

    return () => unsubPending();
  }, [syncEnabled, currentSpaceId]);

  // 2c. Sync Requester Access Request Status (Real-time Auto-Refresh upon approval)
  useEffect(() => {
    if (!activePendingRequest) return;

    const unsubStatus = subscribeToAccessRequestStatus(
      activePendingRequest.spaceId,
      activePendingRequest.requestId,
      async (reqDoc) => {
        if (!reqDoc) return;

        if (reqDoc.status === 'approved') {
          const targetSpaceId = activePendingRequest.spaceId;
          const spaceName = reqDoc.spaceName || targetSpaceId;

          setActivePendingRequest(null);
          localStorage.removeItem('p_pending_access_req');

          // Automatically join target space and trigger full data load
          await handleJoinSpace(targetSpaceId, spaceName);

          setToast({
            message: `🎉 ¡Solicitud ACEPTADA! Tu aplicación se ha actualizado automáticamente al espacio "${spaceName}".`,
            type: 'success',
          });
        } else if (reqDoc.status === 'rejected') {
          const spaceName = reqDoc.spaceName;
          setActivePendingRequest(null);
          localStorage.removeItem('p_pending_access_req');

          setToast({
            message: `❌ Tu solicitud de acceso al espacio "${spaceName}" fue denegada por el anfitrión.`,
            type: 'error',
          });
        }
      }
    );

    return () => unsubStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePendingRequest]);

  // Auth/Space Interaction Handlers
  const handleLogin = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        if (res.accessToken) {
          setGToken(res.accessToken);
        }
        setSyncEnabled(true);
        setToast({ message: '¡Inicio de sesión exitoso!', type: 'success' });
        // Without a selected space, the space effects load the user's default
        // space (resolveDefaultSpaceId).
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      const errMsg = String(error?.message || error?.code || err);
      if (
        error?.code === 'auth/popup-closed-by-user' ||
        errMsg.includes('popup-closed-by-user') ||
        errMsg.includes('closed-by-user')
      ) {
        setToast({
          message:
            'Inicio de sesión cancelado (cerraste la ventana emergente de Google).',
          type: 'info',
        });
      } else if (
        error?.code === 'auth/cancelled-popup-request' ||
        errMsg.includes('cancelled-popup-request')
      ) {
        setToast({
          message: 'Se canceló la solicitud anterior de autenticación.',
          type: 'info',
        });
      } else if (
        error?.code === 'auth/unauthorized-domain' ||
        errMsg.includes('unauthorized-domain')
      ) {
        setToast({
          message:
            "Dominio no autorizado en Firebase. Agrega '" +
            window.location.hostname +
            "' en Firebase Console -> Authentication -> Settings -> Authorized domains.",
          type: 'error',
        });
      } else if (
        error?.code === 'auth/configuration-not-found' ||
        errMsg.includes('configuration-not-found') ||
        error?.code === 'auth/operation-not-allowed' ||
        errMsg.includes('operation-not-allowed')
      ) {
        setToast({
          message:
            'El servicio de autenticación o el proveedor de Google no está habilitado en la consola de tu proyecto Firebase. Por favor actívalo en Firebase Console -> Authentication -> Sign-in method.',
          type: 'error',
        });
      } else {
        setToast({
          message: `Error de autenticación: ${error.message || err}`,
          type: 'error',
        });
      }
    }
  };

  const handleEmailLogin = async (email: string, pass: string) => {
    try {
      const authUser = await emailSignIn(email, pass);
      setUser(authUser);
      setSyncEnabled(true);
      setToast({ message: '¡Inicio de sesión exitoso!', type: 'success' });
    } catch (err) {
      const error = err as Error & { code?: string };
      console.error(error);
      let friendlyMsg = error.message || err;
      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/user-not-found' ||
        String(error).includes('invalid-credential')
      ) {
        friendlyMsg =
          'Correo o contraseña incorrectos. Verifica tus credenciales.';
      } else if (error.code === 'auth/invalid-email') {
        friendlyMsg = 'La dirección de correo electrónico no es válida.';
      } else if (
        error.code === 'auth/configuration-not-found' ||
        error.code === 'auth/operation-not-allowed' ||
        String(error).includes('configuration-not-found')
      ) {
        friendlyMsg =
          'El proveedor de autenticación por correo no está habilitado en la consola de Firebase. Habilítalo en Firebase Console -> Authentication -> Sign-in method -> Correo electrónico.';
      }
      setToast({
        message: `Error al iniciar sesión: ${friendlyMsg}`,
        type: 'error',
      });
      throw err;
    }
  };

  const handleEmailRegister = async (email: string, pass: string) => {
    try {
      const authUser = await emailSignUp(email, pass);
      setUser(authUser);
      setSyncEnabled(true);
      setToast({
        message: '¡Registro e inicio de sesión exitoso!',
        type: 'success',
      });
    } catch (err) {
      const error = err as Error & { code?: string };
      console.error(error);
      let friendlyMsg = error.message || err;
      if (
        error.code === 'auth/email-already-in-use' ||
        String(error).includes('email-already-in-use')
      ) {
        friendlyMsg =
          'Este correo electrónico ya está registrado. Intenta iniciar sesión.';
      } else if (
        error.code === 'auth/weak-password' ||
        String(error).includes('weak-password')
      ) {
        friendlyMsg = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (error.code === 'auth/invalid-email') {
        friendlyMsg = 'La dirección de correo electrónico no es válida.';
      } else if (
        error.code === 'auth/configuration-not-found' ||
        error.code === 'auth/operation-not-allowed' ||
        String(error).includes('configuration-not-found')
      ) {
        friendlyMsg =
          'El servicio de autenticación no está habilitado en la consola de Firebase. Habilítalo en Firebase Console -> Authentication -> Sign-in method.';
      }
      setToast({
        message: `Error al registrarse: ${friendlyMsg}`,
        type: 'error',
      });
      throw err;
    }
  };

  const handleLogout = async () => {
    await firebaseLogout();
    setUser(null);
    setGToken(null);
    clearStoredToken();
    setSyncEnabled(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpaceInfo(null);
    setCurrentSpaceId('');
    localStorage.removeItem('p_current_space_id');
  };

  // Rejects on the first failed write so the caller never reports success.
  async function uploadCurrentDataToSpace(targetSpaceId: string) {
    const spaceId = normalizeSpaceId(targetSpaceId);
    if (startingSavings) {
      await updateSpaceSavings(spaceId, startingSavings);
    }
    for (const t of topics.filter((item) => !DEMO_SEED_IDS.has(item.id))) {
      await saveSpaceDocument(spaceId, 'topics', t.id, t);
    }
    for (const i of incomes.filter((item) => !DEMO_SEED_IDS.has(item.id))) {
      await saveSpaceDocument(spaceId, 'incomes', i.id, i);
    }
    for (const e of expenses.filter((item) => !DEMO_SEED_IDS.has(item.id))) {
      await saveSpaceDocument(spaceId, 'expenses', e.id, e);
    }
    for (const g of goals.filter((item) => !DEMO_SEED_IDS.has(item.id))) {
      await saveSpaceDocument(spaceId, 'goals', g.id, g);
    }
    for (const c of contributions.filter(
      (item) => !DEMO_SEED_IDS.has(item.id)
    )) {
      await saveSpaceDocument(spaceId, 'contributions', c.id, c);
    }
    for (const w of withdrawals.filter((item) => !DEMO_SEED_IDS.has(item.id))) {
      await saveSpaceDocument(spaceId, 'withdrawals', w.id, w);
    }
  }

  // Tells the user a background cloud write failed (S9). Rule refusals
  // (permission-denied) are never retried.
  const reportCloudWriteFailure = (err: unknown) => {
    console.error('Cloud write failed:', err);
    setToast({
      message: isPermissionDenied(err)
        ? 'No tienes permiso para guardar cambios en este espacio. El cambio no se sincronizó.'
        : 'No se pudo sincronizar un cambio con la nube. Revisa tu conexión.',
      type: 'error',
    });
  };

  async function handleJoinSpace(
    spaceId: string,
    spaceName = '',
    overrideUser?: User
  ) {
    const activeUser = overrideUser || user;
    if (!activeUser) {
      setToast({
        message:
          'Debes iniciar sesión con tu cuenta para unirte a un espacio compartido.',
        type: 'error',
      });
      return;
    }
    const cleanId = normalizeSpaceId(spaceId);
    if (!cleanId) return;

    try {
      const space = await getOrCreateSpace(
        cleanId,
        spaceName,
        activeUser.uid,
        activeUser.email || ''
      );
      setCurrentSpaceId(space.id);
      localStorage.setItem('p_current_space_id', space.id);
      setSpaceInfo(space);
      if (typeof space.startingSavings === 'number') {
        setStartingSavings(space.startingSavings);
      }

      // Save to recent spaces list
      try {
        const rawRecent = localStorage.getItem('p_recent_spaces');
        const list: { id: string; name: string }[] = rawRecent
          ? JSON.parse(rawRecent)
          : [];
        if (!list.some((s) => s.id === space.id)) {
          list.push({ id: space.id, name: space.name || space.id });
          localStorage.setItem('p_recent_spaces', JSON.stringify(list));
        }
      } catch (e) {
        console.warn('Could not save recent space:', e);
      }

      setToast({
        message: `¡Conectado exitosamente al espacio "${space.name || space.id}" (${space.id})! Sincronizando datos en tiempo real.`,
        type: 'success',
      });
    } catch (err) {
      const error = err as Error & { code?: string };
      setToast({
        message: isPermissionDenied(err)
          ? `No tienes acceso al espacio "${cleanId}". Solicita acceso al anfitrión con el código del espacio.`
          : `Error al unirse al espacio: ${error.message || err}`,
        type: 'error',
      });
    }
  }

  const handleRequestJoinSpace = async (codeOrId: string, spaceName = '') => {
    if (!user) {
      setToast({
        message:
          'Debes iniciar sesión con tu cuenta para solicitar acceso a un espacio.',
        type: 'error',
      });
      return;
    }

    if (!codeOrId.trim()) return;

    // The user's own default space needs no request (and may not exist yet).
    if (personalSpaceId && normalizeSpaceId(codeOrId) === personalSpaceId) {
      await handleJoinSpace(personalSpaceId, spaceName);
      return;
    }

    try {
      // The backend resolves the code and files the request (contract C1).
      const res = await requestAccessToSpace(codeOrId);

      if (res.status === 'member' || res.status === 'approved') {
        await handleJoinSpace(res.spaceId, spaceName || res.spaceName);
      } else if (res.status === 'pending') {
        const pendingObj = {
          spaceId: res.spaceId,
          requestId: res.requestId || `req_${user.uid}`,
          spaceName: res.spaceName,
        };
        setActivePendingRequest(pendingObj);
        localStorage.setItem(
          'p_pending_access_req',
          JSON.stringify(pendingObj)
        );

        setToast({
          message: `⏳ Solicitud enviada a "${res.spaceName}". Esperando aprobación del anfitrión...`,
          type: 'info',
        });
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      setToast({
        message: error.message || String(error),
        type: 'error',
      });
    }
  };

  const handleApproveRequest = async (req: AccessRequest) => {
    if (!currentSpaceId) return;
    try {
      await approveAccessRequest(currentSpaceId, req);
      setToast({
        message: `¡Acceso concedido a ${req.requesterName || req.requesterEmail}! Se le ha otorgado acceso al espacio.`,
        type: 'success',
      });
    } catch (err) {
      const error = err as Error & { code?: string };
      setToast({
        message: `Error al aprobar solicitud: ${error.message || err}`,
        type: 'error',
      });
    }
  };

  const handleRejectRequest = async (reqId: string) => {
    if (!currentSpaceId) return;
    try {
      await rejectAccessRequest(currentSpaceId, reqId);
      setToast({
        message: 'Solicitud de acceso denegada.',
        type: 'info',
      });
    } catch (err) {
      const error = err as Error & { code?: string };
      setToast({
        message: `Error al denegar solicitud: ${error.message || err}`,
        type: 'error',
      });
    }
  };

  const handleRevokeMember = async (memberUid: string, emailOrName: string) => {
    if (!currentSpaceId) return;
    try {
      await removeSpaceMember(currentSpaceId, memberUid);
      setToast({
        message: `Se ha revocado el acceso a ${emailOrName}.`,
        type: 'success',
      });
    } catch (err) {
      const error = err as Error & { code?: string };
      setToast({
        message: `Error al revocar acceso: ${error.message || err}`,
        type: 'error',
      });
    }
  };

  const handleCancelMyRequest = async () => {
    if (activePendingRequest) {
      try {
        await cancelAccessRequest(
          activePendingRequest.spaceId,
          activePendingRequest.requestId
        );
      } catch (e) {
        console.warn('Cancel request error:', e);
      }
    }
    setActivePendingRequest(null);
    localStorage.removeItem('p_pending_access_req');
    setToast({
      message: 'Solicitud cancelada.',
      type: 'info',
    });
  };

  const handleRegenerateCode = async () => {
    if (!currentSpaceId) return;
    try {
      const newCode = await regenerateSpaceCode(currentSpaceId);
      if (spaceInfo) {
        setSpaceInfo({ ...spaceInfo, code: newCode });
      }
      setToast({
        message: `¡Nuevo código único generado: ${newCode}! Comparte este código seguro.`,
        type: 'success',
      });
    } catch (err) {
      const error = err as Error & { code?: string };
      setToast({
        message: `Error al generar código: ${error.message || err}`,
        type: 'error',
      });
    }
  };

  const handleUploadLocalData = async () => {
    if (!currentSpaceId) return;
    const confirmed = window.confirm(
      '¿Deseas subir todos tus tópicos, ingresos, gastos y metas locales actuales a este espacio en la nube?'
    );
    if (!confirmed) return;

    try {
      await uploadCurrentDataToSpace(currentSpaceId);
      setToast({
        message:
          '¡Todos los datos locales han sido subidos con éxito a la nube!',
        type: 'success',
      });
    } catch (err) {
      const error = err as Error & { code?: string };
      setToast({
        message: `Error al subir datos: ${error.message || err}`,
        type: 'error',
      });
    }
  };

  // --- End of Firebase Sync Logic ---

  // Helper to save/update a single record (handles both Firebase Sync and local storage)
  const saveRecord = async <T extends { id: string; date?: string }>(
    subcol: string,
    id: string,
    item: T,
    localSetter: React.Dispatch<React.SetStateAction<T[]>>,
    autoSwitchMonth = false
  ) => {
    try {
      // 1. Optimistically update local state first for instant UI response
      localSetter((prev) => {
        const idx = prev.findIndex((x) => x.id === id);
        if (idx > -1) {
          const next = [...prev];
          next[idx] = item;
          return next;
        }
        return [item, ...prev];
      });

      // 2. Only switch activeMonth if explicitly requested (prevents unexpected filter changes)
      if (
        autoSwitchMonth &&
        item.date &&
        typeof item.date === 'string' &&
        item.date.length >= 7
      ) {
        const itemMonth = item.date.slice(0, 7);
        if (activeMonth !== 'all' && activeMonth !== itemMonth) {
          setActiveMonth(itemMonth);
          setToast({
            message: `Guardado correctamente. Se cambió el filtro al mes ${itemMonth}.`,
            type: 'info',
          });
        } else {
          setToast({
            message: 'Registro guardado correctamente.',
            type: 'success',
          });
        }
      } else {
        setToast({
          message: 'Registro guardado correctamente.',
          type: 'success',
        });
      }

      // 3. Save to cloud if sync enabled, or queue for sync if space ID is present
      const activeSpaceId = currentSpaceId || personalSpaceId;
      if (syncEnabled && activeSpaceId) {
        await saveSpaceDocument(activeSpaceId, subcol, id, item);
      } else if (activeSpaceId) {
        addToSyncQueue(activeSpaceId, {
          id,
          subcol,
          action: 'save',
          data: item,
        });
      }
    } catch (err) {
      const error = err as Error & { code?: string };
      console.error(`Error al guardar en ${subcol}:`, err);
      const activeSpaceId = currentSpaceId || personalSpaceId;
      if (isPermissionDenied(err)) {
        // A rules refusal never succeeds later: do not queue it (S9).
        setToast({
          message:
            'No tienes permiso para guardar en este espacio. El registro no se sincronizó con la nube.',
          type: 'error',
        });
      } else if (activeSpaceId) {
        addToSyncQueue(activeSpaceId, {
          id,
          subcol,
          action: 'save',
          data: item,
        });
        setToast({
          message: `Guardado localmente. Se sincronizará en la nube automáticamente.`,
          type: 'info',
        });
      } else {
        setToast({
          message: `No se pudo guardar el elemento en ${subcol}: ${error.message || err}`,
          type: 'error',
        });
      }
    }
  };

  const deleteRecord = async <T extends { id: string }>(
    subcol: string,
    id: string,
    localSetter: React.Dispatch<React.SetStateAction<T[]>>
  ) => {
    try {
      // Optimistically update local state first for instant UI response
      localSetter((prev) => prev.filter((x) => x.id !== id));

      if (syncEnabled && currentSpaceId) {
        await deleteSpaceDocument(currentSpaceId, subcol, id);
      }

      setToast({
        message: 'Elemento eliminado correctamente.',
        type: 'success',
      });
    } catch (err) {
      const error = err as Error & { code?: string };
      console.error(`Error al eliminar de ${subcol}:`, err);
      if (isPermissionDenied(err)) {
        setToast({
          message:
            'No tienes permiso para eliminar en este espacio. El cambio no se sincronizó con la nube.',
          type: 'error',
        });
      } else if (syncEnabled && currentSpaceId) {
        addToSyncQueue(currentSpaceId, { id, subcol, action: 'delete' });
        setToast({
          message: `Eliminado localmente. Se sincronizará cuando haya conexión.`,
          type: 'info',
        });
      } else {
        setToast({
          message: `No se pudo eliminar el elemento de ${subcol}: ${error.message || err}`,
          type: 'error',
        });
      }
    }
  };

  // Cumulative arrays (everything up to and including the activeMonth)
  const cumulativeIncomes =
    activeMonth === 'all'
      ? incomes
      : incomes.filter((i) => i.date.substring(0, 7) <= activeMonth);
  const cumulativeExpenses =
    activeMonth === 'all'
      ? expenses
      : expenses.filter((e) => e.date.substring(0, 7) <= activeMonth);
  const cumulativeContributions =
    activeMonth === 'all'
      ? contributions
      : contributions.filter((c) => c.date.substring(0, 7) <= activeMonth);
  const cumulativeWithdrawals =
    activeMonth === 'all'
      ? withdrawals
      : withdrawals.filter((w) => w.date.substring(0, 7) <= activeMonth);

  // Helper for formatting
  const calculateDerivedState = () => {
    return calculateFinancials(
      cumulativeIncomes,
      cumulativeExpenses,
      cumulativeContributions,
      cumulativeWithdrawals,
      startingSavings
    );
  };

  const {
    cashPool,
    currentIncomesPool,
    capitalDisponible,
    totalContributions,
  } = calculateDerivedState();

  // What is left over from earlier months: everything earned minus everything spent up to the
  // end of the previous month, so it counts as available in the month being viewed.
  const carryOver = (() => {
    if (activeMonth === 'all') return 0;
    const upToPrevious = (date: string) =>
      date.substring(0, 7) <= decrementMonth(activeMonth);
    const previous = calculateFinancials(
      incomes.filter((i) => upToPrevious(i.date)),
      expenses.filter((e) => upToPrevious(e.date)),
      contributions.filter((c) => upToPrevious(c.date)),
      withdrawals.filter((w) => upToPrevious(w.date)),
      startingSavings
    );
    return Math.max(0, previous.currentIncomesPool + previous.cashPool);
  })();

  // Monthly flow arrays (only transactions inside the current activeMonth)
  const filteredIncomes =
    activeMonth === 'all'
      ? incomes
      : incomes.filter((i) => i.date.startsWith(activeMonth));
  const filteredExpenses =
    activeMonth === 'all'
      ? expenses
      : expenses.filter((e) => e.date.startsWith(activeMonth));
  const filteredContributions =
    activeMonth === 'all'
      ? contributions
      : contributions.filter((c) => c.date.startsWith(activeMonth));
  const filteredWithdrawals =
    activeMonth === 'all'
      ? withdrawals
      : withdrawals.filter((w) => w.date.startsWith(activeMonth));

  const monthlyIncomeFlow = filteredIncomes
    .filter((i) => i.confirmed)
    .reduce((sum, i) => sum + i.amount, 0);
  const monthlyExpenseFlow = filteredExpenses
    .filter(
      (e) =>
        e.confirmed &&
        e.topicId !== 'topic_ahorros' &&
        !String(e.id || '').startsWith('exp_from_contrib_') &&
        e.topicId !== 'topic_1787580821277'
    )
    .reduce((sum, e) => sum + e.amount, 0);
  const monthlyAhorroFlow = (() => {
    const contribSum = filteredContributions.reduce(
      (sum, c) => sum + c.amount,
      0
    );
    if (contribSum > 0) return contribSum;
    // Fallback if savings were stored as topic_ahorros expenses before contributions sync
    return filteredExpenses
      .filter(
        (e) =>
          e.confirmed &&
          (e.topicId === 'topic_ahorros' ||
            String(e.id || '').startsWith('exp_from_contrib_'))
      )
      .reduce((sum, e) => sum + e.amount, 0);
  })();

  const totals = {
    ingreso: monthlyIncomeFlow,
    gasto: monthlyExpenseFlow,
    ahorro: monthlyAhorroFlow,
  };

  const recentTransactions = [
    ...incomes.map((i) => ({
      ...i,
      flow: 'ingreso' as const,
      dateStr: i.date,
    })),
    ...expenses.map((e) => ({ ...e, flow: 'gasto' as const, dateStr: e.date })),
  ]
    .sort(
      (a, b) => new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime()
    )
    .slice(0, 6);

  // Global currency formatter that honors privacy scale and masking configurations
  const formatCurrency = (amount: number): string => {
    if (privacyMode === 'masked') {
      return '$ ••••••';
    }
    const scaledAmount = Math.round(amount * privacyScale);
    return `$${scaledAmount.toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Handlers for Topics Configuration
  const handleAddTopic = (
    name: string,
    type: 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'BOTH',
    icon: string,
    color: string,
    monthlyLimit?: number
  ) => {
    const exists = topics.some(
      (t) => t.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) {
      alert('Ya existe un tópico con ese nombre.');
      return;
    }
    const newTopic: Topic = {
      id: `topic_${Date.now()}`,
      name,
      type,
      icon,
      color,
      ...(monthlyLimit ? { monthlyLimit } : {}),
    };
    saveRecord('topics', newTopic.id, newTopic, setTopics);
  };

  const handleEditTopic = (
    id: string,
    name: string,
    type: 'INCOME' | 'EXPENSE' | 'SAVINGS' | 'BOTH',
    icon: string,
    color: string,
    monthlyLimit?: number
  ) => {
    const old = topics.find((t) => t.id === id);
    if (!old) return;
    const updated = { ...old, name, type, icon, color };
    if (monthlyLimit) updated.monthlyLimit = monthlyLimit;
    else delete updated.monthlyLimit;

    saveRecord('topics', id, updated, setTopics);
  };

  const handleDeleteTopic = (id: string) => {
    const inIncomes = incomes.some((i) => i.topicId === id);
    const inExpenses = expenses.some((e) => e.topicId === id);
    const inGoals = goals.some((g) => g.topicId === id);

    if (inIncomes || inExpenses || inGoals) {
      if (
        !window.confirm(
          'Este tópico está asociado a transacciones o metas activas. ¿Estás seguro de que deseas eliminarlo?'
        )
      ) {
        return;
      }
    }
    deleteRecord('topics', id, setTopics);
  };

  // Handlers for Incomes
  const handleAddIncome = (
    description: string,
    amount: number,
    topicId: string,
    date: string,
    confirmed: boolean,
    method: 'DIGITAL' | 'EFECTIVO',
    verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL',
    reconciliationStatus?: 'PENDING' | 'VERIFIED'
  ) => {
    const newInc: Income = {
      id: `inc_${Date.now()}`,
      description,
      amount,
      topicId,
      date,
      confirmed,
      method,
      ...(verificationSource ? { verificationSource } : {}),
      ...(reconciliationStatus ? { reconciliationStatus } : {}),
    };
    saveRecord('incomes', newInc.id, newInc, setIncomes);
  };

  const handleEditIncome = (
    id: string,
    description: string,
    amount: number,
    topicId: string,
    date: string,
    confirmed: boolean,
    method: 'DIGITAL' | 'EFECTIVO',
    verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL',
    reconciliationStatus?: 'PENDING' | 'VERIFIED'
  ) => {
    const updated: Income = {
      id,
      description,
      amount,
      topicId,
      date,
      confirmed,
      method,
      ...(verificationSource ? { verificationSource } : {}),
      ...(reconciliationStatus ? { reconciliationStatus } : {}),
    };
    saveRecord<Income>('incomes', id, updated, setIncomes);
  };

  const handleToggleConfirmIncome = (id: string) => {
    const inc = incomes.find((i) => i.id === id);
    if (!inc) return;
    saveRecord(
      'incomes',
      id,
      { ...inc, confirmed: !inc.confirmed },
      setIncomes
    );
  };

  const handleDeleteIncome = (id: string) => {
    deleteRecord('incomes', id, setIncomes);
  };

  // Handlers for Expenses
  const handleAddExpense = (
    description: string,
    amount: number,
    topicId: string,
    date: string,
    source: 'INGRESOS' | 'AHORROS',
    confirmed: boolean,
    paymentMethod: 'DEBITO' | 'CREDITO' | 'EFECTIVO',
    verificationSource?: 'SMS_PUSH' | 'GMAIL' | 'MANUAL',
    reconciliationStatus?: 'PENDING' | 'VERIFIED'
  ) => {
    const newExp: Expense = {
      id: `exp_${Date.now()}`,
      description,
      amount,
      topicId,
      date,
      source,
      confirmed,
      paymentMethod,
      verificationSource,
      reconciliationStatus,
    };
    saveRecord('expenses', newExp.id, newExp, setExpenses);

    // Reconcile unpaid credit card expenses if this is a confirmed Credit Card payment ("Tarjetas/creditos")
    if (confirmed && topicId === 'topic_1787580821277') {
      const unpaid = expenses
        .filter(
          (e) =>
            e.id !== newExp.id &&
            e.confirmed &&
            e.paymentMethod === 'CREDITO' &&
            e.topicId !== 'topic_1787580821277' &&
            !(e as Expense & { creditPaid?: boolean }).creditPaid
        )
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      let remainingPayment = amount;
      let settledCount = 0;
      for (const item of unpaid) {
        if (item.amount <= remainingPayment || settledCount === 0) {
          const settledItem = {
            ...item,
            creditPaid: true,
            paidByTxId: newExp.id,
            paidAt: date,
          } as Expense;
          saveRecord('expenses', item.id, settledItem, setExpenses);
          remainingPayment = Math.max(0, remainingPayment - item.amount);
          settledCount++;
          if (remainingPayment <= 0) break;
        }
      }
    }
  };

  const handleEditExpense = (
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
  ) => {
    saveRecord<Expense>(
      'expenses',
      id,
      {
        id,
        description,
        amount,
        topicId,
        date,
        source,
        confirmed,
        paymentMethod,
        verificationSource,
        reconciliationStatus,
      },
      setExpenses
    );
  };

  const handleToggleConfirmExpense = (id: string) => {
    const exp = expenses.find((e) => e.id === id);
    if (!exp) return;
    saveRecord(
      'expenses',
      id,
      { ...exp, confirmed: !exp.confirmed },
      setExpenses
    );
  };

  const handleDeleteExpense = (id: string) => {
    deleteRecord('expenses', id, setExpenses);
  };

  const syncTelegramDraftAction = (
    tx: PendingTransaction,
    action: 'APPROVED' | 'DISCARDED'
  ) => {
    const draftTx: PendingTransactionDraft = tx;
    if (draftTx.tgChatId && draftTx.tgMessageId) {
      void syncTelegramDraftCard({
        spaceId: currentSpaceId,
        draftId: tx.id,
        chatId: draftTx.tgChatId,
        messageId: draftTx.tgMessageId,
        action,
        description: tx.description,
        amount: tx.amount,
        category: tx.category,
      });
    }
  };

  // Handlers for Pending Transactions (Webhooks/SMS/Telegram)
  const handleApprovePendingTransaction = (tx: PendingTransaction) => {
    const draftTx: PendingTransactionDraft = tx;
    const matchedTopic =
      (draftTx.topicId && topics.find((t) => t.id === draftTx.topicId)) ||
      topics.find((t) => t.name.toLowerCase() === tx.category.toLowerCase()) ||
      topics[0];
    const topicId = matchedTopic ? matchedTopic.id : 'default';
    const normalizedDate = normalizeDateToISO(tx.date);
    const resolvedExpenseMethod: 'DEBITO' | 'CREDITO' | 'EFECTIVO' =
      draftTx.paymentMethod === 'DEBITO' ||
      draftTx.paymentMethod === 'CREDITO' ||
      draftTx.paymentMethod === 'EFECTIVO'
        ? draftTx.paymentMethod
        : 'DEBITO';
    const resolvedIncomeMethod: 'EFECTIVO' | 'DIGITAL' =
      draftTx.paymentMethod === 'EFECTIVO' ? 'EFECTIVO' : 'DIGITAL';

    if (tx.type === 'INCOME') {
      handleAddIncome(
        tx.description,
        tx.amount,
        topicId,
        normalizedDate,
        true,
        resolvedIncomeMethod,
        'SMS_PUSH',
        'VERIFIED'
      );
    } else {
      handleAddExpense(
        tx.description,
        tx.amount,
        topicId,
        normalizedDate,
        'INGRESOS',
        true,
        resolvedExpenseMethod,
        'SMS_PUSH',
        'VERIFIED'
      );
    }

    if (syncEnabled && currentSpaceId) {
      if (
        tx.id.startsWith('tg_') ||
        (tx.status as string) === 'TELEGRAM_DRAFT'
      ) {
        deleteSpaceDocument(
          currentSpaceId,
          'pending_transactions',
          tx.id
        ).catch(reportCloudWriteFailure);
        syncTelegramDraftAction(tx, 'APPROVED');
      } else {
        saveSpaceDocument(currentSpaceId, 'pending_transactions', tx.id, {
          ...tx,
          status: 'APPROVED',
        }).catch(reportCloudWriteFailure);
      }
    }

    const itemMonth = normalizedDate.slice(0, 7);
    if (activeMonth !== 'all' && activeMonth !== itemMonth) {
      setActiveMonth(itemMonth);
      setToast({
        message: `Transacción aprobada ⚡. Se cambió el filtro de vista al mes ${itemMonth}.`,
        type: 'success',
      });
    } else {
      setToast({
        message: 'Transacción aprobada e ingresada correctamente ⚡',
        type: 'success',
      });
    }
  };

  const handleApproveAllPendingTransactions = (txs: PendingTransaction[]) => {
    let lastMonth = '';
    txs.forEach((tx) => {
      const draftTx: PendingTransactionDraft = tx;
      const matchedTopic =
        (draftTx.topicId && topics.find((t) => t.id === draftTx.topicId)) ||
        topics.find(
          (t) => t.name.toLowerCase() === tx.category.toLowerCase()
        ) ||
        topics[0];
      const topicId = matchedTopic ? matchedTopic.id : 'default';
      const normalizedDate = normalizeDateToISO(tx.date);
      lastMonth = normalizedDate.slice(0, 7);
      const resolvedExpenseMethod: 'DEBITO' | 'CREDITO' | 'EFECTIVO' =
        draftTx.paymentMethod === 'DEBITO' ||
        draftTx.paymentMethod === 'CREDITO' ||
        draftTx.paymentMethod === 'EFECTIVO'
          ? draftTx.paymentMethod
          : 'DEBITO';
      const resolvedIncomeMethod: 'EFECTIVO' | 'DIGITAL' =
        draftTx.paymentMethod === 'EFECTIVO' ? 'EFECTIVO' : 'DIGITAL';

      if (tx.type === 'INCOME') {
        handleAddIncome(
          tx.description,
          tx.amount,
          topicId,
          normalizedDate,
          true,
          resolvedIncomeMethod,
          'SMS_PUSH',
          'VERIFIED'
        );
      } else {
        handleAddExpense(
          tx.description,
          tx.amount,
          topicId,
          normalizedDate,
          'INGRESOS',
          true,
          resolvedExpenseMethod,
          'SMS_PUSH',
          'VERIFIED'
        );
      }

      if (syncEnabled && currentSpaceId) {
        if (
          tx.id.startsWith('tg_') ||
          (tx.status as string) === 'TELEGRAM_DRAFT'
        ) {
          deleteSpaceDocument(
            currentSpaceId,
            'pending_transactions',
            tx.id
          ).catch(reportCloudWriteFailure);
          syncTelegramDraftAction(tx, 'APPROVED');
        } else {
          saveSpaceDocument(currentSpaceId, 'pending_transactions', tx.id, {
            ...tx,
            status: 'APPROVED',
          }).catch(reportCloudWriteFailure);
        }
      }
    });

    if (lastMonth && activeMonth !== 'all' && activeMonth !== lastMonth) {
      setActiveMonth(lastMonth);
      setToast({
        message: `Transacciones aprobadas ⚡. Se cambió el filtro de vista al mes ${lastMonth}.`,
        type: 'success',
      });
    } else {
      setToast({
        message: 'Transacciones aprobadas e ingresadas correctamente ⚡',
        type: 'success',
      });
    }
  };

  const handleSaveEditedPendingTransaction = (
    pendingTx: PendingTransaction,
    editedData: {
      description: string;
      amount: number;
      topicId: string;
      date: string;
      type: 'EXPENSE' | 'INCOME';
      method: string;
    }
  ) => {
    if (editedData.type === 'INCOME') {
      handleAddIncome(
        editedData.description,
        editedData.amount,
        editedData.topicId,
        editedData.date,
        true,
        editedData.method as NonNullable<Income['method']>,
        'SMS_PUSH',
        'VERIFIED'
      );
    } else {
      handleAddExpense(
        editedData.description,
        editedData.amount,
        editedData.topicId,
        editedData.date,
        'INGRESOS',
        true,
        editedData.method as NonNullable<Expense['paymentMethod']>,
        'SMS_PUSH',
        'VERIFIED'
      );
    }

    if (syncEnabled && currentSpaceId) {
      if (
        pendingTx.id.startsWith('tg_') ||
        (pendingTx.status as string) === 'TELEGRAM_DRAFT'
      ) {
        deleteSpaceDocument(
          currentSpaceId,
          'pending_transactions',
          pendingTx.id
        ).catch(reportCloudWriteFailure);
        syncTelegramDraftAction(pendingTx, 'APPROVED');
      } else {
        saveSpaceDocument(
          currentSpaceId,
          'pending_transactions',
          pendingTx.id,
          {
            ...pendingTx,
            status: 'APPROVED',
          }
        ).catch(reportCloudWriteFailure);
      }
    }

    const itemMonth = editedData.date.slice(0, 7);
    if (activeMonth !== 'all' && activeMonth !== itemMonth) {
      setActiveMonth(itemMonth);
      setToast({
        message: `Transacción editada y guardada correctamente ⚡. Se cambió el filtro al mes ${itemMonth}.`,
        type: 'success',
      });
    } else {
      setToast({
        message: 'Transacción editada y guardada correctamente ⚡',
        type: 'success',
      });
    }
    setEditingPendingTx(null);
  };

  const handleDiscardPendingTransaction = (id: string) => {
    const tx = pendingTransactions.find((t) => t.id === id);
    if (!tx) return;
    if (syncEnabled && currentSpaceId) {
      if (
        tx.id.startsWith('tg_') ||
        (tx.status as string) === 'TELEGRAM_DRAFT'
      ) {
        deleteSpaceDocument(
          currentSpaceId,
          'pending_transactions',
          tx.id
        ).catch(reportCloudWriteFailure);
        syncTelegramDraftAction(tx, 'DISCARDED');
      } else {
        saveSpaceDocument(currentSpaceId, 'pending_transactions', tx.id, {
          ...tx,
          status: 'DISCARDED',
        }).catch(reportCloudWriteFailure);
      }
    }
  };

  // Handlers for Savings
  const handleAddGoal = (
    name: string,
    targetAmount: number,
    deadline: string,
    topicId: string
  ) => {
    const newGoal: SavingGoal = {
      id: `goal_${Date.now()}`,
      name,
      targetAmount,
      currentAmount: 0,
      deadline,
      topicId,
    };
    saveRecord('goals', newGoal.id, newGoal, setGoals);
  };

  const handleEditGoal = (
    id: string,
    name: string,
    targetAmount: number,
    deadline: string,
    topicId: string
  ) => {
    const old = goals.find((g) => g.id === id);
    if (!old) return;
    saveRecord(
      'goals',
      id,
      { ...old, name, targetAmount, deadline, topicId },
      setGoals
    );
  };

  const handleDeleteGoal = (id: string) => {
    if (
      window.confirm(
        '¿Seguro que deseas eliminar esta meta de ahorro? Los depósitos de esta meta se desvincularán.'
      )
    ) {
      deleteRecord('goals', id, setGoals);
      // Filter out contributions associated with this goal
      contributions
        .filter((c) => c.goalId === id)
        .forEach((c) => deleteRecord('contributions', c.id, setContributions));
    }
  };

  const handleAddContribution = (
    goalId: string,
    amount: number,
    description: string,
    date: string,
    deductFromIncomes: boolean
  ) => {
    const contribId = `cnt_${Date.now()}`;
    const newContrib: SavingContribution = {
      id: contribId,
      goalId,
      amount,
      date,
      description,
    };

    // 1. Update Goal saved balance
    const targetGoal = goals.find((g) => g.id === goalId);
    if (targetGoal) {
      saveRecord(
        'goals',
        goalId,
        { ...targetGoal, currentAmount: targetGoal.currentAmount + amount },
        setGoals
      );
    }

    // 2. If deducted from monthly incomes, register a matching confirmed expense with topic 'topic_ahorros'
    if (deductFromIncomes) {
      const savingsTopic =
        topics.find((t) => t.type === 'SAVINGS') || topics[topics.length - 1];
      const newExp: Expense = {
        id: `exp_from_contrib_${contribId}`,
        description: `Ahorro para: ${goals.find((g) => g.id === goalId)?.name || 'Meta'}`,
        amount,
        topicId: savingsTopic.id,
        date,
        source: 'INGRESOS',
        confirmed: true,
        paymentMethod: 'DEBITO',
      };
      saveRecord('expenses', newExp.id, newExp, setExpenses);
    }

    saveRecord('contributions', newContrib.id, newContrib, setContributions);
  };

  const handleEditContribution = (
    id: string,
    goalId: string,
    amount: number,
    description: string,
    date: string
  ) => {
    const oldContrib = contributions.find((c) => c.id === id);
    if (!oldContrib) return;

    const diff = amount - oldContrib.amount;

    // Adjust Goal currentAmount dynamically
    setGoals((currentGoals) => {
      const nextGoals = currentGoals.map((g) => {
        if (g.id === goalId) {
          const updated = { ...g, currentAmount: g.currentAmount + diff };
          if (syncEnabled && currentSpaceId) {
            saveSpaceDocument(currentSpaceId, 'goals', g.id, updated).catch(
              reportCloudWriteFailure
            );
          }
          return updated;
        }
        if (g.id === oldContrib.goalId && oldContrib.goalId !== goalId) {
          const updated = {
            ...g,
            currentAmount: Math.max(0, g.currentAmount - oldContrib.amount),
          };
          if (syncEnabled && currentSpaceId) {
            saveSpaceDocument(currentSpaceId, 'goals', g.id, updated).catch(
              reportCloudWriteFailure
            );
          }
          return updated;
        }
        return g;
      });
      return nextGoals;
    });

    // Update corresponding registered expense if there is one
    expenses
      .filter((e) => e.id === `exp_from_contrib_${id}`)
      .forEach((e) => {
        saveRecord(
          'expenses',
          e.id,
          {
            ...e,
            amount,
            description: `Ahorro para: ${goals.find((g) => g.id === goalId)?.name || 'Meta'}`,
            date,
          },
          setExpenses
        );
      });

    saveRecord(
      'contributions',
      id,
      { id, goalId, amount, description, date },
      setContributions
    );
  };

  const handleDeleteContribution = (id: string) => {
    const contrib = contributions.find((c) => c.id === id);
    if (!contrib) return;

    // 1. Reduce goal saved balance
    const targetGoal = goals.find((g) => g.id === contrib.goalId);
    if (targetGoal) {
      saveRecord(
        'goals',
        targetGoal.id,
        {
          ...targetGoal,
          currentAmount: Math.max(0, targetGoal.currentAmount - contrib.amount),
        },
        setGoals
      );
    }

    // 2. Remove matching registered expense if there is one
    expenses
      .filter((e) => e.id === `exp_from_contrib_${id}`)
      .forEach((e) => deleteRecord('expenses', e.id, setExpenses));

    deleteRecord('contributions', id, setContributions);
  };

  // ATM Withdrawals Handlers
  const handleAddWithdrawal = (
    description: string,
    amount: number,
    date: string
  ) => {
    const newW: Withdrawal = {
      id: `wth_${Date.now()}`,
      description,
      amount,
      date,
    };
    saveRecord('withdrawals', newW.id, newW, setWithdrawals);
  };

  const handleEditWithdrawal = (
    id: string,
    description: string,
    amount: number,
    date: string
  ) => {
    saveRecord(
      'withdrawals',
      id,
      { id, description, amount, date },
      setWithdrawals
    );
  };

  const handleDeleteWithdrawal = (id: string) => {
    deleteRecord('withdrawals', id, setWithdrawals);
  };

  // Auto-sync Gmail bank alerts when connected to a Cloud Space, plus the manual
  // "refresh all data" handler. Extracted into useGmailSync; called here so the
  // auto-sync effect registers last, preserving the original effect ordering.
  const { handleRefreshAllData } = useGmailSync({
    gToken,
    setGToken,
    syncEnabled,
    currentSpaceId,
    setToast,
  });
  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background text-foreground font-sans selection:bg-primary/20 selection:text-primary pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      {/* Error / warning notifications (e.g. refused or failed cloud writes) */}
      {toast && (toast.type === 'error' || toast.type === 'warning') && (
        <div
          role="alert"
          className={`fixed left-1/2 ${
            activeTab === 'assistant'
              ? 'top-20 md:top-6'
              : 'bottom-24 md:bottom-6'
          } z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-md ${
            toast.type === 'error'
              ? 'border-rose-500/40 bg-rose-950/90 text-rose-100'
              : 'border-amber-500/40 bg-amber-950/90 text-amber-100'
          }`}
        >
          {toast.message}
        </div>
      )}
      {/* Sticky Host Notification Banner for Access Requests */}
      {pendingRequests.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500/20 via-cyan-500/20 to-amber-500/20 border-b border-amber-500/40 px-4 py-3 shadow-2xl backdrop-blur-md">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-300 rounded-lg animate-pulse shrink-0">
                <BellRing className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs font-extrabold text-amber-300 uppercase tracking-wider block font-mono">
                  🔔 Solicitud de acceso a tu Espacio ({pendingRequests.length})
                </span>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-cyan-300">
                    {pendingRequests[0].requesterName ||
                      pendingRequests[0].requesterEmail}
                  </strong>{' '}
                  ({pendingRequests[0].requesterEmail}) solicita unirse a tu
                  espacio.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                onClick={() => handleApproveRequest(pendingRequests[0])}
                className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                <Check className="h-4 w-4" />
                Aceptar
              </button>
              <button
                onClick={() => handleRejectRequest(pendingRequests[0].id)}
                className="flex-1 sm:flex-initial px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <X className="h-4 w-4" />
                Denegar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <img
            src="/brand/raiz-logo.jpeg"
            alt="RAÍZ Finanzas"
            className="h-11 w-11 rounded-xl object-cover border border-primary/20 shadow-sm shrink-0"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Raíz
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Finanzas con base firme
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {(
            [
              {
                title: 'Mi dinero',
                items: [
                  {
                    id: 'dashboard',
                    label: 'Dashboard',
                    hint: 'Tu panorama',
                    icon: LayoutDashboard,
                  },
                  {
                    id: 'assistant',
                    label: 'Asistente',
                    hint: 'Háblale o mándale una foto',
                    icon: Sprout,
                  },
                  {
                    id: 'incomes',
                    label: 'Ingresos y Cajero',
                    hint: 'Entradas y efectivo',
                    icon: TrendingUp,
                  },
                  {
                    id: 'expenses',
                    label: 'Gastos',
                    hint: 'Egresos y compras',
                    icon: TrendingDown,
                  },
                  {
                    id: 'savings',
                    label: 'Metas de Ahorro',
                    hint: 'Ahorro con rumbo',
                    icon: Target,
                  },
                ],
              },
              {
                title: 'Ajustes',
                items: [
                  {
                    id: 'topics',
                    label: 'Categorías',
                    hint: 'Estructura',
                    icon: Shapes,
                  },
                  {
                    id: 'sync_settings',
                    label: 'Nube y Compartir',
                    hint: 'Espacio compartido',
                    icon: CloudLightning,
                  },
                ],
              },
            ] as const
          ).map((section, sectionIndex) => (
            <div key={section.title} className="flex flex-col gap-1">
              <p
                className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${
                  sectionIndex === 0 ? '' : 'pt-4'
                }`}
              >
                {section.title}
              </p>
              {section.items.map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    aria-current={isSelected ? 'page' : undefined}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                      isSelected
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${isSelected ? 'text-primary' : ''}`}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm">{tab.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {tab.hint}
                      </span>
                    </div>
                    {tab.id === 'assistant' &&
                      pendingTransactions.length > 0 && (
                        <span
                          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground"
                          aria-label={`${pendingTransactions.length} por confirmar`}
                        >
                          {pendingTransactions.length}
                        </span>
                      )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom card */}
        <div className="mt-auto pt-6">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              {syncEnabled && currentSpaceId ? (
                <Cloud className="h-4 w-4 text-primary" />
              ) : (
                <CloudOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm font-semibold">Estado de Nube</span>
            </div>
            {syncEnabled && currentSpaceId ? (
              <div className="text-xs text-muted-foreground">
                Conectado al espacio:
                <br />
                <strong className="text-foreground">{currentSpaceId}</strong>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Trabajando en modo local.
              </div>
            )}
            <button
              onClick={() => setActiveTab('sync_settings')}
              className="mt-3 w-full rounded-lg bg-background px-3 py-2 text-xs font-medium border border-border hover:bg-muted transition-colors"
            >
              Configurar
            </button>
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <div
        className={`md:hidden sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 ${
          activeTab === 'assistant' ? 'hidden' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/brand/raiz-logo.jpeg"
              alt="RAÍZ Finanzas"
              className="h-8 w-8 rounded-lg object-cover border border-primary/20 shrink-0"
            />
            <h1 className="text-lg font-bold text-foreground">Raíz</h1>
          </div>
          <button
            onClick={handleRefreshAllData}
            title="Refrescar datos"
            className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className="fixed bottom-0 left-0 right-0 min-h-[76px] bg-card border-t border-border flex items-center justify-around z-40 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] md:hidden">
        {(
          [
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'expenses', label: 'Gastos', icon: TrendingDown },
            { id: 'assistant', label: 'Asistente', icon: Sprout },
            { id: 'savings', label: 'Metas', icon: Target },
          ] as const
        ).map((tab) => {
          const isSelected = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              aria-current={isSelected ? 'page' : undefined}
              onClick={() => {
                setActiveTab(tab.id as typeof activeTab);
                setIsMoreSheetOpen(false);
              }}
              className={`flex flex-col items-center justify-center w-full py-1 space-y-1 transition-colors ${
                isSelected ? 'text-primary font-bold' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                  isSelected ? 'bg-primary text-primary-foreground' : ''
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {tab.id === 'assistant' && pendingTransactions.length > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-card bg-rose-500 px-1 text-[10px] font-bold text-white"
                    aria-label={`${pendingTransactions.length} por confirmar`}
                  >
                    {pendingTransactions.length}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
        <button
          aria-current={
            activeTab === 'incomes' ||
            activeTab === 'topics' ||
            activeTab === 'sync_settings'
              ? 'page'
              : undefined
          }
          onClick={() => setIsMoreSheetOpen(!isMoreSheetOpen)}
          className={`flex flex-col items-center justify-center w-full py-1 space-y-1 transition-colors ${
            isMoreSheetOpen ||
            activeTab === 'incomes' ||
            activeTab === 'topics' ||
            activeTab === 'sync_settings'
              ? 'text-primary font-bold'
              : 'text-muted-foreground'
          }`}
        >
          <span
            className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
              activeTab === 'incomes' ||
              activeTab === 'topics' ||
              activeTab === 'sync_settings'
                ? 'bg-primary text-primary-foreground'
                : ''
            }`}
          >
            <Menu className="h-5 w-5 shrink-0" />
          </span>
          <span className="text-[11px] font-medium leading-none">Más</span>
        </button>
      </div>

      {/* MORE SHEET MODAL */}
      <AnimatePresence>
        {isMoreSheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMoreSheetOpen(false)}
              className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-[calc(76px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-50 rounded-t-3xl border border-border bg-card p-6 shadow-2xl md:hidden"
            >
              <div className="mx-auto mb-6 h-1.5 w-12 rounded-full bg-border" />
              <div className="grid gap-4">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Mi dinero
                </p>
                <button
                  onClick={() => {
                    setActiveTab('incomes');
                    setIsMoreSheetOpen(false);
                  }}
                  className="flex items-center gap-4 rounded-2xl p-4 transition-colors hover:bg-muted"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-foreground">
                      Ingresos y Cajero
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Entradas y efectivo
                    </div>
                  </div>
                </button>
                <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Ajustes
                </p>
                <button
                  onClick={() => {
                    setActiveTab('sync_settings');
                    setIsMoreSheetOpen(false);
                  }}
                  className="flex items-center gap-4 rounded-2xl p-4 transition-colors hover:bg-muted"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <CloudLightning className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-foreground">
                      Nube y Compartir
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Opciones de sincronización
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('topics');
                    setIsMoreSheetOpen(false);
                  }}
                  className="flex items-center gap-4 rounded-2xl p-4 transition-colors hover:bg-muted"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Shapes className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-foreground">
                      Categorías
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Configurar categorías
                    </div>
                  </div>
                </button>
                <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Acciones
                </p>
                <button
                  onClick={() => {
                    handleRefreshAllData();
                    setIsMoreSheetOpen(false);
                  }}
                  className="flex items-center gap-4 rounded-2xl p-4 transition-colors hover:bg-muted"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <RefreshCw className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-foreground">
                      Refrescar datos
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Sincronizar tiempo real
                    </div>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MAIN CONTAINER */}
      <main
        className={`flex-1 overflow-y-auto outline-none md:pb-10 ${
          activeTab === 'assistant' ? 'pb-0' : 'pb-36'
        }`}
      >
        <div
          className={`max-w-5xl mx-auto md:px-8 md:py-10 ${
            activeTab === 'assistant' ? 'px-0 py-0' : 'px-4 py-6'
          }`}
        >
          {activeTab !== 'assistant' && (
            <PendingTransactionsBanner
              pendingTransactions={pendingTransactions}
              onApprove={handleApprovePendingTransaction}
              onApproveAll={handleApproveAllPendingTransactions}
              onDiscard={handleDiscardPendingTransaction}
              onEdit={(tx) => setEditingPendingTx(tx)}
            />
          )}

          <EditPendingTransactionModal
            pendingTx={editingPendingTx}
            topics={topics}
            isOpen={!!editingPendingTx}
            onClose={() => setEditingPendingTx(null)}
            onSave={handleSaveEditedPendingTransaction}
          />

          {/* MONTH NAVIGATOR (not used by the assistant chat) */}
          {activeTab !== 'assistant' && (
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="inline-flex items-center bg-card border border-border rounded-full p-1 shadow-sm">
                <button
                  onClick={() => {
                    if (activeMonth !== 'all')
                      setActiveMonth(decrementMonth(activeMonth));
                  }}
                  disabled={activeMonth === 'all'}
                  className="p-1.5 hover:bg-muted rounded-full disabled:opacity-50 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="w-32 md:w-40 text-center text-sm font-semibold text-foreground capitalize">
                  {getMonthLabel(activeMonth)}
                </span>
                <button
                  onClick={() => {
                    if (activeMonth !== 'all')
                      setActiveMonth(incrementMonth(activeMonth));
                  }}
                  disabled={activeMonth === 'all'}
                  className="p-1.5 hover:bg-muted rounded-full disabled:opacity-50 transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setActiveMonth(activeMonth === 'all' ? '2026-08' : 'all')
                  }
                  className={`px-4 py-2 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                    activeMonth === 'all'
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {activeMonth === 'all' ? 'Volver al Mes' : 'Ver Todo'}
                </button>
                <button
                  onClick={handleRefreshAllData}
                  className="hidden md:flex p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors border border-transparent hover:border-border cursor-pointer"
                  title="Refrescar datos"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'dashboard' && (
                <DashboardSection
                  expenses={filteredExpenses}
                  allExpenses={expenses}
                  goals={goals}
                  topics={topics}
                  onEditTopic={handleEditTopic}
                  startingSavings={startingSavings}
                  totalContributions={totalContributions}
                  formatCurrency={formatCurrency}
                  privacyMode={privacyMode}
                  setPrivacyMode={setPrivacyMode}
                  privacyScale={privacyScale}
                  setPrivacyScale={setPrivacyScale}
                  activeMonth={activeMonth}
                  setActiveMonth={setActiveMonth}
                  capitalDisponible={capitalDisponible}
                  carryOver={carryOver}
                  cashPool={cashPool}
                  totals={totals}
                  recentTransactions={recentTransactions}
                />
              )}

              <Suspense
                fallback={
                  <div className="flex items-center justify-center p-12 text-muted-foreground/80 text-xs gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    Cargando sección...
                  </div>
                }
              >
                {activeTab === 'assistant' && (
                  <AssistantTab
                    currentSpaceId={currentSpaceId}
                    userUid={user?.uid}
                    syncEnabled={syncEnabled}
                    onOpenCloudSettings={() => setActiveTab('sync_settings')}
                    pendingTransactions={pendingTransactions}
                    pendingReady={pendingLoadedSpace === currentSpaceId}
                    onApproveDraft={handleApprovePendingTransaction}
                    onEditDraft={(tx) => setEditingPendingTx(tx)}
                    onDiscardDraft={handleDiscardPendingTransaction}
                  />
                )}
                {activeTab === 'incomes' && (
                  <IncomesSection
                    incomes={filteredIncomes}
                    topics={topics}
                    onAddIncome={handleAddIncome}
                    onEditIncome={handleEditIncome}
                    onToggleConfirmIncome={handleToggleConfirmIncome}
                    onDeleteIncome={handleDeleteIncome}
                    formatCurrency={formatCurrency}
                    withdrawals={filteredWithdrawals}
                    onAddWithdrawal={handleAddWithdrawal}
                    onEditWithdrawal={handleEditWithdrawal}
                    onDeleteWithdrawal={handleDeleteWithdrawal}
                    cashPool={cashPool}
                  />
                )}

                {activeTab === 'expenses' && (
                  <ExpensesSection
                    expenses={filteredExpenses}
                    topics={topics}
                    onAddExpense={handleAddExpense}
                    onEditExpense={handleEditExpense}
                    onToggleConfirmExpense={handleToggleConfirmExpense}
                    onDeleteExpense={handleDeleteExpense}
                    formatCurrency={formatCurrency}
                  />
                )}

                {activeTab === 'savings' && (
                  <SavingsSection
                    goals={goals}
                    contributions={filteredContributions}
                    topics={topics}
                    startingSavings={startingSavings}
                    onUpdateStartingSavings={async (val) => {
                      if (syncEnabled && currentSpaceId) {
                        await updateSpaceSavings(currentSpaceId, val);
                      }
                      setStartingSavings(val);
                    }}
                    onAddGoal={handleAddGoal}
                    onEditGoal={handleEditGoal}
                    onDeleteGoal={handleDeleteGoal}
                    onAddContribution={handleAddContribution}
                    onEditContribution={handleEditContribution}
                    onDeleteContribution={handleDeleteContribution}
                    currentAvailableIncomes={currentIncomesPool}
                    formatCurrency={formatCurrency}
                  />
                )}

                {activeTab === 'sync_settings' && (
                  <SyncPanel
                    user={user}
                    isAuthLoading={isAuthLoading}
                    currentSpaceId={currentSpaceId}
                    personalSpaceId={personalSpaceId}
                    spaceInfo={spaceInfo}
                    pendingRequests={pendingRequests}
                    activePendingRequest={activePendingRequest}
                    onLogin={handleLogin}
                    onEmailLogin={handleEmailLogin}
                    onEmailRegister={handleEmailRegister}
                    onLogout={handleLogout}
                    onJoinSpace={handleRequestJoinSpace}
                    onApproveRequest={handleApproveRequest}
                    onRejectRequest={handleRejectRequest}
                    onCancelMyRequest={handleCancelMyRequest}
                    onRegenerateCode={handleRegenerateCode}
                    onUploadLocalData={handleUploadLocalData}
                    hasLocalData={
                      topics.length > 0 ||
                      incomes.length > 0 ||
                      expenses.length > 0
                    }
                    onRevokeMember={handleRevokeMember}
                  />
                )}

                {activeTab === 'topics' && (
                  <TopicsConfig
                    topics={topics}
                    onAddTopic={handleAddTopic}
                    onEditTopic={handleEditTopic}
                    onDeleteTopic={handleDeleteTopic}
                  />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
