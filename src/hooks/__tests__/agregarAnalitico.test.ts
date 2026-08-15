/**
 * agregarAnalitico.test.ts — o número que aparece no dashboard.
 *
 * Esta função transforma as linhas da RPC no "Recebido no mês", no Pix × Cartão,
 * no gráfico por dia e no aviso de não tabulado. É o último passo antes da tela,
 * e o que se perde se quebrar é o dashboard mostrar um total diferente do
 * relatório que o líder acabou de importar — foi exatamente o defeito relatado.
 */
import { describe, it, expect, vi } from 'vitest';
import type { AnaliticoDashboardLinha } from '@/lib/supabase';
import { escopoDeSetor, ESCOPO_EMPRESA } from '@/services/analitico/escopoAnalitico';

// O módulo do hook arrasta supabase/realtime pela cadeia de imports; nada disso
// é usado por `agregarAnalitico`, que é pura.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/realtime', () => ({ assinarTabela: () => () => {} }));

const { agregarAnalitico } = await import('@/hooks/useAnaliticoDashboard');

const PLAY4   = 'setor-play4';
const DIGITAL = 'setor-digital';
const ANA     = 'op-ana';
const BRUNO   = 'op-bruno';

function linha(p: Partial<AnaliticoDashboardLinha>): AnaliticoDashboardLinha {
  return {
    dia:              '2026-07-10',
    operador_id:      null,
    setor_id:         null,
    forma_pagamento:  'boleto_pix',
    forma_detalhe:    'Pix',
    status_tabulacao: 'nao_tabulado',
    total:            0,
    total_ho:         0,
    qtd:              0,
    ...p,
  };
}

/** Um relatório do Play 4: dois operadores + uma cobradora sem cadastro. */
const RELATORIO = [
  linha({ operador_id: ANA,   setor_id: PLAY4, total: 1000, qtd: 4, dia: '2026-07-05' }),
  linha({ operador_id: BRUNO, setor_id: PLAY4, total:  500, qtd: 2, dia: '2026-07-06' }),
  linha({ operador_id: null,  setor_id: PLAY4, total:  300, qtd: 3, dia: '2026-07-06' }),
];
const TOTAL_RELATORIO = 1800;

describe('escopo de empresa', () => {
  it('bate exatamente com o total do relatório', () => {
    // É o mesmo número do snapshot mensal e do card "Total recebido" da aba
    // Analítico sem filtro. Se estes dois divergirem, alguém está errado.
    expect(agregarAnalitico(RELATORIO, ESCOPO_EMPRESA).bruto).toBe(TOTAL_RELATORIO);
  });

  it('conta os pagamentos, não as linhas agrupadas', () => {
    expect(agregarAnalitico(RELATORIO, ESCOPO_EMPRESA).qtd).toBe(9);
  });

  it('escopo omitido é a empresa', () => {
    expect(agregarAnalitico(RELATORIO).bruto).toBe(TOTAL_RELATORIO);
  });
});

describe('setor normal — o dashboard fecha com o relatório do setor', () => {
  const escopo = escopoDeSetor({
    setorId: PLAY4, alternativo: false, operadores: new Set([ANA, BRUNO]), temCarimbo: true,
  });

  it('a cobradora sem cadastro continua no total do setor', () => {
    // O DEFEITO: o dashboard descartava toda linha sem operador na BookPlay, e
    // o total ficava R$ 300 abaixo do arquivo importado — sem nenhum sintoma
    // além do número menor.
    expect(agregarAnalitico(RELATORIO, escopo).bruto).toBe(TOTAL_RELATORIO);
  });

  it('clone de outro setor não infla o total', () => {
    // Ana foi clonada numa equipe do Digital. O recebimento dela veio no
    // relatório do Play 4 e é lá que ele conta — em nenhum dos dois em dobro.
    const digital = escopoDeSetor({
      setorId: DIGITAL, alternativo: false, operadores: new Set([ANA]), temCarimbo: true,
    });
    expect(agregarAnalitico(RELATORIO, digital).bruto).toBe(0);
  });
});

describe('setor alternativo — soma pelos usuários', () => {
  it('o Digital recebe pelo clone, mesmo com o carimbo no Play 4', () => {
    const digital = escopoDeSetor({
      setorId: DIGITAL, alternativo: true, operadores: new Set([ANA]), temCarimbo: true,
    });
    expect(agregarAnalitico(RELATORIO, digital).bruto).toBe(1000);
  });
});

describe('escopo de equipe', () => {
  it('soma os membros e deixa a linha sem operador de fora', () => {
    const agg = agregarAnalitico(RELATORIO, { tipo: 'equipe', operadores: new Set([ANA]) });
    expect(agg.bruto).toBe(1000);
    expect(agg.qtd).toBe(4);
  });
});

describe('escopo de operador', () => {
  it('devolve só o que é dele', () => {
    expect(agregarAnalitico(RELATORIO, { tipo: 'operador', operadorId: BRUNO }).bruto).toBe(500);
  });
});

describe('recortes derivados respeitam o mesmo escopo', () => {
  const escopo = escopoDeSetor({
    setorId: PLAY4, alternativo: false, operadores: new Set([ANA, BRUNO]), temCarimbo: true,
  });

  it('por dia soma no dia certo', () => {
    const { porDia } = agregarAnalitico(RELATORIO, escopo);
    expect(porDia[5].bruto).toBe(1000);
    expect(porDia[6].bruto).toBe(800);   // Bruno + a linha sem operador
  });

  it('Pix e Cartão são separados pela forma', () => {
    const agg = agregarAnalitico([
      linha({ operador_id: ANA, setor_id: PLAY4, total: 700, forma_pagamento: 'boleto_pix' }),
      linha({ operador_id: ANA, setor_id: PLAY4, total: 300, forma_pagamento: 'cartao', forma_detalhe: 'Cartão' }),
    ], escopo);
    expect(agg.pixBruto).toBe(700);
    expect(agg.cartaoBruto).toBe(300);
    expect(agg.bruto).toBe(1000);
  });

  it('não tabulado é subconjunto do total, nunca maior', () => {
    // O aviso do dashboard compara os dois. Se o não tabulado passar do total,
    // a frase vira absurda ("R$ 800 de R$ 500 não estão tabulados").
    const agg = agregarAnalitico([
      linha({ operador_id: ANA, setor_id: PLAY4, total: 500, qtd: 2, status_tabulacao: 'nao_tabulado' }),
      linha({ operador_id: ANA, setor_id: PLAY4, total: 300, qtd: 1, status_tabulacao: 'tabulado' }),
    ], escopo);
    expect(agg.naoTabuladoBruto).toBe(500);
    expect(agg.naoTabuladoQtd).toBe(2);
    expect(agg.naoTabuladoBruto).toBeLessThanOrEqual(agg.bruto);
  });

  it('por operador ignora a linha sem operador', () => {
    const { porOperador } = agregarAnalitico(RELATORIO, escopo);
    expect(porOperador[ANA].bruto).toBe(1000);
    expect(Object.keys(porOperador)).toHaveLength(2);
  });

  it('agrupa por rótulo real da forma (BookPlay)', () => {
    const agg = agregarAnalitico([
      linha({ operador_id: ANA, setor_id: PLAY4, total: 100, qtd: 1, forma_detalhe: 'Pix Automático' }),
      linha({ operador_id: ANA, setor_id: PLAY4, total: 250, qtd: 2, forma_detalhe: 'Pix Automático', dia: '2026-07-11' }),
      linha({ operador_id: ANA, setor_id: PLAY4, total:  50, qtd: 1, forma_detalhe: 'Boleto' }),
    ], escopo);
    // BookPlay não preenche `total_ho`: o lado H.O. existe no formato e fica 0.
    expect(agg.porForma['Pix Automático']).toEqual({ bruto: 350, ho: 0, qtd: 3 });
    expect(agg.porForma['Boleto']).toEqual({ bruto: 50, ho: 0, qtd: 1 });
  });

  // O donut da PaguePlay é desenhado na unidade escolhida no painel. Sem o H.O.
  // por forma, alternar a unidade deixava o total num lado e as fatias no outro.
  it('acumula o H.O. por forma junto do bruto (PaguePlay)', () => {
    const agg = agregarAnalitico([
      linha({ operador_id: ANA, setor_id: PLAY4, total: 1000, total_ho: 249.60, qtd: 1, forma_detalhe: 'Boleto' }),
      linha({ operador_id: ANA, setor_id: PLAY4, total:  500, total_ho: 124.80, qtd: 1, forma_detalhe: 'Boleto', dia: '2026-07-11' }),
      linha({ operador_id: ANA, setor_id: PLAY4, total:  200, total_ho:  49.92, qtd: 1, forma_detalhe: 'Cartão' }),
    ], escopo);
    expect(agg.porForma['Boleto']).toEqual({ bruto: 1500, ho: 374.40, qtd: 2 });
    expect(agg.porForma['Cartão']).toEqual({ bruto: 200, ho: 49.92, qtd: 1 });

    // A soma das formas fecha com o total, nas DUAS unidades.
    const formas = Object.values(agg.porForma);
    expect(formas.reduce((s, f) => s + f.bruto, 0)).toBeCloseTo(agg.bruto, 6);
    expect(formas.reduce((s, f) => s + f.ho, 0)).toBeCloseTo(agg.ho, 6);
  });
});

describe('valores que chegam como texto', () => {
  it('NUMERIC do Postgres em string não vira NaN', () => {
    // O JSONB devolve number, mas o caminho paginado antigo pode entregar
    // string. Um NaN aqui contamina o total inteiro e a tela mostra "R$ NaN".
    const agg = agregarAnalitico([
      linha({ operador_id: ANA, total: '1200.50' as unknown as number, qtd: '3' as unknown as number }),
    ], ESCOPO_EMPRESA);
    expect(agg.bruto).toBe(1200.5);
    expect(agg.qtd).toBe(3);
  });

  it('lista vazia devolve zeros, não NaN', () => {
    const agg = agregarAnalitico([], ESCOPO_EMPRESA);
    expect(agg.bruto).toBe(0);
    expect(agg.qtd).toBe(0);
    expect(agg.porDia).toEqual({});
  });
});
