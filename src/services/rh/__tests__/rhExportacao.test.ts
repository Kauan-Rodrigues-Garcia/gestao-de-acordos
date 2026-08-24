/**
 * A planilha do fechamento.
 *
 * O critério do pedido é a leitura humana: uma aba por cidade, com o tipo de
 * remuneração no nome, e as colunas na ordem em que uma pessoa do RH confere.
 * Os testes abaixo travam exatamente isso — e o detalhe que mais atrapalharia
 * na prática: `Valor` sair como texto em vez de número, o que impede somar a
 * coluna.
 */
import { describe, it, expect } from 'vitest';
import {
  montarAbas, montarResumo, nomeDeAba, rotuloCompetencia, type LinhaExportavel,
} from '../rhExportacao';
import type { StatusLancamento } from '../rhEstados';

let seq = 0;
function linha(over: Partial<LinhaExportavel> = {}): LinhaExportavel {
  seq += 1;
  return {
    id: `l-${seq}`,
    status: 'aprovado_rh' as StatusLancamento,
    valor: 450,
    celula_snapshot: 'Birigui',
    setor_id_snapshot: 'play1',
    setor_nome_snapshot: 'Play 1',
    equipe_id_snapshot: 'eq-1',
    equipe_nome_snapshot: 'Bryan',
    tipo_remuneracao_snapshot: 'premiacao',
    nome_snapshot: `Pessoa ${seq}`,
    cracha_snapshot: `1458${seq}`,
    percentual_snapshot: 181,
    ...over,
  };
}

const MARILIA: Partial<LinhaExportavel> = {
  celula_snapshot: 'Marília', setor_id_snapshot: 'play4',
  setor_nome_snapshot: 'Play 4', tipo_remuneracao_snapshot: 'comissao',
  equipe_id_snapshot: 'eq-9', equipe_nome_snapshot: 'Digital',
};

describe('rotuloCompetencia', () => {
  it('vira mês por extenso', () => {
    expect(rotuloCompetencia('2026-09-01')).toBe('Setembro/2026');
    expect(rotuloCompetencia('2026-01-01')).toBe('Janeiro/2026');
    expect(rotuloCompetencia('2026-12-01')).toBe('Dezembro/2026');
  });
});

describe('nomeDeAba', () => {
  it('corta em 31 caracteres — o limite do Excel', () => {
    expect(nomeDeAba('x'.repeat(50))).toHaveLength(31);
  });

  it('troca os caracteres que o Excel recusa', () => {
    // Deixar para a hora de escrever produziria um erro obscuro no download.
    expect(nomeDeAba('Premiação: Birigui/2026')).not.toMatch(/[:\\/?*[\]]/);
  });
});

describe('montarAbas', () => {
  it('uma aba por cidade, com o tipo no nome', () => {
    const abas = montarAbas(
      [linha(), linha(MARILIA)], '2026-09-01', ['Birigui', 'Marília']);
    expect(abas.map(a => a.nome)).toEqual(['Premiação - Birigui', 'Comissão - Marília']);
  });

  it('as colunas saem na ordem que o pedido descreve', () => {
    const [aba] = montarAbas([linha()], '2026-09-01');
    expect(Object.keys(aba.linhas[0])).toEqual([
      'Competência', 'Cidade', 'Setor', 'Equipe', 'Crachá', 'Operador',
      'Percentual', 'Tipo', 'Valor', 'Status', 'Motivo',
    ]);
  });

  it('Valor é NÚMERO, para a coluna somar na planilha', () => {
    const [aba] = montarAbas([linha({ valor: 450 })], '2026-09-01');
    expect(typeof aba.linhas[0].Valor).toBe('number');
    expect(aba.linhas[0].Valor).toBe(450);
  });

  it('percentual sem snapshot vira travessão, não «0%»', () => {
    const [aba] = montarAbas([linha({ percentual_snapshot: null })], '2026-09-01');
    expect(aba.linhas[0].Percentual).toBe('—');
  });

  it('quem ficou sem valor ENTRA na planilha, com zero', () => {
    // Omitir faria a soma fechar e a conferência não: quem lê precisa ver que
    // aquela pessoa ficou sem lançamento.
    const [aba] = montarAbas(
      [linha({ valor: null, status: 'pendente' as StatusLancamento })], '2026-09-01');
    expect(aba.linhas).toHaveLength(1);
    expect(aba.linhas[0].Valor).toBe(0);
    expect(aba.linhas[0].Status).toBe('Pendente');
  });

  it('o status sai com o rótulo humano, não com o valor do banco', () => {
    const [aba] = montarAbas([linha({ status: 'devolvido_rh' as StatusLancamento })], '2026-09-01');
    expect(aba.linhas[0].Status).toBe('Devolvido');
  });

  /*
   * Fora da folha × pendente.
   *
   * A linha dispensada chega com `valor` nulo e o status por baixo intacto —
   * ele nunca avançou, porque não havia o que preencher. Sem esta distinção a
   * planilha do pagamento dizia «Pendente / 0,00» para quem foi tirado da
   * folha de propósito: a mesma frase de quem apenas não foi preenchido, e as
   * duas exigem ações opostas de quem confere.
   */
  it('quem está fora da folha diz isso no status, e não «Pendente»', () => {
    const [aba] = montarAbas([linha({
      valor: null,
      status: 'pendente' as StatusLancamento,
      dispensado: true,
      motivo_dispensa: 'Não atingiu a meta',
    })], '2026-09-01');
    expect(aba.linhas[0].Status).toBe('Fora da folha');
    expect(aba.linhas[0].Motivo).toBe('Não atingiu a meta');
    expect(aba.linhas[0].Valor).toBe(0);
  });

  it('sem dispensa, a coluna Motivo carrega a observação do lançamento', () => {
    const [aba] = montarAbas(
      [linha({ observacao: 'Metade do mês em férias' })], '2026-09-01');
    expect(aba.linhas[0].Status).toBe('Aprovado');
    expect(aba.linhas[0].Motivo).toBe('Metade do mês em férias');
  });

  it('sem motivo e sem observação, a coluna sai vazia — nunca «null»', () => {
    const [aba] = montarAbas([linha()], '2026-09-01');
    expect(aba.linhas[0].Motivo).toBe('');
  });

  it('respeita a ordem configurada das cidades', () => {
    const abas = montarAbas(
      [linha(MARILIA), linha()], '2026-09-01', ['Birigui', 'Marília']);
    expect(abas[0].nome).toContain('Birigui');
  });

  it('o total da aba é a soma da cidade', () => {
    const abas = montarAbas(
      [linha({ valor: 450 }), linha({ valor: 50 })], '2026-09-01');
    expect(abas[0].total).toBe(500);
  });
});

describe('montarResumo', () => {
  it('uma linha por bloco e um TOTAL GERAL no fim', () => {
    const abas = montarAbas([linha({ valor: 450 }), linha({ ...MARILIA, valor: 300 })],
                            '2026-09-01', ['Birigui', 'Marília']);
    const resumo = montarResumo(abas, '2026-09-01');
    expect(resumo).toHaveLength(3);
    expect(resumo[2].Bloco).toBe('TOTAL GERAL');
    expect(resumo[2].Total).toBe(750);
    expect(resumo[2].Pessoas).toBe(2);
  });

  it('sem linhas, o total geral é zero — e o resumo existe', () => {
    const resumo = montarResumo(montarAbas([], '2026-09-01'), '2026-09-01');
    expect(resumo).toHaveLength(1);
    expect(resumo[0].Total).toBe(0);
  });

  // Sem este número, a primeira pergunta de quem abre a planilha é sempre a
  // mesma: por que o bloco tem 3 pessoas e 2 valores.
  it('conta quem ficou fora da folha, por bloco e no total', () => {
    const abas = montarAbas([
      linha({ valor: 450 }),
      linha({ valor: null, dispensado: true, motivo_dispensa: 'Não atingiu' }),
      linha({ ...MARILIA, valor: 300 }),
    ], '2026-09-01', ['Birigui', 'Marília']);
    const resumo = montarResumo(abas, '2026-09-01');
    expect(resumo[0]['Fora da folha']).toBe(1);
    expect(resumo[1]['Fora da folha']).toBe(0);
    expect(resumo[2]['Fora da folha']).toBe(1);
  });
});
