import React from 'react';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
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
  };

  // Explicit call spies that survive mockReset (plain counters/args).
  const spy = {
    emailSignIn: [] as unknown[][],
    emailSignUp: [] as unknown[][],
    logout: 0,
    googleGmailSignIn: 0,
    requestAccess: [] as unknown[][],
    approve: [] as unknown[][],
    fetchEmails: 0,
  };

  return { fakeUser, cloudFixtures, control, spy };
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
  // Echoes the requested name so spaceInfo.name is assertable in the UI.
  getOrCreateSpace: async (id: string, name: string) => ({
    id,
    name: name || id,
    ownerUid: H.fakeUser.uid,
    ownerEmail: H.fakeUser.email,
    members: [H.fakeUser.uid],
    startingSavings: 0,
    code: 'ESP-TEST00',
  }),
  updateSpaceSavings: async () => {},
  saveSpaceDocument: async () => {},
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
  requestAccessToSpace: async (codeOrId: string, requester: unknown) => {
    H.spy.requestAccess.push([codeOrId, requester]);
    return {
      status: 'pending',
      space: { id: 'space_target', name: 'Espacio Objetivo' },
      requestId: 'req_1',
    };
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
// firebase/firestore (doc + onSnapshot on the mocked `db`). Keep that listener
// inert so spaceInfo comes solely from the getOrCreateSpace fixture above.
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  onSnapshot: () => () => {},
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

describe('App signed-in + cloud sync', () => {
  it('renders the authenticated cloud state when initAuth reports a signed-in user', async () => {
    render(<App />);

    // The sidebar cloud card switches from "modo local" to the connected view,
    // proving initAuth -> onAuthSuccess flipped syncEnabled and a default space
    // id was derived from the user's email ("tester@demo.com" -> "tester").
    await waitFor(() => {
      expect(screen.getByText(/Conectado al espacio/i)).toBeInTheDocument();
    });
    expect(screen.getByText('tester')).toBeInTheDocument();
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

    // SyncPanel's authenticated branch: connected email, active-space badge and
    // the space name echoed back from getOrCreateSpace.
    expect(await screen.findByText('tester@demo.com')).toBeInTheDocument();
    expect(screen.getByText('ESPACIO ACTIVO EN NUBE')).toBeInTheDocument();
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

  it('signs in through the email form and enters the authenticated state', async () => {
    H.control.autoSignIn = false; // start signed OUT to exercise the form
    render(<App />);
    await openSyncSettings();

    // The signed-out branch renders the email/password form.
    fireEvent.change(screen.getByPlaceholderText('ejemplo@correo.com'), {
      target: { value: 'user@mail.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), {
      target: { value: 'secret1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    // The mocked emailSignIn is invoked with the trimmed credentials and the
    // app transitions to the connected experience.
    await waitFor(() =>
      expect(H.spy.emailSignIn).toEqual([['user@mail.com', 'secret1']])
    );
    expect(await screen.findByText('tester@demo.com')).toBeInTheDocument();
  });

  it('registers a new account through the email form', async () => {
    H.control.autoSignIn = false;
    render(<App />);
    await openSyncSettings();

    // Toggle the form into register mode, then submit.
    fireEvent.click(
      screen.getByRole('button', {
        name: /¿No tienes cuenta\? Regístrate gratis aquí/i,
      })
    );
    fireEvent.change(screen.getByPlaceholderText('ejemplo@correo.com'), {
      target: { value: 'new@mail.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Mínimo 6 caracteres'), {
      target: { value: 'pass123' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Registrarse e Iniciar Sesión/i })
    );

    await waitFor(() =>
      expect(H.spy.emailSignUp).toEqual([['new@mail.com', 'pass123']])
    );
    expect(await screen.findByText('tester@demo.com')).toBeInTheDocument();
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

    fireEvent.change(
      screen.getByPlaceholderText('ej. ESP-9K2F7M o espacio_hogar'),
      { target: { value: 'ESP-TARGET' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Solicitar Acceso al Espacio/i })
    );

    // handleRequestJoinSpace -> requestAccessToSpace returns 'pending', which
    // surfaces the "Solicitud Enviada" waiting card with the target space name.
    await waitFor(() => expect(H.spy.requestAccess.length).toBe(1));
    expect(H.spy.requestAccess[0][0]).toBe('ESP-TARGET');
    expect(await screen.findByText('Solicitud Enviada')).toBeInTheDocument();
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
    expect(H.spy.approve[0][0]).toBe('tester');
  });
});
