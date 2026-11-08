import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import SyncPanel from '../components/SyncPanel';

vi.mock('../components/SpaceMembersList', () => ({
  SpaceMembersList: () => <div data-testid="members-list" />,
}));

type PanelProps = React.ComponentProps<typeof SyncPanel>;

const signedInUser = {
  uid: 'uid_1',
  email: 'owner@demo.com',
} as unknown as PanelProps['user'];

const mySpace = {
  id: 'espacio_u_uid_1',
  name: 'Presupuesto de owner',
  code: 'ESP-ABC12345',
  ownerUid: 'uid_1',
  members: ['uid_1'],
} as unknown as PanelProps['spaceInfo'];

function renderPanel(overrides: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    user: null,
    currentSpaceId: 'espacio_personal',
    spaceInfo: null,
    onLogin: vi.fn(),
    onEmailLogin: vi.fn(),
    onEmailRegister: vi.fn(),
    onLogout: vi.fn(),
    onJoinSpace: vi.fn().mockResolvedValue(undefined),
    onUploadLocalData: vi.fn(),
    hasLocalData: false,
    ...overrides,
  };
  render(<SyncPanel {...props} />);
  return props;
}

function renderSignedIn(overrides: Partial<PanelProps> = {}) {
  return renderPanel({
    user: signedInUser,
    currentSpaceId: 'espacio_u_uid_1',
    personalSpaceId: 'espacio_u_uid_1',
    spaceInfo: mySpace,
    onRevokeMember: vi.fn(),
    ...overrides,
  });
}

describe('SyncPanel signed out', () => {
  it('shows the Google button first, without expanding anything', () => {
    renderPanel();

    expect(screen.getByText('Nube y Finanzas Compartidas')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Continuar con Google/i })
    ).toBeInTheDocument();
  });

  it('links first-time users to the onboarding guide in a new tab', () => {
    renderPanel();

    const link = screen.getByRole('link', { name: /guía de inicio/i });
    expect(link).toHaveAttribute('href', '/guia');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('calls onLogin when the Google button is pressed', () => {
    const props = renderPanel();
    fireEvent.click(
      screen.getByRole('button', { name: /Continuar con Google/i })
    );
    expect(props.onLogin).toHaveBeenCalledTimes(1);
  });

  it('offers only "Continuar con Google" without an email/password form', () => {
    renderPanel();

    expect(
      screen.getByRole('button', { name: /Continuar con Google/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Usar correo y contraseña/i })
    ).toBeNull();
    expect(screen.queryByLabelText(/Correo electrónico/i)).toBeNull();
    expect(screen.queryByLabelText(/^Contraseña/i)).toBeNull();
  });
});

describe('SyncPanel Account preferences & OS automation', () => {
  it('switches theme mode between Claro, Oscuro and Sistema', () => {
    const onThemeModeChange = vi.fn();
    renderSignedIn({ themeMode: 'system', onThemeModeChange });

    fireEvent.click(screen.getByRole('button', { name: /Oscuro/i }));
    expect(onThemeModeChange).toHaveBeenCalledWith('dark');

    fireEvent.click(screen.getByRole('button', { name: /Claro/i }));
    expect(onThemeModeChange).toHaveBeenCalledWith('light');
  });

  it('hides the entire bank automation section on Desktop (web)', () => {
    renderSignedIn({ detectedOS: 'web' });

    expect(
      screen.queryByText(/Registro Automático de Movimientos Bancarios/i)
    ).toBeNull();
    expect(screen.queryByTestId('android-automation-card')).toBeNull();
    expect(screen.queryByTestId('ios-automation-card')).toBeNull();
  });

  it('renders only Android NotificationListener card when OS is Android (hiding iOS)', async () => {
    const onToggleAndroidAuto = vi.fn();
    renderSignedIn({
      androidAutoEnabled: false,
      onToggleAndroidAuto,
      detectedOS: 'android',
    });

    expect(screen.getByText(/Android detectado/i)).toBeInTheDocument();
    expect(screen.getByTestId('android-automation-card')).toBeInTheDocument();
    expect(screen.queryByTestId('ios-automation-card')).toBeNull();

    const androidBtn = screen.getByRole('button', {
      name: /Conectar Notificaciones en Android/i,
    });
    fireEvent.click(androidBtn);
    await waitFor(() =>
      expect(onToggleAndroidAuto).toHaveBeenCalledWith(true)
    );
  });

  it('renders only iOS Shortcut automation card when OS is iOS (hiding Android) and connects Shortcut', async () => {
    const onToggleIosAuto = vi.fn();
    renderSignedIn({
      iosAutoEnabled: false,
      onToggleIosAuto,
      detectedOS: 'ios',
    });

    expect(screen.getByText(/iOS detectado/i)).toBeInTheDocument();
    expect(screen.getByTestId('ios-automation-card')).toBeInTheDocument();
    expect(screen.queryByTestId('android-automation-card')).toBeNull();

    const iosBtn = screen.getByRole('button', {
      name: /Generar y Conectar Atajo en iOS/i,
    });
    fireEvent.click(iosBtn);
    await waitFor(() => expect(onToggleIosAuto).toHaveBeenCalledWith(true));
  });
});

describe('SyncPanel signed in', () => {
  it('shows the three blocks: Mi espacio, Personas, Unirme a otro espacio', () => {
    renderSignedIn();

    expect(
      screen.getByRole('heading', { name: 'Mi espacio' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Personas' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Unirme a otro espacio' })
    ).toBeInTheDocument();
    expect(screen.getByText('Presupuesto de owner')).toBeInTheDocument();
    expect(screen.getByText('ESP-ABC12345')).toBeInTheDocument();
    expect(screen.getByTestId('members-list')).toBeInTheDocument();
    expect(screen.queryByText(/Accesos r[aá]pidos/i)).toBeNull();
    expect(screen.queryByText(/anfitri[oó]n/i)).toBeNull();
  });

  it('joins with a single code field and an undefined name', async () => {
    const props = renderSignedIn();

    expect(screen.queryByLabelText(/Nombre del espacio/i)).toBeNull();
    fireEvent.change(
      screen.getByLabelText(/Código del espacio/i, { selector: 'input' }),
      {
        target: { value: ' ESP-TARGET ' },
      }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar acceso' }));

    await waitFor(() =>
      expect(props.onJoinSpace).toHaveBeenCalledWith('ESP-TARGET', '')
    );
  });

  it('shows pending requests with Aceptar / Denegar', () => {
    const req = {
      id: 'r1',
      requesterEmail: 'other@demo.com',
      requesterName: 'Other',
    } as unknown as NonNullable<PanelProps['pendingRequests']>[number];
    const props = renderSignedIn({
      pendingRequests: [req],
      onApproveRequest: vi.fn(),
      onRejectRequest: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: /Aceptar/i }));
    expect(props.onApproveRequest).toHaveBeenCalledWith(req);
    fireEvent.click(screen.getByRole('button', { name: /Denegar/i }));
    expect(props.onRejectRequest).toHaveBeenCalledWith('r1');
  });

  it('shows the requester pending state using the term "dueño"', () => {
    const onCancelMyRequest = vi.fn();
    renderSignedIn({
      activePendingRequest: {
        spaceId: 's',
        requestId: 'r',
        spaceName: 'Espacio Objetivo',
      },
      onCancelMyRequest,
    });

    expect(screen.getByText('Solicitud enviada')).toBeInTheDocument();
    expect(screen.getByText(/Esperando al dueño/i)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /Cancelar solicitud/i })
    );
    expect(onCancelMyRequest).toHaveBeenCalledTimes(1);
  });

  it('shows the "otro espacio" strip outside the personal space', () => {
    renderSignedIn({ currentSpaceId: 'espacio_compartido' });

    expect(screen.getByText(/Estás en otro espacio/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Volver a mi espacio' })
    ).toBeInTheDocument();
  });

  it('calls onJoinSpace(personalSpaceId) from the strip', () => {
    const props = renderSignedIn({ currentSpaceId: 'espacio_compartido' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Volver a mi espacio' })
    );
    expect(props.onJoinSpace).toHaveBeenCalledWith('espacio_u_uid_1');
  });

  it('hides the strip when the active space is the personal one', () => {
    renderSignedIn();
    expect(screen.queryByText(/Estás en otro espacio/i)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Volver a mi espacio' })
    ).toBeNull();
  });
});

describe('SyncPanel more options', () => {
  it('keeps "Más opciones" collapsed and reveals the Telegram command', () => {
    renderSignedIn();

    const toggle = screen.getByRole('button', { name: /Más opciones/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('/conectar ESP-ABC12345')).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Conectar Telegram')).toBeInTheDocument();
    expect(screen.getByText('/conectar ESP-ABC12345')).toBeInTheDocument();
  });

  it('copies the Telegram command', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderSignedIn();
    fireEvent.click(screen.getByRole('button', { name: /Más opciones/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Copiar comando de Telegram/i })
    );

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('/conectar ESP-ABC12345')
    );
  });

  it('offers "Subir mis registros locales" only with local data', () => {
    renderSignedIn({ hasLocalData: false });
    fireEvent.click(screen.getByRole('button', { name: /Más opciones/i }));
    expect(
      screen.queryByRole('button', { name: /Subir mis registros locales/i })
    ).toBeNull();
  });

  it('uploads local records when available', () => {
    const props = renderSignedIn({ hasLocalData: true });
    fireEvent.click(screen.getByRole('button', { name: /Más opciones/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Subir mis registros locales/i })
    );
    expect(props.onUploadLocalData).toHaveBeenCalledTimes(1);
  });
});
