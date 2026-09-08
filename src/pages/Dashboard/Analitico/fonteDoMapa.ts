/**
 * fonteDoMapa.ts — de qual relatório o Mapa do mês soma, em cada empresa.
 *
 * ## Por que a fonte não é uma só
 *
 * O mapa de calor operador × dia já somou do analítico para as duas empresas,
 * com o argumento de que analítico e recebimento diário eram «duas somas do
 * mesmo dinheiro».
 *
 * No BookPlay isso é verdade: os dois saem do MESMO arquivo. Em setembro/2026
 * eram 3.665 linhas e R$ 1.370.714 no analítico contra 3.684 e R$ 1.376.017 no
 * diário — a diferença é o que ainda não foi conciliado, não outra fonte.
 *
 * Na PaguePlay é falso. São relatórios DIFERENTES: 1.031 linhas e R$ 504.665
 * no analítico contra 6.122 e R$ 1.519.751 no diário (o `mes.xlsx` do ERP).
 * Somar do analítico ali mostrava um terço do que entrou — e pior, dias
 * inteiros trocados: 08/09 tinha R$ 266.787 no diário e nada no analítico,
 * então aparecia zerado.
 *
 * ## Por que uma função, e não um `if` no componente
 *
 * Porque foi assim que o defeito passou: a troca de fonte estava dentro de um
 * `useMemo` de um componente de 1.900 linhas, sem nada que a exercitasse. Aqui
 * a regra é pura, tem teste e quebra alto quando alguém a inverter.
 */
import type { CelulaDoMapa } from '@/pages/Analitico/Diario/DiaDetalhado';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';

export interface FonteDoMapa {
  /** PaguePlay lê do diário; BookPlay, do analítico. */
  isPaguePlay: boolean;
  /**
   * Linhas do resumo mensal do DIÁRIO, JÁ passadas pelo escopo de permissão
   * (`linhasVisiveis`). Só a PaguePlay as usa.
   */
  diario: readonly LinhaRecebidaDia[];
  /**
   * Linhas do ANALÍTICO do mês, já escopadas pelo hook. Só o BookPlay as usa.
   */
  analitico: readonly CelulaDoMapa[];
  /**
   * Os operadores que a LISTA está mostrando — só vale no BookPlay.
   *
   * Lá o mapa e a lista saem da MESMA fonte, e são dois formatos do mesmo
   * recorte: um operador que a lista não mostra não pode aparecer no mapa.
   *
   * Na PaguePlay este filtro seria um segundo defeito no lugar do primeiro. A
   * lista do mês sai do analítico e o mapa sai do diário — universos
   * diferentes —, e peneirar o diário pela lista do analítico apagaria
   * justamente os operadores que só existem no relatório que o mapa mostra.
   * Ali quem recorta é o escopo de permissão, aplicado antes de chegar aqui.
   *
   * Linha SEM operador (órfã, sem vínculo) passa nos dois casos: ela não
   * pertence a ninguém, e o mapa a soma fora da matriz — é assim que o total
   * do mês fecha.
   */
  operadoresNaLista: ReadonlySet<string>;
}

/** As células do mapa, já na fonte certa para a empresa. */
export function celulasDoMapa(p: FonteDoMapa): CelulaDoMapa[] {
  if (p.isPaguePlay) {
    return p.diario.map(l => ({
      dia:         l.data_pagamento,
      operador_id: l.operador_id,
      total:       l.valor_recebido,
    }));
  }
  return p.analitico.filter(
    l => !l.operador_id || p.operadoresNaLista.has(l.operador_id),
  );
}
