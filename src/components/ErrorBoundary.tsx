import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReload = () => {
    (this as React.Component<Props, State>).setState({
      hasError: false,
      error: null,
    });
    window.location.reload();
  };

  render() {
    const instance = this as unknown as React.Component<Props, State>;
    if (instance.state?.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
          <div className="bg-card border border-border/40 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl space-y-4">
            <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl w-max mx-auto">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Algo salió mal en la interfaz
              </h2>
              <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                {instance.state.error?.message ||
                  'Se produjo un error inesperado al renderizar este componente.'}
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="w-full py-2.5 bg-primary text-primary-foreground font-bold text-xs rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    return instance.props.children;
  }
}

export default ErrorBoundary;
