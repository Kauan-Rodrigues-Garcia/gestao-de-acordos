/**
 * A sincronização do relatório mensal completo.
 *
 * Na BookPlay o 58 é o retrato do mês: o que não está no arquivo sai do setor.
 *
 * ## O que se trava aqui
 *
 * **A chave é a da LINHA, não a do grupo.** Até 13/09/2026 a remoção comparava
 * por `operador::codigo::mês` enquanto a inserção usava
 * `(codigo, data, forma, operador)`. A assimetria fazia uma linha cujo dia sumiu
 * do arquivo SOBREVIVER — bastava outra linha do mesmo NR no mês — e a linha
 * nova, com a data nova, entrava do lado dela.
 *
 * Custou R$ 698,43 contados duas vezes no Receptivo, em três NRs, quando o ERP
 * moveu parcelas de dia entre dois exports.
 *
 * **O 58 só apaga o que o 58 trouxe.** A partir do momento em que o 59 escrever
 * nesta tabela e em que houver correção manual, uma linha de outra procedência
 * ausente do arquivo do 58 não quer dizer «foi estornada» — quer dizer que o 58
 * nunca soube dela. Apagá-la seria perda sem volta: o 58 não tem como
 * reimportar o que não é dele.
 */
import { describe, expect, it } from 'vitest';
import { idsAusentesDoRelatorioMensal } from './analitico.service';

const linha = (
  id: string,
  operador: string,
  codigo: string,
  data = '2026-08-01',
  forma = 'boleto_pix',
  mes = '2026-08-01',
  procedencia?: string,
) => ({
  id,
  operador_usuario: operador,
  codigo,
  mes_referencia: mes,
  data_pagamento: data,
  forma_pagamento: forma,
  ...(procedencia ? { procedencia } : {}),
});

describe('sincronização do relatório mensal completo', () => {
  it('remove apenas o que não aparece no arquivo atual', () => {
    const existentes = [
      linha('mantem', 'AGATHA_ROCHA', '13000001'),
      linha('retencao-antiga', 'tamiris_hilario', '13010424'),
      linha('colchao-antigo', 'KAUAN_TEIXEIRA', '12980581'),
      linha('nr-retirado', 'THIAGO_ALVES', '12995133'),
    ];
    const relatorioAtual = [linha('arquivo', 'AGATHA_ROCHA', '13000001')];

    expect(idsAusentesDoRelatorioMensal(existentes, relatorioAtual)).toEqual([
      'retencao-antiga',
      'colchao-antigo',
      'nr-retirado',
    ]);
  });

  it('considera operador, NR e mês na identidade', () => {
    const existentes = [
      linha('outro-operador', 'OPERADOR_B', '13000001'),
      linha('outro-nr', 'OPERADOR_A', '13000002'),
      linha('outro-mes', 'OPERADOR_A', '13000001', '2026-07-01', 'boleto_pix', '2026-07-01'),
    ];
    const relatorioAtual = [linha('arquivo', 'OPERADOR_A', '13000001')];

    expect(idsAusentesDoRelatorioMensal(existentes, relatorioAtual)).toEqual([
      'outro-operador',
      'outro-nr',
      'outro-mes',
    ]);
  });

  /*
   * O caso que gerou a duplicata, com os números reais do NR 12984182
   * (GABRIEL_OLIVEIRA, Receptivo, agosto/2026).
   *
   * O ERP moveu a parcela 29 do dia 01 para o dia 03 entre dois exports. A linha
   * de 01/08 não está mais no arquivo, e tem de sair — se ela sobreviver, os
   * R$ 259,15 ficam contados duas vezes, porque a linha de 03/08 entra do lado.
   */
  it('remove a linha cujo DIA sumiu do arquivo, mesmo com o NR presente', () => {
    const existentes = [
      linha('dia-1', 'GABRIEL_OLIVEIRA', '12984182', '2026-08-01'),
      linha('dia-3', 'GABRIEL_OLIVEIRA', '12984182', '2026-08-03'),
    ];
    // O arquivo novo traz o NR só no dia 3.
    const relatorioAtual = [linha('arquivo', 'GABRIEL_OLIVEIRA', '12984182', '2026-08-03')];

    expect(idsAusentesDoRelatorioMensal(existentes, relatorioAtual)).toEqual(['dia-1']);
  });

  /*
   * O contrário também precisa valer: cliente que pagou em dois dias e cujos
   * dois dias estão no arquivo não perde nada. É a maioria dos casos — em
   * agosto e setembro juntos, 17 grupos têm linhas em dias diferentes, e só 3
   * eram duplicata.
   */
  it('mantém as duas linhas quando os dois dias estão no arquivo', () => {
    const existentes = [
      linha('dia-9', 'JENIFFER_OLIVEIRA', '12598212', '2026-09-09'),
      linha('dia-10', 'JENIFFER_OLIVEIRA', '12598212', '2026-09-10'),
    ];
    const relatorioAtual = [
      linha('a', 'JENIFFER_OLIVEIRA', '12598212', '2026-09-09'),
      linha('b', 'JENIFFER_OLIVEIRA', '12598212', '2026-09-10'),
    ];

    expect(idsAusentesDoRelatorioMensal(existentes, relatorioAtual)).toEqual([]);
  });

  /*
   * A forma entra na chave porque entra no índice: o mesmo NR pode ser pago no
   * mesmo dia por cartão e por pix, e são duas linhas.
   */
  it('separa cartão de boleto/pix no mesmo dia', () => {
    const existentes = [
      linha('cartao', 'ANA', '1', '2026-09-01', 'cartao'),
      linha('pix', 'ANA', '1', '2026-09-01', 'boleto_pix'),
    ];
    const relatorioAtual = [linha('so-pix', 'ANA', '1', '2026-09-01', 'boleto_pix')];

    expect(idsAusentesDoRelatorioMensal(existentes, relatorioAtual)).toEqual(['cartao']);
  });

  it('arquivo vazio remove tudo — é o retrato do mês, e ele veio vazio', () => {
    const existentes = [
      linha('a', 'ANA', '1'),
      linha('b', 'BIA', '2'),
    ];
    expect(idsAusentesDoRelatorioMensal(existentes, [])).toEqual(['a', 'b']);
  });

  /*
   * A trava de procedência (migration 20260914010002).
   *
   * «Arquivo vazio remove tudo» acima continua valendo — para o que é do 58. O
   * que o 59 escreveu e o que alguém corrigiu à mão não está no arquivo do 58
   * por definição, e sair por isso seria apagar o dado justamente da fonte que
   * virou oficial.
   */
  describe('o 58 só apaga o que o 58 trouxe', () => {
    it('não remove linha escrita pelo 59, nem com o arquivo vazio', () => {
      const existentes = [
        linha('do-58', 'ANA', '1', '2026-08-01', 'boleto_pix', '2026-08-01', 'relatorio_58'),
        linha('do-59', 'BIA', '2', '2026-08-01', 'boleto_pix', '2026-08-01', 'relatorio_59'),
      ];
      expect(idsAusentesDoRelatorioMensal(existentes, [])).toEqual(['do-58']);
    });

    it('não remove correção manual', () => {
      const existentes = [
        linha('mao', 'ANA', '1', '2026-08-01', 'boleto_pix', '2026-08-01', 'manual'),
      ];
      expect(idsAusentesDoRelatorioMensal(existentes, [])).toEqual([]);
    });

    /*
     * Antes da coluna existir, toda linha da tabela tinha vindo do 58 — eram
     * 48.550 delas. Linha sem o campo tem de continuar se comportando como
     * antes, senão a trava vira uma mudança de regra em cima de dado histórico.
     */
    it('linha sem o campo é tratada como do 58, que é o que ela era', () => {
      const existentes = [linha('antiga', 'ANA', '1')];
      expect(idsAusentesDoRelatorioMensal(existentes, [])).toEqual(['antiga']);
    });
  });
});
