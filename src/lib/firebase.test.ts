import { describe, it, expect, vi, beforeEach } from 'vitest';

// The firebase.ts module performs side effects at import time (initializeApp,
// initializeAuth, a Firestore connection probe). All SDK entry points are
// mocked so importing the module is inert and never touches the network.
//
// vi.mock factories are hoisted above module scope, so the mock functions they
// reference must be created inside vi.hoisted. The test config enables
// mockReset, which clears mock call history before each test; import-time
// invocations are therefore captured into a hoisted record that survives the
// reset, rather than read from mock.calls.
const h = vi.hoisted(() => {
  // firebase.ts reads localStorage at module-eval time; ensure a store exists
  // before the module import runs (hoisted blocks execute before imports).
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
          return store.size;
        },
      },
    });
  }

  const capture: {
    appConfig?: Record<string, string>;
    firestoreCallArgs: unknown[][];
  } = { firestoreCallArgs: [] };

  return {
    capture,
    initializeApp: vi.fn((...args: unknown[]) => {
      capture.appConfig = args[0] as Record<string, string>;
      return { name: 'test-app' };
    }),
    initializeAuth: vi.fn((..._args: unknown[]) => ({ __auth: true })),
    getFirestore: vi.fn((...args: unknown[]) => {
      capture.firestoreCallArgs.push(args);
      return { __db: true };
    }),
    getDocFromServer: vi.fn(async (..._args: unknown[]) => ({})),
    onAuthStateChanged: vi.fn((..._args: unknown[]) => () => {}),
    signOut: vi.fn(async (..._args: unknown[]) => {}),
  };
});

vi.mock('firebase/app', () => ({
  initializeApp: (...args: [Record<string, string>]) =>
    h.initializeApp(...args),
}));

vi.mock('firebase/auth', () => ({
  initializeAuth: (...args: unknown[]) => h.initializeAuth(...args),
  browserLocalPersistence: {},
  browserPopupRedirectResolver: {},
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: class {
    static credential = vi.fn();
    static credentialFromResult = vi.fn();
    addScope = vi.fn();
  },
  signOut: (...args: unknown[]) => h.signOut(...args),
  onAuthStateChanged: (...args: unknown[]) => h.onAuthStateChanged(...args),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: (...args: unknown[]) => h.getFirestore(...args),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDocFromServer: (...args: unknown[]) => h.getDocFromServer(...args),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capawesome/capacitor-google-sign-in', () => ({
  GoogleSignIn: { initialize: vi.fn(), signIn: vi.fn() },
}));

// Import after mocks are registered.
import * as firebase from './firebase';

describe('firebase config and pure helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('config resolution', () => {
    it('should initialize the app with resolved configuration values', () => {
      expect(h.capture.appConfig).toBeDefined();
      expect(h.capture.appConfig!.projectId).toBeTruthy();
      expect(h.capture.appConfig!.apiKey).toBeTruthy();
      expect(h.capture.appConfig!.authDomain).toContain('.firebaseapp.com');
      expect(h.capture.appConfig!.appId).toContain(':web:');
    });

    it('should use the default Firestore instance when the database id is "(default)"', () => {
      // The config file declares firestoreDatabaseId "(default)", so getFirestore
      // is called with only the app argument (no explicit database id).
      expect(h.capture.firestoreCallArgs.length).toBeGreaterThan(0);
      expect(h.capture.firestoreCallArgs[0]).toEqual([{ name: 'test-app' }]);
    });
  });

  describe('normalizeSpaceId', () => {
    it('should return a shared-space fallback for empty input', () => {
      expect(firebase.normalizeSpaceId('')).toBe('espacio_compartido');
    });

    it('should lowercase, trim, and prefix a plain identifier', () => {
      expect(firebase.normalizeSpaceId('  MiHogarFeliz ')).toBe(
        'espacio_mihogarfeliz'
      );
    });

    it('should collapse whitespace and slashes into underscores', () => {
      expect(firebase.normalizeSpaceId('mi hogar/feliz')).toBe(
        'espacio_mi_hogar_feliz'
      );
    });

    it('should preserve an already-prefixed id while stripping punctuation', () => {
      expect(firebase.normalizeSpaceId('espacio_mi.hogar.feliz')).toBe(
        'espacio_mihogarfeliz'
      );
    });

    it('should strip non-alphanumeric characters from plain ids', () => {
      expect(firebase.normalizeSpaceId('mi.hogar.feliz')).toBe(
        'espacio_mihogarfeliz'
      );
    });

    it('should fall back to shared space when only punctuation remains', () => {
      expect(firebase.normalizeSpaceId('***')).toBe('espacio_compartido');
      expect(firebase.normalizeSpaceId('espacio_***')).toBe(
        'espacio_compartido'
      );
    });
  });

  describe('generateUniqueSpaceCode', () => {
    it('should produce codes with the ESP- prefix and a six-character suffix', () => {
      const code = firebase.generateUniqueSpaceCode();
      expect(code).toMatch(/^ESP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    });

    it('should avoid ambiguous characters (no I, O, 0, 1)', () => {
      const codes = Array.from({ length: 50 }, () =>
        firebase.generateUniqueSpaceCode()
      );
      for (const code of codes) {
        const suffix = code.slice(4);
        expect(suffix).not.toMatch(/[IO01]/);
      }
    });

    it('should generate distinct codes across repeated calls', () => {
      const set = new Set(
        Array.from({ length: 20 }, () => firebase.generateUniqueSpaceCode())
      );
      // Collisions are astronomically unlikely; expect near-total uniqueness.
      expect(set.size).toBeGreaterThan(15);
    });
  });

  describe('access token cache', () => {
    it('should return null when no token has been cached or stored', () => {
      firebase.setAccessToken('');
      expect(firebase.getCachedAccessToken()).toBeFalsy();
    });

    it('should return the token after setAccessToken is called', async () => {
      firebase.setAccessToken('token-abc');
      expect(firebase.getCachedAccessToken()).toBe('token-abc');
      await expect(firebase.getAccessToken()).resolves.toBe('token-abc');
    });

    it('should clear the cached token on logout', async () => {
      firebase.setAccessToken('token-xyz');
      await firebase.logout();
      expect(h.signOut).toHaveBeenCalled();
      expect(firebase.getCachedAccessToken()).toBeNull();
    });
  });
});
