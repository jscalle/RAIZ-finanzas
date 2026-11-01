import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import SyncPanel from '../components/SyncPanel';

describe('SyncPanel', () => {
  it('renders sync panel when user is not logged in', () => {
    render(
      <SyncPanel
        user={null}
        currentSpaceId="espacio_personal"
        spaceInfo={null}
        onLogin={vi.fn()}
        onEmailLogin={vi.fn()}
        onEmailRegister={vi.fn()}
        onLogout={vi.fn()}
        onJoinSpace={vi.fn()}
        onUploadLocalData={vi.fn()}
        hasLocalData={false}
      />
    );

    expect(screen.getByText('Sincronización en la Nube')).toBeInTheDocument();
  });
});
