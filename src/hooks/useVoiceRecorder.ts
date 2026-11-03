import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_RECORDING_SECONDS = 180;
export const MIN_RECORDING_SECONDS = 1;

const PREFERRED_TYPES = ['audio/webm;codecs=opus', 'audio/mp4'];

interface Options {
  /** Called with the finished recording (not called when cancelled or too short). */
  onFinished: (file: File) => void;
  /** Called with a plain-Spanish message when recording cannot start or the note is unusable. */
  onError: (message: string) => void;
  maxSeconds?: number;
}

const isSupported = () =>
  typeof MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

function startErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Para grabar necesito permiso del micrófono. Actívalo en los ajustes del navegador o del teléfono.';
  }
  if (name === 'NotFoundError') {
    return 'No encontré un micrófono en este dispositivo.';
  }
  return 'No pude empezar a grabar. Intenta de nuevo.';
}

/**
 * Tap-to-record voice notes: start, then stop to finish (or cancel to throw it away).
 * Prefers webm/opus (Chrome, Android) and falls back to mp4 (Safari). Releases the
 * microphone on stop, cancel and unmount.
 */
export function useVoiceRecorder({
  onFinished,
  onError,
  maxSeconds = MAX_RECORDING_SECONDS,
}: Options) {
  const [state, setState] = useState<'idle' | 'recording'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);

  const handlers = useRef({ onFinished, onError });
  useEffect(() => {
    handlers.current = { onFinished, onError };
  });

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const audio = useRef<{
    context: AudioContext;
    analyser: AnalyserNode;
  } | null>(null);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audio.current?.context.close?.().catch(() => {});
    audio.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== 'inactive')
      recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (recorder.current && recorder.current.state !== 'inactive') return;
    if (!isSupported()) {
      handlers.current.onError(
        'Este navegador no permite grabar audio. Puedes subir un audio con el botón +.'
      );
      return;
    }
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      handlers.current.onError(startErrorMessage(error));
      return;
    }

    const preferred = PREFERRED_TYPES.find((type) =>
      MediaRecorder.isTypeSupported(type)
    );
    const rec = new MediaRecorder(
      media,
      preferred ? { mimeType: preferred } : undefined
    );
    stream.current = media;
    recorder.current = rec;
    chunks.current = [];
    cancelled.current = false;

    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.current.push(event.data);
    };
    rec.onstop = () => {
      const elapsed = (Date.now() - startedAt.current) / 1000;
      const type = rec.mimeType || preferred || 'audio/webm';
      const wasCancelled = cancelled.current;
      const parts = chunks.current;
      release();
      recorder.current = null;
      setState('idle');
      setSeconds(0);
      setLevel(0);
      if (wasCancelled) return;
      if (elapsed < MIN_RECORDING_SECONDS) {
        handlers.current.onError(
          'La nota quedó muy corta. Mantén la grabación un poco más.'
        );
        return;
      }
      const extension = type.includes('mp4') ? 'm4a' : 'webm';
      handlers.current.onFinished(
        new File(parts, `nota-de-voz.${extension}`, { type })
      );
    };

    // Optional level meter; the recording works without it.
    const AudioCtx =
      typeof window !== 'undefined'
        ? (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext)
        : undefined;
    if (AudioCtx) {
      try {
        const context = new AudioCtx();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(media).connect(analyser);
        audio.current = { context, analyser };
      } catch {
        audio.current = null;
      }
    }

    startedAt.current = Date.now();
    rec.start();
    setState('recording');
    setSeconds(0);
    timer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (audio.current) {
        const data = new Uint8Array(audio.current.analyser.fftSize);
        audio.current.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) sum += ((value - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
      }
      if (elapsed >= maxSeconds) stop();
    }, 100);
  }, [maxSeconds, release, stop]);

  // Leaving the screen mid-recording drops it and frees the microphone.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (recorder.current && recorder.current.state !== 'inactive') {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      release();
    },
    [release]
  );

  return {
    state,
    seconds,
    level,
    supported: isSupported(),
    start,
    stop,
    cancel,
  };
}
