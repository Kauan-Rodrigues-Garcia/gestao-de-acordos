/**
 * useEasterEggCriadores — cinco cliques rápidos no logo abrem o Creators Lab.
 * ─────────────────────────────────────────────────────────────────────────────
 * ## Onde este hook PRECISA ser chamado
 *
 * No corpo de `Layout`, e não dentro de `SidebarContent`. Aquele componente é
 * definido dentro do corpo do `Layout` e usado como `<SidebarContent />`: a
 * identidade da função muda a cada render, então o React desmonta e remonta o
 * componente inteiro, zerando qualquer estado de hook que estivesse ali. O
 * contador de cliques simplesmente nunca passaria de 1.
 *
 * ## A janela
 *
 * Cinco cliques em até 3 segundos, contados a partir do PRIMEIRO. Passou disso,
 * o contador zera e a contagem recomeça do clique atual — quem clicou devagar
 * não fica preso num estado meio-aberto.
 *
 * O clique continua funcionando normalmente para o resto da interface: este
 * hook só observa, não impede nada.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Tempo máximo entre o primeiro e o quinto clique. */
export const JANELA_MS = 3000;
export const CLIQUES_NECESSARIOS = 5;

export const CHAVE_DESCOBERTO = 'creatorsLab:descoberto';

/**
 * Decide o que fazer com um clique novo.
 *
 * Pura, para poder ser testada sem relógio nem React: recebe o estado e o
 * instante, devolve o estado seguinte.
 */
export function proximoEstado(
  cliquesAtuais: number,
  primeiroEm: number | null,
  agora: number,
): { cliques: number; primeiroEm: number; abrir: boolean } {
  // Primeiro clique, ou janela vencida: recomeça a contagem a partir de agora.
  const expirou = primeiroEm === null || agora - primeiroEm > JANELA_MS;
  if (expirou) return { cliques: 1, primeiroEm: agora, abrir: false };

  const cliques = cliquesAtuais + 1;
  return { cliques, primeiroEm, abrir: cliques >= CLIQUES_NECESSARIOS };
}

/** Já encontrou o Lab alguma vez neste navegador? */
export function jaDescobriu(): boolean {
  try { return localStorage.getItem(CHAVE_DESCOBERTO) === 'true'; } catch { return false; }
}

export function marcarDescoberto(): void {
  try { localStorage.setItem(CHAVE_DESCOBERTO, 'true'); } catch { /* modo privado */ }
}

export interface EasterEggCriadores {
  /** Ligue no onClick do logo. */
  aoClicar: () => void;
  /**
   * 0 a 4 — quanto o logo já reagiu.
   *   0 nada · 1 nada perceptível · 2 leve reação
   *   3 micro falha · 4 interferência
   */
  estagio: number;
  /** O quinto clique aconteceu: rode a abertura. */
  ativado: boolean;
  /** Já descobriu antes — o logo ganha uma marca discreta. */
  descoberto: boolean;
}

export function useEasterEggCriadores(
  aoAtivar: () => void,
): EasterEggCriadores {
  const [estagio, setEstagio] = useState(0);
  const [ativado, setAtivado] = useState(false);
  const [descoberto, setDescoberto] = useState(jaDescobriu);

  const cliquesRef    = useRef(0);
  const primeiroRef   = useRef<number | null>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aoAtivarRef   = useRef(aoAtivar);
  aoAtivarRef.current = aoAtivar;

  // Um timer só, sempre limpo. Sem isto, clicar sete vezes deixaria sete
  // timers pendentes prontos para zerar o contador em momentos aleatórios.
  const limparTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => limparTimer, [limparTimer]);

  const aoClicar = useCallback(() => {
    const agora = Date.now();
    const r = proximoEstado(cliquesRef.current, primeiroRef.current, agora);

    cliquesRef.current  = r.cliques;
    primeiroRef.current = r.primeiroEm;
    setEstagio(Math.min(r.cliques, CLIQUES_NECESSARIOS - 1));

    limparTimer();

    if (r.abrir) {
      cliquesRef.current  = 0;
      primeiroRef.current = null;
      setEstagio(0);
      setAtivado(true);
      marcarDescoberto();
      setDescoberto(true);
      aoAtivarRef.current();
      return;
    }

    // Rearma a expiração para o que sobra da janela: quem clicou 4 vezes em
    // 2,9 s tem 0,1 s para o quinto, não mais 3 s.
    const restante = Math.max(JANELA_MS - (agora - r.primeiroEm), 0);
    timerRef.current = setTimeout(() => {
      cliquesRef.current  = 0;
      primeiroRef.current = null;
      setEstagio(0);
    }, restante + 40);
  }, [limparTimer]);

  return { aoClicar, estagio, ativado, descoberto };
}
