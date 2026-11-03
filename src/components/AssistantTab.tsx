import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CloudOff, Loader2, Sprout } from 'lucide-react';
import { sendAssistantMessage } from '../lib/firebase';
import { fileToBase64, validateAttachmentFile } from '../lib/attachments';
import type { PickedAttachment } from '../lib/attachments';
import { useAssistantThread } from '../hooks/useAssistantThread';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import type { PendingTransaction } from '../types';
import { ChatMessage } from './assistant/ChatMessage';
import { DraftCard } from './assistant/DraftCard';
import { AttachSheet } from './assistant/AttachSheet';
import { Composer } from './assistant/Composer';

interface Props {
  currentSpaceId: string;
  userUid?: string;
  /** True when the user is signed in and cloud sync is on. */
  syncEnabled: boolean;
  onOpenCloudSettings: () => void;
  /** Drafts waiting for a decision; the live version of what draft messages show. */
  pendingTransactions: PendingTransaction[];
  /** False until the first load of pending drafts arrived. */
  pendingReady: boolean;
  /** The same handlers the pending-drafts banner uses. */
  onApproveDraft: (tx: PendingTransaction) => void;
  onEditDraft: (tx: PendingTransaction) => void;
  onDiscardDraft: (id: string) => void;
}

const CHIPS = [
  { label: 'Registrar un gasto', fill: 'Gasté  en ' },
  { label: '¿Cuánto llevo este mes?', send: '¿Cuánto llevo este mes?' },
  { label: 'Subir foto de una factura', attach: true },
] as const;

export default function AssistantTab({
  currentSpaceId,
  userUid,
  syncEnabled,
  onOpenCloudSettings,
  pendingTransactions,
  pendingReady,
  onApproveDraft,
  onEditDraft,
  onDiscardDraft,
}: Props) {
  const enabled = syncEnabled && !!userUid && !!currentSpaceId;
  const { messages, loading, loadError } = useAssistantThread(
    currentSpaceId,
    userUid,
    enabled
  );
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [attachment, setAttachment] = useState<PickedAttachment | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // How many messages the thread had when the last send started: once it has more, the
  // server already shows the message (as "analyzing") and the upload pill can go away.
  const [sentCount, setSentCount] = useState(0);
  const previewUrl = useRef<string | undefined>(undefined);
  const pendingById = useMemo(
    () => new Map(pendingTransactions.map((tx) => [tx.id, tx])),
    [pendingTransactions]
  );
  const endRef = useRef<HTMLDivElement>(null);

  const waiting = messages.some((m) => m.status === 'analyzing');
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [waiting]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  const clearAttachment = useCallback(() => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = undefined;
    setAttachment(null);
  }, []);

  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    []
  );

  const pickFile = useCallback(
    (file: File) => {
      const check = validateAttachmentFile(file);
      if (!check.ok) {
        setAttachError(check.message);
        return;
      }
      clearAttachment();
      setAttachError(null);
      setSendError(null);
      if (check.kind === 'image' && typeof URL.createObjectURL === 'function') {
        previewUrl.current = URL.createObjectURL(file);
      }
      setAttachment({
        file,
        kind: check.kind,
        mime: check.mime,
        previewUrl: previewUrl.current,
      });
    },
    [clearAttachment]
  );

  const send = useCallback(
    async (raw: string, override?: PickedAttachment) => {
      const message = raw.trim();
      const toSend = override ?? attachment;
      if ((!message && !toSend) || sending) return;
      setSending(true);
      setSendError(null);
      setAttachError(null);
      setSentCount(messages.length);
      setText('');

      let encoded: { mime: string; dataBase64: string } | undefined;
      if (toSend) {
        try {
          encoded = {
            mime: toSend.mime,
            dataBase64: await fileToBase64(toSend.file),
          };
        } catch {
          setSending(false);
          setSendError('No pude leer el archivo. Elígelo de nuevo.');
          setText((current) => (current ? current : message));
          return;
        }
      }

      const result = await sendAssistantMessage(currentSpaceId, {
        ...(message ? { text: message } : {}),
        ...(encoded ? { attachment: encoded } : {}),
      });
      setSending(false);
      if (!result.ok) {
        setSendError(result.message);
        setText((current) => (current ? current : message));
        return;
      }
      clearAttachment();
    },
    [attachment, clearAttachment, currentSpaceId, messages.length, sending]
  );

  // A finished voice note goes out right away, shown like any other attached audio.
  const voice = useVoiceRecorder({
    onFinished: (file) => {
      const check = validateAttachmentFile(file);
      if (!check.ok) {
        setAttachError(check.message);
        return;
      }
      clearAttachment();
      const picked: PickedAttachment = {
        file,
        kind: 'audio',
        mime: check.mime,
      };
      setAttachment(picked);
      void send('', picked);
    },
    onError: setSendError,
  });

  // While the upload is in flight and the thread does not show the message yet.
  const uploading =
    sending && attachment !== null && messages.length <= sentCount;
  const shownAttachment =
    sending && messages.length > sentCount ? null : attachment;

  if (!enabled) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-border bg-card p-8 text-center">
        <CloudOff
          className="h-10 w-10 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-xl font-bold text-foreground">
          Para usar el Asistente necesitas la nube
        </h2>
        <p className="text-base text-muted-foreground">
          Inicia sesión y activa “Nube y Compartir”. Así el Asistente puede
          guardar lo que le cuentes en tu espacio.
        </p>
        <button
          type="button"
          onClick={onOpenCloudSettings}
          className="min-h-[52px] rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground"
        >
          Ir a Nube y Compartir
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Asistente"
      className="mx-auto flex h-[calc(100dvh-14rem)] min-h-[420px] max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-background md:h-[calc(100dvh-9rem)]"
    >
      {loadError && (
        <p
          role="alert"
          className="border-b border-border bg-muted px-4 py-3 text-sm text-foreground"
        >
          {loadError}
        </p>
      )}

      <div
        role="log"
        aria-live="polite"
        aria-label="Conversación con el asistente"
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4"
      >
        {loading && (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Cargando conversación…
          </p>
        )}

        {!loading && messages.length === 0 && !loadError && (
          <>
            <div className="flex items-end gap-2">
              <div
                className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <Sprout className="h-4 w-4" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-base text-foreground">
                Hola, soy tu asistente. Cuéntame un gasto o un ingreso, o
                pregúntame cómo vas este mes.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-10">
              {CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() =>
                    'send' in chip
                      ? void send(chip.send)
                      : 'attach' in chip
                        ? setSheetOpen(true)
                        : setText(chip.fill)
                  }
                  className="min-h-[48px] rounded-full border border-primary/30 bg-primary/10 px-4 text-base font-semibold text-primary"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m) => (
          <ChatMessage
            key={m.id}
            message={m}
            now={now}
            onRetry={(retryText) => void send(retryText)}
            retryDisabled={sending}
            renderDraft={(draftMessage) => (
              <DraftCard
                message={draftMessage}
                pending={
                  draftMessage.draftId
                    ? pendingById.get(draftMessage.draftId)
                    : undefined
                }
                ready={pendingReady}
                onApprove={onApproveDraft}
                onEdit={onEditDraft}
                onDiscard={onDiscardDraft}
              />
            )}
          />
        ))}
        <div ref={endRef} />
      </div>

      {(attachError ?? sendError) && (
        <p
          role="alert"
          className="border-t border-border bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100"
        >
          {attachError ?? sendError}
        </p>
      )}
      <Composer
        value={text}
        onChange={setText}
        onSend={() => void send(text)}
        sending={sending}
        attachment={shownAttachment}
        uploading={uploading}
        onOpenAttach={() => setSheetOpen(true)}
        onRemoveAttachment={clearAttachment}
        voiceSupported={voice.supported}
        recording={voice.state === 'recording'}
        recordingSeconds={voice.seconds}
        recordingLevel={voice.level}
        onStartRecording={() => {
          setSendError(null);
          setAttachError(null);
          void voice.start();
        }}
        onStopRecording={voice.stop}
        onCancelRecording={voice.cancel}
      />
      <AttachSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPick={pickFile}
      />
    </section>
  );
}
