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
  arrayUnion,
  arrayRemove,
  FieldValue,
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
  metaEnv.VITE_GOOGLE_OAUTH_CLIENT_ID ||
  firebaseConfig.oAuthClientId ||
  '';

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
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// Generates a unique, secure, unguessable space code e.g. "ESP-9K2F7M"
export const generateUniqueSpaceCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
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

// Find a space by its unique code (e.g., ESP-8K92F1) OR by document ID
export const getSpaceByCodeOrId = async (
  targetCodeOrId: string
): Promise<Space | null> => {
  if (!targetCodeOrId) return null;
  const cleanedInput = targetCodeOrId.trim();

  // 1. Check code field match (case-insensitive or exact uppercase)
  try {
    const qCode = query(
      collection(db, 'spaces'),
      where('code', '==', cleanedInput.toUpperCase())
    );
    const snapCode = await getDocs(qCode);
    if (!snapCode.empty) {
      return snapCode.docs[0].data() as Space;
    }
  } catch (e) {
    console.warn('Error querying space by code:', e);
  }

  // 2. Check document by normalized ID
  const cleanId = normalizeSpaceId(cleanedInput);
  try {
    const directRef = doc(db, 'spaces', cleanId);
    const snap = await getDoc(directRef);
    if (snap.exists()) {
      return snap.data() as Space;
    }
  } catch (e) {
    console.warn('Error getting space by ID:', e);
  }

  return null;
};

// Get or Create a Space
export const getOrCreateSpace = async (
  rawSpaceId: string,
  spaceName: string,
  ownerUid: string,
  userEmail: string
): Promise<Space> => {
  const cleanId = normalizeSpaceId(rawSpaceId);
  const spaceRef = doc(db, 'spaces', cleanId);
  try {
    const snap = await getDoc(spaceRef);

    if (snap.exists()) {
      const data = snap.data() as Space;
      if (!Array.isArray(data.members)) {
        data.members = ownerUid ? [ownerUid] : [];
      }

      let needsUpdate = false;
      const updates: Record<string, unknown> = {};

      // Ensure space has a unique code
      if (!data.code) {
        data.code = generateUniqueSpaceCode();
        updates.code = data.code;
        needsUpdate = true;
      }

      // If signed in, verify membership or join
      if (
        ownerUid &&
        ownerUid !== 'guest' &&
        ownerUid !== 'anonymous' &&
        !data.members.includes(ownerUid)
      ) {
        data.members = [...data.members, ownerUid];
        updates.members = data.members;
        needsUpdate = true;
      }

      if (needsUpdate) {
        try {
          await updateDoc(
            spaceRef,
            updates as {
              [x: string]: FieldValue | Partial<unknown> | undefined;
            }
          );
        } catch (uErr) {
          console.warn('Could not update space metadata online:', uErr);
        }
      }
      return data;
    } else {
      // Create new Space with unique code
      const uniqueCode = generateUniqueSpaceCode();
      const newSpace: Space = {
        id: cleanId,
        code: uniqueCode,
        name:
          spaceName ||
          `Espacio de ${userEmail ? userEmail.split('@')[0] : 'Usuario'}`,
        ownerUid: ownerUid || 'anonymous',
        ownerEmail: userEmail || '',
        members: ownerUid ? [ownerUid] : [],
        startingSavings: 1000,
        createdAt: new Date().toISOString(),
      };
      try {
        await setDoc(spaceRef, newSpace);
      } catch (sErr) {
        console.warn('Could not save new space to Firestore online:', sErr);
      }
      return newSpace;
    }
  } catch (err) {
    const error = err as Error & { code?: string };
    console.warn(
      'getOrCreateSpace offline or unreachable, returning fallback space:',
      error
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
};

// Request access to a space
export const requestAccessToSpace = async (
  targetCodeOrId: string,
  user: { uid: string; email: string; displayName?: string }
): Promise<{
  status: 'approved' | 'pending';
  requestId?: string;
  space: Space;
}> => {
  const space = await getSpaceByCodeOrId(targetCodeOrId);
  if (!space) {
    throw new Error(
      `El código o ID de espacio "${targetCodeOrId}" no fue encontrado. Verifica la información.`
    );
  }

  // Check if user is owner or already a member
  const isOwner = space.ownerUid === user.uid;
  const isMember =
    Array.isArray(space.members) &&
    (space.members.includes(user.uid) || space.members.includes(user.email));

  if (isOwner || isMember) {
    return { status: 'approved', space };
  }

  // Create access request in spaces/{space.id}/access_requests/{req_uid}
  const requestId = `req_${user.uid}`;
  const reqRef = doc(db, 'spaces', space.id, 'access_requests', requestId);

  const requestData: AccessRequest = {
    id: requestId,
    spaceId: space.id,
    spaceName: space.name || space.id,
    requesterUid: user.uid,
    requesterEmail: user.email,
    requesterName: user.displayName || user.email.split('@')[0],
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  await setDoc(reqRef, requestData);

  return { status: 'pending', requestId, space };
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
        const data = docSnap.data() as AccessRequest;
        if (data.status === 'pending') {
          requests.push(data);
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
        onUpdate(docSnap.data() as AccessRequest);
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
// since the backend rejects anonymous calls.
const postWithIdToken = async (
  path: string,
  payload: unknown
): Promise<Response | null> => {
  const idToken = await getIdToken();
  if (!idToken) return null;
  return fetch(`${TELEGRAM_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
};

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
    const res = await postWithIdToken('/api/telegram/notify-access', payload);
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
    await postWithIdToken('/api/telegram/sync-draft', payload);
  } catch (e) {
    console.warn('Could not sync the Telegram draft card:', e);
  }
};

// Approve access request (Host action)
export const approveAccessRequest = async (
  spaceId: string,
  request: AccessRequest
) => {
  const cleanId = normalizeSpaceId(spaceId);
  const reqRef = doc(db, 'spaces', cleanId, 'access_requests', request.id);
  const spaceRef = doc(db, 'spaces', cleanId);

  const isTelegramReq =
    request.requesterUid?.startsWith('tg:') ||
    request.id?.startsWith('req_tg_');

  // The backend approves Telegram requests only while they are still pending,
  // so it runs before the request status is updated below.
  if (isTelegramReq) {
    await notifyTelegramAccessChange({
      spaceId: cleanId,
      spaceName: request.spaceName,
      chatId: request.requesterUid,
      status: 'approved',
    });
  }

  // Update request status
  await updateDoc(reqRef, { status: 'approved' });

  // Add requester to space members
  if (isTelegramReq) {
    try {
      await updateDoc(spaceRef, {
        members: arrayUnion(request.requesterUid),
      });
    } catch (e) {
      console.warn('Space members update delegated to backend:', e);
    }
  } else {
    await updateDoc(spaceRef, {
      members: arrayUnion(request.requesterUid, request.requesterEmail),
    });
  }
};

// Reject access request (Host action)
export const rejectAccessRequest = async (
  spaceId: string,
  requestId: string
) => {
  const cleanId = normalizeSpaceId(spaceId);
  const reqRef = doc(db, 'spaces', cleanId, 'access_requests', requestId);

  // Like approval, the backend only rejects a still-pending Telegram request.
  if (requestId.startsWith('req_tg_')) {
    await notifyTelegramAccessChange({
      spaceId: cleanId,
      chatId: requestId.replace(/^req_tg_/, ''),
      status: 'rejected',
    });
  }

  await updateDoc(reqRef, { status: 'rejected' });
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

// CRUD operations on Space subcollections
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

  // The backend checks the Telegram member against the current space, so it
  // runs before this client removes the member below.
  if (isTelegramMember) {
    await notifyTelegramAccessChange({
      spaceId: cleanId,
      chatId: cleanChatId,
      status: 'revoked',
    });
  }

  try {
    await updateDoc(spaceRef, {
      members: arrayRemove(memberUid),
    });
  } catch (e) {
    if (!isTelegramMember) throw e;
    console.warn('Space members removal delegated to backend:', e);
  }

  if (isTelegramMember) {
    try {
      const reqRef = doc(
        db,
        'spaces',
        cleanId,
        'access_requests',
        `req_tg_${cleanChatId}`
      );
      await updateDoc(reqRef, { status: 'rejected' });
    } catch (e) {
      console.warn('Could not mark Telegram access_request rejected:', e);
    }
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
