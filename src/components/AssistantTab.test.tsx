import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PendingTransaction, ThreadMessage } from '../types';

const h = vi.hoisted(() => ({
  send: vi.fn(),
  subscribe: vi.fn(),
  voiceOpts: null as null | {
    onFinished: (f: File) => void;
    onError: (m: string) => void;
  },
  voice: {
    state: 'idle' as 'idle' | 'recording',
    seconds: 0,
    level: 0,
    supported: false,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  },
}));

vi.mock('../lib/firebase', () => ({
  sendAssistantMessage: (...a: unknown[]) => h.send(...a),
  subscribeToAssistantThread: (...a: unknown[]) => h.subscribe(...a),
  isPermissionDenied: (e: unknown) =>
    (e as { code?: string } | null)?.code === 'permission-denied',
}));

vi.mock('../hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: (opts: {
    onFinished: (f: File) => void;
    onError: (m: string) => void;
  }) => {
    h.voiceOpts = opts;
    return h.voice;
  },
}));

import AssistantTab from './AssistantTab';

type Emit = (m: ThreadMessage[]) => void;
type Fail = (e: unknown) => void;
let emit: Emit;
let fail: Fail;

const t = (id: string, over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id,
  role: 'user',
  kind: 'text',
  text: id,
  createdAt: new Date().toISOString(),
  ...over,
});
const draftHandlers = {
  onApproveDraft: vi.fn(),
  onEditDraft: vi.fn(),
  onDiscardDraft: vi.fn(),
};
const props = {
  currentSpaceId: 'espacio_familia',
  userUid: 'kid-uid',
  syncEnabled: true,
  onOpenCloudSettings: vi.fn(),
  pendingTransactions: [] as PendingTransaction[],
  pendingReady: true,
  ...draftHandlers,
};
const pendingTx: PendingTransaction = {
  id: 'as_1',
  spaceId: 'espacio_familia',
  type: 'EXPENSE',
  amount: 45000,
  currency: 'COP',
  description: 'Almuerzo',
  category: 'Comida',
  date: '2026-11-15',
  explanation: '',
  status: 'PENDING',
  source: 'SMS_WEBHOOK',
  createdAt: '2026-11-15T10:00:00.000Z',
  paymentMethod: 'DEBITO',
};
const draftMessage = t('a9', {
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
});

beforeEach(() => {
  h.voice = {
    state: 'idle',
    seconds: 0,
    level: 0,
    supported: false,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  };
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

  it('shows a draft as a live card and saves only when the user taps Guardar', () => {
    const onApproveDraft = vi.fn();
    render(
      <AssistantTab
        {...props}
        pendingTransactions={[pendingTx]}
        onApproveDraft={onApproveDraft}
      />
    );
    act(() => emit([t('u1', { status: 'done' }), draftMessage]));
    expect(onApproveDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onApproveDraft).toHaveBeenCalledWith(pendingTx);
  });

  it('routes Cambiar and Descartar to the same handlers the banner uses', () => {
    const onEditDraft = vi.fn();
    const onDiscardDraft = vi.fn();
    render(
      <AssistantTab
        {...props}
        pendingTransactions={[pendingTx]}
        onEditDraft={onEditDraft}
        onDiscardDraft={onDiscardDraft}
      />
    );
    act(() => emit([draftMessage]));
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(onEditDraft).toHaveBeenCalledWith(pendingTx);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onDiscardDraft).toHaveBeenCalledWith('as_1');
  });

  it('explains a draft that is no longer pending, and waits while pending drafts load', () => {
    const { rerender } = render(
      <AssistantTab {...props} pendingReady={false} />
    );
    act(() => emit([draftMessage]));
    expect(screen.getByText('Revisando…')).toBeInTheDocument();
    rerender(<AssistantTab {...props} pendingReady />);
    expect(
      screen.getByText('Este movimiento ya se guardó o se descartó.')
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

  describe('attachments', () => {
    const jpeg = () =>
      new File([new Uint8Array([0xff, 0xd8, 0xff])], 'factura.jpg', {
        type: 'image/jpeg',
      });
    const openAndPick = (file: File, option = 'Elegir de la galería') => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Adjuntar foto o audio' })
      );
      const input = screen
        .getByText(option)
        .closest('label')!
        .querySelector('input')!;
      fireEvent.change(input, { target: { files: [file] } });
    };

    it('opens the attach sheet from the plus button and from the invoice chip', () => {
      render(<AssistantTab {...props} />);
      act(() => emit([]));
      fireEvent.click(
        screen.getByRole('button', { name: 'Subir foto de una factura' })
      );
      expect(
        screen.getByRole('dialog', { name: 'Adjuntar' })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: 'Adjuntar foto o audio' })
      );
      expect(
        screen.getByRole('dialog', { name: 'Adjuntar' })
      ).toBeInTheDocument();
    });

    it('shows the chosen photo as ready to send and sends it with no text', async () => {
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      openAndPick(jpeg());
      expect(screen.getByText('factura.jpg')).toBeInTheDocument();
      expect(screen.getByText(/Listo para enviar/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enviar' })).not.toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
      await waitFor(() =>
        expect(h.send).toHaveBeenCalledWith('espacio_familia', {
          attachment: { mime: 'image/jpeg', dataBase64: '/9j/' },
        })
      );
      await waitFor(() => expect(screen.queryByText('factura.jpg')).toBeNull());
    });

    it('sends the text together with the attachment', async () => {
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      openAndPick(jpeg());
      fireEvent.change(screen.getByLabelText('Escribe tu mensaje'), {
        target: { value: 'Almuerzo' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
      await waitFor(() =>
        expect(h.send).toHaveBeenCalledWith('espacio_familia', {
          text: 'Almuerzo',
          attachment: { mime: 'image/jpeg', dataBase64: '/9j/' },
        })
      );
    });

    it('refuses video and unsupported audio with an explanation, and keeps nothing attached', () => {
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      openAndPick(new File(['x'], 'clip.mp4', { type: 'video/mp4' }));
      expect(screen.getByRole('alert')).toHaveTextContent('video');
      expect(screen.queryByText(/Listo para enviar/)).toBeNull();
      openAndPick(
        new File(['x'], 'PTT-1.opus', { type: 'audio/ogg' }),
        'Subir audio'
      );
      expect(screen.getByRole('alert')).toHaveTextContent('audio');
      expect(h.send).not.toHaveBeenCalled();
    });

    it('shows "Subiendo…" while uploading and hands over to the thread once it shows the message', async () => {
      let resolve: (v: unknown) => void = () => {};
      h.send.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      openAndPick(jpeg());
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
      expect(await screen.findByText(/Subiendo…/)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Quitar archivo adjunto' })
      ).toBeDisabled();

      act(() =>
        emit([
          t('u0', { status: 'done' }),
          t('u1', {
            status: 'analyzing',
            attachment: { kind: 'image', mimeType: 'image/jpeg', sizeBytes: 3 },
          }),
        ])
      );
      expect(screen.queryByText('factura.jpg')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('Analizando…');
      resolve({ ok: true, messageId: 'm' });
    });

    it('keeps the photo and the text when sending fails, so the user can try again', async () => {
      h.send.mockResolvedValue({
        ok: false,
        message:
          'No pude conectar con el asistente. Revisa tu conexión e intenta de nuevo.',
      });
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      openAndPick(jpeg());
      fireEvent.change(screen.getByLabelText('Escribe tu mensaje'), {
        target: { value: 'Mercado' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
      expect(await screen.findByText(/No pude conectar/)).toBeInTheDocument();
      expect(screen.getByText('factura.jpg')).toBeInTheDocument();
      expect(screen.getByLabelText('Escribe tu mensaje')).toHaveValue(
        'Mercado'
      );
    });

    it('lets the user remove the attachment before sending', () => {
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      openAndPick(jpeg());
      fireEvent.click(
        screen.getByRole('button', { name: 'Quitar archivo adjunto' })
      );
      expect(screen.queryByText('factura.jpg')).toBeNull();
      expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    });
  });

  describe('voice notes', () => {
    const note = () =>
      new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], 'nota-de-voz.webm', {
        type: 'audio/webm;codecs=opus',
      });

    it('offers the microphone when there is nothing to send, and the send button once there is text', () => {
      h.voice.supported = true;
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      fireEvent.click(
        screen.getByRole('button', { name: 'Grabar nota de voz' })
      );
      expect(h.voice.start).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull();

      fireEvent.change(screen.getByLabelText('Escribe tu mensaje'), {
        target: { value: 'hola' },
      });
      expect(
        screen.queryByRole('button', { name: 'Grabar nota de voz' })
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Enviar' })
      ).toBeInTheDocument();
    });

    it('does not show the microphone when the device cannot record', () => {
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      expect(
        screen.queryByRole('button', { name: 'Grabar nota de voz' })
      ).toBeNull();
    });

    it('shows the clock while recording, with trash to cancel and send to finish', () => {
      h.voice.supported = true;
      h.voice.state = 'recording';
      h.voice.seconds = 75;
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      expect(
        screen.getByRole('group', { name: 'Grabando nota de voz' })
      ).toBeInTheDocument();
      expect(screen.getByText('1:15')).toBeInTheDocument();
      expect(screen.getByText('Máximo 3 minutos')).toBeInTheDocument();
      expect(screen.queryByLabelText('Escribe tu mensaje')).toBeNull();
      fireEvent.click(
        screen.getByRole('button', { name: 'Cancelar grabación' })
      );
      expect(h.voice.cancel).toHaveBeenCalledTimes(1);
      fireEvent.click(
        screen.getByRole('button', { name: 'Enviar nota de voz' })
      );
      expect(h.voice.stop).toHaveBeenCalledTimes(1);
    });

    it('sends a finished voice note right away as audio with no text', async () => {
      let resolve: (v: unknown) => void = () => {};
      h.send.mockReturnValue(new Promise((r) => (resolve = r)));
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      act(() => h.voiceOpts!.onFinished(note()));
      await waitFor(() =>
        expect(h.send).toHaveBeenCalledWith('espacio_familia', {
          attachment: { mime: 'audio/webm', dataBase64: 'GkXfow==' },
        })
      );
      expect(screen.getByText('nota-de-voz.webm')).toBeInTheDocument();
      expect(screen.getByText(/Subiendo…/)).toBeInTheDocument();
      resolve({ ok: true, messageId: 'm' });
      await waitFor(() =>
        expect(screen.queryByText('nota-de-voz.webm')).toBeNull()
      );
    });

    it('keeps the note ready to resend if sending fails', async () => {
      h.send.mockResolvedValue({
        ok: false,
        message:
          'No pude conectar con el asistente. Revisa tu conexión e intenta de nuevo.',
      });
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      act(() => h.voiceOpts!.onFinished(note()));
      expect(await screen.findByText(/No pude conectar/)).toBeInTheDocument();
      expect(screen.getByText('nota-de-voz.webm')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enviar' })).not.toBeDisabled();
    });

    it('shows the recorder errors, such as a denied microphone', () => {
      render(<AssistantTab {...props} />);
      act(() => emit([t('u0', { status: 'done' })]));
      act(() =>
        h.voiceOpts!.onError('Para grabar necesito permiso del micrófono.')
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        'permiso del micrófono'
      );
    });
  });

  it('shows a visible message when the conversation cannot be loaded', () => {
    render(<AssistantTab {...props} />);
    act(() => fail({ code: 'permission-denied' }));
    expect(screen.getByRole('alert')).toHaveTextContent('permiso');
    expect(screen.queryByText(/Hola, soy tu asistente/)).toBeNull();
  });
});
