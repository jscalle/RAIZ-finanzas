import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ExpensesSection from '../components/ExpensesSection';
import { Topic, Expense } from '../types';

describe('ExpensesSection', () => {
  const mockTopics: Topic[] = [
    {
      id: 'cat-1',
      name: 'Comida',
      color: '#ff0000',
      icon: 'Utensils',
      type: 'EXPENSE',
    },
  ];

  const mockExpenses: Expense[] = [
    {
      id: 'exp-1',
      description: 'Supermercado',
      amount: 50000,
      topicId: 'cat-1',
      date: '2026-08-25',
      confirmed: true,
      paymentMethod: 'DEBITO',
      source: 'INGRESOS',
    },
  ];

  const formatCurrency = (amt: number) => `$${amt.toLocaleString('es-CO')}`;

  it('renders expenses header and total amount', () => {
    render(
      <ExpensesSection
        expenses={mockExpenses}
        topics={mockTopics}
        onAddExpense={vi.fn()}
        onEditExpense={vi.fn()}
        onDeleteExpense={vi.fn()}
        onToggleConfirmExpense={vi.fn()}
        formatCurrency={formatCurrency}
      />
    );

    expect(screen.getByText('Presupuesto de Gastos')).toBeInTheDocument();
    expect(screen.getByText('Supermercado')).toBeInTheDocument();
  });

  it('calls onDeleteExpense when delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <ExpensesSection
        expenses={mockExpenses}
        topics={mockTopics}
        onAddExpense={vi.fn()}
        onEditExpense={vi.fn()}
        onDeleteExpense={onDelete}
        onToggleConfirmExpense={vi.fn()}
        formatCurrency={formatCurrency}
      />
    );

    const deleteBtn = screen.getByTitle('Eliminar gasto');
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('exp-1');
  });
});
