/**
 * useMovimentoPreferido — a preferência do sistema SUGERE, não manda.
 * ─────────────────────────────────────────────────────────────────────────────
 * O Windows 10/11 tem "Efeitos de animação" em Acessibilidade > Efeitos visuais,
 * e imagem corporativa costuma vir com isso DESLIGADO para economizar máquina.
 * Com ele desligado o navegador responde `prefers-reduced-motion: reduce`, e
 * quem obedece cegamente fica parado numa máquina onde ninguém pediu nada de
 * acessibilidade — só ligaram um modo de desempenho.
 *
 * Foi o que aconteceu no Creators Lab, e a mesma coisa acontecia no Desempenho
 * do Dia: os números trocavam de valor num salto seco, sem a contagem que liga
 * o número velho ao novo. Ver o cabeçalho de
 * `pages/CreatorsLab/theme/CreatorsProvider.tsx`, onde o caso foi diagnosticado
 * primeiro.
 *
 * A regra aqui é a mesma do Lab:
 *
 *   • existe escolha explícita guardada? ela manda, nos dois sentidos;
 *   • não existe? movimento COMPLETO, em qualquer máquina.
 *
 * A media query continua sendo lida e devolvida em `sistemaPedeReduzir`, para
 * quem quiser oferecer o modo reduzido — oferta, não imposição.
 *
 * ## Alcance
 *
 * Este hook NÃO é um substituto geral de `useReducedMotion`. O resto do Gestão
 * continua obedecendo a preferência do sistema sem discutir, como deve ser num
 * sistema de trabalho. Ele existe para os painéis onde a animação carrega
 * informação — a contagem que mostra QUE um número mudou — e onde o salto seco
 * é perda de conteúdo, não economia de movimento.
 */

import { useEffect, useState } from 'react';

export const CHAVE_MOVIMENTO = 'gestao:movimento';

/** A escolha já feita antes, ou `null` se nunca houve uma. */
export function movimentoEscolhido(): boolean | null {
  try {
    const cru = localStorage.getItem(CHAVE_MOVIMENTO);
    if (cru === 'reduzido') return true;
    if (cru === 'completo') return false;
    return null;
  } catch {
    // Modo privado ou storage bloqueado: sem escolha guardada.
    return null;
  }
}

/** Guarda a escolha da pessoa. Recusar a oferta também é uma escolha. */
export function guardarMovimento(reduzido: boolean): void {
  try {
    localStorage.setItem(CHAVE_MOVIMENTO, reduzido ? 'reduzido' : 'completo');
  } catch {
    /* modo privado */
  }
}

interface MovimentoPreferido {
  /** Drop-in para o retorno de `useReducedMotion()`. */
  semMovimento: boolean;
  /** A media query crua, para quem quiser oferecer o modo reduzido. */
  sistemaPedeReduzir: boolean;
  /** `true` quando ninguém escolheu nada ainda. */
  semEscolha: boolean;
}

export function useMovimentoPreferido(): MovimentoPreferido {
  // Lido UMA vez, na montagem: reler a cada render transformaria um acesso a
  // disco numa consulta de layout, e o valor não muda sem passar por aqui.
  const [escolha] = useState(movimentoEscolhido);
  const [sistemaPedeReduzir, setSistemaPedeReduzir] = useState(false);

  useEffect(() => {
    // `matchMedia` não existe em jsdom antigo nem em SSR.
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const aplicar = () => setSistemaPedeReduzir(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);

  return {
    semMovimento: escolha ?? false,
    sistemaPedeReduzir,
    semEscolha: escolha === null,
  };
}
