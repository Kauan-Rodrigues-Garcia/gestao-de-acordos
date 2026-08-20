/**
 * testeLocal.ts — o botão "Testar" da comemoração.
 *
 * O teste roda inteiro no navegador de quem clicou: um CustomEvent no `window`
 * que o overlay escuta. **Nada é gravado, nada trafega.**
 *
 * Isso não é economia de código, é a garantia: se o teste passasse pela tabela,
 * bastaria um erro na RLS para o ensaio do líder explodir na tela da empresa
 * inteira. Do jeito que está, é impossível — o dado nem sai da aba.
 *
 * Mesmo mecanismo do `petEvents.ts`: zero acoplamento, quem dispara não precisa
 * saber se o overlay está montado.
 */
import type { PessoaComemoracao } from '@/services/comemoracoes.service';
import type { LayoutComemoracao } from './layout';
import type { EfeitoId, SomId } from './catalogo';

export const EVENTO_TESTE = 'comemoracao:testar';

/** O que o overlay precisa para desenhar a comemoração de teste. */
export interface ComemoracaoTeste {
  titulo:       string;
  mensagem:     string | null;
  homenageados: PessoaComemoracao[];
  efeito:       EfeitoId;
  som:          SomId;
  gifUrl:       string | null;
  somUrl:       string | null;
  /** Segundo em que a música começa. Toca por `duracaoS`. */
  somInicioS:   number;
  layout:       LayoutComemoracao;
  duracaoS:     number;
  /** Entrada do texto. Ausente = 'subir'. */
  animTexto?:   string;
  /** Percentual do volume padrão. Ausente = 100. */
  volume?:      number;
}

/** Dispara o ensaio na própria tela. */
export function dispararTeste(comemoracao: ComemoracaoTeste): void {
  try {
    window.dispatchEvent(new CustomEvent<ComemoracaoTeste>(EVENTO_TESTE, { detail: comemoracao }));
  } catch {
    // Nunca pode derrubar a tela de montagem — é só um ensaio.
  }
}

/** Escuta os ensaios. Devolve a função de cancelamento. */
export function ouvirTeste(aoTestar: (c: ComemoracaoTeste) => void): () => void {
  const handler = (e: Event) => {
    const detalhe = (e as CustomEvent<ComemoracaoTeste>).detail;
    if (detalhe) aoTestar(detalhe);
  };
  window.addEventListener(EVENTO_TESTE, handler);
  return () => window.removeEventListener(EVENTO_TESTE, handler);
}
