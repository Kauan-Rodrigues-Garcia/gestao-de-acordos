/**
 * ajusteManual.service.test.ts
 *
 * A correção manual mexe em número de dinheiro que sobe para operador, equipe e
 * setor. O que estes casos travam é o que ela promete e o que ela NÃO deve
 * fazer:
 *
 *   • soma e subtração chegam com o sinal certo;
 *   • o cancelado não conta — nem como zero, nem como negativo;
 *   • não é Pix e não é cartão: o rótulo é próprio, senão o valor entraria numa
 *     conta que a conciliação bancária confere;
 *   • `qtd = 0`, porque o ajuste não é um pagamento — contá-lo estragaria o
 *     ticket médio de quem recebeu o ajuste.
 */
import { describe, it, expect } from 'vitest';
import {
  ajustesComoLinhas, ajustesComoRecebimentos, ehLinhaDeAjuste,
  primeiroDiaDaCompetencia, LOTE_AJUSTE_MANUAL, ROTULO_AJUSTE, traduzir,
} from './ajusteManual.service';
import { PP_HO_PERCENTUAL } from '@/lib/index';

type Somas = Map<string, { valor: number; setorId: string | null; equipeId: string | null }>;

function somas(entradas: [string, number, string | null][]): Somas {
  const m: Somas = new Map();
  for (const [id, valor, setorId] of entradas) {
    m.set(id, { valor, setorId, equipeId: null });
  }
  return m;
}

describe('primeiroDiaDaCompetencia', () => {
  it('joga qualquer data do mês para o dia 1', () => {
    expect(primeiroDiaDaCompetencia('2026-08')).toBe('2026-08-01');
    expect(primeiroDiaDaCompetencia('2026-08-27')).toBe('2026-08-01');
  });
});

describe('ajustesComoLinhas', () => {
  it('devolve uma linha por operador, com o valor no total', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 10_000, 'setor-a']]), '2026-08', true);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].operador_id).toBe('op-1');
    expect(linhas[0].total).toBe(10_000);
    expect(linhas[0].setor_id).toBe('setor-a');
  });

  it('preserva o sinal negativo — tirar é tirar', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', -2_500, null]]), '2026-08', true);
    expect(linhas[0].total).toBe(-2_500);
  });

  it('NÃO é Pix e NÃO é cartão: o rótulo é próprio', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 100, null]]), '2026-08', true);
    expect(linhas[0].forma_detalhe).toBe(ROTULO_AJUSTE);
    expect(linhas[0].forma_detalhe).not.toMatch(/pix|cart/i);
  });

  it('qtd é zero — o ajuste não é um pagamento', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 5_000, null]]), '2026-08', true);
    expect(linhas[0].qtd).toBe(0);
  });

  it('calcula H.O. na PaguePlay com a constante do projeto', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 1_000, null]]), '2026-08', true);
    expect(linhas[0].total_ho).toBeCloseTo(1_000 * PP_HO_PERCENTUAL, 6);
  });

  it('H.O. é zero na BookPlay — lá nenhuma linha do relatório tem H.O.', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 1_000, null]]), '2026-08', false);
    expect(linhas[0].total_ho).toBe(0);
  });

  it('entra no dia 1: o ajuste é de competência, não tem data de pagamento', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 100, null]]), '2026-08', true);
    expect(linhas[0].dia).toBe('2026-08-01');
  });

  it('marca como tabulado — o ajuste tem dono e motivo', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 100, null]]), '2026-08', true);
    // 'nao_tabulado' o jogaria no aviso de "recebimento sem acordo", que é
    // outra conversa e assustaria quem lê o painel.
    expect(linhas[0].status_tabulacao).toBe('tabulado');
  });

  it('operador com saldo zero não vira linha', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 0, null]]), '2026-08', true);
    expect(linhas).toEqual([]);
  });

  it('sem ajuste nenhum, não inventa linha', () => {
    expect(ajustesComoLinhas(new Map(), '2026-08', true)).toEqual([]);
  });

  it('vários operadores viram várias linhas', () => {
    const linhas = ajustesComoLinhas(
      somas([['op-1', 100, 'a'], ['op-2', -50, 'b'], ['op-3', 25, 'a']]),
      '2026-08', true,
    );
    expect(linhas.map(l => l.operador_id).sort()).toEqual(['op-1', 'op-2', 'op-3']);
    expect(linhas.reduce((s, l) => s + l.total, 0)).toBe(75);
  });
});

/*
 * A linha da LISTA.
 *
 * `ajustesComoLinhas` serve às agregações; esta serve à tabela que a pessoa lê
 * — e ao total que essa tabela soma na frente dela. Sem ela, o operador via um
 * «Total recebido» em «Meus recebimentos» e outro no ranking da aba ao lado.
 */
describe('ajustesComoRecebimentos', () => {
  const linhaDe = (valor: number, pp = true) =>
    ajustesComoRecebimentos(somas([['op-1', valor, 'setor-a']]), 'emp-1', '2026-08', pp)[0];

  it('a linha carrega o valor, a competência e o setor carimbado', () => {
    const l = linhaDe(10_000);
    expect(l.valor_recebido).toBe(10_000);
    expect(l.data_pagamento).toBe('2026-08-01');
    expect(l.setor_id).toBe('setor-a');
    expect(l.operador_id).toBe('op-1');
  });

  it('o id é DETERMINÍSTICO — a lista reconcilia por ele', () => {
    // Id novo a cada leitura faria a linha piscar em toda releitura, e a
    // animação de "linha nova" dispararia sem nada ter acontecido.
    expect(linhaDe(500).id).toBe(linhaDe(500).id);
    expect(linhaDe(500).id).toContain(LOTE_AJUSTE_MANUAL);
  });

  it('sai marcada como ajuste, para a tela não oferecer «Ver acordo»', () => {
    // A linha é sintética: não existe em `analitico_recebimentos`, não tem
    // acordo para abrir e o `codigo` dela é um rótulo, não um NR.
    expect(ehLinhaDeAjuste(linhaDe(500))).toBe(true);
    expect(ehLinhaDeAjuste({ lote_id: 'lote-real-123' })).toBe(false);
  });

  it('vem tabulada e vista: não é pendência de ninguém', () => {
    const l = linhaDe(500);
    expect(l.status_tabulacao).toBe('tabulado');
    expect(l.acordo_id).toBeNull();
    expect(l.visto).toBe(true);
  });

  it('H.O. só na PaguePlay — na BookPlay toda linha do relatório é zero', () => {
    expect(linhaDe(1_000, true).total_ho).toBeCloseTo(1_000 * PP_HO_PERCENTUAL, 2);
    expect(linhaDe(1_000, false).total_ho).toBe(0);
  });

  it('valor negativo vira linha negativa, e não some', () => {
    // Tirar valor é metade do propósito do ajuste. Uma lista que só mostra o
    // que somou explicaria mal um total que caiu.
    expect(linhaDe(-800).valor_recebido).toBe(-800);
  });

  it('operador sem ajuste não gera linha', () => {
    expect(ajustesComoRecebimentos(somas([]), 'emp-1', '2026-08', true)).toEqual([]);
    expect(ajustesComoRecebimentos(somas([['op-1', 0, null]]), 'emp-1', '2026-08', true)).toEqual([]);
  });
});

describe('traduzir', () => {
  it('nomeia a migration quando a tabela não existe', () => {
    // A mais RECENTE, e não a que criou a tabela: quem vê esta frase precisa
    // aplicar até o card único, senão a aba sobe com o desenho antigo.
    expect(traduzir('relation "analitico_ajustes_manuais" does not exist'))
      .toContain('20260825120000');
  });

  it('manda editar o card existente quando a trava do único dispara', () => {
    // O erro cru nomeia o índice; quem está na tela não sabe o que é
    // `ux_ajuste_card_por_operador_mes`. A frase tem de dizer o que fazer.
    const texto = traduzir('duplicate key value violates unique constraint "ux_ajuste_card_por_operador_mes"');
    expect(texto).toContain('já tem um card');
    expect(texto).not.toContain('ux_ajuste_card');
  });

  it('explica a recusa por permissão sem despejar SQL na tela', () => {
    const texto = traduzir('new row violates row-level security policy');
    expect(texto).toBe('O banco recusou: você não tem permissão para isso.');
  });

  it('traduz o valor zero e o motivo em branco', () => {
    expect(traduzir('violates check constraint "ajuste_valor_nao_zero"'))
      .toContain('diferente de zero');
    expect(traduzir('violates check constraint "ajuste_motivo_preenchido"'))
      .toContain('motivo');
  });

  it('deixa passar o que não sabe traduzir', () => {
    expect(traduzir('connection reset by peer')).toBe('connection reset by peer');
  });
});
