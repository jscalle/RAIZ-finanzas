import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendingTransactionsBanner } from './PendingTransactionsBanner';
import { PendingTransaction } from '../types';

const pendingTx = (id: string, description: string): PendingTransaction => ({
  id,
  spaceId: 'space_demo',
  type: 'EXPENSE',
  amount: 1000,
  currency: 'COP',
  description,
  category: 'Alimentación',
  date: '2026-10-01',
  explanation: '',
  status: 'PENDING',
  source: 'SMS_WEBHOOK',
  createdAt: '2026-10-01T00:00:00.000Z',
});

describe('PendingTransactionsBanner', () => {
  const queue = [
    pendingTx('a', 'Mercado'),
    pendingTx('b', 'Taxi'),
    pendingTx('c', 'Cine'),
  ];

  it('clamps to the new last item when the queue shrinks while the last item is shown', () => {
    const onApprove = vi.fn();
    const handlers = { onApprove, onDiscard: vi.fn(), onEdit: vi.fn() };
    const { rerender } = render(
      <PendingTransactionsBanner pendingTransactions={queue} {...handlers} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('En: Cine')).toBeInTheDocument();

    // The last item leaves the queue (e.g. approved elsewhere).
    rerender(
      <PendingTransactionsBanner
        pendingTransactions={queue.slice(0, 2)}
        {...handlers}
      />
    );

    expect(screen.getByText('En: Taxi')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Aprobar \(1-Tap\)/ }));
    expect(onApprove).toHaveBeenCalledWith(queue[1]);
  });

  it('renders nothing once the queue becomes empty', () => {
    const handlers = {
      onApprove: vi.fn(),
      onDiscard: vi.fn(),
      onEdit: vi.fn(),
    };
    const { container, rerender } = render(
      <PendingTransactionsBanner pendingTransactions={queue} {...handlers} />
    );

    rerender(
      <PendingTransactionsBanner pendingTransactions={[]} {...handlers} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
