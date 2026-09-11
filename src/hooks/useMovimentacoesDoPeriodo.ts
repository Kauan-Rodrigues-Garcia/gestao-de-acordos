/**
 * useMovimentacoesDoPeriodo — a trilha do Controle de Números num período.
 *
 * Serve ao Dashboard – ADM, que tira o «quantos por dia» da trilha. A RLS de
 * `numeros_movimentacoes` recorta pela visibilidade do número, então quem não é
 * do Núcleo recebe lista vazia, e não erro.
 *
 * ## Quando reler
 *
 * A trilha não está na publicação de realtime, e não precisa: toda linha dela
 * nasce na mesma transação que muda um número, e `useControleNumeros` já ouve os
 * números. `versao` é essa lista — mudou, a trilha é relida.
 *
 * ## A troca de período não pisca, nem mente
 *
 * Enquanto o período novo carrega, o hook continua entregando a leitura
 * anterior INTEIRA — as linhas, o início e a quantidade de dias dela. Misturar
 * as linhas de 30 dias com um eixo de 90 desenharia sessenta dias zerados que
 * não aconteceram.
 */
import { useEffect, useState } from 'react';
import {
  listarMovimentacoesDesde, type MovimentacaoResumoRow,
} from '@/services/numeros/numeros.service';
import { inicioDoPeriodo } from '@/pages/DashboardAdm/metricas';

interface Leitura {
  movs: MovimentacaoResumoRow[];
  /** O instante em que o período lido começa — o mesmo que as contas usam. */
  inicio: Date;
  /** Quantos dias a leitura cobre. */
  dias: number;
}

export interface EstadoMovimentacoesDoPeriodo extends Leitura {
  carregando: boolean;
  /** A primeira leitura ainda não chegou. */
  primeiraCarga: boolean;
  erro: string | null;
}

export function useMovimentacoesDoPeriodo(
  empresaId: string | null, dias: number, versao: unknown,
): EstadoMovimentacoesDoPeriodo {
  const [leitura, setLeitura] = useState<Leitura>(
    () => ({ movs: [], inicio: inicioDoPeriodo(dias), dias }),
  );
  const [carregando, setCarregando] = useState(true);
  const [primeiraCarga, setPrimeiraCarga] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId) {
      setLeitura({ movs: [], inicio: inicioDoPeriodo(dias), dias });
      setCarregando(false);
      setPrimeiraCarga(false);
      return;
    }
    let cancelado = false;
    const inicio = inicioDoPeriodo(dias);
    setCarregando(true);
    listarMovimentacoesDesde(empresaId, inicio.toISOString())
      .then(movs => {
        if (cancelado) return;
        setLeitura({ movs, inicio, dias });
        setErro(null);
      })
      .catch((e: { message?: string }) => {
        if (!cancelado) setErro(e.message ?? 'Não foi possível carregar a evolução.');
      })
      .finally(() => {
        if (cancelado) return;
        setCarregando(false);
        setPrimeiraCarga(false);
      });
    return () => { cancelado = true; };
  }, [empresaId, dias, versao]);

  return { ...leitura, carregando, primeiraCarga, erro };
}
