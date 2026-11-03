import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ACTION_TIMEOUT_MS, DraftCard } from './DraftCard';
import type { PendingTransaction, ThreadMessage } from '../../types';

const message: ThreadMessage = {
  id: 'a3',
  role: 'assistant',
  kind: 'draft',
  text: 'x',
  createdAt: '2026-11-15T10:00:00.000Z',
  draftId: 'as_1',
  draft: {
    type: 'EXPENSE',
    amount: 45000,
    currency: 'COP',
    description: 'Almuerzo',
    category: 'Comida',
    paymentMethod: 'DEBITO',
    date: '2026-11-15',
  },
};
const pending: PendingTransaction = {
  id: 'as_1',
  spaceId: 's',
  type: 'EXPENSE',
  amount: 46000,
  currency: 'COP',
  description: 'Almuerzo con cambios',
  category: 'Comida',
  date: '2026-11-15',
  explanation: '',
  status: 'PENDING',
  source: 'SMS_WEBHOOK',
  createdAt: '2026-11-15T10:00:00.000Z',
  paymentMethod: 'CREDITO',
};

const setup = (over: Partial<React.ComponentProps<typeof DraftCard>> = {}) => {
  const fns = { onApprove: vi.fn(), onEdit: vi.fn(), onDiscard: vi.fn() };
  const view = render(
    <DraftCard message={message} pending={pending} ready {...fns} {...over} />
  );
  return { ...fns, ...view };
};

describe('DraftCard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the live draft, not the old snapshot, with three clear actions', () => {
    setup();
    expect(screen.getByText('Entendí esto')).toBeInTheDocument();
    expect(screen.getByText('Almuerzo con cambios')).toBeInTheDocument();
    expect(screen.getByText(/46\.000/)).toBeInTheDocument();
    expect(
      screen.getByText('Comida · Crédito · 2026-11-15')
    ).toBeInTheDocument();
    for (const name of ['Guardar', 'Cambiar', 'Descartar']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('saves only when the user taps Guardar, with the live draft, and blocks double taps', () => {
    const { onApprove, onEdit, onDiscard } = setup();
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onApprove).toHaveBeenCalledWith(pending);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeDisabled();
  });

  it('opens the editor with Cambiar and discards by id with Descartar', () => {
    const { onEdit, onDiscard } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(onEdit).toHaveBeenCalledWith(pending);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onDiscard).toHaveBeenCalledWith('as_1');
  });

  it('says Guardado once the draft disappears after the user saved it', () => {
    const { rerender, onApprove, onEdit, onDiscard } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    rerender(
      <DraftCard
        message={message}
        pending={undefined}
        ready
        onApprove={onApprove}
        onEdit={onEdit}
        onDiscard={onDiscard}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Guardado');
  });

  it('says Descartado after discarding', () => {
    const { rerender, onApprove, onEdit, onDiscard } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    rerender(
      <DraftCard
        message={message}
        pending={undefined}
        ready
        onApprove={onApprove}
        onEdit={onEdit}
        onDiscard={onDiscard}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Descartado');
  });

  it('says it was already resolved when the draft vanished without this card acting', () => {
    setup({ pending: undefined });
    expect(
      screen.getByText('Este movimiento ya se guardó o se descartó.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
  });

  it('does not claim "resolved" before the pending drafts have loaded', () => {
    setup({ pending: undefined, ready: false });
    expect(screen.getByText('Revisando…')).toBeInTheDocument();
    expect(screen.queryByText(/ya se guardó/)).toBeNull();
  });

  it('gives the buttons back with a hint when nothing happened after a while', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    act(() => {
      vi.advanceTimersByTime(ACTION_TIMEOUT_MS + 10);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('No pude confirmar');
    expect(screen.getByRole('button', { name: 'Guardar' })).not.toBeDisabled();
  });
});
