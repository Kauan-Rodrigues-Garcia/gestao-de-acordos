/**
 * Testes da agregação do "Detalhamento por forma de pagamento".
 *
 * O que está sob teste é o que a tela NÃO consegue provar sozinha: que o recorte
 * respeita o escopo do setor (carimbo do relatório), que o filtro de período é
 * inclusivo nas duas pontas, que a órfã não cai numa equipe e que a soma das
 * partes fecha com o total — o defeito clássico quando um clone é contado duas
 * vezes.
 */

import { describe, it, expect } from 'vitest';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import { formatBRL } from '@/lib/money';
import { ESCOPO_EMPRESA, escopoDeSetor } from '@/services/analitico/escopoAnalitico';
import {
  agregarFormas, somaDasFormas, ordenarGrupos, insightsFormas,
  janelaDeDias, periodoEhMesTodo, formatarShare, montarTextoResumoFormas,
  CHAVE_SEM_OPERADOR,
} from './agregacaoFormas';

const MES   = '2026-08';
const ANA   = 'op-ana';
const BRUNO = 'op-bruno';
const PLAY4 = 'setor-play4';
const PLAY5 = 'setor-play5';

function linha(p: Partial<AnaliticoDashboardLinha>): AnaliticoDashboardLinha {
  return {
    dia:              '2026-08-05',
    operador_id:      ANA,
    setor_id:         PLAY4,
    forma_pagamento:  'boleto_pix',
    forma_detalhe:    'Pix',
    status_tabulacao: 'tabulado',
    total:            100,
    total_ho:         0,
    qtd:              1,
    ...p,
  };
}

const ROTULOS = {
  nomeOperador:     (id: string) => (id === ANA ? 'Ana' : 'Bruno'),
  usuarioOperador:  (id: string) => (id === ANA ? 'ana.silva' : 'bruno.lima'),
  equipeDoOperador: (id: string) => (id === ANA ? 'Play 4' : 'Play 5'),
};

function agregar(
  linhas: AnaliticoDashboardLinha[],
  filtro: Parameters<typeof agregarFormas>[2] = {},
  escopo: Parameters<typeof agregarFormas>[1] = ESCOPO_EMPRESA,
) {
  return agregarFormas(linhas, escopo, filtro, ROTULOS, MES);
}

describe('agregarFormas', () => {
  it('soma por forma usando o rótulo do ERP e ordena da maior para a menor', () => {
    const d = agregar([
      linha({ forma_detalhe: 'Pix', total: 300 }),
      linha({ forma_detalhe: 'Boleto', total: 500 }),
      linha({ forma_detalhe: 'Pix', total: 200 }),
    ]);

    expect(d.rotulos).toEqual(['Boleto', 'Pix']);
    expect(d.total).toBe(1000);
    expect(d.qtd).toBe(3);
    expect(d.formas[0]).toMatchObject({ rotulo: 'Boleto', bruto: 500, share: 50, qtd: 1 });
    expect(d.formas[1]).toMatchObject({ rotulo: 'Pix', bruto: 500, share: 50, qtd: 2 });
    // Ticket médio = valor ÷ registros do relatório, por forma.
    expect(d.formas[1].ticket).toBe(250);
  });

  it('sem forma detalhada (PaguePlay) cai no rótulo consolidado do enum', () => {
    const d = agregar([
      linha({ forma_detalhe: null, forma_pagamento: 'cartao', total: 90 }),
      linha({ forma_detalhe: null, forma_pagamento: 'boleto_pix', total: 10 }),
    ]);
    expect(d.rotulos).toEqual(['Cartão', 'Pix/Boleto']);
  });

  it('período filtra inclusive nas duas pontas', () => {
    const linhas = [
      linha({ dia: '2026-08-04', total: 10 }),
      linha({ dia: '2026-08-05', total: 20 }),
      linha({ dia: '2026-08-06', total: 40 }),
      linha({ dia: '2026-08-07', total: 80 }),
    ];
    const d = agregar(linhas, { inicio: '2026-08-05', fim: '2026-08-06' });
    expect(d.total).toBe(60);
    // A janela do gráfico acompanha o filtro — nem um dia além.
    expect(d.porDia.map(p => p.dia)).toEqual([5, 6]);
  });

  it('dia sem recebimento entra no gráfico com zero (o ritmo é a informação)', () => {
    const d = agregar([linha({ dia: '2026-08-03', total: 70 })],
      { inicio: '2026-08-01', fim: '2026-08-04' });
    expect(d.porDia).toEqual([
      { dia: 1, total: 0,  porForma: {} },
      { dia: 2, total: 0,  porForma: {} },
      { dia: 3, total: 70, porForma: { Pix: 70 } },
      { dia: 4, total: 0,  porForma: {} },
    ]);
    expect(d.diasComRecebimento).toBe(1);
  });

  it('respeita o escopo do setor pelo carimbo do relatório', () => {
    const escopo = escopoDeSetor({
      setorId: PLAY4, alternativo: false, operadores: new Set([ANA, BRUNO]), temCarimbo: true,
    });
    const d = agregar([
      linha({ setor_id: PLAY4, total: 100 }),
      linha({ setor_id: PLAY5, total: 900, operador_id: BRUNO }),
    ], {}, escopo);

    expect(d.total).toBe(100);
    expect(d.porOperador).toHaveLength(1);
  });

  it('escopo de equipe deixa a órfã de fora; o total da empresa a inclui', () => {
    const linhas = [
      linha({ operador_id: ANA, total: 100 }),
      linha({ operador_id: null, total: 400 }),
    ];
    expect(agregar(linhas).total).toBe(500);
    const daEquipe = agregar(linhas, {}, { tipo: 'equipe', operadores: new Set([ANA]) });
    expect(daEquipe.total).toBe(100);
  });

  it('órfã ganha o próprio grupo em vez de ser atribuída a uma equipe', () => {
    const d = agregar([
      linha({ operador_id: ANA, total: 100 }),
      linha({ operador_id: null, total: 400 }),
    ]);
    expect(d.porOperador.map(g => g.chave)).toEqual([CHAVE_SEM_OPERADOR, ANA]);
    expect(d.porEquipe.map(g => g.rotulo)).toEqual(['Sem operador', 'Play 4']);
    expect(d.operadoresComRecebimento).toBe(1);
  });

  it('a soma das quebras fecha com o total', () => {
    const d = agregar([
      linha({ operador_id: ANA,   forma_detalhe: 'Pix',    total: 100 }),
      linha({ operador_id: BRUNO, forma_detalhe: 'Boleto', total: 250 }),
      linha({ operador_id: BRUNO, forma_detalhe: 'Pix',    total: 50, dia: '2026-08-09' }),
    ]);
    const somaOperadores = d.porOperador.reduce((s, g) => s + g.bruto, 0);
    const somaEquipes    = d.porEquipe.reduce((s, g) => s + g.bruto, 0);
    const somaFormas     = d.formas.reduce((s, f) => s + f.bruto, 0);
    const somaDias       = d.porDia.reduce((s, p) => s + p.total, 0);
    expect([somaOperadores, somaEquipes, somaFormas, somaDias]).toEqual([400, 400, 400, 400]);
  });

  it('separa o que ainda não foi tabulado, no total e por forma', () => {
    const d = agregar([
      linha({ forma_detalhe: 'Pix', total: 100, status_tabulacao: 'nao_tabulado' }),
      linha({ forma_detalhe: 'Pix', total: 300, status_tabulacao: 'tabulado' }),
    ]);
    expect(d.naoTabulado).toBe(100);
    expect(d.naoTabuladoQtd).toBe(1);
    expect(d.formas[0].naoTabulado).toBe(100);
  });

  it('filtro de tabulação recorta o painel inteiro', () => {
    const linhas = [
      linha({ total: 100, status_tabulacao: 'nao_tabulado' }),
      linha({ total: 300, status_tabulacao: 'tabulado' }),
      linha({ total: 700, status_tabulacao: 'divergente' }),
    ];
    expect(agregar(linhas, { tabulacao: 'todas' }).total).toBe(1100);
    expect(agregar(linhas, { tabulacao: 'nao_tabulado' }).total).toBe(100);
    expect(agregar(linhas, { tabulacao: 'divergente' }).total).toBe(700);
  });

  it('escopo de operador ignora as linhas dos demais', () => {
    const d = agregar([
      linha({ operador_id: ANA, total: 100 }),
      linha({ operador_id: BRUNO, total: 900 }),
    ], {}, { tipo: 'operador', operadorId: BRUNO });
    expect(d.total).toBe(900);
    expect(d.porOperador[0]).toMatchObject({ rotulo: 'Bruno', detalhe: 'bruno.lima' });
  });

  it('recorte vazio devolve zeros sem quebrar as divisões', () => {
    const d = agregar([], {});
    expect(d).toMatchObject({ total: 0, qtd: 0, ticket: 0, formas: [], rotulos: [] });
    expect(insightsFormas(d)).toEqual([]);
  });
});

describe('seleção de formas', () => {
  const porForma = { Pix: 300, Boleto: 200, Cartão: 500 };

  it('sem seleção soma tudo — é o estado inicial da tela', () => {
    expect(somaDasFormas(porForma, null)).toBe(1000);
    expect(somaDasFormas(porForma, new Set())).toBe(1000);
  });

  it('com seleção soma só as formas escolhidas', () => {
    expect(somaDasFormas(porForma, new Set(['Pix', 'Cartão']))).toBe(800);
    expect(somaDasFormas(porForma, new Set(['Inexistente']))).toBe(0);
  });

  it('reordena as quebras pela seleção e tira quem zerou nela', () => {
    const grupos = [
      { chave: 'a', rotulo: 'Ana',   detalhe: '', bruto: 900, ho: 0, qtd: 2, porForma: { Boleto: 900 } },
      { chave: 'b', rotulo: 'Bruno', detalhe: '', bruto: 100, ho: 0, qtd: 1, porForma: { Pix: 100 } },
    ];
    expect(ordenarGrupos(grupos).map(g => g.chave)).toEqual(['a', 'b']);
    expect(ordenarGrupos(grupos, new Set(['Pix'])).map(g => g.chave)).toEqual(['b']);
  });
});

describe('janela e período', () => {
  it('janela padrão é o mês inteiro', () => {
    expect(janelaDeDias(MES)).toEqual({ de: 1, ate: 31 });
  });

  it('data de outro mês não encurta a janela do mês em foco', () => {
    expect(janelaDeDias(MES, '2026-07-20', '2026-09-02')).toEqual({ de: 1, ate: 31 });
  });

  it('reconhece o mês todo tanto vazio quanto nas datas-limite', () => {
    expect(periodoEhMesTodo(MES)).toBe(true);
    expect(periodoEhMesTodo(MES, '2026-08-01', '2026-08-31')).toBe(true);
    expect(periodoEhMesTodo(MES, '2026-08-02', '2026-08-31')).toBe(false);
  });
});

describe('leitura rápida', () => {
  const atual = agregar([
    linha({ forma_detalhe: 'Pix', total: 600, status_tabulacao: 'nao_tabulado' }),
    linha({ forma_detalhe: 'Boleto', total: 400 }),
  ]);

  it('abre pela forma líder', () => {
    expect(insightsFormas(atual)[0]).toContain('Pix lidera com 60%');
  });

  it('aponta a variação contra o mês anterior', () => {
    const anterior = agregar([linha({ forma_detalhe: 'Pix', total: 300 })]);
    expect(insightsFormas(atual, anterior).some(f => f.includes('Pix cresceu 100%'))).toBe(true);
  });

  it('não compara forma que não existia no mês anterior', () => {
    const anterior = agregar([linha({ forma_detalhe: 'Cartão de Crédito', total: 300 })]);
    expect(insightsFormas(atual, anterior).some(f => f.includes('cresceu'))).toBe(false);
  });

  it('avisa do recebimento sem tabulação', () => {
    expect(insightsFormas(atual).some(f => f.includes('sem acordo tabulado'))).toBe(true);
  });
});

describe('formatação e cópia', () => {
  it('percentual mostra a casa decimal só quando ela diz algo', () => {
    expect(formatarShare(39.1)).toBe('39,1%');
    expect(formatarShare(13)).toBe('13%');
  });

  it('texto do resumo lista as formas e fecha com o total', () => {
    const d = agregar([
      linha({ forma_detalhe: 'Pix', total: 600 }),
      linha({ forma_detalhe: 'Boleto', total: 400 }),
    ]);
    const texto = montarTextoResumoFormas({
      detalhe: d, periodo: 'agosto de 2026', escopoLabel: 'Play 4',
    });
    expect(texto).toContain('Recorte: Play 4');
    // `formatBRL` separa "R$" do número com espaço não separável (U+00A0), então
    // o esperado sai da própria função em vez de um literal digitado à mão.
    expect(texto).toContain(`Pix: ${formatBRL(600)} (60%)`);
    expect(texto.trimEnd().endsWith(`TOTAL: ${formatBRL(1000)} · 2 registros`)).toBe(true);
  });
});
