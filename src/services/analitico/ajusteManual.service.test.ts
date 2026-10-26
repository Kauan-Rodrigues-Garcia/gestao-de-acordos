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
import type { AjusteDoDia, SomaAjusteOperador } from './ajusteManual.service';

type Somas = Map<string, SomaAjusteOperador>;

function somas(entradas: [string, number, string | null, number?][]): Somas {
  const m: Somas = new Map();
  for (const [id, valor, setorId, valorHo = 0] of entradas) {
    m.set(id, { valor, valorHo, setorId, equipeId: null });
  }
  return m;
}

function ajuste(p: Partial<AjusteDoDia> & Pick<AjusteDoDia, 'valor'>): AjusteDoDia {
  return { alvo: 'operador', operadorId: 'op-1', equipeId: null, setorId: null, dia: '2026-08-10', valorHo: 0, ...p };
}

describe('primeiroDiaDaCompetencia', () => {
  it('joga qualquer data do mês para o dia 1', () => {
    expect(primeiroDiaDaCompetencia('2026-08')).toBe('2026-08-01');
    expect(primeiroDiaDaCompetencia('2026-08-27')).toBe('2026-08-01');
  });
});

describe('ajustesComoLinhas', () => {
  it('uma linha por ajuste e dia, com o valor no total e o setor carimbado', () => {
    const linhas = ajustesComoLinhas([ajuste({ valor: 10_000, setorId: 'setor-a' })]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ operador_id: 'op-1', total: 10_000, setor_id: 'setor-a' });
  });

  it('entra no dia em que foi lançado, e não mais no dia 1', () => {
    const linhas = ajustesComoLinhas([ajuste({ valor: 100, dia: '2026-08-20' })]);
    expect(linhas[0].dia).toBe('2026-08-20');
  });

  it('preserva o sinal negativo — tirar é tirar', () => {
    expect(ajustesComoLinhas([ajuste({ valor: -2_500 })])[0].total).toBe(-2_500);
  });

  it('NÃO é Pix e NÃO é cartão: o rótulo é próprio', () => {
    const linhas = ajustesComoLinhas([ajuste({ valor: 100 })]);
    expect(linhas[0].forma_detalhe).toBe(ROTULO_AJUSTE);
    expect(linhas[0].forma_detalhe).not.toMatch(/pix|cart/i);
  });

  it('qtd é zero — o ajuste não é um pagamento', () => {
    expect(ajustesComoLinhas([ajuste({ valor: 5_000 })])[0].qtd).toBe(0);
  });

  it('o H.O. vem do banco, pela regra do setor', () => {
    expect(ajustesComoLinhas([ajuste({ valor: 1_000, valorHo: 249.6 })])[0].total_ho).toBe(249.6);
    expect(ajustesComoLinhas([ajuste({ valor: 1_000 })])[0].total_ho).toBe(0);
  });

  it('marca como tabulado — o ajuste tem dono e motivo', () => {
    // 'nao_tabulado' o jogaria no aviso de "recebimento sem acordo", que é
    // outra conversa e assustaria quem lê o painel.
    expect(ajustesComoLinhas([ajuste({ valor: 100 })])[0].status_tabulacao).toBe('tabulado');
  });

  it('o de EQUIPE sai sem operador, com o setor e a equipe', () => {
    const [l] = ajustesComoLinhas([ajuste({ alvo: 'equipe', operadorId: null, equipeId: 'eq-1', setorId: 'setor-a', valor: 500 })]);
    expect(l).toMatchObject({ operador_id: null, setor_id: 'setor-a', ajuste_equipe_id: 'eq-1', total: 500 });
  });

  it('o de SETOR sai sem operador e sem equipe', () => {
    const [l] = ajustesComoLinhas([ajuste({ alvo: 'setor', operadorId: null, setorId: 'setor-a', valor: 200 })]);
    expect(l).toMatchObject({ operador_id: null, setor_id: 'setor-a', ajuste_equipe_id: null });
  });

  it('valor zero não vira linha, e sem ajuste não inventa linha', () => {
    expect(ajustesComoLinhas([ajuste({ valor: 0 })])).toEqual([]);
    expect(ajustesComoLinhas([])).toEqual([]);
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
  const linhaDe = (valor: number, valorHo = 0) =>
    ajustesComoRecebimentos(somas([['op-1', valor, 'setor-a', valorHo]]), 'emp-1', '2026-08')[0];

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

  it('o H.O. é o que o banco calculou pela regra do setor', () => {
    expect(linhaDe(1_000, 249.6).total_ho).toBe(249.6);
    expect(linhaDe(1_000).total_ho).toBe(0);
  });

  it('valor negativo vira linha negativa, e não some', () => {
    // Tirar valor é metade do propósito do ajuste. Uma lista que só mostra o
    // que somou explicaria mal um total que caiu.
    expect(linhaDe(-800).valor_recebido).toBe(-800);
  });

  it('operador sem ajuste não gera linha', () => {
    expect(ajustesComoRecebimentos(somas([]), 'emp-1', '2026-08')).toEqual([]);
    expect(ajustesComoRecebimentos(somas([['op-1', 0, null]]), 'emp-1', '2026-08')).toEqual([]);
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

  it('equipe e setor têm a própria frase do card único', () => {
    expect(traduzir('duplicate key value violates unique constraint "ux_ajuste_card_por_equipe_mes"')).toContain('Esta equipe');
    expect(traduzir('duplicate key value violates unique constraint "ux_ajuste_card_por_setor_mes"')).toContain('Este setor');
  });

  it('deixa passar o que não sabe traduzir', () => {
    expect(traduzir('connection reset by peer')).toBe('connection reset by peer');
  });
});
