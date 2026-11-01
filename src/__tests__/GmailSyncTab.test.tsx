import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import GmailSyncTab from '../components/GmailSyncTab';

describe('GmailSyncTab', () => {
  const formatCurrency = (amt: number) => `$${amt.toLocaleString('es-CO')}`;

  it('renders gmail sync tab correctly', () => {
    render(
      <GmailSyncTab
        user={null}
        accessToken={null}
        onLogin={vi.fn()}
        topics={[]}
        incomes={[]}
        expenses={[]}
        onAddExpense={vi.fn()}
        onUpdateExpense={vi.fn()}
        onAddIncome={vi.fn()}
        onUpdateIncome={vi.fn()}
        formatCurrency={formatCurrency}
      />
    );

    expect(screen.getByText(/Gmail/i)).toBeInTheDocument();
  });
});
