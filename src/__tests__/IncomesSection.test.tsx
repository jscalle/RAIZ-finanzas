import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import IncomesSection from '../components/IncomesSection';
import { Topic, Income } from '../types';

describe('IncomesSection', () => {
  const mockTopics: Topic[] = [
    {
      id: 'cat-inc-1',
      name: 'Salario',
      color: '#00ff00',
      icon: 'Briefcase',
      type: 'INCOME',
    },
  ];

  const mockIncomes: Income[] = [
    {
      id: 'inc-1',
      description: 'Nómina Mensual',
      amount: 2500000,
      topicId: 'cat-inc-1',
      date: '2026-08-25',
      confirmed: true,
    },
  ];

  const formatCurrency = (amt: number) => `$${amt.toLocaleString('es-CO')}`;

  it('renders incomes header and transaction details', () => {
    render(
      <IncomesSection
        incomes={mockIncomes}
        withdrawals={[]}
        topics={mockTopics}
        cashPool={0}
        onAddIncome={vi.fn()}
        onEditIncome={vi.fn()}
        onDeleteIncome={vi.fn()}
        onToggleConfirmIncome={vi.fn()}
        onAddWithdrawal={vi.fn()}
        onEditWithdrawal={vi.fn()}
        onDeleteWithdrawal={vi.fn()}
        formatCurrency={formatCurrency}
      />
    );

    expect(screen.getByText('Gestión de Ingresos')).toBeInTheDocument();
    // Rendered once in the desktop table and once in the mobile list.
    expect(screen.getAllByText('Nómina Mensual')).toHaveLength(2);
  });

  it('calls onDeleteIncome when delete button is clicked', () => {
    const onDelete = vi.fn();
    render(
      <IncomesSection
        incomes={mockIncomes}
        withdrawals={[]}
        topics={mockTopics}
        cashPool={0}
        onAddIncome={vi.fn()}
        onEditIncome={vi.fn()}
        onDeleteIncome={onDelete}
        onToggleConfirmIncome={vi.fn()}
        onAddWithdrawal={vi.fn()}
        onEditWithdrawal={vi.fn()}
        onDeleteWithdrawal={vi.fn()}
        formatCurrency={formatCurrency}
      />
    );

    const deleteBtn = screen.getByTitle('Eliminar ingreso');
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith('inc-1');
  });
});
