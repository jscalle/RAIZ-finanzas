import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InfoTip } from './InfoTip';

const setup = () =>
  render(
    <p>
      Disponible
      <InfoTip
        label="Más información sobre el disponible"
        title="Disponible real"
      >
        Es lo que te queda libre este mes.
      </InfoTip>
    </p>
  );
const button = () =>
  screen.getByRole('button', { name: 'Más información sobre el disponible' });

describe('InfoTip', () => {
  it('starts closed: only the small button is on screen, not the explanation', () => {
    setup();
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Es lo que te queda libre este mes.')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the explanation with a title when tapped, and closes when tapped again', () => {
    setup();
    fireEvent.click(button());
    expect(button()).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('dialog', { name: 'Disponible real' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Es lo que te queda libre este mes.')
    ).toBeInTheDocument();
    fireEvent.click(button());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with Escape, with the backdrop, and with the Entendido button', () => {
    setup();
    fireEvent.click(button());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(button());
    fireEvent.click(
      screen.getByRole('button', { name: 'Cerrar', hidden: true })
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(button());
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('gives the button back the focus when it closes', () => {
    setup();
    button().focus();
    fireEvent.click(button());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(button()).toHaveFocus();
  });

  it('does not submit a surrounding form when tapped', () => {
    setup();
    expect(button()).toHaveAttribute('type', 'button');
  });
});
