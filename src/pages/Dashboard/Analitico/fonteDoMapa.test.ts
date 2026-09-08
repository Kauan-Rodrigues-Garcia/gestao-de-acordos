/**
 * fonteDoMapa.test.ts — o Mapa do mês soma do relatório certo em cada empresa.
 *
 * ## O defeito que estes casos guardam
 *
 * O mapa passou a somar do analítico para as DUAS empresas, com o argumento de
 * que analítico e recebimento diário eram «duas somas do mesmo dinheiro». No
 * BookPlay é verdade — saem do mesmo arquivo. Na PaguePlay são relatórios
 * diferentes, e o mapa passou a mostrar um terço do que entrou.
 *
 * Os números abaixo são os REAIS de setembro/2026, medidos no banco:
 *
 *   PaguePlay · diário  6.122 linhas · R$ 1.519.750,79
 *   PaguePlay · analítico 1.031 linhas · R$   504.664,92
 *   BookPlay  · diário  3.684 linhas · R$ 1.376.016,67
 *   BookPlay  · analítico 3.665 linhas · R$ 1.370.714,21
 *
 * E o caso mais visível: 08/09 tinha R$ 266.787,50 no diário e NADA no
 * analítico — o dia mais recente aparecia zerado no mapa.
 */
import { describe, it, expect } from 'vitest';
import { celulasDoMapa } from './fonteDoMapa';
import type { LinhaRecebidaDia } from '@/services/analitico/analitico.service';
import type { CelulaDoMapa } from '@/pages/Analitico/Diario/DiaDetalhado';

function doDiario(
  operador_id: string | null, data_pagamento: string, valor_recebido: number,
): LinhaRecebidaDia {
  return { operador_id, setor_id: null, importado_por_id: null, valor_recebido, data_pagamento };
}

const somaDe = (c: CelulaDoMapa[]) => c.reduce((s, x) => s + x.total, 0);

describe('de qual relatório o Mapa do mês soma', () => {
  const diario = [
    doDiario('op1', '2026-09-01', 358_051.56),
    doDiario('op2', '2026-09-04', 270_925.42),
    // O dia que o analítico não tem — era ele que aparecia zerado.
    doDiario('op1', '2026-09-08', 266_787.50),
  ];
  const analitico: CelulaDoMapa[] = [
    { dia: '2026-09-01', operador_id: 'op1', total: 138_636.55 },
    { dia: '2026-09-04', operador_id: 'op2', total:  98_463.46 },
  ];
  const naLista = new Set(['op1', 'op2']);

  it('PaguePlay soma do DIÁRIO', () => {
    const c = celulasDoMapa({ isPaguePlay: true, diario, analitico, operadoresNaLista: naLista });
    expect(somaDe(c)).toBeCloseTo(895_764.48, 2);
    expect(c).toHaveLength(3);
  });

  it('PaguePlay: o dia que só existe no diário aparece — era ele que zerava', () => {
    const c = celulasDoMapa({ isPaguePlay: true, diario, analitico, operadoresNaLista: naLista });
    const dia8 = c.filter(x => x.dia === '2026-09-08');
    expect(dia8).toHaveLength(1);
    expect(dia8[0].total).toBeCloseTo(266_787.50, 2);
  });

  it('BookPlay soma do ANALÍTICO', () => {
    const c = celulasDoMapa({ isPaguePlay: false, diario, analitico, operadoresNaLista: naLista });
    expect(somaDe(c)).toBeCloseTo(237_100.01, 2);
    expect(c).toHaveLength(2);
  });

  it('trocar a fonte muda o total — é a prova de que não são o mesmo dinheiro', () => {
    const pp = somaDe(celulasDoMapa({ isPaguePlay: true,  diario, analitico, operadoresNaLista: naLista }));
    const bp = somaDe(celulasDoMapa({ isPaguePlay: false, diario, analitico, operadoresNaLista: naLista }));
    expect(pp).not.toBeCloseTo(bp, 2);
  });

  it('BookPlay: operador fora da lista sai do mapa — mapa e lista são o mesmo recorte', () => {
    const c = celulasDoMapa({
      isPaguePlay: false, diario, analitico,
      operadoresNaLista: new Set(['op1']),
    });
    expect(c.map(x => x.operador_id)).toEqual(['op1']);
  });

  it('PaguePlay: a lista do analítico NÃO peneira o mapa do diário', () => {
    /*
     * O contrário seria trocar um defeito por outro: a lista do mês sai do
     * analítico e o mapa sai do diário. Peneirar um pelo outro apagaria
     * justamente os operadores que só existem no relatório que o mapa mostra —
     * e na PaguePlay eles são a maioria do dinheiro.
     */
    const c = celulasDoMapa({
      isPaguePlay: true, diario, analitico,
      operadoresNaLista: new Set<string>(),   // lista do analítico vazia
    });
    expect(c).toHaveLength(3);
    expect(somaDe(c)).toBeCloseTo(895_764.48, 2);
  });

  it('linha SEM operador passa nas duas — ela soma fora da matriz', () => {
    const semOp = [...diario, doDiario(null, '2026-09-02', 1_000)];
    const pp = celulasDoMapa({
      isPaguePlay: true, diario: semOp, analitico, operadoresNaLista: naLista,
    });
    expect(pp.some(x => x.operador_id === null)).toBe(true);

    const bp = celulasDoMapa({
      isPaguePlay: false, diario: semOp,
      analitico: [...analitico, { dia: '2026-09-02', operador_id: null, total: 1_000 }],
      operadoresNaLista: naLista,
    });
    expect(bp.some(x => x.operador_id === null)).toBe(true);
  });

  it('sem linhas do diário, PaguePlay devolve mapa vazio e não cai no analítico', () => {
    // O escopo ainda não resolveu, ou o mês não tem importação. Cair no
    // analítico ali mostraria o número errado justamente quando ninguem
    // conferiria — o mapa vazio diz a verdade.
    const c = celulasDoMapa({
      isPaguePlay: true, diario: [], analitico, operadoresNaLista: naLista,
    });
    expect(c).toEqual([]);
  });
});
