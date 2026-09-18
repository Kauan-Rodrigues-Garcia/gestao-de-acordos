/**
 * calculoPremiacoes.test.ts — as linhas de Fechamento › Premiações e Comissões.
 *
 * Os casos seguram o pedido de 18/09/2026: Birigui preenche só Premiação,
 * Marília só Comissão, e o valor é o de quem já bateu. Vazio e zero dizem coisas
 * diferentes na folha, e os dois precisam sair certos.
 */
import { describe, it, expect } from 'vitest';
import { calcularComissao, type ConfigComissao } from '@/services/comissao/comissao';
import { montarEntradaComissao } from '@/services/comissao/entradaDoOperador';
import {
  lerCracha, montarLinhaPremiacao, ordenarLinhasPremiacao, resumirPremiacoes,
  type EntradaLinhaPremiacao,
} from './calculoPremiacoes';

function config(over: Partial<ConfigComissao> = {}): ConfigComissao {
  return {
    id: 'cfg', empresaId: 'e1', setorId: 's1', equipeId: null,
    grupoUsuarios: false, usuarioIds: [], ano: 2026, mes: 8,
    modoIndireta: 'junto', pctIndireta: null, pctIndiretaEspecial: null,
    regraSetor: 'nenhuma', multiplicador: null,
    setorMetaConfirmadaEm: null, setorMetaConfirmadaPor: null, setorMetaConfirmadaPorNome: null,
    faixas: [
      { ordem: 1, pct: 1.75, pctEspecial: null },
      { ordem: 2, pct: 2.11, pctEspecial: null },
    ],
    ...over,
  };
}

function resultado(recebido: number, opcoes: { meta?: number | null; configs?: ConfigComissao[] } = {}) {
  return calcularComissao(montarEntradaComissao({
    meta: opcoes.meta === null ? null : { meta_valor: opcoes.meta ?? 34_000, metas_extras: [37_000] },
    recebidoBruto: recebido,
    recebidoHO: 0,
    recebidoIndiretoBruto: 0,
    isPaguePlay: false,
    configs: opcoes.configs ?? [config()],
    setorOrigemId: 's1',
    equipeOrigemId: null,
    operadorId: 'op1',
    hoje: '2026-08-31',
  }));
}

function entrada(over: Partial<EntradaLinhaPremiacao> = {}): EntradaLinhaPremiacao {
  return {
    operadorId: 'op1', nome: 'Ana Rocha', equipeNome: 'Luciana',
    setorId: 's1', setorNome: 'Receptivo',
    vinculo: { celula: 'Birigui', tipo: 'premiacao' },
    cracha: '1001',
    resultado: resultado(38_450),
    situacao: null,
    parcial: false,
    ...over,
  };
}

describe('uma coluna por cidade', () => {
  it('Birigui: quem bateu leva o valor em Premiação, e Comissão fica vazia', () => {
    const l = montarLinhaPremiacao(entrada());
    expect(l.premiacao).toBe(811.3);
    expect(l.comissao).toBeNull();
    expect(l.estado).toBe('bateu');
    expect(l.faixa).toBe(2);
    expect(l.obs).toBe('2ª meta');
  });

  it('Marília: o mesmo cálculo cai em Comissão, e Premiação fica vazia', () => {
    const l = montarLinhaPremiacao(entrada({ vinculo: { celula: 'Marília', tipo: 'comissao' } }));
    expect(l.comissao).toBe(811.3);
    expect(l.premiacao).toBeNull();
  });

  it('setor sem cidade no RH não preenche nenhuma das duas', () => {
    const l = montarLinhaPremiacao(entrada({ vinculo: null }));
    expect(l.premiacao).toBeNull();
    expect(l.comissao).toBeNull();
    expect(l.estado).toBe('sem_cidade');
    expect(l.obs).toBe('Setor sem cidade no RH');
  });
});

describe('vazio não é zero', () => {
  it('tem meta e não bateu: zero, e a Obs. diz quanto faltou', () => {
    const l = montarLinhaPremiacao(entrada({ resultado: resultado(30_000) }));
    expect(l.premiacao).toBe(0);
    expect(l.estado).toBe('nao_bateu');
    expect(l.obs.replace(/\s/g, ' ')).toBe('Não bateu a 1ª meta · faltou R$ 4.000,00');
  });

  it('no mês aberto, «falta» em vez de «faltou»', () => {
    const l = montarLinhaPremiacao(entrada({ resultado: resultado(30_000), parcial: true }));
    expect(l.obs).toContain('· falta R$');
  });

  it('sem meta no mês: vazio', () => {
    const l = montarLinhaPremiacao(entrada({ resultado: resultado(38_450, { meta: null }) }));
    expect(l.premiacao).toBeNull();
    expect(l.estado).toBe('sem_meta');
    expect(l.obs).toBe('Sem meta no mês');
  });

  it('sem configuração no mês: vazio, com o nome do tipo', () => {
    const l = montarLinhaPremiacao(entrada({ resultado: resultado(38_450, { configs: [] }) }));
    expect(l.premiacao).toBeNull();
    expect(l.obs).toBe('Premiação não configurada no mês');
  });
});

describe('Obs.', () => {
  it('traz o benefício do setor quando ele vale', () => {
    const cfg = config({ regraSetor: 'multiplicador', multiplicador: 2, setorMetaConfirmadaEm: '2026-08-29T10:00:00Z' });
    const l = montarLinhaPremiacao(entrada({ resultado: resultado(38_450, { configs: [cfg] }) }));
    expect(l.premiacao).toBe(1_622.59);
    expect(l.obs).toBe('2ª meta · benefício do setor');
  });

  it('traz a situação do fechamento, menos assíduo', () => {
    expect(montarLinhaPremiacao(entrada({ situacao: 'ferias' })).obs).toBe('FÉRIAS · 2ª meta');
    expect(montarLinhaPremiacao(entrada({ situacao: 'assiduo' })).obs).toBe('2ª meta');
  });
});

describe('resumo e ordem', () => {
  const linhas = [
    montarLinhaPremiacao(entrada({ operadorId: 'a', nome: 'Vera', setorNome: 'Receptivo' })),
    montarLinhaPremiacao(entrada({ operadorId: 'b', nome: 'Bia', setorNome: 'Receptivo', cracha: null, resultado: resultado(30_000) })),
    montarLinhaPremiacao(entrada({ operadorId: 'c', nome: 'Bruno', setorNome: 'Play 4', vinculo: { celula: 'Marília', tipo: 'comissao' } })),
    montarLinhaPremiacao(entrada({ operadorId: 'd', nome: 'Carla', setorNome: 'Colchão', vinculo: null })),
  ];

  it('soma por tipo e conta quem bateu', () => {
    const r = resumirPremiacoes(linhas);
    expect(r.premiacao).toEqual({ total: 811.3, pessoas: 2, bateram: 1 });
    expect(r.comissao).toEqual({ total: 811.3, pessoas: 1, bateram: 1 });
    expect(r.semCidade).toBe(1);
    expect(r.comCracha).toBe(3);
    expect(r.total).toBe(4);
  });

  it('ordena por setor e, dentro dele, por nome — como a planilha', () => {
    expect(ordenarLinhasPremiacao(linhas).map(l => l.nome)).toEqual(['Carla', 'Bruno', 'Bia', 'Vera']);
  });
});

describe('lerCracha', () => {
  it('aceita números e letras; vazio apaga; o resto é inválido', () => {
    expect(lerCracha(' 1001 ')).toBe('1001');
    expect(lerCracha('')).toBeNull();
    expect(lerCracha('39 30')).toBeUndefined();
    expect(lerCracha('x'.repeat(21))).toBeUndefined();
  });
});
