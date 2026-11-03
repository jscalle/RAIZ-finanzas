import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ThreadMessage } from '../types';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  sendAssistantMessage: (...a: unknown[]) => h.send(...a),
  subscribeToAssistantThread: (...a: unknown[]) => h.subscribe(...a),
  isPermissionDenied: (e: unknown) =>
    (e as { code?: string } | null)?.code === 'permission-denied',
}));

import AssistantTab from './AssistantTab';

type Emit = (m: ThreadMessage[]) => void;
type Fail = (e: unknown) => void;
let emit: Emit;
let fail: Fail;

const props = {
  currentSpaceId: 'espacio_familia',
  userUid: 'kid-uid',
  syncEnabled: true,
  onOpenCloudSettings: vi.fn(),
};
const t = (id: string, over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id,
  role: 'user',
  kind: 'text',
  text: id,
  createdAt: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  h.subscribe.mockImplementation(
    (_s: string, _u: string, onUpdate: Emit, onError: Fail) => {
      emit = onUpdate;
      fail = onError;
      return () => {};
    }
  );
  h.send.mockResolvedValue({ ok: true, messageId: 'm1' });
});

describe('AssistantTab', () => {
  it('asks for the cloud when the user is signed out or sync is off, and listens to nothing', () => {
    const onOpen = vi.fn();
    render(
      <AssistantTab
        {...props}
        syncEnabled={false}
        onOpenCloudSettings={onOpen}
      />
    );
    expect(screen.getByText(/necesitas la nube/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Ir a Nube y Compartir' })
    );
    expect(onOpen).toHaveBeenCalled();
    expect(h.subscribe).not.toHaveBeenCalled();
  });

  it('greets with two guided chips when the conversation is empty', () => {
    render(<AssistantTab {...props} />);
    act(() => emit([]));
    expect(screen.getByText(/Hola, soy tu asistente/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Registrar un gasto' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '¿Cuánto llevo este mes?' })
    ).toBeInTheDocument();
  });

  it('sends the question chip right away and fills the text box for the expense chip', async () => {
    render(<AssistantTab {...props} />);
    act(() => emit([]));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar un gasto' }));
    expect(screen.getByLabelText('Escribe tu mensaje')).toHaveValue(
      'Gasté  en '
    );
    fireEvent.click(
      screen.getByRole('button', { name: '¿Cuánto llevo este mes?' })
    );
    await waitFor(() =>
      expect(h.send).toHaveBeenCalledWith('espacio_familia', {
        text: '¿Cuánto llevo este mes?',
      })
    );
  });

  it('hides the greeting once there are messages and renders the conversation', () => {
    render(<AssistantTab {...props} />);
    act(() =>
      emit([
        t('u1', { text: 'Almuerzo 45000', status: 'analyzing' }),
        t('a1', { role: 'assistant', text: 'Llevas *$10*' }),
        t('a2', { role: 'assistant', kind: 'notice', text: 'Ojo con esto' }),
      ])
    );
    expect(screen.queryByText(/Hola, soy tu asistente/)).toBeNull();
    expect(screen.getByText('Almuerzo 45000')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Analizando…');
    expect(screen.getByText('$10').tagName).toBe('STRONG');
    expect(screen.getByText('Ojo con esto')).toBeInTheDocument();
    expect(
      screen.getByRole('log', { name: 'Conversación con el asistente' })
    ).toBeInTheDocument();
  });

  it('sends the typed message, clears the box, and blocks a second send while waiting', async () => {
    let resolve: (v: unknown) => void = () => {};
    h.send.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<AssistantTab {...props} />);
    act(() => emit([t('u0', { status: 'done' })]));
    const box = screen.getByLabelText('Escribe tu mensaje');
    fireEvent.change(box, { target: { value: 'Mercado 80000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(h.send).toHaveBeenCalledWith('espacio_familia', {
      text: 'Mercado 80000',
    });
    expect(box).toHaveValue('');
    fireEvent.change(box, { target: { value: 'otro' } });
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    resolve({ ok: true, messageId: 'm' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Enviar' })).not.toBeDisabled()
    );
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('sends with Enter but not with Shift+Enter, and ignores empty text', () => {
    render(<AssistantTab {...props} />);
    act(() => emit([t('u0', { status: 'done' })]));
    const box = screen.getByLabelText('Escribe tu mensaje');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(h.send).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'hola' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(h.send).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it('shows the error and gives the text back when sending fails', async () => {
    h.send.mockResolvedValue({
      ok: false,
      message:
        'Enviaste muchos mensajes seguidos. Espera 1 min e intenta de nuevo.',
    });
    render(<AssistantTab {...props} />);
    act(() => emit([t('u0', { status: 'done' })]));
    const box = screen.getByLabelText('Escribe tu mensaje');
    fireEvent.change(box, { target: { value: 'hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(
      await screen.findByText(/Enviaste muchos mensajes/)
    ).toBeInTheDocument();
    expect(box).toHaveValue('hola');
  });

  it('shows a visible message when the conversation cannot be loaded', () => {
    render(<AssistantTab {...props} />);
    act(() => fail({ code: 'permission-denied' }));
    expect(screen.getByRole('alert')).toHaveTextContent('permiso');
    expect(screen.queryByText(/Hola, soy tu asistente/)).toBeNull();
  });
});
