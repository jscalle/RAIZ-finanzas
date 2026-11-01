import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render its children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <p>Healthy content</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('Healthy content')).toBeInTheDocument();
  });

  it('should render the fallback UI when a child throws', () => {
    // React logs the caught error to console.error; silence it for a clean run.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom message="Render failed" />
      </ErrorBoundary>
    );

    expect(
      screen.getByText('Algo salió mal en la interfaz')
    ).toBeInTheDocument();
    // The thrown error message is surfaced in the fallback.
    expect(screen.getByText('Render failed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Recargar Aplicación/i })
    ).toBeInTheDocument();
  });

  it('should not render the healthy children once the fallback is shown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom message="Crash" />
        <span>Should not appear</span>
      </ErrorBoundary>
    );

    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
  });
});
