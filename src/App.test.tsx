import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// This jsdom runtime does not expose localStorage/sessionStorage by default, and
// App reads them in useState initializers at render time. Install an in-memory
// polyfill inside vi.hoisted so the store exists before the App import runs
// (hoisted blocks execute before imports), mirroring src/lib/firebase.test.ts.
vi.hoisted(() => {
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
});

// App.tsx (and its child components SyncPanel / GmailSyncTab) import
// ./lib/firebase and ./lib/gmail, which run network / native side effects at
// module load and require a real Firebase project. Both modules are mocked so
// importing App is inert and never touches Firebase, Gmail, or Capacitor. This
// mirrors the vi.mock strategy established in src/lib/firebase.test.ts.
//
// Functions are declared as plain closures (not vi.fn) on purpose: the vitest
// config enables mockReset, which would wipe a vi.fn implementation between
// tests and, for example, make initAuth return undefined — breaking the effect
// cleanup `return () => unsubAuth()`. Plain closures survive the reset and keep
// every render deterministic.
vi.mock('./lib/firebase', () => ({
  // initAuth never invokes its success callback, so the app stays signed out and
  // useProfileStorage runs its localStorage-backed path (syncEnabled = false).
  initAuth: () => () => {},
  googleSignIn: async () => null,
  googleGmailSignIn: async () => null,
  emailSignIn: async () => ({ uid: 'u', email: 'x@y.z' }),
  emailSignUp: async () => ({ uid: 'u', email: 'x@y.z' }),
  logout: async () => {},
  getOrCreateSpace: async (id: string) => ({
    id,
    name: id,
    ownerId: 'guest',
    members: [],
    startingSavings: 0,
    code: 'ESP-TEST00',
  }),
  updateSpaceSavings: async () => {},
  saveSpaceDocument: async () => {},
  deleteSpaceDocument: async () => {},
  syncSpaceSubcollection: () => () => {},
  normalizeSpaceId: (raw: string) => raw,
  requestAccessToSpace: async () => ({
    status: 'pending',
    spaceId: 's',
    spaceName: 's',
    requestId: 'r',
  }),
  resolveDefaultSpaceId: async () => 'espacio_u_u',
  isPermissionDenied: () => false,
  subscribeToAssistantThread: () => () => {},
  sendAssistantMessage: async () => ({ ok: true, messageId: 'm' }),
  cancelAccessRequest: async () => {},
  subscribeToPendingAccessRequests: () => () => {},
  subscribeToAccessRequestStatus: () => () => {},
  approveAccessRequest: async () => {},
  rejectAccessRequest: async () => {},
  syncTelegramDraftCard: async () => {},
  regenerateSpaceCode: async () => 'ESP-NEW000',
  readStoredToken: () => null,
  writeStoredToken: () => {},
  clearStoredToken: () => {},
}));

vi.mock('./lib/gmail', () => ({
  fetchRecentBankEmails: async () => [],
  parseEmailMovement: async () => ({}),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('@capawesome/capacitor-google-sign-in', () => ({
  GoogleSignIn: { initialize: vi.fn(), signIn: vi.fn() },
}));

// Import after mocks are registered.
import App from './App';

// motion/react and some child components probe browser-only APIs that jsdom does
// not implement. Provide inert polyfills so rendering never throws.
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
});

/** Seeds the localStorage keys that useProfileStorage reads at first render. */
function seedProfile(opts: {
  incomes?: unknown[];
  expenses?: unknown[];
  contributions?: unknown[];
  withdrawals?: unknown[];
  goals?: unknown[];
  topics?: unknown[];
  startingSavings?: number;
  activeMonth?: string;
  privacyMode?: 'real' | 'masked' | 'scaled';
}) {
  if (opts.incomes)
    localStorage.setItem('p_incomes_default', JSON.stringify(opts.incomes));
  if (opts.expenses)
    localStorage.setItem('p_expenses_default', JSON.stringify(opts.expenses));
  if (opts.contributions)
    localStorage.setItem(
      'p_contributions_default',
      JSON.stringify(opts.contributions)
    );
  if (opts.withdrawals)
    localStorage.setItem(
      'p_withdrawals_default',
      JSON.stringify(opts.withdrawals)
    );
  if (opts.goals)
    localStorage.setItem('p_goals_default', JSON.stringify(opts.goals));
  if (opts.topics)
    localStorage.setItem('p_topics_default', JSON.stringify(opts.topics));
  if (opts.startingSavings !== undefined)
    localStorage.setItem(
      'p_starting_savings_default',
      String(opts.startingSavings)
    );
  if (opts.activeMonth)
    localStorage.setItem('p_active_month', opts.activeMonth);
  if (opts.privacyMode)
    localStorage.setItem('p_privacy_mode', opts.privacyMode);
}

const expenseTopic = {
  id: 'topic_comida',
  name: 'Comida',
  type: 'EXPENSE',
  icon: 'Utensils',
  color: '#f00',
};

describe('App integration', () => {
  it('renders the default (signed-out, local) dashboard without crashing', () => {
    render(<App />);
    // The dashboard is the default tab; its unique hero heading proves the real
    // App shell mounted and the DashboardSection rendered.
    expect(screen.getByText('Tu panorama financiero')).toBeInTheDocument();
    // Sidebar / mobile-header branding is always present (rendered in both).
    expect(screen.getAllByText('Raíz').length).toBeGreaterThan(0);
  });

  it('persists the local financial state to localStorage on first render', async () => {
    render(<App />);
    // useProfileStorage writes each collection to localStorage on mount while
    // cloud sync is disabled. This locks the offline persistence contract.
    await waitFor(() => {
      expect(localStorage.getItem('p_incomes_default')).not.toBeNull();
      expect(localStorage.getItem('p_expenses_default')).not.toBeNull();
      expect(localStorage.getItem('p_topics_default')).not.toBeNull();
    });
  });

  it('navigates between the main sections via the sidebar', async () => {
    render(<App />);
    expect(screen.getByText('Tu panorama financiero')).toBeInTheDocument();

    // "Gastos" exists in both the desktop sidebar and the mobile bottom nav;
    // either navigates to the expenses section.
    fireEvent.click(screen.getAllByRole('button', { name: /Gastos/i })[0]);
    expect(await screen.findByText('Control de Gastos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ingresos y Cajero/i }));
    expect(await screen.findByText('Gestión de Ingresos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Metas de Ahorro/i }));
    expect(
      await screen.findByText('Plan de Ahorros y Metas')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Nube y Compartir/i }));
    expect(
      await screen.findByText('Nube y Finanzas Compartidas')
    ).toBeInTheDocument();

    // Categorías is code-split (React.lazy + Suspense); findBy waits for the chunk.
    fireEvent.click(screen.getByRole('button', { name: /Categorías/i }));
    expect(
      await screen.findByText('Configuración de Tópicos')
    ).toBeInTheDocument();
  });

  it('opens the Asistente tab, which asks for the cloud while signed out', async () => {
    render(<App />);
    // Present in the desktop sidebar and in the mobile bottom nav.
    const buttons = screen.getAllByRole('button', { name: /Asistente/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(buttons[0]);
    expect(
      await screen.findByText(/Para usar el Asistente necesitas la nube/i)
    ).toBeInTheDocument();
    // The month navigator does not apply to the chat.
    expect(screen.queryByText('Ver Todo')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Ir a Nube y Compartir' })
    );
    expect(
      await screen.findByText('Nube y Finanzas Compartidas')
    ).toBeInTheDocument();
  });

  it('keeps Ingresos reachable from the mobile "Más" sheet', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Más$/i }));
    // Sidebar entry plus the one in the open sheet.
    const entries = await screen.findAllByRole('button', {
      name: /Ingresos y Cajero/i,
    });
    expect(entries.length).toBe(2);
    fireEvent.click(entries[1]);
    expect(await screen.findByText('Gestión de Ingresos')).toBeInTheDocument();
  });

  it('computes and displays dashboard totals from seeded local data', () => {
    // Deterministic August 2026 dataset: one confirmed digital income and one
    // confirmed digital expense drawn from incomes.
    seedProfile({
      activeMonth: '2026-08',
      startingSavings: 0,
      topics: [{ ...expenseTopic, monthlyLimit: 300 }],
      incomes: [
        {
          id: 'inc_a',
          description: 'Sueldo',
          amount: 1000,
          topicId: 'topic_salario',
          date: '2026-08-05',
          confirmed: true,
          method: 'DIGITAL',
        },
      ],
      expenses: [
        {
          id: 'exp_a',
          description: 'Mercado',
          amount: 400,
          topicId: 'topic_comida',
          date: '2026-08-10',
          source: 'INGRESOS',
          confirmed: true,
          paymentMethod: 'DEBITO',
        },
      ],
      contributions: [],
      withdrawals: [],
      goals: [],
    });

    render(<App />);

    // Monthly income flow ($1.000) and expense flow ($400) appear in the hero
    // and flow cards. The headline "available to spend" balance is
    // income - savings - planned limit - overspend = 1000 - 0 - 300 - 100 = 600.
    expect(screen.getAllByText('$1.000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$400').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$600').length).toBeGreaterThan(0);
  });

  it('masks currency values when privacy mode is active', () => {
    seedProfile({
      activeMonth: '2026-08',
      privacyMode: 'masked',
      startingSavings: 0,
      topics: [expenseTopic],
      incomes: [
        {
          id: 'inc_a',
          description: 'Sueldo',
          amount: 1000,
          topicId: 'topic_salario',
          date: '2026-08-05',
          confirmed: true,
          method: 'DIGITAL',
        },
      ],
      expenses: [],
      contributions: [],
      withdrawals: [],
      goals: [],
    });

    render(<App />);

    // formatCurrency returns the mask for every amount; the real figure is hidden.
    expect(screen.getAllByText('$ ••••••').length).toBeGreaterThan(0);
    expect(screen.queryByText('$1.000')).toBeNull();
  });

  it('updates the active month and persists it (period navigation)', async () => {
    seedProfile({ activeMonth: '2026-08' });
    render(<App />);

    // The default period label reflects August 2026 (es-ES, lowercased).
    expect(screen.getByText(/agosto de 2026/i)).toBeInTheDocument();

    // "Ver Todo" switches to the full-history view and persists it.
    fireEvent.click(screen.getByRole('button', { name: 'Ver Todo' }));
    expect(await screen.findByText('Todo el Historial')).toBeInTheDocument();
    expect(localStorage.getItem('p_active_month')).toBe('all');

    // "Volver al Mes" returns to the default month and persists it.
    fireEvent.click(screen.getByRole('button', { name: 'Volver al Mes' }));
    expect(await screen.findByText(/agosto de 2026/i)).toBeInTheDocument();
    expect(localStorage.getItem('p_active_month')).toBe('2026-08');
  });

  it('adds an expense through the real form and persists it to localStorage', async () => {
    seedProfile({
      activeMonth: '2026-08',
      startingSavings: 0,
      topics: [expenseTopic],
      incomes: [],
      expenses: [],
      contributions: [],
      withdrawals: [],
      goals: [],
    });

    render(<App />);

    // Go to the expenses section and open the add-expense modal.
    fireEvent.click(screen.getAllByRole('button', { name: /Gastos/i })[0]);
    expect(await screen.findByText('Control de Gastos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Registrar Gasto/i }));

    // Fill the required fields; topic/date/method carry sensible defaults.
    fireEvent.change(
      screen.getByPlaceholderText('ej. Compra supermercado, Pago de luz...'),
      { target: { value: 'Prueba Gasto' } }
    );
    fireEvent.change(screen.getByPlaceholderText('0.00'), {
      target: { value: '250' },
    });

    // Submit: after the modal opens there are two "Registrar Gasto" buttons
    // (the header trigger and the form submit); the submit is the last one.
    const submitButtons = screen.getAllByRole('button', {
      name: /Registrar Gasto/i,
    });
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    // The new expense is persisted through App -> useProfileStorage. localStorage
    // is month-independent, so this assertion is robust to auto month-switching.
    await waitFor(() => {
      const raw = localStorage.getItem('p_expenses_default');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as Array<{
        description: string;
        amount: number;
      }>;
      const added = parsed.find((e) => e.description === 'Prueba Gasto');
      expect(added).toBeDefined();
      expect(added!.amount).toBe(250);
    });
  });
});
