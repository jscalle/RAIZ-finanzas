import React from 'react';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';

// Shared, mutable test harness created inside vi.hoisted so it exists before the
// mocked ./lib/firebase and ./lib/gmail factories (and the App import) run.
// Everything here survives the vitest `mockReset` between tests because it is
// plain data / closures, not vi.fn instances — mirroring the reasoning in
// src/App.test.tsx. The firebase mock in that file keeps the app SIGNED OUT;
// this file instead drives the SIGNED-IN + cloud-sync experience deterministically.
const H = vi.hoisted(() => {
  // jsdom does not expose localStorage/sessionStorage; install an in-memory
  // polyfill before App's useState initializers read them at first render.
  const makeStore = () => {
    const store = new Map<string, string>();
    return {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    };
  };
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    if (typeof (globalThis as Record<string, unknown>)[name] === 'undefined') {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: makeStore(),
      });
    }
  }

  const fakeUser = {
    uid: 'uid_test',
    email: 'tester@demo.com',
    displayName: 'Tester',
  };

  // Cloud fixtures returned by the subscription mock, keyed by subcollection.
  // Amounts are distinctive so their formatted strings cannot collide with the
  // seed data (initialData) that briefly loads before sync overrides it.
  const cloudFixtures: Record<string, unknown[]> = {
    topics: [
      {
        id: 'topic_salario',
        name: 'Salario',
        type: 'INCOME',
        icon: 'Briefcase',
        color: '#0f0',
      },
      {
        id: 'topic_comida',
        name: 'Comida',
        type: 'EXPENSE',
        icon: 'Utensils',
        color: '#f00',
      },
    ],
    incomes: [
      {
        id: 'inc_cloud',
        description: 'Sueldo Nube',
        amount: 4321,
        topicId: 'topic_salario',
        date: '2026-08-05',
        confirmed: true,
        method: 'DIGITAL',
      },
    ],
    expenses: [
      {
        id: 'exp_cloud',
        description: 'Mercado Nube',
        amount: 1234,
        topicId: 'topic_comida',
        date: '2026-08-10',
        source: 'INGRESOS',
        confirmed: true,
        paymentMethod: 'DEBITO',
      },
    ],
    goals: [],
    contributions: [],
    withdrawals: [],
  };

  // Per-test control knobs (reset in beforeEach).
  const control = {
    autoSignIn: true,
    token: 'gtoken-123' as string | null,
    pendingRequests: [] as unknown[],
    // The uid-derived default space resolveDefaultSpaceId reports (S8).
    personalSpaceId: 'espacio_u_uid_test',
    // Space ids whose load fails with permission-denied (S9).
    deniedSpaces: new Set<string>(),
    // Error thrown by every cloud document write, if any (S9).
    saveError: null as unknown,
    // Contract C1 answer of POST /api/spaces/request-access.
    requestAccessResult: {} as Record<string, unknown>,
  };

  const permissionDenied = () =>
    Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });

  // Live listeners App opens on a space doc, keyed by document path.
  const spaceListeners = new Map<
    string,
    { next: (snap: unknown) => void; error?: (err: unknown) => void }
  >();

  // Explicit call spies that survive mockReset (plain counters/args).
  const spy = {
    emailSignIn: [] as unknown[][],
    emailSignUp: [] as unknown[][],
    logout: 0,
    googleGmailSignIn: 0,
    requestAccess: [] as unknown[][],
    approve: [] as unknown[][],
    cancel: [] as unknown[][],
    fetchEmails: 0,
  };

  return {
    fakeUser,
    cloudFixtures,
    control,
    spy,
    permissionDenied,
    spaceListeners,
  };
});

vi.mock('./lib/firebase', () => ({
  // initAuth fires its success callback synchronously when autoSignIn is on,
  // pushing the app straight into the authenticated state (user + syncEnabled).
  // Otherwise it reports "no user" through the failure callback, like the real
  // onAuthStateChanged(null) path, which ends App's auth-loading state.
  initAuth: (
    onSuccess?: (user: unknown, token: string | null) => void,
    onFailure?: () => void
  ) => {
    if (H.control.autoSignIn) {
      onSuccess?.(H.fakeUser, H.control.token);
    } else {
      onFailure?.();
    }
    return () => {};
  },
  googleSignIn: async () => ({ user: H.fakeUser, accessToken: 'g-access' }),
  googleGmailSignIn: async () => {
    H.spy.googleGmailSignIn += 1;
    return { user: H.fakeUser, accessToken: 'gmail-access' };
  },
  emailSignIn: async (email: string, pass: string) => {
    H.spy.emailSignIn.push([email, pass]);
    return H.fakeUser;
  },
  emailSignUp: async (email: string, pass: string) => {
    H.spy.emailSignUp.push([email, pass]);
    return H.fakeUser;
  },
  logout: async () => {
    H.spy.logout += 1;
  },
  resolveDefaultSpaceId: async () => H.control.personalSpaceId,
  isPermissionDenied: (err: unknown) =>
    (err as { code?: string } | null)?.code === 'permission-denied',
  // Echoes the requested name so spaceInfo.name is assertable in the UI.
  getOrCreateSpace: async (id: string, name: string) => {
    if (H.control.deniedSpaces.has(id)) throw H.permissionDenied();
    return {
      id,
      name: name || id,
      ownerUid: H.fakeUser.uid,
      ownerEmail: H.fakeUser.email,
      members: [H.fakeUser.uid],
      startingSavings: 0,
      code: 'ESP-TEST0000',
    };
  },
  updateSpaceSavings: async () => {},
  saveSpaceDocument: async () => {
    if (H.control.saveError) throw H.control.saveError;
  },
  deleteSpaceDocument: async () => {},
  // Synchronously feeds the matching cloud fixture into App's entity state.
  syncSpaceSubcollection: (
    _spaceId: string,
    subcol: string,
    cb: (items: unknown[]) => void
  ) => {
    cb(H.cloudFixtures[subcol] ?? []);
    return () => {};
  },
  normalizeSpaceId: (raw: string) => raw,
  requestAccessToSpace: async (codeOrId: string) => {
    H.spy.requestAccess.push([codeOrId]);
    return H.control.requestAccessResult;
  },
  subscribeToPendingAccessRequests: (
    _spaceId: string,
    cb: (requests: unknown[]) => void
  ) => {
    cb(H.control.pendingRequests);
    return () => {};
  },
  subscribeToAccessRequestStatus: () => () => {},
  approveAccessRequest: async (spaceId: string, req: unknown) => {
    H.spy.approve.push([spaceId, req]);
  },
  rejectAccessRequest: async () => {},
  cancelAccessRequest: async (spaceId: string, requestId: string) => {
    H.spy.cancel.push([spaceId, requestId]);
  },
  syncTelegramDraftCard: async () => {},
  regenerateSpaceCode: async () => 'ESP-NEW000',
  removeSpaceMember: async () => {},
  // SpaceMembersList resolves member profiles for the active space.
  fetchSpaceMemberProfiles: async () => ({
    [H.fakeUser.uid]: {
      email: H.fakeUser.email,
      displayName: H.fakeUser.displayName,
    },
  }),
  readStoredToken: () => null,
  writeStoredToken: () => {},
  clearStoredToken: () => {},
  // Opaque handle: App only passes it to the mocked firebase/firestore below.
  db: { __mockDb: true },
}));

// App subscribes to the active space document directly through
// firebase/firestore (doc + onSnapshot on the mocked `db`). The listener only
// records its callbacks so a test can fire them; otherwise spaceInfo comes
// solely from the getOrCreateSpace fixture above.
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  onSnapshot: (
    ref: { path: string },
    next: (snap: unknown) => void,
    error?: (err: unknown) => void
  ) => {
    H.spaceListeners.set(ref.path, { next, error });
    return () => {};
  },
}));

vi.mock('./lib/gmail', () => ({
  fetchRecentBankEmails: async () => {
    H.spy.fetchEmails += 1;
    return [
      {
        id: 'gm_1',
        snippet: 'Compra aprobada',
        subject: 'Bancolombia: compra aprobada',
        from: 'Bancolombia <alerts@bancolombia.com>',
        date: '2026-08-01',
        body: 'Compra por $1.234',
      },
    ];
  },
  parseEmailMovement: async () => ({}),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capawesome/capacitor-google-sign-in', () => ({
  GoogleSignIn: { initialize: vi.fn(), signIn: vi.fn() },
}));

import App from './App';

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (!('IntersectionObserver' in window)) {
    class IO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error minimal polyfill for jsdom
    window.IntersectionObserver = IO;
  }
});

beforeEach(() => {
  localStorage.clear();
  // Restore default signed-in-by-default harness state between tests.
  H.control.autoSignIn = true;
  H.control.token = 'gtoken-123';
  H.control.pendingRequests = [];
  H.control.personalSpaceId = 'espacio_u_uid_test';
  H.control.deniedSpaces = new Set();
  H.control.saveError = null;
  H.control.requestAccessResult = {
    status: 'pending',
    spaceId: 'space_target',
    spaceName: 'Espacio Objetivo',
    requestId: 'req_1',
  };
  H.spaceListeners.clear();
  H.spy.cancel = [];
  H.spy.emailSignIn = [];
  H.spy.emailSignUp = [];
  H.spy.logout = 0;
  H.spy.googleGmailSignIn = 0;
  H.spy.requestAccess = [];
  H.spy.approve = [];
  H.spy.fetchEmails = 0;
});

/** Opens the "Nube y Compartir" (sync) section, waiting for it to mount. */
async function openSyncSettings() {
  fireEvent.click(screen.getByRole('button', { name: /Nube y Compartir/i }));
  return screen.findByText('Nube y Finanzas Compartidas');
}

/** Expands the collapsed "Usar correo y contraseña" form. */
function openEmailForm() {
  fireEvent.click(
    screen.getByRole('button', { name: /Usar correo y contraseña/i })
  );
}

describe('App signed-in + cloud sync', () => {
  it('renders the authenticated cloud state when initAuth reports a signed-in user', async () => {
    render(<App />);

    // The sidebar cloud card switches from "modo local" to the connected view,
    // proving initAuth -> onAuthSuccess flipped syncEnabled. A new user's
    // default space comes from resolveDefaultSpaceId (uid-derived, S8), never
    // from the email local part ("tester").
    await waitFor(() => {
      expect(screen.getByText(/Conectado al espacio/i)).toBeInTheDocument();
    });
    expect(await screen.findByText('espacio_u_uid_test')).toBeInTheDocument();
    expect(screen.queryByText('tester')).toBeNull();
    expect(screen.queryByText('Trabajando en modo local.')).toBeNull();
  });

  it('feeds cloud subscriptions into the dashboard totals', async () => {
    render(<App />);

    // syncSpaceSubcollection synchronously delivers the cloud incomes/expenses;
    // the dashboard hero/flow cards must reflect those synced amounts, not the
    // local seed data. Distinctive values guarantee the source is the cloud.
    await waitFor(() => {
      expect(screen.getAllByText('$4.321').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('$1.234').length).toBeGreaterThan(0);
  });

  it('shows the signed-in SyncPanel with the active space and connected email', async () => {
    render(<App />);
    await openSyncSettings();

    // SyncPanel's authenticated branch: connected email, 'Mi espacio' block and
    // the space name echoed back from getOrCreateSpace.
    expect(await screen.findByText('tester@demo.com')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Mi espacio' })
    ).toBeInTheDocument();
    expect(screen.getByText('Presupuesto de tester')).toBeInTheDocument();
  });

  it('logs out and returns to the signed-out local experience', async () => {
    render(<App />);
    await openSyncSettings();
    const logoutBtn = await screen.findByRole('button', {
      name: /Cerrar Sesión/i,
    });

    fireEvent.click(logoutBtn);

    // handleLogout calls the mocked firebase logout and resets sync state; the
    // panel reverts to the "Sin conexión" signed-out branch.
    await waitFor(() => expect(H.spy.logout).toBe(1));
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByText('Trabajando en modo local.')).toBeInTheDocument();
  });

  it('presents the mandatory Google login gate as the first contact when signed out and signs in with Google', async () => {
    H.control.autoSignIn = false; // start signed OUT
    render(<App />);

    expect(await screen.findByTestId('mandatory-login-gate')).toBeInTheDocument();
    expect(screen.getByText('Bienvenido a Raíz')).toBeInTheDocument();
    const googleBtn = screen.getByRole('button', {
      name: /Continuar con Google/i,
    });
    expect(
      screen.queryByRole('button', { name: /Usar correo y contraseña/i })
    ).toBeNull();

    fireEvent.click(googleBtn);

    await waitFor(() =>
      expect(screen.getByText(/Conectado al espacio/i)).toBeInTheDocument()
    );
    expect(await screen.findByText('espacio_u_uid_test')).toBeInTheDocument();
  });

  it('automatically registers an expense when an Android bank notification arrives', async () => {
    render(<App />);
    await openSyncSettings();

    const connectBtn = await screen.findByRole('button', {
      name: /Conectar Notificaciones en Android/i,
    });
    fireEvent.click(connectBtn);

    const simulateBtn = await screen.findByRole('button', {
      name: /Simular notificación bancaria/i,
    });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      expect(
        screen.queryByText(/Automatización Android Activa/i)
      ).toBeInTheDocument();
    });
  });

  it('does not offer Gmail Sync in the sidebar nor in the mobile more menu', async () => {
    render(<App />);

    // Desktop sidebar: the Gmail Sync entry was removed from navigation.
    expect(
      screen.queryByRole('button', { name: /Gmail Sync/i })
    ).not.toBeInTheDocument();

    // Mobile "Más" sheet: opening it lists settings and actions, never Gmail.
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    expect(await screen.findByText('Acciones')).toBeInTheDocument();
    expect(screen.queryByText(/Gmail Sync/i)).not.toBeInTheDocument();
  });

  it('groups the navigation into money views and settings sections', async () => {
    render(<App />);

    // Sidebar section headings.
    expect(screen.getByText('Mi dinero')).toBeInTheDocument();
    expect(screen.getByText('Ajustes')).toBeInTheDocument();

    // The mobile sheet mirrors the settings grouping and adds an actions group.
    fireEvent.click(screen.getByRole('button', { name: 'Más' }));
    expect(await screen.findByText('Acciones')).toBeInTheDocument();
    expect(screen.getAllByText('Ajustes')).toHaveLength(2);
  });

  it('requests access to another space and shows the pending-request state', async () => {
    render(<App />);
    await openSyncSettings();

    fireEvent.change(screen.getByPlaceholderText('ESP-XXXXXXXX'), {
      target: { value: 'ESP-TARGET' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Solicitar acceso/i }));

    // handleRequestJoinSpace -> requestAccessToSpace returns 'pending', which
    // surfaces the "Solicitud enviada" waiting card with the target space name.
    await waitFor(() => expect(H.spy.requestAccess.length).toBe(1));
    expect(H.spy.requestAccess[0][0]).toBe('ESP-TARGET');
    expect(await screen.findByText('Solicitud enviada')).toBeInTheDocument();
    expect(screen.getByText('Espacio Objetivo')).toBeInTheDocument();
  });

  it('approves a pending host access request from the notification banner', async () => {
    H.control.pendingRequests = [
      {
        id: 'req_host_1',
        spaceId: 'tester',
        spaceName: 'tester',
        requesterUid: 'uid_other',
        requesterEmail: 'other@demo.com',
        requesterName: 'Other User',
        status: 'pending',
        createdAt: '2026-08-01',
      },
    ];
    render(<App />);

    // The sticky host banner appears for incoming requests; approving it runs
    // the mocked approveAccessRequest with the current space id.
    const banner = await screen.findByText(/Solicitud de acceso a tu Espacio/i);
    const bannerRoot = banner.closest('div.absolute') as HTMLElement;
    fireEvent.click(
      within(bannerRoot).getByRole('button', { name: /Aceptar/i })
    );

    await waitFor(() => expect(H.spy.approve.length).toBe(1));
    expect(H.spy.approve[0][0]).toBe('espacio_u_uid_test');
  });

  it('keeps a returning user on its stored space (S8)', async () => {
    localStorage.setItem('p_current_space_id', 'espacio_tester');
    render(<App />);

    expect(await screen.findByText('espacio_tester')).toBeInTheDocument();
  });

  it('joins directly when the backend reports the caller is already a member (C1)', async () => {
    H.control.requestAccessResult = {
      status: 'member',
      spaceId: 'espacio_compartido',
      spaceName: 'Compartido',
    };
    render(<App />);
    await openSyncSettings();

    fireEvent.change(screen.getByPlaceholderText('ESP-XXXXXXXX'), {
      target: { value: 'ESP-COMPARTI' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Solicitar acceso/i }));

    await waitFor(() =>
      expect(screen.getAllByText('espacio_compartido').length).toBeGreaterThan(
        0
      )
    );
    expect(screen.queryByText('Solicitud enviada')).toBeNull();
  });

  it('opens its own default space from the "Volver a mi espacio" strip without asking the backend', async () => {
    localStorage.setItem('p_current_space_id', 'espacio_compartido');
    render(<App />);
    await openSyncSettings();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Volver a mi espacio' })
    );

    await waitFor(() =>
      expect(localStorage.getItem('p_current_space_id')).toBe(
        'espacio_u_uid_test'
      )
    );
    expect(H.spy.requestAccess).toEqual([]);
  });

  it('cancels its own pending request without deciding it', async () => {
    render(<App />);
    await openSyncSettings();
    fireEvent.change(screen.getByPlaceholderText('ESP-XXXXXXXX'), {
      target: { value: 'ESP-TARGET' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Solicitar acceso/i }));
    await screen.findByText('Solicitud enviada');

    fireEvent.click(
      screen.getByRole('button', { name: /Cancelar solicitud/i })
    );

    await waitFor(() =>
      expect(H.spy.cancel).toEqual([['space_target', 'req_1']])
    );
  });

  it('falls back to the personal space with a visible message when the stored space denies access (S9)', async () => {
    localStorage.setItem('p_current_space_id', 'espacio_ajeno');
    H.control.deniedSpaces = new Set(['espacio_ajeno']);
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No tienes acceso al espacio "espacio_ajeno"/
    );
    expect(await screen.findByText('espacio_u_uid_test')).toBeInTheDocument();
    expect(localStorage.getItem('p_current_space_id')).toBe(
      'espacio_u_uid_test'
    );
  });

  it('switches to the personal space when the live space listener is denied after revocation (S9)', async () => {
    localStorage.setItem('p_current_space_id', 'espacio_compartido');
    render(<App />);
    await openSyncSettings();
    // The "Volver a mi espacio" strip shows once the default space is resolved.
    expect(
      await screen.findByRole('button', { name: 'Volver a mi espacio' })
    ).toBeInTheDocument();

    act(() => {
      H.spaceListeners
        .get('spaces/espacio_compartido')!
        .error?.(H.permissionDenied());
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/revocado/);
    await waitFor(() =>
      expect(localStorage.getItem('p_current_space_id')).toBe(
        'espacio_u_uid_test'
      )
    );
  });

  it('surfaces queued records dropped for lack of permission instead of reporting them synced (S9)', async () => {
    localStorage.setItem(
      'sync_queue_espacio_u_uid_test',
      JSON.stringify([
        {
          id: 'exp_queued',
          subcol: 'expenses',
          action: 'save',
          data: { id: 'exp_queued' },
          timestamp: 1,
        },
      ])
    );
    H.control.saveError = H.permissionDenied();
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no tienes permiso/i
    );
    expect(
      JSON.parse(localStorage.getItem('sync_queue_espacio_u_uid_test')!)
    ).toEqual([]);
  });
});
