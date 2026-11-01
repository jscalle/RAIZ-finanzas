import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import SavingsSection from '../components/SavingsSection';
import { Topic } from '../types';

describe('SavingsSection', () => {
  const mockTopics: Topic[] = [
    {
      id: 'cat-save-1',
      name: 'Fondo Emergencia',
      color: '#0000ff',
      icon: 'PiggyBank',
      type: 'EXPENSE',
    },
  ];

  const formatCurrency = (amt: number) => `$${amt.toLocaleString('es-CO')}`;

  it('renders savings section correctly', () => {
    render(
      <SavingsSection
        goals={[]}
        contributions={[]}
        topics={mockTopics}
        startingSavings={1000000}
        currentAvailableIncomes={2500000}
        onUpdateStartingSavings={vi.fn()}
        onAddGoal={vi.fn()}
        onEditGoal={vi.fn()}
        onDeleteGoal={vi.fn()}
        onAddContribution={vi.fn()}
        onEditContribution={vi.fn()}
        onDeleteContribution={vi.fn()}
        formatCurrency={formatCurrency}
      />
    );

    expect(screen.getByText('Metas de Ahorro')).toBeInTheDocument();
  });
});
