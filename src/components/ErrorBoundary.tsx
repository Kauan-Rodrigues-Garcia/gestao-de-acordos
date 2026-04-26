/**
 * src/components/ErrorBoundary.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Componente de Error Boundary para capturar erros não tratados em qualquer
 * subárvore de componentes React, evitando tela branca e exibindo uma UI de
 * recuperação amigável ao usuário.
 *
 * Uso:
 *   <ErrorBoundary>
 *     <SeuComponente />
 *   </ErrorBoundary>
 *
 *   // Com mensagem customizada:
 *   <ErrorBoundary fallbackMessage="Erro ao carregar o painel">
 *     <Dashboard />
 *   </ErrorBoundary>
 *
 *   // Com scope nomeado (aparece no log de erro):
 *   <ErrorBoundary scope="AcordoDetalhe">
 *     <AcordoDetalheInline />
 *   </ErrorBoundary>
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  /** Mensagem exibida na UI de erro. Padrão: mensagem genérica. */
  fallbackMessage?: string;
  /** Nome do escopo para facilitar o debug nos logs. */
  scope?: string;
  /** Componente React alternativo a exibir em caso de erro (sobrescreve a UI padrão). */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const scope = this.props.scope ?? 'ErrorBoundary';
    console.error(`[${scope}] Erro capturado pelo ErrorBoundary:`, error, errorInfo);
    this.setState({ errorInfo });
    Sentry.captureException(error, {
      extra: { componentStack: errorInfo.componentStack, scope },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    this.handleReset();
    // Navega para a raiz sem recarregar (compatível com HashRouter)
    window.location.hash = '/';
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // UI alternativa customizada
    if (this.props.fallback) {
      return this.props.fallback;
    }

    const msg = this.props.fallbackMessage ?? 'Ocorreu um erro inesperado nesta seção.';
    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-[300px] flex items-center justify-center p-6">
        <Card className="max-w-lg w-full border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-3 pb-3">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
            <CardTitle className="text-destructive text-base font-semibold">
              Algo deu errado
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">{msg}</p>

            {/* Detalhes técnicos apenas em desenvolvimento */}
            {isDev && this.state.error && (
              <details className="mt-3 rounded-md bg-muted p-3 text-xs font-mono text-destructive">
                <summary className="cursor-pointer select-none font-sans font-medium text-foreground">
                  Detalhes técnicos (dev)
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack ?? ''}
                </pre>
              </details>
            )}
          </CardContent>

          <CardFooter className="flex gap-2 pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar novamente
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={this.handleGoHome}
              className="gap-1.5"
            >
              <Home className="h-3.5 w-3.5" />
              Ir para o início
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }
}

/**
 * HOC utilitário: envolve um componente funcional com ErrorBoundary automaticamente.
 *
 * Uso:
 *   const SafeDashboard = withErrorBoundary(Dashboard, { scope: 'Dashboard' });
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<Props, 'children'>
) {
  const displayName = Component.displayName ?? Component.name ?? 'Component';
  function Wrapped(props: P) {
    return (
      <ErrorBoundary {...options} scope={options?.scope ?? displayName}>
        <Component {...props} />
      </ErrorBoundary>
    );
  }
  Wrapped.displayName = `withErrorBoundary(${displayName})`;
  return Wrapped;
}

export default ErrorBoundary;
