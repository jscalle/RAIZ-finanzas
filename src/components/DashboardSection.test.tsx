import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import DashboardSection from './DashboardSection';
import { Expense, SavingGoal, Topic } from '../types';

// A deterministic currency formatter so assertions can match exact text.
const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-US')}`;

const topics: Topic[] = [
  {
    id: 'food',
    name: 'Comida',
    type: 'EXPENSE',
    icon: 'Utensils',
    color: 'amber',
    monthlyLimit: 100,
  },
  {
    id: 'rent',
    name: 'Arriendo',
    type: 'EXPENSE',
    icon: 'Home',
    color: 'cyan',
  },
  {
    id: 'salary',
    name: 'Salario',
    type: 'INCOME',
    icon: 'Wallet',
    color: 'emerald',
  },
];

function buildProps(
  overrides: Partial<React.ComponentProps<typeof DashboardSection>> = {}
) {
  const base: React.ComponentProps<typeof DashboardSection> = {
    expenses: [],
    goals: [] as SavingGoal[],
    topics,
    startingSavings: 0,
    totalContributions: 0,
    formatCurrency,
    privacyMode: 'real',
    setPrivacyMode: vi.fn(),
    privacyScale: 1,
    setPrivacyScale: vi.fn(),
    activeMonth: '2024-01',
    setActiveMonth: vi.fn(),
    capitalDisponible: 5000,
    cashPool: 1000,
    totals: { ingreso: 4000, gasto: 1000, ahorro: 500 },
    recentTransactions: [],
  };
  return { ...base, ...overrides };
}

describe('DashboardSection', () => {
  it('should render the available-to-spend headline using the provided formatter', () => {
    // Headline = ingreso - ahorro - planned category limits - overspend:
    // 4000 - 500 - 100 (Comida limit) - 0 = 3400.
    render(
      <DashboardSection
        {...buildProps({ totals: { ingreso: 4000, gasto: 1000, ahorro: 500 } })}
      />
    );
    expect(
      screen.getByText(
        'Disponible Real para Gastar (Libre después de Topes y Ahorro)'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('$3,400')).toBeInTheDocument();
  });

  describe('balance carried over from earlier months and spending without a limit', () => {
    const exp = (over: Partial<Expense>): Expense =>
      ({
        id: 'e1',
        description: 'x',
        amount: 300,
        topicId: 'rent',
        date: '2024-01-10',
        source: 'INGRESOS',
        confirmed: true,
        paymentMethod: 'DEBITO',
        ...over,
      }) as Expense;
    const totals = { ingreso: 4000, gasto: 1000, ahorro: 500 };

    it('adds the balance from the previous month to the headline and says so in a small subtitle', () => {
      render(<DashboardSection {...buildProps({ totals, carryOver: 1500 })} />);
      // 1500 + 4000 - 500 - 100 = 4900
      expect(screen.getByText('$4,900')).toBeInTheDocument();
      expect(
        screen.getByText('Incluye $1,500 del mes anterior')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Saldo del mes anterior \(\$1,500\)/)
      ).toBeInTheDocument();
    });

    it('shows no carry-over text and keeps the old number when nothing carries over', () => {
      render(<DashboardSection {...buildProps({ totals, carryOver: 0 })} />);
      expect(screen.getByText('$3,400')).toBeInTheDocument();
      expect(screen.queryByText(/del mes anterior/)).toBeNull();
    });

    it('subtracts spending in categories that have no limit', () => {
      // 4000 - 500 - 100 - 300 (Arriendo has no limit) = 3100
      render(
        <DashboardSection {...buildProps({ totals, expenses: [exp({})] })} />
      );
      expect(screen.getByText('$3,100')).toBeInTheDocument();
    });

    it('subtracts spending whose category no longer exists, but not spending funded from savings', () => {
      const expenses = [
        exp({ id: 'a', topicId: 'default', amount: 200 }),
        exp({ id: 'b', topicId: 'rent', amount: 999, source: 'AHORROS' }),
      ];
      // only the 200 counts: 4000 - 500 - 100 - 200 = 3200
      render(<DashboardSection {...buildProps({ totals, expenses })} />);
      expect(screen.getByText('$3,200')).toBeInTheDocument();
    });

    it('counts a credit card payment once (as prior card debt), not again as spending without a limit', () => {
      const expenses = [
        exp({ id: 'c', topicId: 'topic_1787580821277', amount: 999 }),
      ];
      // 4000 - 500 - 100 - 999 = 2401
      render(<DashboardSection {...buildProps({ totals, expenses })} />);
      expect(screen.getByText('$2,401')).toBeInTheDocument();
    });

    it('never goes below zero', () => {
      render(
        <DashboardSection
          {...buildProps({
            totals: { ingreso: 0, gasto: 0, ahorro: 0 },
            expenses: [exp({ amount: 5000 })],
          })}
        />
      );
      expect(screen.getAllByText('$0').length).toBeGreaterThan(0);
    });
  });

  it('keeps phone layouts from overflowing the screen with long descriptions', () => {
    // jsdom has no layout engine, so pin the classes that prevent the overflow:
    // an unnamed grid column grows to its widest unbreakable text (e.g. a long
    // description), pushing cards past the right edge on phones.
    const { container } = render(
      <DashboardSection
        {...buildProps({ totals: { ingreso: 4000, gasto: 1000, ahorro: 500 } })}
      />
    );
    const responsiveGrids = Array.from(
      container.querySelectorAll('[class*="grid"]')
    ).filter((el) =>
      /(^|\s)(sm|md|lg):grid-cols-\d+/.test(el.getAttribute('class') ?? '')
    );
    expect(responsiveGrids.length).toBeGreaterThanOrEqual(3);
    for (const grid of responsiveGrids) {
      expect(grid.classList.contains('grid-cols-1')).toBe(true);
    }
  });

  it('should compute the savings rate as ahorro over ingreso', () => {
    render(
      <DashboardSection
        {...buildProps({ totals: { ingreso: 4000, gasto: 1000, ahorro: 500 } })}
      />
    );
    // 500 / 4000 = 12.5% -> rounded to 13%.
    expect(screen.getByText('13%')).toBeInTheDocument();
  });

  it('should show a zero savings rate when there is no income', () => {
    render(
      <DashboardSection
        {...buildProps({ totals: { ingreso: 0, gasto: 0, ahorro: 500 } })}
      />
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows only budgeted categories, counting confirmed spend against the limit', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        date: '2024-01-01',
        description: 'Almuerzo',
        amount: 60,
        source: 'INGRESOS',
        paymentMethod: 'DEBITO',
        confirmed: true,
        topicId: 'food',
      },
      {
        id: 'e2',
        date: '2024-01-02',
        description: 'Cena',
        amount: 30,
        source: 'INGRESOS',
        paymentMethod: 'DEBITO',
        confirmed: false,
        topicId: 'food',
      },
      {
        id: 'e3',
        date: '2024-01-03',
        description: 'Renta',
        amount: 800,
        source: 'INGRESOS',
        paymentMethod: 'DEBITO',
        confirmed: true,
        topicId: 'rent',
      },
    ];
    render(<DashboardSection {...buildProps({ expenses })} />);

    const section = screen.getByText(
      'Presupuesto por categoría'
    ).parentElement!;
    // Comida has a monthly limit -> shown. Only confirmed spend counts (60, not 90).
    expect(within(section).getByText('Comida')).toBeInTheDocument();
    // 60 of 100 -> under the warning threshold.
    expect(within(section).getByText('En rumbo')).toBeInTheDocument();
    // Arriendo has no monthly limit -> excluded from the budget view.
    expect(within(section).queryByText('Arriendo')).not.toBeInTheDocument();
  });

  it('should mark a category as exceeded when spend meets or exceeds its monthly limit', () => {
    const expenses: Expense[] = [
      {
        id: 'e1',
        date: '2024-01-01',
        description: 'Overspend',
        amount: 150,
        source: 'INGRESOS',
        paymentMethod: 'DEBITO',
        confirmed: true,
        topicId: 'food',
      },
    ];
    render(<DashboardSection {...buildProps({ expenses })} />);
    // food limit is 100, spend 150 -> exceeded badge.
    expect(screen.getByText('¡Excedido!')).toBeInTheDocument();
  });

  it('should render recent transactions with sign prefixes by flow', () => {
    const recentTransactions = [
      {
        id: 't1',
        flow: 'ingreso' as const,
        topicId: 'salary',
        description: 'Pago',
        amount: 4000,
      },
      {
        id: 't2',
        flow: 'gasto' as const,
        topicId: 'food',
        description: 'Mercado',
        amount: 200,
      },
    ];
    render(<DashboardSection {...buildProps({ recentTransactions })} />);

    const section = screen.getByText('Movimientos recientes').parentElement!;
    expect(within(section).getByText('Pago')).toBeInTheDocument();
    expect(within(section).getByText('Mercado')).toBeInTheDocument();
    // Income prefixed with '+', expense with the minus sign character.
    expect(within(section).getByText(/\+\$4,000/)).toBeInTheDocument();
    expect(within(section).getByText(/−\$200/)).toBeInTheDocument();
  });

  it('should render without crashing when all collections are empty', () => {
    render(<DashboardSection {...buildProps()} />);
    expect(screen.getByText('Tu panorama financiero')).toBeInTheDocument();
  });
});
