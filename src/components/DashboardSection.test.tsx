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
  it('should render the capital balance headline using the provided formatter', () => {
    render(<DashboardSection {...buildProps({ capitalDisponible: 5000 })} />);
    expect(screen.getByText('Disponible (Capital Total)')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
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
