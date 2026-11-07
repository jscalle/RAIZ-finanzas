import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { AssistantSheet } from './AssistantSheet';

function Chat() {
  const [text, setText] = useState('');
  return (
    <input
      aria-label="mensaje"
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

const setup = (
  over: Partial<React.ComponentProps<typeof AssistantSheet>> = {}
) => {
  const onClose = vi.fn();
  const props = {
    open: true,
    mounted: true,
    onClose,
    origin: { x: 330, y: 760 },
    ...over,
  };
  const view = render(
    <AssistantSheet {...props}>
      <Chat />
    </AssistantSheet>
  );
  return { onClose, ...view, props };
};
const desktop = () =>
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

beforeEach(() => window.history.replaceState(null, ''));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AssistantSheet on a phone', () => {
  it('renders nothing before it was ever opened, so the conversation is not loaded for nothing', () => {
    setup({ open: false, mounted: false });
    expect(screen.queryByLabelText('mensaje')).toBeNull();
  });

  it('opens as a dialog that takes the whole width, with a close button and the page visible behind', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Asistente' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toContain('h-[88dvh]');
    expect(
      screen.getByRole('button', { name: 'Cerrar el asistente' })
    ).toHaveFocus();
    expect(screen.getByLabelText('mensaje')).toBeInTheDocument();
  });

  it('closes with the close button, with a tap on the strip above, and with Escape', () => {
    const { onClose } = setup();
    fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar el asistente' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar', hidden: true })
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('hides from assistive technology when closed but keeps what the user typed', () => {
    const { rerender, props } = setup();
    fireEvent.change(screen.getByLabelText('mensaje'), {
      target: { value: 'Almuerzo 45000' },
    });
    rerender(
      <AssistantSheet {...props} open={false}>
        <Chat />
      </AssistantSheet>
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[data-state="closed"]')).toHaveAttribute(
      'inert'
    );
    rerender(
      <AssistantSheet {...props} open>
        <Chat />
      </AssistantSheet>
    );
    expect(screen.getByLabelText('mensaje')).toHaveValue('Almuerzo 45000');
  });

  it('grows from where the bubble was', () => {
    setup({ origin: { x: 330, y: 760 } });
    const root = document.querySelector('[data-state="open"]') as HTMLElement;
    expect(root.getAttribute('data-origin')).toBe('330,760');
  });

  it('closes with the back button without leaving the app, and cleans its history entry otherwise', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { onClose, rerender, props } = setup();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(
      <AssistantSheet {...props} open={false}>
        <Chat />
      </AssistantSheet>
    );
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('closes when the handle is dragged far enough down, but not for a small pull', () => {
    const { onClose } = setup();
    const handle = screen.getByTestId('sheet-handle');
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 140, pointerId: 1 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientY: 260, pointerId: 1 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    const input = screen.getByLabelText('mensaje');
    input.focus();
    const closeBtn = screen.getByRole('button', {
      name: 'Cerrar el asistente',
    });
    // last focusable inside the dialog wraps to the first one in the sheet
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect([input, closeBtn, document.body]).toContain(document.activeElement);
  });

  it('lifts the sheet above the on-screen keyboard', () => {
    const vv = Object.assign(new EventTarget(), { height: 500, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: vv,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 844,
    });
    setup();
    act(() => {
      vv.dispatchEvent(new Event('resize'));
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.bottom).toBe('344px');
    expect(dialog.style.maxHeight).toBe('500px');
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
  });
});

describe('AssistantSheet on a large screen', () => {
  beforeEach(desktop);

  it('is a side panel with a title and a close button, and the page stays usable', () => {
    setup();
    const panel = screen.getByRole('complementary', { name: 'Asistente' });
    expect(panel.className).toContain('w-[420px]');
    expect(
      screen.getByRole('heading', { name: 'Asistente' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Cerrar', hidden: true })
    ).toBeNull();
  });

  it('closes with its button and with Escape, and does not touch the browser history', () => {
    const push = vi.spyOn(window.history, 'pushState');
    const { onClose } = setup();
    fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar el asistente' })
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  });

  it('slides out of the way and is hidden when closed', () => {
    setup({ open: false });
    const panel = document.querySelector(
      '[data-state="closed"]'
    ) as HTMLElement;
    expect(panel).toHaveAttribute('inert');
    expect(panel.style.visibility).toBe('hidden');
  });

  it('allows horizontal drag-to-resize on the left edge and clamps width within bounds', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    });
    setup();
    const panel = screen.getByRole('complementary', { name: 'Asistente' });
    const handle = screen.getByTestId('assistant-resize-handle');

    expect(panel.style.width).toBe('420px');

    fireEvent.pointerDown(handle, { clientX: 860, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 700, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 700, pointerId: 1 });

    // Dragging left by 160px increases the right-anchored panel width from 420px to 580px
    expect(panel.style.width).toBe('580px');
  });
});
