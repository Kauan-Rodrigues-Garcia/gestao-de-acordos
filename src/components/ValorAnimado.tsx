/**
 * ValorAnimado — o número anda até o novo valor em vez de saltar.
 *
 * ## Por que isto importa aqui
 *
 * Depois da mudança para atualização incremental, a tela deixa de piscar — e
 * ganha um problema novo: um total que troca de R$ 12.400,00 para R$ 12.850,00
 * sem nenhum movimento não é percebido. Antes, o piscar avisava; sem ele, o
 * número muda e ninguém vê.
 *
 * A animação é o aviso. Ela é curta, contínua e local: só o nó de texto muda,
 * o resto da linha fica parado.
 *
 * ## Custo, e como ele é contido
 *
 * Cada quadro é um `setState`, então o componente PRECISA ser folha — daí ele
 * existir separado, em vez de virar uma função de formatação usada no meio de
 * uma célula grande. Numa tabela de 100 linhas quem re-renderiza são os 100
 * `<span>`, não as 100 `<tr>`.
 *
 * Três travas de custo:
 *
 *   • valor igual não anima (nem agenda quadro);
 *   • a primeira renderização não anima — subir de zero na carga inicial seria
 *     um efeito de abertura, não um aviso de mudança;
 *   • `prefers-reduced-motion` desliga a interpolação e mantém o valor certo.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Quanto tempo o número leva para chegar. Curto: é aviso, não espetáculo. */
const DURACAO_MS = 420;

/** O sistema pediu menos movimento? */
function movimentoReduzido(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Saída do cubic-bosso padrão da Apple: rápido no início, assenta no fim. */
function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export interface ValorAnimadoProps {
  valor: number;
  /** Como o número vira texto. Ex.: `formatCurrency`. */
  formatar: (v: number) => string;
  className?: string;
  /**
   * Classe aplicada durante a transição — um realce discreto.
   * Ex.: `'text-emerald-400'` para subida.
   */
  classeSubindo?: string;
  classeDescendo?: string;
  /**
   * O número ainda não é conhecido — primeira carga sem instantâneo em cache.
   *
   * Renderiza uma barra do TAMANHO que o número vai ocupar, e não um traço ou
   * um zero. Um traço mente por omissão; um zero mente por afirmação; e os dois
   * empurram o resto do cartão quando o valor real chega. A barra reserva o
   * espaço e some sem mover nada.
   */
  carregando?: boolean;
  /** Rótulo para leitor de tela, quando o número sozinho não se explica. */
  'aria-label'?: string;
}

export function ValorAnimado({
  valor, formatar, className, classeSubindo, classeDescendo, carregando = false, ...resto
}: ValorAnimadoProps) {
  const [exibido, setExibido] = useState(valor);
  const anterior = useRef(valor);
  const primeira = useRef(true);
  const [direcao, setDirecao] = useState<'sobe' | 'desce' | null>(null);

  useEffect(() => {
    const de = anterior.current;
    anterior.current = valor;

    // Carga inicial: mostra o número, sem contar de zero até ele.
    if (primeira.current) {
      primeira.current = false;
      setExibido(valor);
      return;
    }
    if (de === valor) return;

    if (movimentoReduzido()) {
      setExibido(valor);
      return;
    }

    setDirecao(valor > de ? 'sobe' : 'desce');

    let quadro = 0;
    const inicio = performance.now();

    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_MS);
      setExibido(de + (valor - de) * suavizar(t));
      if (t < 1) {
        quadro = requestAnimationFrame(passo);
      } else {
        // Chega no valor EXATO: interpolação em ponto flutuante para em
        // 12.849,999… e o texto mostraria um centavo a menos.
        setExibido(valor);
        setDirecao(null);
      }
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor]);

  const texto = formatar(exibido);

  if (carregando) {
    return (
      <span className={cn('tabular-nums relative inline-flex items-center', className)} {...resto}>
        {/* O texto real fica no fluxo, invisível: é ele que dá a largura certa,
            sem nenhuma tabela de "quantos ch tem um valor em reais". */}
        <span aria-hidden="true" className="invisible">{texto}</span>
        <span
          aria-hidden="true"
          className="absolute inset-y-[15%] left-0 right-[10%] rounded bg-muted animate-pulse"
        />
        <span className="sr-only">Carregando…</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'tabular-nums transition-colors duration-300',
        direcao === 'sobe'  && classeSubindo,
        direcao === 'desce' && classeDescendo,
        className,
      )}
      {...resto}
    >
      {texto}
    </span>
  );
}

export default ValorAnimado;
