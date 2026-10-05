import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { iniciarSentry } from './lib/observabilidade'
import { iniciarCapturaInstalacao } from './lib/mobile/instalar'
import { instalarRecargaPorPedacoPerdido } from './lib/versaoNova'

// Sem VITE_SENTRY_DSN a chamada sai na primeira linha e nada é enviado.
// A configuração (release, identidade, mascaramento de CPF) vive em
// `src/lib/observabilidade.ts`.
iniciarSentry();

// O convite «Instalar app» do Chrome chega uma vez, ao carregar — antes da
// tela do celular existir. Ver `src/lib/mobile/instalar.ts`.
iniciarCapturaInstalacao();

// Deploy novo apagou um pedaço do app que esta aba ainda ia pedir: recarrega
// em vez de mostrar erro. Antes de qualquer `import()`. Ver `src/lib/versaoNova.ts`.
instalarRecargaPorPedacoPerdido();

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
