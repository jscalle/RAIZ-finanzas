import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static supported = new Set<string>();
  static isTypeSupported = (type: string) => FakeRecorder.supported.has(type);
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: unknown,
    options?: { mimeType?: string }
  ) {
    this.mimeType = options?.mimeType ?? '';
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({
      data: new Blob(['abc'], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

const trackStop = vi.fn();
let getUserMedia: ReturnType<typeof vi.fn>;

function setup(options: { maxSeconds?: number } = {}) {
  const onFinished = vi.fn();
  const onError = vi.fn();
  const hook = renderHook(() =>
    useVoiceRecorder({ onFinished, onError, ...options })
  );
  return { onFinished, onError, ...hook };
}
const flush = () => act(async () => {});

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecorder.instances = [];
    FakeRecorder.supported = new Set(['audio/webm;codecs=opus']);
    trackStop.mockClear();
    getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: trackStop }],
    }));
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks for the microphone, records, and counts the seconds', async () => {
    const { result } = setup();
    expect(result.current.supported).toBe(true);
    expect(result.current.state).toBe('idle');

    await act(async () => result.current.start());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.state).toBe('recording');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.seconds).toBe(3);
  });

  it('on stop hands over a file typed like the recorder output and releases the microphone', async () => {
    const { result, onFinished } = setup();
    await act(async () => result.current.start());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => result.current.stop());

    expect(onFinished).toHaveBeenCalledTimes(1);
    const file = onFinished.mock.calls[0][0] as File;
    expect(file.name).toBe('nota-de-voz.webm');
    expect(file.type).toBe('audio/webm;codecs=opus');
    expect(file.size).toBeGreaterThan(0);
    expect(trackStop).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  it('prefers webm/opus, falls back to mp4 for Safari, and otherwise lets the browser choose', async () => {
    FakeRecorder.supported = new Set(['audio/webm;codecs=opus', 'audio/mp4']);
    let hook = setup();
    await act(async () => hook.result.current.start());
    expect(FakeRecorder.instances.at(-1)?.mimeType).toBe(
      'audio/webm;codecs=opus'
    );
    hook.unmount();

    FakeRecorder.supported = new Set(['audio/mp4']);
    hook = setup();
    await act(async () => hook.result.current.start());
    expect(FakeRecorder.instances.at(-1)?.mimeType).toBe('audio/mp4');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => hook.result.current.stop());
    expect((hook.onFinished.mock.calls[0][0] as File).name).toBe(
      'nota-de-voz.m4a'
    );
    hook.unmount();

    FakeRecorder.supported = new Set();
    hook = setup();
    await act(async () => hook.result.current.start());
    expect(FakeRecorder.instances.at(-1)?.mimeType).toBe('');
  });

  it('cancel throws the recording away without sending anything', async () => {
    const { result, onFinished, onError } = setup();
    await act(async () => result.current.start());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    act(() => result.current.cancel());
    expect(onFinished).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
    expect(result.current.seconds).toBe(0);
  });

  it('refuses a recording shorter than one second', async () => {
    const { result, onFinished, onError } = setup();
    await act(async () => result.current.start());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => result.current.stop());
    expect(onFinished).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('muy corta'));
  });

  it('stops by itself at the maximum length and still sends what was recorded', async () => {
    const { result, onFinished } = setup({ maxSeconds: 4 });
    await act(async () => result.current.start());
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('idle');
  });

  it('explains a denied microphone and an unknown error, and stays idle', async () => {
    getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('x'), { name: 'NotAllowedError' })
    );
    const first = setup();
    await act(async () => first.result.current.start());
    expect(first.onError).toHaveBeenCalledWith(
      expect.stringContaining('permiso del micrófono')
    );
    expect(first.result.current.state).toBe('idle');

    getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('x'), { name: 'NotFoundError' })
    );
    const second = setup();
    await act(async () => second.result.current.start());
    expect(second.onError).toHaveBeenCalledWith(
      expect.stringContaining('micrófono')
    );
  });

  it('reports that recording is not available when the browser cannot do it', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const { result, onError } = setup();
    expect(result.current.supported).toBe(false);
    await act(async () => result.current.start());
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('no permite grabar')
    );
  });

  it('releases the microphone when the component goes away mid-recording', async () => {
    const { result, unmount, onFinished } = setup();
    await act(async () => result.current.start());
    unmount();
    await flush();
    expect(trackStop).toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
  });
});
