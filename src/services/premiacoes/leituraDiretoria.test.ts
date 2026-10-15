/**
 * leituraDiretoria.test.ts — o resumo da aba Premiações e Comissões (15/10/2026).
 *
 * O selo de resultado não repete o que a Obs. diz, o agrupamento escolhe setor
 * ou equipe pelo recorte, e a distribuição por meta separa quem não bateu de
 * quem nem tinha meta.
 */
import { describe, it, expect } from 'vitest';
import {
  agruparPremiacoes, chaveDoAgrupamento, distribuirPorFaixa, resultadoDaLinha, type LinhaPremiacao,
} from './calculoPremiacoes';

function linha(over: Partial<LinhaPremiacao>): LinhaPremiacao {
  return {
    operadorId: 'op', nome: 'Ana', equipeNome: 'Equipe A', setorId: 's1', setorNome: 'Receptivo',
    celula: 'Birigui', tipo: 'premiacao', cracha: '1001',
    comissao: null, premiacao: 500, estado: 'bateu', faixa: 1, obs: '1ª meta',
    ...over,
  };
}

describe('resultadoDaLinha', () => {
  it('bateu: a meta vai para o selo e sai da Obs., o resto fica', () => {
    expect(resultadoDaLinha(linha({ faixa: 2, obs: 'Férias · 2ª meta · benefício do setor' })))
      .toEqual({ rotulo: '2ª meta', tom: 'sucesso', detalhe: 'Férias · benefício do setor' });
  });

  it('não bateu: o quanto faltou continua na Obs.', () => {
    expect(resultadoDaLinha(linha({ estado: 'nao_bateu', faixa: null, obs: 'Não bateu a 1ª meta · faltou R$ 10,00' })))
      .toEqual({ rotulo: 'Não bateu', tom: 'neutro', detalhe: 'faltou R$ 10,00' });
  });

  it('sem meta, sem configuração e sem cidade: selo apagado e Obs. vazia', () => {
    expect(resultadoDaLinha(linha({ estado: 'sem_meta', obs: 'Sem meta no mês' })).detalhe).toBe('');
    expect(resultadoDaLinha(linha({ estado: 'sem_config', obs: 'Premiação não configurada no mês' })))
      .toEqual({ rotulo: 'Sem configuração', tom: 'tenue', detalhe: '' });
    expect(resultadoDaLinha(linha({ estado: 'sem_cidade', tipo: null, obs: 'Setor sem cidade no RH' })).rotulo).toBe('Sem cidade');
  });
});

describe('agrupamento', () => {
  const LINHAS = [
    linha({ operadorId: 'a' }),
    linha({ operadorId: 'b', premiacao: 0, estado: 'nao_bateu', faixa: null }),
    linha({ operadorId: 'c', setorId: 's2', setorNome: 'Play 4', celula: 'Marília', tipo: 'comissao', comissao: 900.1, premiacao: null, faixa: 2 }),
  ];

  it('vários setores → por setor; um setor com várias equipes → por equipe; senão nenhum', () => {
    expect(chaveDoAgrupamento(LINHAS)).toBe('setor');
    expect(chaveDoAgrupamento([linha({}), linha({ operadorId: 'x', equipeNome: 'Equipe B' })])).toBe('equipe');
    expect(chaveDoAgrupamento([linha({}), linha({ operadorId: 'x' })])).toBeNull();
  });

  it('soma pessoas, quem bateu e o valor do tipo de cada setor, do maior ao menor', () => {
    expect(agruparPremiacoes(LINHAS, 'setor').map(g => [g.nome, g.pessoas, g.bateram, g.total]))
      .toEqual([['Play 4', 1, 1, 900.1], ['Receptivo', 2, 1, 500]]);
  });

  it('distribuição por meta: faixas em ordem, não bateram e fora da conta separados', () => {
    const d = distribuirPorFaixa([...LINHAS, linha({ operadorId: 'd', estado: 'sem_meta', premiacao: null, faixa: null })]);
    expect(d.faixas).toEqual([{ faixa: 1, pessoas: 1, total: 500 }, { faixa: 2, pessoas: 1, total: 900.1 }]);
    expect(d.naoBateram).toBe(1);
    expect(d.semValor).toBe(1);
  });
});
