import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

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
  getDocsFromServer: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  writeBatch: vi.fn(),
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
    it('should produce codes with the ESP- prefix and an eight-character suffix', () => {
      const code = firebase.generateUniqueSpaceCode();
      expect(code).toMatch(/^ESP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    });

    it('should draw the code from crypto.getRandomValues, not Math.random', () => {
      const cryptoSpy = vi.spyOn(globalThis.crypto, 'getRandomValues');
      const mathSpy = vi.spyOn(Math, 'random');
      firebase.generateUniqueSpaceCode();
      expect(cryptoSpy).toHaveBeenCalled();
      expect(mathSpy).not.toHaveBeenCalled();
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

describe('authenticated Telegram backend calls', () => {
  const ID_TOKEN = 'firebase-id-token-123';
  const authWithUser = firebase.auth as unknown as {
    currentUser: { uid: string; getIdToken: () => Promise<string> } | null;
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Owner decisions record the signed-in owner's uid (contract C2).
    authWithUser.currentUser = {
      uid: 'owner-uid',
      getIdToken: async () => ID_TOKEN,
    };
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    authWithUser.currentUser = null;
    vi.unstubAllGlobals();
  });

  it('asks the backend to approve a Telegram request with the owner ID token before marking it approved', async () => {
    await firebase.approveAccessRequest('espacio_familia', {
      id: 'req_tg_123',
      spaceId: 'espacio_familia',
      spaceName: 'Familia',
      requesterUid: 'tg:123',
      requesterEmail: 'Telegram ID: 123',
      status: 'pending',
      createdAt: '2026-11-01T00:00:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/telegram\/notify-access$/);
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${ID_TOKEN}`,
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      spaceId: 'espacio_familia',
      chatId: 'tg:123',
      status: 'approved',
    });
    // The backend only accepts a still-pending request, so it must be called
    // before the client writes status: 'approved'.
    const firstStatusWrite = vi
      .mocked(updateDoc)
      .mock.calls.findIndex(
        ([, data]) => (data as { status?: string }).status === 'approved'
      );
    expect(firstStatusWrite).toBeGreaterThanOrEqual(0);
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(updateDoc).mock.invocationCallOrder[firstStatusWrite]
    );
  });

  it('asks the backend to revoke a Telegram member with the owner ID token before removing it', async () => {
    await firebase.removeSpaceMember('espacio_familia', 'tg:123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/telegram\/notify-access$/);
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${ID_TOKEN}`,
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      spaceId: 'espacio_familia',
      chatId: '123',
      status: 'revoked',
    });
    expect(vi.mocked(updateDoc)).toHaveBeenCalled();
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(updateDoc).mock.invocationCallOrder[0]
    );
  });

  it('syncs a Telegram draft card with the caller ID token', async () => {
    await firebase.syncTelegramDraftCard({
      spaceId: 'espacio_familia',
      draftId: 'tg_abc_0',
      chatId: 123,
      messageId: 456,
      action: 'APPROVED',
      description: 'Mercado',
      amount: 45000,
      category: 'Alimentación',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/telegram\/sync-draft$/);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${ID_TOKEN}`,
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      chatId: 123,
      messageId: 456,
      action: 'APPROVED',
    });
  });
});

describe('space isolation client (S7-S10, contract C1/C2)', () => {
  const ME = 'UidAbc123';
  const ID_TOKEN = 'firebase-id-token-456';
  const authWithUser = firebase.auth as unknown as {
    currentUser: {
      uid: string;
      email: string;
      getIdToken: () => Promise<string>;
    } | null;
  };
  let fetchMock: ReturnType<typeof vi.fn>;
  // Writes of committed batches only (an uncommitted batch writes nothing).
  let batchOps: Array<[string, unknown]>;

  const permissionDenied = () =>
    Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
  const pathOf = (ref: unknown) => (ref as { path: string }).path;

  // Every document write, whether issued with updateDoc or in a batch.
  const writes = (): Array<[string, unknown]> => [
    ...vi
      .mocked(updateDoc)
      .mock.calls.map(
        ([ref, data]) => [pathOf(ref), data] as [string, unknown]
      ),
    ...batchOps,
  ];
  const writeTo = (path: string) =>
    writes().find(([p]) => p === path)?.[1] as
      Record<string, unknown> | undefined;

  beforeEach(() => {
    authWithUser.currentUser = {
      uid: ME,
      email: 'ana@example.com',
      getIdToken: async () => ID_TOKEN,
    };
    fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    batchOps = [];
    vi.mocked(doc).mockImplementation(((
      _db: unknown,
      ...segments: string[]
    ) => ({
      path: segments.join('/'),
    })) as unknown as typeof doc);
    vi.mocked(collection).mockImplementation(((
      _db: unknown,
      ...segments: string[]
    ) => ({ path: segments.join('/') })) as unknown as typeof collection);
    vi.mocked(arrayUnion).mockImplementation(((...values: unknown[]) => ({
      arrayUnion: values,
    })) as unknown as typeof arrayUnion);
    vi.mocked(arrayRemove).mockImplementation(((...values: unknown[]) => ({
      arrayRemove: values,
    })) as unknown as typeof arrayRemove);
    vi.mocked(writeBatch).mockImplementation((() => {
      const pending: Array<[string, unknown]> = [];
      const batch = {
        update: (ref: unknown, data: unknown) => {
          pending.push([pathOf(ref), data]);
          return batch;
        },
        set: (ref: unknown, data: unknown) => {
          pending.push([pathOf(ref), data]);
          return batch;
        },
        commit: async () => {
          batchOps.push(...pending);
        },
      };
      return batch;
    }) as unknown as typeof writeBatch);
  });

  afterEach(() => {
    authWithUser.currentUser = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('requestAccessToSpace (S7, contract C1)', () => {
    it('asks the backend with the caller ID token and tracks its own pending request', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'pending',
          spaceId: 'espacio_familia',
          spaceName: 'Familia',
        }),
      });

      const res = await firebase.requestAccessToSpace('  ESP-ABCDEFGH ');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/spaces\/request-access$/);
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Authorization: `Bearer ${ID_TOKEN}`,
      });
      expect(JSON.parse(String(init.body))).toEqual({ code: 'ESP-ABCDEFGH' });
      expect(res).toEqual({
        status: 'pending',
        spaceId: 'espacio_familia',
        spaceName: 'Familia',
        requestId: `req_${ME}`,
      });
      // Non-members can no longer read spaces nor write requests directly.
      expect(getDocs).not.toHaveBeenCalled();
      expect(getDoc).not.toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('reports a caller that is already a member without a request', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'member',
          spaceId: 'espacio_familia',
          spaceName: 'Familia',
        }),
      });

      await expect(
        firebase.requestAccessToSpace('ESP-ABCDEFGH')
      ).resolves.toEqual({
        status: 'member',
        spaceId: 'espacio_familia',
        spaceName: 'Familia',
      });
    });

    it('explains in Spanish that an unknown code was not found (404)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'not_found' }),
      });

      await expect(
        firebase.requestAccessToSpace('ESP-NOPE0000')
      ).rejects.toThrow(
        'El código o ID de espacio "ESP-NOPE0000" no fue encontrado. Verifica la información.'
      );
    });
  });

  describe('resolveDefaultSpaceId (S8)', () => {
    it('derives a new user default space from the uid, never the email, and remembers it', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
      } as never);
      vi.mocked(getDocsFromServer).mockResolvedValue({
        empty: true,
        docs: [],
      } as never);

      const id = await firebase.resolveDefaultSpaceId({
        uid: ME,
        email: 'ana@example.com',
      });

      expect(id).toBe('espacio_u_uidabc123');
      expect(firebase.normalizeSpaceId(id)).toBe(id);
      expect(setDoc).toHaveBeenCalledWith(
        { path: `users/${ME}` },
        { defaultSpaceId: 'espacio_u_uidabc123' },
        { merge: true }
      );
    });

    it('keeps the remembered default space', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ defaultSpaceId: 'espacio_ana' }),
      } as never);

      await expect(
        firebase.resolveDefaultSpaceId({ uid: ME, email: 'ana@example.com' })
      ).resolves.toBe('espacio_ana');
      expect(getDocsFromServer).not.toHaveBeenCalled();
    });

    it('keeps an existing owner on its legacy email-based space', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
      vi.mocked(getDocsFromServer).mockResolvedValue({
        empty: false,
        docs: [{ id: 'espacio_viaje' }, { id: 'espacio_ana' }],
      } as never);

      await expect(
        firebase.resolveDefaultSpaceId({ uid: ME, email: 'ana@example.com' })
      ).resolves.toBe('espacio_ana');
      expect(setDoc).toHaveBeenCalledWith(
        { path: `users/${ME}` },
        { defaultSpaceId: 'espacio_ana' },
        { merge: true }
      );
    });

    it('fails instead of guessing when the owned-space lookup fails', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
      vi.mocked(getDocsFromServer).mockRejectedValue(
        Object.assign(new Error('offline'), { code: 'unavailable' })
      );

      await expect(
        firebase.resolveDefaultSpaceId({ uid: ME, email: 'ana@example.com' })
      ).rejects.toThrow();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('rejects without remembering anything when the remembered-space read fails offline', async () => {
      vi.mocked(getDoc).mockRejectedValue(
        Object.assign(new Error('offline'), { code: 'unavailable' })
      );

      await expect(
        firebase.resolveDefaultSpaceId({ uid: ME, email: 'ana@example.com' })
      ).rejects.toThrow();
      expect(getDocsFromServer).not.toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('looks up owned spaces on the server, never in the local cache', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
      // The cache would be empty offline; only the server knows the legacy space.
      vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as never);
      vi.mocked(getDocsFromServer).mockResolvedValue({
        empty: false,
        docs: [{ id: 'espacio_ana' }],
      } as never);

      await expect(
        firebase.resolveDefaultSpaceId({ uid: ME, email: 'ana@example.com' })
      ).resolves.toBe('espacio_ana');
      expect(getDocs).not.toHaveBeenCalled();
    });
  });

  describe('getOrCreateSpace and saveSpaceDocument (S9)', () => {
    it('rejects on permission-denied instead of returning a fallback space', async () => {
      vi.mocked(getDoc).mockRejectedValue(permissionDenied());

      await expect(
        firebase.getOrCreateSpace('espacio_ajeno', '', ME, 'ana@example.com')
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('rejects when creating the space fails', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
      vi.mocked(setDoc).mockRejectedValue(permissionDenied());

      await expect(
        firebase.getOrCreateSpace(
          'espacio_u_uidabc123',
          '',
          ME,
          'ana@example.com'
        )
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });

    it('creates a missing space owned by the caller as its only member', async () => {
      vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
      vi.mocked(setDoc).mockResolvedValue(undefined);

      const space = await firebase.getOrCreateSpace(
        'espacio_u_uidabc123',
        'Presupuesto de ana',
        ME,
        'ana@example.com'
      );

      expect(space).toMatchObject({
        id: 'espacio_u_uidabc123',
        ownerUid: ME,
        members: [ME],
        name: 'Presupuesto de ana',
      });
      expect(space.code).toMatch(/^ESP-[A-Z2-9]{8}$/);
      expect(setDoc).toHaveBeenCalledWith(
        { path: 'spaces/espacio_u_uidabc123' },
        space
      );
    });

    it('never adds the caller to an existing space members', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          id: 'espacio_familia',
          code: 'ESP-ABCDEFGH',
          name: 'Familia',
          ownerUid: 'owner',
          members: ['owner'],
          startingSavings: 0,
        }),
      } as never);

      await firebase.getOrCreateSpace(
        'espacio_familia',
        '',
        ME,
        'ana@example.com'
      );

      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('keeps the offline fallback when Firestore is unreachable', async () => {
      vi.mocked(getDoc).mockRejectedValue(
        Object.assign(new Error('offline'), { code: 'unavailable' })
      );

      await expect(
        firebase.getOrCreateSpace('espacio_ana', 'Ana', ME, 'ana@example.com')
      ).resolves.toMatchObject({ id: 'espacio_ana', code: 'ESP-LOCAL' });
    });

    it('rejects a failed document write instead of swallowing it', async () => {
      vi.mocked(setDoc).mockRejectedValue(permissionDenied());

      await expect(
        firebase.saveSpaceDocument('espacio_ana', 'expenses', 'exp_1', {
          id: 'exp_1',
        })
      ).rejects.toMatchObject({ code: 'permission-denied' });
    });
  });

  describe('owner decisions carry decidedBy (contract C2)', () => {
    const webRequest = {
      id: 'req_bob',
      spaceId: 'espacio_familia',
      spaceName: 'Familia',
      requesterUid: 'bob',
      requesterEmail: 'bob@example.com',
      status: 'pending' as const,
      createdAt: '2026-11-01T00:00:00.000Z',
    };

    it('approves a web request with decidedBy and adds only the uid to members', async () => {
      await firebase.approveAccessRequest('espacio_familia', webRequest);

      expect(writeTo('spaces/espacio_familia/access_requests/req_bob')).toEqual(
        {
          status: 'approved',
          decidedBy: ME,
          decidedAt: expect.any(String),
        }
      );
      expect(writeTo('spaces/espacio_familia')).toEqual({
        members: { arrayUnion: ['bob'] },
      });
    });

    it('rejects a request with decidedBy', async () => {
      await firebase.rejectAccessRequest('espacio_familia', 'req_bob');

      expect(writeTo('spaces/espacio_familia/access_requests/req_bob')).toEqual(
        {
          status: 'rejected',
          decidedBy: ME,
          decidedAt: expect.any(String),
        }
      );
    });

    it('revokes a web member by uid and legacy email and marks its request revoked', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({ ...webRequest, status: 'approved' }),
      } as never);

      await firebase.removeSpaceMember('espacio_familia', 'bob');

      expect(writeTo('spaces/espacio_familia')).toEqual({
        members: { arrayRemove: ['bob', 'bob@example.com'] },
      });
      expect(writeTo('spaces/espacio_familia/access_requests/req_bob')).toEqual(
        {
          status: 'revoked',
          decidedBy: ME,
          decidedAt: expect.any(String),
        }
      );
    });

    it('lets the requester cancel its own pending request without deciding it', async () => {
      await firebase.cancelAccessRequest('espacio_familia', `req_${ME}`);

      expect(
        writeTo(`spaces/espacio_familia/access_requests/req_${ME}`)
      ).toEqual({
        status: 'cancelled',
        cancelledAt: expect.any(String),
      });
    });
  });

  describe('pending access requests (owner banner)', () => {
    it('normalizes backend-created requests and keeps only pending ones', () => {
      vi.mocked(onSnapshot).mockImplementation(((
        _ref: unknown,
        next: (snap: unknown) => void
      ) => {
        next({
          forEach: (cb: (d: unknown) => void) =>
            [
              {
                id: 'req_bob',
                data: () => ({
                  userId: 'bob',
                  email: 'bob@example.com',
                  displayName: 'Bob',
                  status: 'pending',
                  type: 'web',
                  createdAt: '2026-11-01T00:00:00.000Z',
                }),
              },
              {
                id: 'req_tg_1',
                data: () => ({ status: 'approved', requesterUid: 'tg:1' }),
              },
            ].forEach(cb),
        });
        return () => {};
      }) as unknown as typeof onSnapshot);
      const onUpdate = vi.fn();

      firebase.subscribeToPendingAccessRequests('espacio_familia', onUpdate);

      expect(onUpdate).toHaveBeenCalledWith([
        expect.objectContaining({
          id: 'req_bob',
          spaceId: 'espacio_familia',
          requesterUid: 'bob',
          requesterEmail: 'bob@example.com',
          requesterName: 'Bob',
          status: 'pending',
        }),
      ]);
    });
  });

  describe('Telegram backend calls (S10)', () => {
    it('does not hang an approval when notify-access never answers', async () => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' })
              )
            );
          })
      );

      const approval = firebase
        .approveAccessRequest('espacio_familia', {
          id: 'req_tg_123',
          spaceId: 'espacio_familia',
          spaceName: 'Familia',
          requesterUid: 'tg:123',
          requesterEmail: 'Telegram ID: 123',
          status: 'pending',
          createdAt: '2026-11-01T00:00:00.000Z',
        })
        .then(() => 'settled');
      const deadline = new Promise((resolve) =>
        setTimeout(() => resolve('hung'), 9000)
      );

      await vi.advanceTimersByTimeAsync(9000);

      await expect(Promise.race([approval, deadline])).resolves.toBe('settled');
      expect(
        writeTo('spaces/espacio_familia/access_requests/req_tg_123')
      ).toMatchObject({ status: 'approved', decidedBy: ME });
    });

    it('logs a refused Telegram draft card sync', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await firebase.syncTelegramDraftCard({
        spaceId: 'espacio_familia',
        draftId: 'tg_abc_0',
        chatId: 123,
        messageId: 456,
        action: 'DISCARDED',
      });

      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/refused/i), 403);
    });
  });
});
