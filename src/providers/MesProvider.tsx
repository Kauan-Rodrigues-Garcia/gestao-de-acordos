/**
 * MesProvider — o mês que o sistema INTEIRO está olhando.
 *
 * ## O problema
 *
 * Cada tela tinha o seu `useState(mesAtual())`: Dashboard, Acordos, Analítico,
 * Painel da Diretoria, Painel do Líder e o Pix Automático (esse nem estado
 * tinha — chamava `mesAtual()` direto, sete vezes). Virou setembro, o operador
 * abriu o Dashboard, escolheu agosto para conferir o mês que fechou, clicou em
 * Acordos… e caiu em setembro de novo. Voltou ao Dashboard: setembro. O mês
 * escolhido não sobrevivia a um clique no menu.
 *
 * Aqui ele é UM só. Escolheu agosto, o sistema inteiro fala de agosto até a
 * pessoa mudar — inclusive depois de um F5.
 *
 * ## Por que a aba, e não o dispositivo
 *
 * `sessionStorage`: o mês sobrevive à navegação e ao F5, e morre quando a aba
 * fecha. É a decisão do Cleber em 01/09/2026, e o motivo é o risco do outro
 * lado: um mês guardado em `localStorage` faria alguém abrir o sistema semanas
 * depois, ver os números de agosto e tratá-los como os de hoje. Mês passado
 * some sozinho; mês passado que gruda no dispositivo vira erro de leitura.
 *
 * ## A virada do mês não sequestra quem estava no mês corrente
 *
 * Guardamos também qual era o mês corrente na hora da escolha (`era`). Quem
 * estava em "setembro porque setembro é hoje" acorda em outubro no dia 1º —
 * não fica preso em setembro. Quem escolheu agosto DE PROPÓSITO continua em
 * agosto, que é o ponto de tudo isto.
 *
 * O `SeletorMes` já avisa na tela quando o mês não é o corrente (rótulo em
 * destaque + botão "Mês atual"), então ficar fora do mês nunca é silencioso.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import { mesAtual, mesValido, normalizarMes, type MesRef } from '@/lib/mesReferencia';

const CHAVE = 'gac:mes-global:v1';

interface MesGuardado {
  /** O mês escolhido. */
  mes: MesRef;
  /** Qual era o mês corrente quando a escolha foi feita. */
  era: MesRef;
}

/**
 * Lê o mês da aba.
 *
 * Devolve o mês corrente em qualquer situação duvidosa: chave ausente, JSON
 * quebrado, formato inválido, mês no futuro (não existe dado lá) ou escolha que
 * era "o mês de hoje" num dia em que hoje era outro mês.
 */
function lerMesGuardado(): MesRef {
  const agora = mesAtual();
  try {
    if (typeof sessionStorage === 'undefined') return agora;
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return agora;

    const guardado = JSON.parse(bruto) as Partial<MesGuardado>;
    if (!mesValido(guardado?.mes)) return agora;
    // Futuro não tem dado nenhum — provavelmente é lixo de uma versão antiga.
    if (guardado.mes > agora) return agora;
    // Estava no mês corrente e o mês virou: acompanha a virada.
    if (mesValido(guardado.era) && guardado.mes === guardado.era && guardado.era !== agora) {
      return agora;
    }
    return guardado.mes;
  } catch {
    return agora;
  }
}

function gravarMes(mes: MesRef): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const payload: MesGuardado = { mes, era: mesAtual() };
    sessionStorage.setItem(CHAVE, JSON.stringify(payload));
  } catch {
    /* aba anônima / cota estourada: o mês vale só para esta sessão de memória */
  }
}

export interface ContextoMes {
  /** O mês de referência de todas as telas, `yyyy-MM`. */
  mes: MesRef;
  /** Troca o mês do sistema inteiro. Entrada inválida vira o mês corrente. */
  setMes: (mes: string | null | undefined) => void;
  /** Volta para o mês corrente — o mesmo que o botão "Mês atual". */
  voltarAoMesAtual: () => void;
}

const MesContext = createContext<ContextoMes | null>(null);

export function MesProvider({ children }: { children: ReactNode }) {
  const [mes, setMesEstado] = useState<MesRef>(() => lerMesGuardado());

  const setMes = useCallback((novo: string | null | undefined) => {
    const alvo = normalizarMes(novo);
    setMesEstado(atual => (atual === alvo ? atual : alvo));
  }, []);

  const voltarAoMesAtual = useCallback(() => setMes(mesAtual()), [setMes]);

  useEffect(() => { gravarMes(mes); }, [mes]);

  /*
   * Outra aba mudou o mês? Não sincronizamos de propósito: `sessionStorage` é
   * por aba justamente para que duas janelas lado a lado possam comparar
   * agosto e setembro. O `storage` event nem dispara para ele.
   */

  const valor = useMemo<ContextoMes>(
    () => ({ mes, setMes, voltarAoMesAtual }),
    [mes, setMes, voltarAoMesAtual],
  );

  return <MesContext.Provider value={valor}>{children}</MesContext.Provider>;
}

/**
 * O mês de referência da tela.
 *
 * Fora do provider devolve o mês corrente e um `setMes` que só vale para o
 * componente — é o que mantém teste e Storybook de pé sem montar a árvore
 * inteira, em vez de estourar.
 */
// eslint-disable-next-line react-refresh/only-export-components -- arquivo exporta Provider + hook consumidor, padrão já usado no resto do projeto.
export function useMesGlobal(): ContextoMes {
  const ctx = useContext(MesContext);
  const [mesLocal, setMesLocal] = useState<MesRef>(() => mesAtual());

  const fallback = useMemo<ContextoMes>(() => ({
    mes: mesLocal,
    setMes: (m: string | null | undefined) => setMesLocal(normalizarMes(m)),
    voltarAoMesAtual: () => setMesLocal(mesAtual()),
  }), [mesLocal]);

  return ctx ?? fallback;
}
