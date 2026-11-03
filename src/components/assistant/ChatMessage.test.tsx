import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ChatMessage,
  SLOW_ANALYSIS_MS,
  formatDraftAmount,
} from './ChatMessage';
import type { ThreadMessage } from '../../types';

const NOW = new Date('2026-11-15T17:00:00Z').getTime();
const base: ThreadMessage = {
  id: 'm1',
  role: 'user',
  kind: 'text',
  text: 'Almuerzo 45000',
  createdAt: new Date(NOW - 5_000).toISOString(),
};
const view = (m: Partial<ThreadMessage>) =>
  render(<ChatMessage message={{ ...base, ...m }} now={NOW} />);

describe('ChatMessage', () => {
  it('shows the user text and no status once it is done', () => {
    view({ status: 'done' });
    expect(screen.getByText('Almuerzo 45000')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows "Analizando…" while waiting, and a slower hint after 90 seconds', () => {
    const { unmount } = view({ status: 'analyzing' });
    expect(screen.getByRole('status')).toHaveTextContent('Analizando…');
    unmount();
    view({
      status: 'analyzing',
      createdAt: new Date(NOW - SLOW_ANALYSIS_MS - 1000).toISOString(),
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'tardando más de lo normal'
    );
  });

  it('says so when the message could not be processed', () => {
    view({ status: 'failed' });
    expect(screen.getByText('No se pudo procesar')).toBeInTheDocument();
  });

  it('offers Reintentar for a failed text message and sends that same text again', () => {
    const onRetry = vi.fn();
    render(
      <ChatMessage
        message={{ ...base, status: 'failed' }}
        now={NOW}
        onRetry={onRetry}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledWith('Almuerzo 45000');
  });

  it('asks to choose the file again when a failed message had an attachment, with no retry button', () => {
    render(
      <ChatMessage
        message={{
          ...base,
          status: 'failed',
          attachment: { kind: 'audio', mimeType: 'audio/webm', sizeBytes: 9 },
        }}
        now={NOW}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/Vuelve a elegir el archivo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('shows no retry button for messages that did not fail or when retrying is blocked', () => {
    const { unmount } = render(
      <ChatMessage
        message={{ ...base, status: 'done' }}
        now={NOW}
        onRetry={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    unmount();
    render(
      <ChatMessage
        message={{ ...base, status: 'failed' }}
        now={NOW}
        onRetry={vi.fn()}
        retryDisabled
      />
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDisabled();
  });

  it('labels the attachment kind without showing any file content', () => {
    view({
      text: '',
      attachment: { kind: 'audio', mimeType: 'audio/webm', sizeBytes: 100 },
    });
    expect(screen.getByText('Audio')).toBeInTheDocument();
    view({
      text: '',
      attachment: { kind: 'image', mimeType: 'image/png', sizeBytes: 100 },
    });
    expect(screen.getByText('Foto')).toBeInTheDocument();
  });

  it('renders assistant text with bold, as elements and not as HTML', () => {
    view({ role: 'assistant', text: 'Llevas *$1.000* <b>x</b>' });
    expect(screen.getByText('$1.000').tagName).toBe('STRONG');
    expect(screen.getByText(/<b>x<\/b>/)).toBeInTheDocument();
  });

  it('marks notices and errors for assistive technology', () => {
    view({ role: 'assistant', kind: 'notice', text: 'Ojo' });
    expect(screen.getByLabelText('Aviso')).toBeInTheDocument();
    view({ role: 'assistant', kind: 'error', text: 'Falló' });
    expect(screen.getByLabelText('Error')).toBeInTheDocument();
  });

  it('shows a read-only draft summary, or the live card when one is provided', () => {
    const draft: Partial<ThreadMessage> = {
      role: 'assistant',
      kind: 'draft',
      text: 'x',
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
    const { unmount } = view(draft);
    expect(screen.getByText('Entendí esto')).toBeInTheDocument();
    expect(screen.getByText(/Gasto ·/)).toBeInTheDocument();
    expect(
      screen.getByText('Comida · Débito · 2026-11-15')
    ).toBeInTheDocument();
    unmount();
    render(
      <ChatMessage
        message={{ ...base, ...draft } as ThreadMessage}
        now={NOW}
        renderDraft={() => <p>TARJETA VIVA</p>}
      />
    );
    expect(screen.getByText('TARJETA VIVA')).toBeInTheDocument();
  });
});

describe('formatDraftAmount', () => {
  it('formats Colombian pesos without decimals and survives a bad currency code', () => {
    expect(formatDraftAmount(45000, 'COP')).toMatch(/45\.000/);
    expect(formatDraftAmount(45000, 'nonsense')).toMatch(/45\.000/);
  });
});
