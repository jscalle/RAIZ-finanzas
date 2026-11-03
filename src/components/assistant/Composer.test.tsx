import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Composer, formatClock } from './Composer';
import type { PickedAttachment } from '../../lib/attachments';

const base = {
  value: '',
  onChange: vi.fn(),
  onSend: vi.fn(),
  sending: false,
  attachment: null as PickedAttachment | null,
  uploading: false,
  onOpenAttach: vi.fn(),
  onRemoveAttachment: vi.fn(),
  voiceSupported: true,
  recording: false,
  recordingSeconds: 0,
  recordingLevel: 0,
  onStartRecording: vi.fn(),
  onStopRecording: vi.fn(),
  onCancelRecording: vi.fn(),
};
const pick = (kind: 'image' | 'audio', name: string): PickedAttachment => ({
  file: new File(['x'], name),
  kind,
  mime: kind === 'image' ? 'image/jpeg' : 'audio/webm',
});

describe('Composer attachment pill', () => {
  it('shows a photo icon for a photo without a preview and a microphone for audio', () => {
    const { container, rerender } = render(
      <Composer {...base} attachment={pick('image', 'factura.jpg')} />
    );
    expect(container.querySelector('svg.lucide-image')).not.toBeNull();
    rerender(<Composer {...base} attachment={pick('audio', 'nota.webm')} />);
    expect(container.querySelector('svg.lucide-mic')).not.toBeNull();
    expect(container.querySelector('svg.lucide-image')).toBeNull();
  });

  it('has a short placeholder that fits a phone', () => {
    render(<Composer {...base} />);
    expect(screen.getByLabelText('Escribe tu mensaje')).toHaveAttribute(
      'placeholder',
      'Escribe aquí…'
    );
  });
});

describe('formatClock', () => {
  it('formats seconds as m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(180)).toBe('3:00');
  });
});
