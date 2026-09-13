import { Suspense, useEffect, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useJaAbriu } from '@/hooks/useSobDemanda';

interface PainelSobDemandaProps {
  /** O mesmo `aberto` que o painel recebe. */
  aberto: boolean;
  /** Nome para o Sentry e para o aviso de falha. */
  nome: string;
  /**
   * Chamado quando o download falha de vez. Para quem precisa desfazer o
   * próprio estado — a janela do chat, que sem isto ficaria «aberta» e vazia,
   * escondendo até a bolha que a reabriria.
   */
  onFalha?: () => void;
  /** O painel `lazy`. */
  children: ReactNode;
}

/**
 * Casca de um painel que só baixa quando alguém o abre.
 *
 * - Nada é montado antes da primeira abertura — é isso que tira o painel do
 *   pacote de entrada sem pagar o download em quem nunca clica.
 * - Depois de aberto uma vez, fica montado: o `aberto={false}` seguinte chega
 *   ao painel e ele fecha com a animação dele. Ver `useJaAbriu`.
 * - `Suspense` sem fallback: o painel é uma camada por cima da tela, e um
 *   esqueleto piscando antes dele seria mais ruído que a espera. Com o
 *   pré-carregamento, a espera costuma nem existir.
 * - Boundary próprio: se o download falhar mesmo depois da segunda tentativa,
 *   o erro para AQUI, com um aviso, em vez de subir até o boundary do App e
 *   trocar a tela inteira por «Erro crítico na aplicação».
 */
export function PainelSobDemanda({ aberto, nome, onFalha, children }: PainelSobDemandaProps) {
  const jaAbriu = useJaAbriu(aberto);
  if (!jaAbriu) return null;
  return (
    <ErrorBoundary
      scope={`PainelSobDemanda:${nome}`}
      fallback={<AvisoFalha nome={nome} onFalha={onFalha} />}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * O que aparece no lugar do painel que não carregou: um toast, e nada na tela.
 *
 * Quase sempre é um deploy novo com a aba antiga aberta — os arquivos que ela
 * pede não existem mais. Recarregar resolve, e é o que o aviso diz.
 */
function AvisoFalha({ nome, onFalha }: { nome: string; onFalha?: () => void }) {
  // Por ref: `onFalha` costuma ser uma arrow nova a cada render de quem o passa,
  // e nas dependências repetiria o aviso a cada render. Um aviso por falha.
  const onFalhaRef = useRef(onFalha);
  useEffect(() => { onFalhaRef.current = onFalha; });

  useEffect(() => {
    toast.error(`Não foi possível abrir: ${nome}`, {
      description: 'Pode ser uma versão nova do sistema. Recarregue a página e tente de novo.',
    });
    onFalhaRef.current?.();
  }, [nome]);
  return <span hidden />;
}
