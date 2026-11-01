import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CategoryBudget from './CategoryBudget';
import { Expense, Topic } from '../types';

const fmt = (amount: number) => `$${amount}`;

const topic = (id: string, name: string, monthlyLimit?: number): Topic => ({
  id,
  name,
  type: 'EXPENSE',
  icon: 'ShoppingBag',
  color: 'amber',
  monthlyLimit,
});

const expense = (
  topicId: string,
  amount: number,
  confirmed = true
): Expense => ({
  id: `${topicId}-${amount}`,
  description: 'x',
  amount,
  topicId,
  date: '2026-08-01',
  source: 'INGRESOS',
  confirmed,
});

describe('CategoryBudget', () => {
  it('shows an empty state when no category has a limit', () => {
    render(
      <CategoryBudget
        expenses={[]}
        topics={[topic('a', 'A')]}
        formatCurrency={fmt}
      />
    );
    expect(
      screen.getByText(/Ninguna categoría tiene un límite/i)
    ).toBeInTheDocument();
  });

  it('renders the monthly summary and a row per budgeted category', () => {
    render(
      <CategoryBudget
        expenses={[expense('food', 60), expense('transport', 50)]}
        topics={[
          topic('food', 'Comida', 100),
          topic('transport', 'Transporte', 200),
        ]}
        formatCurrency={fmt}
      />
    );
    expect(screen.getByText('Presupuesto del mes')).toBeInTheDocument();
    expect(screen.getByText('Comida')).toBeInTheDocument();
    expect(screen.getByText('Transporte')).toBeInTheDocument();
    // 60/100 and 50/200 are both under the warning threshold.
    expect(screen.getAllByText('En rumbo')).toHaveLength(2);
  });

  it('flags an exceeded category and shows how much it went over', () => {
    render(
      <CategoryBudget
        expenses={[expense('food', 130)]}
        topics={[topic('food', 'Comida', 100)]}
        formatCurrency={fmt}
      />
    );
    expect(screen.getByText('¡Excedido!')).toBeInTheDocument();
    // remaining -30 -> "Excedido por $30" (appears in the summary and the row).
    expect(screen.getAllByText(/Excedido por \$30/).length).toBeGreaterThan(0);
  });

  it('ignores unconfirmed expenses in the consumption', () => {
    render(
      <CategoryBudget
        expenses={[expense('food', 40, true), expense('food', 90, false)]}
        topics={[topic('food', 'Comida', 100)]}
        formatCurrency={fmt}
      />
    );
    // Only 40 counts -> normal, not exceeded.
    expect(screen.getByText('En rumbo')).toBeInTheDocument();
    expect(screen.queryByText('¡Excedido!')).not.toBeInTheDocument();
  });
});
