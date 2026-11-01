import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
  deleteDoc,
  updateDoc,
  query,
  where,
  getDocs,
  getDocsFromServer,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Dynamic Firebase Configuration prioritizing env variables or default project config
const metaEnv =
  (import.meta as unknown as { env: Record<string, string> }).env || {};

const activeFirebaseConfig = {
  apiKey:
    metaEnv.VITE_FIREBASE_API_KEY ||
    firebaseConfig.apiKey ||
    'your-firebase-api-key',
  authDomain:
    metaEnv.VITE_FIREBASE_AUTH_DOMAIN ||
    firebaseConfig.authDomain ||
    'your-firebase-project-id.firebaseapp.com',
  projectId:
    metaEnv.VITE_FIREBASE_PROJECT_ID ||
    firebaseConfig.projectId ||
    'your-firebase-project-id',
  storageBucket:
    metaEnv.VITE_FIREBASE_STORAGE_BUCKET ||
    firebaseConfig.storageBucket ||
    'your-firebase-project-id.appspot.com',
  messagingSenderId:
    metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    firebaseConfig.messagingSenderId ||
    '000000000000',
  appId:
    metaEnv.VITE_FIREBASE_APP_ID ||
    firebaseConfig.appId ||
    '1:000000000000:web:0000000000000000000000',
  measurementId:
    metaEnv.VITE_FIREBASE_MEASUREMENT_ID ||
    firebaseConfig.measurementId ||
    'G-XXXXXXXXXX',
};

// Initialize Firebase
export const app = initializeApp(activeFirebaseConfig);
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
const dbId = (firebaseConfig as Record<string, unknown>)
  .firestoreDatabaseId as string;
export const db =
  dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);

// Configure Google Auth Provider - Standard (no sensitive scopes)
export const provider = new GoogleAuthProvider();

// OAuth access-token storage.
// The Gmail access token is kept in sessionStorage (not localStorage): it is
// cleared when the tab closes, reducing its exposure window. Guarded reads keep
// this safe in non-browser contexts (e.g. tests where sessionStorage is absent).
export const GTOKEN_KEY = 'p_gtoken';
const tokenStore = (): Storage | null =>
  typeof sessionStorage !== 'undefined' ? sessionStorage : null;

export const readStoredToken = (): string | null =>
  tokenStore()?.getItem(GTOKEN_KEY) ?? null;

export const writeStoredToken = (token: string): void => {
  tokenStore()?.setItem(GTOKEN_KEY, token);
};

export const clearStoredToken = (): void => {
  tokenStore()?.removeItem(GTOKEN_KEY);
};

// One-time migration: purge any token previously persisted in localStorage,
// which is a wider exposure surface than sessionStorage.
if (typeof localStorage !== 'undefined') {
  localStorage.removeItem(GTOKEN_KEY);
}

// In-memory token cache
let cachedAccessToken: string | null = readStoredToken();
let isSigningIn = false;

export const getCachedAccessToken = () =>
  cachedAccessToken || readStoredToken();

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  getRedirectResult(auth).catch((error) => {
    console.error('Error during getRedirectResult:', error);
  });

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      // Return user and whatever cached token is available
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

const GOOGLE_CLIENT_ID =
  metaEnv.VITE_GOOGLE_OAUTH_CLIENT_ID || firebaseConfig.oAuthClientId || '';

// Sign In with Google - Standard (safe from 403 blocked by sensitive scope)
export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string | null;
} | null> => {
  if (isSigningIn) return null;
  try {
    isSigningIn = true;

    if (Capacitor.isNativePlatform()) {
      await GoogleSignIn.initialize({
        clientId: GOOGLE_CLIENT_ID,
      });
      const res = await GoogleSignIn.signIn();
      if (!res.idToken) {
        throw new Error('No ID Token returned from Google Sign In');
      }
      const credential = GoogleAuthProvider.credential(res.idToken);
      const result = await signInWithCredential(auth, credential);
      return { user: result.user, accessToken: null };
    } else {
      const isMobilePWA = window.matchMedia(
        '(display-mode: standalone)'
      ).matches;
      if (isMobilePWA) {
        await signInWithRedirect(auth, provider);
        return null;
      }
      try {
        const result = await signInWithPopup(auth, provider);
        return { user: result.user, accessToken: null };
      } catch (popupErr) {
        const pErr = popupErr as Error & { code?: string };
        if (
          pErr?.code === 'auth/popup-blocked' ||
          pErr?.code === 'auth/cancelled-popup-request' ||
          pErr?.message?.includes('Database is closing') ||
          pErr?.message?.includes('closing/hidden') ||
          pErr?.message?.includes('Cross-Origin-Opener-Policy') ||
          pErr?.message?.includes('COOP')
        ) {
          await signInWithRedirect(auth, provider);
          return null;
        }
        throw popupErr;
      }
    }
  } catch (err) {
    const error = err as Error & { code?: string };
    const errMsg = String(error?.message || error?.code || error);
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      errMsg.includes('popup-closed-by-user') ||
      errMsg.includes('closed-by-user') ||
      errMsg.includes('SIGN_IN_CANCELED')
    ) {
      console.warn('Google Sign In was cancelled or closed by the user.');
    } else {
      console.error('Error during Google Sign In:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Sign In with Google requesting the sensitive Gmail scope
export const googleGmailSignIn = async (): Promise<{
  user: User;
  accessToken: string | null;
} | null> => {
  if (isSigningIn) return null;
  try {
    isSigningIn = true;

    if (Capacitor.isNativePlatform()) {
      await GoogleSignIn.initialize({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      });
      const res = await GoogleSignIn.signIn();
      if (!res.idToken) {
        throw new Error('No ID Token returned from Google Sign In');
      }
      const credential = GoogleAuthProvider.credential(res.idToken);
      const result = await signInWithCredential(auth, credential);
      if (res.accessToken) {
        cachedAccessToken = res.accessToken;
      }
      return { user: result.user, accessToken: cachedAccessToken };
    } else {
      const gmailProvider = new GoogleAuthProvider();
      gmailProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');

      const isMobilePWA = window.matchMedia(
        '(display-mode: standalone)'
      ).matches;
      if (isMobilePWA) {
        await signInWithRedirect(auth, gmailProvider);
        return null;
      }

      try {
        const result = await signInWithPopup(auth, gmailProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);

        if (credential?.accessToken) {
          cachedAccessToken = credential.accessToken;
        }

        return { user: result.user, accessToken: cachedAccessToken };
      } catch (popupErr) {
        const pErr = popupErr as Error & { code?: string };
        if (
          pErr?.code === 'auth/popup-blocked' ||
          pErr?.code === 'auth/cancelled-popup-request' ||
          pErr?.message?.includes('Database is closing') ||
          pErr?.message?.includes('closing/hidden') ||
          pErr?.message?.includes('Cross-Origin-Opener-Policy') ||
          pErr?.message?.includes('COOP')
        ) {
          await signInWithRedirect(auth, gmailProvider);
          return null;
        }
        throw popupErr;
      }
    }
  } catch (err) {
    const error = err as Error & { code?: string };
    const errMsg = String(error?.message || error?.code || error);
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      errMsg.includes('popup-closed-by-user') ||
      errMsg.includes('closed-by-user') ||
      errMsg.includes('SIGN_IN_CANCELED')
    ) {
      console.warn('Gmail Google Sign In was cancelled or closed by the user.');
    } else {
      console.error('Error during Gmail Google Sign In:', error);
    }
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Sign In with Email and Password
export const emailSignIn = async (
  email: string,
  password: string
): Promise<User> => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

// Sign Up with Email and Password
export const emailSignUp = async (
  email: string,
  password: string
): Promise<User> => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
};

// Return the in-memory cached access token, if any. Does NOT trigger sign-in.
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

// Return the current user's Firebase ID token, or null if not signed in.
// Used to authenticate requests to the backend parse endpoint.
export const getIdToken = async (): Promise<string | null> =>
  auth.currentUser ? auth.currentUser.getIdToken() : null;

// Set token manually (e.g. if loaded from popup flow)
export const setAccessToken = (token: string) => {
  cachedAccessToken = token;
};

// Sign Out
export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// --- Firestore Business Logic for "Finance Spaces" ---

export interface Space {
  id: string;
  code: string;
  name: string;
  ownerUid: string;
  ownerEmail?: string;
  members: string[];
  startingSavings: number;
  createdAt?: string;
}

export interface AccessRequest {
  id: string;
  spaceId: string;
  spaceName: string;
  requesterUid: string;
  requesterEmail: string;
  requesterName?: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'cancelled';
  createdAt: string;
  // Contract C1 fields of backend-created web requests.
  userId?: string;
  email?: string;
  displayName?: string;
  type?: string;
  // Contract C2: who decided (approved/rejected/revoked) and when.
  decidedBy?: string;
  decidedAt?: string;
}

// True for a Firestore "permission-denied" error (security rules refusal).
// It is never retryable, unlike network failures.
export const isPermissionDenied = (err: unknown): boolean =>
  (err as { code?: unknown } | null)?.code === 'permission-denied';

// Unambiguous characters only (no I, O, 0, 1). 32 symbols, so a random byte
// modulo the alphabet length is unbiased (256 is a multiple of 32).
const SPACE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SPACE_CODE_LENGTH = 8;

// Generates a unique, secure, unguessable space code e.g. "ESP-9K2F7M4Q"
export const generateUniqueSpaceCode = (): string => {
  const bytes = new Uint8Array(SPACE_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (const byte of bytes) {
    suffix += SPACE_CODE_ALPHABET[byte % SPACE_CODE_ALPHABET.length];
  }
  return `ESP-${suffix}`;
};

// Normalizes space codes reliably (e.g. "espacio_familia", "familia", "espacio_mi.hogar" => "espacio_mihogar")
export const normalizeSpaceId = (rawId: string): string => {
  if (!rawId) return 'espacio_compartido';
  let cleaned = rawId.trim().toLowerCase();
  cleaned = cleaned.replace(/[\s/]+/g, '_');

  if (cleaned.startsWith('espacio_')) {
    const suffix = cleaned.slice(8).replace(/[^a-z0-9_]/g, '');
    return suffix ? `espacio_${suffix}` : 'espacio_compartido';
  }

  const cleanAlpha = cleaned.replace(/[^a-z0-9_]/g, '');
  return cleanAlpha ? `espacio_${cleanAlpha}` : 'espacio_compartido';
};

// Default ("personal") space id of a user: derived from its uid, so two
// users never share it (an email local part can collide). It is a fixed point
// of normalizeSpaceId, which the backend code/id lookup also applies.
export const personalSpaceIdFor = (uid: string): string =>
  normalizeSpaceId(`u_${uid}`);

// Resolves the user's default space id, in order:
// 1. the one remembered in `users/{uid}.defaultSpaceId`;
// 2. an existing space the user owns (preferring the legacy
//    `espacio_<email local part>` one), so existing users keep their space;
// 3. a new uid-derived id (personalSpaceIdFor).
// The result is remembered in `users/{uid}`. A failed owned-space lookup
// rejects instead of guessing, so an existing user is never moved to a new,
// empty space while offline.
export const resolveDefaultSpaceId = async (user: {
  uid: string;
  email?: string | null;
}): Promise<string> => {
  const userRef = doc(db, 'users', user.uid);
  // A failed read (e.g. offline) must not be mistaken for "nothing remembered":
  // that would persist a new empty default space over the user's real one.
  const userSnap = await getDoc(userRef);
  const remembered = userSnap.exists()
    ? (userSnap.data() as { defaultSpaceId?: unknown }).defaultSpaceId
    : undefined;
  if (typeof remembered === 'string' && remembered) {
    return normalizeSpaceId(remembered);
  }

  // Server-only: offline, the cache answers with an empty result instead of
  // failing, which would look like "owns no space".
  const owned = await getDocsFromServer(
    query(collection(db, 'spaces'), where('ownerUid', '==', user.uid))
  );
  const ownedIds = owned.docs.map((d) => d.id).sort();
  const legacyId = user.email ? normalizeSpaceId(user.email.split('@')[0]) : '';
  const resolved = ownedIds.includes(legacyId)
    ? legacyId
    : ownedIds[0] || personalSpaceIdFor(user.uid);

  try {
    await setDoc(userRef, { defaultSpaceId: resolved }, { merge: true });
  } catch (e) {
    console.warn('Could not remember the default space:', e);
  }
  return resolved;
};

// Get or Create a Space. Rejects when the security rules refuse access
// (permission-denied) or the new space cannot be written; only an
// unreachable Firestore ("unavailable", offline) returns a local placeholder.
export const getOrCreateSpace = async (
  rawSpaceId: string,
  spaceName: string,
  ownerUid: string,
  userEmail: string
): Promise<Space> => {
  const cleanId = normalizeSpaceId(rawSpaceId);
  const spaceRef = doc(db, 'spaces', cleanId);

  let snap: Awaited<ReturnType<typeof getDoc>>;
  try {
    snap = await getDoc(spaceRef);
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code !== 'unavailable') throw err;
    console.warn(
      'getOrCreateSpace offline or unreachable, returning fallback space:',
      err
    );
    return {
      id: cleanId,
      code: 'ESP-LOCAL',
      name: spaceName || `Espacio (${cleanId})`,
      ownerUid: ownerUid || 'anonymous',
      ownerEmail: userEmail || '',
      members: ownerUid ? [ownerUid] : [],
      startingSavings: 1000,
    };
  }

  if (snap.exists()) {
    const data = { ...(snap.data() as Space) };
    data.id = data.id || cleanId;
    if (!Array.isArray(data.members)) data.members = [];

    // Backfill a missing code. Only the owner may change the space doc
    // metadata; the code is shown only once it is actually saved.
    if (!data.code && ownerUid && data.ownerUid === ownerUid) {
      const code = generateUniqueSpaceCode();
      try {
        await updateDoc(spaceRef, { code });
        data.code = code;
      } catch (e) {
        console.warn('Could not save the space code:', e);
      }
    }
    return data;
  }

  if (!ownerUid || ownerUid === 'guest' || ownerUid === 'anonymous') {
    throw new Error(
      'Debes iniciar sesión con tu cuenta para crear un espacio.'
    );
  }
  const newSpace: Space = {
    id: cleanId,
    code: generateUniqueSpaceCode(),
    name:
      spaceName ||
      `Espacio de ${userEmail ? userEmail.split('@')[0] : 'Usuario'}`,
    ownerUid,
    ownerEmail: userEmail || '',
    members: [ownerUid],
    startingSavings: 1000,
    createdAt: new Date().toISOString(),
  };
  await setDoc(spaceRef, newSpace);
  return newSpace;
};

export interface SpaceAccessRequestResult {
  // `member`: already a member/owner; `approved`: a previous request was
  // approved; `pending`: waiting for the owner.
  status: 'member' | 'approved' | 'pending';
  spaceId: string;
  spaceName: string;
  // The caller's own `req_<uid>` request doc, when pending.
  requestId?: string;
}

// Request access to a space by its code (or id) through the backend
// (contract C1, POST /api/spaces/request-access). Non-members cannot read
// other spaces, so the lookup and the request write happen server side.
export const requestAccessToSpace = async (
  targetCodeOrId: string
): Promise<SpaceAccessRequestResult> => {
  const code = targetCodeOrId.trim();
  const uid = auth.currentUser?.uid;
  const res = uid
    ? await postWithIdToken('/api/spaces/request-access', { code })
    : null;
  if (!uid || !res) {
    throw new Error(
      'Debes iniciar sesión con tu cuenta para solicitar acceso a un espacio.'
    );
  }
  if (res.status === 404) {
    throw new Error(
      `El código o ID de espacio "${code}" no fue encontrado. Verifica la información.`
    );
  }
  if (res.status === 400) {
    throw new Error(
      'El código de espacio no es válido. Verifica la información.'
    );
  }
  if (!res.ok) {
    throw new Error(
      `No se pudo enviar la solicitud de acceso (error ${res.status}). Intenta de nuevo más tarde.`
    );
  }

  const body = (await res.json()) as {
    status?: unknown;
    spaceId?: unknown;
    spaceName?: unknown;
  };
  if (
    (body.status !== 'member' &&
      body.status !== 'approved' &&
      body.status !== 'pending') ||
    typeof body.spaceId !== 'string' ||
    !body.spaceId
  ) {
    throw new Error(
      'Respuesta inesperada del servidor al solicitar acceso. Intenta de nuevo.'
    );
  }
  const spaceName =
    typeof body.spaceName === 'string' && body.spaceName
      ? body.spaceName
      : body.spaceId;
  return {
    status: body.status,
    spaceId: body.spaceId,
    spaceName,
    ...(body.status === 'pending' ? { requestId: `req_${uid}` } : {}),
  };
};

// Reads an access request doc in either shape: backend-created web requests
// (contract C1 `userId` / `email` / `displayName`) or legacy and Telegram ones
// (`requesterUid` / `requesterEmail` / `requesterName`).
const toAccessRequest = (
  id: string,
  spaceId: string,
  raw: Record<string, unknown>
): AccessRequest => {
  const text = (value: unknown) =>
    typeof value === 'string' && value ? value : undefined;
  const requesterEmail = text(raw.requesterEmail) ?? text(raw.email) ?? '';
  return {
    ...(raw as Partial<AccessRequest>),
    id,
    spaceId: text(raw.spaceId) ?? spaceId,
    spaceName: text(raw.spaceName) ?? spaceId,
    requesterUid: text(raw.requesterUid) ?? text(raw.userId) ?? '',
    requesterEmail,
    requesterName:
      text(raw.requesterName) ??
      text(raw.displayName) ??
      (requesterEmail ? requesterEmail.split('@')[0] : undefined),
    status: (text(raw.status) ?? 'pending') as AccessRequest['status'],
    createdAt: text(raw.createdAt) ?? '',
  };
};

// Listen to pending access requests for a space (Host Notification)
export const subscribeToPendingAccessRequests = (
  spaceId: string,
  onUpdate: (requests: AccessRequest[]) => void
) => {
  if (!spaceId) return () => {};
  const cleanId = normalizeSpaceId(spaceId);
  const colRef = collection(db, 'spaces', cleanId, 'access_requests');

  return onSnapshot(
    colRef,
    (snapshot) => {
      const requests: AccessRequest[] = [];
      snapshot.forEach((docSnap) => {
        const request = toAccessRequest(
          docSnap.id,
          cleanId,
          docSnap.data() as Record<string, unknown>
        );
        if (request.status === 'pending') {
          requests.push(request);
        }
      });
      onUpdate(requests);
    },
    (error) => {
      console.warn('Error syncing pending access requests:', error);
    }
  );
};

// Listen to status of a specific access request (Requester Auto-Refresh)
export const subscribeToAccessRequestStatus = (
  spaceId: string,
  requestId: string,
  onUpdate: (request: AccessRequest | null) => void
) => {
  if (!spaceId || !requestId) return () => {};
  const cleanId = normalizeSpaceId(spaceId);
  const docRef = doc(db, 'spaces', cleanId, 'access_requests', requestId);

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        onUpdate(
          toAccessRequest(
            requestId,
            cleanId,
            docSnap.data() as Record<string, unknown>
          )
        );
      } else {
        onUpdate(null);
      }
    },
    (error) => {
      console.warn('Error listening to request status:', error);
    }
  );
};

const TELEGRAM_API_BASE = (metaEnv.VITE_API_BASE_URL || '').replace(/\/$/, '');

// POST a JSON body to the backend authenticated with the signed-in user's
// Firebase ID token. Sends nothing (returns null) when nobody is signed in,
// since the backend rejects anonymous calls. With `timeoutMs`, the request is
// aborted (the promise rejects) once that time has passed.
const postWithIdToken = async (
  path: string,
  payload: unknown,
  options: { timeoutMs?: number } = {}
): Promise<Response | null> => {
  const idToken = await getIdToken();
  if (!idToken) return null;
  const controller = options.timeoutMs ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null;
  try {
    return await fetch(`${TELEGRAM_API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// Approval waits for notify-access, so a stalled backend must not hang it.
const NOTIFY_ACCESS_TIMEOUT_MS = 8000;

// Best effort: the backend updates the Telegram link and messages the chat.
// It only accepts the space owner and, for approve/reject, a request that is
// still pending, so callers invoke it before writing the new request status.
const notifyTelegramAccessChange = async (payload: {
  spaceId: string;
  spaceName?: string;
  chatId: string;
  status: 'approved' | 'rejected' | 'revoked';
}) => {
  try {
    const res = await postWithIdToken('/api/telegram/notify-access', payload, {
      timeoutMs: NOTIFY_ACCESS_TIMEOUT_MS,
    });
    if (res && !res.ok) {
      console.warn(
        'Telegram access push notification was refused:',
        res.status
      );
    }
  } catch (e) {
    console.warn('Could not send Telegram access push notification:', e);
  }
};

// Best effort: edit the Telegram draft card after the draft was confirmed or
// discarded from the Web App.
export const syncTelegramDraftCard = async (payload: {
  spaceId: string;
  draftId: string;
  chatId: string | number;
  messageId: string | number;
  action: 'APPROVED' | 'DISCARDED';
  description?: string;
  amount?: number;
  category?: string;
}) => {
  try {
    const res = await postWithIdToken('/api/telegram/sync-draft', payload);
    if (res && !res.ok) {
      console.warn('Telegram draft card sync was refused:', res.status);
    }
  } catch (e) {
    console.warn('Could not sync the Telegram draft card:', e);
  }
};

// The fields an owner decision writes on a request (contract C2). The
// security rules only accept them from the space owner, as itself.
const ownerDecision = (status: 'approved' | 'rejected' | 'revoked') => {
  const decidedBy = auth.currentUser?.uid;
  if (!decidedBy) {
    throw new Error(
      'Debes iniciar sesión con tu cuenta para gestionar el acceso al espacio.'
    );
  }
  return { status, decidedBy, decidedAt: new Date().toISOString() };
};

// Approve access request (Host action)
export const approveAccessRequest = async (
  spaceId: string,
  request: AccessRequest
) => {
  const cleanId = normalizeSpaceId(spaceId);
  const reqRef = doc(db, 'spaces', cleanId, 'access_requests', request.id);
  const spaceRef = doc(db, 'spaces', cleanId);
  const decision = ownerDecision('approved');
  const requesterUid = request.requesterUid || request.userId || '';

  const isTelegramReq =
    requesterUid.startsWith('tg:') || request.id?.startsWith('req_tg_');

  if (isTelegramReq) {
    // The backend approves Telegram requests only while they are still
    // pending, so it runs before the request status is updated below.
    await notifyTelegramAccessChange({
      spaceId: cleanId,
      spaceName: request.spaceName,
      chatId: requesterUid,
      status: 'approved',
    });
    await updateDoc(reqRef, decision);
    try {
      await updateDoc(spaceRef, { members: arrayUnion(requesterUid) });
    } catch (e) {
      console.warn('Space members update delegated to backend:', e);
    }
    return;
  }

  if (!requesterUid) {
    throw new Error('La solicitud no identifica a ningún usuario.');
  }
  // One atomic write: the requester (who listens to its request) only sees
  // "approved" once its uid is already a member, so it can read the space.
  // Members hold uids only, never emails.
  const batch = writeBatch(db);
  batch.update(reqRef, decision);
  batch.update(spaceRef, { members: arrayUnion(requesterUid) });
  await batch.commit();
};

// Reject access request (Host action)
export const rejectAccessRequest = async (
  spaceId: string,
  requestId: string
) => {
  const cleanId = normalizeSpaceId(spaceId);
  const reqRef = doc(db, 'spaces', cleanId, 'access_requests', requestId);
  const decision = ownerDecision('rejected');

  // Like approval, the backend only rejects a still-pending Telegram request.
  if (requestId.startsWith('req_tg_')) {
    await notifyTelegramAccessChange({
      spaceId: cleanId,
      chatId: requestId.replace(/^req_tg_/, ''),
      status: 'rejected',
    });
  }

  await updateDoc(reqRef, decision);
};

// Cancel the caller's own pending request (Requester action). This is not an
// owner decision, so it carries no `decidedBy`.
export const cancelAccessRequest = async (
  spaceId: string,
  requestId: string
) => {
  const cleanId = normalizeSpaceId(spaceId);
  const reqRef = doc(db, 'spaces', cleanId, 'access_requests', requestId);
  await updateDoc(reqRef, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
  });
};

// Regenerate unique space code
export const regenerateSpaceCode = async (spaceId: string): Promise<string> => {
  const cleanId = normalizeSpaceId(spaceId);
  const newCode = generateUniqueSpaceCode();
  const spaceRef = doc(db, 'spaces', cleanId);
  await updateDoc(spaceRef, { code: newCode });
  return newCode;
};

// Update starting savings of a Space in Firestore
export const updateSpaceSavings = async (
  rawSpaceId: string,
  startingSavings: number
) => {
  try {
    const spaceId = normalizeSpaceId(rawSpaceId);
    const spaceRef = doc(db, 'spaces', spaceId);
    await updateDoc(spaceRef, { startingSavings });
  } catch (error) {
    console.warn('Could not update space savings in Firestore:', error);
  }
};

// Generic Live Sync Subscription Helper for any subcollection of a Space
export const syncSpaceSubcollection = <T extends { id: string }>(
  rawSpaceId: string,
  subcollectionName: string,
  onUpdate: (items: T[]) => void
) => {
  const spaceId = normalizeSpaceId(rawSpaceId);
  const colRef = collection(db, 'spaces', spaceId, subcollectionName);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: T[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...docSnap.data() } as T);
      });
      onUpdate(items);
    },
    (error) => {
      console.warn(
        `Sync warning for subcollection ${subcollectionName}:`,
        error
      );
    }
  );
};

// CRUD operations on Space subcollections. Both log and rethrow failures so
// callers never report a refused or failed write as saved.
export const saveSpaceDocument = async <T extends object>(
  rawSpaceId: string,
  subcollectionName: string,
  docId: string,
  data: T
) => {
  try {
    const spaceId = normalizeSpaceId(rawSpaceId);
    const docRef = doc(db, 'spaces', spaceId, subcollectionName, docId);
    const cleanData = JSON.parse(JSON.stringify(data));
    await setDoc(docRef, cleanData);
  } catch (error) {
    console.error(
      `Could not save document ${docId} to ${subcollectionName}:`,
      error
    );
    throw error;
  }
};

export const deleteSpaceDocument = async (
  rawSpaceId: string,
  subcollectionName: string,
  docId: string
) => {
  try {
    const spaceId = normalizeSpaceId(rawSpaceId);
    const docRef = doc(db, 'spaces', spaceId, subcollectionName, docId);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn(
      `Could not delete document ${docId} from ${subcollectionName}:`,
      error
    );
    throw error;
  }
};

// Remove a member from a space
export const removeSpaceMember = async (
  spaceId: string,
  memberUid: string
): Promise<void> => {
  const cleanId = normalizeSpaceId(spaceId);
  const spaceRef = doc(db, 'spaces', cleanId);
  const isTelegramMember = memberUid.startsWith('tg:');
  const cleanChatId = memberUid.replace(/^tg:/, '');

  if (!isTelegramMember) {
    // A web member: drop its uid (and, for legacy data, the email that older
    // approvals also stored in members) and mark its request revoked, so the
    // backend does not report it as approved anymore.
    const requestId = `req_${memberUid}`;
    const reqRef = doc(db, 'spaces', cleanId, 'access_requests', requestId);
    const decision = ownerDecision('revoked');
    let requestExists = false;
    let legacyEmail = '';
    try {
      const reqSnap = await getDoc(reqRef);
      if (reqSnap.exists()) {
        requestExists = true;
        const request = toAccessRequest(
          requestId,
          cleanId,
          reqSnap.data() as Record<string, unknown>
        );
        if (request.requesterEmail.includes('@')) {
          legacyEmail = request.requesterEmail;
        }
      }
    } catch (e) {
      console.warn('Could not read the member access request:', e);
    }

    const batch = writeBatch(db);
    batch.update(spaceRef, {
      members: legacyEmail
        ? arrayRemove(memberUid, legacyEmail)
        : arrayRemove(memberUid),
    });
    if (requestExists) batch.update(reqRef, decision);
    await batch.commit();
    return;
  }

  // The backend checks the Telegram member against the current space, so it
  // runs before this client removes the member below.
  await notifyTelegramAccessChange({
    spaceId: cleanId,
    chatId: cleanChatId,
    status: 'revoked',
  });

  try {
    await updateDoc(spaceRef, {
      members: arrayRemove(memberUid),
    });
  } catch (e) {
    console.warn('Space members removal delegated to backend:', e);
  }

  try {
    const reqRef = doc(
      db,
      'spaces',
      cleanId,
      'access_requests',
      `req_tg_${cleanChatId}`
    );
    await updateDoc(reqRef, ownerDecision('rejected'));
  } catch (e) {
    console.warn('Could not mark Telegram access_request rejected:', e);
  }
};

export const formatNameFromEmail = (emailStr: string): string => {
  if (!emailStr || !emailStr.includes('@')) return emailStr || 'Usuario';
  const username = emailStr.split('@')[0];
  return username
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

// Fetch user profiles by UIDs
export const fetchSpaceMemberProfiles = async (
  spaceId: string,
  memberUids: string[]
): Promise<
  Record<string, { email: string; displayName: string; photoURL?: string }>
> => {
  const profiles: Record<
    string,
    { email: string; displayName: string; photoURL?: string }
  > = {};
  if (!memberUids || memberUids.length === 0) return profiles;

  // Query access_requests
  const requestsMap: Record<string, { name?: string; email: string }> = {};
  if (spaceId) {
    try {
      const cleanId = normalizeSpaceId(spaceId);
      const reqRef = collection(db, 'spaces', cleanId, 'access_requests');
      const q = query(reqRef, where('status', '==', 'approved'));
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        const data = docSnap.data() as AccessRequest;
        const info = { name: data.requesterName, email: data.requesterEmail };
        if (data.requesterUid) requestsMap[data.requesterUid] = info;
        if (data.requesterEmail) requestsMap[data.requesterEmail] = info;
      });
    } catch (e) {
      console.warn('Error querying access_requests for profiles:', e);
    }
  }

  for (const uid of memberUids) {
    try {
      if (auth.currentUser && auth.currentUser.uid === uid) {
        profiles[uid] = {
          email: auth.currentUser.email || '',
          displayName:
            auth.currentUser.displayName ||
            (auth.currentUser.email
              ? auth.currentUser.email.split('@')[0]
              : '') ||
            'Usuario',
          photoURL: auth.currentUser.photoURL || undefined,
        };
        continue;
      }

      if (requestsMap[uid]) {
        profiles[uid] = {
          email: requestsMap[uid].email || '',
          displayName:
            requestsMap[uid].name ||
            formatNameFromEmail(requestsMap[uid].email) ||
            'Usuario',
          photoURL: undefined,
        };
        continue;
      }

      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        profiles[uid] = {
          email: data.email || '',
          displayName:
            data.displayName ||
            data.name ||
            (data.email ? data.email.split('@')[0] : '') ||
            'Usuario',
          photoURL: data.photoURL,
        };
      } else {
        // Fallback for missing user documents
        const isEmail = uid.includes('@');
        profiles[uid] = {
          email: isEmail ? uid : `Usuario (${uid.substring(0, 5)}...)`,
          displayName: isEmail
            ? formatNameFromEmail(uid)
            : 'Usuario Desconocido',
        };
      }
    } catch (e) {
      console.warn(`Could not fetch profile for uid ${uid}:`, e);
      const isEmail = uid.includes('@');
      profiles[uid] = {
        email: isEmail ? uid : `Usuario (${uid.substring(0, 5)}...)`,
        displayName: isEmail ? formatNameFromEmail(uid) : 'Usuario Desconocido',
      };
    }
  }

  return profiles;
};
