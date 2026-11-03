import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AttachSheet } from './AttachSheet';

const setup = (open = true) => {
  const onClose = vi.fn();
  const onPick = vi.fn();
  const view = render(
    <AttachSheet open={open} onClose={onClose} onPick={onPick} />
  );
  return { onClose, onPick, ...view };
};
const inputFor = (label: string) =>
  screen.getByText(label).closest('label')!.querySelector('input')!;

describe('AttachSheet', () => {
  it('renders nothing when closed', () => {
    setup(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers photo, gallery and audio only, never video', () => {
    setup();
    expect(
      screen.getByRole('dialog', { name: 'Adjuntar' })
    ).toBeInTheDocument();
    expect(inputFor('Tomar foto')).toHaveAttribute('accept', 'image/*');
    expect(inputFor('Tomar foto')).toHaveAttribute('capture', 'environment');
    expect(inputFor('Elegir de la galería')).toHaveAttribute(
      'accept',
      'image/*'
    );
    expect(inputFor('Elegir de la galería')).not.toHaveAttribute('capture');
    expect(inputFor('Subir audio')).toHaveAttribute('accept', 'audio/*');
    expect(document.body.innerHTML.toLowerCase()).not.toContain('video');
  });

  it('hands the chosen file to the caller and closes', () => {
    const { onPick, onClose } = setup();
    const file = new File(['x'], 'factura.jpg', { type: 'image/jpeg' });
    fireEvent.change(inputFor('Elegir de la galería'), {
      target: { files: [file] },
    });
    expect(onPick).toHaveBeenCalledWith(file);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes with Cancelar, the backdrop and Escape without picking anything', () => {
    const { onClose, onPick } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar', hidden: true })
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('puts keyboard focus on the first option when it opens', () => {
    setup();
    expect(inputFor('Tomar foto')).toHaveFocus();
  });
});
