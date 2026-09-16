/**
 * useVendasMesAnterior — o mesmo mês, um mês atrás, só para comparar.
 *
 * ## Por que não é um segundo `useVendas`
 *
 * `useVendas` traz a lista inteira, assina o tempo real e devolve `salvar`,
 * `confirmar` e `excluir`. Nada disso faz sentido para o mês passado: ninguém
 * confirma uma venda de agosto pelo Dashboard de setembro, e um segundo canal
 * de `postgres_changes` recarregaria a comparação a cada venda lançada hoje.
 *
 * Aqui só interessa o **resumo** — as duas réguas e as cinco gavetas —, que é
 * o que as setas de variação leem. A lista é descartada assim que a conta sai.
 *
 * ## O eixo é sempre o da confirmação, e isso é decisão, não esquecimento
 *
 * Comparar meses é comparar fechamentos, e o fechamento conta pela data de
 * confirmação — é o eixo oficial, o mesmo da meta. No eixo da venda o «mês
 * anterior» tem outro conjunto de linhas, e a comparação mediria duas
 * perguntas diferentes de uma vez.
 *
 * ## Mês sem dado devolve `temBase: false`, e não zero
 *
 * O Comercial só tem setembro/2026 carregado — agosto depende de importar
 * `Prospeccao_202608.csv`. Um resumo zerado é indistinguível de um mês que
 * existiu e não vendeu nada, e `variacao()` transformaria os dois em «+100%».
 * Quem pergunta precisa saber que não há com que comparar.
 */
import { useCallback, useEffect, useState } from 'react';
import { deslocarMes, primeiroDiaDoMes, ultimoDiaDoMes } from '@/lib/mesReferencia';
import { resumirVendas, type ResumoVendas } from '@/lib/vendas';
import { buscarVendas } from '@/services/vendas/vendas.service';

interface Params {
  empresaId: string | null;
  /** O mês EM TELA, 'yyyy-MM'. O hook recua um sozinho. */
  mes: string;
  /** `false` congela: não busca nada. */
  ativo: boolean;
}

export interface MesAnterior {
  /** 'yyyy-MM' — o mês que foi lido, para a tela poder nomeá-lo. */
  mes: string;
  resumo: ResumoVendas;
  /** Houve venda lá? `false` desliga as setas em vez de inventá-las. */
  temBase: boolean;
  carregando: boolean;
}

const RESUMO_VAZIO = resumirVendas([]);

export function useVendasMesAnterior({ empresaId, mes, ativo }: Params): MesAnterior {
  const anterior = deslocarMes(mes, -1);
  const [resumo, setResumo] = useState<ResumoVendas>(RESUMO_VAZIO);
  const [temBase, setTemBase] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId || !ativo) { setResumo(RESUMO_VAZIO); setTemBase(false); return; }
    setCarregando(true);
    const r = await buscarVendas({
      empresaId,
      de: primeiroDiaDoMes(anterior),
      ate: ultimoDiaDoMes(anterior),
      eixo: 'confirmacao',
    });
    setResumo(resumirVendas(r.vendas));
    // A tabela ausente e o mês vazio dão na mesma coisa para quem compara: não
    // há base. A aba principal já avisa quando a migration falta.
    setTemBase(r.disponivel && r.vendas.length > 0);
    setCarregando(false);
  }, [empresaId, anterior, ativo]);

  useEffect(() => { void carregar(); }, [carregar]);

  return { mes: anterior, resumo, temBase, carregando };
}
