import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { iniciarSentry } from './lib/observabilidade'

// Sem VITE_SENTRY_DSN a chamada sai na primeira linha e nada é enviado.
// A configuração (release, identidade, mascaramento de CPF) vive em
// `src/lib/observabilidade.ts`.
iniciarSentry();

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
